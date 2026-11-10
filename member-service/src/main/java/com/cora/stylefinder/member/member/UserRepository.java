package com.cora.stylefinder.member.member;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {
  Optional<User> findByEmail(String email);

  Optional<User> findByGoogleSubject(String googleSubject);

  boolean existsByEmail(String email);
}
