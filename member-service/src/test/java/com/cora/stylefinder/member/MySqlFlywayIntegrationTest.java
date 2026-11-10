package com.cora.stylefinder.member;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.testcontainers.containers.MySQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class MySqlFlywayIntegrationTest {
  @Container
  static final MySQLContainer<?> MYSQL =
      new MySQLContainer<>("mysql:8.4")
          .withDatabaseName("stylefinder_member")
          .withUsername("stylefinder")
          .withPassword("integration-test-password");

  @Test
  void appliesAllMigrationsOnProductionDatabaseEngine() {
    Flyway flyway =
        Flyway.configure()
            .dataSource(MYSQL.getJdbcUrl(), MYSQL.getUsername(), MYSQL.getPassword())
            .locations("classpath:db/migration")
            .load();

    var result = flyway.migrate();

    assertTrue(result.success);
    assertEquals("4", flyway.info().current().getVersion().getVersion());
    assertEquals(0, flyway.info().pending().length);
  }
}
