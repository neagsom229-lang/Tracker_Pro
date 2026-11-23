# Obsidian Finance Tracker (Tracker_Pro) — Production-Grade Edition

A world-class personal finance tracker built with **React 18 + Vite + Tailwind CSS + Framer Motion + Zustand** on the frontend, **Supabase** (Postgres + Auth + RLS + Edge Functions) on the backend, and **Stripe** for billing.

---

## Key Features & Production Enhancements

1. **Robust Security & Git Hygiene**:
   - Sensitive keys (`rsa_private_key.txt`, `.env`, `.env.local`) gitignored.
   - Comprehensive security headers (`X-Frame-Options`, `X-Content-Type-Options`, `Strict-Transport-Security`, `Content-Security-Policy`) configured in `vercel.json`.
   - Strict Supabase Row Level Security (RLS) ensuring complete user data isolation.

2. **Client-Side Routing & Theme Support**:
   - Powered by `react-router-dom` with routes for `/dashboard`, `/transactions`, `/budgets`, `/recurring`, `/goals`, `/debts`, `/export`, `/billing`, and `/admin`.
   - Dynamic Dark / Light theme toggle with `localStorage` persistence.

3. **Advanced Financial Tools**:
   - **Recurring Transactions**: Automatic weekly/monthly/yearly recurrence engine with catch-up logic.
   - **Savings Goals & Debt Manager**: Track milestones, target dates, and payoff progress.
   - **AI Quick Add**: Natural language parser for lightning-fast expense logging.
   - **Multi-Currency Support**: Instant conversion across USD, EUR, GBP, KHR, and JPY.

4. **Testing & Code Quality**:
   - Unit tested with **Vitest** & React Testing Library (covering recurrence math, formatting, parsing, and data flows).
   - Strict component naming standards (PascalCase).
   - Centralized error handling and toast notifications (`react-hot-toast`).

---

## Local Development Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env
# Fill in your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY

# 3. Run development server
npm run dev

# 4. Run all tests (unit + integration)
npm test
```

### Tests

- `npm run test:unit` — fast Vitest suite (node environment for non-DOM tests, jsdom for components/hooks); `fetch` is stubbed, so no server and no database are used.
- `npm run test:integration` — boots the real Express app (and the dev-toggle server) against the local `tracker_db_test` database. Covers `server/*.int.test.mjs` plus the API-backed `src/api/client.int.test.js`, `src/hooks/useProStatus.local.int.test.js`, and `src/lib/dataProvider.local.int.test.js`.
- `npm test` — runs both suites in order.

Integration tests require PostgreSQL with a `tracker_db_test` database. They never touch the dev database (`tracker_db`).

---

## Local mode (PostgreSQL)

In local mode the tracker runs against **local PostgreSQL databases** (`tracker_db` for dev, `tracker_db_test` for integration tests). No Supabase, no Stripe, no external services are required.

### Prerequisites

1. **Install PostgreSQL** and ensure `psql` is on your `PATH`.
2. **Create a database role**:

   ```bash
   createuser -s -E -O tracker tracker_role
   # or via psql:
   # CREATE ROLE tracker_role WITH SUPERUSER;
   ```

3. **Create the databases** owned by that role:

   ```bash
   createdb -O tracker_role tracker_db
   createdb -O tracker_role tracker_db_test
   ```

4. **Copy the example env file** and supply only the key names (no values needed — the scripts read from the environment or `.env`):

   ```bash
   cp .env.example .env
   ```

   Required `.env` keys (names only):

   ```text
   PGHOST
   PGPORT
   PGDATABASE          # tracker_db for dev, tracker_db_test for tests
   PGUSER              # tracker_role (or your local postgres user)
   PGPASSWORD          # password for the PGUSER
   NODE_ENV            # development or test
   ENABLE_DEV_PRO_TOGGLE  # "true" (dev only)
   JWT_SECRET          # must be at least 32 chars (any value)
   ```

### Running the app

| Command | Description |
|---|---|
| `npm run db:reset` | Migrates & seeds `tracker_db` (dev database). |
| `npm run dev:all` | Starts both Vite frontend and Express backend with `NODE_ENV=development`. |
| `npm run verify` | Runs lint, unit tests, db reset, integration tests, and build. |

### Phase 2 — Empty in local mode

The following are **empty/not connected** when running in local mode (Phase 2):

- **Goals** — no goal tracking database
- **Debts** — no debt tracking
- **Assets** — no asset tracking
- **Net worth** — computed from empty goals/debts/assets
- **Notifications** — no notification service connected

---

## Project Structure

```
├── public/                 # Service worker & static assets
├── src/
│   ├── components/         # Modular React components (PascalCase)
│   ├── hooks/              # Custom React hooks (useProStatus, useGoals, etc.)
│   ├── lib/                # Supabase, Stripe, and data provider clients
│   ├── store/              # Zustand global state store
│   ├── styles/             # Tailwind & Obsidian theme styling
│   └── utils/              # Recurrence, formatting, and parsing utilities
├── supabase/
│   ├── functions/          # Supabase Edge Functions (Stripe webhook, etc.)
│   └── migrations/         # PostgreSQL schema & RLS policies
└── vercel.json             # Vercel deployment & security headers config
```
