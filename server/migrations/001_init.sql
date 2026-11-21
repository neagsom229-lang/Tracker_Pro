-- Local PostgreSQL (tracker_db) — initial schema v1
--
-- Plain Postgres: no auth.users, no auth.uid(), no RLS, no realtime
-- publications. Access control is enforced by Express (see server/index.js):
-- every query filters by the authenticated user's id.

CREATE TABLE IF NOT EXISTS users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,               -- bcrypt hash (server-side only)
  display_name  TEXT,
  is_admin      BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Case-insensitive uniqueness: lower(email) unique index (or citext).
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_idx ON users (lower(email));

CREATE TABLE IF NOT EXISTS profiles (
  id           BIGINT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  email        TEXT,
  display_name TEXT,
  currency     TEXT        NOT NULL DEFAULT 'USD',
  is_admin     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     BIGINT         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  description TEXT           NOT NULL,
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount <> 0), -- income > 0, expense < 0
  category    TEXT           NOT NULL CHECK (trim(category) <> ''), -- transaction "type"
  date        DATE           NOT NULL,
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS transactions_user_id_date_idx ON transactions (user_id, date);

CREATE TABLE IF NOT EXISTS budgets (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id        BIGINT         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category       TEXT           NOT NULL,
  monthly_limit  NUMERIC(12, 2) NOT NULL CHECK (monthly_limit > 0),
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),
  UNIQUE (user_id, category)
);

CREATE TABLE IF NOT EXISTS recurring_rules (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       BIGINT         NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  description   TEXT           NOT NULL,
  amount        NUMERIC(12, 2) NOT NULL,
  category      TEXT           NOT NULL,
  frequency     TEXT           NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
  next_run_date DATE           NOT NULL,
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recurring_rules_user_id_idx ON recurring_rules (user_id);
