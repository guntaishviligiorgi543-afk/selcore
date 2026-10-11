> Superseded on 11 October 2026 by [Supabase-only architecture](supabase-only-architecture.md). Retained as historical evidence; private Auth, Railway and gateway instructions are no longer an implementation plan.

# Selcore Phase 5: isolated authentication staging readiness

Prepared 11 October 2026. This is a safe-stop assessment, not a staging
activation. No production Supabase or Railway request, hosted migration, email,
customer identity, commit, push, deployment, or iVenue access occurred.

## Evidence reviewed

All Phase 1�4 records were reviewed, including the Phase 4 result of 413
passing checks.

| Evidence | What it actually verified | What it did not verify |
| --- | --- | --- |
| Phase 4 GoTrue suite: 17 checks | Pinned private GoTrue and private PostgreSQL; synthetic signup, proof replay rejection, password login/mutation, recovery proof, email mutation, HMAC JWT validation, and unauthenticated admin rejection | Gateway HTTP behavior, custom OTP enforcement, local email delivery, cookies, hosted-data access, identity migration |
| Existing local suites: 396 checks | Source guards, policy constants, isolated SQL/crypto behavior, adapter mocks, loopback HTTP fixtures, frontend regression | A live private gateway, GoTrue-to-gateway integration, SMTP/Mailpit, Railway ingress, hosted Supabase cutover |

The Phase 4 GoTrue test was useful container evidence, but GoTrue's direct
administrative password and email mutations were fixtures. They do not satisfy
Selcore's mandatory gateway OTP policy.

## Phase 5 start decision

**The isolated Gateway must not be activated yet.** The required safe staging
implementation is incomplete, and disabling either existing production guard
would violate the approved architecture.

The Docker engine and necessary local images are available, including the
pinned GoTrue image, private PostgreSQL image, Node image, and Mailpit image.
No Phase 5 containers were started because the blocker is implementation and
schema compatibility, not Docker availability.

## Confirmed blockers

1. `server/otp/serve.cjs` always calls both source-level refusal controls
   before it reads credentials, connects to a database, or listens. The
   `runtime.cjs` gate is immutable in this build and
   `requireDeviceProofImplementation()` always throws. These controls passed
   24 child-process tripwire tests and remain enabled.
2. The only HTTP gateway implementation (`gateway.cjs` plus `http.cjs`) uses
   the legacy `Store` contract (`private.selcore_otp_*`) and the legacy
   `native.cjs` hosted-Auth client. It is not connected to
   `private-auth-adapter.cjs`, `Phase2Store`, or `hosted-data-adapter.cjs`.
3. The Phase 2 draft exposes a different and incomplete function contract
   (`private.selcore_phase2_*`). It lacks the legacy gateway's required rate,
   status, approval, cancellation, and session semantics. Substituting it is
   not a safe wiring change.
4. The Phase 2 draft expects a pre-created non-owner
   `selcore_auth_gateway` role. Its hosted-profile functions reference
   `public.profiles`, which does not exist in the private GoTrue PostgreSQL
   database. Applying the draft to that database would be incorrect.
5. Current browser code still calls hosted Supabase Auth directly for signup,
   password login, recovery, password update, logout, and OAuth. Until the
   frontend cutover and hosted-identity eligibility migration are complete,
   direct hosted Auth remains a bypass path for mandatory OTP requirements.
6. The current Compose configuration configures GoTrue with its no-op mail
   client. It has no Mailpit service, SMTP routing, explicit staging gateway
   entry point, or isolated database initialization plan for the gateway
   schema. No real or sandbox email was sent.
7. The secure-cookie/CSRF, public gateway ingress, trusted-proxy, session
   rotation, hosted-data authorization, and private-to-hosted identity mapping
   implementation has not been integrated end-to-end.

## Focused verification performed

- `tests/otp-startup.test.cjs`: **24 passed**. The production gateway refused
  all synthetic attempts before network, database, SMTP, or listen operations.
- `tests/otp-phase2-security.test.cjs`: **26 passed**. Adapter and policy
  checks only; no service ran.
- `tests/otp-phase2-schema.test.cjs`: **11 passed** against isolated in-memory
  PostgreSQL; no private GoTrue database schema was changed.
- Docker Engine: client/server **29.8.1**, Linux. No Phase 5 containers,
  networks, or volumes were created.

## Required implementation before isolated HTTP staging

1. Build a dedicated test-only gateway executable and Compose profile that
   cannot be selected by Railway and cannot alter `runtime.cjs` or
   `serve.cjs`. It must use a separate local PostgreSQL database and a
   non-owner gateway role.
2. Complete one gateway HTTP state machine against the Phase 2 contract:
   registration, first and same-device login, password and recovery changes,
   dual-email confirmation, encrypted gateway sessions, opaque secure cookies,
   CSRF, session rotation, and global revocation.
3. Complete private-schema functions for identity creation/mapping, rate
   limits, session state, atomic action consumption, and device-proof
   revocation. Split private-Auth state from hosted profile access; do not add
   `public.profiles` to private GoTrue PostgreSQL.
4. Add a local Mailpit service to a test-only Compose profile and configure
   GoTrue/gateway SMTP solely with its internal hostname. Verify captured
   messages without logging codes or tokens.
5. Bind GoTrue only to the internal Docker network. Expose the test gateway on
   loopback only, then prove direct GoTrue cannot be reached from the host or
   test browser.
6. Add real HTTP tests for expiry, five attempts, 60-second resend, replay,
   concurrent consumption, device mismatch/48-hour expiry, cookie and CSRF
   boundaries, JWT/session rotation, and direct-origin bypass rejection.
7. Keep hosted Supabase separate: prepare a reviewed least-privileged hosted
   data role, identity/profile migration, RLS/JWT compatibility plan, legacy
   session invalidation, and frontend cutover. None should be applied during
   isolated staging.

## Staging-readiness result

Mandatory OTP, local Mailpit delivery, secure cookies, and no-bypass behavior
were **not** claimed or tested over live Gateway HTTP. The next action is to
complete and review the isolated-only gateway implementation listed above;
then start a fresh local stack with synthetic values and repeat the real
container tests before considering a Railway staging deployment.