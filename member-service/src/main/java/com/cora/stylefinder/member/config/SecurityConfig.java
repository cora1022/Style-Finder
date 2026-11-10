package com.cora.stylefinder.member.config;

import com.cora.stylefinder.member.common.RequestIdFilter;
import java.util.Arrays;
import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
public class SecurityConfig {
  @Bean
  PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
  }

  @Bean
  SecurityFilterChain security(
      HttpSecurity http,
      JwtAuthenticationFilter jwtFilter,
      RequestIdFilter requestIdFilter,
      RestAuthenticationEntryPoint authenticationEntryPoint,
      RestAccessDeniedHandler accessDeniedHandler)
      throws Exception {
    return http.csrf(csrf -> csrf.disable())
        .cors(cors -> {})
        .sessionManagement(
            session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .exceptionHandling(
            errors ->
                errors
                    .authenticationEntryPoint(authenticationEntryPoint)
                    .accessDeniedHandler(accessDeniedHandler))
        .authorizeHttpRequests(
            authorize ->
                authorize
                    .requestMatchers(
                        "/health/**",
                        "/api/members/signup",
                        "/api/members/login",
                        "/api/members/oauth2/status",
                        "/api/members/token/refresh")
                    .permitAll()
                    .requestMatchers("/api/members/admin/**")
                    .hasRole("ADMIN")
                    .anyRequest()
                    .authenticated())
        .addFilterBefore(requestIdFilter, UsernamePasswordAuthenticationFilter.class)
        .addFilterAfter(jwtFilter, RequestIdFilter.class)
        .build();
  }

  @Bean
  CorsConfigurationSource cors(@Value("${app.cors-origins}") String origins) {
    CorsConfiguration configuration = new CorsConfiguration();
    configuration.setAllowedOrigins(Arrays.stream(origins.split(",")).map(String::trim).toList());
    configuration.setAllowedMethods(List.of("GET", "POST", "DELETE", "OPTIONS"));
    configuration.setAllowedHeaders(List.of("Authorization", "Content-Type", "X-Request-ID"));
    configuration.setAllowCredentials(true);
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", configuration);
    return source;
  }
}
