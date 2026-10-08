"use strict";
// Local administrative tooling only. Never serve this directory with the website.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
const REF = "ffznkypurnocabqyxpps";
const URL = `https://${REF}.supabase.co`;
const phase = path.resolve(__dirname, "..");
const root = path.resolve(phase, "../..");
const sha256 = (bytes) =>
  crypto.createHash("sha256").update(bytes).digest("hex");
function cliShim() {
  const cache = path.join(process.env.LOCALAPPDATA, "npm-cache", "_npx");
  for (const entry of fs.readdirSync(cache)) {
    const pkg = path.join(cache, entry, "node_modules", "supabase");
    if (!fs.existsSync(path.join(pkg, "package.json"))) continue;
    if (
      JSON.parse(fs.readFileSync(path.join(pkg, "package.json"), "utf8"))
        .version === "2.120.0"
    )
      return path.join(pkg, "dist", "supabase.js");
  }
  throw new Error("Pinned authenticated CLI package unavailable");
}
function administrativeKey(value) {
  if (typeof value !== "string" || value.includes("*")) return false;
  if (value.startsWith("sb_secret_")) return true;
  try {
    const claims = JSON.parse(Buffer.from(value.split(".")[1], "base64url"));
    return claims.role === "service_role" && claims.ref === REF;
  } catch {
    return false;
  }
}
function loadKey() {
  assert.equal(
    fs
      .readFileSync(path.join(root, "supabase/.temp/project-ref"), "utf8")
      .trim(),
    REF,
  );
  for (const name of [
    "SUPABASE_SECRET_KEY",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_AUTH_SERVICE_ROLE_KEY",
    "SUPABASE_ADMIN_KEY",
  ])
    if (administrativeKey(process.env[name]))
      return { key: process.env[name], source: "process environment" };
  // The CLI itself uses the project api-keys endpoint to resolve Storage credentials.
  // Keep this child process's stdout/stderr in memory; never inherit or print either.
  const result = spawnSync(
    process.execPath,
    [
      cliShim(),
      "projects",
      "api-keys",
      "--project-ref",
      REF,
      "--reveal",
      "--output",
      "json",
    ],
    {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 60000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
      env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: "true" },
    },
  );
  try {
    if (result.status !== 0)
      throw new Error(
        "CLI administrative credential resolution failed; captured output suppressed",
      );
    let document;
    try {
      document = JSON.parse(result.stdout.toString("utf8"));
    } catch {
      throw new Error(
        "CLI credential response was not valid JSON; response suppressed",
      );
    }
    const entries = Array.isArray(document)
      ? document
      : (document.keys ?? document.data ?? document.result);
    if (!Array.isArray(entries))
      throw new Error(
        "Unexpected CLI credential response shape; response suppressed",
      );
    const candidates = entries
      .map((entry) => entry.api_key ?? entry.key)
      .filter(administrativeKey);
    const key =
      candidates.find((candidate) => candidate.startsWith("sb_secret_")) ??
      candidates[0];
    if (!key)
      throw new Error(
        "No Selcore administrative Storage credential is available",
      );
    return {
      key,
      source:
        "existing CLI login; Selcore-only Management API response captured in memory",
    };
  } finally {
    result.stdout?.fill(0);
    result.stderr?.fill(0);
  }
}
async function client() {
  const credential = loadKey();
  const { createClient } = require("@supabase/supabase-js");
  const safeFetch = (input, init = {}) => {
    const address = new globalThis.URL(
      typeof input === "string" ? input : (input.url ?? input.href),
    );
    if (address.origin !== URL)
      throw new Error("Refusing to send project credentials to another origin");
    return fetch(input, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(30000),
    });
  };
  return {
    admin: createClient(URL, credential.key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: { fetch: safeFetch },
    }),
    source: credential.source,
  };
}
function failure(stage, error) {
  // Do not print arbitrary SDK error objects, request headers, or credential responses.
  throw new Error(
    `${stage} failed (status ${Number(error?.status ?? error?.statusCode) || "unavailable"}); details suppressed`,
  );
}
async function verifyPublic(image) {
  assert.equal(new globalThis.URL(image.public_url).origin, URL);
  const response = await fetch(image.public_url, {
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  assert.equal(
    response.status,
    200,
    `Public download unavailable for product ${image.product_id}`,
  );
  const bytes = Buffer.from(await response.arrayBuffer());
  assert.equal(bytes.length, image.bytes);
  assert.equal(sha256(bytes), image.sha256);
  assert.equal(bytes.readUInt32BE(16), image.width);
  assert.equal(bytes.readUInt32BE(20), image.height);
  assert.match(response.headers.get("content-type"), /^image\/png/);
}
async function main() {
  const mode = process.argv[2];
  assert(
    ["--check-auth", "--upload"].includes(mode),
    "Use --check-auth or --upload",
  );
  const manifest = JSON.parse(
    fs.readFileSync(path.join(phase, "image-manifest.json"), "utf8"),
  );
  assert.equal(manifest.project_id, REF);
  assert.equal(manifest.images.length, 24);
  // Verify all source files before making any upload request.
  for (const image of manifest.images) {
    const local = path.resolve(root, image.local_path);
    assert(local.startsWith(root + path.sep));
    const bytes = fs.readFileSync(local);
    assert.equal(sha256(bytes), image.sha256);
    assert.equal(bytes.length, image.bytes);
    assert.equal(image.bucket, "product-images");
    assert.equal(
      image.storage_path,
      `products/${image.product_id}/${image.sha256}.png`,
    );
  }
  const { admin, source } = await client();
  const bucket = await admin.storage.getBucket("product-images");
  if (bucket.error) failure("Administrative bucket access", bucket.error);
  assert.equal(bucket.data.id, "product-images");
  assert.equal(bucket.data.public, true);
  console.log(
    JSON.stringify({
      administrativeAuthentication: "verified",
      project: REF,
      source,
      bucketPublic: true,
    }),
  );
  if (mode === "--check-auth") return;
  const storage = admin.storage.from("product-images");
  const results = [];
  try {
    for (const image of manifest.images) {
      const folder = `products/${image.product_id}`;
      const basename = path.posix.basename(image.storage_path);
      const listing = await storage.list(folder, {
        search: basename,
        limit: 100,
      });
      if (listing.error)
        failure(
          `Object inspection for product ${image.product_id}`,
          listing.error,
        );
      const exists = listing.data.some(
        (item) => item.name === basename && item.id,
      );
      if (!exists) {
        const uploaded = await storage.upload(
          image.storage_path,
          fs.readFileSync(path.resolve(root, image.local_path)),
          { contentType: "image/png", cacheControl: "3600", upsert: false },
        );
        if (uploaded.error)
          failure(`Upload for product ${image.product_id}`, uploaded.error);
      }
      await verifyPublic(image); // Existing objects are skipped only after exact byte verification.
      results.push({
        product_id: image.product_id,
        storage_path: image.storage_path,
        uploaded: !exists,
        skipped: Boolean(exists),
        public_http: 200,
        sha256: image.sha256,
        verified: true,
      });
      console.log(
        `Product ${image.product_id}: ${exists ? "existing object verified" : "uploaded and verified"}`,
      );
    }
    assert.equal(results.length, 24);
  } finally {
    fs.writeFileSync(
      path.join(phase, "sdk-upload-results.json"),
      JSON.stringify(results, null, 2) + "\n",
    );
  }
  console.log(
    "PASS: 24 Storage objects and public downloads match original bytes.",
  );
}
if (require.main === module)
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
module.exports = { client };
