# Selcore Phase 3 integration report

## A. Architecture

All seven pages load the pinned official supabase-js 2.110.7 bundle, one public client, the catalogue service, the shared store, and their page scripts. The client uses only Selcore's publishable key and disables session persistence. The service shares three concurrent read requests: one joined active-product query with category, brand and primary image relations, plus category and brand lookups. Successful results are cached in memory. Numeric IDs and prices are validated; specifications and Storage image URLs come from Supabase. There is no hardcoded fallback. Loading, retryable error, empty catalogue and missing-image states render safely.

The existing products.js remains an unchanged migration reference and is no longer loaded by any page. The dependency audit was recorded before implementation in phase3-dependencies.md.

## B. Files

Added supabase-client.js and catalogue-service.js; vendor/supabase-2.110.7.js and vendor/SUPABASE-LICENSE.txt; tests/live-catalogue.cjs; docs/phase3-dependencies.md, phase3-browser-results.json, phase3-security-results.json and this report.

Updated store.js for asynchronous hydration and ID-only persistence; script.js for live homepage flags; allproducts.js for the shared live filter pipeline; product.js for asynchronous details, specifications and related products; cart.js and favorites.js for loading/error/unavailable-item states. Updated index.html, allproducts.html, product.html, cart.html, checkout.html, user.html and contact.html for script ordering. allproducts.html also gains category, brand and price controls. Updated allproducts.css for controls/placeholders, style.css for mobile homepage/cart layouts, signForm.css for mobile account layouts, and contact.html stylesheet ordering so existing mobile rules apply. Updated tests/phase0.test.js for live integration and regression checks.

The pre-existing migration/ and supabase/ directories were not modified by Phase 3. products.js, original images and user.js remain unchanged.

## C. Database

Phase 3 made no schema, migration, RLS or data changes. Read-only remote checks confirm 4 categories, 17 brands, 24 active products and 24 primary image records. All demo products use GEL, stock zero and is_purchasable false. The live preflight compares original numeric IDs, prices, sale prices and specifications against the Phase 2 source and downloads all 24 public images with matching original SHA-256 hashes.

## D. Cart and favorites

store.js remains the sole persistence owner. Existing cart/favorites keys and legacy saved objects are accepted, but saved names, images and prices are replaced with current catalogue data. New cart storage contains only IDs and quantities; favorites contain IDs. Unavailable products are removed after successful hydration, with a visible notice. Network errors preserve saved references for retry. Quantity controls, toggles, totals, cross-document synchronization and navigation remain covered by regressions. Checkout remains a demo with a disabled purchase button and clear unavailable messaging; no order, payment or authentication integration was added.

## E. Security

Only the public publishable credential is present in browser configuration. No administrative credential was added to frontend files, reports or Git. Remote names/specifications use DOM text rendering. RLS remains enabled on the four catalogue tables and Storage objects/buckets. Anonymous and authenticated roles have no catalogue INSERT/UPDATE/DELETE grants; there are no Storage object write policies. The Supabase Security Advisor returns no findings. Verification used read-only queries and did not issue destructive security probes.

## F. Verification

Final result: **485 assertions passed, zero failed**. Live checks additionally confirmed 24 products, 4 categories, 17 brands, three shared queries and 24 original public image downloads. SDK syntax and git diff whitespace checks passed.

The final assertion count and outcome are recorded in phase3-browser-results.json. The installed Edge browser runs with a disposable profile. Before each browser run, the official SDK reads the actual public Selcore API and downloads all 24 actual Storage images. Those fresh responses and image bytes are replayed through an isolated local proxy for repeatable browser tests, including controlled error, empty, inactive, malicious-text and missing-image cases. The suite covers all seven pages, all 24 details, URL mappings, combined filters/sorts, legacy and tampered storage, quantities/toggles, cross-document events, forms, navigation, mobile widths/open cart/account forms, and checkout blocking. Other external assets/AOS are offline in this runner; motion uses controlled frames. The in-app Browser runtime had no available browser, so the installed headless Edge runner was used.

## G. Issues and limits

The database has no sold-count/release-year columns. Homepage bestsellers therefore use the database flags in ID order (first four); all four flagged arrivals render. Old local ranking metadata is not fabricated. Initial tests exposed mobile overflows and invalid syntax in a formatted vendored SDK copy; mobile rules were corrected and the SDK was restored byte-for-byte from the official installed package. Its SHA-256 is 2697f51bb3efa5f10b5b0bca2a39b3772b1b8f810e6885e3bb8d69c3242d5e07. These resolved failures are documented rather than treated as passing tests.

## H. Delivery

PHASE 3 STATUS: COMPLETE

No commit, push or deployment was performed. Only Selcore project ffznkypurnocabqyxpps was accessed. The separate iVenue project was neither accessed nor modified.
