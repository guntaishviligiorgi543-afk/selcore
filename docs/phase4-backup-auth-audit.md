# Phase 4 backup and production authentication audit

Audit date: 9 October 2026. Project: `ffznkypurnocabqyxpps` only.

## Backup review

The existing branch is `main`, at reference `830aaff` before this backup. Its remote is `https://github.com/guntaishviligiorgi543-afk/selcore.git`; fetching confirmed local and remote history initially matched.

Reviewed changes include the seven page integrations, shared authentication service/navigation, account forms/dashboard, account and guest cart/favorites separation, scoped layout restoration, local preview tooling, regression tests, migration drafts and audit evidence. No application logic or design was changed during this backup/audit.

The official SDK remains version **2.110.7**, byte unchanged, with SHA-256 `2697f51bb3efa5f10b5b0bca2a39b3772b1b8f810e6885e3bb8d69c3242d5e07`. Syntax validation passed. Existing SDK/vendor Prettier exclusions remain intact.

Scanning all 658 initial tracked/untracked backup candidates found no Supabase secret or management keys, GitHub credentials, private keys, AWS keys, literal database password URLs or JWT credentials. Literal token/password fixtures were reviewed: they are synthetic values used only by isolated tests, with fake UUIDs and `.invalid` email addresses. Test output contains assertion results, not request credentials or customer records. Production SQL snapshots contain schema/history metadata rather than individual customer data. Screenshots contain synthetic local test states; none used production users. No individual file exceeds GitHub's 100 MiB file limit.

Dependency directories, local environment credentials, Supabase CLI temporary metadata and the machine-specific layout runtime pointer are excluded from Git. Historical screenshots and reproducible test evidence remain part of the backup.

## Automated verification

| Check                                                                | Result               | Actual scope                                                                                                                       |
| -------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Complete browser regression, `node tests/phase0.test.js`             | 612 passed, 0 failed | Actual isolated Edge browser; production catalogue/image GET preflight; Auth/profile flows mocked and real Auth mutations blocked. |
| Pinned SDK integration, `node tests/phase43-auth.test.cjs`           | 51 passed, 0 failed  | Real SDK 2.110.7 and app Auth service with in-memory HTTP fixtures.                                                                |
| Profiles SQL, `node tests/profile-audit/run.cjs --deployed-snapshot` | 94 passed, 0 failed  | Deployed SQL snapshot executed only in isolated PGlite/PostgreSQL 18.3; ownership/grants/RLS tested with isolated roles.           |
| Security evidence, `node tests/phase43-security.test.cjs`            | 56 passed, 0 failed  | Captured read-only production metadata, public endpoint denial and frontend/SDK integrity; not a real customer-token test.         |
| Preview server, `node tests/preview-server.test.cjs`                 | 61 passed, 0 failed  | Loopback server, seven pages, 21 assets, stylesheet access and private-path/method restrictions.                                   |

Total: **874 passed, 0 failed**. Live preflight verified **24 products, 4 categories, 17 brands** and all **24 image downloads** against original bytes. Cart, favorites, product details, search/filtering, authentication UI, responsive behavior and disabled checkout remain covered. Prettier and final staged whitespace checks are required before the commit.

## Production Auth configuration: verified read-only

The CLI's `config pull --help` was inspected before use. A pull into a disposable local directory confirmed the URL configuration. The complete Management API **GET** `/v1/projects/ffznkypurnocabqyxpps/config/auth` then used the existing CLI's Windows credential in memory. No credential or raw response was printed, stored in Git or added to frontend code; only allowlisted non-secret fields were retained in [the configuration evidence](phase4-backup-auth-config.json). Temporary configuration files were removed.

| Setting                                                                | Current value                                      | Frontend consequence                                                                                                                                                              |
| ---------------------------------------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email/password                                                         | Enabled; signup allowed                            | Compatible with `signUp` and `signInWithPassword`.                                                                                                                                |
| Email confirmation                                                     | Required                                           | Matches the frontend's verified-email requirement and profile RLS. Keep enabled.                                                                                                  |
| Site URL                                                               | `http://localhost:3000`                            | Does not match the local preview at port 8080.                                                                                                                                    |
| Redirect URL allowlist                                                 | Empty                                              | The requested account callbacks are not allowed; confirmation, recovery and future OAuth callbacks are blocked/misdirected by this configuration.                                 |
| Custom SMTP                                                            | Not configured                                     | General customer email testing cannot use unrestricted recipients.                                                                                                                |
| Email send limit                                                       | 2/hour; minimum interval 60 seconds                | Registration confirmation, resend and recovery tests must respect the server limits. The UI's resend/recovery cooldown is 60 seconds.                                             |
| Confirmation/recovery templates                                        | Returned content includes `{{ .ConfirmationURL }}` | Compatible with requested redirects and the existing PKCE exchange handler once URLs are configured. Presence of content alone does not establish that a template was customized. |
| Email OTP expiry                                                       | 3600 seconds                                       | Expired email links require a new request. PKCE exchange codes have their separate lifecycle.                                                                                     |
| Google OAuth                                                           | Disabled; no client ID configured                  | The frontend correctly reports Google unavailable. Real Google login cannot succeed yet.                                                                                          |
| Anonymous sign-ins                                                     | Disabled                                           | Matches the verified, non-anonymous profile requirement.                                                                                                                          |
| Minimum password length                                                | 6 on server; 8 in frontend                         | The frontend enforces the stricter rule. Not a flow blocker, but server policy does not enforce the same minimum for direct API clients.                                          |
| CAPTCHA, compromised-password checks, password-change reauthentication | Disabled                                           | No current frontend compatibility blocker from those settings. They were not changed.                                                                                             |

The frontend explicitly requests same-origin `user.html` for signup, resend, recovery and Google, uses PKCE, exchanges callback codes with the official SDK and validates sessions through `getUser`. It rejects unsupported token-hash/implicit callbacks; templates must retain the supported confirmation-link flow. Links should open in the originating browser and origin because the PKCE verifier is stored there.

## Required configuration before controlled testing

An authorized administrator should review and configure these values; this audit changed none:

1. For the currently requested local development, set the Site URL to `http://127.0.0.1:8080` and add the exact callback `http://127.0.0.1:8080/user.html` to the redirect allowlist. If the localhost alias is used, also allow `http://localhost:8080/user.html`. Use one origin consistently during each PKCE flow. An eventual production domain requires its own reviewed HTTPS URL and callback.
2. Configure a verified custom SMTP sender/provider for testing with customer addresses. Otherwise restrict explicitly approved tests to authorized project-team email addresses and the current 2/hour limit. Delivery, sender domain and provider limits still require real, approved tests. [Supabase SMTP guidance](https://supabase.com/docs/guides/auth/auth-smtp), [redirect guidance](https://supabase.com/docs/guides/auth/redirect-urls).
3. For Google testing, configure the Google Web OAuth client and consent/test-user settings. Its provider redirect is `https://ffznkypurnocabqyxpps.supabase.co/auth/v1/callback`; configure local JavaScript origins where supported, store the client ID/secret only in Supabase provider settings and enable Google after authorization. Supabase must also allow the frontend's `user.html` callback. [Google OAuth guidance](https://supabase.com/docs/guides/auth/social-login/auth-google).

No production users were created and no emails were sent. Real registration, email delivery/verification, server-issued customer profile access, password recovery/update/new-password login and Google consent remain manual integration tests after configuration and explicit approval.

**Readiness: not ready for controlled production authentication testing under the current configuration.** Local implementation tests pass, but URL configuration and email delivery must be addressed first; Google has its additional provider setup requirement.

## Migration history and safe reconciliation

| Migration         | Local                                                   | Production                                                      |
| ----------------- | ------------------------------------------------------- | --------------------------------------------------------------- |
| Catalogue         | `20261008124517_create_selcore_catalog_phase1`          | Same version/name; captured SQL matches.                        |
| Image bucket      | `20261008125807_create_product_images_storage_bucket`   | Same version/name; captured SQL matches.                        |
| Customer profiles | `20261008000000_selcore_customer_profiles` review draft | **`20261009140454_selcore_customer_profiles`** already applied. |

Fresh remote history and SQL hashes match the Phase 4.3 evidence. The deployed profiles SQL and local draft have equivalent executable statements; differences are review comments and blank lines. The old timestamp remains an active local migration and must not be pushed/reapplied as a new migration. Security Advisor again returned **zero findings**.

Recommended future **local-only** reconciliation after review:

1. Archive `20261008000000_selcore_customer_profiles.sql` outside `supabase/migrations`.
2. Recover the already applied SQL as `supabase/migrations/20261009140454_selcore_customer_profiles.sql`, using the reviewed production ledger snapshot in `docs/phase43-production-profiles.sql` and preserving the applied identity.
3. Compare local/remote migration history again; confirm all three versions match and review any future migration plan before deployment.

No production ledger repair is needed. Do not use `migration repair`, `db push --include-all`, or rerun either profiles migration. This recommendation supersedes historical Phase 4 reports describing an undeployed profile table or deployment of the old draft. **Neither local migration identities nor the production ledger were changed during this task.**

## GitHub Pages safeguard

Read-only GitHub API inspection confirmed an existing live Pages site, `build_type: legacy`, publishing from **`main` / `/`**, with an active generated `pages-build-deployment` workflow. A normal push to the requested branch would also publish the frontend. GitHub documents automatic branch publication; ordinary commit skip instructions are not a sufficient guarantee for the generated Pages build event. [Publishing source documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site).

The backup must only be pushed with a verified deployment safeguard. The intended reversible safeguard is to pause the Pages workflow, verify it is disabled, push the reviewed commit, then restore its original workflow state without dispatching a build and verify the deployment history. If GitHub does not support pausing this generated workflow, keep the verified local commit and stop before pushing; report the conflict for a repository owner to resolve. Do not unpublish the live site or change its publishing source automatically.

No frontend/database deployment, production authentication change, migration execution, real account/email test, product/Storage modification or iVenue access is authorized or performed by this audit.
