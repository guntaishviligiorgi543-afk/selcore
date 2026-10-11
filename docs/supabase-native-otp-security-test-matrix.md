# Selcore native OTP managed security test matrix

11 October 2026. All rows **pending**; no managed test project exists under this task's authorization. Follow [implementation plan](supabase-native-otp-test-project-plan.md). Use synthetic allowlisted addresses and no-send capture only. Raw HTTP uses public project key plus customer-role test JWT, never a service key except named fixture/setup operations. Assert persisted state and protected access, not only HTTP status (RLS may return empty results).

| ID | Scenario / method | Required observation |
| --- | --- | --- |
| ENV01 | Runner pointed at production/unlisted host or missing test ref | Stops before any mutation/send; no fallback. |
| ENV02 | Read back settings, health, hook, grants and schema exposure | 8 digits; baseline controls enabled; actual hosted version recorded; no capture/private exposure. |
| ENV03 | Allowlisted signup through no-send hook | Native code captured privately; no SMTP/provider network call or delivered mail. |
| ENV04 | Nonfixture recipient/new-email recipient; capture reader as anon/customer | Send rejected; capture data unavailable; no fallback. |
| OTP01 | All code-producing purposes, including reauth and both email destinations | Exactly eight ASCII decimal digits; preserve leading zero strings; no generated replacement code. |
| OTP02 | Wrong, missing, malformed, expired code | No confirmation/approval; bounded generic errors; baseline/short-expiry variant recorded. |
| OTP03 | Verify code twice; concurrent verification; resend and previous code | One-use/replay behavior and resend invalidation measured; never two approvals. |
| OTP04 | Bounded send/verify flood and Edge begin/complete flood | Native and application quotas enforced server-side; cooldown bypass ineffective. |
| REG01 | Native signup then login before confirmation | Pending user cannot obtain protected access; confirmation stays required. |
| REG02 | Native signup code entry via verifyOtp | User confirmed; returned session still not login-approved. |
| REG03 | Separate first password login after registration | Native token may issue; protected access denied until distinct login OTP. |
| REG04 | Duplicate signup, unknown login address, shouldCreateUser false | No accidental account creation on login; no unnecessary identity disclosure. |
| LOG01 | Native password grant via raw POST, no device/OTP | Token issuance recorded; direct protected REST read/write denied. |
| LOG02 | Begin/complete native login OTP | Correct identity; actual returned native session approved; 48h expiry from server clock. |
| LOG03 | Trusted device new password session before expiry | Approved only after valid device proof; original expiry unchanged. |
| LOG04 | Missing/wrong/revoked proof; new browser; different user using same proof | OTP required; cross-user/device approval denied. |
| LOG05 | Before/equal/after 48h including open and refreshed sessions | At equality and after, protected access denied; fresh login OTP restores new bounded trust. |
| LOG06 | Refresh, resend, repeated trusted login, changed client clock | No sliding trust or client-clock influence. |
| LOG07 | Caller supplies other UID/email/session; returned verification identity differs | Server derives identity; rejects mismatch; no approval. |
| LOG08 | Two completions; lease failure; DB failure after native success | One winner; failed finalization gives no approval; restart with new code. |
| LOG09 | Revocation concurrent with verification or trusted-device approval | Revocation/version wins; stale completion cannot restore trust. |
| LOG10 | Signup/recovery/direct-send code substituted into pending login | Required login-purpose distinction established; acceptance of interchangeable proof blocks strict claim. |
| LOG11 | Old pending request, superseding resend, copied pending ID | Expired/superseded/wrong-session requests cannot finalize. |
| LOG12 | Copy approved JWT/browser proof to another browser | Document bearer replay; do not claim physical-device binding. |
| REC01 | Native reset request and recovery verifyOtp | Generic request outcome, no `redirect_to` user flow; recovery template uses `{{ .Token }}`; native `type: recovery` issues a recovery session without old password. |
| REC02 | Wrong, replayed and expired recovery code; duplicate browser submission | Native rejection preserved; no password form/session on failure; only one verification request while UI is busy. |
| REC03 | Recovery password update; expired recovery session; old sessions and device re-login | Valid recovery session can update; expired/missing session cannot; password changed natively; all application trusts revoked before reapproval, subject to B2 proof. |
| REC04 | Recovery session direct Data API/profile route and raw Auth update | Document authenticated-JWT/RLS exposure and native recovery exemption; dashboard/UI state is not an authorization boundary. |
| REC05 | Resend after UI 60-second boundary and native rate limit | `resetPasswordForEmail` requests a new code; UI cooldown is usability only and never credited as server rate limiting. |
| EMAIL01 | Direct native updateUser email, verify current then new | First confirmation is pending; canonical email changes only after both. |
| EMAIL02 | Verify new then current | Same two-address requirement; completion observed server-side. |
| EMAIL03 | Single code, same code twice, mismatched destination, wrong token/hash mapping | Cannot complete with one address; no cross-recipient disclosure. |
| EMAIL04 | Resend, expiry, replacement new address, concurrent confirmations | Superseded proofs cannot confirm unintended address; canonical state determines completion. |
| EMAIL05 | Direct successful email change while approved | All relevant approvals/trust invalidated immediately; if not established, B2 fails. |
| PASS01 | Fresh password session raw PUT with new/current password, no nonce | Valid current password accepted without email OTP; missing/wrong current password rejected. |
| PASS02 | Start normal UI change with session over 24h | Native password sign-in verifies current password and creates recent session; no email OTP. Direct old-session update still honors native nonce guard. |
| PASS03 | Wrong/missing current password on password-method session | Native setting enforced; frontend handles error safely. |
| PASS04 | Repeated password change; stale previous current password | Each normal flow verifies current password; stale password rejected after prior change. |
| PASS05 | OTP/recovery session direct update without current password | Document native exemption and repeated-update risk; no universal current-password enforcement claim. |
| PASS06 | Enrolled native MFA fixture, AAL1 versus AAL2 update | Existing native MFA protection retained; no new production factor introduced. |
| PASS07 | Direct password mutation retains updating session | Test old/current JWT and trusted-device reapproval; B2 unresolved if any old application trust remains usable. |
| REV01 | Application local, device and account-wide logout | Intended approvals/proofs revoked at commit; retained JWT fails next protected authorization. |
| REV02 | Native signout direct; stale JWT, refresh, native expired/deleted session | Live-session gate rejects as soon as authoritative native state invalidates; actual timing recorded. |
| REV03 | DB/Edge/native signout outage; retry | No private approval restored; protected access fails closed. |
| REV04 | Protected write/approval concurrent with revocation | Defined commit ordering enforced; no stale late write/approval. |
| REV05 | Existing Realtime subscription/private object URL after revocation | No unsupported immediate-revocation claim; deny unchecked channels/long-lived URLs for sensitive resources. |
| API01 | Raw REST SELECT/INSERT/UPDATE with pending or stale JWT | Ownership alone cannot bypass restrictive gate; verify no data change. |
| API02 | Change user_metadata to verified/admin/trusted/expiry | No authorization effect; private state unchanged. |
| API03 | Direct private table writes, RPC approval forgery, selected user/session arguments | Grants and caller binding deny escalation. |
| API04 | RPCs, views, Storage list/download/upload/upsert and Edge privileged routes | Same protected gate; no definer/service-role escape. |
| API05 | Direct native OTP verification/passwordless alternate route | Native session cannot write approval; first-login gate still holds. |
| API06 | Other user's rows, owner reassignment, anon/unconfirmed access | Existing ownership/verification protections preserved. |
| API07 | Public product/category/image reads | Intended public catalogue behavior preserved; no private-data exposure. |
| UI01 | Eight digits/paste/leading zeros/mobile/focus/accessibility | Correct native payload and purpose; tokens absent from URL/history/logs. |
| UI02 | Dual email pending response, native recovery event and current-password errors and native session replacement | Correct state; no false completion or frontend-only grant. |
| REGRESS01 | Existing Auth/security/PGlite/preview/browser suites | Existing product/RLS behavior retained; mocks do not substitute for managed cases. |

Record per row: actual managed version/config variant, run ID, redacted request method/path/status/error, native identity/session relationship, server timestamps, private-state assertions, protected read/write result, expected versus actual, cleanup and PASS/FAIL/BLOCKED. Normal password-session mutation with missing/incorrect current password is **FAIL** if accepted. Native recovery/OTP exemptions are documented limitations; mandatory password-change OTP is withdrawn. An unrun SMTP/hosted case is **BLOCKED**, never PASS. Retain no captured secrets in evidence.
