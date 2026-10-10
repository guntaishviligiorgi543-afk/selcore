# Selcore OTP GitHub backup and Railway preparation

10 October 2026. Selcore only: repository `guntaishviligiorgi543-afk/selcore`, branch `main`, Supabase `ffznkypurnocabqyxpps`. No iVenue access, migrations, production Auth changes, enforcement activation, DNS changes, or production OTP service deployment.

## Inactive build and Railway root

Railway Root Directory: **`/server/otp`**. This directory contains `package.json`, matching npm lockfile, and every module needed by `serve.cjs`. Start command: **`npm start`**, which runs **`node serve.cjs`**. No build or migration script is needed. Pinned dependencies remain `@supabase/supabase-js` 2.110.7, Nodemailer 10.1.0, and pg 8.23.1. Node >=22 is required; local validation uses Node 24. `npm ci --prefix server/otp --ignore-scripts --no-fund --no-audit` successfully installed the locked dependencies.

Railpack detects the package and its start script. The listener preparation gives Railway's `PORT` priority over the local fallback and binds to `0.0.0.0` when `PORT` is supplied. Without it, the fallback is loopback. Invalid ports are rejected. [Railpack Node documentation](https://railpack.com/languages/node/).

**This build intentionally cannot run an OTP service.** `runtime.cjs` has a source-level `serviceEnabled = false` guard, executed before credential processing, database/API/email connections or creating a listener. Environment flags, including an attempted enable flag, cannot override it. `auth-gateway.js` also remains disabled, and the unexecuted migration defaults enforcement to false. A Railway build can install successfully, but startup must exit with a generic refusal and no credential values. A failed/crashed deployment is expected if auto-deploy attempts this inactive build; it does not establish production readiness.

Real child-process tests instrument DB, SMTP, Auth fetch, socket connections and server creation to abort on any attempted side effect. The entry point refuses startup with no secrets, just Railway `PORT`, and complete synthetic credentials plus attempted environment activation. No real credentials were created or injected.

## Automatic deployment safety

Railway CLI/connector access is unavailable in this workspace; current Railway service settings and deployment results cannot be inspected here. No Railway deployment or settings command is executed. The normal package entry point is protected independently of unknown environment values. This makes the reviewed source safe to back up while leaving the service inactive.

Before any future activation or if you want to prevent even an automatic failed deployment, open **Selcore's Railway service → Settings → Source/GitHub integration → Disable automatic deployments**. Confirm the connected repository is Selcore and the root is `/server/otp`. Review the actual start command; it must be `npm start` or `node serve.cjs`. Keep all pre-deploy/migration commands empty, and do not create a public domain or change DNS for this inactive preparation. Arbitrary dashboard command overrides/pre-deploy actions cannot be attested without access; do not bypass the source guard. [Railway autodeploy controls](https://docs.railway.com/deployments/github-autodeploys).

## Environment variable names for the future approved backend

No production credentials are needed or supplied for this inactive backup. After a separately approved cutover, configure secrets through a server secret manager/Railway Variables, never Git, logs, reports or frontend files. The following are names only:

```text
PORT
SELCORE_PRIVATE_SUPABASE_ORIGIN
SELCORE_PRIVATE_PUBLISHABLE_KEY
SELCORE_PRIVATE_ADMIN_KEY
SELCORE_OTP_DATABASE_URL
SELCORE_OTP_HMAC_KEY
SELCORE_OTP_ENCRYPTION_KEY
SELCORE_SMTP_USER
SELCORE_SMTP_PASSWORD
SELCORE_SMTP_FROM
SELCORE_SMTP_PORT
SELCORE_GATEWAY_ORIGIN
SELCORE_GATEWAY_PORT
SELCORE_LOCAL_HTTP
```

Railway supplies `PORT`. `SELCORE_GATEWAY_PORT` is the local fallback; `SELCORE_LOCAL_HTTP` is limited to isolated local testing. There is deliberately **no environment variable that can activate this build**. The vetted `.env.example` has empty secret values and provider/local defaults only. `.env`/`.env.*` remain ignored except examples; `.env.sample` is now ignored, along with backend private key and secrets-directory artifacts. Ignoring a file never removes already tracked data, so the actual candidate/index content is scanned separately before committing.

## Review scope and tests

The backup contains the existing inactive OTP source, necessary disabled frontend integration, migration **draft**, documentation and relevant tests. Existing product data, images, official SDK and `.prettierignore` remain unchanged. Already tracked regression reports are included as verification evidence; no new generated reports, installed dependencies, machine state or credentials are included.

All **1,021 checks passed**: 24 actual startup checks, 91 OTP security checks, 25 SDK/frontend adapter checks, 667 browser regressions, 53 existing Auth integrations, 94 isolated deployed-profile RLS checks and 67 preview checks. All **18** changed JS/CommonJS files passed syntax validation; `prettier --check .` and `git diff --check` passed. Backend dependency audit found **zero vulnerabilities**. The credential-pattern scan reviewed all 658 tracked files plus candidates and found no administrative credentials; six credential/dependency ignore checks passed. Auth/SMTP remain mocked; Postgres/RLS are tested in isolated PGlite; browser catalogue/image preflight confirmed 24 products and 24 original public image downloads using read-only requests. No production users or emails were created.

The read-only Selcore Security Advisor returned no critical findings and one existing warning: leaked-password protection is disabled. It was not changed. [Remediation reference](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

Candidate files, reviewed individually:

```text
.gitignore
account.css
account.js
allproducts.html
auth-gateway.js
auth-service.js
cart.html
checkout.html
contact.html
docs/email-otp-implementation.md
docs/otp-railway-preparation.md
docs/phase4-browser-results.json
docs/phase43-auth-results.json
docs/phase43-sql-results.json
index.html
otp-ui.js
product.html
server/otp/.env.example
server/otp/crypto.cjs
server/otp/gateway.cjs
server/otp/http.cjs
server/otp/mail.cjs
server/otp/native.cjs
server/otp/package-lock.json
server/otp/package.json
server/otp/runtime.cjs
server/otp/serve.cjs
server/otp/store.cjs
supabase-client.js
supabase/migrations/20261010110437_selcore_email_otp_security.sql
tests/otp-adapters.test.cjs
tests/otp-security.test.cjs
tests/otp-startup.test.cjs
tests/phase0.test.js
tests/preview-server.test.cjs
user.html
```

## Remaining activation blockers

Private/server-controlled Auth ingress and compatible account/session/issuer migration; reconciliation of the historical profiles migration; reviewed deployment of the OTP draft to isolated staging; dedicated least-privileged DB credentials; real native OTP/Resend configuration and delivery tests; same-origin API hosting; Google OAuth and existing recovery-link callback compatibility; trusted proxy/IP quota handling; full PostgreSQL multi-connection race tests, retention and key rotation. See [the detailed implementation/cutover plan](email-otp-implementation.md).

Committing a SQL file does not apply it. There is no Supabase deployment command in backend package scripts. GitHub backup and a successful package build do not approve or establish production activation/readiness.
