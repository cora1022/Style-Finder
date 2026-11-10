package com.cora.stylefinder.member.auth;

import com.cora.stylefinder.member.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpHeaders;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.core.oidc.user.OidcUser;
import org.springframework.security.web.authentication.AuthenticationFailureHandler;
import org.springframework.security.web.authentication.AuthenticationSuccessHandler;

public class GoogleOAuthHandler
    implements AuthenticationSuccessHandler, AuthenticationFailureHandler {
  private static final Logger LOGGER = LoggerFactory.getLogger(GoogleOAuthHandler.class);
  private final AuthService auth;
  private final RefreshCookieService cookie;
  private final String home;

  public GoogleOAuthHandler(AuthService auth, RefreshCookieService cookie, String home) {
    this.auth = auth;
    this.cookie = cookie;
    this.home = home;
  }

  @Override
  public void onAuthenticationSuccess(
      HttpServletRequest request, HttpServletResponse response, Authentication authentication)
      throws IOException {
    String result = "success";
    try {
      OidcUser user = (OidcUser) authentication.getPrincipal();
      IssuedTokens tokens =
          auth.googleLogin(
              user.getSubject(), user.getEmail(), user.getEmailVerified(), user.getFullName());
      response.addHeader(HttpHeaders.SET_COOKIE, cookie.create(tokens.refreshToken()).toString());
    } catch (ApiException exception) {
      result = "GOOGLE_EMAIL_CONFLICT".equals(exception.code()) ? "email_conflict" : "failed";
    } catch (RuntimeException exception) {
      // Log only the error type so provider tokens and profile data cannot enter logs.
      LOGGER.error("Google login failed: {}", exception.getClass().getSimpleName());
      result = "failed";
    }
    finish(request, response, result);
  }

  @Override
  public void onAuthenticationFailure(
      HttpServletRequest request, HttpServletResponse response, AuthenticationException exception)
      throws IOException {
    finish(request, response, "failed");
  }

  private void finish(HttpServletRequest request, HttpServletResponse response, String result)
      throws IOException {
    var session = request.getSession(false);
    if (session != null) session.invalidate();
    SecurityContextHolder.clearContext();
    response.sendRedirect(home + "?oauth=" + result);
  }
}
