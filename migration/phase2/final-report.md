# Selcore Phase 2 — completed 2026-10-08

Only project **`ffznkypurnocabqyxpps`** was accessed. iVenue was neither accessed nor modified. No frontend changes, commit, push, or deployment occurred.

## Upload failure diagnosis and resolution

The failed command supplied the absolute Windows source `C:\Users\My Computer\OneDrive\Desktop\selcore\images\iphone15pro.png` and a valid manifest-derived `ss:///product-images/...` destination.

CLI 2.120.0's [URL parser](https://github.com/supabase/cli/blob/v2.120.0/apps/cli/src/command-internal/storage-url.ts) classifies that source as URL scheme `c`. Its [copy handler](https://github.com/supabase/cli/blob/v2.120.0/apps/cli/src/commands/storage/cp/cp.handler.ts) selects uploads only when the source scheme is empty and the destination scheme is `ss`. Consequently the Windows absolute path reaches `StorageUnsupportedOperationError` before any object upload. This is a local path-classification issue, not a bucket, image, or RLS rejection. The local `diagnose-cli.cjs` executed the official pinned parser in memory and confirmed absolute source `c`, relative source empty, destination `ss`. No failing upload command was repeated.

The existing PowerShell script was corrected to pass a relative source from the project working directory. That CLI correction was not used for this migration; the actual successful workflow uses official **`@supabase/supabase-js@2.110.7`** in an isolated local runtime.

## Secure administrative authentication

Process-environment credential presence was checked without printing values. No key was present there. The existing authenticated CLI login was available and successfully resolved the Selcore administrative credential through its project-scoped Management API operation, the same credential route used internally by CLI Storage.

The child process's stdout and stderr were private pipes, parsed only inside the local Node process; neither stream was printed, logged, or written to disk. Captured buffers were cleared after parsing. No token was supplied in a shell argument, requested from the user, or read from another project's configuration. The SDK client disabled session persistence/refresh and refused requests to any origin except Selcore's HTTPS endpoint or redirects. Successful administrative bucket access confirmed authorization before upload. No policies were weakened and no secret was placed in frontend files, Git, reports, or result JSON.

See the official [administrative client guidance](https://supabase.com/docs/guides/troubleshooting/performing-administration-tasks-on-the-server-side-with-the-servicerole-secret-BYM4Fa) and [Storage upload API](https://supabase.com/docs/reference/javascript/file-buckets-upload).

## Storage results

- Uploaded **24/24** original PNG images; **0 skipped**, **0 failed SDK uploads**.
- Preserved all 4,442,378 original bytes using manifest paths `products/<original-ID>/<SHA256>.png`, PNG content type, and `upsert: false`.
- Existing bucket `product-images` remained public; no bucket configuration change.
- Exactly **24 Storage objects** exist, all mapped to the expected products and image paths.
- All **24 public URLs returned HTTP 200**; original byte lengths, full SHA-256 hashes, dimensions, and PNG content type passed both per-upload and independent download verification.
- Existing-path handling verifies bytes before skipping; differing objects abort rather than overwrite.

## Database results

Reviewed the actual schema and policies, confirmed no initial conflicts, and ran the unchanged `seed-catalogue.sql` and `seed-images.sql` only after all image uploads passed verification.

| Table          | Inserted | Final count |
| -------------- | -------: | ----------: |
| categories     |        4 |           4 |
| brands         |       17 |          17 |
| products       |       24 |          24 |
| product_images |       24 |          24 |

Exactly 24 primary images exist. IDs **1–24**, exact product names, regular/sale prices, specification JSON, mapped bestseller/arrival flags, image alt text/order/path, and both foreign keys passed comparison with the prepared snapshot. Every product is active, currency GEL, stock zero, purchasable false. There are no product/image mismatches, missing foreign keys, or unexpected records.

Both seeds were executed a second time. Full row-data fingerprint remained `4cb34247c89787ff92bfb5a61e864631`, including timestamps, demonstrating that matching rows were retained and duplicates were not created. No data/schema/policy conflict required a destructive operation. No table was recreated, dropped, or truncated.

Existing schema limitations remain as originally documented: `releaseYear`, `soldCount`, `accessory`, and original `sale` metadata are retained exactly in `source-catalogue.json`; dedicated remote columns do not exist. No additional fields were invented or mixed into technical specifications. Source descriptions are absent and the existing empty-string database default is retained.

## Security verification

- RLS remains enabled on all four catalogue tables and Storage buckets/objects. Existing read-only customer policies remain unchanged.
- Actual SQL-role tests for **anon and authenticated** denied catalogue INSERT/UPDATE/DELETE on all four tables.
- Storage INSERT was denied; Storage UPDATE affected zero objects; DELETE was denied by Storage's additional direct-deletion guard and/or row visibility. No customer write policies exist.
- A rollback-only inactive-product fixture hid product 1 and its image from both roles while exposing 23 active products. All fixture changes were rolled back; final original row fingerprint confirms restoration.
- Security Advisor ran after migration and returned **zero findings**, including zero critical findings.

These are actual database-role/policy tests, not end-to-end requests with newly created customer accounts. No authentication accounts or frontend auth were introduced.

An initial security test encountered PostgreSQL `42501: Direct deletion from storage tables is not allowed. Use the Storage API instead.` The transaction did not commit. The checker was updated to treat that additional guard as a denied delete, and the complete rollback-only test passed. No Storage metadata or files were deleted.

## Frontend preservation and files

Offline verification confirmed all **54** baseline frontend/image/test files retain their original hashes and existing JavaScript parses successfully. Browser interactions were not rerun; historical Phase 0's 402 assertions are not counted as new tests.

Created in this successful attempt:

- `runtime/package.json`, `runtime/package-lock.json`, `runtime/.gitignore` — pinned SDK installation; `node_modules/` ignored.
- `runtime/admin-storage.cjs` — secure local SDK uploader and administrative check.
- `runtime/diagnose-cli.cjs` — reproducible official-parser diagnosis without upload or credentials.
- `sdk-upload-results.json`, `download-verification.json` — credential-free per-image results.
- `security-checks.sql` — rollback-only customer-role and inactive-row tests.
- `final-verification.json`, `final-report.md` — remote verification evidence and report.

Updated: `upload-images.ps1` (relative CLI source fix), `verify.cjs` (accurate offline-check scope), `README.md`, `report.md`, `resume-report.md` (current-result pointers; earlier attempts retained as history).

Local installed dependencies are confined to `migration/phase2/runtime/node_modules/`. Original catalogue, manifest, seed files, existing frontend scripts, HTML, CSS, cart, favorites, auth, checkout, and existing Supabase link/config files were not intentionally changed. No deployment, commit, or push occurred.

**PHASE 2 STATUS: COMPLETE**
