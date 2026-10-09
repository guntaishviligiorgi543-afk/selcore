# Selcore Phase 4.3 — authentication integration testing

Date: 9 October 2026. Project: **ffznkypurnocabqyxpps** only.

The local implementation is ready for controlled email/password integration testing once the redirect/SMTP configuration is reviewed and test registrations/emails are approved. **Real production registration, email delivery, customer-session profile access and Google consent remain unverified.** Google is currently disabled. This report does not claim complete production authentication validation.

## 1. Migration history

| Version                                               | Local                                       | Remote                                                      |
| ----------------------------------------------------- | ------------------------------------------- | ----------------------------------------------------------- |
| `20261008124517_create_selcore_catalog_phase1`        | Present                                     | Applied; SQL matches local after line-ending normalization. |
| `20261008125807_create_product_images_storage_bucket` | Present                                     | Applied; SQL matches local after line-ending normalization. |
| `20261008000000_selcore_customer_profiles`            | Old review draft                            | Not applied under this version.                             |
| `20261009140454_selcore_customer_profiles`            | Missing from the active migration directory | Applied in production.                                      |

The old profiles draft and deployed profiles SQL differ only in comments and blank lines. Their remaining lines match exactly. There is no executable-schema drift identified in this comparison; the profiles migration timestamp/history identity differs.

Safe reconciliation recommendation, **not performed**: after reviewing the captured deployed SQL, archive the older draft outside `supabase/migrations/`, then recover the exact already-applied SQL locally as `20261009140454_selcore_customer_profiles.sql`. Compare the resulting local history with remote history before any future deployment. Production history is already valid and needs no `migration repair`. Do not run the older draft, rerun applied migrations, or use `--include-all` to bypass this mismatch.

The read-only production snapshot is [phase43-production-profiles.sql](phase43-production-profiles.sql), deliberately outside the active migration directory. Its exact SQL was executed only in fresh in-memory PostgreSQL for isolated tests. No migration was applied or rerun on Supabase. Earlier Phase 4.1 deployment instructions are historical and are superseded by the deployed version above.

## 2. Tests passed and failed

| Check                                   | Passed | Failed | Evidence and boundary                                                                                                                                        |
| --------------------------------------- | -----: | -----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Complete frontend/browser regression    |    612 |      0 | Real Edge and app UI; Auth/profile fixtures; production Auth blocked. Live read-only catalogue/images preflight.                                             |
| Pinned SDK authentication suite         |     51 |      0 | Real `@supabase/supabase-js` 2.110.7 and app service; in-memory simulated Auth/REST HTTP responses. No production Auth, email or Google consent.             |
| Deployed SQL/role/RLS suite             |     94 |      0 | Exact production SQL snapshot, real in-memory PostgreSQL 18.3 through PGlite 0.5.8, minimal Auth fixtures. Production PostgreSQL is 17.11; no remote writes. |
| Security/history evidence assertions    |     56 |      0 | Assertions on captured production metadata, real anonymous REST denial and local source/integrity checks. No real authenticated customer token.              |
| Preview server regression               |     61 |      0 | Seven pages, 21 local assets, stylesheet loading, private-path denial, HTTP methods and headers.                                                             |
| Prettier, JavaScript syntax, whitespace | Passed |      0 | Existing generated SDK exclusions retained.                                                                                                                  |

Before the fixes, the new SDK suite passed 45 checks and failed two: stale validation-error cleanup and recovery-form persistence. Both failures were reproduced locally and resolved. Four additional message/recovery-marker checks were added to the final suite. See [before results](phase43-auth-before-results.json) and [final SDK results](phase43-auth-results.json).

The first SDK fixture attempt did not simulate Supabase's API-version response header, preventing SDK error-code decoding. The fixture was corrected before identifying application failures; this was a test-harness issue, not a production defect. A Windows command-length limit affected an initial evidence-saving command; the snapshots were subsequently saved through file edits without executing SQL.

## 3. Authentication coverage

| Flow            | Verified locally                                                                                                                                                                                                   | Production evidence / remaining boundary                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Registration    | Name/email/password validation; matching passwords; terms; duplicate-submit guard; loading states; normalized `full_name`; SDK PKCE challenge and redirect; safe success/errors.                                   | Email signup enabled and confirmation required. Trigger exists and is enabled. Real signup/trigger invocation through GoTrue is pending. |
| Duplicate email | Both error-code and obfuscated-user responses produce the same generic guidance.                                                                                                                                   | No duplicate production registration was sent.                                                                                           |
| Verification    | PKCE code exchange establishes a verified session; code/error parameters scrubbed; invalid/expired links fail safely; signup resend and cooldown work.                                                             | Real email delivery, link destination and expiry/reuse tests pending.                                                                    |
| Login/logout    | Valid/incorrect credentials, unverified-email rejection, refresh restoration, protected account view, navigation updates and local logout cleanup.                                                                 | Real password/session endpoints were not called.                                                                                         |
| Profile         | Verified UUID query; correct name; only `full_name` updated; saved name survives a new app/SDK page instance in the HTTP fixture; stale/foreign responses fail safely; retry and missing-profile recovery.         | Deployed columns/grants/policies inspected. Actual owner/foreign/unverified customer access through PostgREST pending.                   |
| Recovery        | Correct reset request, local redirect and PKCE; callback shows password form; form survives refresh; password update clears recovery context; old password rejected and new password accepted in the HTTP fixture. | No recovery email or real password change occurred.                                                                                      |
| Google          | Disabled-provider guidance; SDK provider/redirect/PKCE URL generation; mock callback creates app session.                                                                                                          | Production public settings report `external.google = false`; real consent and account creation pending configuration.                    |

Mock profile ownership behavior is not evidence of production RLS enforcement. The separate SQL suite tests actual PostgreSQL roles and the deployed policy SQL, but its Auth users are isolated fixtures, not real GoTrue users.

## 4. Bugs fixed locally

1. **Obsolete status messages:** a successful validation retry left the previous failure visible. A subsequent login could also retain the signed-out notice, and a password update could retain recovery instructions. `auth-service.js` now clears obsolete notices after successful retry/login/password update.
2. **Recovery lost on refresh:** the callback code was correctly scrubbed from the URL, but recovery mode existed only in memory. Refresh restored the customer session and displayed the dashboard instead of the reset form. Recovery context now uses a tab-local `sessionStorage` marker containing only the customer's UUID. The marker is restored only after server `getUser()` validation confirms the same verified, non-anonymous customer. It is removed for guests, a mismatched owner, login, logout and successful password update. It is a UI marker and cannot authenticate a user or grant profile access. Storage unavailability falls back safely to the current page's recovery flow.

No product, cart/favorites, checkout, brand-color, spacing, HTML or CSS change was made in this phase. Existing components display the corrected states.

## 5. Real read-only production findings

- Profiles RLS is enabled; the table is owned by `postgres` and has the expected five columns and Auth UUID foreign key with cascade deletion.
- Exactly three profile policies exist: authenticated SELECT, INSERT and UPDATE. Each requires the current UUID and server-side verified-customer predicate; UPDATE has both ownership `USING` and `WITH CHECK`.
- Anonymous users have no profile table privileges. Authenticated users have SELECT plus INSERT on `id/full_name/avatar_url` and UPDATE on `full_name/avatar_url`; they cannot modify IDs/timestamps or delete/truncate profiles.
- Verification reads `auth.users.email_confirmed_at` and rejects Supabase anonymous users. User-editable metadata is display text, not authorization.
- Private helpers have empty search paths and the expected owners/execute restrictions. The signup and timestamp triggers are enabled. Security Advisor reports **zero findings**.
- GET `/rest/v1/profiles?select=id&limit=1` using only the frontend publishable key returned **HTTP 401 / SQLSTATE 42501**. No private rows were exposed.
- At inspection there were **0 Auth users and 0 profiles**, with no missing/orphan rows. This confirms schema presence but does not prove a real signup creates a profile or that a real owner can update it.
- All 13 inspected public/Storage base tables have RLS. Catalogue customer grants remain read-only and Storage has no customer write policies. No table, policy or Storage object was changed.
- Live catalogue preflight verified **24 products, 4 categories, 17 brands**, original IDs/prices/specifications and demo restrictions. All **24 public images** matched original bytes.
- A targeted scan of **20 root frontend HTML/JavaScript files** found no administrative credential patterns or service-role JWTs. This is a source-pattern check, not a scan of personal credential stores. App logging was reviewed; no password/session/recovery-token logging was added.
- Official SDK version **2.110.7** and bundle SHA-256 remain unchanged: `2697f51bb3efa5f10b5b0bca2a39b3772b1b8f810e6885e3bb8d69c3242d5e07`.

Evidence: [production audit](phase43-production-audit.json), [permissions](phase43-security-checks.json), [public API checks](phase43-public-checks.json), [security assertions](phase43-security-results.json), [isolated SQL results](phase43-sql-results.json) and [browser results](phase4-browser-results.json).

## 6. Production configuration requirements

Public Auth settings confirm email signup is enabled, signup is not disabled, email auto-confirm is false, and Google is disabled. Production settings were not changed. The private redirect allowlist, email templates and SMTP configuration were not available from the public settings endpoint and were not asserted as correct.

For current local development, review the Selcore [Auth URL configuration](https://supabase.com/dashboard/project/ffznkypurnocabqyxpps/auth/url-configuration): use one canonical development origin, such as `http://127.0.0.1:8080`, and permit the exact callback `http://127.0.0.1:8080/user.html`. If using `localhost` instead, also review `http://localhost:8080/user.html`. The app calculates the callback from its actual origin; it requires HTTPS except for loopback development. Supabase must accept that destination. Review confirmation/recovery templates so they retain the standard confirmation URL and requested redirect. [Redirect documentation](https://supabase.com/docs/guides/auth/redirect-urls).

Review SMTP sender/provider readiness and permission to send to the intended test recipients. Default SMTP restrictions must not be assumed to support arbitrary customer addresses; use a suitable configured sender for wider testing. No email was sent to establish deliverability. [SMTP documentation](https://supabase.com/docs/guides/auth/auth-smtp).

Google requires the following external configuration, **only after approval**:

1. Configure the Google consent screen and intended test users, then create a Web application OAuth client.
2. Add the chosen development origin, such as `http://localhost:8080`, to authorized JavaScript origins. The authorized redirect URI for this hosted Supabase project is **`https://ffznkypurnocabqyxpps.supabase.co/auth/v1/callback`**. Selcore's `user.html` is the app destination after Supabase completes the provider callback.
3. Configure the Client ID and Client Secret securely in Selcore's [Google provider settings](https://supabase.com/dashboard/project/ffznkypurnocabqyxpps/auth/providers), and enable Google. Do not add the client secret to frontend code or reports.
4. Keep the app callback in Supabase's redirect allowlist and test the resulting `?code=` callback/session with an approved Google test user. [Official Google integration guide](https://supabase.com/docs/guides/auth/social-login/auth-google).

The app uses PKCE. Start and finish confirmation/recovery in the same browser/device. In this app, storage also binds the verifier to the same origin/port, so switching between `localhost` and `127.0.0.1` loses that verifier. A later PKCE request can replace an earlier verifier; use the newest link. [PKCE documentation](https://supabase.com/docs/guides/auth/sessions/pkce-flow). No experimental SDK option or version change was introduced.

## 7. Remaining manual production tests

These require separate approval to create test users and send real emails. Use two controlled test identities and the Selcore project only; never place passwords, access/recovery tokens or full confirmation links in logs/reports.

1. Register the first user; inspect profile existence privately; confirm full-name normalization, generic duplicate handling and one signup request under repeated submission.
2. Confirm the actual email arrives and redirects to the configured local account page. Test unverified login/profile denial, resend cooldown, expired/reused/invalid links, then verify successful confirmation.
3. Test valid/invalid login, refresh persistence, protected dashboard/navigation, logout and official session cleanup.
4. Edit the profile and refresh. Using real server-issued customer tokens, verify own SELECT/UPDATE success, foreign SELECT/UPDATE rejection, denied foreign INSERT/ID/timestamp changes and guest/unverified denial. The isolated SQL results do not substitute for these checks.
5. Request recovery, follow its real email in the originating browser/origin, refresh the reset form, change the password, sign out and sign in with the new password. Check that the old password fails.
6. After Google configuration is approved and completed, test consent, cancellation, callback/session creation and profile creation for a controlled Google account.
7. Confirm guest/account cart and favorites remain separate, product search/filtering/details work, all images display, checkout remains disabled and responsive layouts remain unchanged.

## 8. Files changed

- `auth-service.js`: the two local authentication corrections.
- `tests/phase0.test.js`: browser regressions for recovery refresh and status-message cleanup.
- `tests/phase43-auth.test.cjs`: real pinned SDK with isolated HTTP integration fixtures.
- `tests/phase43-security.test.cjs`: captured production evidence and targeted frontend integrity checks.
- `tests/profile-audit/run.cjs`: optional `--deployed-snapshot` input and separate Phase 4.3 results; still an in-memory runner.
- `.prettierignore`: precise generated Phase 4.3 JSON exclusions; existing vendor/SDK exclusions preserved.
- `docs/phase4-browser-results.json`: regenerated complete browser results.
- `docs/phase43-production-audit.json`, `phase43-production-profiles.sql`, `phase43-security-checks.json`, `phase43-public-checks.json`: read-only production evidence.
- `docs/phase43-auth-before-results.json`, `phase43-auth-results.json`, `phase43-security-results.json`, `phase43-sql-results.json`: test evidence.
- `docs/phase43-auth-integration.md`: this report.

Reproduce local checks after capturing the documented production evidence:

```powershell
node tests/phase43-auth.test.cjs
node tests/phase43-security.test.cjs
node tests/profile-audit/run.cjs --deployed-snapshot
node tests/phase0.test.js
node tests/preview-server.test.cjs
npx.cmd prettier --check .
```

The first three are offline. The frontend suite performs a read-only live catalogue/image preflight while blocking production Auth operations.

No database migration, production history repair, Auth setting change, production account creation, real email, profile/product/Storage write, commit, push or frontend deployment occurred. **iVenue was never accessed or modified.**

**Readiness: local fixes and automated checks pass. Controlled email/password production testing is conditionally ready after configuration review and explicit test-user/email approval. Google testing awaits external configuration. Production end-to-end authentication is not yet fully verified.**
