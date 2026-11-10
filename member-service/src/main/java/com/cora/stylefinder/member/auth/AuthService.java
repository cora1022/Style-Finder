package com.cora.stylefinder.member.auth;

import com.cora.stylefinder.member.auth.dto.LoginRequest;
import com.cora.stylefinder.member.auth.dto.SignupRequest;
import com.cora.stylefinder.member.common.ApiException;
import com.cora.stylefinder.member.config.JwtService;
import com.cora.stylefinder.member.member.User;
import com.cora.stylefinder.member.member.UserRepository;
import com.cora.stylefinder.member.member.dto.MemberResponse;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.ExpiredJwtException;
import io.jsonwebtoken.JwtException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Locale;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional
public class AuthService {
  private final UserRepository users;
  private final RefreshTokenRepository tokens;
  private final PasswordEncoder encoder;
  private final JwtService jwt;

  public AuthService(
      UserRepository users,
      RefreshTokenRepository tokens,
      PasswordEncoder encoder,
      JwtService jwt) {
    this.users = users;
    this.tokens = tokens;
    this.encoder = encoder;
    this.jwt = jwt;
  }

  public MemberResponse signup(SignupRequest request) {
    validatePasswordBytes(request.password());
    String email = normalizeEmail(request.email());
    if (users.existsByEmail(email)) {
      throw emailAlreadyExists();
    }
    try {
      User user = new User(email, encoder.encode(request.password()), request.displayName());
      return MemberResponse.from(users.saveAndFlush(user));
    } catch (DataIntegrityViolationException exception) {
      throw emailAlreadyExists();
    }
  }

  public IssuedTokens login(LoginRequest request) {
    validatePasswordBytes(request.password());
    User user =
        users.findByEmail(normalizeEmail(request.email())).orElseThrow(this::invalidCredentials);
    if (!encoder.matches(request.password(), user.getPasswordHash())) {
      throw invalidCredentials();
    }
    return issue(user);
  }

  public IssuedTokens refresh(String refreshToken) {
    if (refreshToken == null || refreshToken.isBlank()) {
      throw invalidRefresh();
    }
    try {
      Claims claims = jwt.parse(refreshToken);
      if (!"refresh".equals(claims.get("type", String.class))) {
        throw invalidRefresh();
      }
      RefreshToken saved =
          tokens.findByTokenHash(hash(refreshToken)).orElseThrow(this::invalidRefresh);
      if (!saved.isUsable() || !saved.getUser().getId().toString().equals(claims.getSubject())) {
        throw invalidRefresh();
      }
      saved.revoke();
      return issue(saved.getUser());
    } catch (ExpiredJwtException exception) {
      throw new ApiException("REFRESH_TOKEN_EXPIRED", "로그인이 만료되었습니다.", HttpStatus.UNAUTHORIZED);
    } catch (JwtException exception) {
      throw invalidRefresh();
    }
  }

  public void logout(User user, String refreshToken) {
    if (refreshToken == null || refreshToken.isBlank()) {
      return;
    }
    RefreshToken token = tokens.findByTokenHash(hash(refreshToken)).orElse(null);
    if (token == null) {
      return;
    }
    if (!token.getUser().getId().equals(user.getId())) {
      throw new ApiException("FORBIDDEN", "권한이 없습니다.", HttpStatus.FORBIDDEN);
    }
    token.revoke();
  }

  public MemberResponse me(User user) {
    return MemberResponse.from(user);
  }

  private IssuedTokens issue(User user) {
    String refreshToken = jwt.refreshToken(user.getId());
    tokens.save(
        new RefreshToken(
            user, hash(refreshToken), Instant.now().plusSeconds(jwt.refreshSeconds())));
    return new IssuedTokens(
        jwt.accessToken(user.getId(), user.getRole().name()),
        refreshToken,
        "Bearer",
        jwt.accessSeconds());
  }

  private String normalizeEmail(String email) {
    return email.trim().toLowerCase(Locale.ROOT);
  }

  private void validatePasswordBytes(String password) {
    if (password.getBytes(StandardCharsets.UTF_8).length > 72) {
      throw new ApiException(
          "PASSWORD_TOO_LONG", "비밀번호는 72바이트 이하로 입력해주세요.", HttpStatus.BAD_REQUEST);
    }
  }

  private ApiException invalidCredentials() {
    return new ApiException(
        "INVALID_CREDENTIALS", "이메일 또는 비밀번호가 올바르지 않습니다.", HttpStatus.UNAUTHORIZED);
  }

  private ApiException invalidRefresh() {
    return new ApiException(
        "REFRESH_TOKEN_INVALID", "유효하지 않은 Refresh Token입니다.", HttpStatus.UNAUTHORIZED);
  }

  private ApiException emailAlreadyExists() {
    return new ApiException("EMAIL_ALREADY_EXISTS", "이미 사용 중인 이메일입니다.", HttpStatus.CONFLICT);
  }

  private String hash(String value) {
    try {
      byte[] digest =
          MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8));
      return HexFormat.of().formatHex(digest);
    } catch (Exception exception) {
      throw new IllegalStateException("Could not hash refresh token", exception);
    }
  }
}
