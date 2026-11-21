-- 002 — parity with src/lib/dataProvider.js (local dev)
--
-- 001 introduced ids as BIGINT. The app (Supabase-era) treats ids as opaque
-- strings everywhere (React keys, `t.id === id`, `eq('id', id)`), and the
-- legacy Supabase schema used string UUIDs. Switch to `gen_random_uuid()`
-- for parity. Also: `is_admin` and `email` now live on `users` only;
-- `profiles` keeps `display_name` and `currency`; `users` gains a local
-- `is_pro` dev toggle (the local stand-in for Pro status until the Express
-- API can write it).

DROP TABLE IF EXISTS transactions, budgets, recurring_rules, profiles CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,               -- bcrypt hash (server-side)
  is_admin      BOOLEAN     NOT NULL DEFAULT FALSE,
  is_pro        BOOLEAN     NOT NULL DEFAULT FALSE, -- dev toggle: local Pro status stand-in
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Case-insensitive uniqueness via lower(email) (or citext).
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));

CREATE TABLE profiles (
  id           UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  display_name TEXT,
  currency     TEXT        NOT NULL DEFAULT 'USD',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transactions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  description TEXT           NOT NULL,
  amount      NUMERIC(12, 2) NOT NULL,              -- positive = income, negative = expense
  category    TEXT           NOT NULL CHECK (trim(category) <> ''), -- the app's "type"/bucket column
  date        DATE           NOT NULL,
  created_at  TIMESTAMPTZ    NOT NULL DEFAULT now()
);
CREATE INDEX transactions_user_id_date_idx ON transactions (user_id, date);

CREATE TABLE budgets (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  category       TEXT           NOT NULL,
  monthly_limit  NUMERIC(12, 2) NOT NULL CHECK (monthly_limit > 0),
  created_at     TIMESTAMPTZ    NOT NULL DEFAULT now(),
  UNIQUE (user_id, category)
);

CREATE TABLE recurring_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  description   TEXT           NOT NULL,
  amount        NUMERIC(12, 2) NOT NULL,
  category      TEXT           NOT NULL,
  frequency     TEXT           NOT NULL CHECK (frequency IN ('weekly', 'monthly', 'yearly')),
  next_run_date DATE           NOT NULL,
  created_at    TIMESTAMPTZ    NOT NULL DEFAULT now()
);
