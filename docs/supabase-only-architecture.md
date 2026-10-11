# Selcore Supabase-only architecture and cleanup audit

> Policy revision: [current authentication requirements](authentication-requirements.md) supersede mandatory OTP before every password change. Normal changes now require native current-password verification; recovery still requires eight-digit OTP. Findings below retain their historical audit context.


Decision recorded 11 October 2026. This document supersedes all earlier private Auth, Railway and custom gateway proposals. No production settings/data changes, deployments, cloud deletion, commits or pushes were performed. iVenue was not accessed.

## Architecture

GitHub Pages serves static HTML/CSS/JS and the pinned Supabase JS 2.110.7 browser SDK. The browser talks directly to hosted Selcore Supabase (`ffznkypurnocabqyxpps`) using its public publishable key. Supabase Auth owns users, passwords, sessions and native email proof generation/verification. Supabase Database and RLS authorize application data; Storage serves product images. Resend SMTP is the intended delivery transport configured inside Supabase, never in browser code. Additional application policies belong in reviewed Supabase Edge Functions and private database state/RLS. No Edge Functions were added or deployed by this cleanup.

Current implementation uses password signup/login and PKCE email links. It is preserved, with the disabled gateway selection removed. Supabase eight-digit OTP is the target, not a completed production configuration change.

| Flow | Active implementation | Status |
| --- | --- | --- |
| Signup | `auth.signUp`, settings check requiring confirmation, full-name metadata for display | Supabase; refuses autoconfirmed registrations |
| Login | `auth.signInWithPassword`, then server-verified `auth.getUser` | Supabase; rejects unconfirmed/anonymous/invalid-ID users |
| Verification/resend | `auth.resend({type:'signup'})`, PKCE `exchangeCodeForSession` | Supabase verification links; native OTP entry not connected |
| Recovery | `resetPasswordForEmail`, PKCE recovery callback, `updateUser` | Supabase; same-browser link flow preserved |
| Password change | `auth.updateUser({password})` | Supabase; no mandatory per-change email OTP gate |
| Email change | Hidden inactive form | No active customer email-change flow |
| Google | Existing Supabase OAuth method checks provider settings | Existing integration retained; captured settings show disabled |
| Profiles | Supabase Data API, ownership filters, verified-customer RLS | Retained; metadata name is display data, not authorization |

Recovery sessionStorage flags, UI cooldowns and browser checks are presentation controls. Server Auth and RLS remain the authorization boundary. PKCE callbacks reject raw fragment tokens/token-hash callbacks and remove callback parameters from browser history. Persistent browser sessions retain the existing XSS risk; protect static assets and avoid privileged keys in clients.

## Audit and safe cleanup plan executed

The repository was scanned including hidden files, excluding Git internals and installed package contents. Browser SDK bytes were integrity-checked; installed package manifests were inspected. Active pages loaded the disabled gateway adapter, but `enabled=false`; the Auth service used the hosted Supabase branch. Gateway server startup was also guarded off. No active application import depended on `server/otp`.

Removed 48 source/config/test files, individually listed in [cleanup manifest](supabase-cleanup-manifest.json): the entire `server/otp` implementation, private GoTrue SQL drafts and adapters, Dockerfiles/Compose harnesses, Railway/railpack configuration, gateway package/lockfile, nine gateway-only test suites and `auth-gateway.js`. Its installed `node_modules` directory was removed with the server tree. Removed gateway script tags from seven pages and both disabled account UI branches; Supabase session persistence/refresh are explicitly enabled.

Removed server dependencies: `nodemailer` 10.1.0 and `pg` 8.23.1, plus the gateway-only installation of `@supabase/supabase-js` 2.110.7. The active browser SDK and migration/audit tooling installations remain.

Before deletion, source files (including pre-existing uncommitted work) and edited frontend files were copied to `.local-recovery/supabase-only-20261011/`, ignored by Git. This is a recovery copy, not executable application code. It excludes installed packages. Do not publish the recovery directory.

Retained all four `supabase/migrations` files byte-for-byte (SHA-256 baselines in the manifest), every product/image asset, catalogue/cart/favorites/checkout behavior, active Auth/profile service, Supabase client and vendor SDK, local restricted preview, migration/phase2 tooling, profile/RLS tests, captured production evidence and historical documentation. Retained `otp-ui.js`, OTP styles and the hidden OTP panel as a provider-neutral eight-digit input component; it has no active authentication binding. Its browser callback tests remain. The inactive email-change form remains hidden.

Historical private-auth documents are labeled superseded. Credential ignore rules remain to avoid accidentally exposing recovered or future secrets. No cloud Railway resource was queried or deleted.

**Migration caution:** `20261010110437_selcore_email_otp_security.sql` is a historical unapplied custom gateway draft, default-disabled. It is preserved under the explicit migration-preservation requirement. Do not apply it automatically: its account-wide login timestamp is not per-device trust. The older profiles draft also differs in migration version from the deployed snapshot; do not blindly run `db push`. Reconcile history in an isolated environment before any later migration deployment. No existing RLS policy was modified.

## Required configuration changes (not applied)

Inspect owner-visible hosted Auth configuration for email OTP length 8, confirmation enabled, suitable expiry/resend/rate limits, CAPTCHA, secure email change, password security and enabled providers. Configure Resend SMTP with verified sender/domain, SPF/DKIM/DMARC and protected credentials inside Supabase. Use native `{{ .Token }}` templates for each intended OTP flow and retain working links during transition. Verify GitHub Pages Site URL and exact `user.html` redirect allowlist, including the repository path; permit localhost only for development.

There is no local Supabase `config.toml` or SMTP implementation proving these hosted settings. Historical snapshots do not prove current SMTP or eight-digit configuration. Public `/auth/v1/settings` does not disclose those private settings. No real signup/login/email/recovery mutations were made to production. Full delivery verification requires an isolated Supabase project and synthetic inboxes.

Wire the retained input component to native `auth.verifyOtp` with the correct purpose (signup/recovery/email-change/email), email and eight-digit token. Native sends remain Supabase `signUp`, `resend`, `resetPasswordForEmail` or `signInWithOtp` as appropriate; avoid unintentionally creating users on login (`shouldCreateUser:false`). Do not activate code-only templates before the matching frontend exists. Keep native PKCE links functional during rollout.

## Security controls and replacements

The removed gateway never enforced security on the active hosted flow. Its intended controls still need explicit replacements; their passing tests do not establish production enforcement.

| Requirement | Replacement / remaining enforcement |
| --- | --- |
| Eight-digit issuance, expiry, one-time verification | Native Supabase Auth configuration and verification; confirm rate/attempt behavior in isolated tests |
| Signup email ownership | Native confirmation setting plus verified-user RLS; already preserved |
| OTP at first login / after trust expires | Edge Function verifies native proof and records server-owned approval; restrictive RLS gates protected data on valid user/session approval, including alternate login routes |
| 48-hour per-device trust | Private server-owned records keyed to user plus possession of an unguessable device proof; server-clock expiry, hashed identifiers, atomic updates; refresh must not extend trust |
| Trust revocation | Server-side revocation on recovery, credential changes, global logout and compromise; validate live session and approval, including stale access JWTs |
| OTP before sensitive application actions | Edge Functions plus action-bound, short-lived, one-use approval consumed atomically in database; deny equivalent direct Data API paths with RLS/grants |
| Abuse/replay protection | Native Auth rate limits/CAPTCHA plus Edge/database quotas, concurrency controls, audit trails and retention; frontend cooldowns alone are insufficient |
| Service credential isolation | Edge secrets only; public key in frontend; never service-role tokens or SMTP credentials |

**Critical boundary:** application RLS gates data access, not Supabase Auth's public password/email mutation endpoints. An Edge Function wrapper alone does not prevent a customer from calling `/auth/v1/user` directly. Native secure password change considers sessions created within 24 hours recent, so it does not guarantee a fresh email OTP before every password change. Do not claim universal enforcement until a supported hosted Auth control is demonstrated across all routes. The same review must cover recovery, OTP/passwordless, OAuth and email change. Native email OTP does not automatically provide MFA/AAL2 or action/device binding; do not authorize with user-editable metadata or browser timestamps.

Sources checked: [native email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless), [password Auth](https://supabase.com/docs/guides/auth/passwords), [password security](https://supabase.com/docs/guides/auth/password-security), [Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks). The changelog markdown fetch failed with unsupported content type; no Supabase API feature was changed in this cleanup.

## Validation and next steps

See the final test report in this directory. Auth fixtures exercise the real pinned SDK but mock Auth HTTP and SMTP; captured production metadata is historical. Isolated PostgreSQL tests verify profile/RLS behavior without touching production. Browser regression reads public catalogue/images and blocks real Auth requests.

Next: inspect hosted private settings read-only; build and test native OTP UI in an isolated Supabase project with Resend sandbox delivery; implement reviewed Edge/database approvals for protected application operations and per-device trust; resolve the direct Auth mutation enforcement boundary; test bypass/replay/concurrency/revocation across all enabled routes. Deploy or change production only in a separately authorized task.
