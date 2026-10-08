"use strict";
// Independent offline checks. No network, remote mutations, or frontend writes.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const root = path.resolve(__dirname, "../..");
const read = (name) =>
  JSON.parse(fs.readFileSync(path.join(__dirname, name), "utf8"));
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const snapshot = read("source-catalogue.json");
const manifest = read("image-manifest.json");
const baseline = read("frontend-baseline.json");
const sourceBytes = fs.readFileSync(path.join(root, "products.js"));
const live = JSON.parse(
  JSON.stringify(
    vm.runInNewContext(
      sourceBytes.toString("utf8") + "\nproducts;",
      {},
      { timeout: 1000 },
    ),
  ),
);
assert.equal(snapshot.project_id, "ffznkypurnocabqyxpps");
assert.equal(manifest.project_id, snapshot.project_id);
assert.equal(hash(sourceBytes), snapshot.source_sha256);
assert.deepEqual(snapshot.products, live);
assert.equal(live.length, 24);
assert.deepEqual(
  live.map((p) => p.id).sort((a, b) => a - b),
  Array.from({ length: 24 }, (_, i) => i + 1),
);
assert.deepEqual(
  snapshot.categories.map((c) => c.name).sort(),
  [...new Set(live.map((p) => p.techType))].sort(),
);
assert.deepEqual(
  snapshot.brands.map((b) => b.name).sort(),
  [...new Set(live.map((p) => p.features.brand))].sort(),
);
assert.equal(snapshot.categories.length, 4);
assert.equal(snapshot.brands.length, 17);
assert.equal(snapshot.mapped_products.length, 24);
assert.equal(manifest.images.length, 24);
assert.equal(new Set(manifest.images.map((i) => i.storage_path)).size, 24);
for (const product of live) {
  const mapped = snapshot.mapped_products.find((p) => p.id === product.id);
  assert(mapped);
  assert.equal(mapped.name, product.name);
  assert.equal(mapped.category_name, product.techType);
  assert.equal(mapped.brand_name, product.features.brand);
  assert.equal(mapped.price, product.price);
  assert.equal(mapped.sale_price, product.salePrice ?? null);
  assert.deepEqual(mapped.specifications, product.features);
  assert.equal(mapped.description, product.description ?? "");
  assert.equal(mapped.is_bestseller, product.bestSeller);
  assert.equal(mapped.is_new_arrival, product.newArrival ?? false);
  assert.equal(mapped.currency, "GEL");
  assert.equal(mapped.stock_quantity, 0);
  assert.equal(mapped.is_purchasable, false);
  assert.equal(mapped.is_active, true);
  const image = manifest.images.find((i) => i.product_id === product.id);
  assert(image);
  assert.equal(image.local_path, product.image);
  const bytes = fs.readFileSync(path.resolve(root, image.local_path));
  assert.equal(hash(bytes), image.sha256);
  assert.equal(bytes.length, image.bytes);
  assert.equal(
    image.storage_path,
    `products/${product.id}/${image.sha256}.png`,
  );
  assert.equal(image.bucket, "product-images");
  assert.equal(image.alt_text, product.name);
  assert.equal(image.display_order, 0);
  assert.equal(image.is_primary, true);
  assert.equal(image.content_type, "image/png");
  assert(
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  );
  assert.equal(bytes.readUInt32BE(16), image.width);
  assert.equal(bytes.readUInt32BE(20), image.height);
  assert.equal(
    image.public_url,
    `https://${snapshot.project_id}.supabase.co/storage/v1/object/public/product-images/${image.storage_path}`,
  );
}
for (const [name, expected] of Object.entries(baseline)) {
  assert.equal(
    hash(fs.readFileSync(path.join(root, name))),
    expected,
    `Frontend modified: ${name}`,
  );
  if (name.endsWith(".js"))
    new vm.Script(fs.readFileSync(path.join(root, name), "utf8"), {
      filename: name,
    });
}
console.log(
  "PASS: exact IDs/names/prices/specifications/flags, category and brand mapping, 24 original image hashes and PNG dimensions, demo purchase settings, and 54 unchanged frontend files.",
);
console.log(
  "Scope: offline integrity checks only. See final-report.md for executed remote migration, download, and security checks; browser interactions were not rerun.",
);
