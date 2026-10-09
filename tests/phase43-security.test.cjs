"use strict";
// Validates captured read-only production evidence; no database/API requests.
const fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const captured = JSON.parse(read("docs/phase43-production-audit.json"));
const { audit } = captured;
const { security } = JSON.parse(read("docs/phase43-security-checks.json"));
const publicChecks = JSON.parse(read("docs/phase43-public-checks.json"));
const results = [];
function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
}
check(
  "Evidence is scoped exclusively to Selcore",
  captured.project === "ffznkypurnocabqyxpps" &&
    publicChecks.project === captured.project,
);
check(
  "Expected production profiles migration is present once",
  captured.history.filter(
    (m) =>
      m.version === "20261009140454" && m.name === "selcore_customer_profiles",
  ).length === 1,
);
check(
  "Old local profiles version was not deployed",
  !captured.history.some((m) => m.version === "20261008000000"),
);
check("Production profiles RLS is enabled", audit.profiles_table.rls);
check(
  "Production profiles remains owned by postgres",
  audit.profiles_table.owner === "postgres",
);
check(
  "All exposed public/Storage base tables have RLS",
  security.rls_tables.every((t) => t.enabled),
);
check(
  "Profile columns exclude credentials, email and roles",
  audit.columns
    .map((c) => c.name)
    .sort()
    .join() ===
    ["id", "full_name", "avatar_url", "created_at", "updated_at"].sort().join(),
);
check(
  "Profile owner ID is a non-null UUID",
  audit.columns.some(
    (c) => c.name === "id" && c.type === "uuid" && c.nullable === "NO",
  ),
);
check(
  "Auth user deletion cascades to the profile",
  audit.constraints.some((c) =>
    /FOREIGN KEY \(id\) REFERENCES auth\.users\(id\) ON DELETE CASCADE/.test(c),
  ),
);
const policies = audit.policies.filter(
  (p) => p.schema === "public" && p.table === "profiles",
);
check("Only the three reviewed profile policies exist", policies.length === 3);
for (const command of ["SELECT", "INSERT", "UPDATE"]) {
  const policy = policies.find((p) => p.command === command);
  check(
    command + " profile policy is restricted to authenticated",
    policy && policy.roles.join() === "authenticated",
  );
  for (const field of command === "SELECT"
    ? ["using"]
    : command === "INSERT"
      ? ["check"]
      : ["using", "check"])
    check(
      command +
        " " +
        field +
        " requires UUID ownership and server verification",
      policy &&
        /auth\.uid\(\).*?= id/.test(policy[field]) &&
        /private\.selcore_verified_customer\(\)/.test(policy[field]),
    );
}
check(
  "No guest profile table privileges",
  !audit.grants.some((g) => ["anon", "PUBLIC"].includes(g.role)),
);
check(
  "Authenticated profile table-wide grant is SELECT only",
  audit.grants.length === 1 &&
    audit.grants[0].role === "authenticated" &&
    audit.grants[0].privilege === "SELECT",
);
for (const [privilege, columns] of [
  ["INSERT", ["id", "full_name", "avatar_url"]],
  ["UPDATE", ["full_name", "avatar_url"]],
])
  check(
    "Profile column " + privilege + " grants are minimal",
    audit.column_grants
      .filter((g) => g.role === "authenticated" && g.privilege === privilege)
      .map((g) => g.column)
      .sort()
      .join() === columns.sort().join(),
  );
const verifier = audit.functions.find(
  (f) => f.name === "selcore_verified_customer",
);
check(
  "Verified-email authorization uses server-owned Auth data",
  verifier &&
    /from auth\.users/.test(verifier.definition) &&
    /email_confirmed_at is not null/.test(verifier.definition) &&
    /not is_anonymous/.test(verifier.definition) &&
    !/user_meta_data|user_metadata/.test(verifier.definition),
);
for (const fn of audit.functions) {
  check(
    fn.name + " has safe owner and empty search_path",
    fn.owner === "postgres" &&
      fn.config.some((c) => /^search_path=(""|)$/.test(c)),
  );
  check(fn.name + " cannot be executed by anon", !fn.anon_execute);
  check(
    fn.name + " authenticated execution is limited to verification",
    fn.authenticated_execute === (fn.name === "selcore_verified_customer"),
  );
}
check("Guest cannot use the private schema", !security.private_usage.anon);
check(
  "Normal signup trigger exists and is enabled",
  audit.triggers.some(
    (t) =>
      t.enabled === "O" &&
      /AFTER INSERT ON auth\.users.*private\.selcore_new_profile/.test(
        t.definition,
      ),
  ),
);
check(
  "Profile timestamp trigger exists and is enabled",
  audit.triggers.some(
    (t) =>
      t.enabled === "O" &&
      /BEFORE UPDATE ON public\.profiles/.test(t.definition),
  ),
);
check(
  "No missing or orphan profiles in the captured snapshot",
  audit.missing_profiles === 0 && audit.orphan_profiles === 0,
);
check(
  "Production catalogue counts are unchanged",
  audit.catalogue_counts.categories === 4 &&
    audit.catalogue_counts.brands === 17 &&
    audit.catalogue_counts.products === 24 &&
    audit.catalogue_counts.images === 24,
);
for (const permission of security.permissions.filter((p) =>
  /^public\.(categories|brands|products|product_images)$/.test(p.table),
))
  check(
    permission.role + " cannot write " + permission.table,
    permission.select &&
      !permission.insert &&
      !permission.update &&
      !permission.delete &&
      !permission.truncate,
  );
check(
  "Storage has no customer write policies",
  !audit.policies.some(
    (p) =>
      p.schema === "storage" &&
      ["INSERT", "UPDATE", "DELETE", "ALL"].includes(p.command),
  ),
);
check(
  "Real anonymous REST profile read is denied",
  [401, 403].includes(publicChecks.anonymousProfiles.httpStatus) &&
    publicChecks.anonymousProfiles.errorCode === "42501" &&
    !publicChecks.anonymousProfiles.rowsExposed,
);
check(
  "Email verification is enabled in production",
  publicChecks.authSettings.emailEnabled &&
    !publicChecks.authSettings.signupDisabled &&
    publicChecks.authSettings.emailAutoConfirm === false,
);
check(
  "Security Advisor has no findings",
  captured.securityAdvisor.lints.length === 0,
);
const statements = (sql) =>
  sql
    .replace(/\r\n/g, "\n")
    .split("\n")
    .filter((line) => line.trim() && !line.trim().startsWith("--"))
    .join("\n");
check(
  "Profiles draft differs from deployed snapshot only in comments/blank lines",
  statements(
    read("supabase/migrations/20261008000000_selcore_customer_profiles.sql"),
  ) === statements(read("docs/phase43-production-profiles.sql")),
);
for (const migration of captured.history.filter(
  (m) => m.version !== "20261009140454",
))
  check(
    "Applied catalogue history matches local SQL: " + migration.version,
    read(
      "supabase/migrations/" +
        migration.version +
        "_" +
        migration.name +
        ".sql",
    )
      .replace(/\r\n/g, "\n")
      .trim() === migration.statements.join("\n").trim(),
  );
const violations = [],
  frontendFiles = fs
    .readdirSync(root)
    .filter((file) => /\.(html|js)$/.test(file));
for (const file of frontendFiles) {
  const content = read(file);
  for (const pattern of [
    /sb_secret_[A-Za-z0-9_-]{12,}/g,
    /sbp_[A-Za-z0-9]{30,}/g,
    /postgres(?:ql)?:\/\/[^\s:]+:[^\s@]+@/g,
  ])
    if (pattern.test(content))
      violations.push({ file, type: "Administrative credential pattern" });
  for (const token of content.match(
    /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
  ) || []) {
    try {
      if (
        JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString())
          .role === "service_role"
      )
        violations.push({ file, type: "Privileged JWT" });
    } catch {
      /* Not a JWT. */
    }
  }
}
check(
  "Targeted frontend scan found no administrative credentials",
  violations.length === 0,
);
check(
  "Official SDK bytes remain unchanged",
  crypto
    .createHash("sha256")
    .update(fs.readFileSync(path.join(root, "vendor/supabase-2.110.7.js")))
    .digest("hex") ===
    "2697f51bb3efa5f10b5b0bca2a39b3772b1b8f810e6885e3bb8d69c3242d5e07",
);
const report = {
  date: new Date().toISOString(),
  type: "Assertions on read-only captured production metadata and real anonymous REST response, plus local source integrity/secret pattern scan. Not a real authenticated customer integration test.",
  passed: results.filter((r) => r.passed).length,
  failed: results.filter((r) => !r.passed).length,
  frontendFilesScanned: frontendFiles.length,
  credentialViolations: violations,
  googleConfigured: publicChecks.authSettings.googleEnabled === true,
  results,
};
fs.writeFileSync(
  path.join(root, "docs/phase43-security-results.json"),
  JSON.stringify(report, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    passed: report.passed,
    failed: report.failed,
    frontendFilesScanned: frontendFiles.length,
    failures: results.filter((r) => !r.passed).map((r) => r.name),
    googleConfigured: report.googleConfigured,
  }),
);
if (report.failed) process.exitCode = 1;
