package com.cora.stylefinder.member.auth;

import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class GoogleOAuthStatusController {
  private final boolean enabled;

  public GoogleOAuthStatusController(@Value("${app.oauth.google.enabled:false}") boolean enabled) {
    this.enabled = enabled;
  }

  @GetMapping("/api/members/oauth2/status")
  Map<String, Boolean> status() {
    return Map.of("enabled", enabled);
  }
}
