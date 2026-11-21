# Watchman Forecasting — See it coming.

**Watchman Forecasting Model** tracks how a prime contractor's rolling demand
forecast changes from one file to the next. Every import becomes a dated
snapshot; Watchman shows what moved, what's trending, what's new or gone, and
answers questions in plain English — typed or spoken.

Customer zero: **CDI Industries** (RTX / Raytheon SMI forecast).
Stack: **Next.js 15 · Supabase (Postgres) · Tailwind · Vercel** — same as LIFESuite.

## Setup

```bash
cp .env.local.example .env.local   # Supabase URL + publishable key (both public)
npm install
npm run dev                        # http://localhost:3000
```

On Vercel, set the same two `NEXT_PUBLIC_…` variables in the project settings.
No secret keys live in this app: the AI key is a Supabase Edge Function secret.

## How it fits together

| Piece | Where |
|---|---|
| Schema, RLS, comparisons | `supabase/migrations/` (apply in order) |
| Import (one call, one transaction) | `import_snapshot()` — the browser reads the .xlsx (`lib/importer.ts`, `lib/xlsx.ts`) and sends one compact payload |
| Comparisons | `compare_lines` → `compare_part_rows` / `compare_line_rows` → `compare_grid` (paged, sorted, totals) and `compare_summary` (KPI cards, waterfall, by-month) |
| Trending | `part_move` is materialized at import: part-level change vs the previous snapshot plus a **streak** (+2 = up two imports in a row) |
| Semantic layer | `field_def` — fields, synonyms, allowed values, notes. Tenants override any field; edited on the **Dictionary** screen |
| AI Q&A | Edge Function `ask` (Claude): question → Query → `compare_grid` as the signed-in user → answer line. Falls back to the built-in parser (`lib/understand.ts`) when no key is set |
| Voice | Browser speech recognition (`lib/useSpeech.ts`) + spoken part-number cleanup (`normalizeSpoken`) |
| Questions | `question` (history; zero-result list for vocabulary review), `saved_question` (favorites) |

### Import rules (unchanged from the POC spec)
- Quantities come from the sheet named **PIVOT**; header row starts with **Row Labels**, then `Sum of Past`, `Sum of 2026 M04`, … ; the **Grand Total** row is ignored; quantities are rounded to 2 decimals.
- Descriptions are picked up from **Sheet1** (`Part Description`) when present.
- Re-importing the same snapshot date replaces it. The whole import is one transaction — it either lands completely or not at all.
- Snapshot date defaults from the file name (`…_04.20.26.xlsx` → Apr 20, 2026) and can be changed before importing.

### Trend values
`Increased` · `Decreased` · `No Change` · `Shifted` (part total unchanged, but quantities moved between months — pull-ins / push-outs) · `New` · `Removed`.
Comparisons only use the forecast months both snapshots cover, so a month rolling into "Past" never shows as "Removed".

## Sign-in and security (ported from LIFESuite)
- Email + password (NIST-style: 15+ characters, breached-password check), then **two-step sign-in with an authenticator app**.
- **Row-level security does the real locking:** every policy goes through `my_tenant()` / `my_role()`, which return nothing until the session has completed two-step (AAL2) or is on a trusted device. Someone not signed in gets no tables and no functions.
- "Trust this device" (httpOnly cookie; only a SHA-256 fingerprint is stored; ends when the password changes or two-step is reset), idle timeout with a one-minute warning, sign-in cookies that end when the browser closes.
- Security headers / CSP as in LIFESuite; the microphone is allowed for this site only (voice questions).
- **Still to port:** the company-code step with the Tenant Registry, Microsoft 365 / Google sign-in with tenant locks, sign-in events and lockout, the staff-admin invite / reset Edge Function.

## Sample data
`scripts/` builds a **scrambled** sample from the real RTX files: part numbers keep their shape and families (`11480860-A3103K` → `30368915-A3899K`), descriptions are real, quantities are scaled per part so every up/down/new/removed pattern is preserved. Import the three `Watchman Sample Forecast_*.xlsx` files on the Imports screen.

Before loading real customer files, confirm with CDI that RTX part numbers and forecast quantities may be hosted on Supabase (export-control / CUI check).
