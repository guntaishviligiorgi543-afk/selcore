# Selcore native eight-digit OTP security audit

> Policy revision: [current authentication requirements](authentication-requirements.md) supersede mandatory OTP before every password change. Normal changes now require native current-password verification; recovery still requires eight-digit OTP. Findings below retain their historical audit context.


11 October 2026. Scope: Selcore hosted project `ffznkypurnocabqyxpps` and this repository only. No production mutation, deployment, customer account access, email sending, commit or push. No other project was accessed. This is an audit and implementation plan, not an authentication implementation.

## Decision

Native Supabase Auth supports exactly eight-digit email codes and can provide signup, login-email proof, dual-address email change and recovery verification. The configured code length is already eight according to the owner's manual confirmation. Database/RLS plus narrowly scoped Edge Functions can enforce a 48-hour approval requirement on protected application data.

**The full requirement set is not satisfied by the present architecture.** In particular, mandatory fresh email OTP before **every** password change has no demonstrated supported enforcement mechanism on the public native Auth endpoint. Secure password change has a 24-hour session exemption; current-password verification is a separate control. An Edge wrapper or application RLS does not change native Auth's update rules. Do not market or release the proposed implementation as fully compliant until that limitation is resolved with a supported Supabase capability.

Similarly, blocking application use until OTP is different from preventing native Auth from issuing a password-login token. With no Auth hooks enabled, native password login can issue a token without a new OTP once the account is confirmed. The recommended application approval gate must reject such a token for protected resources; it does not claim to prevent its issuance.

## Evidence and hosted settings

| Setting / observation | Value | Provenance |
| --- | --- | --- |
| Auth health | v2.197.0, HTTP 200 | Current GET-only hosted check |
| Email provider / signup | Enabled / enabled | Current public Auth settings GET |
| Email autoconfirm | false | Current public Auth settings GET |
| Google, phone, anonymous, passkey sign-in | Disabled | Current public Auth settings GET |
| OTP length / expiry | 8 / 3600 seconds | Owner manually confirmed during this audit |
| Secure email change | Enabled | Owner manually confirmed |
| Secure password change | Enabled | Owner manually confirmed |
| Current password requirement | Enabled | Owner manually confirmed |
| SMTP host | smtp.resend.com | Owner manually confirmed; delivery not tested |
| Enabled Auth hooks | None | Owner manually confirmed |
| Edge Functions | None deployed | Current Selcore-only connector read |
| Public/Storage base-table RLS | Enabled on all returned tables | Current database metadata SELECT |
| Profile policies | Owner UID and confirmed, non-anonymous user | Current database metadata/function-definition SELECT |
| Private application tables | None | Current database metadata SELECT |
| Unauthenticated user GET / anonymous profiles GET | HTTP 401 / HTTP 401 | Current GET-only probes |

Private configuration was not independently retrieved: the connector lacks an Auth-config endpoint, no browser is available, and no management access token is present. Owner-confirmed values are not relabeled as tool-verified values. Template contents, SMTP credentials/domain verification, resend/attempt quotas, CAPTCHA, JWT expiry and session timeout configuration remain unverified. Public settings mention a default SMS provider even though phone auth is disabled; that does not mean phone login is active.

Evidence: [read-only HTTP/source manifest](native-otp-audit/readonly-evidence.json), [manual settings](native-otp-audit/manually-confirmed-settings.json), [database metadata](native-otp-audit/database-evidence.json), [isolated tests](native-otp-audit/test-results.json). Native source was pinned to official v2.197.0 commit `4eee58f296d9698a1c2c0ae14d7a0b379c7622d3`, matching the reported hosted version. Hosted builds can include patches; source review is corroboration, not proof that an authenticated live request succeeded. Source snapshots in `native-otp-audit/source/` are inert evidence, not an Auth server or runtime dependency.

## Existing implementation and gaps

`auth-service.js` uses `signUp`, `signInWithPassword`, signup `resend`, `resetPasswordForEmail`, PKCE `exchangeCodeForSession` and `updateUser`. `supabase-client.js` persists and refreshes native sessions. `account.js` binds password signup/login and link-based recovery forms. `otp-ui.js` provides a reusable eight-digit input component, but no active native OTP binding exists. The email-change form remains hidden.

**An existing functional mismatch was found:** normal password updates pass only `{ password }`. They do not collect/pass `current_password` or handle a reauthentication nonce. With the owner-confirmed current-password requirement, a normal password-session change should fail, and old sessions also need a nonce. The existing Auth regression mock accepts the incomplete request; its passing result does not prove compatibility with these production settings. This audit preserves application code and documents the necessary future fix.

The profile verification helper reads confirmed-email status from `auth.users`; it does not inspect `session_id`, first-login approvals, device proofs, recent OTP or trust expiry. Current logout uses `scope:'local'`, not account-wide logout. UI recovery markers and resend cooldowns are not server authorization controls.

## Native capabilities and requirements

| Requirement | Native capability | Required enforcement / limitation |
| --- | --- | --- |
| Exactly eight-digit email OTP | Mailer accepts lengths 6–10 and cryptographically generates padded decimal strings; eight is configured | Code templates must show native `{{ .Token }}`; never generate or pad a different client code. No delivered sample was requested |
| OTP during registration | Native signup confirmation token and `verifyOtp` | Use token template and OTP entry; autoconfirm stays false. Registration remains pending until native verification |
| OTP on first login | Native email OTP can establish email possession | Password login does not automatically require a second email OTP; gate protected application access with private session approval |
| Same-device trust for 48 hours | No native remembered-email-device policy matching this requirement | Private user/device trust plus current-session approval, verified by Edge and enforced by restrictive RLS |
| OTP again after 48 hours | Native expiry is code lifetime, not device trust | Check server-owned `trusted_until` on each protected request; do not extend it on token refresh |
| OTP before every password change | Native `reauthenticate()` issues nonce; old sessions require it when secure password change is enabled | **Not fully enforceable by these settings:** recent sessions skip nonce. A current password, AAL2 or a wrapper cannot establish mandatory fresh per-change email OTP |
| Both email addresses verified during changes | Native secure email change generates old/new proofs and requires both for existing email accounts with autoconfirm false | Implement native `updateUser({email})` then `verifyOtp({email: destinationEmail, token, type:'email_change'})` for both destinations; first confirmation is not completion |
| OTP-based password recovery | Native recovery code verification and subsequent password update | `resetPasswordForEmail` + recovery token template + `verifyOtp({email,token,type:'recovery'})`; handle recovery Auth event; validate entire flow in isolated managed Supabase |
| Secure session revocation | Native signout scopes, rotating refresh tokens and password-update session revocation | Add application approval/device revocation and live-session checks to deny already-issued JWTs immediately on protected data/actions |
| Direct API bypass protection | Native Auth owns its own endpoint controls; RLS secures Data API rows | Apply RLS/server grants to all protected application routes. Native password-update limitation remains outside application RLS |

Native reauthentication is `auth.reauthenticate()` followed by `auth.updateUser({password,current_password,nonce})` as appropriate. The nonce is consumed by native password update; it is **not** an email OTP type to send to `verifyOtp`. Calling reauthenticate voluntarily on every UI change improves that UI flow but cannot force a direct caller to supply it for a recent session. [Supabase password security](https://supabase.com/docs/guides/auth/password-security).

Native email OTP/passwordless authentication is AAL1. Documented native MFA methods are TOTP and phone; they do not implement the requested eight-digit email factor or fresh per-action email proofs. In v2.197.0 native account updates require AAL2 when the user has enrolled MFA, but a reusable AAL2 session is not proof of a new email OTP for every password change. No MFA enrollment was queried and no additional factor is proposed. [Supabase MFA](https://supabase.com/docs/guides/auth/auth-mfa).

The available hosted Auth hooks include token issuance, email delivery, password verification and MFA attempts; there is no documented before-password-update hook. A token hook can support claims/issuance decisions but must cover every authentication route and cannot retrofit a mandatory nonce check into every later native mutation. [Auth Hooks](https://supabase.com/docs/guides/auth/auth-hooks).

## Direct API bypass findings and actual tests

| Route / scenario | Finding | Evidence strength |
| --- | --- | --- |
| `POST /auth/v1/token?grant_type=password` without email OTP | With confirmed user and valid password, native issuance is not subject to Selcore device/first-login approval; hooks are confirmed off | Matching-version native password-grant code + real SDK request capture; no hosted login attempted |
| `PUT /auth/v1/user` with new/current passwords and no nonce on a fresh password session | Expected to pass native password/current-password controls without a fresh email OTP, unless other native controls such as enrolled MFA apply | Matching-version guard review and documentation; real SDK emits exactly this request without automatic reauthentication; capture deliberately returns HTTP 418, not invented success |
| Repeated password updates in a recent OTP/recovery session | Native current-password exemption applies to recovery-method sessions, including OTP in upstream tests; session age exemption means no new nonce per change | Matching-version source/tests inspected, not executed as an Auth server |
| Direct profile read/update with confirmed-owner identity and no approval or live session | Existing RLS permits access | **Executed** against real isolated PostgreSQL using deployed profile SQL; synthetic users only |
| Direct profile access as another UID | Denied by existing ownership RLS | **Executed** against isolated PostgreSQL |
| Reuse of access JWT after native logout | Existing profile RLS lacks a live-session/revocation lookup; a still-valid JWT can pass its predicates | Current production policy review + isolated RLS test with nonexistent session ID + documented JWT lifecycle |
| Direct native email change | Secure old/new confirmation remains native and cannot be replaced by a single frontend success flag | Matching-version generation and two-stage verification code; not a hosted mutation test |
| GET native user without bearer / anonymous profile read | Denied | **Executed** current hosted requests, both HTTP 401 |

An authenticated live bypass attempt requires a synthetic account and changes session or credential state. Under the no-production-modification/no-email restrictions, it was **not performed**. No available separately authorized managed test environment was created. The audit therefore reports source-backed bypass risk and isolated application-policy findings, not a reproduced hosted password-change exploit. This missing acceptance test must remain a release blocker.

Current-password validation protects against a stolen password-session token alone, but does not satisfy email OTP if the password is also known. Creating a fresh password session also restarts the native recent-session exemption. OTP-method sessions intentionally allow password recovery without knowing the old password; this grants recovery capability, not a one-use authorization tied to exactly one password-change action. The distinction matters when retaining reusable sessions after recovery.

Do not try to solve the boundary with hidden public keys, CORS, `user_metadata`, client timestamps, a pending UI, disabled buttons, or an optional Edge proxy. Do not add unverified triggers on internal Auth credential columns: no supported request/session binding and upgrade-safe per-change enforcement was established. No trigger workaround is recommended.

## Simplest secure implementation architecture

Keep GitHub Pages, the native browser SDK, hosted Supabase Auth and Resend SMTP. Auth generates/verifies all email codes. Add a small Supabase application-security Edge Function surface only for approval/device/revocation operations; it does not replace Auth, proxy all authentication or handle passwords as a custom gateway. Use private database tables with no client write grants and narrow server-only transactional operations. Existing ownership RLS remains, with restrictive approval checks added only after testing.

Proposed state:

- `device_trust`: user UUID, hashed random browser device proof, proof generation, login-OTP verification time, absolute `trusted_until`, revoked time/security version. Trust is per user **and** device, never an account-wide exemption.
- `session_approval`: native user UUID and signed-JWT session UUID, associated device proof, verification/trust expiry and revocation version. Bind approval to the actual session returned by native verification, which can replace the earlier password session.
- Short-lived pending approval requests: purpose, expected user/email/session/device binding, issuance time and one-use completion state. They contain no custom OTP generator or stored plaintext code/password.

An Edge Function authenticates the caller with Supabase, derives identity/session from verified native credentials, looks up canonical email server-side and calls native OTP verification with a request-scoped client. It rejects a returned identity mismatch, invalid/expired/reused proof, wrong purpose and revoked device. It records approval atomically and never accepts a client assertion that verification occurred. A direct native verification can still issue a native session, but cannot write application approval tables.

For a trusted-device login, the function validates possession of the device proof, verifies the current native session and creates its approval capped at the existing trust expiry. For an untrusted login, native email OTP must be verified before approval. Registration OTP and recovery OTP do **not** automatically refresh the timestamp reserved for successful login OTP; require a distinct first-login proof to satisfy the requirement literally. Choose this policy explicitly before implementation.

The simple browser device proof is a bearer secret stored on that browser, with only its digest in the database. It identifies possession of browser state, not physically uncopyable hardware; clearing storage or a different browser requires OTP. XSS or theft can copy it alongside session tokens. An already approved native JWT is also a bearer credential: copying it can reuse that approved session without re-presenting a device proof. This proposal controls trust for subsequent logins, not physical-device attestation or theft-proof sessions. Do not use IP/User-Agent as identity. Non-exportable WebCrypto key proof can be evaluated later if stronger binding is required, but no hardware guarantee is claimed. GitHub Pages cannot supply a same-origin server session cookie; do not assume cross-site HttpOnly cookies solve device trust automatically.

RLS checks owner UID **and** live native session, current private approval, security version and server-clock trust expiry. A narrow private helper may need audited definer privileges to look up Auth/private state; use empty search path, explicit EXECUTE grants and no customer-chosen identity. Edge server secrets never enter frontend bundles. Normal client data access continues under the customer JWT; administrative clients require explicit caller checks because service-role bypasses RLS.

Use the conservative interpretation of “OTP again after 48 hours”: protected access stops at `trusted_until`, including existing sessions. If the desired rule only applies at the next explicit login, that is a different policy and should be documented before implementation. Native refresh never advances OTP verification time. Public catalogue/image access remains public.

Revocation operations first revoke private approvals/device trust, then use native signout scopes for refresh-session invalidation. Deny protected actions with stale access JWTs by checking private state plus `auth.sessions`, including `not_after` and the intended timeout policy; mere row existence is insufficient for timed-out sessions awaiting cleanup. Password updates natively revoke other sessions but may retain the updating session. Global logout and recovery/credential-change handling must also revoke device trust. A wrapper notification alone cannot detect native mutations that bypass it; evaluate supported database-change/audit integration to invalidate application approvals, and test its race/failure behavior. This is application revocation, not a fix for the per-password OTP boundary. [Session lifecycle](https://supabase.com/docs/guides/auth/sessions).

## Native OTP frontend transition

1. Add purpose-specific OTP state and reuse the eight-digit input component. Preserve codes as strings, including leading zeros. Treat local validation/cooldowns as UX only.
2. Registration: keep `signUp({email,password,options})`, show pending confirmation, use native `verifyOtp({email,token,type:'email'})`. The current SDK documents `email` for signup verification; use explicit recovery/email-change types where appropriate. [Native verification API](https://supabase.com/docs/reference/javascript/auth-verifyotp).
3. Login proof: use native `signInWithOtp({email,options:{shouldCreateUser:false}})` through the approval operation when needed; verify email code server-side before approving the native session. OTP passwordless sign-in is an alternate native route and must not bypass private approval.
4. Recovery: send with `resetPasswordForEmail`; verify with `type:'recovery'`, handle `PASSWORD_RECOVERY`, then native password update. Do not authorize solely from URL/sessionStorage recovery flags. Confirm MFA-enrolled-user recovery behavior separately.
5. Email change: enable UI only with native secure dual-address flow tested. Capture both destination-specific codes; a first HTTP 200 may contain a confirmation message and **no user/session**. Show pending state until canonical email changes; test either order, replay, resend and replacement-address races.
6. Password change: collect current password for normal password sessions; handle native reauthentication nonce and safe error codes. Label voluntary fresh-OTP UI behavior accurately; it is not universal mandatory enforcement.
7. Build and test the UI before switching production templates. In the later authorized rollout, replace confirmation/magic-link/recovery/email-change action links with recipient-correct `{{ .Token }}` codes; preserve already-issued PKCE links for their expiry window. Do not publish raw token hashes or tokens in URL/history/logs. Inspect both email-change rendered messages before rollout, rather than assuming a single template variable exposes both codes to one recipient. [Email templates](https://supabase.com/docs/guides/auth/auth-email-templates), [native email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless).

## Step-by-step implementation plan and acceptance gates

1. **Resolve the hard limitation first.** Obtain a supported Supabase mechanism for fresh email OTP on every native password mutation, or record that this requirement remains unmet. Do not weaken it silently and do not deploy a claim of full compliance. The audit recommends no unsupported workaround.
2. Create/use a separately authorized **managed nonproduction Supabase** environment. Match the confirmed settings. Use synthetic identities, with test email interception/no-send delivery approved separately. Do not start a local Auth server or create test customers in production.
3. Reconcile existing migration history against deployed snapshots before preparing any new migration. Preserve current data, ownership policies and the historical unapplied gateway migration; do not automatically apply that draft.
4. Implement native OTP UX and fix current-password/nonce handling in the isolated environment. Verify generated codes are exactly eight decimal digits, expiry, resend invalidation, attempt/rate limits and generic errors. The current one-hour code expiry is independent of 48-hour trust; consider a shorter expiry such as ten minutes only in a later approved settings change.
5. Implement private trust/session approval state and narrowly scoped Edge operations. Set login trust expiry from database clock; revoke on compromise/logout/recovery/credential change. Deny client writes, role escalation, approval forgery and caller-chosen user/session IDs.
6. Add restrictive RLS/session revocation gates to all protected tables, Storage routes and RPCs. Preserve public catalogue access. Check views/definer functions and service-role operations separately for bypasses.
7. Execute direct **raw HTTP** acceptance tests in the isolated managed environment: password login before first OTP; valid/expired/missing device proof; exactly 48-hour boundary; refreshed and revoked JWTs; cross-user/device/session replay; password update without nonce on fresh/old sessions; repeated updates after one OTP; current-password failure; recovery; both email confirmations in either order; resends, concurrency and alternate enabled Auth routes. Native password update without fresh OTP must be rejected to pass the strict requirement; its expected native recent-session success currently demonstrates the limitation.
8. Test revocation after direct native credential changes, including already-issued JWT access to protected data. Test Edge/database outages fail closed. Verify neither refresh nor resend extends trust and recovery/registration proofs cannot be substituted for login proofs.
9. Run existing regression/RLS suites with mocks enforcing the owner-confirmed controls, then browser/mobile OTP accessibility tests. Verify Resend delivery separately only when real test emails are explicitly authorized.
10. Prepare a reviewable rollout and rollback plan; no deployment or production settings change is authorized by this audit. Keep the full-policy release blocked if step 1 or the raw HTTP acceptance tests remain unresolved.

## Validation result

`tests/native-otp-audit.test.cjs`: 29 passed, 0 failed. This runs SDK request capture, source-integrity/guard checks and isolated PostgreSQL/RLS tests. SDK capture returns an intentional HTTP 418 for mutation/verification requests; it is not a successful native Auth simulation. Existing Auth regression: 53 passed. Captured-evidence security regression: 56 passed. No application/migration code changed. The first GET collector attempt was sandbox-blocked; the authorized GET-only reruns succeeded.

Authenticated hosted bypass, real generated-code sample, email delivery and server-integrated device policies remain untested under the task restrictions. They are explicit acceptance work, not hidden behind passing mocks.
