# DESIGN.md — Tracker Pro (Obsidian Finance)

System reference for every future change. Colors are CSS variables — the
single source of truth (`:root` dark, `html.light` light).

## Tokens

| Token | Dark | Light | Role |
| --- | --- | --- | --- |
| `--color-background` | `#0F172A` | `#FFFFFF` | page background |
| `--color-foreground` / `--color-text` | `#F8FAFC` | `#0F172A` | primary text |
| `--color-card` | `#192134` | `#FFFFFF` | panel base |
| `--color-muted` | `#101A34` | `#F1F5F9` | subtle backgrounds |
| `--color-muted-foreground` | `#94A3B8` | `#64748B` | helper text |
| `--color-border` | `rgba(255,255,255,0.08)` | `rgba(0,0,0,0.10)` | borders/rings |
| `--color-primary` | `#E8C77A` | `#E8C77A` | brand accent (gold) |
| `--color-secondary` | `#9F7AEA` | `#9F7AEA` | brand accent (purple) |
| `--color-accent` | `#059669` | `#047857` | CTA green |
| `--color-income` | `#34D399` | `#16A34A` | income color |
| `--color-expense` | `#F87171` | `#DC2626` | expense color |
| `--color-warning` | `#FBBF24` | `#92400E` | amber |
| `--color-destructive` | `#DC2626` | `#DC2626` | errors |
| `--color-ring` | `#E8C77A` | `#111827` | focus ring |

The dark values follow the ui-ux-pro-max "Glassmorphism" design system
(Obsidian Finance); light values keep contrast ≥ 4.5:1 and glass readable
(verified by `npm run ui:check`).

## Typography

- Typeface: IBM Plex Sans (`theme.fontFamily.sans`), Inter fallback.
- Money: every money value renders with `tabular-nums`
  (`formatMoney()` in `src/utils/format.js`; 0 decimals for KHR/JPY).

## Type scale (semantic Tailwind utilities)

- Headings: `text-xl`/`text-2xl`/`text-3xl` + `font-semibold`, `text-slate-100`
- Body: `text-sm`/`text-xs`, `text-slate-200/300/400/500/600`
- Labels: `text-xs` + `text-slate-400/500`

## Glass

- `.glass` — frosted panel (blur 20px, 1px border)
- `.glass-strong` — modal/panel base (blur 24px)
- `.gilt-text` — gold gradient text
- `.gilt-btn` — primary button (gold→purple gradient)

## Components (primitives — use these, don't invent)

- `Card` — `src/components/Card.jsx` (glass-strong panel, heading/subtitle)
- `Button` — `src/components/Button.jsx` (variants: primary/secondary/ghost/danger/link)
- `Input` — `src/components/Input.jsx` (label + error + alert, `bg-card`, focus ring)
- `Modal` — `src/components/Modal.jsx` (focus trap, Escape, return focus, `role="dialog"`)
- Legacy classes (still used): `glass`, `glass-strong`, `text-gilt-gold`,
  `text-income`, `text-expense`, `bg-income`, `bg-expense`

## Iconography

Lucide only (`lucide-react`).

## Accessibility (skill pre-delivery checklist)

- Visible focus: `:focus-visible` outline 2px `--color-ring`
- `cursor-pointer` on every clickable
- Transitions 150–300ms; `prefers-reduced-motion` respected
- Contrast ≥ 4.5:1 in both modes (`npm run ui:check`)
- Empty states with one clear action; errors inline with summary

## Charts

- TrendChart (balance line) — "View as table", summary line, keyboard-focus reveals values
- CategoryChart (sorted donut, ≤ 15 categories) — legend labels + %, "View as table", one-line summary
- Never color alone: text labels + legend + accessible tables everywhere

## Do / Don't (skill anti-patterns)

- **Do**: glass surfaces, gold→purple accents, IBM Plex Sans, `cursor-pointer` on clickables.
- **Do**: dashboard keeps Quick Add, 3 stat cards, budget health, balance trend, spending-by-category, recent transactions. Net Worth lives at `/networth`.
- **Don't**: decorative motion that doesn't explain state (page transitions + modal enter/exit only).
- **Don't**: hard-code hex — extend `:root`/`html.light` in `src/styles/index.css`.
- **Don't**: emoji icons, remove focus indicators, or break `prefers-reduced-motion`.

## Adding a new screen

1. Add `lazy(() => import('./components/NewPage'))` + `<Route path="/new" ... />` in `src/App.jsx` (PascalCase file, matching its import).
2. Reuse primitives (`Card`, `Button`, `Input`, `Modal`), `tabular-nums` on money, semantic colors.
3. Add focus rings/cursors, empty state with one CTA, lazy-load if heavy.
4. Run `npm run lint && npm test && npm run build && npm run ui:check`.

## Files

- Tokens: `tailwind.config.js`, `src/styles/index.css`
- Theme: `src/utils/theme.js`, `src/store/useStore.js` (`setTheme`)
- Scripts: `npm run lint`, `npm run test`, `npm run build`, `npm run ui:check`, `npm run keyboard:check`, `npm run smoke`
- CI: `.github/workflows/ci.yml`
