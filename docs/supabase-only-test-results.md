# Supabase-only cleanup validation

Run on 11 October 2026, scoped to Selcore. No real Auth mutation, email, customer data write or deployment was performed.

| Existing suite | Result | Boundary |
| --- | --- | --- |
| `tests/phase43-auth.test.cjs` | 53 passed, 0 failed, before and after cleanup | Real SDK 2.110.7; mocked HTTP signup/login/PKCE/recovery/profile flows |
| `tests/phase43-security.test.cjs` | 56 passed, 0 failed, before and after cleanup | Captured historical production evidence and current frontend integrity/secret scan |
| `tests/profile-audit/run.cjs --deployed-snapshot` | 94 passed, 0 failed | Isolated PostgreSQL/RLS, deployed SQL snapshot |
| `tests/profile-audit/run.cjs` | 94 passed, 0 failed | Isolated PostgreSQL/RLS, preserved local profile draft |
| `tests/preview-server.test.cjs` | 65 passed, 0 failed | Loopback page/asset availability, MIME and restricted file serving |
| `tests/phase0.test.js` | 667 passed, 0 failed, final rerun after cleanup | Disposable Edge, local Auth/OTP component fixtures; read-only public catalogue/image preflight |
| Nine retired `tests/otp-*.test.cjs` suites | 235 passed, 0 failed before deletion | Local gateway mocks, crypto, isolated PostgreSQL, startup tripwires; no real Auth/SMTP |

Retired suite counts: adapters 25; phase1 boundary 14; phase2 schema 11; phase2 security 26; phase3 readiness 19; phase5a integration 15; private Auth contract 10; security 91; startup 24. They were run before deletion to record the removed prototype's controls. Container-specific private GoTrue/Mailpit integration runners were not started: their architecture is abandoned and not relevant to active hosted Supabase.

The first browser regression attempt failed because sandbox networking blocked the public catalogue. The authorized rerun passed, including 24 products, 4 categories, 17 brands and 24 public image downloads. The final browser regression also passed all 667 checks after replacing the obsolete gateway-disabled assertion with a gateway-absent assertion; provider-neutral OTP UI tests remain.

JavaScript syntax checks, `git diff --check`, unchanged product/image diff and all four migration SHA-256 checks passed. No active frontend gateway reference remains. References retained in security deny-path tests, historical docs, ignored recovery copies, credential ignore rules and the preserved unapplied migration are intentional.

Additional visual audit `tests/layout-restoration.cjs auth-refresh --local-catalogue`: initial sandbox run failed with `CDP timeout: Page.enable`; authorized rerun completed 10 signup/signin captures at 1440, 1024, 768, 390 and 320 pixels with no overflow, exceptions or asset errors. The desktop signin screenshot was also visually inspected.

These results establish local regression compatibility, not live email delivery, production password login/recovery, current private SMTP/OTP configuration or current production RLS. The captured security checks use historical snapshots. The repository remains uncommitted; existing generated result reports were refreshed by their test scripts.
