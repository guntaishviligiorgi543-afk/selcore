"use strict";
// Public URLs only: never reads or sends administrative credentials.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const manifest = JSON.parse(
  fs.readFileSync(path.join(__dirname, "image-manifest.json"), "utf8"),
);
assert.equal(manifest.project_id, "ffznkypurnocabqyxpps");
(async () => {
  const results = [];
  for (const image of manifest.images) {
    const url = new URL(image.public_url);
    assert.equal(url.hostname, "ffznkypurnocabqyxpps.supabase.co");
    const response = await fetch(url, {
      signal: AbortSignal.timeout(30000),
      redirect: "error",
    });
    assert.equal(
      response.status,
      200,
      `Public image unavailable for product ${image.product_id}`,
    );
    const bytes = Buffer.from(await response.arrayBuffer());
    assert.equal(bytes.length, image.bytes);
    assert.equal(
      crypto.createHash("sha256").update(bytes).digest("hex"),
      image.sha256,
    );
    assert.equal(bytes.readUInt32BE(16), image.width);
    assert.equal(bytes.readUInt32BE(20), image.height);
    assert.match(response.headers.get("content-type"), /^image\/png/);
    results.push({
      product_id: image.product_id,
      status: response.status,
      bytes: bytes.length,
      sha256: image.sha256,
      content_type: response.headers.get("content-type"),
      verified: true,
    });
    console.log(
      `Verified product ${image.product_id}: HTTP 200, original bytes and SHA-256`,
    );
  }
  assert.equal(results.length, 24);
  fs.writeFileSync(
    path.join(__dirname, "download-verification.json"),
    JSON.stringify(results, null, 2) + "\n",
  );
  console.log(
    "PASS: all 24 public PNG downloads preserve original image contents.",
  );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
