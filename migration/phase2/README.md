# Selcore Phase 2 migration package

Current result: **Phase 2 complete**; see [final-report.md](final-report.md). The Windows path-parser issue is confirmed, all 24 images were uploaded through the official SDK and publicly verified, and both seeds were executed and verified. Use `node migration/phase2/runtime/admin-storage.cjs --check-auth` for the secure administrative check; `--upload` verifies/skips existing images without overwrite. The original preparation record below is retained as history and does not describe the current remote state.

Target only **Selcore `ffznkypurnocabqyxpps`**, Tokyo, PostgreSQL 17. Never use this package against iVenue.

## Current state and stopping point

The connected Supabase MCP supports database inspection and SQL but exposes no authenticated Storage upload operation. No Supabase CLI is installed. No remote write was attempted. The user explicitly instructed: “If an authenticated upload mechanism is unavailable, prepare the upload manifest and stop.” This package stops before bucket creation, catalogue insertion, uploads, and image registration. No credentials were requested or retrieved.

Inspected remote state: all four catalogue tables empty; `product-images` bucket absent; zero image objects. Existing migration: `20261008124517_create_selcore_catalog_phase1`. RLS enabled on all catalogue tables and on `storage.buckets` and `storage.objects`. Catalogue grants allow SELECT for anon/authenticated only. Existing policies expose categories/brands and active products/their image records. Storage has no policies granting customer writes. Security advisor returned zero findings. No conflicting catalogue records were found during inspection. Reinspect before executing this package because remote state may change.

## Source and mappings

`products.js` is canonical. `store.js` uses that catalogue; `allproducts.js` uses `window.Selcore`, with no second product array. Product detail, cart, and all seven HTML pages continue to use existing scripts and image references.

24 products, original IDs 1–24; categories `accessory`, `laptop`, `mobile`, `tablet`; 17 brands. 24 distinct referenced PNGs, 4,442,378 bytes total. Seven additional PNGs are logos/favicon, outside this migration.

| Source                                          | Existing database destination                                                       |
| ----------------------------------------------- | ----------------------------------------------------------------------------------- |
| `id`, `name`, `price`                           | Exact original values                                                               |
| `techType`                                      | Category lookup by exact name                                                       |
| `features.brand`                                | Brand lookup by exact name; also retained in specifications                         |
| `features`                                      | Exact JSON object in `specifications`                                               |
| `salePrice`                                     | `sale_price`; absent values remain NULL                                             |
| `bestSeller`, `newArrival`                      | `is_bestseller`, `is_new_arrival`; absent arrival flag is false                     |
| Description                                     | None supplied by source; existing schema's empty-string default represented in seed |
| `image`                                         | Original local path in manifest; future Storage path in image table                 |
| `releaseYear`, `soldCount`, `accessory`, `sale` | Preserved exactly in `source-catalogue.json`; no dedicated existing columns         |

Slugs use lowercase ASCII words separated by hyphens. Product slugs include original ID to prevent collisions. These database slugs do not alter frontend URLs. Currency is GEL, active true, stock zero, purchasable false. No source metadata is inserted into technical specifications merely to work around absent columns. If full remote retention of release year, sold count, and accessory subtype is needed, resolve that schema mapping explicitly before applying the seed.

## Prepared execution plan — not applied

1. Reconfirm project identity, schema, policies, empty/conflict state, migration history, and source hashes. Review schema differences above. No destructive operation is necessary.
2. Through a trusted authenticated administrative Storage workflow, create/verify public bucket `product-images`. Retain deny-by-default customer write policies. A public bucket enables downloads; uploads/replacements/deletes must stay administrative. Do not write raw `storage.objects` rows to simulate uploads.
3. Run `seed-catalogue.sql` with the administrative database connection. Its transaction locks catalogue tables, checks exact name/slug conflicts, inserts missing categories/brands, resolves foreign keys, and inserts products. Matching records are skipped; any mismatching product or extra catalogue record aborts. No existing data is overwritten or deleted. Identity sequence advancement occurs only after validation and never moves backwards; PostgreSQL sequence changes are not rolled back if a later COMMIT fails.
4. Upload the **original bytes** from `image-manifest.json` with PNG content type and `upsert: false`. Object paths are `products/<original-id>/<full-SHA256>.png`. If a path already exists, download and compare SHA-256/byte count before skipping. A conflicting object must be reported, never overwritten automatically.
5. Download every public URL and compare byte length and SHA-256 against the manifest; check PNG dimensions. Manifest URLs are expected destinations, **not verified live URLs**. Upload completion alone is insufficient.
6. Only after every object passes download verification, run `seed-images.sql`. It requires a public bucket, existing product, and real object metadata before inserting the primary image; existing differing image data aborts. SQL metadata existence does not prove remote bytes are readable.
7. Run `verify-catalogue.sql`, twice-run seeds to establish idempotence, actual anonymous and regular authenticated read/write checks, a rollback-only inactive product fixture, and the Supabase security advisor. Counts must be 24/4/17/24; mismatch result sets must be empty; every public image must match original bytes. Never label those checks passed before execution.

## Local verification

Run `node migration/phase2/prepare.cjs` to regenerate the package offline, then `node migration/phase2/verify.cjs` for independent integrity checks. The first run records frontend hashes; future runs reject any changes to the baseline files. Both programs use built-in Node modules and never access Supabase or modify frontend files.

Prepared SQL has **not** been executed or database syntax/runtime tested. Remote catalogue counts remain zero. Upload, post-migration idempotence, live image URLs, inactive-row runtime isolation, and browser interactions remain unverified in this phase. Earlier Phase 0's 402 browser assertions are historical results, not claimed as rerun here.

Storage documentation checked: [public buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals#public-buckets), [standard uploads](https://supabase.com/docs/guides/storage/uploads/standard-uploads). Public readability does not authorize writes.
