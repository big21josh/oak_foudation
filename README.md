# OAK Foundation event platform

Next.js, TypeScript, Tailwind CSS, Supabase. Event: 9–11 November 2026, Harare (location from the supplied image reference).

## Run locally

Use Node.js 22 or newer. In this folder run:

```sh
npm install
npm run build
npm start
```

Open http://127.0.0.1:3000. With no Supabase variables, synthetic data is stored in `.data/demo.json` and only localhost is allowed. Register to select your role and open its pages. Set SESSION_SECRET to a random value of at least 32 characters, including for local demos. Use a different email when testing another role.

## Where the pages are

The sidebar and mobile navigation follow the PDF's final access matrix:

| Role                           | After registration | Available pages                                         |
| ------------------------------ | ------------------ | ------------------------------------------------------- |
| Partner                        | `/qr-code`         | Registration, My QR Code, Partners                      |
| OAK Staff, Presenter, Observer | `/programme`       | Registration, Programme, Partners                       |
| Coordination Team              | `/check-in`        | Registration, Check-in, Programme, Partners, Attendance |

Programme is `/programme`, the directory is `/partners`, and the dashboard is `/attendance`. Restricted URLs also check the role on the server. Live Coordination Team access requires an approved staff account; selecting that role alone does not grant access. Local demos allow all five roles. A 30-day HttpOnly registration session remembers the current registration in that browser. The random session token is separate from the Partner QR code. New sessions store only a keyed hash and a 30-day expiry in the database; signing out revokes the stored session. Existing pre-update passes do not create a session; previously registered users need an administrator-assisted migration or a fresh test email.

The PDF's page 9 permits Partners in the directory, but its final matrix excludes them. The final matrix is the default used here.

## Connect your Supabase account

1. Use your existing Supabase project. The app detects either supported structure: the participants/auth_sessions/admins/checkins/session_notes schema, or the older registrations/notes/staff schema. Partners, sessions and resources are read from the matching project. A missing table triggers schema discovery; credential and network failures do not switch data sources.
2. For the existing participants schema, keep your current tables, the register_participant and take_rate_limit functions, and the UNIQUE(participant_id, check_in_date) check-in constraint. No replacement tables are needed. For a new installation using the older schema, run supabase/migrations/001_event_portal.sql, then 002_requirements.sql, then supabase/seed.sql. Do not apply those older migrations to the participants schema.
3. Copy `.env.example` to `.env.local`, in this folder next to `package.json`.
4. Fill in these values locally from your Supabase project settings:

```dotenv
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVER_SECRET_KEY
SUPABASE_SECRET_KEY=YOUR_SERVER_SECRET_KEY
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
DATABASE_URL=
SESSION_SECRET=YOUR_RANDOM_SECRET_AT_LEAST_32_CHARACTERS
```

Use the same project URL for both URL variables. `SUPABASE_SERVICE_ROLE_KEY` and `SUPABASE_SECRET_KEY` are server-only aliases: set either one, or use the same server secret for both. The service-role variable takes precedence when both are set. The URL and publishable key are browser-safe; never put a server secret in `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `DATABASE_URL` may remain blank: the app connects through the Supabase API. Set `SESSION_SECRET` to a random value of at least 32 characters (generate one with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`). It keys registration-session hashes; rotating it invalidates new-format participant sessions. Keep `.env.local` out of source control. Restart the app after changing these values, and rebuild before deploying changes to `NEXT_PUBLIC_` values.

5. Use `/staff` to sign in. With the participants schema, use your existing `admins` username and password; the server verifies its bcrypt password hash and stores a versioned session in `auth_sessions`. Passwords and privileged keys never go into browser code. With the older schema, use Supabase Auth and list the approved Auth user UUID in `public.staff`:

```sql
insert into public.staff(user_id) values ('AUTH_USER_UUID');
```

Other registration roles do not require staff approval. Existing self-selected Coordination Team registrations do not bypass staff authentication.

6. Use Supabase Table Editor to replace illustrative programme and partner content. Upload event resources to the private `event-resources` bucket and set the matching `resources.storage_path`. Downloads are signed by the server after checking programme access.

## Partner confirmation emails

Create a Resend account, verify your sending domain, and place its API key in `RESEND_API_KEY` and a verified sender such as `OAK Events <events@yourdomain.org>` in `EMAIL_FROM`. Both are server-only. The registration endpoint sends Partners their registration details and an attached QR PNG using the [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email). No email is sent for other roles. Without configuration or if sending fails, registration remains saved and the QR page tells the participant to download their pass. These two email variables are optional additions to the seven-variable environment template. Existing local email settings are preserved. Live delivery requires your account settings and has not been tested with credentials.

## Included workflows

- Five exact roles, role-aware navigation and protected pages/API routes.
- Required personal/contact fields; separate travel and accommodation requirements; consent.
- Partner-only QR display/download. The participants schema uses checkins with the existing unique participant/date constraint to preserve the first timestamp under concurrent scans. The older schema uses one conditional update on registrations.checked_in_at. Failed writes never report a successful check-in.
- Coordination-only attendance counts, rate, role breakdown, participant details, name/organisation search, role/status filters, refresh and polling.
- Programme schedule/details, private per-session notes with editing and owner checks.
- Partner directory/details, reference logo initials, website and available contact information.

## Reference content limits

The original boards provide only Day 1's full schedule and eight partner profiles. Day 2/3 details and missing profile descriptions remain illustrative. Official partner logos and some contacts were not supplied, so reference initials and available details are shown. Gallery crops are low resolution. Resource files themselves were not supplied. Replace these event assets before launch.

## Verification and deployment

```sh
npm test
npm run build
npm run test:smoke
```

To check the configured Supabase project directly, run `node --conditions=react-server --import tsx scripts/supabase-smoke.ts`. This creates synthetic registrations and notes, verifies concurrent check-in and session revocation, then removes those test records. On the participants schema it also creates and removes one temporary admin to verify staff authentication. It does not send emails. Set `SUPABASE_SMOKE_BASE_URL=http://127.0.0.1:3000` to include HTTP session and ownership checks against a running local app.

The smoke script runs only against the local demo and creates synthetic test registrations and private notes. Deploy to a Next.js server host with HTTPS and the environment values configured. This is not a static-export app. No external database, sender account, or public deployment is provisioned by these source files.

# oak_foudation
