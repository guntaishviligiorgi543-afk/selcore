# Selcore authentication requirements

Updated 11 October 2026. This document supersedes the former mandatory OTP-before-every-password-change requirement. Historical audit evidence remains valid for the settings/version it examined.

- Supabase Auth generates/verifies exactly eight-digit email OTP. Registration requires native confirmation; first login requires distinct application login approval; browser trust lasts an absolute 48 hours, after which protected access requires OTP again.
- Normal authenticated password change collects current password, new password and confirmation. Supabase Auth verifies the current password; incorrect passwords are rejected. No email OTP is required. New-password confirmation is a UI error-prevention check, not a server authentication factor.
- Recovery requests use native `resetPasswordForEmail`; the recovery email must present `{{ .Token }}` and the browser verifies the eight-digit code with `verifyOtp({ email, token, type: 'recovery' })` before reset. No old password is required.
- Email changes require native verification of both addresses. Preserve account ownership/RLS, native password-strength/rate/session protections and server-side approval/revocation controls.
- No frontend metadata, recovery marker, timestamp or optional Edge wrapper substitutes for server enforcement. Protect direct API access and revoke application approval using authoritative private state.

Local normal flow: native `signInWithPassword` against the authenticated user's canonical email validates the supplied current password; verify returned UID; native `updateUser({password,current_password})` performs the update. Passwords are neither compared locally nor stored/logged. The fresh password session satisfies native recent-session requirements while retaining secure password change. A new native session requires a new application approval binding; never transfer approval on a frontend assertion.

Native current-password enforcement securely covers password-method sessions, but recovery/OTP-method exemptions mean it is not universal across direct Auth calls. Recovery exemptions are intentional; repeated mutations in those sessions must be documented/tested. The native endpoint does not accept new-password confirmation and cannot enforce matching a second UI field. These limitations are not resolved by hiding the API.

The local recovery form is an OTP-entry flow. Its UI state only controls presentation; Supabase's verified recovery session authorizes `updateUser`. A recovery access token is still an authenticated JWT, so current RLS that accepts any confirmed owner can allow profile access during recovery. Hiding the dashboard does not secure the Data API. First-login/device approval and immediate credential-change revocation remain implementation/managed-test work.

See [recovery implementation notes](supabase-native-recovery-otp.md), [implementation plan](supabase-native-otp-test-project-plan.md), and [test matrix](supabase-native-otp-security-test-matrix.md). Production settings remain unchanged.
