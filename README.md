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

# 4. Run unit tests
npm test
```

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
