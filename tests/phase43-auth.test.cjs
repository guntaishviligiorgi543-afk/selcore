"use strict";
// The real pinned SDK and application service use an in-memory HTTP fixture.
// This file never calls production Auth, sends email, or opens Google.
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const root = path.resolve(__dirname, "..");
const sdkPath = path.join(
  root,
  "migration/phase2/runtime/node_modules/@supabase/supabase-js",
);
const { createClient } = require(sdkPath);
const sdkVersion = JSON.parse(
  fs.readFileSync(path.join(sdkPath, "package.json")),
).version;
if (sdkVersion !== "2.110.7")
  throw Error("Unexpected SDK version; do not upgrade automatically");
const origin = "https://ffznkypurnocabqyxpps.supabase.co";
const idA = "11111111-1111-4111-8111-111111111111",
  idB = "22222222-2222-4222-8222-222222222222";
const fixturePassword = "IsolatedFixture123",
  changedPassword = "ChangedFixture456";
const accounts = new Map(),
  profiles = new Map(),
  tokens = new Map();
const requests = [],
  results = [],
  clients = [];
const state = {
  google: false,
  autoConfirm: false,
  userError: false,
  signupMode: "normal",
};
let counter = 0;
const copy = (x) => JSON.parse(JSON.stringify(x));
const delay = () => new Promise((r) => setTimeout(r, 25));
function check(name, condition) {
  results.push({ name, passed: Boolean(condition) });
}
async function rejects(name, action, expected) {
  let error;
  try {
    await action();
  } catch (e) {
    error = e;
  }
  check(name, Boolean(error) && (!expected || expected.test(error.message)));
}
function storage() {
  const map = new Map();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => map.set(key, value),
    removeItem: (key) => map.delete(key),
  };
}
const local = storage(),
  tab = storage();
function addAccount(email, id, verified = true) {
  const user = {
    id,
    email,
    aud: "authenticated",
    role: "authenticated",
    email_confirmed_at: verified ? "2026-10-09T00:00:00Z" : null,
    created_at: "2026-10-09T00:00:00Z",
    is_anonymous: false,
    user_metadata: { full_name: "Fixture Customer" },
    app_metadata: { provider: "email", providers: ["email"] },
    identities: [],
  };
  accounts.set(email, { user, password: fixturePassword });
  profiles.set(id, {
    id,
    full_name: "Fixture Customer",
    avatar_url: null,
    created_at: user.created_at,
    updated_at: user.created_at,
  });
  return user;
}
addAccount("customer@example.invalid", idA);
addAccount("second@example.invalid", idB);
addAccount(
  "unverified@example.invalid",
  "33333333-3333-4333-8333-333333333333",
  false,
);
function session(user) {
  const expiry = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  const token =
    encode({ alg: "HS256", typ: "JWT" }) +
    "." +
    encode({
      sub: user.id,
      role: "authenticated",
      aud: "authenticated",
      exp: expiry,
      iat: expiry - 3600,
      fixture: ++counter,
    }) +
    ".isolated-fixture-signature";
  tokens.set(token, user.id);
  return {
    access_token: token,
    refresh_token: "isolated-refresh-" + counter,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiry,
    user: copy(user),
  };
}
function response(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-Supabase-Api-Version": "2024-01-01",
    },
  });
}
async function fetchFixture(input, init = {}) {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.origin !== origin)
    throw Error("Fixture denied unexpected network destination");
  const method = init.method || "GET",
    headers = new Headers(init.headers);
  const body = init.body ? JSON.parse(init.body) : null;
  const request = {
    path: url.pathname,
    query: url.searchParams,
    method,
    body,
    headers,
  };
  requests.push(request); // In memory only; bodies and tokens are never printed or serialized.
  const owner = tokens.get(
    (headers.get("Authorization") || "").replace(/^Bearer /i, ""),
  );
  const customer = [...accounts.values()].find(
    (account) => account.user.id === owner,
  );
  if (url.pathname === "/auth/v1/settings")
    return response({
      external: { email: true, google: state.google },
      disable_signup: false,
      mailer_autoconfirm: state.autoConfirm,
    });
  if (url.pathname === "/auth/v1/signup") {
    if (state.signupMode === "errorDuplicate")
      return response(
        { code: "user_already_exists", msg: "Fixture duplicate" },
        422,
      );
    if (state.signupMode === "obfuscatedDuplicate")
      return response({
        user: {
          ...copy(accounts.get("customer@example.invalid").user),
          identities: [],
        },
      });
    const user = addAccount(
      body.email,
      "44444444-4444-4444-8444-444444444444",
      false,
    );
    user.user_metadata.full_name = body.data.full_name;
    profiles.get(user.id).full_name = body.data.full_name; // Mock trigger only; real SQL is tested separately.
    accounts.get(body.email).password = body.password;
    return response({ user });
  }
  if (url.pathname === "/auth/v1/token") {
    if (url.searchParams.get("grant_type") === "pkce") {
      if (body.auth_code === "expired-fixture")
        return response(
          { code: "flow_state_expired", msg: "Fixture expired" },
          400,
        );
      const account = accounts.get("customer@example.invalid");
      return response(session(account.user));
    }
    const account = accounts.get(body.email);
    if (!account || account.password !== body.password)
      return response(
        { code: "invalid_credentials", msg: "Fixture invalid credentials" },
        400,
      );
    if (!account.user.email_confirmed_at)
      return response(
        { code: "email_not_confirmed", msg: "Fixture not confirmed" },
        400,
      );
    return response(session(account.user));
  }
  if (url.pathname === "/auth/v1/user") {
    if (state.userError)
      return response(
        { code: "unexpected_failure", msg: "Fixture validation failure" },
        400,
      );
    if (!customer)
      return response({ code: "bad_jwt", msg: "Fixture invalid session" }, 401);
    if (method === "PUT" && body.password) customer.password = body.password;
    return response(copy(customer.user));
  }
  if (url.pathname === "/auth/v1/logout") return response({});
  if (["/auth/v1/recover", "/auth/v1/resend"].includes(url.pathname))
    return response({});
  if (url.pathname === "/rest/v1/profiles") {
    if (!customer?.user.email_confirmed_at || customer.user.is_anonymous)
      return response(
        { code: "42501", message: "Fixture permission denied" },
        403,
      );
    const target =
      (url.searchParams.get("id") || "").replace(/^eq\./, "") || body?.id;
    let rows =
      target === owner && profiles.has(owner)
        ? [copy(profiles.get(owner))]
        : [];
    if (method === "PATCH" && rows.length) {
      if (Object.keys(body).some((key) => key !== "full_name"))
        return response(
          { code: "42501", message: "Fixture column restriction" },
          403,
        );
      profiles.set(owner, {
        ...profiles.get(owner),
        full_name: body.full_name,
      });
      rows = [copy(profiles.get(owner))];
    }
    if (method === "POST") {
      if (target !== owner)
        return response(
          { code: "42501", message: "Fixture ownership denied" },
          403,
        );
      if (profiles.has(owner))
        return response({ code: "23505", message: "Fixture conflict" }, 409);
      profiles.set(owner, {
        ...body,
        avatar_url: null,
        created_at: customer.user.created_at,
        updated_at: customer.user.created_at,
      });
      rows = [copy(profiles.get(owner))];
    }
    return response(
      headers.get("Accept")?.includes("vnd.pgrst.object")
        ? rows[0] || null
        : rows,
    );
  }
  throw Error("Fixture encountered an unsupported endpoint");
}
async function application(href = "http://127.0.0.1:8080/user.html") {
  const events = new EventTarget(),
    document = new EventTarget();
  const window = {
    location: { href },
    sessionStorage: tab,
    addEventListener: events.addEventListener.bind(events),
    supabase: {
      createClient(url, key, options) {
        if (url !== origin || !key.startsWith("sb_publishable_"))
          throw Error("Unexpected project/public key configuration");
        const client = createClient(url, key, {
          ...options,
          global: { fetch: fetchFixture },
          auth: { ...options.auth, storage: local, autoRefreshToken: false },
        });
        clients.push(client);
        return client;
      },
    },
  };
  const context = vm.createContext({
    window,
    document,
    CustomEvent,
    URL,
    URLSearchParams,
    fetch: fetchFixture,
    AbortSignal,
    setTimeout,
    console: { warn() {} },
    history: {
      replaceState(_state, _title, url) {
        window.location.href = new URL(url, window.location.href).href;
      },
    },
  });
  for (const file of ["supabase-client.js", "auth-service.js"])
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  await window.SelcoreAuth.ready;
  await delay();
  return { auth: window.SelcoreAuth, client: window.SelcoreSupabase, window };
}
async function run() {
  let app = await application();
  const registration = {
    name: "  Fixture Customer  ",
    email: "registration@example.invalid",
    password: fixturePassword,
    confirm: fixturePassword,
  };
  const count = (suffix) =>
    requests.filter((r) => r.path.endsWith(suffix)).length;
  const beforeSignup = count("/signup");
  await rejects("Invalid full name rejected before signup", () =>
    app.auth.register({ ...registration, name: " " }),
  );
  await rejects("Invalid email rejected before signup", () =>
    app.auth.register({ ...registration, email: "invalid" }),
  );
  await rejects("Short password rejected before signup", () =>
    app.auth.register({ ...registration, password: "short", confirm: "short" }),
  );
  await rejects("Password mismatch rejected before signup", () =>
    app.auth.register({ ...registration, confirm: "different" }),
  );
  check(
    "Invalid registration causes no Auth signup request",
    count("/signup") === beforeSignup,
  );
  const message = await app.auth.register(registration);
  const signup = requests.find((r) => r.path.endsWith("/signup"));
  check(
    "Real SDK sends normalized full_name metadata",
    signup.body.data.full_name === "Fixture Customer",
  );
  check(
    "Real SDK sends credentials to signup",
    signup.body.email === registration.email &&
      signup.body.password === fixturePassword,
  );
  check(
    "Real SDK sends a PKCE challenge",
    Boolean(signup.body.code_challenge) &&
      signup.body.code_challenge_method === "s256",
  );
  check(
    "Registration targets the clean local Selcore callback",
    signup.query.get("redirect_to") === "http://127.0.0.1:8080/user.html",
  );
  check(
    "Registration has no customer session before verification",
    !app.auth.snapshot().user && message.includes("check your email"),
  );
  check(
    "Registration metadata reaches the mock profile",
    profiles.get("44444444-4444-4444-8444-444444444444").full_name ===
      "Fixture Customer",
  );
  for (const mode of ["errorDuplicate", "obfuscatedDuplicate"]) {
    state.signupMode = mode;
    check(
      "Duplicate email response is enumeration-safe: " + mode,
      (await app.auth.register(registration)) === message,
    );
  }
  state.signupMode = "normal";
  state.autoConfirm = true;
  app = await application();
  const autoCount = count("/signup");
  await rejects(
    "Registration fails closed when email confirmation is disabled",
    () => app.auth.register(registration),
    /not configured/,
  );
  check(
    "Invalid confirmation settings cause no signup request",
    count("/signup") === autoCount,
  );
  state.autoConfirm = false;
  app = await application();
  await rejects(
    "Incorrect password produces safe actionable message",
    () => app.auth.login("customer@example.invalid", "wrong-fixture"),
    /incorrect/,
  );
  await rejects(
    "Unverified email cannot create an app session",
    () => app.auth.login("unverified@example.invalid", fixturePassword),
    /verify your email/,
  );
  await rejects(
    "Guest cannot load a profile",
    () => app.auth.getProfile(),
    /verified email/,
  );
  await app.auth.login("customer@example.invalid", fixturePassword);
  await delay();
  check(
    "Valid credentials initialize a verified app session",
    app.auth.snapshot().user?.id === idA,
  );
  const profile = await app.auth.getProfile();
  check(
    "Verified owner loads the correct name",
    profile.full_name === "Fixture Customer",
  );
  await app.auth.saveProfile("Saved Fixture Name");
  const update = requests.findLast(
    (r) => r.path === "/rest/v1/profiles" && r.method === "PATCH",
  );
  check(
    "Profile update filters the current UUID and only writes full_name",
    update.query.get("id") === "eq." + idA &&
      Object.keys(update.body).join() === "full_name",
  );
  app = await application();
  check(
    "Session survives a new page instance",
    app.auth.snapshot().user?.id === idA,
  );
  check(
    "Saved name survives a new page instance",
    (await app.auth.getProfile()).full_name === "Saved Fixture Name",
  );
  const foreign = await app.client.from("profiles").select("id").eq("id", idB);
  check(
    "Mock REST denies cross-account profile exposure (not production RLS proof)",
    !foreign.error && foreign.data.length === 0,
  );
  state.userError = true;
  await app.auth.refresh();
  check(
    "Server validation failure removes app identity",
    app.auth.snapshot().status === "error" && !app.auth.snapshot().user,
  );
  check(
    "Validation failure supplies retry guidance",
    app.auth.snapshot().message.includes("could not be verified"),
  );
  state.userError = false;
  await app.auth.refresh();
  check(
    "Retry restores a server-verified session",
    app.auth.snapshot().status === "ready" &&
      app.auth.snapshot().user?.id === idA,
  );
  check(
    "Successful retry clears stale validation error",
    !app.auth.snapshot().message.includes("could not be verified"),
  );
  await app.auth.logout();
  check(
    "Logout clears the official SDK session and app identity",
    !(await app.client.auth.getSession()).data.session &&
      !app.auth.snapshot().user,
  );
  await app.auth.resend("customer@example.invalid");
  const resend = requests.findLast((r) => r.path.endsWith("/resend"));
  check(
    "Real SDK resends signup verification to Selcore",
    resend.body.type === "signup" &&
      resend.query.get("redirect_to") === "http://127.0.0.1:8080/user.html",
  );
  await app.auth.recover("customer@example.invalid");
  const recovery = requests.findLast((r) => r.path.endsWith("/recover"));
  check(
    "Real SDK sends recovery with local redirect and PKCE",
    recovery.query.get("redirect_to") === "http://127.0.0.1:8080/user.html" &&
      Boolean(recovery.body.code_challenge),
  );
  app = await application(
    "http://127.0.0.1:8080/user.html?code=recovery-fixture",
  );
  check(
    "Real SDK PKCE exchange identifies password recovery",
    app.auth.snapshot().recovery && app.auth.snapshot().user?.id === idA,
  );
  check(
    "Callback code is scrubbed from the page URL",
    !new URL(app.window.location.href).searchParams.has("code"),
  );
  app = await application();
  check(
    "Recovery form context survives a page refresh",
    app.auth.snapshot().recovery && app.auth.snapshot().user?.id === idA,
  );
  await app.auth.updatePassword(changedPassword, changedPassword);
  check(
    "Successful password update closes recovery mode",
    !app.auth.snapshot().recovery,
  );
  app = await application();
  check(
    "Completed recovery does not reopen after refresh",
    !app.auth.snapshot().recovery,
  );
  await app.auth.logout();
  await rejects(
    "Old password is rejected after recovery",
    () => app.auth.login("customer@example.invalid", fixturePassword),
    /incorrect/,
  );
  await app.auth.login("customer@example.invalid", changedPassword);
  check(
    "New password can sign in after recovery",
    app.auth.snapshot().user?.id === idA,
  );
  check(
    "New login clears the previous signed-out notice",
    !app.auth.snapshot().message.includes("signed out"),
  );
  tab.setItem("selcore-recovery-ffznkypurnocabqyxpps", idB);
  app = await application();
  check(
    "Another account's recovery marker cannot activate recovery",
    !app.auth.snapshot().recovery,
  );
  check(
    "Mismatched recovery marker is removed",
    !tab.getItem("selcore-recovery-ffznkypurnocabqyxpps"),
  );
  await app.auth.logout();
  await app.auth.resend("customer@example.invalid");
  app = await application(
    "http://127.0.0.1:8080/user.html?code=expired-fixture",
  );
  check(
    "Expired PKCE link has safe guidance and no session",
    app.auth.snapshot().message.includes("invalid or expired") &&
      !app.auth.snapshot().user,
  );
  app = await application(
    "http://127.0.0.1:8080/user.html?error=access_denied&error_description=fixture",
  );
  check(
    "Invalid callback is scrubbed and cannot authorize a customer",
    !new URL(app.window.location.href).search &&
      !app.auth.snapshot().user &&
      app.auth.snapshot().message.includes("invalid or expired"),
  );
  await app.auth.resend("customer@example.invalid");
  app = await application(
    "http://127.0.0.1:8080/user.html?code=confirmation-fixture",
  );
  check(
    "Email confirmation exchange restores a verified session",
    app.auth.snapshot().user?.id === idA && !app.auth.snapshot().recovery,
  );
  await app.auth.logout();
  app = await application();
  await rejects(
    "Disabled Google provider gives email fallback guidance",
    () => app.auth.google(),
    /not configured/,
  );
  state.google = true;
  app = await application();
  let oauth;
  const original = app.client.auth.signInWithOAuth.bind(app.client.auth);
  app.client.auth.signInWithOAuth = async (input) => {
    const result = await original(input);
    oauth = result.data;
    return result;
  };
  await app.auth.google();
  const oauthUrl = new URL(oauth.url);
  check(
    "Real SDK builds Google authorization for the Selcore project",
    oauthUrl.origin === origin &&
      oauthUrl.searchParams.get("provider") === "google",
  );
  check(
    "Google redirect points to the clean local account page",
    oauthUrl.searchParams.get("redirect_to") ===
      "http://127.0.0.1:8080/user.html",
  );
  check(
    "Google flow uses PKCE",
    Boolean(oauthUrl.searchParams.get("code_challenge")),
  );
  app = await application(
    "http://127.0.0.1:8080/user.html?code=google-fixture",
  );
  check(
    "OAuth callback establishes the app session through real SDK exchange",
    app.auth.snapshot().user?.id === idA,
  );
  await app.auth.logout();
  check(
    "Recovery state cannot authorize a guest",
    !app.auth.snapshot().recovery && !app.auth.snapshot().user,
  );
  check(
    "Logout removes tab-local recovery context",
    !tab.getItem("selcore-recovery-ffznkypurnocabqyxpps"),
  );
  const report = {
    date: new Date().toISOString(),
    sdkVersion,
    type: "Real SDK + application service with mocked HTTP/Auth/REST. Zero production requests; no email delivery or Google consent tested.",
    passed: results.filter((r) => r.passed).length,
    failed: results.filter((r) => !r.passed).length,
    results,
  };
  fs.writeFileSync(
    path.join(root, "docs/phase43-auth-results.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({
      sdkVersion,
      passed: report.passed,
      failed: report.failed,
      failures: results.filter((r) => !r.passed).map((r) => r.name),
    }),
  );
  for (const client of clients) client.auth.stopAutoRefresh();
  if (report.failed) process.exitCode = 1;
}
run().catch((error) => {
  // Suppress arbitrary SDK errors that could include request payloads or tokens.
  console.error(
    "Isolated Auth test could not complete; no credentials or request bodies logged.",
  );
  console.error(
    (error.stack || "")
      .split("\n")
      .slice(1)
      .filter((line) => /^\s+at /.test(line))
      .join("\n"),
  );
  for (const client of clients) client.auth.stopAutoRefresh();
  process.exitCode = 1;
});
