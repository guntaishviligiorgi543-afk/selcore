# Selcore managed test-project implementation plan

11 October 2026. Planning only. No project created, remote configuration changed, deployment performed or email sent. This plan authorizes none of those actions. Production project `ffznkypurnocabqyxpps` must never be a mutation target; iVenue is out of scope.

## Evidence and decision

Reviewed [native audit](supabase-native-otp-audit.md), [architecture](supabase-only-architecture.md), [previous regression results](supabase-only-test-results.md), all six JSON evidence files in [the evidence directory](native-otp-audit/readonly-evidence.json), and the relevant guards in its eight pinned official source snapshots. The audit's 29 checks are source/SDK capture/isolated PostgreSQL checks, not authenticated managed Auth acceptance tests. The previous regression counts are historical results, not new runs for this plan.

Use hosted Supabase Auth to generate and verify codes; Database/RLS to approve protected application access; small Edge Functions for application approval and revocation; GitHub Pages-compatible frontend code. No replacement Auth service or authentication proxy is proposed.

Password policy revised: [current requirements](authentication-requirements.md) replace mandatory password-change OTP with secure current-password verification. Guaranteed revocation of all application/device approvals after a direct native credential mutation still needs a supported integration and race-tested implementation. Native recovery/OTP current-password exemptions remain a direct-API limitation.

## Required resources and isolation

| Resource | Required provision / access |
| --- | --- |
| Managed Supabase project | Separately authorized `selcore-auth-test`; distinct ref, database, keys and JWT signing keys. Prefer production region and PostgreSQL major version. Record actual hosted Auth version; a managed project cannot be assumed pinned to v2.197.0. Confirm plan supports needed hooks/session settings before purchasing anything. |
| Configuration manifest | Test ref, explicit allowed origin, Auth settings, enabled hooks, exposed schemas, policy inventory, function versions and redacted key identifiers. Record snapshots before every change. |
| Synthetic fixtures | Two independent users, two browser contexts per user, old/new addresses such as `run-id-u1@example.invalid`, one unconfirmed user. No production export, customer identifiers, passwords or sessions. Use minimal synthetic product/profile fixtures. |
| No-send mail capture | Test-only Postgres Send Email Hook and private capture table, accessible only by Auth hook writer and restricted test runner. No public inbox endpoint. No SMTP credentials or Resend API key in test project. |
| Database roles/state | Dedicated capture-reader/test-fixture role; private approval tables; restricted server transaction entry points; ordinary authenticated/anon test identities. Provision least privileges rather than reuse production secrets. |
| Edge functions | Application-security operations for begin/complete login approval, trusted-device approval, session/device/global revocation. Deployment needs separate authorization. Request-scoped native Auth clients; no persisted server user sessions. |
| Frontend and runner | Local restricted preview with explicit test-project override; existing SDK 2.110.7; isolated browser storage. Raw HTTP runner or installed Postman CLI for bypass tests, plus existing regression/PGlite suites. No public hosting deployment needed. |
| Evidence and retention | Redacted HTTP outcomes, private-state assertions, policy/config snapshots, UTC server timestamps and test IDs. No OTPs, hashes, bearer/device secrets or passwords in shared artifacts. Delete capture rows after consumption; maximum capture retention two hours; remove synthetic fixtures at completion. |

Runner preflight must require an explicit test ref, compare it against the authorized manifest, reject the production ref, and reject any unexpected Auth/Data/Functions host. Credentials are loaded from a test-only secret store/process environment. No fallback to the existing production client configuration. Browser interception blocks production Auth mutations and all outbound email-provider requests.

## Safe test configuration

| Component | Baseline and deliberate variants |
| --- | --- |
| Auth | Email/signup enabled, autoconfirm false; OTP length **8**, expiry **3600 seconds** to reproduce confirmed settings; secure email change, secure password change and current-password requirement enabled. All other login providers and anonymous accounts disabled. Explicit loopback Site URL/redirect allowlist, no wildcards. Record rate-limit settings and enforce bounded send/verify attempts. |
| Sessions | Propose 900-second access JWT lifetime for test; refresh rotation enabled. Record native inactivity/time-box settings and availability. These are distinct from 48-hour application trust. Do not assume defaults or row existence proves a live session. |
| Abuse/password controls | Retain native password-strength controls; use strong synthetic passwords. Test CAPTCHA in a separate documented provider test-mode configuration if supported, with no production CAPTCHA secret. No unbounded OTP guessing. Run quotas sequentially with explicit budgets. |
| Mail | Enable no-send hook **before any signup/recovery/send action**. Keep email provider enabled. Hook captures native codes without generating replacements or making network calls; SMTP is not used while hook is active. No default-mailer smoke test. Recovery template acceptance requires `{{ .Token }}` and no recovery `{{ .ConfirmationURL }}` as the intended user path. |
| Templates / SMTP parity | Prepare recipient-correct native `{{ .Token }}` templates and inspect rendering offline. Intended delivery remains Resend SMTP, `smtp.resend.com`, TLS/verified sender and protected SMTP credentials. Actual SMTP/delivery tests are excluded until separately authorized; hook tests cannot prove SMTP delivery or final rendered messages. |
| Database | Apply a reconciled active-schema baseline to empty test DB; preserve existing migrations unchanged. Do not blindly apply the historical unapplied gateway draft. RLS on exposed tables; private schemas not exposed; no client trust/capture write or read grants. Preserve ownership predicates and public catalogue access. |
| Edge | Verify JWT/caller server-side, derive user/session from validated credentials, allow only manifest origins for browser UX, but never use CORS as authorization. Secrets server-only; explicit authorization before any service-role operation. Fail closed on unavailable verification/DB state. |

The supported Send Email Hook replaces SMTP delivery and permits a Postgres implementation returning an empty JSON object. This makes a **test-only capture adapter** feasible without an OTP generator or mail service. Validate its execution grants and schema support in the authorized managed project first. [Supabase Send Email Hook](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook).

Capture adapter: reject any recipient outside the exact fixture allowlist, including a proposed new address; record run/user/action/recipient/issuance and native code in a non-exposed test schema; allow only the runner to retrieve it. For secure email change, current address uses `token` / `token_hash_new`; new address uses `token_new` / `token_hash`. Do not copy the documentation's six-digit example validation into the eight-digit adapter. Notifications may have no OTP. Hook errors must abort sends; never fall back to SMTP. Before testing, inspect hook configuration/grants and prove an allowlisted capture with zero network delivery. Do not disable the hook to test errors. If capture is unsupported, stop email-generating tests rather than send mail. [Recipient mapping](https://supabase.com/docs/guides/auth/auth-hooks/send-email-hook#email-change-behavior-and-token-hash-mapping).

## Approval and 48-hour trust design

The policy is per user and browser proof. Signup and recovery proof do not count as the distinct first-login OTP. Protected access stops at the absolute 48-hour deadline, including already-open sessions. Refresh, subsequent trusted logins and resends never slide that deadline.

Private proposed records:

- `account_security`: user ID, monotonically increasing revocation version, suspended flag.
- `device_trust`: user ID, digest of a random 256-bit browser proof, proof generation, login proof time, absolute expiry, revocation marker/version.
- `session_approval`: validated native session UUID plus user/device IDs, expiry capped to device trust, security version and revocation marker. Unique native session binding.
- `pending_login`: random request ID, user/canonical email, initiating native session, device digest, purpose, creation/deadline, status and verification lease. Suggested five-minute request deadline; no production OTP stored here.

Native login produces a pending native session, not application approval. `begin-login` validates it, derives the confirmed user's email, creates the bounded pending request, and requests native `signInWithOtp` with `shouldCreateUser:false`. Repeated sends invalidate superseded pending requests and are quota-limited. The code is verified by `complete-login`, not accepted as a frontend success assertion. A trusted-device operation instead validates the proof and live current native session and caps new approval at the original deadline.

`complete-login` atomically reserves the request with a short lease, verifies using a request-scoped native client, checks returned user and signed session ID against the pending identity, then finalizes device/session approval in one database transaction. The native verification and database transaction cannot be atomic together: if verification succeeds and finalization fails, issue **no** application approval; burn the request and require a new code. Parallel completion must have one winner. A revoked/version-changed account or device cannot be approved by an in-flight completion. Return the actual verified native session only after finalization; it may replace the initial password session.

**Purpose binding needs proof:** native email verification is not inherently bound to an application request or device. Test whether a signup/recovery/independently requested native code can satisfy pending login verification. A server-side pending record alone does not prove where an interchangeable code originated. If native API semantics cannot distinguish the required login proof, this is an additional blocker, not permission to invent a custom code. Do not expose hook captures to users or use the test hook as the production approval mechanism.

Protected access predicate, evaluated from current database state:

`owner AND confirmed_nonanonymous_user AND native_session_live AND account_enabled AND session_approved AND device_not_revoked AND approval_version=current_version AND database_now<trusted_until`

Extract UID/session from validated native JWT context; never customer-provided IDs, metadata or timestamps. Add **restrictive** gates so existing permissive owner policies cannot OR around them; include SELECT and mutation USING/WITH CHECK. Audit every protected table, Storage route, RPC, view, service-role function and Realtime subscription. Use security-invoker views or revoke exposure. Narrow private SECURITY DEFINER lookup helpers require empty search path, explicit role grants and no caller-selected identity. Index user/session/device lookups. Public product reads remain intentionally public.

Check native session existence, user binding and `not_after`; reconcile any configured inactivity timeout with authoritative server state. Do not cache approval acceptance in JWT claims. Database checks apply to normal Data API calls; privileged Edge operations must perform the same check explicitly. Signed URLs and previously downloaded data cannot be recalled: sensitive objects must not have long-lived bearer URLs. Validate Realtime delivery/reconnection separately; do not promise immediate revocation for an unchecked existing channel.

Browser proof is a bearer secret; theft/XSS can copy it. An approved JWT can also be replayed from another machine. This policy is remembered browser state, not physical-device attestation. Stronger proof-bound sessions are a separate unresolved requirement if physical same-device security is intended.

## Immediate application revocation

For application-controlled logout/compromise: commit private revocation first, then native signout. Local logout revokes current session approval; explicit device logout additionally revokes device proof; account-wide logout increments security version and revokes all device trusts/approvals atomically. Serialize approval creation against account/device revocation. A retry handles native signout failure without restoring private approval. Old access JWTs must fail their next protected request immediately after the revocation commit, even before JWT expiry.

Native direct signout must also fail the live-session predicate once its native session is removed. Test actual removal timing and refresh/session timeout behavior. Concurrent transactions already authorized before revocation may complete; define the guarantee as requests authorized after commit. Sensitive write transactions must recheck/lock the relevant security record before commit to prevent a stale approval authorizing a concurrent write.

Recovery and credential changes should revoke all device trusts and require a new login proof. **An optional Edge notification is insufficient:** `/auth/v1/user` can be called directly and password update may retain the updating session. No supported, transactional, upgrade-safe credential-change invalidation integration has yet been established. Audit logs/notification hooks may be useful evidence but are not assumed synchronous enforcement. Ask Supabase for a supported integration; test direct changes, retries, lost events and race windows. Until proven, universal immediate application revocation after direct credential changes is a release blocker. Do not implement triggers against internal password fields or pretend polling is immediate.

## Current-password change and OTP recovery

Normal form collects current/new/confirmation. Local implementation verifies current password through native `signInWithPassword`, checks returned UID, then submits `updateUser({password,current_password})`. This fresh password session satisfies native recency without email OTP, including when the starting session is older than 24 hours. Preserve enabled native protections. Test session replacement and rebind application approval server-side; the old session's approval must not automatically follow the new session.

Secure password change treats sessions created within 24 hours as recent; current password verification is independent. Email OTP is no longer required for normal changes; a fresh password sign-in satisfies recency while retaining native controls. [Password security](https://supabase.com/docs/guides/auth/password-security).

The documented hook surface has no before-password-update hook; password verification hooks concern sign-in, email hooks concern delivery, and token hooks concern issuance. Native TOTP/phone MFA is not email OTP and reusable AAL2 is not a fresh per-change code. No additional password-change email factor is proposed. [Auth hooks](https://supabase.com/docs/guides/auth/auth-hooks), [MFA](https://supabase.com/docs/guides/auth/auth-mfa).

Mandatory fresh OTP for password change is withdrawn. Recovery still uses native eight-digit `verifyOtp` with recovery type before password update; no old password is required. Existing recovery markers are UI state only, and link recovery is a transitional implementation gap. Native recovery/OTP sessions can exempt current-password checks and permit repeated changes: test and document this direct API boundary. No gateway or unsupported Auth trigger is proposed.

## Exact implementation sequence and gates

1. Review this plan and matrix; settle literal first-login, continuous 48-hour expiry, bearer-device interpretation and revocation scope. Obtain explicit authorization for managed test project creation/configuration and test-only Edge deployments before any cloud action.
2. Create authorized isolated project; capture manifest/cost/region/version. Put production ref on runner denylist and configure separate credentials. Assert no production or iVenue access.
3. Install private no-send capture hook/grants and configure it before all email-generating actions. Verify allowlist, no SMTP fallback and no capture access through Data API. Keep project inaccessible to ordinary customers.
4. Reconcile deployed/local migration history; construct synthetic active schema without applying abandoned gateway draft. Inventory protected/public access paths and save schema/grants/policy baseline. Generate future migration files with installed CLI's supported commands; no blind `db push`.
5. Set/read back baseline Auth settings; record managed version and templates. Inspect the recovery template for `{{ .Token }}` and verify a native eight-digit recovery code before native-only registration/recovery/dual-email tests and raw password-update probes. Verify native current-password enforcement and recovery/OTP exemptions; mark remaining blockers explicitly.
6. Implement private approval transactions and minimal application-security Edge operations. Test leases, concurrency, identity/session binding, purpose substitution, abuse limits and fail-closed errors before granting any approval.
7. Add restrictive application gates and native live-session checks. Test direct REST/RPC/Storage/view/service-role routes using real customer-role test JWTs. Maintain public catalogue behavior.
8. Implement native eight-digit UI with string-preserving input; distinct signup/login/recovery/email-change states, native current-password verification and session replacement and no UI authorization shortcuts. Keep compatibility with pre-existing PKCE links for a later authorized transition.
9. Implement revocation; run direct signout/credential mutation, stale JWT, trusted-device re-login, concurrent approval/write and Realtime tests. Keep unsupported event integration blocked.
10. Execute every matrix row against managed Auth using synthetic accounts and raw HTTP, then existing suites: `node tests/native-otp-audit.test.cjs`, `node tests/phase43-auth.test.cjs`, `node tests/phase43-security.test.cjs`, both profile-audit variants, preview/browser regression and OTP accessibility. Update mocks to enforce current-password rules and native session distinctions; retain existing ownership/data regressions. No real SMTP calls.
11. Capture redacted per-test expected/actual outcomes and versioned config. Separate accepted bypass findings, harness failures and unrun cases. Require all security acceptance rows to pass; no blanket pass from SDK mocks.
12. Prepare a separate rollout review only if blockers are resolved. Production settings, templates, migrations and deployment require a later authorized task. Real Resend delivery remains an explicit untested gate requiring separate email authorization.

For 48-hour boundary tests, use an admin-only fixture utility to backdate private trust records in the isolated project, then verify actual database-clock comparisons at before/equal/after expiry. Also schedule one real-duration soak. Do not expose test-clock controls to clients or manipulate managed native session internals to fake the 24-hour password test: wait over 24 hours for that native case. A short OTP-expiry variant may accelerate expiry tests, followed by restoring and checking the 3600-second baseline.

## Rollback and stop procedure

Before each phase save redacted configuration and a schema-only snapshot; private test captures/secrets are excluded. Give each test run a fixture prefix. If isolation or no-send checks fail, stop the runner immediately; leave no-send hook active, suspend synthetic activity and revoke test approvals/sessions. Never switch to default SMTP as a rollback.

For an implementation failure, first deny protected test access/revoke approvals; stop affected Edge operations. Restore previous test function/config/schema version using reviewed reversible changes. Restoring an earlier frontend does not remove approval gates. Do not roll RLS back to permissive access to recover availability. Partial native verification without approval is intentionally recoverable by a new code.

For disposable test schema failure, rebuild only the explicitly authorized test project/schema from the saved baseline with synthetic fixtures after reviewing target ref; no production restores, migration deletion or bulk unreviewed resets. Revoke runner credentials and clear browser state/capture rows when finished. Project deletion is a separate destructive action requiring authorization. Retain redacted evidence and original migration files.

## Unresolved blockers and acceptance status

| Blocker | Resolution needed |
| --- | --- |
| B1: native current-password exemptions | Normal UI verifies securely; direct recovery/OTP sessions may update without current password. Preserve recovery exemption and document reusable-session limitations. Former mandatory password-change OTP blocker withdrawn. |
| B2: immediate trust revocation after direct credential mutations | Supported authoritative invalidation and race/failure proof; current-session retention and device reapproval must not bypass it. |
| B3: native code purpose/request binding | Managed cross-purpose/resend/direct-send tests; establish whether pending login proof can securely distinguish required login OTP. |
| B4: test resources/access | Explicit cloud/config/deployment authorization, plan capabilities, restricted runner/capture access. No resources provisioned yet. |
| B5: bearer-device semantics | Accept remembered browser possession or establish supported stronger binding; copied JWT/device state is replayable. |
| B6: delivery/hosted coverage | Real SMTP excluded; all managed acceptance rows pending. Old version source cannot substitute for testing actual hosted version. |

See [security test matrix](supabase-native-otp-security-test-matrix.md). Current status: plan prepared; no managed test case executed in this task. The strongest currently verified result remains native eight-digit generation support plus prior isolated audit findings, not end-to-end enforcement.
