package com.cora.stylefinder.member.auth;

import jakarta.persistence.LockModeType;
import java.time.Instant;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {
  @Lock(LockModeType.PESSIMISTIC_WRITE)
  Optional<RefreshToken> findByTokenHash(String tokenHash);

  @Modifying
  @Query(
      """
            delete from RefreshToken token
            where token.expiresAt < :now
               or (token.revokedAt is not null and token.revokedAt < :revokedBefore)
            """)
  int deleteExpiredOrOldRevoked(
      @Param("now") Instant now, @Param("revokedBefore") Instant revokedBefore);
}
