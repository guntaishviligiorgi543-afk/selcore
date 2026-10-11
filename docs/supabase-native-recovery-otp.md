# Native recovery OTP implementation

11 October 2026. The local recovery flow now sends `resetPasswordForEmail(email)`, displays the existing accessible eight-digit OTP component, calls `verifyOtp({ email, token, type: 'recovery' })`, and only then presents the new-password form. It never passes an old password during recovery.

The recovery email request gives the same confirmation text for every address. The UI has a 60-second resend countdown, but Supabase Auth controls actual sending, expiry, verification and rate limits. The browser keeps the requested email and UI challenge deadlines only in memory. It never writes the code to localStorage, sessionStorage, URLs or application logs. A sessionStorage marker contains only the verified user ID so a verified recovery form can resume after refresh; it does not authorize a reset. Supabase's recovery session is the native authority and `updateUser` still decides whether the update is accepted.

After a successful reset, Selcore signs out the local recovery session and returns the person to normal sign-in. The recovery dashboard is hidden while the recovery UI is active. This reduces accidental application use, but it cannot restrict direct Supabase API calls.

## Hosted template prerequisite

No hosted template was read or changed. Before enabling this flow, inspect the **Recovery** template in the managed test project and make its intended content use the native code variable:

```html
<p>Your Selcore password-reset code is: {{ .Token }}</p>
```

The production Recovery template must be reviewed and changed only in a separately authorized production task. A template that uses `{{ .ConfirmationURL }}` sends a link and does not satisfy this user-facing OTP flow. Confirm rendered output is eight decimal digits with the configured 3600-second expiry. Resend SMTP delivery, rate-limit behavior and template rendering require managed-project tests; none were performed locally.

## Security boundary

`verifyOtp` returns a normal authenticated Supabase session marked as password recovery server-side. Browser state is not proof of that state. Existing RLS admits confirmed owners and does not require a session approval/device trust record, so a recovery session may directly read or update its permitted profile rows through the Data API. The UI cannot fix that. A managed test must establish the exact recovery-session JWT/RLS behavior and later server-side approval policies must reject unauthorised recovery-session data access if the product policy requires it.

A user who bypasses the UI can call native Auth APIs directly. Native Auth verifies recovery OTP and session validity, but recovery sessions intentionally do not require the old password for password reset. The current-password setting protects normal password-session changes; it does not turn recovery into an old-password flow. The former fresh-password-change OTP requirement remains withdrawn.

## Manual managed-project checks

1. Use an isolated managed test project with the confirmed settings and a no-send capture hook. Do not run this against production.
2. Confirm the Recovery template has `{{ .Token }}`, capture the generated code privately, and check it is exactly eight digits.
3. Request recovery for a synthetic existing and nonexistent address. The page response must be identical; inspect only authorized test mail capture for delivery behavior.
4. Verify valid, invalid, expired and replayed codes. Confirm `type: recovery` is used, the form stays hidden until success, and a new password works only with the verified recovery session.
5. Test resend after 60 seconds, native quotas, session expiry, a raw `/auth/v1/user` password update, and a raw profile Data API read using the recovery access token. Record actual behavior without tokens in evidence.
