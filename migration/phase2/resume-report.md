# Resumed Selcore Phase 2 — 2026-10-08

Current result: **Phase 2 complete**; see [final-report.md](final-report.md). The CLI path-parser issue was confirmed and resolved through the official SDK; uploads, imports, and verification are complete. The report below is retained as history of the earlier failed attempt.

Target: Selcore `ffznkypurnocabqyxpps` only. The local CLI link was verified against `supabase/.temp/project-ref`. No iVenue project was accessed or modified.

## Result

Images uploaded: **0 of 24**. One Storage upload was attempted, for product 1. It returned exit code 1:

```json
{
  "_tag": "Error",
  "error": {
    "code": "StorageUnsupportedOperationError",
    "message": "Unsupported operation",
    "suggestion": "Run cp -r <src> <dst> to copy between local directories."
  }
}
```

The supported command/flags were confirmed from pinned CLI help before execution. The attempted operation used `npx.cmd --yes supabase@2.120.0 storage cp <original-absolute-PNG-path> ss:///product-images/<manifest-path> --linked --project-ref ffznkypurnocabqyxpps --experimental --content-type image/png`. No `--debug` flag, secret key lookup, or credential output was used. The destination came directly from the manifest.

Per the user's explicit instruction, “If Storage uploads fail, stop and report the precise error,” no further uploads, workaround, or database seed was attempted. The CLI error has not been diagnosed by changing flags or trying alternate uploads. Separately, an initial `.ps1` file launch was blocked by Windows execution policy (`PSSecurityException`, `UnauthorizedAccess`) before any CLI upload. Reviewed commands were then run directly in the approved PowerShell session, leaving the system execution policy unchanged.

## Inspection and verification

- Remote table columns/types, identities, foreign keys, check constraints, existing policies and catalogue state match the prepared seed's assumptions. Tables were not recreated or altered. Original snapshot retains fields without remote columns (`releaseYear`, `soldCount`, `accessory`, `sale`); their remote retention remains unresolved as documented in the original package.
- Before upload, `product-images` was verified public, empty, and accepting `image/png`. No existing object could be overwritten. A read-only query after failure confirmed **zero Storage objects**, so no partial upload remains.
- Database counts remain categories **0**, brands **0**, products **0**, product_images **0**. Import counts are all **0**; neither prepared seed was executed.
- Source integrity checker ran successfully before and after the attempt: 24 source IDs/prices/specifications and image hashes match the package, and all **54** baseline frontend/image/test files remain unchanged.
- RLS is enabled on the four catalogue tables and `storage.objects`/`storage.buckets`. Effective anon and authenticated permissions allow catalogue SELECT and deny INSERT/UPDATE/DELETE. Existing catalogue policies expose active products and their images. Storage has no customer write policies; RLS denies customer upload/replacement/deletion. No policies were modified.
- Supabase Security Advisor ran after the failed attempt and returned **zero findings**, including zero critical findings.
- Public image URL accessibility, remote byte/hash verification, imported IDs/prices, primary-image counts, idempotence, and runtime customer API write-denial tests remain **unexecuted**, because uploads failed and migration stopped. `verify-downloads.cjs` was prepared but not run; no download-verification result was generated.

## Files changed in this resumed attempt

Created under `migration/phase2/`: `upload-images.ps1`, `verify-downloads.cjs`, `upload-results.json` (empty result array), `resume-verification.json`, and `resume-report.md`.

Updated `README.md` and `report.md` with links to this current result; their earlier blocked-state record is retained as history. Prepared seed SQL, source JSON, manifests, baseline hashes, and frontend files were left unchanged. Existing `supabase/` link/config files were created by the user's setup before this attempt and were not intentionally edited. No commit, push, deployment, authentication, checkout, cart or favorites change was made.

## Remaining blocker

The pinned CLI's authenticated upload command returned `StorageUnsupportedOperationError` despite the inspected documented syntax. That Storage failure must be resolved before resuming the upload phase and then executing the existing SQL.

**PHASE 2 STATUS: BLOCKED**
