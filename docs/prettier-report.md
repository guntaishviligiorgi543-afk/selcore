# Prettier investigation and fixes

## Root cause

There was no project Prettier configuration, no .prettierignore, and no root package script for formatting. Prettier 3.9.9 initially reported 41 style warnings and one parse error. Application and handwritten migration/test files had genuine formatting differences. Generated reports and CLI metadata were unnecessarily included.

The parse error was in vendor/supabase-2.110.7.js, line 24, column 33: `new(n || = Promise)`. The saved SDK bundle already contained invalid JavaScript when this task began. The operation that damaged it has not been identified; the investigation does not establish that Prettier caused the corruption. The installed official package copy has a different hash and valid syntax.

## Files responsible and changes

The following 34 failing handwritten files received formatting only:

- allproducts.css, allproducts.html, allproducts.js
- cart.css, cart.html, cart.js
- catalogue-service.js
- checkout.css, checkout.html
- contact.css, contact.html
- favorites.js, index.html
- product.css, product.html, product.js
- script.js, signForm.css, store.js, style.css, supabase-client.js
- user.html, user.js
- tests/live-catalogue.cjs, tests/phase0.test.js
- migration/phase2/final-report.md, migration/phase2/prepare.cjs, migration/phase2/README.md, migration/phase2/resume-report.md
- migration/phase2/runtime/admin-storage.cjs, migration/phase2/runtime/diagnose-cli.cjs, migration/phase2/runtime/package.json
- migration/phase2/verify-downloads.cjs, migration/phase2/verify.cjs

The seven remaining style warnings were in protected/generated files: products.js, docs/phase3-browser-results.json, docs/phase3-security-results.json, migration/phase2/final-verification.json, migration/phase2/remote-schema.json, migration/phase2/upload-results.json and supabase/.temp/linked-project.json. The SDK produced the separate parse error.

Added .prettierrc.json with explicit standard settings (80 columns, two spaces, semicolons, double quotes, trailing commas and LF). Added .prettierignore and this report. The regression runner refreshed docs/phase3-browser-results.json with the actual failure results.

## Exclusions

.prettierignore excludes nested node_modules, the exact SDK and vendor license paths, minified JS/CSS, root dist/build/coverage output, generated Phase 2 JSON snapshots, Supabase .temp metadata and the two generated Phase 3 JSON reports. products.js is an immutable legacy migration dataset that is no longer loaded by the application and whose byte preservation is enforced by existing regressions. Live application JavaScript and test/migration source remain included.

Prettier recommends a root ignore file for generated assets; see https://prettier.io/docs/ignore.

## Verification

`npx.cmd prettier --check .` passed after exclusions and formatting. Hash verification confirmed all 37 protected files were unchanged, including the SDK, legacy product data, source catalogue, image manifest, SQL seeds and original images.

`node tests/phase0.test.js` ran: the live read-only preflight passed (24 products, 4 categories, 17 brands and 24 original public images), but the browser suite failed because the unchanged damaged SDK cannot initialize. Results: 66 passed, 52 failed, 118 reached; remaining suites could not complete normally. These are cascading initialization failures and do not establish a formatting regression.

## Outstanding issue and safety

The SDK syntax error remains. Restoration from the existing official package was requested as an explicit exception to the user's instruction not to modify the generated bundle. It must be approved before the damaged bundle is replaced. No database, RLS, Storage, credentials or product data were changed. No iVenue access, commit, push or deployment occurred.

PRETTIER STATUS: PARTIALLY FIXED
