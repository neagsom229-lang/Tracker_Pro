# UX audit — Tracker Pro (Obsidian Finance)

Rule of thumb: "log money fast, see where it goes, stay under budget."

## Per-route must-haves

- **Dashboard** — Quick Add (AIQuickAdd), 3 stat cards, Budget Health, Balance Trend, Spending by Category, recent transactions (TransactionList, limit 6).
- **Transactions** — full list: search, category filter, edit/delete on rows.
- **Budgets** — set monthly limits per category; spent vs limit with red/amber/green; add-budget form.
- **Recurring** — view/add/remove recurring rules (description, amount, category, frequency, next run).
- **Goals** — view/add goals, progress, add funds.
- **Debts** — view/add debts, log payments, payoff estimate.
- **Export** — CSV download, PDF report, base-currency picker.
- **Billing** — subscription status, manage/cancel, upgrade nudge.
- **Admin** — approve/reject ABA payments awaiting review.

## Skill (ui-ux-pro-max) violations found

1. Charts have no accessible fallback — TrendChart/CategoryChart rely on color alone: no text labels, no "View as table", no keyboard focus reveal.
2. Light mode missing — TopBar's theme toggle calls setTheme('light') but no light CSS exists (html.light / prefers-color-scheme); dark is the only look.
3. cursor-pointer missing on many clickables (nav, sidebar, TransactionList row hover actions, BudgetProgress remove, etc.).
4. Validation is submit-only — TransactionModal/BudgetProgress/RecurringManager show errors only after submit; the skill wants blur-time inline validation + an error summary.
5. Modals lack guaranteed focus trap + return focus (TransactionModal, UpgradeModal, notifications).
6. Interaction transitions are inconsistent — most hovers have none or <100ms; skill wants 150–300ms and prefers-reduced-motion respected.
7. TransactionList row edit/delete appear only on hover — invisible until intent.
8. Money amounts in some places aren't tabular-nums; long amounts/labels truncate without accessible text.
9. Dashboard carries Net Worth beside Budget Health — competes for attention; move it to its own place.
