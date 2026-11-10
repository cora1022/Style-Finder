package com.cora.stylefinder.member.auth;

import java.net.URI;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.config.oauth2.client.CommonOAuth2Provider;
import org.springframework.security.oauth2.client.registration.ClientRegistrationRepository;
import org.springframework.security.oauth2.client.registration.InMemoryClientRegistrationRepository;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.NullSecurityContextRepository;

@Configuration
@ConditionalOnProperty(name = "app.oauth.google.enabled", havingValue = "true")
public class GoogleOAuthConfig {
  @Bean
  ClientRegistrationRepository googleClients(
      @Value("${app.oauth.google.client-id}") String id,
      @Value("${app.oauth.google.client-secret}") String secret,
      @Value("${app.oauth.google.redirect-uri}") String redirect) {
    if (id.isBlank() || secret.isBlank())
      throw new IllegalStateException("Google OAuth credentials are missing");
    return new InMemoryClientRegistrationRepository(
        CommonOAuth2Provider.GOOGLE
            .getBuilder("google")
            .clientId(id)
            .clientSecret(secret)
            .redirectUri(redirect)
            .scope("openid", "email", "profile")
            .build());
  }

  @Bean
  @Order(1)
  SecurityFilterChain googleSecurity(
      HttpSecurity http,
      AuthService auth,
      RefreshCookieService cookie,
      @Value("${app.oauth.google.frontend-url}") String frontend)
      throws Exception {
    URI target = URI.create(frontend);
    boolean local = "localhost".equals(target.getHost()) || "127.0.0.1".equals(target.getHost());
    if (target.getHost() == null
        || target.getUserInfo() != null
        || target.getQuery() != null
        || target.getFragment() != null
        || (!"https".equals(target.getScheme()) && !(local && "http".equals(target.getScheme()))))
      throw new IllegalStateException("Google OAuth frontend URL must be HTTPS or loopback HTTP");
    String home = frontend.replaceAll("/+$", "") + "/";
    GoogleOAuthHandler handler = new GoogleOAuthHandler(auth, cookie, home);
    return http.securityMatcher("/api/members/oauth2/**", "/api/members/login/oauth2/**")
        .authorizeHttpRequests(rules -> rules.anyRequest().permitAll())
        .sessionManagement(
            session -> session.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED))
        .securityContext(
            context -> context.securityContextRepository(new NullSecurityContextRepository()))
        .requestCache(cache -> cache.disable())
        .oauth2Login(
            oauth ->
                oauth
                    .authorizationEndpoint(
                        endpoint -> endpoint.baseUri("/api/members/oauth2/authorization"))
                    .redirectionEndpoint(
                        endpoint -> endpoint.baseUri("/api/members/login/oauth2/code/*"))
                    .successHandler(handler)
                    .failureHandler(handler))
        .build();
  }
}
