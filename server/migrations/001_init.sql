-- Local PostgreSQL — consolidated initial schema (001–003 squashed).
--
-- Plain Postgres: no auth.users, no auth.uid(), no RLS, no realtime
-- publications. Access control is enforced by Express: every query filters
-- by the authenticated user's id.
--
-- The app treats ids as opaque strings (React keys, `t.id === id`), so ids
-- are UUIDs with gen_random_uuid() for parity with the Supabase-era schema.
-- `is_admin` and `email` live on `users`; `profiles` keeps display_name and
-- currency. `users.is_pro` is the local dev toggle for Pro status.

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT        NOT NULL,
  password_hash TEXT        NOT NULL,               -- bcrypt hash (server-side)
  is_admin      BOOLEAN     NOT NULL DEFAULT FALSE,
  is_pro        BOOLEAN     NOT NULL DEFAULT FALSE, -- dev toggle: local Pro status stand-in
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Case-insensitive uniqueness via lower(email).
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
  amount      NUMERIC(12, 2) NOT NULL CHECK (amount <> 0), -- income > 0, expense < 0
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
CREATE INDEX recurring_rules_user_id_idx ON recurring_rules (user_id);
