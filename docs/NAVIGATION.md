# Screen and navigation map

Desktop shows a left sidebar. Phones show a top bar, a slide-out menu, and a bottom tab bar (Home · Alerts · LCs · Export · Menu). Every list has search, sort, Excel and PDF export, a "Show voided" switch and quick filters. On phones, lists become cards.

```
Dashboard ─ KPI tiles · maturity profile · bank limits · maturities 30d · LC expiries · overdue bills · demurrage
Alerts ─ every due item, filter by type → opens the record

EXPORT
├─ Master LC / Sales Contracts ─ list → record
│    record: summary (entitlement, BTB opened/pending/balance, open liability, shipped, balance to ship, realized)
│    tabs: Details · Amendments · UD/UP (→ coefficients, UD amendments) · BTB LCs · Export Invoices
│          · Bank Submissions · PC/EDF Loans · Attachments · History
├─ Export Invoices & Docs ─ list → record
│    panel: Commercial Invoice PDF · Packing List PDF · Excel · document progress checklist
│    panel: Draft BL / FCR check (expected vs draft, pass/discrepancy, saved history)
│    tabs: Details (EXP, shipping bill, handover, final BL) · Invoice & Packing List lines · Attachments · History
├─ Bank Submission ─ list (Under realization / Overdue / Realized) → record
│    panel: attach / remove invoices · tabs: Invoices · Realizations · Attachments · History
└─ Proceeds Realization ─ list → record
     panel: link to Master LC + its open BTB liability
     tabs: Deductions · BTB Payments from these Proceeds · Other Distribution (PC/ERQ/FC/CD)

IMPORT
├─ Proforma Invoices ─ record tabs: Items
├─ Import / BTB LCs ─ list (Opened / BTB only / Awaiting GM approval) → record
│    panel: over-entitlement warning + GM Approve/Reject · LSD-after-master · PI vs LC value · expiry
│    tabs: Amendments · PIs · Acceptances · Payments · Shipments · Goods Receipts · LC Qty vs Received
├─ Acceptance Register ─ (Unpaid / Overdue / Awaiting acceptance) → record tabs: Payments
├─ Payment Register
├─ Shipments & Port Clearing ─ (At port / Demurrage risk / In transit) → record tabs: Goods Receipts
└─ Goods Receipt (GRN) ─ record tabs: Received Items

CUSTOMS BOND
├─ Bond Statement ─ licence + period → balance / import entries / export entries → Excel, PDF (template)
├─ Bond Licenses ─ record tabs: Opening Balances
└─ Bond Opening Balances

CASH INCENTIVE
├─ Incentive Claims ─ tabs: Eligible (not claimed → create claim) · Claims
│    claim record: checklist, status, Form-Ka PDF / Excel (template)
└─ Incentive Rates ─ editable, effective from/to

FINANCE & REPORTS
├─ Bank Limits & Utilization ─ per bank, funded vs non-funded, Excel/PDF
├─ PC / EDF Loans ─ record tabs: Repayments
├─ Board Pack ─ period selector → 11 sections → one PDF + one Excel workbook
└─ Document Store ─ search every attachment by text, type, date → open file / go to record

MASTERS ─ Buyers · Suppliers · Banks (→ Facility Limits) · Materials/Items · HS Codes · C&F Agents
          · Freight Forwarders · Currency Rates · Currencies · Units

ADMIN ─ Excel Import · Users (GM) · Permissions (GM) · Settings & Templates (GM) · Audit Log (GM, Management)
```

## What each role sees

| Area | GM | Import officer | Export officer | Store | Accounts | Management |
|---|---|---|---|---|---|---|
| Dashboard, alerts, reports, board pack | ✓ | ✓ | ✓ | alerts only | ✓ | ✓ (read) |
| Export screens | edit | read | edit | — | realization edit | read |
| Import LC, acceptances, shipments | edit | edit | read | shipments (read) | read | read |
| Payments, loans, bank facilities | edit | read | read | — | edit | read |
| Goods receipt | edit | edit | read | edit | read | read |
| Bond | edit | edit | read | — | read | read |
| Incentive claims | edit | read | edit | — | edit | read |
| Incentive rates | edit | read | read | — | read | read |
| Approve BTB above entitlement | ✓ | — | — | — | — | — |
| Users, permissions, settings | ✓ | — | — | — | — | — |

Edit rights per table can be changed in Admin › Permissions.
