"use strict";
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const child = spawn(process.execPath, ["tools/serve.cjs"], {
  cwd: root,
  env: { ...process.env, SELCORE_PREVIEW_PORT: "0" },
  windowsHide: true,
});
let count = 0;
(async () => {
  const origin = await new Promise((resolve, reject) => {
    let stdout = "";
    const timer = setTimeout(
      () => reject(Error("Preview did not start")),
      10000,
    );
    child.stdout.on("data", (bytes) => {
      stdout += bytes;
      const m = stdout.match(/http:\/\/127\.0\.0\.1:\d+/);
      if (m) {
        clearTimeout(timer);
        resolve(m[0]);
      }
    });
    child.on("error", reject);
    child.on("exit", (code) => reject(Error("Preview exited: " + code)));
  });
  const assets = new Set();
  for (const page of [
    "index.html",
    "allproducts.html",
    "product.html",
    "cart.html",
    "checkout.html",
    "contact.html",
    "user.html",
  ]) {
    const response = await fetch(origin + "/" + page);
    assert.equal(response.status, 200, page);
    count++;
    const html = await response.text();
    for (const m of html.matchAll(/(?:src|href)="([^"?#]+\.(?:css|js))"/g))
      if (!m[1].startsWith("http")) assets.add(m[1].replace(/^\.\//, ""));
  }
  for (const asset of assets) {
    const response = await fetch(origin + "/" + asset);
    assert.equal(response.status, 200, asset + " must load");
    assert.match(
      response.headers.get("content-type"),
      asset.endsWith(".css") ? /text\/css/ : /javascript/,
      asset + " correct MIME",
    );
    count += 2;
  }
  for (const name of [
    ".git/config",
    "supabase/.temp/project-ref",
    "supabase/migrations/20261008000000_selcore_customer_profiles.sql",
    "tests/auth-fixtures.js",
    "migration/phase2/runtime/package.json",
    "docs/phase4-report.md",
    "server/otp/serve.cjs",
    "server/otp/.env.example",
    "../.env",
    "%2e%2e%2f.env",
  ]) {
    const r = await fetch(origin + "/" + name);
    assert.equal(r.status, 404, name);
    count++;
  }
  assert.equal(
    (await fetch(origin + "/user.html", { method: "POST", body: "test" }))
      .status,
    405,
  );
  count++;
  const response = await fetch(origin + "/signForm.css");
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  count += 3;
  console.log(
    JSON.stringify({
      passed: count,
      failed: 0,
      localAssets: assets.size,
      legacyFormStylesheet: "HTTP 200, text/css",
      origin: "Loopback only; server stopped after checks",
    }),
  );
})()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(() => child.kill());
