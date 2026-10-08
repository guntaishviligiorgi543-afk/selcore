"use strict";

// Offline preparation only. This program never connects to Supabase.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../..");
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const slug = (text) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
const sqlString = (text) => "'" + text.replace(/'/g, "''") + "'";
const write = (name, value) =>
  fs.writeFileSync(path.join(__dirname, name), value);
const json = (value) => JSON.stringify(value, null, 2) + "\n";
const sourceText = fs.readFileSync(path.join(root, "products.js"), "utf8");
const source = JSON.parse(
  JSON.stringify(
    vm.runInNewContext(sourceText + "\nproducts;", {}, { timeout: 1000 }),
  ),
);
assert.deepEqual(
  source.map((p) => p.id).sort((a, b) => a - b),
  Array.from({ length: 24 }, (_, i) => i + 1),
);
const categories = [...new Set(source.map((p) => p.techType))]
  .sort()
  .map((name) => ({ name, slug: slug(name) }));
const brands = [...new Set(source.map((p) => p.features.brand))]
  .sort()
  .map((name) => ({ name, slug: slug(name) }));
assert.equal(categories.length, 4);
assert.equal(brands.length, 17);
for (const group of [categories, brands])
  assert.equal(new Set(group.map((item) => item.slug)).size, group.length);
const mapped = source.map((p) => {
  assert(Number.isSafeInteger(p.price) && p.price >= 0);
  assert.equal(typeof p.sale, "boolean");
  assert.equal(typeof p.bestSeller, "boolean");
  if (p.sale)
    assert(
      Number.isSafeInteger(p.salePrice) &&
        p.salePrice >= 0 &&
        p.salePrice <= p.price,
    );
  else assert.equal(p.salePrice, undefined);
  assert(
    p.features && typeof p.features === "object" && !Array.isArray(p.features),
  );
  return {
    id: p.id,
    category_name: p.techType,
    brand_name: p.features.brand,
    name: p.name,
    slug: slug(p.name) + "-" + p.id,
    description: p.description ?? "",
    price: p.price,
    sale_price: p.salePrice ?? null,
    currency: "GEL",
    specifications: p.features,
    stock_quantity: 0,
    is_active: true,
    is_purchasable: false,
    is_bestseller: p.bestSeller,
    is_new_arrival: p.newArrival ?? false,
  };
});
const manifest = source.map((p) => {
  const absolute = path.resolve(root, p.image);
  assert(
    absolute.startsWith(root + path.sep),
    "Image escapes project directory",
  );
  const bytes = fs.readFileSync(absolute);
  assert(
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "Expected original PNG",
  );
  const sha256 = hash(bytes);
  return {
    product_id: p.id,
    local_path: p.image,
    bucket: "product-images",
    storage_path: `products/${p.id}/${sha256}.png`,
    sha256,
    bytes: bytes.length,
    content_type: "image/png",
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    alt_text: p.name,
    display_order: 0,
    is_primary: true,
    public_url: `https://ffznkypurnocabqyxpps.supabase.co/storage/v1/object/public/product-images/products/${p.id}/${sha256}.png`,
  };
});
assert.equal(new Set(manifest.map((p) => p.storage_path)).size, 24);
assert.equal(new Set(manifest.map((p) => p.sha256)).size, 24);
write(
  "source-catalogue.json",
  json({
    project_id: "ffznkypurnocabqyxpps",
    source_sha256: hash(Buffer.from(sourceText)),
    categories,
    brands,
    products: source,
    mapped_products: mapped,
  }),
);
write(
  "image-manifest.json",
  json({
    project_id: "ffznkypurnocabqyxpps",
    bucket: "product-images",
    upload_options: { upsert: false, content_type: "image/png" },
    images: manifest,
  }),
);

// Compare all supplied fields exactly. Existing differing data aborts the transaction.
const seed = `-- PREPARED ONLY; target Selcore ffznkypurnocabqyxpps. Never run on iVenue.
-- Administrative database connection required. No schema or policy changes.
BEGIN;
LOCK TABLE public.categories, public.brands, public.products IN SHARE ROW EXCLUSIVE MODE;
DO $seed$
DECLARE
  item jsonb; expected jsonb; existing public.products%ROWTYPE;
  category_key bigint; brand_key bigint; existing_slug text;
  inserted_categories integer := 0; inserted_brands integer := 0; inserted_products integer := 0;
  affected integer; sequence_name text; sequence_last bigint; maximum_id bigint;
BEGIN
  FOR item IN SELECT value FROM jsonb_array_elements(${sqlString(JSON.stringify(categories))}::jsonb) LOOP
    IF EXISTS (SELECT 1 FROM public.categories WHERE (name = item->>'name' OR slug = item->>'slug')
      AND (name IS DISTINCT FROM item->>'name' OR slug IS DISTINCT FROM item->>'slug')) THEN
      RAISE EXCEPTION 'Category conflict: %', item->>'name';
    END IF;
    INSERT INTO public.categories(name, slug) VALUES (item->>'name', item->>'slug') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS affected = ROW_COUNT; inserted_categories := inserted_categories + affected;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(${sqlString(JSON.stringify(brands))}::jsonb) LOOP
    IF EXISTS (SELECT 1 FROM public.brands WHERE (name = item->>'name' OR slug = item->>'slug')
      AND (name IS DISTINCT FROM item->>'name' OR slug IS DISTINCT FROM item->>'slug')) THEN
      RAISE EXCEPTION 'Brand conflict: %', item->>'name';
    END IF;
    INSERT INTO public.brands(name, slug) VALUES (item->>'name', item->>'slug') ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS affected = ROW_COUNT; inserted_brands := inserted_brands + affected;
  END LOOP;
  FOR item IN SELECT value FROM jsonb_array_elements(${sqlString(JSON.stringify(mapped))}::jsonb) LOOP
    SELECT id INTO STRICT category_key FROM public.categories WHERE name = item->>'category_name';
    SELECT id INTO STRICT brand_key FROM public.brands WHERE name = item->>'brand_name';
    expected := (item - 'category_name' - 'brand_name') || jsonb_build_object('category_id', category_key, 'brand_id', brand_key);
    FOR existing IN SELECT * FROM public.products WHERE id = (item->>'id')::bigint OR slug = item->>'slug' LOOP
      IF EXISTS (SELECT 1 FROM jsonb_each(expected) entry WHERE to_jsonb(existing)->entry.key IS DISTINCT FROM entry.value) THEN
        RAISE EXCEPTION 'Product conflict for source ID % (existing ID %)', item->>'id', existing.id;
      END IF;
    END LOOP;
    INSERT INTO public.products(id, category_id, brand_id, name, slug, description, price, sale_price, currency,
      specifications, stock_quantity, is_active, is_purchasable, is_bestseller, is_new_arrival)
    VALUES ((item->>'id')::bigint, category_key, brand_key, item->>'name', item->>'slug', item->>'description',
      (item->>'price')::numeric, (item->>'sale_price')::numeric, item->>'currency', item->'specifications',
      0, true, false, (item->>'is_bestseller')::boolean, (item->>'is_new_arrival')::boolean)
    ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS affected = ROW_COUNT; inserted_products := inserted_products + affected;
  END LOOP;
  IF (SELECT count(*) FROM public.categories) <> 4 OR (SELECT count(*) FROM public.brands) <> 17
     OR (SELECT count(*) FROM public.products) <> 24 THEN
    RAISE EXCEPTION 'Unexpected extra catalogue records; review rather than deleting them';
  END IF;
  -- Explicit IDs do not advance identity sequences. Never move an existing sequence backwards.
  sequence_name := pg_get_serial_sequence('public.products', 'id');
  EXECUTE format('SELECT last_value FROM %s', sequence_name::regclass) INTO sequence_last;
  SELECT max(id) INTO maximum_id FROM public.products;
  IF maximum_id >= sequence_last THEN PERFORM setval(sequence_name::regclass, maximum_id, true); END IF;
  RAISE NOTICE 'Inserted categories %, brands %, products %; skipped categories %, brands %, products %',
    inserted_categories, inserted_brands, inserted_products, 4-inserted_categories, 17-inserted_brands, 24-inserted_products;
END
$seed$;
COMMIT;
`;
write("seed-catalogue.sql", seed);
write(
  "seed-images.sql",
  `-- PREPARED ONLY. Run only AFTER admin upload and byte/hash verification of every manifest object.
-- SQL object metadata existence alone does not prove that image bytes can be downloaded.
BEGIN;
LOCK TABLE public.product_images IN SHARE ROW EXCLUSIVE MODE;
DO $images$
DECLARE item jsonb; existing public.product_images%ROWTYPE; inserted integer := 0; affected integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'product-images' AND public) THEN
    RAISE EXCEPTION 'Public product-images bucket must exist before image registration';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(${sqlString(JSON.stringify(manifest))}::jsonb) LOOP
    IF NOT EXISTS (SELECT 1 FROM public.products WHERE id = (item->>'product_id')::bigint) THEN
      RAISE EXCEPTION 'Missing product %', item->>'product_id';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'product-images' AND name = item->>'storage_path') THEN
      RAISE EXCEPTION 'Missing uploaded object for product %', item->>'product_id';
    END IF;
    FOR existing IN SELECT * FROM public.product_images WHERE product_id = (item->>'product_id')::bigint LOOP
      IF existing.storage_path IS DISTINCT FROM item->>'storage_path'
        OR existing.alt_text IS DISTINCT FROM item->>'alt_text'
        OR existing.display_order <> 0 OR NOT existing.is_primary THEN
        RAISE EXCEPTION 'Image conflict for product %; no existing image will be overwritten', item->>'product_id';
      END IF;
    END LOOP;
    INSERT INTO public.product_images(product_id, storage_path, alt_text, display_order, is_primary)
    VALUES ((item->>'product_id')::bigint, item->>'storage_path', item->>'alt_text', 0, true) ON CONFLICT DO NOTHING;
    GET DIAGNOSTICS affected = ROW_COUNT; inserted := inserted + affected;
  END LOOP;
  RAISE NOTICE 'Inserted images %, skipped %', inserted, 24-inserted;
END
$images$;
COMMIT;
`,
);
write(
  "verify-catalogue.sql",
  `-- Read-only verification; expected 24/4/17/24 after migration.
SELECT (SELECT count(*) FROM public.products) AS products,
  (SELECT count(*) FROM public.categories) AS categories,
  (SELECT count(*) FROM public.brands) AS brands,
  (SELECT count(*) FROM public.product_images) AS images;
WITH expected AS (
  SELECT value AS data FROM jsonb_array_elements(${sqlString(JSON.stringify(mapped))}::jsonb)
), actual AS (
  SELECT to_jsonb(p) || jsonb_build_object('category_name', c.name, 'brand_name', b.name) AS data
  FROM public.products p LEFT JOIN public.categories c ON c.id = p.category_id LEFT JOIN public.brands b ON b.id = p.brand_id
)
SELECT expected.data->>'id' AS mismatch_product_id
FROM expected LEFT JOIN actual ON expected.data->>'id' = actual.data->>'id'
WHERE actual.data IS NULL OR EXISTS (
  SELECT 1 FROM jsonb_each(expected.data) entry WHERE actual.data->entry.key IS DISTINCT FROM entry.value
);
WITH expected AS (SELECT value AS data FROM jsonb_array_elements(${sqlString(JSON.stringify(manifest))}::jsonb))
SELECT e.data->>'product_id' AS missing_or_different_image
FROM expected e LEFT JOIN public.product_images i ON i.product_id = (e.data->>'product_id')::bigint
  AND i.storage_path = e.data->>'storage_path' AND i.is_primary AND i.display_order = 0 AND i.alt_text = e.data->>'alt_text'
LEFT JOIN storage.objects o ON o.bucket_id = 'product-images' AND o.name = e.data->>'storage_path'
WHERE i.id IS NULL OR o.id IS NULL;
SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname IN ('categories', 'brands', 'products', 'product_images');
SELECT schemaname, tablename, policyname, roles, cmd, qual, with_check FROM pg_policies
WHERE schemaname IN ('public', 'storage');
`,
);

const frontend = {};
function inspect(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if ([".git", "migration", "node_modules"].includes(entry.name)) continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) inspect(file);
    else if (/\.(html|css|js|png)$/i.test(entry.name))
      frontend[path.relative(root, file).replaceAll(path.sep, "/")] = hash(
        fs.readFileSync(file),
      );
  }
}
inspect(root);
// Keep the first baseline so a rerun cannot hide a subsequent frontend change.
const baselinePath = path.join(__dirname, "frontend-baseline.json");
if (fs.existsSync(baselinePath))
  assert.deepEqual(
    frontend,
    JSON.parse(fs.readFileSync(baselinePath, "utf8")),
    "Frontend changed since preparation",
  );
else write("frontend-baseline.json", json(frontend));
for (const [name] of Object.entries(frontend))
  if (name.endsWith(".js"))
    new vm.Script(fs.readFileSync(path.join(root, name), "utf8"), {
      filename: name,
    });
console.log(
  JSON.stringify(
    {
      products: source.length,
      categories: categories.length,
      brands: brands.length,
      productImages: manifest.length,
      productImageBytes: manifest.reduce((sum, item) => sum + item.bytes, 0),
      missingLocalImages: 0,
      duplicateImages: 0,
      frontendFilesVerified: Object.keys(frontend).length,
      javascriptSyntax: "passed",
      sourceAndMappedPricesSpecifications: "passed",
      remoteWrites: 0,
    },
    null,
    2,
  ),
);
