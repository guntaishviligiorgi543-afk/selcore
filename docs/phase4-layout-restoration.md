# Phase 4 layout restoration

Reference: `830aaff`. Local verification: 9 October 2026, Asia/Tbilisi.

The seven pages retain the reference design while keeping Phase 4 authentication. Changes restore the compact navigation, account form layout and original spacing; scoped responsive rules also correct narrow-screen defects found in the reference itself. No entire application file was reverted.

## Confirmed causes and corrections

1. `tools/serve.cjs` only allowed lowercase filenames. The original `signForm.css` contains an uppercase `F`, so the preview returned HTTP 404 and the account page lost its stylesheet. The server now explicitly permits this exact filename. Private files remain inaccessible.
2. `auth-ui.js` replaced the original 32px account icon with a flex row of authentication links. This changed header sizing and alignment on every page. The original icon now opens a scoped menu containing the existing Sign In, Sign Up, My Account and Logout actions. Escape, outside clicks, resize and scroll close the menu. Headers without an original account icon retain their guest layout and show an account control when signed in.
3. The new `.authExtras` element interrupted `.signForms` grid placement. Its existing controls now sit inside `.selectform`, leaving the original sign-up/sign-in grid structure intact.
4. Empty authentication status elements introduced an 85px margin and blank notice bars. Empty elements now remain hidden. The account page's fixed header has an explicit top position. The new shared-browser notice uses readable text styling scoped to the sign-in form.
5. Responsive defects also existed at the reference commit: translated account forms overflowed at 1024px; the homepage tagline and service-card minimum width overflowed at small widths; product details retained two minimum-width columns at 320px; the fixed checkout address form covered products at 1024px. Scoped sizing and grid corrections address these defects. Mobile account controls also have clearance below the fixed logo.

No CSS framework or new `!important` rule was introduced. Original colors, fonts, card styles, footer styling and animations remain in place.

## Files changed during this restoration

| File                                | Change                                                                                                           |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `auth-ui.js`                        | Original account icon, accessible menu and preserved authentication actions.                                     |
| `account.css`                       | Scoped navigation, form, status, header and responsive spacing rules.                                            |
| `user.html`                         | Account page scope and placement of existing extra authentication controls.                                      |
| `style.css`                         | Responsive homepage text and service-card containment.                                                           |
| `product.css`                       | Product grid containment below 360px.                                                                            |
| `checkout.css`                      | Address form in normal document flow between 901px and 1100px.                                                   |
| `tools/serve.cjs`                   | Exact legacy stylesheet allowance and optional isolated test port.                                               |
| `.prettierignore`                   | Exact exclusion `/docs/layout-restoration/*.json` for generated measurements; existing SDK exclusions preserved. |
| `tests/phase0.test.js`              | Assertions for compact navigation and menu behavior, plus restored layout expectations.                          |
| `tests/preview-server.test.cjs`     | Local stylesheet, asset, private-path and HTTP-method regression checks.                                         |
| `tests/layout-restoration.cjs`      | Isolated reference/current screenshot and measurement runner.                                                    |
| `tests/layout-contact-sheets.ps1`   | Comparison image generation.                                                                                     |
| `docs/phase4-browser-results.json`  | Final frontend regression results.                                                                               |
| `docs/layout-restoration/`          | Reference, before and restored screenshots; comparison sheets and generated measurements.                        |
| `docs/phase4-layout-restoration.md` | This report.                                                                                                     |

Other pre-existing Phase 4 changes remain in the working tree. Byte comparison against the snapshot taken before restoration confirmed that the other six HTML pages, `auth-service.js`, `account.js`, `store.js`, `supabase-client.js` and the remaining root application sources were unchanged by this work.

## Visual and responsive comparison

The reference was exported read-only with `git show 830aaff:<path>` into a temporary directory. The current working tree was never overwritten. Reference, before and restored pages used the same local fixtures and external asset bytes.

The in-app browser was unavailable (`No browser is available`), so comparisons used installed Edge in disposable headless profiles. Screenshots were visually inspected, including page tops, complete-page overviews, footer views, account forms, dashboard, recovery and menus. Scrolling exercised the existing AOS animations before section/footer captures.

| Width  | Seven guest pages       | Account and authentication states | Result                                                                  |
| ------ | ----------------------- | --------------------------------- | ----------------------------------------------------------------------- |
| 1440px | Compared with reference | Verified                          | Original desktop layout restored.                                       |
| 1024px | Compared with reference | Verified                          | Header restored; account form and checkout overlap corrected.           |
| 768px  | Compared with reference | Verified                          | Original tablet stacking and navigation preserved.                      |
| 390px  | Compared with reference | Verified                          | Mobile cards, forms, menus and footer remain usable.                    |
| 320px  | Compared with reference | Verified                          | Narrow text/product containment and account header clearance corrected. |

The final settled views show no persistent horizontal document overflow or new overlapping/hidden controls. Offscreen related-product items belong to the existing horizontal carousel and do not indicate document overflow. Natural entrance animation timing can differ between snapshots. Complete-page CDP captures can composite fixed offscreen panels differently from a normal viewport; viewport and footer screenshots were also inspected for that reason.

Comparison sheets have columns for reference, before and restored pages:

- [1440px](layout-restoration/comparison-1440.png)
- [1024px](layout-restoration/comparison-1024.png)
- [768px](layout-restoration/comparison-768.png)
- [390px](layout-restoration/comparison-390.png)
- [320px](layout-restoration/comparison-320.png)

Each width also has `comparison-<width>-overview.png` and `comparison-<width>-footer.png`. Individual screenshots are in `baseline/`, `before/` and `after/`. Representative restored states: [1024px sign-in](layout-restoration/after/user-1024-signin.png), [320px sign-in](layout-restoration/after/user-320-signin.png), [320px dashboard](layout-restoration/after/user-320-account.png), [password recovery callback](layout-restoration/after/user-390-new-password.png), and [1024px checkout](layout-restoration/after/checkout-1024-guest.png).

Initial and intermediate measurements remain available in `before.json` and `after.json`. Later `sections.json`, `auth-refresh.json`, `checkout-refresh.json`, `home-refresh.json` and `inspect.json` supersede the corresponding earlier measurements. `final-results.json` combines the latest measurements for the 104 restored page/width/state combinations.

## Regression results

- `node tests/phase0.test.js`: **608 passed, 0 failed**. Includes catalogue, filtering, cart, favorites, disabled checkout, registration, login/logout, verification, recovery, Google OAuth handoff, persisted sessions, profile editing, account dashboard and guest/account storage separation. Authentication/profile operations use isolated fixtures; production Auth requests are blocked.
- `node tests/preview-server.test.cjs`: **61 passed, 0 failed**. All seven pages and 21 referenced local assets served correctly; `signForm.css` returned HTTP 200 with CSS MIME type. Private paths returned 404, POST returned 405, and security headers remained present.
- `npx.cmd prettier --check .`: **passed**. Generated SDK/vendor exclusions retained.
- `node --check auth-ui.js` and `node --check vendor/supabase-2.110.7.js`: **passed**.
- `git diff --check`: **passed**. Git's informational LF/CRLF conversion warnings are not whitespace failures.
- Live read-only preflight: **24 products, 4 categories, 17 brands**; original metadata/prices and demo restrictions verified. All **24 public product image downloads** matched the original bytes.
- Restored screenshot runs: **0 JavaScript exceptions**, **0 external asset failures**. Logged-in layouts were captured on all seven pages at all five widths. Sign-up/sign-in, recovery, resend verification, dashboard, new-password, account menu and mobile navigation states were also captured.

The official SDK remains version **2.110.7**, unchanged, with SHA-256 `2697f51bb3efa5f10b5b0bca2a39b3772b1b8f810e6885e3bb8d69c3242d5e07`.

## Limits and errors encountered

No remaining restoration regression was identified in the tested views. Real email delivery, Google consent and production profile RLS were not exercised; no production account was created. These are outside the local layout restoration checks, and the existing profiles migration remains unapplied.

Temporary public read-request timeouts and one isolated browser connection failure interrupted some screenshot attempts. The completed frontend regression preflight independently verified the live catalogue and all 24 images. The last optional 320px homepage refresh used explicit local catalogue fixtures and SHA-256 checked original images to avoid further remote requests; it is not counted as another live API verification. PowerShell initially blocked the screenshot compositor under the device execution policy; it subsequently ran with a process-only `-ExecutionPolicy Bypass`, without changing device policy. The unavailable browser plugin was handled using isolated Edge as described above.

No Supabase database tables, RLS policies, Storage objects, product data, credentials or production authentication settings were changed. iVenue was never accessed or modified. No commit, push or deployment was performed.

LAYOUT RESTORATION: COMPLETE
