# IKGPL Commercial ERP

Commercial department ERP for Ibrahim Knit Garments (Pvt.) Ltd. It covers the full chain: Master LC / Sales Contract → BTB import LCs → acceptance and payment → shipments and port clearing → goods receipt → export documents → bank submission → realization → customs bond → cash incentive → board reporting.

- **Stack:** React 18, TypeScript, Tailwind (Vite), Supabase (PostgreSQL with row-level security, Auth, Storage, Edge Functions). Installable PWA.
- **Setup:** see [SETUP.md](SETUP.md).
- **Schema:** see [docs/SCHEMA.md](docs/SCHEMA.md). **Screens:** see [docs/NAVIGATION.md](docs/NAVIGATION.md).

## What is built

| Phase | Scope |
|---|---|
| 1 | Masters, Master LC / SC (amendments, UD/UP, auto BTB entitlement / opened / balance / shipped / balance to ship), Import & BTB LC (PI, amendments, GM approval above entitlement, LSD-after-master warning), acceptance register (calculated maturity), payment register, dashboard, Excel import, login with 6 roles |
| 2 | Import shipments and port clearing (Bill of Entry, documents checklist, demurrage risk), goods receipt (LC qty vs received), export invoice and packing list (PDF/Excel), EXP, shipping bill, forwarder handover, draft BL check, final BL, bank submission (FDBC/FDBP, calculated due date), realization (deductions, short realization, ERQ, distribution, BTB payment from proceeds of the same Master LC) |
| 3 | Customs bond statement (opening + Bill of Entry imports − UD-coefficient consumption = closing) and cash incentive (eligible list, editable rate table with effective dates, claims, checklist, claim form), both through editable templates |
| 4 | Monthly Board Pack (PDF + Excel, any period), bank limit vs utilization (BTB/EDF/PC/FDBP/UPAS, funded vs non-funded), document store search, in-app and daily e-mail alerts, PWA install and phone layout |

Cross-cutting: every record has status and created/updated by/at. Nothing is hard-deleted (void with a reason). There is a full audit log, attachments on every record, Excel and PDF export of every list, DD-MMM-YYYY dates, Asia/Dhaka time, original currency plus rate plus BDT, and all UI text in `src/locales/en.json` so Bangla can be added later.

## Project layout
```
supabase/migrations/   database: tables, rules (triggers), views, security, templates
supabase/seed.sql      sample data for a TEST project
supabase/functions/    daily-alerts e-mail function
supabase/cron.sql      schedule for the alert e-mail
src/lib/entities.ts    screen definitions (fields, columns, child tabs) for every module
src/pages/             dashboard, list/record pages, reports, board pack, bond, incentive, admin, Excel import
scripts/verify-db.mjs  in-memory database test of the business rules
```
