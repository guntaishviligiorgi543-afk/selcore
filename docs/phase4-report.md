# Selcore Phase 4: Authentication and customer accounts

## Status and scope

**PHASE 4 STATUS: PARTIALLY COMPLETE.** The local frontend implementation is complete and is tested with isolated Auth/profile fixtures. Production profiles do not exist yet; their migration requires explicit approval. Email delivery, redirect allowlists and real Google OAuth have not been verified. No production test users, real emails, database migrations or Auth configuration changes were made. Local development only was requested.

## Audit and implementation plan

Before edits, all 485 Phase 3 assertions passed. The seven pages shared one publishable Supabase client, catalogue service and store. user.js already provided form switching, password visibility and confirmation validation, so these were retained. Account forms previously reported unavailable functionality. store.js owned guest cart/favorites under the existing LocalStorage keys.

Read-only database inspection found only categories, brands, products and product_images, all with RLS; no suitable profile table or Auth user trigger existed. Selcore's public Auth settings showed email enabled, signup allowed, email autoconfirm disabled (verification required), and Google disabled. Privileged SMTP settings, templates and redirect allowlists were not obtained from the public endpoint and are not assumed to be correct. Security Advisor returned zero findings. No individual customer records were read.

The plan presented before edits was to add one shared Auth service and header UI, connect the existing forms, add the dashboard and account-scoped persistence, prepare an unapplied profile migration, and verify the frontend without production Auth mutations.

## Architecture

Every page loads the unchanged official SDK 2.110.7, supabase-client.js, auth-service.js, catalogue-service.js, store.js, auth-ui.js and existing page scripts. user.html additionally loads existing user.js and new account.js. No framework or new runtime dependency was added.

The SDK persists and refreshes customer sessions under a project-specific key. PKCE is enabled, automatic URL session detection is disabled, and the Auth service explicitly exchanges callback codes. Only getUser responses validated by Supabase establish the current account; getSession supplies the existing session for restoration and is not treated as authorization. User metadata supplies display names only.

Auth listeners schedule SDK work outside the callback to avoid lock contention. Initialization hides account actions until checked. Network verification failures clear visible account data and offer retry. Cached pages restored through browser history clear account state immediately and revalidate. Callback codes, error details and unsupported token fragments are removed from the address bar. Arbitrary token fragments are rejected. Redirects are fixed to same-origin user.html and require HTTPS except local loopback development. The account page uses a no-referrer policy.

## Files

Created: auth-service.js, auth-ui.js, account.js, account.css, tools/serve.cjs, tests/auth-fixtures.js, docs/phase4-browser-results.json, this report, and supabase/migrations/20261008000000_selcore_customer_profiles.sql.

Modified: supabase-client.js (customer session configuration); store.js (account namespace hydration); all seven HTML pages (Auth script/style order, account UI and callback referrer policy); tests/phase0.test.js (new Auth coverage and replacement of former unavailable-auth assertions); .prettierignore (one exact generated Phase 4 report exclusion).

user.js and signForm.css were reused unchanged. The SDK, product data, catalogue source, prices, inventory, original images and existing catalogue/Storage policies were preserved. Existing Phase 3 results remain historical; the extended runner now writes a separate Phase 4 report.

## Authentication flows

- Registration: Unicode full names, email validation, 8–128 character passwords, matching confirmation and required terms. Loading disables duplicate form submissions. Password inputs are cleared after requests. Registration fails closed if email verification is not enabled. Existing-account responses are generic.
- Verification: registration requests the same-origin PKCE callback; resend uses Supabase's signup resend API with a 60-second cooldown, persisted for the current browser tab with an in-memory fallback. Server limits remain authoritative. Links must open in the originating browser; invalid, expired and unsupported callbacks show a safe message.
- Login/logout: signInWithPassword, generic credential errors, explicit verification checks, server-backed session restoration and local Supabase sign-out. Header links change between Sign In/Sign Up and My Account/Logout.
- Recovery: generic resetPasswordForEmail responses, a same-origin PKCE callback, SDK-confirmed recovery context and updateUser for the new password. A query parameter alone does not grant recovery context. Verified account holders can also change their password in the dashboard.
- Google: signInWithOAuth with a fixed callback. Disabled-provider errors are visible. Provider initiation and callback branches are mocked in tests; no real Google login was attempted or claimed functional.

## Profiles migration and RLS

The SQL file is **review only and unapplied**. It creates profiles keyed by auth.users UUID, with full_name, optional HTTPS avatar_url, created_at and updated_at. Email is read from verified Supabase Auth rather than duplicated in a customer-editable table.

SELECT/INSERT/UPDATE policies require ownership and a server-side verified, non-anonymous Auth user. A narrowly scoped function in the non-exposed private schema checks auth.users for the current auth.uid(); user metadata is never used as an authorization claim. Public/anonymous privileges are revoked. Authenticated users can insert only ID/name/avatar and update only name/avatar; ID and timestamps cannot be changed by customers. There are no customer DELETE grants. The database supplies update timestamps.

A private trigger function creates new-user profiles from bounded display metadata, and the migration backfills existing users. Neither trigger helper is executable by anonymous/authenticated customers. A verified owner can safely initialize an absent profile; concurrent insertion is handled through the primary key and a bounded retry. The UI reports profile editing unavailable while the table is missing.

This migration was checked against actual Auth column types, but was not executed. Actual profile RLS enforcement is therefore **not verified**. Docker is installed, but the local Docker engine was unavailable; a database test could not run without additional environment setup. Mock denial tests only verify frontend handling and are not proof of Postgres authorization.

## Cart, favorites and checkout

Guest storage keys remain cart/favorites and accept legacy objects. Account keys are selcore:user:UUID:cart/favorites, selected only after server validation. Persisted data contains product IDs/quantities, while rendering and totals use current catalogue records. Login does not merge guest items; logout restores the guest scope; another account sees its own scope. No account cart/favorites database tables were needed or deployed.

These lists remain browser-local and do not synchronize across devices. Browser storage is accessible to someone with physical/developer-tool access to the same browser; namespaces prevent application cross-account rendering, not forensic access to the device. Sign out on shared devices. Passwords are never saved in application storage or profile tables; SDK session tokens are necessarily persisted by the SPA's official Auth client and must be protected against XSS.

The dashboard shows account details, profile editing, security actions, live favorites/cart controls and a clearly labeled future-orders placeholder. Zero-stock demo products remain non-purchasable; no checkout, payments or order creation was enabled.

## Tests and security review

Final automated result: **599 browser assertions passed, zero failed** (485 existing checks plus 114 additional checks), and **14 local preview isolation assertions passed**. Prettier, JavaScript syntax and whitespace checks passed. No manual end-to-end email or Google consent test was performed. A transient read-only preflight timeout and test-fixture/navigation issues were resolved before the final successful run.

Run node tests/phase0.test.js. Exact final assertion totals are in phase4-browser-results.json. The baseline 485 assertions passed before edits and after integration; the extended tests cover registration validation/duplicates, verification messages/resend cooldown, correct/incorrect/unverified login, logout, session restoration, recovery and expired callbacks, Google configured/unconfigured branches, profiles/missing profiles/denials, safe DOM rendering, guest/account switching, protected views, mobile account UI, cached-page restoration, catalogue, images and checkout restrictions.

The installed headless Edge browser runs with a disposable profile. The actual official SDK reads public products/categories/brands and downloads all 24 public images before launch, checks original IDs/prices/specifications and verifies image hashes. These fresh responses are replayed through the existing local catalogue proxy for deterministic browser interaction tests. Authentication and profile methods use isolated test fixtures; real Auth network calls are explicitly blocked by the test server. No real password, email or customer account is used. External decorative assets/AOS remain offline in the harness.

tools/serve.cjs binds only to 127.0.0.1:8080, serves an allowlist of frontend assets, blocks migration/admin tooling, tests, Supabase metadata and Git files, rejects POST requests, and disables caching/referrers. Its 14 HTTP/isolation assertions passed. This server is local preview tooling and is not a production deployment.

Prettier checks and SDK syntax verification pass. No administrative credential was introduced, no sensitive tokens/passwords are logged, and remote data is rendered as text. The SQL remains unapplied, so production Security Advisor findings refer to the existing catalogue only.

## Required configuration and manual verification

1. Review and explicitly approve the profiles migration before applying it to ffznkypurnocabqyxpps. Verify the target ref again before execution. After approval, run Security Advisor and prove owner-only access with two isolated test users; verify anonymous/unverified reads and foreign-ID writes fail, and ID/timestamp updates are denied.
2. With explicit approval for Auth settings, configure Site URL http://127.0.0.1:8080 and allow exactly http://127.0.0.1:8080/user.html. If testing localhost, also allow http://localhost:8080/user.html. This work did not change the existing redirect list. Keep email confirmation enabled and verify server password policy is at least eight characters.
3. Inspect SMTP and email templates. Use the Supabase ConfirmationURL in confirmation/recovery templates for the SDK's PKCE flow. Configure a suitable sender/SMTP service in the dashboard if needed; never put SMTP credentials in browser files. Email delivery requires an approved real mailbox test and is currently unverified.
4. For Google, create a Google Cloud OAuth web client and consent screen, allow the Supabase callback https://ffznkypurnocabqyxpps.supabase.co/auth/v1/callback, and enter its client ID/secret only in Selcore's Auth provider dashboard. Enable Google only after explicit approval. Test consent/cancellation, the resulting user identity and refresh/logout with an approved isolated account. Existing verified-email identity compatibility follows Supabase's identity linking rules; do not manually merge identities in frontend code.
5. Start local preview with node tools/serve.cjs, then open http://127.0.0.1:8080/user.html?view=signup. Do not use file URLs. The preview process used during isolation checks was stopped.
6. After approval to send real email/create isolated test accounts, test confirmation, resend cooldown, wrong credentials, logout/refresh, recovery/expired links and Google with two accounts. Open PKCE links in the same browser that initiated the flow. Verify guest lists stay separate, account lists survive navigation, foreign profiles cannot be read/updated, and purchases remain disabled. Clean up test accounts only with authorization.

## Known limitations and delivery

No production profiles migration, SMTP/redirect setup, real email verification/recovery, Google browser consent flow or live profile RLS test was performed. No claim of production-ready completion is made until these steps pass. CAPTCHA, MFA, email changes, account deletion and cross-device cart sync are outside this phase's implementation; assess additional production controls before launch.

No iVenue project was accessed. No commit, push or frontend/database deployment occurred.

PHASE 4 STATUS: PARTIALLY COMPLETE
