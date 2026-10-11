> Superseded on 11 October 2026 by [Supabase-only architecture](supabase-only-architecture.md). Retained as historical evidence; private Auth, Railway and gateway instructions are no longer an implementation plan.

# Selcore Phase 4: isolated local integration testing

Completed 11 October 2026. This work used only the local Selcore repository,
synthetic values, `@example.invalid` identities, and an ephemeral Docker
network. It made no production Supabase request, Railway deployment, hosted
migration, customer account, email delivery, commit, push, or iVenue access.

## Environment and isolation

- Docker Desktop Linux Engine was reachable: client/server `29.8.1`.
- Private PostgreSQL used the local official image
  `public.ecr.aws/supabase/postgres:17.6.1.166`.
- Private GoTrue used the immutable v2.197.0 image
  `public.ecr.aws/supabase/gotrue@sha256:1736a63078f5922b198c4cbe50f80ab9a2d3b54fe8b7b6cfb2e9dc5dbbc12c6b`.
- The running services were `private-auth-db` (healthy) and `private-auth`.
  The gateway was deliberately not started: its source guard remains enabled.
- The Compose network reported `internal=true`. The Phase 4-only override
  bound GoTrue exclusively to `127.0.0.1:9999`; it was not published on a LAN
  or public interface. The test runner was an ephemeral container on the
  internal network with a read-only mount of its test script.
- GoTrue used its built-in no-op mail client. No SMTP or Resend credentials
  were configured and no email was sent.

## Real-container results

The real GoTrue suite passed **17 checks** against the private PostgreSQL
database. It verified:

1. GoTrue health and rejection of unauthenticated admin requests.
2. Synthetic signup, eight-digit proof issuance, verification, and proof
   replay rejection.
3. Login success, wrong-password rejection, and locally signed JWT validation.
4. Private-admin-only password mutation, followed by old-password rejection
   and new-password acceptance.
5. Synthetic recovery-proof generation and verification.
6. Private-admin-only email mutation.

The password and email mutations are GoTrue administrative fixtures. They do
not claim mandatory gateway OTP enforcement; the later gateway must bind those
operations to the custom OTP proofs before it can become a public credential
service.

## Local policy, security, and frontend results

All **396** existing local checks passed:

| Suite | Passed | Boundary |
| --- | ---: | --- |
| SDK and frontend adapter | 25 | loopback Auth mocks |
| Phase 1 startup/boundary | 14 | source/configuration only |
| Phase 2 schema | 11 | isolated in-memory PostgreSQL |
| Phase 2 OTP security | 26 | local mocks/static checks |
| Phase 3 readiness | 19 | configuration only |
| Private-Auth contract | 10 | loopback HTTP mocks |
| OTP/RLS security | 91 | isolated Postgres, crypto, loopback HTTP |
| Startup guard | 24 | child-process tripwires |
| Phase 4.3 authentication | 53 | mocked Auth responses |
| Phase 4.3 security | 56 | local source scan |
| Preview regression | 67 | loopback preview |

Together with the 17 real-container checks, **413 checks passed**. The policy
and schema suites cover the ten-minute expiry, five-attempt cap, 60-second
resend cooldown, atomic consumption/replay protection, concurrent requests,
and the 48-hour same-device proof rule. They are not a claim that the disabled
gateway performed those actions over HTTP.

## Remaining blockers

1. The production startup guard intentionally prevents the OTP gateway from
   starting. It remained active and the gateway was not tested as a live
   service.
2. The custom OTP gateway has not yet been connected to the private GoTrue
   adapter or made the sole public credential path. Until that reviewed cutover
   is complete, direct hosted Supabase Auth could still bypass the proposed
   mandatory OTP rules.
3. No real SMTP delivery occurred. The test intentionally used GoTrue's no-op
   mailer, so deliverability, Resend credentials, and actual 10-minute waiting
   behavior require a separately approved non-production staging exercise.
4. Hosted-data role deployment, identity migration, JWT/RLS cutover, and
   session invalidation remain staging and production tasks. None was applied.

## Next action

Review and approve a dedicated non-production gateway harness that preserves
the production guard outside the harness, then run the custom OTP HTTP flows
against private GoTrue, a private database, and Resend sandbox credentials.
Only after that passes should the planned hosted-data and frontend cutover be
considered for a staged deployment review.