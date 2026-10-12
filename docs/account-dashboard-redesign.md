# Selcore account dashboard — 12 October 2026

## Delivered

- `user.html`, `account.js`, `account.css`: centered dashboard with a 1000px maximum width, desktop sidebar, responsive mobile navigation, one visible section, active navigation and keyboard focus. Overview includes canonical email, registration date, saved name, shared-cart summary, quick actions and existing favorites. Profile Save remains native to the existing profiles implementation; Cancel restores the last saved name. Cart uses Selcore's existing store, quantities, canonical prices, totals and checkout links.
- `auth-service.js`: native `updateUser({email})`, `verifyOtp({email,token,type:'email_change'})`, and `resend({type:'email_change'})`. The UI derives confirmed email and pending `new_email` exclusively from the authenticated `getUser()` result. A successful first confirmation without a returned session remains pending. Recipient-specific codes, invalid/expired codes, replay errors and a 60-second resend UI cooldown are supported. Existing PKCE callbacks remain supported.
- `account.css`: shared registration/recovery/email-change OTP cards approximately 400 × 400px, centered with eight responsive inputs. Existing OTP keyboard, paste, expiry and resend logic remain intact.
- `checkout.css`, `checkout.html`: fixed overlapping purchase panel and translated address form replaced with an in-flow centered grid. Product columns shrink safely, images are bounded, forms have persistent labels, and totals/buttons fit mobile screens. Checkout calculations and purchase restrictions remain in the original scripts.
- `tests/auth-fixtures.js`, `tests/phase0.test.js`, `tests/layout-restoration.cjs`: isolated email-change fixtures, focused account regression checks and desktop/mobile screenshot coverage. Fixture acceptance does not prove hosted Auth behavior.

## Email-change inspection and remaining acceptance work

Reviewed the existing Auth service, PKCE callback handling, native OTP audit, pinned upstream email-change verification source, local migrations and saved configuration evidence. `docs/native-otp-audit/manually-confirmed-settings.json` records Secure Email Change enabled (owner-confirmed on 11 October), eight digits and a one-hour code expiry. Secure Email Change is never changed by this implementation. Supabase remains responsible for requiring both confirmations under the configured policy.

Current hosted email-change template bodies are not present in the repository or exposed by the available read-only connector tools. Do not claim that current email-change messages contain eight-digit codes: the UI also directs users to follow existing link instructions. Before production acceptance, inspect both rendered recipient messages and test current-first/new-first confirmation, expired/replayed codes or links, resend, replacement-address races, reload, callback redirects and canonical email updates in a separately authorized managed test project. If templates use links, preserve them or obtain explicit authorization before modifying them. No production email, account, data or setting was changed for this task.

Native API references: [updateUser](https://supabase.com/docs/reference/javascript/auth-updateuser), [verifyOtp](https://supabase.com/docs/reference/javascript/auth-verifyotp), [email templates](https://supabase.com/docs/guides/auth/auth-email-templates).

## Account deletion: safely unavailable

Security includes a separate Danger Zone and a modal explaining permanent deletion, typed acknowledgement and Cancel/Escape. The destructive button stays disabled, even after typing DELETE. No deletion endpoint is called and no service-role key is exposed. This is intentionally an unavailable interface, not a completed deletion feature.

Backend requirements before enabling deletion:

1. Inspect the live foreign-key graph and storage ownership read-only, including custom schemas, triggers, orders and retention obligations. Local profiles SQL declares `profiles.id → auth.users.id ON DELETE CASCADE`. The local historical OTP draft also declares cascading auth references but is explicitly inactive and cannot be assumed deployed. The catalog's `product-images` bucket contains shared product media, not proven customer-owned assets; never delete it by matching browser-supplied paths. Cart and favorites are browser-local per-user references.
2. Implement an authenticated server-side Supabase Edge Function. Validate the bearer token with Auth, verify the session is still active, derive the user ID exclusively from the authenticated identity and reject body-supplied user IDs. Allow only configured origins; reject unsupported methods, malformed requests and missing explicit confirmation.
3. Require fresh, short-lived, one-use identity proof bound to the user, active session and deletion purpose. Validate proof server-side, with replay protection and rate limits. Existing password recovery or a long-lived JWT alone must not authorize deletion. Support appropriate native password/MFA or provider reauthentication without weakening existing controls.
4. Use an idempotent deletion operation and an audited dependency inventory. Validate all prerequisites before destructive changes. Revoke sessions and enforce account/session existence for sensitive access because issued JWTs can outlive deletion. Remove only inventoried user-owned storage objects through the Storage API before Auth deletion; handle pagination. Apply reviewed relational cleanup/retention rules, then call server-only `auth.admin.deleteUser` for the derived identity. Database/Storage/Auth operations are not one atomic transaction: track progress, retry safely, retain a minimal nonsecret audit record, and report partial failure honestly. Never show success if Auth deletion failed. Define recovery/support behavior for partially removed objects or data.
5. Test unauthorized requests, stale proof, replay, cross-user attempts, storage failures, foreign-key failures, concurrent retries and revoked sessions using synthetic nonproduction accounts. Deployment and production enablement require separate authorization. After confirmed success, clear that user's browser-local state and sign out.

## Validation

The expanded browser regression initially exposed an obsolete expectation that the email-change form was hidden and an existing race that dereferenced a removed OTP form after successful registration. Both test expectations now match the actual lifecycle.

- Full browser regression: **692 passed, 0 failed**. Includes dashboard selection/active states/no reload, overview, Save/Cancel, password, dual-address mocked email verification, expiry/replay/recipient checks, unavailable deletion confirmation, cart persistence, OTP desktop/mobile and checkout/authentication/recovery regressions.
- Real pinned SDK Auth fixture suite: **64 passed, 0 failed**.
- Security regression: **56 passed, 0 failed**.
- Native OTP source/request/RLS audit: **29 passed, 0 failed**.
- Isolated profile PostgreSQL audit: **94 passed, 0 failed**.
- Preview server: **61 passed, 0 failed**.
- JavaScript syntax checks passed for changed application scripts.
- Visual browser audit: **20 captures** at 1440, 768, 375 and 320px; no horizontal overflow, JavaScript exceptions or failed assets. Reviewed dashboard, shared OTP and checkout renderings. Visual review caught inherited global form direction/button typography in OTP; scoped overrides now center the card contents and keep its desktop size approximately 400px square. Evidence: `docs/layout-restoration/account-redesign.json` and referenced PNGs.

Generated results updated: `docs/phase4-browser-results.json`, `docs/phase43-auth-results.json`, `docs/phase43-security-results.json`, `docs/native-otp-audit/test-results.json`, and `docs/phase4-migration-test-results.json`. The visual audit updates matching dashboard/checkout screenshots and adds security/cart/OTP screenshots under `docs/layout-restoration/after/`.

The browser preflight read only the public catalogue and public image objects; production Auth calls were blocked and replaced by local fixtures. No accounts were deleted, no Edge Functions deployed, no payments activated, no migrations applied, no commits or pushes made, and iVenue was not accessed.
