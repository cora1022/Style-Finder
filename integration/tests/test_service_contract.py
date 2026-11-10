"""Contracts are checked against real Spring-issued tokens and real MySQL persistence."""

from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import httpx


def test_login_crop_search_save_refresh_and_delete(account, search_api, upload):
    user = account()
    cropped = search_api.post("/api/preprocess/crop", files=upload, headers=user.authorization)
    assert cropped.status_code == 200, cropped.text
    assert cropped.headers["content-type"].startswith("image/jpeg")
    assert cropped.headers["x-crop-applied"] == "false"
    response = search_api.post(
        "/api/search/image?topK=2",
        headers=user.authorization,
        files={"file": ("crop.jpg", cropped.content, "image/jpeg")},
    )
    assert response.status_code == 200, response.text
    results = response.json()["results"]
    assert len(results) == 2
    assert results[0]["catalogItemId"] == "contract-red"
    assert results[0]["sourceUrl"].endswith("#/product/contract-red")
    assert search_api.get(results[0]["imageUrl"]).status_code == 200
    again = search_api.post("/api/search/catalog/contract-red", headers=user.authorization)
    assert again.status_code == 200
    assert all(item["catalogItemId"] != "contract-red" for item in again.json()["results"])

    created = user.client.post(
        "/api/members/saved-results", headers=user.authorization, json=results[0]
    )
    assert created.status_code == 201, created.text
    saved = created.json()
    duplicate = user.client.post(
        "/api/members/saved-results", headers=user.authorization, json=results[0]
    )
    assert duplicate.status_code == 409
    assert duplicate.json()["error"]["code"] == "DUPLICATE_SAVED_RESULT"
    history = user.client.post(
        "/api/members/search-histories",
        headers=user.authorization,
        json={"searchType": "IMAGE_UPLOAD", "cropMode": "MANUAL"},
    )
    assert history.status_code == 201

    refreshed = user.client.post("/api/members/token/refresh")
    assert refreshed.status_code == 200
    user.token = refreshed.json()["accessToken"]
    listing = user.client.get("/api/members/saved-results", headers=user.authorization)
    assert listing.status_code == 200
    assert listing.json()["totalElements"] == 1
    item = listing.json()["items"][0]
    for field in ("catalogItemId", "title", "sourceUrl", "similarityScore", "modelVersion"):
        assert item[field] == results[0][field]
    assert item["metadata"] == results[0]["metadata"]
    assert (
        search_api.post("/api/search/image", files=upload, headers=user.authorization).status_code
        == 200
    )
    deleted = user.client.delete(
        f"/api/members/saved-results/{saved['id']}", headers=user.authorization
    )
    assert deleted.status_code == 204
    assert (
        user.client.get("/api/members/saved-results", headers=user.authorization).json()[
            "totalElements"
        ]
        == 0
    )


def test_other_member_cannot_read_or_delete_saved_search_data(account, search_api, upload):
    owner, other = account(), account()
    result = search_api.post("/api/search/image", files=upload, headers=owner.authorization).json()[
        "results"
    ][0]
    saved = owner.client.post(
        "/api/members/saved-results", headers=owner.authorization, json=result
    )
    assert saved.status_code == 201
    history = owner.client.post(
        "/api/members/search-histories",
        headers=owner.authorization,
        json={"searchType": "IMAGE_UPLOAD", "cropMode": "MANUAL"},
    )
    assert history.status_code == 201
    for resource, created in [("saved-results", saved), ("search-histories", history)]:
        listing = other.client.get(f"/api/members/{resource}", headers=other.authorization)
        assert listing.status_code == 200
        assert listing.json()["items"] == []
        denied = other.client.delete(
            f"/api/members/{resource}/{created.json()['id']}", headers=other.authorization
        )
        assert denied.status_code == 404
        remaining = owner.client.get(f"/api/members/{resource}", headers=owner.authorization)
        assert remaining.json()["totalElements"] == 1


def test_refresh_cookie_cannot_authorize_search_and_logout_revokes_rotation(
    account,
    search_api,
    upload,
    contract_environment,
):
    user = account()
    old_cookie = user.client.cookies.get("style_finder_refresh")
    denied = search_api.post(
        "/api/search/image", files=upload, headers={"Authorization": f"Bearer {old_cookie}"}
    )
    assert denied.status_code == 401
    assert denied.json()["error"]["code"] == "ACCESS_TOKEN_INVALID"
    rotated = user.client.post("/api/members/token/refresh")
    assert rotated.status_code == 200
    user.token = rotated.json()["accessToken"]
    active_cookie = user.client.cookies.get("style_finder_refresh")
    with httpx.Client(base_url=contract_environment["url"], trust_env=False) as attacker:
        replay = attacker.post(
            "/api/members/token/refresh", headers={"Cookie": f"style_finder_refresh={old_cookie}"}
        )
        assert replay.status_code == 401
        assert replay.json()["error"]["code"] == "REFRESH_TOKEN_INVALID"
        assert (
            user.client.post("/api/members/logout", headers=user.authorization).status_code == 204
        )
        revoked = attacker.post(
            "/api/members/token/refresh",
            headers={"Cookie": f"style_finder_refresh={active_cookie}"},
        )
        assert revoked.status_code == 401
    # A stateless access token remains valid until expiry; logout revokes refresh, not JWTs.
    assert (
        search_api.post("/api/search/image", files=upload, headers=user.authorization).status_code
        == 200
    )


def test_concurrent_saves_create_one_row_and_return_a_conflict(
    account, search_api, upload, contract_environment
):
    user = account()
    result = search_api.post("/api/search/image", files=upload, headers=user.authorization).json()[
        "results"
    ][0]
    start = Barrier(2, timeout=10)

    def save():
        with httpx.Client(
            base_url=contract_environment["url"], trust_env=False, timeout=15
        ) as client:
            start.wait()
            return client.post(
                "/api/members/saved-results", headers=user.authorization, json=result
            )

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(lambda _: save(), range(2)))
    assert sorted(response.status_code for response in responses) == [201, 409]
    conflict = next(response for response in responses if response.status_code == 409)
    assert conflict.json()["error"]["code"] == "DUPLICATE_SAVED_RESULT"
    listing = user.client.get("/api/members/saved-results", headers=user.authorization)
    assert listing.json()["totalElements"] == 1


def test_concurrent_refresh_has_one_winner_whose_session_remains_usable(
    account, contract_environment
):
    user = account()
    old_cookie = user.client.cookies.get("style_finder_refresh")
    start = Barrier(2, timeout=10)

    def refresh():
        with httpx.Client(
            base_url=contract_environment["url"], trust_env=False, timeout=15
        ) as client:
            start.wait()
            return client.post(
                "/api/members/token/refresh",
                headers={
                    "Cookie": f"style_finder_refresh={old_cookie}",
                },
            )

    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(lambda _: refresh(), range(2)))
    assert sorted(response.status_code for response in responses) == [200, 401]
    winner = next(response for response in responses if response.status_code == 200)
    with httpx.Client(base_url=contract_environment["url"], trust_env=False, timeout=15) as client:
        client.cookies.update(winner.cookies)
        assert client.post("/api/members/token/refresh").status_code == 200
