package com.cora.stylefinder.member;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.cora.stylefinder.member.activity.SavedResultRepository;
import com.cora.stylefinder.member.activity.SearchHistoryRepository;
import com.cora.stylefinder.member.auth.AuthService;
import com.cora.stylefinder.member.auth.GoogleOAuthHandler;
import com.cora.stylefinder.member.auth.RefreshCookieService;
import com.cora.stylefinder.member.auth.RefreshTokenRepository;
import com.cora.stylefinder.member.auth.dto.LoginRequest;
import com.cora.stylefinder.member.member.UserRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.jsonwebtoken.Jwts;
import jakarta.servlet.http.Cookie;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.KeyFactory;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PrivateKey;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Instant;
import java.util.Base64;
import java.util.Date;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.oauth2.client.authentication.OAuth2AuthenticationToken;
import org.springframework.security.oauth2.core.oidc.OidcIdToken;
import org.springframework.security.oauth2.core.oidc.user.DefaultOidcUser;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@SpringBootTest(
    classes = {MemberServiceApplication.class, MemberApiIntegrationTest.AdminApi.class},
    properties = {
      "app.oauth.google.enabled=true",
      "app.oauth.google.client-id=test-client",
      "app.oauth.google.client-secret=test-secret",
      "app.oauth.google.frontend-url=http://localhost",
      "app.oauth.google.redirect-uri=http://localhost/api/members/login/oauth2/code/google"
    })
@AutoConfigureMockMvc
class MemberApiIntegrationTest {
  private static final KeyPaths KEY_PATHS = createKeys();

  @Autowired MockMvc mockMvc;
  @Autowired ObjectMapper objectMapper;
  @Autowired UserRepository users;
  @Autowired RefreshTokenRepository refreshTokens;
  @Autowired SearchHistoryRepository histories;
  @Autowired SavedResultRepository savedResults;
  @Autowired AuthService auth;
  @Autowired RefreshCookieService refreshCookie;

  @DynamicPropertySource
  static void jwtProperties(DynamicPropertyRegistry registry) {
    registry.add("app.security.private-key-path", () -> KEY_PATHS.privateKey().toString());
    registry.add("app.security.public-key-path", () -> KEY_PATHS.publicKey().toString());
  }

  @BeforeEach
  void cleanDatabase() {
    savedResults.deleteAll();
    histories.deleteAll();
    refreshTokens.deleteAll();
    users.deleteAll();
  }

  @Test
  void googleStartUsesConfiguredCallbackAndStateAndRejectsUnsolicitedCallback() throws Exception {
    mockMvc
        .perform(get("/api/members/oauth2/status"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.enabled").value(true));
    MvcResult start =
        mockMvc
            .perform(get("/api/members/oauth2/authorization/google"))
            .andExpect(status().is3xxRedirection())
            .andReturn();
    String location = start.getResponse().getRedirectedUrl();
    assertTrue(location.startsWith("https://accounts.google.com/"));
    assertTrue(location.contains("state="));
    assertTrue(location.contains("nonce="));
    assertTrue(
        java.net.URLDecoder.decode(location, java.nio.charset.StandardCharsets.UTF_8)
            .contains("redirect_uri=http://localhost/api/members/login/oauth2/code/google"));
    mockMvc
        .perform(
            get("/api/members/login/oauth2/code/google")
                .param("code", "untrusted")
                .param("state", "wrong"))
        .andExpect(status().is3xxRedirection())
        .andExpect(
            org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl(
                "http://localhost/?oauth=failed"));
    assertTrue(users.count() == 0);
  }

  @Test
  void googleLoginCreatesOneIdentityAndRejectsUnverifiedEmailAndAutomaticLinking()
      throws Exception {
    auth.googleLogin("google-subject", "google@example.com", true, "Google 사용자");
    auth.googleLogin("google-subject", "google@example.com", true, "Google 사용자");
    assertTrue(users.count() == 1);
    Assertions.assertNull(
        users.findByGoogleSubject("google-subject").orElseThrow().getPasswordHash());
    Assertions.assertThrows(
        com.cora.stylefinder.member.common.ApiException.class,
        () -> auth.login(new LoginRequest("google@example.com", "password123")));
    Assertions.assertThrows(
        com.cora.stylefinder.member.common.ApiException.class,
        () -> auth.googleLogin("unverified", "unverified@example.com", false, "이름"));
    signup("local@example.com").andExpect(status().isCreated());
    var conflict =
        Assertions.assertThrows(
            com.cora.stylefinder.member.common.ApiException.class,
            () -> auth.googleLogin("another-subject", "local@example.com", true, "이름"));
    Assertions.assertEquals("GOOGLE_EMAIL_CONFLICT", conflict.code());
    assertTrue(users.count() == 2);
  }

  @Test
  void googleSuccessIssuesOnlyRefreshCookieAndInvalidatesTemporarySession() throws Exception {
    var id =
        OidcIdToken.withTokenValue("provider-token")
            .subject("verified-subject")
            .issuedAt(Instant.now())
            .expiresAt(Instant.now().plusSeconds(300))
            .claim("email", "google@example.com")
            .claim("email_verified", true)
            .claim("name", "Google 사용자")
            .build();
    var principal =
        new DefaultOidcUser(
            List.of(new org.springframework.security.oauth2.core.oidc.user.OidcUserAuthority(id)),
            id);
    var authentication =
        new OAuth2AuthenticationToken(principal, principal.getAuthorities(), "google");
    var request = new MockHttpServletRequest();
    var temporary = new MockHttpSession();
    request.setSession(temporary);
    var response = new MockHttpServletResponse();
    new GoogleOAuthHandler(auth, refreshCookie, "http://localhost/")
        .onAuthenticationSuccess(request, response, authentication);
    assertTrue(temporary.isInvalid());
    Assertions.assertEquals("http://localhost/?oauth=success", response.getRedirectedUrl());
    String cookie = response.getHeader("Set-Cookie");
    assertTrue(cookie.contains("HttpOnly"));
    mockMvc
        .perform(
            post("/api/members/token/refresh")
                .cookie(
                    new Cookie("style_finder_refresh", cookie.split(";", 2)[0].split("=", 2)[1])))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.accessToken").isNotEmpty());
  }

  @Test
  void unauthenticatedMemberRequestReturnsJson401() throws Exception {
    mockMvc
        .perform(get("/api/members/me"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error.code").value("AUTHENTICATION_REQUIRED"))
        .andExpect(jsonPath("$.error.requestId").isNotEmpty());
  }

  @Test
  void readinessChecksDatabaseAndAppliedFlywayMigrations() throws Exception {
    mockMvc
        .perform(get("/health/live"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("live"));
    mockMvc
        .perform(get("/health/ready"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.status").value("ready"))
        .andExpect(jsonPath("$.checks.database").value(true))
        .andExpect(jsonPath("$.checks.flyway").value(true));
  }

  @Test
  void signupNormalizesEmailAndRejectsCaseInsensitiveDuplicate() throws Exception {
    signup("Member@Example.com").andExpect(status().isCreated());

    signup("member@example.COM")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code").value("EMAIL_ALREADY_EXISTS"));
  }

  @Test
  void signupStoresBcryptHashInsteadOfRawPassword() throws Exception {
    signup("member@example.com").andExpect(status().isCreated());

    String passwordHash = users.findByEmail("member@example.com").orElseThrow().getPasswordHash();

    assertNotEquals("password123", passwordHash);
    assertTrue(passwordHash.startsWith("$2"));
  }

  @Test
  void signupReturnsFieldErrorsAndRejectsOverlongUtf8Password() throws Exception {
    mockMvc
        .perform(
            post("/api/members/signup")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(new SignupPayload("invalid", "short", "   "))))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.fields.email").isNotEmpty())
        .andExpect(jsonPath("$.error.fields.password").isNotEmpty())
        .andExpect(jsonPath("$.error.fields.displayName").isNotEmpty());
    mockMvc
        .perform(
            post("/api/members/signup")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        new SignupPayload("member@example.com", "가".repeat(25), "테스트"))))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code").value("PASSWORD_TOO_LONG"));
    assertTrue(users.count() == 0);
  }

  @Test
  void signupTrimsNameAndEmailWithoutChangingPassword() throws Exception {
    mockMvc
        .perform(
            post("/api/members/signup")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        new SignupPayload(" Member@Example.com ", "password123", " 테스트 사용자 "))))
        .andExpect(status().isCreated())
        .andExpect(jsonPath("$.email").value("member@example.com"))
        .andExpect(jsonPath("$.displayName").value("테스트 사용자"));
    login("member@example.com");
  }

  @Test
  void concurrentRefreshConsumesCookieOnlyOnce() throws Exception {
    signup("member@example.com").andExpect(status().isCreated());
    Cookie cookie =
        loginResult("member@example.com").getResponse().getCookie("style_finder_refresh");
    CountDownLatch ready = new CountDownLatch(2);
    CountDownLatch start = new CountDownLatch(1);
    try (var executor = Executors.newFixedThreadPool(2)) {
      var task =
          (java.util.concurrent.Callable<Integer>)
              () -> {
                ready.countDown();
                if (!start.await(10, TimeUnit.SECONDS))
                  throw new IllegalStateException("Refresh test timed out");
                return mockMvc
                    .perform(post("/api/members/token/refresh").cookie(cookie))
                    .andReturn()
                    .getResponse()
                    .getStatus();
              };
      var first = executor.submit(task);
      var second = executor.submit(task);
      assertTrue(ready.await(10, TimeUnit.SECONDS));
      start.countDown();
      var statuses = List.of(first.get(20, TimeUnit.SECONDS), second.get(20, TimeUnit.SECONDS));
      assertTrue(statuses.contains(200));
      assertTrue(statuses.contains(401));
    }
  }

  @Test
  void loginRejectsWrongPasswordWithStableError() throws Exception {
    signup("member@example.com").andExpect(status().isCreated());

    mockMvc
        .perform(
            post("/api/members/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        new LoginPayload("member@example.com", "wrong-password"))))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error.code").value("INVALID_CREDENTIALS"));
  }

  @Test
  void loginAccessTokenAuthenticatesMember() throws Exception {
    signup("member@example.com").andExpect(status().isCreated());
    String accessToken = login("member@example.com");

    mockMvc
        .perform(get("/api/members/me").header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.email").value("member@example.com"));
  }

  @Test
  void loginStoresRefreshTokenOnlyInConfiguredHttpOnlyCookie() throws Exception {
    signup("member@example.com").andExpect(status().isCreated());

    MvcResult result = loginResult("member@example.com");
    Cookie cookie = result.getResponse().getCookie("style_finder_refresh");

    assertNotNull(cookie);
    assertTrue(cookie.isHttpOnly());
    assertFalse(cookie.getSecure());
    assertTrue("/api/members".equals(cookie.getPath()));
    assertTrue(cookie.getMaxAge() == 3600);
    assertTrue(result.getResponse().getHeader("Set-Cookie").contains("SameSite=Lax"));
    assertFalse(
        objectMapper.readTree(result.getResponse().getContentAsString()).has("refreshToken"));
  }

  @Test
  void refreshRotatesTokenAndRejectsPreviousCookie() throws Exception {
    signup("member@example.com").andExpect(status().isCreated());
    MvcResult login = loginResult("member@example.com");
    Cookie previous = login.getResponse().getCookie("style_finder_refresh");

    MvcResult refreshed =
        mockMvc
            .perform(post("/api/members/token/refresh").cookie(previous))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.accessToken").isNotEmpty())
            .andReturn();
    Cookie rotated = refreshed.getResponse().getCookie("style_finder_refresh");

    assertNotNull(rotated);
    assertNotEquals(previous.getValue(), rotated.getValue());
    mockMvc
        .perform(post("/api/members/token/refresh").cookie(previous))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error.code").value("REFRESH_TOKEN_INVALID"));
  }

  @Test
  void expiredRefreshCookieReturnsDedicatedError() throws Exception {
    signup("member@example.com").andExpect(status().isCreated());
    Cookie refreshCookie = new Cookie("style_finder_refresh", expiredRefreshToken());

    mockMvc
        .perform(post("/api/members/token/refresh").cookie(refreshCookie))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error.code").value("REFRESH_TOKEN_EXPIRED"));
  }

  private String expiredRefreshToken() throws Exception {
    String pem = Files.readString(KEY_PATHS.privateKey());
    String encoded =
        pem.replace("-----BEGIN PRIVATE KEY-----", "")
            .replace("-----END PRIVATE KEY-----", "")
            .replaceAll("\\s", "");
    PrivateKey privateKey =
        KeyFactory.getInstance("RSA")
            .generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(encoded)));
    Instant now = Instant.now();
    return Jwts.builder()
        .subject("1")
        .issuer("test-member-service")
        .audience()
        .add("test-style-finder-api")
        .and()
        .claim("type", "refresh")
        .issuedAt(Date.from(now.minusSeconds(120)))
        .expiration(Date.from(now.minusSeconds(60)))
        .signWith(privateKey, Jwts.SIG.RS256)
        .compact();
  }

  @Test
  void logoutRevokesRefreshTokenAndClearsCookie() throws Exception {
    signup("member@example.com").andExpect(status().isCreated());
    MvcResult login = loginResult("member@example.com");
    Cookie refreshCookie = login.getResponse().getCookie("style_finder_refresh");
    String accessToken =
        objectMapper.readTree(login.getResponse().getContentAsString()).get("accessToken").asText();

    MvcResult logout =
        mockMvc
            .perform(
                post("/api/members/logout")
                    .header("Authorization", "Bearer " + accessToken)
                    .cookie(refreshCookie))
            .andExpect(status().isNoContent())
            .andReturn();
    Cookie cleared = logout.getResponse().getCookie("style_finder_refresh");

    assertNotNull(cleared);
    assertTrue(cleared.getMaxAge() == 0);
    mockMvc
        .perform(post("/api/members/token/refresh").cookie(refreshCookie))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error.code").value("REFRESH_TOKEN_INVALID"));
  }

  @Test
  void invalidAccessTokenReturnsJson401() throws Exception {
    mockMvc
        .perform(get("/api/members/me").header("Authorization", "Bearer invalid-token"))
        .andExpect(status().isUnauthorized())
        .andExpect(jsonPath("$.error.code").value("ACCESS_TOKEN_INVALID"));
  }

  @Test
  void userRoleCannotAccessAdminEndpoint() throws Exception {
    signup("member@example.com").andExpect(status().isCreated());
    String accessToken = login("member@example.com");

    mockMvc
        .perform(get("/api/members/admin/ping").header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isForbidden())
        .andExpect(jsonPath("$.error.code").value("FORBIDDEN"));
  }

  @Test
  void searchHistorySupportsValidatedCreatePaginationAndDelete() throws Exception {
    signup("member@example.com").andExpect(status().isCreated());
    String accessToken = login("member@example.com");

    MvcResult created =
        mockMvc
            .perform(
                post("/api/members/search-histories")
                    .header("Authorization", "Bearer " + accessToken)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(
                        """
                                {"searchType":"IMAGE_UPLOAD","cropMode":"AUTO"}
                                """))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.searchType").value("IMAGE_UPLOAD"))
            .andExpect(jsonPath("$.cropMode").value("AUTO"))
            .andExpect(jsonPath("$.searchedAt").isNotEmpty())
            .andReturn();
    long historyId =
        objectMapper.readTree(created.getResponse().getContentAsString()).get("id").asLong();

    mockMvc
        .perform(
            get("/api/members/search-histories?page=0&size=1")
                .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].id").value(historyId))
        .andExpect(jsonPath("$.totalElements").value(1))
        .andExpect(jsonPath("$.size").value(1));

    mockMvc
        .perform(
            delete("/api/members/search-histories/{id}", historyId)
                .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isNoContent());
  }

  @Test
  void savedResultRoundTripsJsonMetadataAndRejectsDuplicate() throws Exception {
    signup("member@example.com").andExpect(status().isCreated());
    String accessToken = login("member@example.com");

    MvcResult created =
        createSavedResult(accessToken, "shirt-blue-001")
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.catalogItemId").value("shirt-blue-001"))
            .andExpect(jsonPath("$.metadata.category").value("shirt"))
            .andExpect(jsonPath("$.metadata.colors[0]").value("blue"))
            .andExpect(jsonPath("$.metadata.styleTags[0]").value("minimal"))
            .andExpect(jsonPath("$.createdAt").isNotEmpty())
            .andReturn();
    long savedId =
        objectMapper.readTree(created.getResponse().getContentAsString()).get("id").asLong();

    createSavedResult(accessToken, "shirt-blue-001")
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.error.code").value("DUPLICATE_SAVED_RESULT"));
    mockMvc
        .perform(
            get("/api/members/saved-results?page=0&size=20")
                .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].metadata.category").value("shirt"))
        .andExpect(jsonPath("$.totalElements").value(1));
    mockMvc
        .perform(
            delete("/api/members/saved-results/{id}", savedId)
                .header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isNoContent());
  }

  @Test
  void activityOwnershipIsolatedByAuthenticatedUser() throws Exception {
    signup("owner@example.com").andExpect(status().isCreated());
    String ownerToken = login("owner@example.com");
    MvcResult history =
        mockMvc
            .perform(
                post("/api/members/search-histories")
                    .header("Authorization", "Bearer " + ownerToken)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("{\"searchType\":\"CATALOG_ITEM\",\"cropMode\":\"CATALOG\"}"))
            .andExpect(status().isCreated())
            .andReturn();
    long historyId =
        objectMapper.readTree(history.getResponse().getContentAsString()).get("id").asLong();
    MvcResult saved =
        createSavedResult(ownerToken, "owner-item").andExpect(status().isCreated()).andReturn();
    long savedId =
        objectMapper.readTree(saved.getResponse().getContentAsString()).get("id").asLong();

    signup("other@example.com").andExpect(status().isCreated());
    String otherToken = login("other@example.com");

    mockMvc
        .perform(
            get("/api/members/search-histories").header("Authorization", "Bearer " + otherToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.totalElements").value(0));
    mockMvc
        .perform(get("/api/members/saved-results").header("Authorization", "Bearer " + otherToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.totalElements").value(0));
    mockMvc
        .perform(
            delete("/api/members/search-histories/{id}", historyId)
                .header("Authorization", "Bearer " + otherToken))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("SEARCH_HISTORY_NOT_FOUND"));
    mockMvc
        .perform(
            delete("/api/members/saved-results/{id}", savedId)
                .header("Authorization", "Bearer " + otherToken))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.error.code").value("SAVED_RESULT_NOT_FOUND"));
  }

  @Test
  void savedResultValidatesSimilarityRange() throws Exception {
    signup("member@example.com").andExpect(status().isCreated());
    String accessToken = login("member@example.com");

    mockMvc
        .perform(
            post("/api/members/saved-results")
                .header("Authorization", "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(savedResultJson("invalid-score", 1.1)))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.code").value("VALIDATION_ERROR"));
  }

  private org.springframework.test.web.servlet.ResultActions signup(String email) throws Exception {
    return mockMvc.perform(
        post("/api/members/signup")
            .contentType(MediaType.APPLICATION_JSON)
            .content(
                objectMapper.writeValueAsString(
                    new SignupPayload(email, "password123", "테스트 사용자"))));
  }

  @Test
  void savedResultsPreserveShopMetadataAndRejectNegativePrices() throws Exception {
    signup("metadata@example.com").andExpect(status().isCreated());
    String accessToken = login("metadata@example.com");
    var payload =
        (com.fasterxml.jackson.databind.node.ObjectNode)
            objectMapper.readTree(savedResultJson("metadata-shirt", 0.91));
    var metadata = (com.fasterxml.jackson.databind.node.ObjectNode) payload.get("metadata");
    metadata.put("storeId", "shop1");
    metadata.put("storeName", "MODO");
    metadata.put("productKey", "t01");
    metadata.put("price", 59000);
    mockMvc
        .perform(
            post("/api/members/saved-results")
                .header("Authorization", "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload)))
        .andExpect(status().isCreated());
    mockMvc
        .perform(get("/api/members/saved-results").header("Authorization", "Bearer " + accessToken))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.items[0].metadata.storeId").value("shop1"))
        .andExpect(jsonPath("$.items[0].metadata.storeName").value("MODO"))
        .andExpect(jsonPath("$.items[0].metadata.productKey").value("t01"))
        .andExpect(jsonPath("$.items[0].metadata.price").value(59000));
    payload.put("catalogItemId", "invalid-price-shirt");
    metadata.put("price", -1);
    mockMvc
        .perform(
            post("/api/members/saved-results")
                .header("Authorization", "Bearer " + accessToken)
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(payload)))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error.fields['metadata.price']").isNotEmpty());
  }

  private String login(String email) throws Exception {
    MvcResult result = loginResult(email);
    JsonNode response = objectMapper.readTree(result.getResponse().getContentAsString());
    return response.get("accessToken").asText();
  }

  private MvcResult loginResult(String email) throws Exception {
    return mockMvc
        .perform(
            post("/api/members/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(new LoginPayload(email, "password123"))))
        .andExpect(status().isOk())
        .andReturn();
  }

  private org.springframework.test.web.servlet.ResultActions createSavedResult(
      String accessToken, String catalogItemId) throws Exception {
    return mockMvc.perform(
        post("/api/members/saved-results")
            .header("Authorization", "Bearer " + accessToken)
            .contentType(MediaType.APPLICATION_JSON)
            .content(savedResultJson(catalogItemId, 0.91)));
  }

  private String savedResultJson(String catalogItemId, double score) throws Exception {
    return objectMapper.writeValueAsString(
        new SavedPayload(
            catalogItemId,
            "파란 셔츠",
            "/api/catalog/items/" + catalogItemId + "/image",
            null,
            score,
            new MetadataPayload("shirt", new String[] {"blue"}, new String[] {"minimal"}),
            "fashion-clip@test"));
  }

  private static String pem(String type, byte[] encoded) {
    String body = Base64.getMimeEncoder(64, new byte[] {'\n'}).encodeToString(encoded);
    return "-----BEGIN " + type + "-----\n" + body + "\n-----END " + type + "-----\n";
  }

  private static KeyPaths createKeys() {
    try {
      Path directory = Files.createTempDirectory("style-finder-jwt-test");
      Path privateKey = directory.resolve("private.pem");
      Path publicKey = directory.resolve("public.pem");
      KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
      generator.initialize(2048);
      KeyPair keyPair = generator.generateKeyPair();
      Files.writeString(privateKey, pem("PRIVATE KEY", keyPair.getPrivate().getEncoded()));
      Files.writeString(publicKey, pem("PUBLIC KEY", keyPair.getPublic().getEncoded()));
      return new KeyPaths(privateKey, publicKey);
    } catch (Exception exception) {
      throw new IllegalStateException("Could not create test JWT keys", exception);
    }
  }

  record SignupPayload(String email, String password, String displayName) {}

  record LoginPayload(String email, String password) {}

  record SavedPayload(
      String catalogItemId,
      String title,
      String imageUrl,
      String sourceUrl,
      double similarityScore,
      MetadataPayload metadata,
      String modelVersion) {}

  record MetadataPayload(String category, String[] colors, String[] styleTags) {}

  record KeyPaths(Path privateKey, Path publicKey) {}

  @RestController
  static class AdminApi {
    @GetMapping("/api/members/admin/ping")
    String ping() {
      return "ok";
    }
  }
}
