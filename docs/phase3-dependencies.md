# Phase 3 dependency map (before integration)

All seven pages load products.js → store.js → script.js → cart.js/favorites.js. The catalogue page additionally loads allproducts.js, details load product.js, and account forms load user.js.

products.js defines the canonical numeric-ID array. store.js owns cart/favorites persistence under existing LocalStorage keys, normalizes saved snapshots against current products, and dispatches shared change events. allproducts.js combines URL category/brand with search, bestseller/arrival switches, and effective-price sorting. product.js resolves ?id= and renders related items. script.js renders homepage selections, common navigation, chat and unavailable forms. cart.js renders sidebar/page/checkout from the store; favorites.js renders the shared favorites panel.

Images currently use local catalogue paths. Effective price is salePrice when sale is true, otherwise price. Source soldCount/accessory metadata has no database column. The new adapter will use database flags and technical type for headphone filtering; no local source ranking fallback. products.js remains an offline migration reference but will not be loaded by any page.

Target order: pinned official SDK → one public Supabase client → catalogue service → store → existing page scripts. A single shared readiness/status event hydrates state before prices or cards render. Each page makes one joined product query plus category/brand lookup queries, shared in memory; no per-product requests. Cart/favorite persistence remains solely in store.js, reading legacy saved objects but writing ID references. Database/migrations/RLS stay unchanged.
