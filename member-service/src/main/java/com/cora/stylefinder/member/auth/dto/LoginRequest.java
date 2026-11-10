package com.cora.stylefinder.member.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(
    @Email(message = "올바른 이메일 주소를 입력해주세요.")
        @NotBlank(message = "이메일을 입력해주세요.")
        @Size(max = 254, message = "이메일은 254자 이하로 입력해주세요.")
        String email,
    @NotBlank(message = "비밀번호를 입력해주세요.") @Size(max = 72, message = "비밀번호는 72자 이하로 입력해주세요.")
        String password) {
  public LoginRequest {
    email = email == null ? null : email.trim();
  }
}
