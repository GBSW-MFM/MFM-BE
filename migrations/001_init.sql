-- 001_init.sql · 미래의 나에게 짬처리 · 초기 스키마 (MySQL 8.0)
-- 시각은 모두 DATETIME(3)에 UTC로 저장한다. 연결 세션 time_zone 은 '+00:00' (src/config/db.js).
-- 한국 시간 판단은 UTC + 9시간으로 계산한다 (한국은 서머타임이 없어 고정 오프셋으로 충분).
-- 트랜잭션과 실행 기록(schema_migrations)은 scripts/migrate.js 가 관리한다.

CREATE TABLE users (
  id                   BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  kakao_id             BIGINT UNSIGNED  NOT NULL,
  handle               VARCHAR(20)      NOT NULL,
  name                 VARCHAR(30)      NOT NULL,
  age                  TINYINT UNSIGNED NOT NULL,
  gender               VARCHAR(12)      NOT NULL,
  email                VARCHAR(254)     NOT NULL,
  notification_agreed  BOOLEAN          NOT NULL DEFAULT FALSE,
  terms_agreed_at      DATETIME(3)      NOT NULL,
  created_at           DATETIME(3)      NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  updated_at           DATETIME(3)      NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  PRIMARY KEY (id),
  UNIQUE KEY users_kakao_id_uq (kakao_id),
  UNIQUE KEY users_handle_uq (handle),
  UNIQUE KEY users_email_uq (email),                  -- 기본 정렬규칙(_ai_ci)이라 대소문자 구분 없이 중복 금지
  CONSTRAINT users_handle_format CHECK (REGEXP_LIKE(handle, '^[a-z0-9_]{3,20}$', 'c')),
  CONSTRAINT users_name_len      CHECK (CHAR_LENGTH(TRIM(name)) BETWEEN 1 AND 30),
  CONSTRAINT users_age_range     CHECK (age BETWEEN 1 AND 120),
  CONSTRAINT users_gender_enum   CHECK (gender IN ('female', 'male', 'undisclosed'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE email_verifications (
  id             BIGINT UNSIGNED  NOT NULL AUTO_INCREMENT,
  email          VARCHAR(254)     NOT NULL,
  code_hash      CHAR(64)         NOT NULL,       -- 6자리 코드의 SHA-256. 평문 저장 안 함
  expires_at     DATETIME(3)      NOT NULL,
  attempt_count  TINYINT UNSIGNED NOT NULL DEFAULT 0,
  verified_at    DATETIME(3)      NULL,
  consumed_at    DATETIME(3)      NULL,
  created_at     DATETIME(3)      NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  PRIMARY KEY (id),
  KEY email_verifications_email_idx (email, created_at),
  CONSTRAINT email_verifications_attempts CHECK (attempt_count <= 10),
  CONSTRAINT email_verifications_order    CHECK (consumed_at IS NULL OR verified_at IS NOT NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 편지 1통 = 받는 사람 1명. 받는 사람 쪽 상태(첫 열람·보관·삭제)도 이 행에 둔다.
-- 주의: MySQL은 CHECK에 쓰인 컬럼에 FK의 ON DELETE 동작을 허용하지 않아 sender_id/recipient_id FK는 기본(RESTRICT)이다.
CREATE TABLE letters (
  id                    BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  sender_id             BIGINT UNSIGNED NOT NULL,
  recipient_id          BIGINT UNSIGNED NOT NULL,
  recipient_type        VARCHAR(10)     NOT NULL,
  title                 VARCHAR(50)     NOT NULL,
  content               TEXT            NOT NULL,
  open_at               DATETIME(3)     NOT NULL,   -- 공개일 00:00 KST 를 UTC로 저장
  reply_to_letter_id    BIGINT UNSIGNED NULL,
  first_read_at         DATETIME(3)     NULL,
  archived_at           DATETIME(3)     NULL,
  recipient_deleted_at  DATETIME(3)     NULL,
  created_at            DATETIME(3)     NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  updated_at            DATETIME(3)     NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  PRIMARY KEY (id),
  UNIQUE KEY letters_one_reply_uq (reply_to_letter_id),   -- NULL 은 여러 개 허용 → 답장만 1통 제한
  KEY letters_recipient_open_idx (recipient_id, recipient_deleted_at, open_at),
  KEY letters_recipient_archived_idx (recipient_id, archived_at),
  KEY letters_sender_created_idx (sender_id, created_at),
  CONSTRAINT letters_sender_fk    FOREIGN KEY (sender_id)    REFERENCES users (id),
  CONSTRAINT letters_recipient_fk FOREIGN KEY (recipient_id) REFERENCES users (id),
  CONSTRAINT letters_reply_fk     FOREIGN KEY (reply_to_letter_id) REFERENCES letters (id) ON DELETE SET NULL,
  CONSTRAINT letters_recipient_type_enum CHECK (recipient_type IN ('self', 'friend', 'anyone')),
  CONSTRAINT letters_self_consistency    CHECK ((recipient_type = 'self') = (sender_id = recipient_id)),
  CONSTRAINT letters_title_len           CHECK (CHAR_LENGTH(TRIM(title)) BETWEEN 1 AND 50),
  CONSTRAINT letters_content_len         CHECK (CHAR_LENGTH(content) BETWEEN 1 AND 1000),
  CONSTRAINT letters_open_after_create   CHECK (open_at > created_at),
  CONSTRAINT letters_read_after_open     CHECK (first_read_at IS NULL OR first_read_at >= open_at),
  CONSTRAINT letters_archive_xor_delete  CHECK (archived_at IS NULL OR recipient_deleted_at IS NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE notifications (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  user_id     BIGINT UNSIGNED NOT NULL,
  type        VARCHAR(20)     NOT NULL,
  letter_id   BIGINT UNSIGNED NOT NULL,
  read_at     DATETIME(3)     NULL,
  created_at  DATETIME(3)     NOT NULL DEFAULT (UTC_TIMESTAMP(3)),
  PRIMARY KEY (id),
  UNIQUE KEY notifications_once_uq (user_id, type, letter_id),   -- 같은 편지·같은 종류 알림은 1번만
  KEY notifications_user_created_idx (user_id, created_at),
  CONSTRAINT notifications_user_fk   FOREIGN KEY (user_id)   REFERENCES users (id) ON DELETE CASCADE,
  CONSTRAINT notifications_letter_fk FOREIGN KEY (letter_id) REFERENCES letters (id) ON DELETE CASCADE,
  CONSTRAINT notifications_type_enum CHECK (type IN ('letter_arrived', 'letter_opened', 'reply_deadline', 'reply_received'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
