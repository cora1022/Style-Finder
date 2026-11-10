plugins {
    java
    id("org.springframework.boot") version "3.5.3"
    id("io.spring.dependency-management") version "1.1.7"
    id("com.diffplug.spotless") version "7.2.1"
}

group = "com.cora.stylefinder"
version = "0.1.0"

java { toolchain { languageVersion = JavaLanguageVersion.of(21) } }

repositories { mavenCentral() }

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-oauth2-client")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.flywaydb:flyway-mysql")
    implementation("io.jsonwebtoken:jjwt-api:0.12.6")
    runtimeOnly("com.mysql:mysql-connector-j")
    runtimeOnly("io.jsonwebtoken:jjwt-impl:0.12.6")
    runtimeOnly("io.jsonwebtoken:jjwt-jackson:0.12.6")
    testRuntimeOnly("com.h2database:h2")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.security:spring-security-test")
    testImplementation("org.testcontainers:junit-jupiter")
    testImplementation("org.testcontainers:mysql")
}

tasks.withType<Test> { useJUnitPlatform() }

spotless {
    java {
        googleJavaFormat("1.28.0")
        removeUnusedImports()
        trimTrailingWhitespace()
        endWithNewline()
    }
}

val noWildcardImports by tasks.registering {
    val javaSources = fileTree("src") { include("**/*.java") }
    inputs.files(javaSources)
    doLast {
        val offenders =
            javaSources.files.filter { file ->
                file.readLines().any { line ->
                    line.trim().matches(Regex("import\\s+(static\\s+)?[^;]+\\.\\*;"))
                }
            }
        if (offenders.isNotEmpty()) {
            throw GradleException(
                "Wildcard imports are not allowed:\n" +
                    offenders.joinToString("\n") { it.relativeTo(projectDir).path }
            )
        }
    }
}

tasks.named("check") {
    dependsOn("spotlessCheck")
    dependsOn(noWildcardImports)
}
