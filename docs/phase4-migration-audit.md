# Selcore Phase 4.1 — profiles migration and security audit

Date: 2026-10-08. Target: **ffznkypurnocabqyxpps** only.

**The revised local migration is ready for an explicitly approved deployment. It has not been applied to production.** The readiness decision covers the SQL migration and its frontend contract; real email, OAuth, PostgREST profile access and production RLS remain postdeployment checks. This audit made no production writes, Auth setting changes, test accounts, Storage changes, commits, pushes or deployments. iVenue was never accessed.

## Production schema and compatibility

Read-only Supabase SQL inspection found PostgreSQL **17.11**, the expected Auth schema, and four public catalogue tables: categories, brands, products and product_images. All four have RLS enabled. The eight existing Storage tables also have RLS enabled. public.profiles, the private schema, and the proposed customer helper functions/trigger are absent. Existing auth.uid()/auth.jwt() are owned by supabase_auth_admin. No conflicting custom public/private functions or custom auth.users triggers were found.

The actual Auth columns used are id UUID NOT NULL (primary key), email_confirmed_at timestamptz nullable, raw_user_meta_data jsonb nullable, created_at timestamptz nullable, and is_anonymous boolean NOT NULL. These match the migration. The postgres migration role is **not a superuser**, has BYPASSRLS, and has SELECT/REFERENCES/TRIGGER permissions on auth.users. Anonymous/authenticated customer roles have no inherited role memberships.

Catalogue counts remain **4 categories / 17 brands / 24 products / 24 images**. Both customer roles have SELECT only on these tables; INSERT, UPDATE and DELETE are denied. The four existing public read policies were identical in the before/after audit; Storage has no customer policies. The revised migration never references catalogue or Storage tables.

Recorded read-only fingerprints for future comparison (refresh immediately before deployment):

- Products: 933d334e11f7e720eb1ff65f330a29c4
- Product images: 773e32ab0277e46417521b539514701f
- Storage objects: 4e71a823a8bf6c1a3d5139db3abd55ef

Remote migration history:

| Version        | Name                                 |
| -------------- | ------------------------------------ |
| 20261008124517 | create_selcore_catalog_phase1        |
| 20261008125807 | create_product_images_storage_bucket |

These two original SQL files were recovered **locally from read-only migration-history queries**, without executing them. Their contents match the stored remote statements, allowing CLI history comparison without recreating existing tables. The pending profiles version 20261008000000 predates both remote versions. The deployment procedure therefore requires an explicit dry run with --include-all, and approval of exactly this one pending migration. Do not repair remote history or reapply historical catalogue/Storage migrations.

## Problems corrected locally

1. Missing-profile frontend creation previously coerced object/array metadata to display strings, admitted blank names, and truncated UTF-16 code units. It now accepts strings only, trims them, bounds names to 100 Unicode code points and falls back to Customer for fewer than two characters.
2. SQL trigger/backfill normalization now follows the same creation rule, including the JavaScript trim character set. Objects, arrays, numbers, nulls and whitespace cannot become malformed names. Unicode truncation preserves complete characters.
3. Name validation consistently requires 2–100 characters, with a total stored length cap. Profile editing still sends only full_name; application business logic is unchanged.
4. Backfill now uses coalesce(created_at,now()) because the inspected Auth creation column is nullable.
5. Existing profiles/private schema or a conflicting signup trigger cause an explicit early exception. The migration runs once as postgres in one BEGIN/COMMIT transaction. Reapplication fails safely instead of overwriting data or concealing an incompatible schema.
6. Optional avatars are length bounded and require an HTTPS URL shape with a nonempty authority and no whitespace. The current UI does not display or fetch avatars. This is not a general-purpose URL parser.
7. Applied migration history is now present locally. No production history was modified.

## Profiles, permissions and RLS

The table contains id, full_name, avatar_url, created_at and updated_at. id is a UUID primary key/FK to auth.users(id), with ON DELETE CASCADE for Auth-managed account deletion. Email, passwords, roles and verification flags are not copied into editable profile columns. The UI obtains email from the server-validated Auth user.

| Actor/action                               | Result                                                                |
| ------------------------------------------ | --------------------------------------------------------------------- |
| Verified, non-anonymous owner SELECT       | Own row only                                                          |
| Verified owner INSERT                      | Own ID, name, optional avatar only; supports missing-profile fallback |
| Verified owner UPDATE                      | Own name/avatar only; UI updates name only                            |
| Another customer's SELECT/UPDATE           | Zero rows visible/affected                                            |
| Foreign-ID INSERT                          | RLS denial                                                            |
| Customer ID/created_at/updated_at changes  | Column privilege denial                                               |
| Customer DELETE/TRUNCATE                   | No permission                                                         |
| anon role                                  | No table privileges                                                   |
| Unverified or Supabase anonymous Auth user | No profile rows accessible                                            |

SELECT and UPDATE have ownership predicates; INSERT and UPDATE WITH CHECK also require the current Auth UUID and server-side verification. The primary key indexes the UUID predicates. Authenticated users have column INSERT/UPDATE grants, not unrestricted table write grants. There is no DELETE policy or grant. A timestamp trigger controls updated_at.

Verification reads auth.users for auth.uid(), requires a confirmed email and rejects is_anonymous. User-editable metadata is display text only; forged role/ID/verification metadata does not authorize access. Deleting the Auth record also makes the verification predicate false even if an older JWT exists.

## Trigger and function review

The signup trigger is AFTER INSERT ON auth.users. It invokes private.selcore_new_profile() as its postgres owner, inserts NEW.id, normalizes display metadata and uses ON CONFLICT(id) DO NOTHING. Existing profiles are preserved. All Auth users receive a row, including users awaiting verification; customer RLS hides those rows until Auth confirms the account.

All four helpers set an empty search_path and use qualified application/Auth objects. There is no dynamic SQL or metadata-controlled identifier. Only the signup and current-customer verification helpers are SECURITY DEFINER. The metadata and timestamp helpers are invokers. PUBLIC/anon/authenticated execution is revoked on the three internal helpers; authenticated can execute only the argument-free verification boolean helper. anon has no private-schema usage. Keep private outside the exposed Data API schemas.

The trigger and backfill use identical normalization. The frontend fallback uses the same rule, inserts only its authenticated UUID/name, and handles a unique violation with one bounded re-read. This is recovery for a missing row; the database trigger is the normal signup path.

Malformed supported metadata no longer causes predictable name/length failures. Unexpected permission/schema/database failures still fail the signup transaction instead of silently losing a profile; investigate Auth/Postgres logs if such an operational failure occurs. No broad exception handler hides errors. Existing Auth users are backfilled without changing any Auth fields; the table creation guard prevents overwriting an older profiles table.

## Frontend and secrets review

Reviewed auth-service.js, auth-ui.js, supabase-client.js, user.js, user.html, account.js, store.js and the profile call sites. Profile queries select exactly the five SQL columns, use the SDK's customer session and filter the verified UUID. Returned IDs/account changes are checked. The frontend calls getUser() to validate restored sessions, rejects unverified/anonymous accounts, and uses Auth email rather than writable metadata for identity.

Verified OAuth users follow the same UUID path. Missing/unusable provider names become Customer. Email confirmation grants access to the existing row without needing another profile sync. Profile failures show fixed, safe messages. Names and emails render through textContent/value; HTML-like metadata remains inert display text. The header/user UI adds no privileged profile operation.

The browser contains only the permitted publishable key. A secret-pattern scan of **23 application/migration files** found no administrative keys, privileged service-role JWTs, personal access tokens or database connection passwords. Related logging contains no credentials, passwords or tokens. This is a targeted code review/pattern scan, not a claim to scan personal credential stores. Official SDK session persistence is retained. No administrative credential was added to source, Git, test artifacts or this report.

The original official SDK **2.110.7** remains unchanged; SHA256:
2697f51bb3efa5f10b5b0bca2a39b3772b1b8f810e6885e3bb8d69c3242d5e07

## Verification evidence

| Requested runtime behavior  | Evidence                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Migration executes          | Exact draft executed in isolated PostgreSQL                                                                 |
| RLS enabled                 | pg_class assertion                                                                                          |
| New-user profile            | Insert as isolated supabase_auth_admin invokes exact signup helper                                          |
| Existing-user compatibility | Backfill names, missing/null metadata and null creation date                                                |
| Own SELECT                  | One owner row                                                                                               |
| Other SELECT                | No rows                                                                                                     |
| Own UPDATE                  | Name/avatar succeed; timestamp changes                                                                      |
| Other UPDATE                | No rows affected                                                                                            |
| Anonymous denial            | SELECT/INSERT/UPDATE/DELETE and helper invocation rejected                                                  |
| ID modification denial      | SQLSTATE 42501 column restriction                                                                           |
| Malicious metadata          | 11 trigger cases including forged role/ID, objects, arrays, blanks, long Unicode and HTML                   |
| Duplicate handling          | SQLSTATE 23505 fallback; exact signup helper ON CONFLICT preserves profile                                  |
| Catalogue unaffected        | Isolated before/after rows, columns, constraints, RLS, policies and grants; Storage fixtures also identical |

Final isolated result: **94 assertions passed, zero failed**, including actual PostgreSQL role/RLS tests and execution of the real frontend profile methods. No RLS mock is used for these SQL tests.

Docker's engine is unavailable. The pinned audit-only @electric-sql/pglite **0.5.8** dependency runs PostgreSQL **18.3** in memory with minimal Auth/catalogue/Storage fixtures. The exact draft executes as its postgres owner. PGlite does not support ALTER ROLE, so a supplemental test substitutes only the literal owner-role name and runs the same SQL as an existing NOSUPERUSER/BYPASSRLS role with the observed required Auth permissions; signup through the provider role also succeeds. Runtime tests do **not** prove production PostgreSQL 17.11, GoTrue or PostgREST integration. The draft uses standard SQL features available on 17; verify the deployed environment afterward. Test development corrected an expected CHECK violation code and adapted to PGlite's ALTER ROLE limitation; no final test errors remain.

The full headless Edge Phase 4 regression passes: **599 / 599 assertions**, zero failed. Authentication/profile browser flows remain explicitly mocked; real Auth requests are blocked. The read-only live preflight retrieves the original **24 products, 4 categories and 17 brands**, verifies IDs/prices/specifications/demo flags, and downloads all **24 images** with matching original hashes. Cart/favorites and disabled checkout checks pass. No production test account was created.

JavaScript syntax (auth-service.js, audit runner and SDK), git diff --check and Prettier checks pass. Security Advisor returned **zero findings** before and after the audit; it covers the current unapplied production schema, not the proposed profiles objects.

Reproduce local tests:

```powershell
npm.cmd ci --prefix tests/profile-audit --ignore-scripts --no-audit --no-fund
node tests/profile-audit/run.cjs
node tests/phase0.test.js
npx.cmd prettier --check .
```

Machine-readable SQL/contract results: phase4-migration-test-results.json. Browser results: phase4-browser-results.json.

## Deployment procedure — instructions only, not executed

Do not execute the production push until deployment is explicitly authorized. Current authorization is audit-only.

1. Use the reviewed Selcore checkout. Confirm the public SDK URL and linked project marker both identify ffznkypurnocabqyxpps. Check the dashboard project URL/name directly. Never rely on a default project or use iVenue credentials. Keep private outside API exposed schemas; public must be exposed for profiles. Confirm current backup/PITR arrangements and record the preflight catalogue/Storage fingerprints and counts.
2. If config.toml is absent (it is absent at audit time), initialize **local CLI configuration only**, without --force. Review its generated configuration. This does not authorize changing remote Auth settings.
3. List remote history and require the two known versions below to match the recovered local SQL. If history has changed, stop and re-audit rather than repair history. Only the profiles version should be pending.
4. Refresh schema/privilege preflight in Selcore's SQL Editor as postgres: profiles/private must still be absent; no conflicting signup trigger; Auth types and postgres SELECT/REFERENCES/TRIGGER permissions unchanged; customer permissions/policies unchanged. Inspect Auth aggregate counts and allow for backfill/transaction locks. Existing users should all receive profiles; no existing customer table may be overwritten.
5. Run the dry run. Require **exactly** 20261008000000_selcore_customer_profiles.sql pending. The recovered catalogue/bucket files must be recognized as already applied. --include-all is necessary only because this reviewed migration's timestamp predates remote history. --skip-vault prevents unrelated Vault configuration writes. Do not include seed data or roles, use --debug, pass passwords in command arguments, or run a history repair.
6. Only after explicit approval and a clean dry run, run the one production push command. The SQL's BEGIN/COMMIT makes DDL, grants, trigger and backfill atomic; no table recreation commands for existing catalogue/Storage objects should run.

```powershell
Set-Location -LiteralPath 'C:\Users\My Computer\OneDrive\Desktop\selcore'
$selcoreProjectRef = 'ffznkypurnocabqyxpps'
if ((Get-Content -LiteralPath 'supabase/.temp/project-ref' -Raw).Trim() -ne $selcoreProjectRef) {
  throw 'Wrong linked project: stop'
}
if (-not (Test-Path -LiteralPath 'supabase/config.toml')) {
  npx.cmd --yes supabase@2.120.0 init
  if ($LASTEXITCODE -ne 0) { throw 'Local CLI initialization failed' }
}
npx.cmd --yes supabase@2.120.0 migration list --project-ref $selcoreProjectRef
if ($LASTEXITCODE -ne 0) { throw 'History check failed' }
npx.cmd --yes supabase@2.120.0 db push --project-ref $selcoreProjectRef --include-all --skip-vault --dry-run
if ($LASTEXITCODE -ne 0) { throw 'Dry run failed: do not deploy' }

```

Stop after the dry run. Review exactly one pending file and obtain explicit deployment approval. Only then execute this separate command:

```powershell
npx.cmd --yes supabase@2.120.0 db push --project-ref ffznkypurnocabqyxpps --include-all --skip-vault
if ($LASTEXITCODE -ne 0) { throw 'Deployment failed: inspect before retrying' }
```

Use the existing CLI login or its secure interactive credential mechanism if needed. Do not paste secret keys/passwords into source, terminal command text, reports or debug logs. The CLI options above were confirmed against version 2.120.0 help; no actual push/dry-run/init was run during this audit.

## Postdeployment verification checklist

- Run tests/profile-audit/verify-deployment.sql in the **Selcore** SQL Editor as postgres. It is read-only and returns schema/permission/aggregate information without private customer values. Confirm the new history version, UUID FK/cascade, constraints, postgres owners and profiles RLS.
- Require exactly the three reviewed owner/verified profile policies, no profile DELETE policy, and no new catalogue/Storage policy. All existing catalogue/Storage RLS and permissions must match preflight.
- Inspect private helper search_path/SECURITY DEFINER/EXECUTE flags. Only the verification helper may be directly executed by authenticated; none by anon. Ensure private remains unexposed to the Data API.
- Confirm authenticated table SELECT only plus column INSERT(id/full_name/avatar_url) and UPDATE(full_name/avatar_url). ID/timestamps cannot be updated; timestamps cannot be inserted; no DELETE/TRUNCATE grants. Missing profiles and orphans should both be zero. Account counts may change during legitimate registrations, so compare one consistent snapshot.
- With separately approved isolated test accounts, verify real server-issued tokens through PostgREST: owner SELECT/UPDATE succeed, foreign SELECT/UPDATE affect zero rows, foreign INSERT and ID/timestamp edits fail, anon cannot access profiles. Check an unverified user and a Supabase anonymous Auth user cannot read/write profiles. Never substitute handcrafted unsigned JWTs or a service-role key for customer tokens.
- Test existing and newly registered users, confirmation/resend, verified Google OAuth if configured, logout/session restoration, recovery, absent-profile recovery, duplicate requests and safe metadata rendering through the actual frontend. Use local development redirects per the user's current preference; changing redirect/provider/SMTP settings needs separate authorization.
- Re-run node tests/phase0.test.js and npx.cmd prettier --check .; confirm 24 original product IDs/prices, all images accessible/hash matching, cart/favorites unaffected and checkout disabled.
- Compare catalogue/image/Storage fingerprints with the immediate predeployment snapshot. Security Advisor must have no new security findings. The zero-findings audit result predates profiles deployment.

## Failure recovery

If the migration fails before COMMIT, its transaction rolls back schema, privileges, trigger and backfill together. Inspect the error and re-read migration history/schema before retrying. If the connection result is ambiguous, check whether the profiles version and expected schema committed; do not blindly rerun or repair history. A rerun intentionally fails on existing profiles/private schema without overwriting data.

If the schema committed but CLI history recording failed, stop and reconcile through a reviewed administrative procedure only after proving which statements committed. Do not remove tables or mark arbitrary versions applied.

If postdeployment signup breaks, inspect Auth/Postgres logs privately for the precise trigger failure, keep existing customer profiles, and prepare a narrowly scoped forward migration with explicit approval. Disabling/replacing the trigger is an operational change requiring a separate reviewed fix; there is no automatic DROP TABLE, CASCADE rollback or customer-profile deletion instruction. Existing catalogue can continue independently. No destructive rollback is recommended.

## Files changed during this audit

- auth-service.js: targeted name validation/fallback normalization.
- supabase/migrations/20261008000000_selcore_customer_profiles.sql: local safety/normalization/constraint/backfill fixes.
- supabase/migrations/20261008124517_create_selcore_catalog_phase1.sql and 20261008125807_create_product_images_storage_bucket.sql: exact recovered applied history, not executed.
- tests/profile-audit/run.cjs, package.json, package-lock.json, .gitignore: pinned isolated runtime and real SQL/contract checks; node_modules is ignored.
- tests/profile-audit/verify-deployment.sql: read-only postdeployment verification.
- .prettierignore: adds only /docs/phase4-migration-test-results.json; existing SDK/generated exclusions retained.
- docs/phase4-migration-test-results.json and docs/phase4-browser-results.json: generated final evidence.
- docs/phase4-migration-audit.md: this report.

The Phase 4 HTML/CSS/store/UI changes already present before this audit were preserved. No frontend file beyond auth-service.js was edited during Phase 4.1. Historical Phase 4 report limitations remain historical; this report supplies the new isolated SQL verification.

## References and decision

Reviewed against [Supabase user-data/trigger guidance](https://supabase.com/docs/guides/auth/managing-user-data), [RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security), [Auth trigger troubleshooting](https://supabase.com/docs/guides/troubleshooting/dashboard-errors-when-managing-users-N1ls4A), [database function security guidance](https://supabase.com/docs/guides/database/functions), and [PGlite documentation](https://pglite.dev/docs/). These complement inspection of actual remote schemas and installed CLI/SDK behavior.

No unresolved security-critical defect was found in the revised draft. All final local checks pass. Production deployment and real integration checks are deliberately pending; they are required gates before claiming the authentication feature is operational in production. The migration may proceed through the explicit procedure once deployment is authorized.

MIGRATION AUDIT: READY FOR DEPLOYMENT
