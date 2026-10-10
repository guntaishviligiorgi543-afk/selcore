"use strict";
// Official pinned SDK against loopback HTTP fixtures + frontend adapter in a VM.
// No production users, mail, credentials, or network requests.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  http = require("node:http"),
  vm = require("node:vm"),
  crypto = require("node:crypto");
const { nativeAuth } = require("../server/otp/native.cjs");
let passed = 0;
function check(value, label) {
  assert.ok(value, label);
  passed++;
}
async function rejects(fn, label) {
  await assert.rejects(fn);
  passed++;
}
const uid = crypto.randomUUID(),
  sid = crypto.randomUUID(),
  password = "MiXeD Exact Password123 ";
const user = {
  id: uid,
  email: "fixture@example.invalid",
  email_confirmed_at: new Date().toISOString(),
  created_at: new Date().toISOString(),
};
const token =
  "fixture." +
  Buffer.from(JSON.stringify({ sub: uid, session_id: sid })).toString(
    "base64url",
  ) +
  ".fixture";
const session = {
  access_token: token,
  refresh_token: "synthetic-refresh",
  token_type: "bearer",
  expires_in: 3600,
  user,
};
const calls = [];
let expiry = false,
  badLength = false;
const server = http.createServer(async (req, res) => {
  let raw = "";
  for await (const b of req) raw += b;
  const body = raw ? JSON.parse(raw) : null;
  calls.push({ path: req.url, body, authorization: req.headers.authorization });
  let data = user,
    status = 200;
  if (req.url === "/auth/v1/admin/generate_link")
    data = {
      ...user,
      action_link: "https://fixture.invalid",
      email_otp: badLength ? "123456" : "01234567",
      hashed_token: "synthetic-hash",
      verification_type: body.type,
      redirect_to: "https://fixture.invalid",
    };
  else if (req.url.startsWith("/auth/v1/token?")) data = session;
  else if (req.url === "/auth/v1/verify") {
    if (expiry) {
      status = 403;
      data = { code: "otp_expired", msg: "Fixture expired" };
    } else
      data =
        body.type === "email_change"
          ? { msg: "Confirmation accepted" }
          : session;
  } else if (req.url.startsWith("/auth/v1/logout")) {
    res.writeHead(204);
    return res.end();
  } else if (req.url.startsWith("/rest/v1/profiles"))
    data = { id: uid, full_name: "Fixture Customer" };
  res.writeHead(status, {
    "Content-Type": "application/json",
    "X-Supabase-Api-Version": "2024-01-01",
  });
  res.end(JSON.stringify(data));
});
(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = "http://127.0.0.1:" + server.address().port;
  const native = nativeAuth({
    origin,
    publishableKey: "synthetic-public",
    administrativeKey: "synthetic-admin",
  });
  const link = await native.link({
    type: "signup",
    email: user.email,
    password,
  });
  check(
    link.code === "01234567" &&
      link.tokenHash === "synthetic-hash" &&
      link.userId === uid,
    "Pinned SDK generateLink shape",
  );
  check(
    calls.at(-1).body.password === password,
    "SDK signup preserves password case",
  );
  const login = await native.login(user.email, password);
  check(login.access_token === token, "SDK password login creates session");
  check(
    calls.at(-1).body.password === password,
    "SDK login preserves password case",
  );
  check(
    (await native.user(login)).id === uid,
    "SDK validates user using explicit JWT",
  );
  check(
    (await native.refreshIfNeeded({ ...login, expires_at: 0 })).access_token ===
      token,
    "SDK refresh dispatches correctly",
  );
  check(
    (await native.verify(link.tokenHash, "signup")).access_token === token,
    "SDK verifies native hash",
  );
  check(
    (await native.verify("synthetic-old-email-hash", "email_change")) === null,
    "SDK handles first secure email confirmation without session",
  );
  check(
    (await native.profile(login, uid)).id === uid,
    "SDK profile uses user-scoped PostgREST",
  );
  const profileCall = calls.at(-1);
  check(
    profileCall.authorization === "Bearer " + token &&
      profileCall.path.includes("id=eq." + uid),
    "Profile credential and ownership are explicit",
  );
  await native.password(uid, password);
  check(
    calls.at(-1).body.password === password,
    "SDK administrative password dispatch preserves case",
  );
  await native.logout(login, "global");
  check(
    calls.at(-1).path.endsWith("scope=global"),
    "SDK global signout dispatch",
  );
  expiry = true;
  let expired;
  try {
    await native.verify("expired-fixture", "signup");
  } catch (e) {
    expired = e;
  }
  check(expired?.code === "expired", "Native expired code maps to clear error");
  expiry = false;
  badLength = true;
  await rejects(
    () => native.link({ type: "recovery", email: user.email }),
    "Misconfigured OTP length fails closed",
  );
  const events = new EventTarget(),
    windowEvents = new EventTarget(),
    responses = [],
    browserCalls = [];
  const context = vm.createContext({
    window: windowEvents,
    document: events,
    CustomEvent,
    structuredClone,
    AbortSignal,
    URL,
    console,
    fetch: async (url, options) => {
      browserCalls.push({ url, ...options });
      const next = responses.shift();
      if (!next) throw Error("Missing adapter fixture");
      if (next.promise) return next.promise;
      return { ok: next.ok !== false, json: async () => next.data };
    },
  });
  const readyState = {
    status: "ready",
    user: null,
    recovery: false,
    message: "",
  };
  responses.push({ data: readyState });
  vm.runInContext(
    fs.readFileSync(require.resolve("../auth-gateway.js"), "utf8"),
    context,
  );
  const auth = context.window.SelcoreAuthGateway.create();
  await auth.ready;
  check(
    !context.window.SelcoreAuthGateway.enabled,
    "Gateway frontend is disabled by default",
  );
  check(auth.snapshot().user === null, "Initial server state is used");
  const challenge = {
    id: crypto.randomUUID(),
    purpose: "password",
    expiresAt: new Date(Date.now() + 600000).toISOString(),
    resendAt: new Date(Date.now() + 60000).toISOString(),
  };
  responses.push({ data: { ...readyState, user } });
  await auth.login(user.email, password);
  check(
    JSON.parse(browserCalls.at(-1).body).password === password,
    "Frontend login preserves password case",
  );
  responses.push({ data: { ...readyState, otp: challenge } });
  await auth.updatePassword(password, password);
  let passwordNotifications = 0;
  events.addEventListener("selcore:auth-change", () => passwordNotifications++);
  responses.push(
    { data: { ...readyState, user, passwordAuthorized: true } },
    { data: readyState },
  );
  await auth.verifyOtp("01234567");
  check(
    passwordNotifications === 1,
    "Password OTP UI waits until mutation finishes before transitioning",
  );
  check(
    JSON.parse(browserCalls.at(-1).body).password === password &&
      JSON.parse(browserCalls.at(-1).body).authorization === challenge.id,
    "Browser commits exact password with action authorization",
  );
  check(
    browserCalls.every(
      (c) =>
        c.credentials === "same-origin" &&
        c.cache === "no-store" &&
        c.redirect === "error",
    ),
    "Browser requests protect cookie credentials and redirects",
  );
  responses.push({ data: { ...readyState, otp: challenge } });
  await auth.updatePassword(password, password);
  responses.push(
    { data: { ...readyState, user, passwordAuthorized: true } },
    { ok: false, data: { message: "Mutation unavailable" } },
  );
  await rejects(
    () => auth.verifyOtp("01234567"),
    "Password dispatch failure is reported",
  );
  check(
    auth.snapshot().message.includes("Mutation unavailable") &&
      auth.snapshot().message.includes("Restart"),
    "Password dispatch error remains visible after OTP panel transition",
  );
  responses.push({ ok: false, data: { message: "Verification failed" } });
  await auth.refresh();
  check(
    auth.snapshot().user === null && auth.snapshot().status === "error",
    "Verification failure clears protected frontend state",
  );
  const clone = auth.snapshot();
  clone.user = user;
  check(
    auth.snapshot().user === null,
    "Snapshots cannot mutate authentication state",
  );
  await rejects(
    () => Promise.resolve().then(() => auth.google()),
    "Private OAuth cannot silently fall back to public Auth",
  );
  console.log(
    JSON.stringify({
      passed,
      failed: 0,
      boundary:
        "Real SDK 2.110.7 and frontend adapter; Auth HTTP responses mocked on loopback.",
    }),
  );
})()
  .catch((e) => {
    console.error(e.stack);
    process.exitCode = 1;
  })
  .finally(() => server.close());
