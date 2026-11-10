"""Real Spring HTTP and MySQL with production FastAPI routes and an offline image encoder."""

import json
import os
import subprocess
import uuid
from dataclasses import dataclass
from io import BytesIO
from pathlib import Path

import httpx
import numpy as np
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from PIL import Image

from backend.app.core.config import Settings
from backend.app.main import create_app
from backend.app.services.local_catalog_search import LocalCatalogSearch

ROOT = Path(__file__).resolve().parents[1]


def pytest_addoption(parser):
    parser.addoption("--member-image", default="stylefinder-contract-member:test")


@pytest.fixture(scope="session")
def contract_environment(tmp_path_factory, request):
    keys = tmp_path_factory.mktemp("contract-keys")
    keys.chmod(0o755)
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    (keys / "private.pem").write_bytes(
        private.private_bytes(
            serialization.Encoding.PEM,
            serialization.PrivateFormat.PKCS8,
            serialization.NoEncryption(),
        )
    )
    (keys / "public.pem").write_bytes(
        private.public_key().public_bytes(
            serialization.Encoding.PEM,
            serialization.PublicFormat.SubjectPublicKeyInfo,
        )
    )
    for path in keys.iterdir():
        path.chmod(0o644)
    # Do not inherit the real app's credentials, Compose overrides or project name.
    app_prefixes = ("COMPOSE_", "GOOGLE_", "JWT_", "MYSQL_", "MEMBER_", "REFRESH_")
    env = {key: value for key, value in os.environ.items() if not key.startswith(app_prefixes)}
    env.update(
        CONTRACT_KEYS_DIR=keys.as_posix(),
        CONTRACT_MEMBER_IMAGE=request.config.getoption("--member-image"),
    )
    project = "stylefinder-contract-" + uuid.uuid4().hex[:10]
    command = [
        "docker",
        "compose",
        "--project-directory",
        str(ROOT),
        "-p",
        project,
        "-f",
        str(ROOT / "compose.yml"),
    ]

    def compose(*args, check=True):
        return subprocess.run(
            command + list(args),
            env=env,
            capture_output=True,
            text=True,
            encoding="utf-8",
            errors="replace",
            check=check,
        )

    try:
        compose("up", "-d", "--wait", "--wait-timeout", "180")
        address = compose("port", "member", "8080").stdout.strip()
        yield {"url": "http://" + address, "public_key": keys / "public.pem"}
    except subprocess.CalledProcessError as error:
        pytest.fail(f"Isolated contract stack failed: {error.stderr[-3000:]}")
    finally:
        # Only this generated project is removed. No application DB or named volume is used.
        compose("down", "--volumes", "--remove-orphans", check=False)


@dataclass
class MemberSession:
    client: httpx.Client
    token: str

    @property
    def authorization(self):
        return {"Authorization": f"Bearer {self.token}"}


@pytest.fixture
def account(contract_environment):
    clients = []

    def create():
        client = httpx.Client(base_url=contract_environment["url"], timeout=15, trust_env=False)
        clients.append(client)
        email = f"contract-{uuid.uuid4().hex}@example.invalid"
        password = "contract-password-123"
        response = client.post(
            "/api/members/signup",
            json={
                "email": email,
                "password": password,
                "displayName": "통합 검증",
            },
        )
        assert response.status_code == 201, response.text
        response = client.post("/api/members/login", json={"email": email, "password": password})
        assert response.status_code == 200, response.text
        return MemberSession(client, response.json()["accessToken"])

    yield create
    for client in clients:
        client.close()


class OfflineColorEncoder:
    """Deterministic test substitute for FashionCLIP, not a search-quality benchmark."""

    loaded = True
    model_version = "contract/rgb@1"

    def embed_image(self, image):
        return np.asarray(image.convert("RGB").resize((1, 1)).getpixel((0, 0)), dtype=float)

    def embed_image_bytes(self, content):
        with Image.open(BytesIO(content)) as image:
            return self.embed_image(image)


@pytest.fixture
def search_api(tmp_path, contract_environment):
    items = []
    for name, color in [("red", "red"), ("blue", "blue"), ("green", "green")]:
        Image.new("RGB", (32, 24), color).save(tmp_path / f"{name}.png")
        items.append(
            {
                "id": f"contract-{name}",
                "title": f"{name} 테스트 상품",
                "imagePath": f"{name}.png",
                "sourceUrl": f"https://shop1.cora1022.com/#/product/contract-{name}",
                "metadata": {
                    "category": "상의",
                    "colors": [name],
                    "styleTags": ["casual"],
                    "storeId": "contract-shop",
                    "storeName": "테스트 쇼핑몰",
                    "productKey": f"contract-{name}",
                    "price": 59000,
                },
                "rights": {"owner": "test fixture", "license": "generated in test"},
            }
        )
    manifest = tmp_path / "manifest.json"
    manifest.write_text(
        json.dumps(
            {
                "catalogVersion": "contract-1",
                "modelName": "contract/rgb",
                "modelRevision": "1",
                "items": items,
            }
        ),
        encoding="utf-8",
    )
    config = Settings(
        jwt_public_key_path=contract_environment["public_key"],
        jwt_issuer="contract-member-service",
        jwt_audience="contract-search-api",
        catalog_manifest_path=manifest,
        catalog_images_dir=tmp_path,
        catalog_index_path=tmp_path / "vectors.npz",
        expected_vector_size=3,
        opencv_crop_enabled=False,
    )
    app = create_app(config=config, load_services=False)
    model = OfflineColorEncoder()
    index = LocalCatalogSearch(manifest, tmp_path, config.catalog_index_path, model)
    index.load()
    app.state.fashionclip_service = model
    app.state.catalog_search_service = index
    app.state.catalog_store.load()
    with TestClient(app) as client:
        yield client


@pytest.fixture
def upload():
    output = BytesIO()
    Image.new("RGB", (32, 24), "red").save(output, "PNG")
    return {"file": ("capture.png", output.getvalue(), "image/png")}
