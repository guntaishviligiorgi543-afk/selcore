"use strict";
// Runs actual entry-point processes with synthetic configuration only.
// Preload guards abort any attempted DB, SMTP, Auth or listening side effect.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  { spawnSync } = require("node:child_process");
const runtime = require("../server/otp/runtime.cjs");
const root = path.resolve(__dirname, ".."),
  backend = path.join(root, "server/otp");
let passed = 0;
function check(value, name) {
  assert.ok(value, name);
  passed++;
}
check(runtime.serviceEnabled === false, "Backend source gate remains disabled");
assert.throws(() => runtime.requireActivationApproval());
passed++;
const opts = runtime.listenOptions({
  PORT: "32123",
  SELCORE_GATEWAY_PORT: "8081",
});
check(
  opts.port === 32123 && opts.host === "0.0.0.0",
  "Railway PORT overrides localhost fallback and uses reachable bind address",
);
check(
  runtime.listenOptions({}).host === "127.0.0.1" &&
    runtime.listenOptions({}).port === 8081,
  "Local default remains loopback",
);
check(
  runtime.listenOptions({ SELCORE_GATEWAY_PORT: "8082" }).port === 8082,
  "Local configured port remains supported",
);
for (const value of ["", "0", "-1", "65536", "port", "1.2", " 8080 "]) {
  assert.throws(() => runtime.listenOptions({ PORT: value }));
  passed++;
}
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "selcore-otp-startup-")),
  preload = path.join(temp, "deny-network.cjs");
const guard = `const stop=()=>{process.stderr.write('UNEXPECTED_EXTERNAL_EFFECT');process.exit(79);};
global.fetch=stop;require('node:http').createServer=stop;require('node:net').connect=stop;require('node:net').Socket.prototype.connect=stop;
require(${JSON.stringify(require.resolve("../server/otp/node_modules/pg"))}).Pool=class{constructor(){stop();}};
require(${JSON.stringify(require.resolve("../server/otp/node_modules/nodemailer"))}).createTransport=stop;`;
fs.writeFileSync(preload, guard);
try {
  const base = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
  };
  const fake = {
    PORT: "32123",
    SELCORE_PRIVATE_SUPABASE_ORIGIN: "http://127.0.0.1:54321",
    SELCORE_PRIVATE_PUBLISHABLE_KEY: "synthetic-public",
    SELCORE_PRIVATE_ADMIN_KEY: "synthetic-administrative",
    SELCORE_OTP_DATABASE_URL:
      "postgres://synthetic:fixture@127.0.0.1:54322/fixture",
    SELCORE_OTP_HMAC_KEY: Buffer.alloc(32, 1).toString("base64"),
    SELCORE_OTP_ENCRYPTION_KEY: Buffer.alloc(32, 2).toString("base64"),
    SELCORE_SMTP_USER: "resend",
    SELCORE_SMTP_PASSWORD: "synthetic-mail-credential",
    SELCORE_SMTP_FROM: "fixture@example.invalid",
    SELCORE_GATEWAY_ORIGIN: "https://fixture.invalid",
    SELCORE_OTP_ENABLED: "true",
    SELCORE_OTP_SERVICE_ENABLED: "true",
  };
  for (const [name, config] of [
    ["no secrets", {}],
    ["Railway PORT only", { PORT: "32123" }],
    ["all synthetic credentials and attempted environment activation", fake],
  ]) {
    const result = spawnSync(
      process.execPath,
      ["--require", preload, "serve.cjs"],
      {
        cwd: backend,
        env: { ...base, ...config },
        encoding: "utf8",
        timeout: 10000,
        windowsHide: true,
      },
    );
    check(
      result.status === 1 && !result.error,
      "Entry point fails closed: " + name,
    );
    check(
      !result.stdout &&
        result.stderr.includes("OTP is disabled") &&
        !result.stderr.includes("UNEXPECTED_EXTERNAL_EFFECT"),
      "No external effect or listening: " + name,
    );
    check(
      !Object.entries(fake)
        .filter(([k]) => /KEY|PASSWORD|DATABASE_URL/.test(k))
        .some(([, v]) => (result.stdout + result.stderr).includes(v)),
      "No credential values logged: " + name,
    );
  }
  const manifest = JSON.parse(
      fs.readFileSync(path.join(backend, "package.json"), "utf8"),
    ),
    lock = JSON.parse(
      fs.readFileSync(path.join(backend, "package-lock.json"), "utf8"),
    );
  check(
    manifest.scripts.start === "node serve.cjs" &&
      fs.existsSync(path.join(backend, "serve.cjs")),
    "Root-directory start command and entry point exist",
  );
  check(
    JSON.stringify(manifest.dependencies) ===
      JSON.stringify(lock.packages[""].dependencies),
    "Lockfile matches exact dependencies",
  );
  check(
    manifest.dependencies["@supabase/supabase-js"] === "2.110.7" &&
      manifest.dependencies.pg &&
      manifest.dependencies.nodemailer,
    "Required pinned dependencies remain intact",
  );
  console.log(
    JSON.stringify({
      passed,
      failed: 0,
      boundary:
        "Actual child startup processes with network/DB/SMTP/listen tripwires; synthetic credentials only. No deployment.",
    }),
  );
} finally {
  fs.unlinkSync(preload);
  fs.rmdirSync(temp);
}
