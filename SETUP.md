# Setup guide

Allow about 30 minutes for the first setup. You need a free Supabase account and Node.js.

## 1. Install Node.js
Install **Node.js 22 LTS** from https://nodejs.org (Windows installer). Open a new PowerShell window and check with `node -v`.

## 2. Create the database (Supabase)
1. Sign in at https://supabase.com and create a **New project**. Choose the region nearest Bangladesh (Mumbai or Singapore) and keep the database password safe.
2. Open **SQL Editor**. Paste and run each file from `supabase/migrations/` **in order**:
   `0001_foundation.sql` → `0002_masters.sql` → … → `0009_storage_templates.sql`.
3. Run `supabase/login_account.sql`. It creates the GM login shown under the sign-in box: **Login ID `admin@ikgpl.net`, Password `Ikgpl@2026`**. Running it again resets that password.
4. **Test project only:** also run `supabase/seed.sql`. It loads the sample data (2 buyers, 3 suppliers, 3 banks, 3 Master LC/SC, 8 BTB LCs, plus shipments, invoices, realizations, a bond license and incentive rates).
   > Use **two Supabase projects**: one *test* project with the sample data, and one *live* project without it. Records can't be deleted, only voided, so sample rows should never go into the live database.
5. **Authentication › Providers › Email**: leave it enabled. For an internal tool you can switch off "Confirm email". **Authentication › URL Configuration**: set *Site URL* to the address where the app will run.

## 3. Run the app on your PC
```powershell
cd "E:\Claude\For App\ikgpl-commercial-erp"
copy .env.example .env      # then edit .env: paste Project URL and anon key (Supabase > Project Settings > API)
npm install
npm run dev                 # opens on http://localhost:5173
```
**The first account to sign up becomes GM Commercial** (active). Everyone after that signs up on the same page and waits until the GM gives them a role in **Admin › Users**.

## 4. Put it online (for phones)
Any static host works. For example, on **Netlify** or **Vercel**: connect the folder or repository, set build command `npm run build`, output folder `dist`, and add the environment variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Page routing is already configured (`public/_redirects`, `vercel.json`).
Then add the site address to Supabase **Authentication › URL Configuration**.

**Install on a phone:** open the site in Chrome (Android) and tap *Add to Home screen*, or in Safari (iPhone) tap *Share › Add to Home Screen*. It opens full-screen like an app.

## 5. Daily e-mail alerts
1. Create a free account at https://resend.com, verify your sending domain (for example `ikgpl.net`), and create an API key.
2. Install the Supabase CLI (`npm i -g supabase`), run `supabase login` and `supabase link --project-ref <ref>`, then:
   ```
   supabase secrets set RESEND_API_KEY=... ALERT_FROM="IKGPL Commercial <alerts@ikgpl.net>" CRON_SECRET=<any long random text>
   supabase functions deploy daily-alerts
   ```
3. Edit `supabase/cron.sql` (project ref, anon key, the same CRON_SECRET) and run it in the SQL Editor. Alerts go out at 08:00 Dhaka time.
4. In the app, go to **Admin › Settings › Alerts & daily e-mail**, tick *Send daily e-mail*, and enter the recipients.

In-app alerts (the Alerts page and the dashboard) work without any of this.

## 6. Backups
- **Supabase Pro** plan: daily backups are automatic (Project › Database › Backups).
- **Any plan, off-site:** push this folder to a private GitHub repository and add the secret `SUPABASE_DB_URL` (Project Settings › Database › Connection string › URI). The workflow `.github/workflows/daily-backup.yml` then saves a dump every night (kept 30 days).
- **Office PC:** `scripts/backup.ps1` with Windows Task Scheduler (needs PostgreSQL 17 client tools).
- Uploaded files (scans) are in Supabase Storage and are **not** in the database dump. Download them periodically, or use Supabase Pro.

## 7. Before go-live
- Admin › Settings: check the company profile (BIN, ERC, IRC, signatory).
- Masters: real banks with **facility limits from the sanction letters**, current **currency rates**, buyers, suppliers, items with HS codes.
- Incentive Rates: enter the rates from the **current Bangladesh Bank FE circulars**. The sample rates are placeholders.
- Templates: when you send the Bond Commissionerate statement format and your incentive claim format, the two templates in Admin › Settings will be changed to match them exactly.
- Excel Import: load the existing trackers (Master LCs, BTB LCs, acceptances, payments, shipments…). Use *Blank template* to see the expected columns.

## 8. Checking the database rules (optional, for IT)
`npm run verify-db` builds the whole database in memory (PGlite), loads the sample data and checks the business rules: entitlement approval, LSD warning, calculated maturity, no delete, void with reason, role permissions, and proceeds paying only the same Master LC's BTB.
