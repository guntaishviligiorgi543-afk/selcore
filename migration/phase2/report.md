# Phase 2 results — 2026-10-08

Current result: **Phase 2 complete**; see [final-report.md](final-report.md). All 24 images are uploaded and verified; catalogue counts are 4 categories, 17 brands, 24 products, and 24 primary images. The following report records the earlier preparation stage and does not describe current remote state.

## A. Source Catalogue

Canonical source: `products.js`; no duplicate array in `allproducts.js`. `store.js`, `product.js`, `cart.js`, HTML script references, and the image directory were inspected. Found 24 products with IDs 1–24, four categories, and 17 brands.

Categories: mobile (6), laptop (6), tablet (5), accessory (7).

Brands: Acer, Apple, ASUS, Dell, Google, HP, Huawei, JBL, Lenovo, Logitech, Microsoft, Nothing, OnePlus, Razer, Samsung, Sony, Xiaomi. Exact capitalization preserved.

All 24 referenced images are present, distinct PNGs; total original bytes 4,442,378. Seven other PNGs are branding/favicon assets and excluded. No description or stock data exists in the source. Release year, sold count, accessory subtype, and original sale flag are retained in the source snapshot because the remote schema lacks dedicated columns. Technical specifications are kept exactly as `features`, including brand.

## B. Database Migration

Only Selcore project `ffznkypurnocabqyxpps` was accessed. Inspected actual column types, identities, constraints, foreign keys, indexes, grants, policies, and migration history. Existing phase-one migration is `20261008124517_create_selcore_catalog_phase1`; all four tables are empty.

Prepared targets: `public.categories`, `public.brands`, `public.products`, `public.product_images`. Actual inserted records: **0**. Actual skipped records: **0**; seeds were not run. Existing data conflicts discovered: **0**. Source ID preservation and seed mapping of 1–24 passed locally; remote ID preservation is pending.

Catalogue SQL preserves exact names, prices and specifications, uses GEL, zero stock, active true, purchasable false, and maps both flags. Names and slugs are checked before inserting lookups. Existing product fields are compared exactly; conflicting records abort rather than update. Matching records are skipped. No table recreation, drops, truncation, RLS disabling, schema changes, or unrelated object changes were performed.

## C. Storage Migration

`product-images` bucket is absent. Images uploaded: **0**. Failed uploads: **0**, because no upload was attempted. Missing local product images: **0**. Expected images not present remotely: **24**. Image rows inserted: **0**. Public image URLs and download bytes have **not** been verified.

Blocker: the connected Supabase tools have no authenticated Storage upload operation and the Supabase CLI is unavailable. Following the user's explicit stop condition, preparation ended before any remote mutation. No secret keys/passwords were requested, obtained, logged, or added to files. No Storage policies were weakened.

The manifest provides original paths, target bucket/object paths, expected public URLs, SHA-256, byte length, PNG dimensions, MIME type, product association, primary-image flag, order, and alternative text. Hash-based paths avoid ambiguity and let a future trusted workflow verify existing objects before skipping uploads. Upload with `upsert: false`; verify public downloads against hashes before registering image records.

## D. Security

RLS was verified enabled for all four catalogue tables and both Storage tables. For anon and authenticated, SELECT is permitted on each catalogue table; INSERT, UPDATE, DELETE, and TRUNCATE privileges are all false. Actual read-only role queries succeeded and returned zero catalogue rows for each role.

Product SELECT policy is `is_active`; image SELECT policy requires an active parent product. Categories and brands are publicly readable. Inactive-row exclusion was verified from policy definitions, **not with a runtime inactive fixture** because the database is empty and remote writes were stopped.

Storage has no policies granting anonymous or ordinary authenticated writes; RLS denies these operations despite underlying standard Storage table grants. No bucket or image URL exists yet to test through HTTP. Security advisor executed against Selcore and returned **zero findings**. No new policies or SECURITY DEFINER functions were introduced.

## E. Testing

Executed successfully:

- `node migration/phase2/prepare.cjs`, then regeneration after independent verification.
- `node migration/phase2/verify.cjs`, twice: exact source snapshot, IDs, names, category/brand sets, prices, specs, flags, demo purchase settings, image/product associations, original SHA-256 hashes, PNG signatures/dimensions, byte counts, and unchanged hashes for 54 frontend/image/test files.
- JavaScript syntax compilation for existing JS files through Node's VM parser.
- `git diff --exit-code -- . ':(exclude)migration'`: no changes outside migration artifacts.
- Remote schema/history/policy/grant inspection, RLS checks, effective customer write privilege checks, read-only queries under both customer roles, and Supabase security advisor.

Failures in executed integrity/security checks: **0**. Prepared SQL runtime/syntax, post-migration counts and equality, repeat-run remote idempotence, live uploads/downloads, API write-denial requests, inactive fixture behavior, and browser interactions remain unexecuted. Phase 0's prior 402 browser assertions were not rerun and are not counted as Phase 2 test results.

## F. Files Changed

All files are newly created under `migration/phase2/`:

- `prepare.cjs` — offline artifact generator.
- `verify.cjs` — independent offline integrity checker.
- `source-catalogue.json` — full original data plus mapped rows and source hash.
- `image-manifest.json` — 24 original-to-Storage mappings.
- `seed-catalogue.sql` — guarded repeatable category/brand/product inserts.
- `seed-images.sql` — guarded repeatable registration after verified uploads.
- `verify-catalogue.sql` — remote counts, exact field equality, image existence, and policy inspection.
- `frontend-baseline.json` — hashes of 54 preserved files.
- `remote-schema.json` — inspected table schema and migration history.
- `README.md` — execution plan, schema differences, safe upload rules, limitations.
- `report.md` — this report.

No frontend file was modified. No deployment, Git commit, or push occurred. No remote data or configuration was changed.

## G. Final Status

Authenticated administrative Storage upload access is required before proceeding. The migration package is prepared and locally verified; the actual database and image migration has not been applied.

**PHASE 2 STATUS: BLOCKED**
