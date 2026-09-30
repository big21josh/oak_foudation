# OAK Foundation Event Platform

A role-based event management platform built for the **OAK Foundation Partner Convening 2026**.

**Event:** 9–11 November 2026
**Location:** Harare, Zimbabwe
**Stack:** Next.js, TypeScript, Tailwind CSS, Supabase

The platform supports participant registration, role-based access, QR-code check-in, programme information, partner directory management, attendance tracking, and private session notes.

---

## Features

* Participant registration with role selection
* Five supported participant roles
* Role-based navigation and protected pages
* Partner QR-code generation
* Partner confirmation emails with QR-code attachments
* QR-code check-in with duplicate-scan protection
* Programme schedule and session details
* Partner directory and partner profiles
* Coordination Team attendance dashboard
* Attendance statistics and participant filtering
* Private session notes with owner-based editing
* Supabase database integration
* Local demo mode with synthetic data
* Server-side access protection for restricted routes and APIs

---

## Tech Stack

* **Next.js**
* **TypeScript**
* **Tailwind CSS**
* **Supabase**
* **Resend** — optional Partner confirmation emails
* **QRCode** — QR-code generation
* **Zod** — form validation

---

# Getting Started

## Requirements

Use:

* Node.js **22 or newer**
* npm

## Install dependencies

From the project folder:

```sh
npm install
```

## Run the production build locally

```sh
npm run build
npm start
```

Then open:

```text
http://127.0.0.1:3000
```

---

# Local Demo Mode

The application can run without Supabase configuration.

When Supabase environment variables are not configured:

* Synthetic data is stored in `.data/demo.json`
* The application only allows localhost access
* Registration can be used to test different roles
* Use a different email address when testing another role

This makes it possible to test the application locally without connecting it to a production database.

---

# User Roles

The application supports five roles:

1. Partner
2. OAK Staff
3. Presenter
4. Observer
5. Coordination Team

Selecting a role during registration grants that role for the test participant.

A **30-day HttpOnly registration session** remembers the current registration in the browser.

The session token is separate from the Partner QR-code.

> Existing registrations created before the current session system was introduced do not automatically create a session. Previously registered users may require administrator-assisted migration or a new test email.

---

# Access Matrix

The application's navigation and protected routes follow the final access matrix.

| Role              | Landing Page | Available Pages                                         |
| ----------------- | ------------ | ------------------------------------------------------- |
| Partner           | `/qr-code`   | Registration, My QR Code, Partners                      |
| OAK Staff         | `/programme` | Registration, Programme, Partners                       |
| Presenter         | `/programme` | Registration, Programme, Partners                       |
| Observer          | `/programme` | Registration, Programme, Partners                       |
| Coordination Team | `/check-in`  | Registration, Check-in, Programme, Partners, Attendance |

### Main Routes

| Page                 | Route         |
| -------------------- | ------------- |
| Registration         | `/register`   |
| My QR Code           | `/qr-code`    |
| Check-in             | `/check-in`   |
| Programme            | `/programme`  |
| Partners             | `/partners`   |
| Attendance Dashboard | `/attendance` |
| Staff Login          | `/staff`      |

Restricted pages and API routes also verify the user's role on the server.

---

# Supabase Setup

To connect the application to Supabase:

## 1. Create a Supabase project

Create a new project from your Supabase dashboard.

## 2. Run the database migrations

Open the **SQL Editor** in Supabase and run:

```text
supabase/migrations/001_event_portal.sql
supabase/migrations/002_requirements.sql
```

For a new installation, run both migrations in order.

If migration `001_event_portal.sql` has already been applied, only run:

```text
supabase/migrations/002_requirements.sql
```

Then run the seed file if you need the supplied sample programme and partner content:

```text
supabase/seed.sql
```

## 3. Configure environment variables

Copy:

```text
.env.example
```

to:

```text
.env.local
```

Place `.env.local` in the project root, next to `package.json`.

Add your Supabase configuration:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=YOUR_SERVER_SECRET_KEY
RESEND_API_KEY=
EMAIL_FROM=
STAFF_ACCESS_CODE=
```

### Environment variable security

`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` are safe to use in the browser.

`SUPABASE_SECRET_KEY` is **server-only**.

Never:

* Add `NEXT_PUBLIC_` to server secrets
* Commit `.env.local` to Git
* Share server keys publicly
* Paste server secrets into chat or source files

Restart the development server after changing environment variables.

---

# Coordination Team Login

The application also supports a returning Coordination Team login through Supabase Auth.

Create an Auth user in Supabase and add the user's UUID to the `public.staff` table:

```sql
insert into public.staff(user_id)
values ('AUTH_USER_UUID');
```

Then open:

```text
/staff
```

### Important

In this application:

* **Coordination Team** is a participant registration role.
* `public.staff` controls returning staff/coordinator authentication.

The two systems are separate.

Normal participant registration does not require a Supabase Auth account.

---

# Partner Confirmation Emails

Partner registrations can receive an email containing their registration details and QR-code PNG.

The email system uses **Resend**.

## Configure Resend

Create a Resend account, verify your sending domain, and add:

```dotenv
RESEND_API_KEY=YOUR_RESEND_API_KEY
EMAIL_FROM=OAK Events <events@yourdomain.org>
```

Both values are server-side configuration.

### Email behavior

Confirmation emails are sent **only to Partners**.

Other roles do not receive confirmation emails through this workflow.

If Resend is not configured, registration still succeeds. The participant can use the QR-code page to download their pass.

If email delivery fails, the registration is not deleted. The QR-code page provides the participant with the download option.

Live email delivery requires valid Resend credentials and a verified sending domain.

---

# Event Resources

Event resources are stored in a private Supabase Storage bucket:

```text
event-resources
```

Upload event resources to this bucket and add the corresponding storage path to the `resources` table.

Resource downloads are generated as signed URLs by the server after checking the user's programme access.

---

# Programme and Partner Content

The supplied reference material contains:

* The complete Day 1 programme
* Eight partner profiles

Some Day 2 and Day 3 information is still illustrative.

Some partner descriptions, logos, contact information, and event resources were not included in the original reference material.

Before production launch:

* Replace illustrative programme content
* Replace placeholder partner information
* Add official partner logos
* Add verified contact details
* Upload final event resources
* Replace low-resolution gallery crops where necessary

---

# Important Access Rule

The reference PDF contains a difference between the Partner Directory page and the final access matrix.

The reference material permits Partners to appear in the directory, while the final access matrix excludes the Partners role from the directory.

This implementation follows the **final access matrix**.

Therefore:

```text
Partner → Registration + My QR Code
```

and does not provide the Partner with the `/partners` page.

---

# QR Code and Check-in

Partners receive a unique QR-code generated from their registration.

The QR-code is separate from the browser session token.

The check-in system supports:

* Partner QR scanning
* Idempotent check-in
* Original check-in timestamp preservation
* Duplicate-scan protection

Scanning the same participant more than once does not overwrite the original check-in timestamp.

---

# Attendance Dashboard

The Attendance Dashboard is restricted to the Coordination Team.

Route:

```text
/attendance
```

It provides:

* Total registered participants
* Attendance counts
* Attendance rate
* Role breakdown
* Participant details
* Name search
* Organisation search
* Role filtering
* Attendance-status filtering
* Refresh
* Polling for updated information

---

# Session Notes

Programme sessions can contain private notes.

Notes are protected by:

* Authentication
* Programme access
* Ownership checks

Users can edit notes they are permitted to manage.

---

# Testing

Run the automated test suite:

```sh
npm test
```

Run the production build:

```sh
npm run build
```

Run the local smoke tests:

```sh
npm run test:smoke
```

The smoke tests run against the local demo environment.

They create synthetic registrations and private session notes for testing.

---

# Recommended Verification Flow

After installing the project, verify the following:

### 1. Build

```sh
npm run build
```

### 2. Start

```sh
npm start
```

### 3. Register as Partner

Use a test email and select:

```text
Partner
```

Verify:

* Registration succeeds
* Partner is redirected to `/qr-code`
* QR-code is displayed
* QR-code can be downloaded
* Partner cannot access restricted Coordination Team pages

### 4. Register another role

Use a different email and test:

```text
OAK Staff
Presenter
Observer
Coordination Team
```

Verify that each role receives the correct access.

### 5. Test Coordination Team

Verify:

* `/check-in`
* `/programme`
* `/partners`
* `/attendance`

### 6. Test check-in

Scan a valid Partner QR-code and verify that:

* The participant is marked as checked in
* The timestamp is recorded
* Scanning again does not replace the original timestamp

### 7. Test email

If Resend is configured, register a Partner and verify that the confirmation email contains:

* Registration information
* QR-code attachment

---

# Deployment

This application requires a **Next.js server environment**.

It is **not a static-export application**.

Before deployment, configure:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
RESEND_API_KEY=
EMAIL_FROM=
STAFF_ACCESS_CODE=
```

The production environment should use:

* HTTPS
* Production Supabase credentials
* Production database migrations
* A verified Resend sending domain
* Secure server-side environment variables

The source repository does not provision:

* A Supabase project
* A Resend account
* A production server
* A public deployment
* Production event content

These must be configured separately.

---

# Project Status

The platform includes the core event workflows required for the OAK Foundation Partner Convening.

Before production launch, the supplied reference content should be reviewed and replaced with the final event information, including the complete programme, verified partner information, official logos, final resources, and production email configuration.

**Event:** OAK Foundation Partner Convening 2026
**Dates:** 9–11 November 2026
**Location:** Harare, Zimbabwe
