# CYON Payment Platform

One place for CYON to receive dues, levies, event payments and donations. Every payment is recorded against the right member and category, with its date and a downloadable receipt.

Built with Next.js 16 (App Router), Prisma 7 and PostgreSQL. It is hosted on Vercel, with the database and file storage on Supabase.

## How it works

| Who | What they can do |
|---|---|
| **Member** | Pay by bank transfer, uploading proof (required). See their own balances and history. Download receipts. |
| **Financial Officer** | Confirm or reject transfers. Record cash. Correct or void payments. Set yearly rates. Apply levies and charges. Record the balance brought forward. Manage bank accounts and payment links. |
| **Admin** | Manage members and categories. Copy or WhatsApp a member's login details. View all payments, reports and the audit log. **No financial changes** unless the Super Admin grants an area. |
| **Super Admin** | Everything an Admin can do, plus manage staff accounts and roles, and grant or revoke **finance areas** (Payments, Rates & charges, Brought forward, Payment links & bank accounts), optionally until a date. Self-grants are allowed and audited. |
| **Anyone with a payment link** | Pay a one-time collection without an account, then check its status and download the receipt from a private link. |

**Member logins.**
- A new member login starts with the default password set in `MEMBER_DEFAULT_PASSWORD`. The member must change it at first sign-in.
- Until they do, the member's page shows ready-to-send login details: the sign-in link, their phone or email, and the password. The admin can copy them or send them on WhatsApp straight to the member's number. The same details appear right after the member is added.
- Once the member sets their own password, the details are hidden. "Reset to default password" puts the login back on the default and signs the member out.
- Each user's last sign-in time is recorded. It shows on the member page and under Users & roles.

**Phone numbers** are stored in the Nigerian local form without the country code, for example `08031234567`. Any common form typed in, such as `+234 803 123 4567`, is converted. Numbers from other countries are rejected.

Rules the code enforces:
- A transfer stays **pending** until it is confirmed.
- **Only confirmed payments count** toward totals, balances, link progress and the yearly summary.
- **Part payments** are applied oldest-first.
- **No double recording**, checked two ways: an idempotency key per submission, and a unique proof file. Payers aren't asked for a transfer reference.
- **Corrections never edit**. They void the original and create a linked replacement, and the audit log keeps the values before and after.
- **Members only ever see their own records.** Proof files are private and are streamed only after an authorization check.

## Local setup

```bash
npm install
docker compose up -d                 # Postgres 17 on localhost:54329
cp .env.example .env                 # then set DATABASE_URL/DIRECT_URL to postgresql://postgres:postgres@localhost:54329/cyon
npm run db:deploy                    # apply prisma/migrations
npm run db:seed                      # sample data (empty database only)
npm run dev
```

Also set `MEMBER_DEFAULT_PASSWORD` in `.env` before adding member logins (the seed uses `Welcome-2026` if it is unset), and `SHADOW_DATABASE_URL` for `npm run db:check` (create the empty `cyon_shadow` database first).

The seed prints the sample accounts. They all use the password `Cyon-dev-2026`: `superadmin@`, `officer@`, `admin@` and `member@cyon.test`.

Without Supabase settings, uploaded proofs and backups go to `.local-storage/`. That folder is git-ignored and only used in development.

### First Super Admin (real databases)
The first Super Admin comes from environment variables: `SUPER_ADMIN_NAME`, `SUPER_ADMIN_EMAIL` and/or `SUPER_ADMIN_PHONE`, and `SUPER_ADMIN_PASSWORD`.
- **On Vercel:** it is created during the build, after migrations.
- **On another database:** run `npm run db:bootstrap`.
- It is created only while no active Super Admin exists. After that the variables are ignored, so changing them never alters an existing account.
- The Super Admin must choose a new password at first sign-in. `SUPER_ADMIN_PASSWORD` can then be deleted.
- All other accounts are created in the app.
- On a seeded development database the bootstrap does nothing, because the seed already created `superadmin@cyon.test`.

## Database changes: always a migration

Every schema change is a timestamped folder in **`prisma/migrations/`**, and that folder is committed.

| Task | Command |
|---|---|
| Change `schema.prisma`, then create and apply a migration | `npm run db:migrate -- --name <what-changed>` |
| Create a migration to hand-edit first (partial indexes, CHECKs) | `npm run db:migrate:create -- --name <what-changed>` |
| Apply pending migrations (staging/production) | `npm run db:deploy` |
| Fail if the schema and migrations disagree (CI; needs `SHADOW_DATABASE_URL`, an empty scratch database) | `npm run db:check` |

Never use `prisma db push`, and never edit tables in the Supabase dashboard: neither leaves a record. Never edit a migration that has already been applied; write a new one.

## Tests

```bash
npm test                         # unit + integration (uses the cyon_test database)
npx playwright install chromium  # once
npm run test:e2e                 # recreates cyon_e2e, seeds it, starts the app on :3100 (works alongside `npm run dev`)
```

The E2E suite covers the PRD's "ready when" checks:
- A member pays with proof and the officer confirms. The payment shows under the right member and category with the correct date, and the receipt downloads. Another member can't see it.
- An Admin adds a member and copies or shares the login details. The member signs in with the default password and must change it.
- The Super Admin grants an Admin "Payment links". The Admin creates a link with a new account, a guest pays, the officer confirms, and the guest downloads the receipt.

## Deploying (Vercel + Supabase)

1. **Supabase:**
   - Create a project on a plan with daily backups, or PITR if you can.
   - In Storage, create two **private** buckets: `payment-proofs` and `backups`.
2. **Vercel environment variables:**
   - `DATABASE_URL`: the pooler URL on port 6543, with `?pgbouncer=true`.
   - `DIRECT_URL`: port 5432.
   - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`.
   - `APP_URL`: the public URL, used in payment-link share links.
   - `ORG_NAME`.
   - `CRON_SECRET`: any long random string.
   - `MEMBER_DEFAULT_PASSWORD`: the password new member logins start with. Use at least 8 characters, with letters and a number.
   - `SUPER_ADMIN_NAME`, `SUPER_ADMIN_EMAIL` and/or `SUPER_ADMIN_PHONE`, and `SUPER_ADMIN_PASSWORD` (mark it Sensitive): the first Super Admin.
3. **Deploy.** The build runs `vercel-build`, which applies pending migrations and creates the first Super Admin from the variables above before `next build`. If no Super Admin exists and the variables are missing, the build fails. `vercel.ts` schedules:
   - daily dues generation (`/api/cron/obligations`)
   - a weekly CSV backup of all payment records (`/api/cron/backup`)
   - daily cleanup of expired sessions and old rate-limit counters (`/api/cron/maintenance`)
4. **Sign in as the Super Admin** and choose a new password. You can then delete `SUPER_ADMIN_PASSWORD` from Vercel.
5. **Required: add Vercel Firewall (WAF) rate-limit rules.** For example, 20 requests a minute per IP on `POST /login`, and 10 a minute per IP on `POST /p/*`.
   - The app already limits sign-in failures and link submissions in the database, and BotID screens link submissions.
   - The WAF stops floods before they reach the app and the database.
6. **Check on a preview deployment** that payment-link submissions pass BotID under the Content-Security-Policy. BotID can't be exercised locally.

Choose a Vercel function region close to the Supabase region.

## Code map

```
src/domain/          Pure business rules: money (kobo), periods, recurrence, allocation, balances,
                     rates, year summary, payment-link availability, permissions. No framework imports.
src/lib/             Dates (Africa/Lagos), phone/email normalisation, env, Zod schemas shared by forms and services.
src/server/ports/    Interfaces: repositories, unit of work, file storage, document renderer.
src/server/infra/    Prisma repositories, Supabase/local storage, PDF renderer, CSV.
src/server/services/ Use cases (submission, confirmation, corrections, rates, links, reports, access…).
src/server/container.ts  The only place concrete classes are wired (composition root).
src/app/             Pages and thin server actions: validate → call a service → render.
prisma/              schema.prisma, migrations/, seed.ts
scripts/             bootstrap-super-admin.ts (+ tsconfig mapping `server-only` for the command line)
```

## Security

- **Sign-in:**
  - After 5 failed attempts, an account is locked for 15 minutes.
  - One IP address gets 50 failed attempts per 15 minutes across all accounts. The per-IP limits are generous because many mobile users share an IP.
  - Unknown accounts take as long to reject as real ones.
  - Redirects after sign-in are limited to paths on this site.
- **Public payment links:** each IP address can make 30 submissions per hour, and BotID screens them.
- **Passwords:**
  - Changing your password signs out every other session, and the current device gets a fresh session.
  - Wrong "current password" guesses are limited.
  - Passwords are capped at 72 bytes, bcrypt's limit.
- **Headers:** Content-Security-Policy, `frame-ancestors 'none'` and `X-Frame-Options: DENY` (no clickjacking), `Referrer-Policy: same-origin` (guest status tokens never leave the site), HSTS and Permissions-Policy. See `next.config.ts`.
- **Files:**
  - Proofs and receipts are served with a sandboxing CSP.
  - Only image proofs open in the browser; PDFs download.
  - A proof upload is deleted if its payment fails to save.
- **Rate-limit counters** live in the `RateLimitHit` table, so they hold across serverless instances. Client IPs come from Vercel's `x-real-ip` / `x-forwarded-for`, which can be spoofed if you self-host behind a proxy that doesn't overwrite them.

## Notes

- **Dev-only notices.** In development, `next dev` prints "uncached data during prerendering or a navigation" insights for signed-in and payment-link pages. This is expected: every signed-in page must check the session and fresh permissions on the server, so it can't be served from a prefetched shell. The production build is unaffected.
- **Money.** Amounts are stored as integer kobo. PDFs print "NGN" because the built-in PDF font has no ₦ symbol.
