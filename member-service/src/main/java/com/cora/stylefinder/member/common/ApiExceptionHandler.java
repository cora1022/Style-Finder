package com.cora.stylefinder.member.common;

import jakarta.servlet.http.HttpServletRequest;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {
  private static final Logger LOGGER = LoggerFactory.getLogger(ApiExceptionHandler.class);

  @ExceptionHandler(ApiException.class)
  ResponseEntity<Map<String, Object>> api(ApiException exception, HttpServletRequest request) {
    return response(exception.status(), exception.code(), exception.getMessage(), request);
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  ResponseEntity<Map<String, Object>> validation(
      MethodArgumentNotValidException exception, HttpServletRequest request) {
    Map<String, String> fields = new LinkedHashMap<>();
    exception
        .getBindingResult()
        .getFieldErrors()
        .forEach(error -> fields.putIfAbsent(error.getField(), error.getDefaultMessage()));
    return ResponseEntity.badRequest()
        .body(
            Map.of(
                "error",
                Map.of(
                    "code",
                    "VALIDATION_ERROR",
                    "message",
                    "요청 값을 확인해주세요.",
                    "requestId",
                    String.valueOf(request.getAttribute("requestId")),
                    "fields",
                    fields)));
  }

  @ExceptionHandler(Exception.class)
  ResponseEntity<Map<String, Object>> internal(Exception exception, HttpServletRequest request) {
    LOGGER.error("Unhandled API error, requestId={}", request.getAttribute("requestId"), exception);
    return response(HttpStatus.INTERNAL_SERVER_ERROR, "INTERNAL_ERROR", "요청을 처리하지 못했습니다.", request);
  }

  static ResponseEntity<Map<String, Object>> response(
      HttpStatus status, String code, String message, HttpServletRequest request) {
    return ResponseEntity.status(status)
        .body(
            Map.of(
                "error",
                Map.of(
                    "code",
                    code,
                    "message",
                    message,
                    "requestId",
                    String.valueOf(request.getAttribute("requestId")))));
  }
}
