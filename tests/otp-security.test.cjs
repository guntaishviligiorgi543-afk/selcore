"use strict";
// Real in-memory Postgres and cryptography. Native Auth + email delivery are fixtures.
// No production Auth requests, users, emails, secrets, or migrations.
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  crypto = require("node:crypto"),
  http = require("node:http");
const { PGlite } = require("./profile-audit/node_modules/@electric-sql/pglite");
const { Store } = require("../server/otp/store.cjs"),
  { Gateway } = require("../server/otp/gateway.cjs"),
  { secrets, code, handle, id } = require("../server/otp/crypto.cjs"),
  { nativeAuth } = require("../server/otp/native.cjs"),
  { smtpMail } = require("../server/otp/mail.cjs"),
  { handler } = require("../server/otp/http.cjs");
const root = path.resolve(__dirname, ".."),
  results = [];
function check(name, value) {
  assert.ok(value, name);
  results.push(name);
}
async function denied(name, fn) {
  let failure = false;
  try {
    await fn();
  } catch {
    failure = true;
  }
  check(name, failure);
}
const db = new PGlite();
let serial = Promise.resolve();
function locked(fn) {
  const result = serial.then(fn);
  serial = result.catch(() => {});
  return result;
}
async function as(role, fn) {
  return locked(async () => {
    await db.exec("set role " + role);
    try {
      return await fn();
    } finally {
      await db.exec("reset role");
    }
  });
}
const owner = (sql, args = []) => as("postgres", () => db.query(sql, args));
const store = new Store({
  query: (sql, args) => as("selcore_otp_worker", () => db.query(sql, args)),
});
const secret = secrets({
  hmacKey: crypto.randomBytes(32),
  encryptionKey: crypto.randomBytes(32),
});
const mail = [],
  users = new Map(),
  tokens = new Map(),
  links = new Map();
let nativeLogoutOutage = false;
let nativeLinkCalls = 0;
let passwordCalls = 0,
  profileCalls = 0;
const fixturePassword = "lowerUPPER MiXeD123 ",
  changedPassword = "newMiXeD CASE456 ";
async function issueSession(user) {
  const sid = id(),
    payload = {
      sub: user.id,
      session_id: sid,
      role: "authenticated",
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
  const access_token =
    "fixture." +
    Buffer.from(JSON.stringify(payload)).toString("base64url") +
    ".fixture";
  const session = {
    access_token,
    refresh_token: handle(),
    expires_at: payload.exp,
  };
  tokens.set(access_token, { user, sid });
  await owner("insert into auth.sessions(id,user_id)values($1,$2)", [
    sid,
    user.id,
  ]);
  return session;
}
const native = {
  async link(p) {
    nativeLinkCalls++;
    let user = [...users.values()].find(
      (u) => u.email.toLowerCase() === p.email.toLowerCase(),
    );
    if (p.type === "signup") {
      if (user) {
        const e = Error("Duplicate fixture");
        e.duplicate = true;
        throw e;
      }
      user = {
        id: id(),
        email: p.email,
        email_confirmed_at: null,
        created_at: new Date().toISOString(),
        password: p.password,
      };
      users.set(user.id, user);
      await owner(
        "insert into auth.users(id,raw_user_meta_data,created_at)values($1,$2,now())",
        [user.id, p.options.data],
      );
    }
    if (!user) throw Error("Unknown fixture");
    if (p.newEmail) {
      user.pendingEmail = p.newEmail;
      if (p.type === "email_change_current") user.oldConfirmed = false;
    }
    const value = code(),
      tokenHash = handle();
    links.set(tokenHash, { user, type: p.type, newEmail: p.newEmail });
    return { code: value, tokenHash, userId: user.id };
  },
  async verify(hash, type) {
    const link = links.get(hash);
    if (!link) throw Error("Expired fixture link");
    links.delete(hash);
    const u = link.user;
    if (type === "email_change") {
      if (link.type === "email_change_current") {
        u.oldConfirmed = true;
        return null;
      }
      if (!u.oldConfirmed) throw Error("Old confirmation required");
      u.email = link.newEmail;
      u.pendingEmail = null;
      return issueSession(u);
    }
    u.email_confirmed_at = new Date().toISOString();
    await owner("update auth.users set email_confirmed_at=now() where id=$1", [
      u.id,
    ]);
    return issueSession(u);
  },
  async unconfirmed(uid) {
    return !users.get(uid)?.email_confirmed_at;
  },
  async login(email, password) {
    const u = [...users.values()].find(
      (v) => v.email.toLowerCase() === email.toLowerCase(),
    );
    if (!u || u.password !== password || !u.email_confirmed_at)
      throw Error("Bad fixture credentials");
    return issueSession(u);
  },
  async user(session) {
    const data = tokens.get(session.access_token);
    if (!data) throw Error("Untrusted fixture token");
    return data.user;
  },
  async refreshIfNeeded(session) {
    if (session.expires_at * 1000 > Date.now() + 30000) return session;
    const old = tokens.get(session.access_token);
    const payload = {
      sub: old.user.id,
      session_id: old.sid,
      refresh: handle(),
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const next = {
      access_token:
        "fixture." +
        Buffer.from(JSON.stringify(payload)).toString("base64url") +
        ".fixture",
      refresh_token: handle(),
      expires_at: payload.exp,
    };
    tokens.set(next.access_token, old);
    return next;
  },
  async password(uid, value) {
    passwordCalls++;
    users.get(uid).password = value;
  },
  async logout(session, scope) {
    if (nativeLogoutOutage) throw Error("Isolated native signout outage");
    const who = tokens.get(session.access_token);
    if (who)
      await owner(
        "delete from auth.sessions where " +
          (scope === "global" ? "user_id" : "id") +
          "=$1",
        [scope === "global" ? who.user.id : who.sid],
      );
  },
  async profile(session, uid, name) {
    profileCalls++;
    const claims = tokens.get(session.access_token);
    return as("authenticated", async () => {
      await db.query("select set_config('request.jwt.claims',$1,false)", [
        JSON.stringify({ sub: claims.user.id, session_id: claims.sid }),
      ]);
      const result = await db.query(
        name === undefined
          ? "select * from public.profiles where id=$1"
          : "update public.profiles set full_name=$2 where id=$1 returning *",
        name === undefined ? [uid] : [uid, name],
      );
      if (result.rows.length !== 1) throw Error("RLS denied fixture profile");
      return result.rows[0];
    });
  },
};
const gateway = new Gateway({
  store,
  secrets: secret,
  native,
  mail: {
    async send(to, value, purpose) {
      mail.push({ to, value, purpose });
    },
  },
});
const lastCode = (purpose) => mail.findLast((m) => m.purpose === purpose).value;
const wrong = (value) => (value[0] === "0" ? "1" : "0") + value.slice(1);
const newContext = () => gateway.context(null, "isolated-fixture");
async function verify(ctx) {
  return gateway.verify(ctx, {
    id: ctx.state.challenge.id,
    code: lastCode(ctx.state.challenge.purpose),
  });
}
(async () => {
  await db.exec(`create role anon nologin;create role authenticated nologin;create role service_role nologin;create role supabase_auth_admin nologin;create schema auth;
 create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_user_meta_data jsonb,created_at timestamptz,is_anonymous boolean not null default false);
 create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id) on delete cascade,not_after timestamptz);
 create function auth.jwt()returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid()returns uuid language sql stable as $$select nullif(auth.jwt()->>'sub','')::uuid$$;
 grant usage on schema auth to anon,authenticated;grant execute on function auth.jwt(),auth.uid() to anon,authenticated;`);
  await db.exec(
    fs.readFileSync(
      path.join(root, "docs/phase43-production-profiles.sql"),
      "utf8",
    ),
  );
  await db.exec(
    fs.readFileSync(
      path.join(
        root,
        "supabase/migrations/20261010110437_selcore_email_otp_security.sql",
      ),
      "utf8",
    ),
  );
  check(
    "OTP migration is disabled by default",
    (await owner("select enabled from private.selcore_otp_config")).rows[0]
      .enabled === false,
  );
  await owner("update private.selcore_otp_config set enabled=true");
  check(
    "OTP profile policy is restrictive",
    (
      await owner(
        "select polpermissive from pg_policy where polname='OTP approval required for profiles'",
      )
    ).rows[0].polpermissive === false,
  );
  for (const role of ["anon", "authenticated", "service_role"]) {
    await denied(role + " cannot read OTP hashes", () =>
      as(role, () => db.query("select * from private.selcore_otp_challenges")),
    );
    await denied(role + " cannot verify challenges", () =>
      as(role, () =>
        db.query("select private.selcore_otp_verify($1,$2,$3)", [
          id(),
          "a".repeat(64),
          "b".repeat(64),
        ]),
      ),
    );
  }
  await denied("Worker cannot disable enforcement", () =>
    as("selcore_otp_worker", () =>
      db.query("update private.selcore_otp_config set enabled=false"),
    ),
  );
  await denied("Public hosted Auth origin refuses activation", () =>
    nativeAuth({
      origin: "https://ffznkypurnocabqyxpps.supabase.co",
      publishableKey: "fixture",
      administrativeKey: "fixture",
    }),
  );
  const sample = secret.seal({ nativeToken: "synthetic-only" });
  check(
    "Server state decrypts",
    secret.open(sample).nativeToken === "synthetic-only",
  );
  await denied("Ciphertext tampering is rejected", () =>
    secret.open(sample.slice(0, -2) + "AA"),
  );
  check(
    "OTP generation includes eight digits",
    Array.from({ length: 30 }, code).every((c) => /^[0-9]{8}$/.test(c)),
  );
  let ctx = await newContext();
  await denied("Guest profile is rejected", () => gateway.profile(ctx));
  const reg = await gateway.registration(ctx, {
    name: "Fixture Customer",
    email: "Case.Tag@Example.invalid",
    password: fixturePassword,
    confirm: fixturePassword,
  });
  check(
    "Registration returns metadata without OTP or native secrets",
    reg.otp &&
      !JSON.stringify(reg).includes(lastCode("registration")) &&
      !JSON.stringify(reg).includes("tokenHash"),
  );
  check(
    "Signup password preserves case and whitespace",
    [...users.values()][0].password === fixturePassword,
  );
  await denied("Unverified registration cannot read profiles", () =>
    gateway.profile(ctx),
  );
  await denied("Incorrect registration code", () =>
    gateway.verify(ctx, {
      id: reg.otp.id,
      code: wrong(lastCode("registration")),
    }),
  );
  check(
    "Incorrect attempt is durable",
    (
      await owner(
        "select attempts from private.selcore_otp_challenges where id=$1",
        [reg.otp.id],
      )
    ).rows[0].attempts === 1,
  );
  await denied("Registration resend cooldown", () => gateway.resend(ctx));
  const complete = await verify(ctx);
  check(
    "Correct registration enters dashboard",
    Boolean(complete.user?.email_confirmed_at),
  );
  check(
    "Native signup trigger preserves full name",
    (await gateway.profile(ctx)).full_name === "Fixture Customer",
  );
  await denied("Replayed registration code", () =>
    gateway.verify(ctx, { id: reg.otp.id, code: lastCode("registration") }),
  );
  const user = complete.user;
  check(
    "Only hashed OTP and encrypted bridge stored",
    (
      await owner(
        "select code_digest,bridge_cipher from private.selcore_otp_challenges where id=$1",
        [reg.otp.id],
      )
    ).rows.every(
      (r) =>
        r.code_digest.length === 64 &&
        !r.bridge_cipher.includes(lastCode("registration")),
    ),
  );
  await gateway.logout(ctx);
  ctx = await newContext();
  const login = await gateway.login(ctx, {
    email: user.email,
    password: fixturePassword,
  });
  check(
    "First password login requires OTP",
    login.otp?.purpose === "login" && login.user === null,
  );
  await denied("Direct gateway profile while pending", () =>
    gateway.profile(ctx),
  );
  await denied("Direct database profile while pending", () =>
    native.profile(ctx.state.session, user.id),
  );
  await denied("Password cannot change without OTP", () =>
    gateway.commitPassword(ctx, {
      password: changedPassword,
      authorization: id(),
    }),
  );
  check("Unauthorized password did not reach native Auth", passwordCalls === 0);
  await verify(ctx);
  check(
    "Login OTP timestamp is server-side",
    (await owner("select count(*)::int as n from private.selcore_otp_logins"))
      .rows[0].n === 1,
  );
  const binding = ctx.binding,
    oldToken = ctx.token;
  const restored = await gateway.context(ctx.token, "isolated-fixture");
  check(
    "Session persists with an opaque cookie",
    (await gateway.snapshot(restored)).user.id === user.id,
  );
  await gateway.profile(restored, "Updated Fixture");
  check(
    "Profile edit persists",
    (await gateway.profile(ctx)).full_name === "Updated Fixture",
  );
  const beforeRefresh = ctx.state.session.access_token;
  ctx.state.session.expires_at = 0;
  await gateway.snapshot(ctx);
  check(
    "Session refresh retains approval and persists rotated tokens server-side",
    ctx.state.session.access_token !== beforeRefresh &&
      (await gateway.context(ctx.token, "isolated-fixture")).state.session
        .access_token === ctx.state.session.access_token,
  );
  const otherUser = id();
  await owner(
    "insert into auth.users(id,email_confirmed_at,raw_user_meta_data,created_at)values($1,now(),$2,now())",
    [otherUser, { full_name: "Other Fixture" }],
  );
  check(
    "Approved user still cannot read another account",
    (
      await as("authenticated", () =>
        db.query("select * from public.profiles where id=$1", [otherUser]),
      )
    ).rows.length === 0,
  );
  const second = await newContext();
  const fast = await gateway.login(second, {
    email: user.email,
    password: fixturePassword,
  });
  check(
    "Another device within 48 hours skips OTP",
    Boolean(fast.user) && !fast.otp,
  );
  check(
    "Devices use distinct native and gateway sessions",
    second.binding !== binding &&
      second.state.session.access_token !== ctx.state.session.access_token,
  );
  const secondSession = second.state.session;
  nativeLogoutOutage = true;
  const logoutResult = await gateway.logout(second);
  nativeLogoutOutage = false;
  check(
    logoutResult.user === null &&
      logoutResult.message.includes("could not be confirmed"),
    "Logout completes locally when native signout is unavailable",
  );
  await denied(
    "Database profile access revoked despite native signout outage",
    () => native.profile(secondSession, user.id),
  );
  check(
    "Logging out one device preserves the other",
    (await gateway.snapshot(ctx)).user.id === user.id,
  );
  await owner(
    "update private.selcore_otp_logins set verified_at=clock_timestamp()-interval '49 hours'",
  );
  await owner(
    "update private.selcore_otp_challenges set created_at=clock_timestamp()-interval '49 hours' where purpose='login'",
  );
  const late = await newContext();
  const challenge = await gateway.login(late, {
    email: user.email,
    password: fixturePassword,
  });
  check("After 48 hours OTP is mandatory", challenge.otp?.purpose === "login");
  const lockId = late.state.challenge.id,
    incorrect = wrong(lastCode("login"));
  for (let i = 0; i < 5; i++)
    await denied("Incorrect login attempt " + (i + 1), () =>
      gateway.verify(late, { id: lockId, code: incorrect }),
    );
  await denied("Correct code is rejected after five errors", () =>
    gateway.verify(late, { id: lockId, code: lastCode("login") }),
  );
  check(
    "Attempts cannot exceed five",
    (
      await owner(
        "select attempts from private.selcore_otp_challenges where id=$1",
        [lockId],
      )
    ).rows[0].attempts === 5,
  );
  await owner(
    "update private.selcore_otp_challenges set created_at=clock_timestamp()-interval '61 seconds' where id=$1",
    [lockId],
  );
  late.state.challenge.resendAt = new Date(Date.now() - 1000).toISOString();
  await gateway.resend(late);
  const resendId = late.state.challenge.id;
  check("Resend replaces the challenge", resendId !== lockId);
  await denied("Old challenge is cancelled", () =>
    store
      .call("verify", [
        lockId,
        late.binding,
        secret.digest("code", late.binding, lockId, lastCode("login")),
      ])
      .then((v) => {
        if (v.error) throw Error();
      }),
  );
  await owner(
    "update private.selcore_otp_challenges set expires_at=clock_timestamp()-interval '1 second' where id=$1",
    [resendId],
  );
  await denied("Expired code is rejected server-side", () => verify(late));
  // Fresh approved device used for sensitive-flow tests; no clock/localStorage authority.
  await owner(
    "update private.selcore_otp_logins set verified_at=clock_timestamp()",
  );
  let approved = await newContext();
  await gateway.login(approved, {
    email: user.email,
    password: fixturePassword,
  });
  await gateway.beginPassword(approved, {
    password: changedPassword,
    confirm: changedPassword,
  });
  const pwdId = approved.state.challenge.id;
  await verify(approved);
  await denied("Password grant is bound to the exact proposed password", () =>
    gateway.commitPassword(approved, {
      authorization: pwdId,
      password: "DifferentFixture789",
      confirm: "DifferentFixture789",
    }),
  );
  nativeLogoutOutage = true;
  const pwd = await gateway.commitPassword(approved, {
    authorization: pwdId,
    password: changedPassword,
    confirm: changedPassword,
  });
  nativeLogoutOutage = false;
  check(
    pwd.message.includes("could not be confirmed"),
    "Password change reports native revocation outage without losing the successful mutation",
  );
  check(
    "Authorized password change preserves exact case and whitespace",
    users.get(user.id).password === changedPassword &&
      passwordCalls === 1 &&
      pwd.user === null,
  );
  await denied("Password authorization replay", () =>
    gateway.commitPassword(approved, {
      authorization: pwdId,
      password: changedPassword,
    }),
  );
  await denied(
    "Old opaque cookie cannot regain access after global signout",
    async () =>
      gateway.profile(await gateway.context(oldToken, "isolated-fixture")),
  );
  approved = await newContext();
  await gateway.login(approved, {
    email: user.email,
    password: changedPassword,
  });
  await gateway.beginEmail(approved, { email: "New.Case@Example.invalid" });
  const oldAddress = users.get(user.id).email;
  await denied("Wrong email-change code", () =>
    gateway.verify(approved, {
      id: approved.state.challenge.id,
      code: wrong(lastCode("email_current")),
    }),
  );
  check(
    "Wrong verification preserves original email",
    users.get(user.id).email === oldAddress,
  );
  await verify(approved);
  check(
    "Old-email confirmation alone preserves original email",
    users.get(user.id).email === oldAddress &&
      approved.state.challenge.purpose === "email_new",
  );
  await verify(approved);
  check(
    "Both confirmations complete native email change",
    users.get(user.id).email === "New.Case@Example.invalid",
  );
  check(
    "Rotated email-change session retains profile approval",
    Boolean((await gateway.profile(approved)).id),
  );
  const recovered = await newContext();
  await gateway.recover(recovered, { email: users.get(user.id).email });
  await verify(recovered);
  check(
    "Recovery is a distinct server authorization",
    recovered.state.recovery === true,
  );
  await denied("Recovery cannot read profiles", () =>
    gateway.profile(recovered),
  );
  await gateway.commitPassword(recovered, {
    password: fixturePassword,
    confirm: fixturePassword,
  });
  check("Recovery changes password once", passwordCalls === 2);
  await denied("Recovery replay is denied", () =>
    gateway.commitPassword(recovered, { password: fixturePassword }),
  );
  await owner(
    "update private.selcore_otp_challenges set created_at=clock_timestamp()-interval '61 seconds' where purpose='recovery'",
  );
  const simultaneous = [await newContext(), await newContext()],
    beforeNative = nativeLinkCalls;
  const requests = await Promise.allSettled(
    simultaneous.map((c) =>
      gateway.recover(c, { email: users.get(user.id).email }),
    ),
  );
  check(
    requests.filter((r) => r.status === "fulfilled").length === 1,
    "Simultaneous recovery requests reserve one challenge",
  );
  check(
    nativeLinkCalls - beforeNative === 1,
    "Rejected concurrent request cannot regenerate the native proof",
  );
  const winning =
    simultaneous[requests.findIndex((r) => r.status === "fulfilled")];
  await verify(winning);
  check(
    winning.state.recovery === true,
    "Winning native recovery proof remains usable",
  );
  const pendingId = id(),
    pendingBinding = secret.digest("session", handle()),
    pendingCode = code();
  await store.call("issue", [
    pendingId,
    pendingBinding,
    secret.digest("scope", handle()),
    "registration",
    null,
    null,
    secret.digest("code", pendingBinding, pendingId, pendingCode),
    "",
    secret.seal({ pending: true }),
    true,
  ]);
  check(
    (
      await store.call("verify", [
        pendingId,
        pendingBinding,
        secret.digest("code", pendingBinding, pendingId, pendingCode),
      ])
    ).error === "invalid",
    "Reserved proof cannot verify before native preparation finishes",
  );
  check(
    !(
      await store.call("prepare", [
        pendingId,
        pendingBinding,
        secret.digest("code", pendingBinding, pendingId, pendingCode),
        secret.seal({ ready: true }),
      ])
    ).error,
    "Reservation can be prepared once",
  );
  check(
    (
      await store.call("prepare", [
        pendingId,
        pendingBinding,
        secret.digest("code", pendingBinding, pendingId, pendingCode),
        secret.seal({ ready: true }),
      ])
    ).error === "invalid",
    "Prepared proof cannot be overwritten",
  );
  const failureCtx = await newContext();
  const failingGateway = new Gateway({
    store,
    secrets: secret,
    native,
    mail: {
      send: async () => {
        throw Error("Isolated SMTP outage");
      },
    },
  });
  await denied("Mail delivery failure rejects the request", () =>
    failingGateway.issue(
      failureCtx,
      "registration",
      "failure@example.invalid",
      {},
    ),
  );
  check(
    (
      await owner(
        "select cancelled from private.selcore_otp_challenges where binding=$1",
        [failureCtx.binding],
      )
    ).rows.every((r) => r.cancelled),
    "Mail delivery failure cancels its challenge",
  );
  // SQL one-use rules and bindings, independent of frontend or process state.
  const rawBinding = secret.digest("session", handle()),
    scope = secret.digest("scope", handle()),
    rawId = id(),
    rawCode = code();
  await store.call("issue", [
    rawId,
    rawBinding,
    scope,
    "registration",
    null,
    null,
    secret.digest("code", rawBinding, rawId, rawCode),
    "bound-action",
    secret.seal({ fixture: true }),
  ]);
  check(
    "Cross-device verification is rejected",
    (
      await store.call("verify", [
        rawId,
        secret.digest("session", handle()),
        secret.digest("code", rawBinding, rawId, rawCode),
      ])
    ).error === "invalid",
  );
  const concurrent = await Promise.all(
    Array.from({ length: 4 }, () =>
      store.call("verify", [
        rawId,
        rawBinding,
        secret.digest("code", rawBinding, rawId, rawCode),
      ]),
    ),
  );
  check(
    "Concurrent verification has one winner",
    concurrent.filter((r) => !r.error).length === 1,
  );
  check(
    "Challenge cannot authorize a different action",
    (
      await store.call("consume", [
        rawId,
        rawBinding,
        "registration",
        "other-action",
      ])
    ).error === "invalid",
  );
  const claims = await Promise.all(
    Array.from({ length: 4 }, () =>
      store.call("consume", [
        rawId,
        rawBinding,
        "registration",
        "bound-action",
      ]),
    ),
  );
  check(
    "Concurrent consumption has one winner",
    claims.filter((r) => !r.error).length === 1,
  );
  const revisionCtx = await newContext();
  await gateway.save(revisionCtx);
  const r1 = await gateway.context(revisionCtx.token, "isolated-fixture"),
    r2 = await gateway.context(revisionCtx.token, "isolated-fixture");
  const saves = await Promise.allSettled([gateway.save(r1), gateway.save(r2)]);
  check(
    "Session CAS rejects a stale concurrent writer",
    saves.filter((r) => r.status === "fulfilled").length === 1,
  );
  await owner(
    "update private.selcore_gateway_sessions set expires_at=clock_timestamp()-interval '1 second' where binding=$1",
    [revisionCtx.binding],
  );
  const expiredContext = await gateway.context(
    revisionCtx.token,
    "isolated-fixture",
  );
  await gateway.save(expiredContext);
  check(
    "Expired cookie rotates to a fresh savable handle",
    expiredContext.binding !== revisionCtx.binding,
  );
  const expiryId = id(),
    expiryBinding = secret.digest("session", handle()),
    expiryCode = code();
  await store.call("issue", [
    expiryId,
    expiryBinding,
    secret.digest("scope", handle()),
    "registration",
    null,
    null,
    secret.digest("code", expiryBinding, expiryId, expiryCode),
    "",
    secret.seal({ fixture: true }),
  ]);
  await store.call("verify", [
    expiryId,
    expiryBinding,
    secret.digest("code", expiryBinding, expiryId, expiryCode),
  ]);
  await owner(
    "update private.selcore_otp_challenges set verified_at=clock_timestamp()-interval '121 seconds' where id=$1",
    [expiryId],
  );
  check(
    "Verified action grant expires after two minutes",
    (await store.call("consume", [expiryId, expiryBinding, "registration", ""]))
      .error === "expired",
  );
  const quota = secret.digest("rate", handle());
  check(
    "Server quota allows its first request",
    await store.call("rate", [quota, 1, 60]),
  );
  check(
    "Server quota rejects its next request",
    !(await store.call("rate", [quota, 1, 60])),
  );
  // Actual HTTP boundary: cookie policy, CSRF, body/method limits and generic responses.
  const server = http.createServer();
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = "http://127.0.0.1:" + server.address().port;
  server.on("request", handler(gateway, { origin, allowLocalHttp: true }));
  try {
    const guest = await fetch(origin + "/api/auth/state");
    check(
      "Gateway cookie is HttpOnly and same-site",
      /HttpOnly; SameSite=Strict/.test(guest.headers.get("set-cookie")),
    );
    check(
      "State is non-cacheable",
      guest.headers.get("cache-control") === "no-store",
    );
    const csrf = await fetch(origin + "/api/auth/register", {
      method: "POST",
      headers: {
        origin: "https://other.invalid",
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    check("Cross-origin submission is rejected", csrf.status === 403);
    const raw = await fetch(origin + "/api/auth/register", {
      method: "POST",
      headers: { origin, "Content-Type": "text/plain" },
      body: "{}",
    });
    check("Non-JSON requests rejected", raw.status === 415);
    const large = await fetch(origin + "/api/auth/register", {
      method: "POST",
      headers: { origin, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "x".repeat(5000) }),
    });
    check("Oversized body rejected", large.status === 413);
    check(
      "Direct profile route rejects guests",
      (await fetch(origin + "/api/auth/profile")).status !== 200,
    );
    check(
      "GET cannot send OTP emails",
      (await fetch(origin + "/api/auth/register")).status === 404,
    );
  } finally {
    await new Promise((r) => server.close(r));
  }
  let transportOptions, message;
  const smtp = smtpMail(
    {
      user: "fixture",
      password: "synthetic SMTP fixture",
      from: "sender@example.invalid",
    },
    (options) => {
      transportOptions = options;
      return {
        sendMail: async (v) => {
          message = v;
        },
        close() {},
      };
    },
  );
  await smtp.send("customer@example.invalid", code(), "login");
  check(
    "SMTP uses existing Resend provider with validated TLS",
    transportOptions.host === "smtp.resend.com" &&
      transportOptions.requireTLS &&
      transportOptions.tls.rejectUnauthorized &&
      transportOptions.logger === false &&
      transportOptions.debug === false,
  );
  check(
    "SMTP destination is recipient only",
    message.to === "customer@example.invalid",
  );
  await denied("SMTP header injection rejected", () =>
    smtp.send("bad\r\nBcc:other@example.invalid", code(), "login"),
  );
  console.log(
    JSON.stringify({
      passed: results.length,
      failed: 0,
      boundary:
        "Real isolated Postgres/RLS + crypto + loopback HTTP; Native Auth and SMTP are mocks. No production requests.",
    }),
  );
})()
  .catch((e) => {
    console.error("OTP security test failed: " + e.stack);
    process.exitCode = 1;
  })
  .finally(() => db.close());
