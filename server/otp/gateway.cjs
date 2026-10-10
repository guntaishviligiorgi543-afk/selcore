"use strict";
const { code, handle, id } = require("./crypto.cjs");
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const messages = {
  incorrect: "That code is incorrect. Please try again.",
  invalid: "That verification request is invalid. Request a new code.",
  expired: "That code or authorization has expired. Request a new code.",
  locked: "Five incorrect attempts. Request a new code after the cooldown.",
  used: "That code has already been used. Request a new code.",
  cooldown: "Please wait 60 seconds before requesting another code.",
  rate_limited: "Too many attempts. Please wait before trying again.",
  session_required: "Please sign in again.",
  otp_required: "Email verification is required to continue.",
  conflict: "Your session changed. Refresh before trying again.",
};
class Fault extends Error {
  constructor(code, status = 400) {
    super(
      messages[code] || "We could not complete this request. Please try again.",
    );
    this.code = code;
    this.status = status;
  }
}
function checked(result) {
  if (!result || result.error) throw new Fault(result?.error || "invalid");
  return result;
}
function email(value) {
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  )
    throw new Fault("invalid");
  return value.trim();
}
function password(value, confirm = value) {
  if (
    typeof value !== "string" ||
    value.length < 8 ||
    value.length > 128 ||
    value !== confirm
  )
    throw new Fault("invalid");
  return value; // Case and whitespace are security-sensitive; never normalize.
}
function sessionId(session) {
  try {
    const claims = JSON.parse(
      Buffer.from(session.access_token.split(".")[1], "base64url"),
    );
    if (!UUID.test(claims.session_id)) throw Error();
    return claims.session_id;
  } catch {
    throw new Fault("session_required", 401);
  }
}
function publicUser(u) {
  return {
    id: u.id,
    email: u.email,
    email_confirmed_at: u.email_confirmed_at,
    created_at: u.created_at,
  };
}
class Gateway {
  constructor({ store, secrets, native, mail, now = Date.now }) {
    this.store = store;
    this.secrets = secrets;
    this.native = native;
    this.mail = mail;
    this.now = now;
  }
  async context(cookie, ip) {
    let token = /^[A-Za-z0-9_-]{43}$/.test(cookie || "") ? cookie : handle();
    let binding = this.secrets.digest("session", token);
    const saved = await this.store.call("session_read", [binding]);
    // Expired or unknown handles are rotated; never resurrect an expired row.
    if (!saved) {
      token = handle();
      binding = this.secrets.digest("session", token);
    }
    return {
      token,
      binding,
      ip,
      state: saved ? this.secrets.open(saved.cipher) : {},
      revision: saved?.revision || 0,
    };
  }
  async save(ctx) {
    const result = checked(
      await this.store.call("session_save", [
        ctx.binding,
        this.secrets.seal(ctx.state),
        new Date(this.now() + 7 * 86400000).toISOString(),
        ctx.revision,
      ]),
    );
    ctx.revision = result.revision;
  }
  async limit(ctx, category, max, seconds, identity = ctx.ip) {
    if (
      !(await this.store.call("rate", [
        this.secrets.digest("rate", category, identity),
        max,
        seconds,
      ]))
    )
      throw new Fault("rate_limited", 429);
  }
  async identity(ctx) {
    if (!ctx.revision || !ctx.state.session)
      throw new Fault("session_required", 401);
    // The SDK validates the token at the private Auth server BEFORE reading claims.
    try {
      const oldToken = ctx.state.session.access_token;
      ctx.state.session = await this.native.refreshIfNeeded(ctx.state.session);
      const u = await this.native.user(ctx.state.session);
      if (!UUID.test(u.id) || !u.email_confirmed_at || u.is_anonymous)
        throw Error();
      const sid = sessionId(ctx.state.session);
      if (!(await this.store.call("status", [u.id, sid])).live) throw Error();
      if (oldToken !== ctx.state.session.access_token) await this.save(ctx);
      return { user: u, sid };
    } catch {
      throw new Fault("session_required", 401);
    }
  }
  async requireApproved(ctx, recent = false) {
    const who = await this.identity(ctx);
    const result = await this.store.call("status", [who.user.id, who.sid]);
    if (
      ctx.state.recovery ||
      ctx.state.challenge ||
      !result.approved ||
      (recent && !result.recent)
    )
      throw new Fault("otp_required", 403);
    return who;
  }
  async issue(
    ctx,
    purpose,
    recipient,
    bridge,
    who = null,
    actionDigest = "",
    nativeCode = null,
    notify = true,
  ) {
    await this.limit(ctx, "send", 20, 3600);
    const nativeFactory = typeof nativeCode === "function",
      challengeId = id();
    let otp = nativeFactory ? code() : nativeCode || code();
    if (!/^[0-9]{8}$/.test(otp)) throw new Fault("native_configuration", 503);
    const scope = this.secrets.digest(
      "scope",
      who?.user.id || recipient.toLowerCase(),
      purpose,
    );
    const result = checked(
      await this.store.call("issue", [
        challengeId,
        ctx.binding,
        scope,
        purpose,
        who?.user.id || null,
        who?.sid || null,
        this.secrets.digest("code", ctx.binding, challengeId, otp),
        actionDigest,
        this.secrets.seal(bridge),
        nativeFactory,
      ]),
    );
    try {
      if (nativeFactory) {
        const proof = await nativeCode();
        otp = proof.code;
        if (!/^[0-9]{8}$/.test(otp))
          throw new Fault("native_configuration", 503);
        checked(
          await this.store.call("prepare", [
            challengeId,
            ctx.binding,
            this.secrets.digest("code", ctx.binding, challengeId, otp),
            this.secrets.seal(proof.bridge),
          ]),
        );
        notify = proof.notify !== false;
      }
      if (notify) await this.mail.send(recipient, otp, purpose);
    } catch (error) {
      await this.store.call("cancel", [challengeId, ctx.binding]);
      if (error instanceof Fault) throw error;
      throw new Fault("delivery_unavailable", 503);
    }
    // Only challenge metadata is allowed out. Never return the OTP or native token hash.
    return {
      ...result,
      destination: recipient.replace(/^(.).*(@.*)$/, "$1***$2"),
    };
  }
  async registration(ctx, body) {
    await this.limit(ctx, "registration", 5, 3600);
    const address = email(body.email),
      pwd = password(body.password, body.confirm);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (Array.from(name).length < 2 || Array.from(name).length > 100)
      throw new Fault("invalid");
    let link;
    ctx.state.challenge = await this.issue(
      ctx,
      "registration",
      address,
      {},
      null,
      "",
      async () => {
        try {
          link = await this.native.link({
            type: "signup",
            email: address,
            password: pwd,
            options: { data: { full_name: name } },
          });
        } catch (e) {
          if (!e.duplicate) throw new Fault("registration_unavailable", 503);
        }
        return link
          ? {
              code: link.code,
              bridge: {
                email: address,
                tokenHash: link.tokenHash,
                type: "signup",
              },
            }
          : { code: code(), bridge: { unavailable: true }, notify: false };
      },
    );
    ctx.state.registrationEmail = address;
    ctx.state.registrationId = link?.userId || null;
    await this.save(ctx);
    return this.snapshot(ctx);
  }
  async login(ctx, body) {
    await this.limit(ctx, "password_login", 10, 300);
    try {
      ctx.state = {
        session: await this.native.login(
          email(body.email),
          password(body.password),
        ),
      };
    } catch {
      throw new Fault("invalid_credentials", 401);
    }
    await this.save(ctx);
    const who = await this.identity(ctx);
    const approval = await this.store.call("approve", [
      who.user.id,
      who.sid,
      false,
      false,
    ]);
    if (approval.error === "otp_required") await this.beginLogin(ctx, who);
    else checked(approval);
    return this.snapshot(ctx);
  }
  async beginLogin(ctx, who = null) {
    who ||= await this.identity(ctx);
    ctx.state.challenge = await this.issue(
      ctx,
      "login",
      who.user.email,
      {},
      who,
    );
    await this.save(ctx);
  }
  async beginPassword(ctx, body) {
    const who = await this.requireApproved(ctx);
    const target = this.secrets.digest(
      "password-action",
      who.user.id,
      who.sid,
      password(body.password, body.confirm),
    );
    ctx.state.passwordDigest = target;
    ctx.state.challenge = await this.issue(
      ctx,
      "password",
      who.user.email,
      {},
      who,
      target,
    );
    await this.save(ctx);
    return this.snapshot(ctx);
  }
  async beginEmail(ctx, body) {
    const who = await this.requireApproved(ctx),
      target = email(body.email);
    if (target.toLowerCase() === who.user.email.toLowerCase())
      throw new Fault("invalid");
    const status = await this.store.call("status", [who.user.id, who.sid]);
    if (!status.recent) {
      ctx.state.pendingEmail = target;
      await this.beginLogin(ctx, who);
      return this.snapshot(ctx);
    }
    // Native secure email change retains BOTH old/new confirmations.
    const proof = async (type) => {
      const link = await this.native.link({
        type,
        email: who.user.email,
        newEmail: target,
      });
      return {
        code: link.code,
        bridge: { tokenHash: link.tokenHash, type: "email_change", target },
      };
    };
    ctx.state.emailTarget = target;
    let current;
    try {
      current = await this.issue(
        ctx,
        "email_current",
        who.user.email,
        {},
        who,
        "",
        () => proof("email_change_current"),
      );
      const future = await this.issue(
        ctx,
        "email_new",
        target,
        {},
        who,
        "",
        () => proof("email_change_new"),
      );
      ctx.state.challenge = current;
      ctx.state.nextChallenge = future;
    } catch (e) {
      if (current) await this.store.call("cancel", [current.id, ctx.binding]);
      throw e;
    }
    await this.save(ctx);
    return this.snapshot(ctx);
  }
  async recover(ctx, body) {
    await this.limit(ctx, "recovery", 5, 3600);
    const address = email(body.email);
    ctx.state.challenge = await this.issue(
      ctx,
      "recovery",
      address,
      {},
      null,
      "",
      async () => {
        let link;
        try {
          link = await this.native.link({ type: "recovery", email: address });
        } catch (e) {
          if (e.code === "native_configuration")
            throw e; /* Generic unavailable account response. */
        }
        return link
          ? {
              code: link.code,
              bridge: {
                email: address,
                tokenHash: link.tokenHash,
                type: "recovery",
              },
            }
          : { code: code(), bridge: { unavailable: true }, notify: false };
      },
    );
    ctx.state.recoveryEmail = address;
    await this.save(ctx);
    return this.snapshot(ctx);
  }
  async verify(ctx, body) {
    await this.limit(ctx, "verify_ip", 30, 60);
    await this.limit(ctx, "verify_binding", 15, 60, ctx.binding);
    const c = ctx.state.challenge;
    if (!c || body.id !== c.id || !/^[0-9]{8}$/.test(body.code || ""))
      throw new Fault("invalid");
    checked(
      await this.store.call("verify", [
        c.id,
        ctx.binding,
        this.secrets.digest("code", ctx.binding, c.id, body.code),
      ]),
    );
    if (c.purpose === "password") {
      ctx.state.authorization = c.id;
      delete ctx.state.challenge;
      await this.save(ctx);
      return { ...(await this.snapshot(ctx)), passwordAuthorized: true };
    }
    const proof = checked(
      await this.store.call("consume", [c.id, ctx.binding, c.purpose, ""]),
    );
    const bridge = this.secrets.open(proof.bridgeCipher);
    if (bridge.unavailable) throw new Fault("incorrect");
    if (
      ["registration", "recovery", "email_current", "email_new"].includes(
        c.purpose,
      )
    ) {
      const session = await this.native.verify(bridge.tokenHash, bridge.type);
      if (session) ctx.state.session = session;
    }
    if (c.purpose === "email_current") {
      ctx.state.challenge = ctx.state.nextChallenge;
      delete ctx.state.nextChallenge;
      await this.save(ctx);
      return this.snapshot(ctx);
    }
    if (c.purpose === "recovery") {
      ctx.state.recovery = true;
      ctx.state.recoveryUntil = this.now() + 120000;
    } else {
      const who = await this.identity(ctx);
      if (
        c.purpose === "email_new" &&
        who.user.email.toLowerCase() !== bridge.target.toLowerCase()
      )
        throw new Fault("email_change_incomplete");
      if (["login", "registration", "email_new"].includes(c.purpose))
        checked(
          await this.store.call("approve", [
            who.user.id,
            who.sid,
            c.purpose === "login",
            c.purpose !== "login",
          ]),
        );
    }
    delete ctx.state.challenge;
    const pendingEmail = ctx.state.pendingEmail;
    delete ctx.state.pendingEmail;
    await this.save(ctx);
    if (pendingEmail) return this.beginEmail(ctx, { email: pendingEmail });
    return this.snapshot(ctx);
  }
  async commitPassword(ctx, body) {
    const who = await this.identity(ctx),
      pwd = password(body.password, body.confirm);
    if (ctx.state.recovery) {
      if (ctx.state.recoveryUntil <= this.now()) throw new Fault("expired");
      // CAS burns the recovery authorization before dispatch, including concurrent requests.
      ctx.state.recovery = false;
      delete ctx.state.recoveryUntil;
      await this.save(ctx);
    } else {
      await this.requireApproved(ctx);
      if (
        !ctx.state.authorization ||
        body.authorization !== ctx.state.authorization
      )
        throw new Fault("otp_required", 403);
      checked(
        await this.store.call("consume", [
          body.authorization,
          ctx.binding,
          "password",
          this.secrets.digest("password-action", who.user.id, who.sid, pwd),
        ]),
      );
      delete ctx.state.authorization;
      await this.save(ctx);
    }
    // Revoke database eligibility before dispatch; even a native logout outage
    // cannot leave old devices with profile access after a sensitive mutation.
    await this.store.call("revoke_user", [who.user.id]);
    await this.native.password(who.user.id, pwd);
    // Password changes revoke all native sessions; every device must sign in again.
    let nativeRevoked = true;
    try {
      await this.native.logout(ctx.state.session, "global");
    } catch {
      nativeRevoked = false;
    }
    await this.store.call("session_delete", [ctx.binding]);
    ctx.state = {};
    ctx.revision = 0;
    return {
      status: "ready",
      user: null,
      recovery: false,
      message: nativeRevoked
        ? "Password updated. Please sign in again."
        : "Password updated and account access revoked. Native session sign-out could not be confirmed; please sign in again.",
    };
  }
  async resend(ctx) {
    const c = ctx.state.challenge;
    if (!c || Date.parse(c.resendAt) > this.now())
      throw new Fault("cooldown", 429);
    if (c.purpose === "login") await this.beginLogin(ctx);
    else if (c.purpose === "registration") {
      const account =
        ctx.state.registrationId &&
        (await this.native.unconfirmed(ctx.state.registrationId));
      if (account) {
        ctx.state.challenge = await this.issue(
          ctx,
          "registration",
          ctx.state.registrationEmail,
          {},
          null,
          "",
          async () => {
            const link = await this.native.link({
              type: "magiclink",
              email: ctx.state.registrationEmail,
            });
            return {
              code: link.code,
              bridge: { tokenHash: link.tokenHash, type: "email" },
            };
          },
        );
      } else
        ctx.state.challenge = await this.issue(
          ctx,
          "registration",
          ctx.state.registrationEmail,
          { unavailable: true },
          null,
          "",
          null,
          false,
        );
      await this.save(ctx);
    } else if (c.purpose === "password") {
      const who = await this.identity(ctx);
      ctx.state.challenge = await this.issue(
        ctx,
        "password",
        who.user.email,
        {},
        who,
        ctx.state.passwordDigest,
      );
      await this.save(ctx);
    } else if (c.purpose === "recovery")
      return this.recover(ctx, { email: ctx.state.recoveryEmail });
    else if (["email_current", "email_new"].includes(c.purpose)) {
      const who = await this.identity(ctx),
        target = ctx.state.emailTarget;
      ctx.state.challenge = await this.issue(
        ctx,
        c.purpose,
        c.purpose === "email_current" ? who.user.email : target,
        {},
        who,
        "",
        async () => {
          const link = await this.native.link({
            type:
              c.purpose === "email_current"
                ? "email_change_current"
                : "email_change_new",
            email: who.user.email,
            newEmail: target,
          });
          return {
            code: link.code,
            bridge: { tokenHash: link.tokenHash, type: "email_change", target },
          };
        },
      );
      await this.save(ctx);
    } else throw new Fault("invalid");
    return this.snapshot(ctx);
  }
  async snapshot(ctx) {
    if (ctx.state.challenge)
      return {
        status: "ready",
        user: null,
        recovery: false,
        otp: ctx.state.challenge,
        message:
          "If this request is available, check your email for the verification code.",
      };
    if (!ctx.state.session)
      return { status: "ready", user: null, recovery: false, message: "" };
    const who = await this.identity(ctx);
    if (ctx.state.recovery)
      return {
        status: "ready",
        user: publicUser(who.user),
        recovery: true,
        message: "Choose your new password.",
      };
    const result = await this.store.call("status", [who.user.id, who.sid]);
    if (!result.approved)
      return {
        status: "ready",
        user: null,
        recovery: false,
        needsVerification: true,
        message: messages.otp_required,
      };
    return {
      status: "ready",
      user: publicUser(who.user),
      recovery: false,
      message: "",
    };
  }
  async profile(ctx, name) {
    const who = await this.requireApproved(ctx);
    if (
      name !== undefined &&
      (typeof name !== "string" ||
        Array.from(name.trim()).length < 2 ||
        Array.from(name.trim()).length > 100)
    )
      throw new Fault("invalid");
    return this.native.profile(ctx.state.session, who.user.id, name?.trim());
  }
  async logout(ctx) {
    let nativeRevoked = true;
    if (ctx.state.session) {
      await this.store.call("revoke", [sessionId(ctx.state.session)]);
      try {
        await this.native.logout(ctx.state.session, "local");
      } catch {
        nativeRevoked = false;
      }
    }
    await this.store.call("session_delete", [ctx.binding]);
    ctx.state = {};
    ctx.revision = 0;
    return {
      status: "ready",
      user: null,
      recovery: false,
      message: nativeRevoked
        ? "You have signed out."
        : "Account access revoked. Native session sign-out could not be confirmed.",
    };
  }
  async cancel(ctx) {
    for (const c of [
      ctx.state.challenge,
      ctx.state.nextChallenge,
      ctx.state.authorization && { id: ctx.state.authorization },
    ]) {
      if (c) await this.store.call("cancel", [c.id, ctx.binding]);
    }
    for (const key of [
      "challenge",
      "nextChallenge",
      "authorization",
      "passwordDigest",
      "pendingEmail",
      "emailTarget",
    ])
      delete ctx.state[key];
    await this.save(ctx);
    return this.snapshot(ctx);
  }
}
module.exports = { Gateway, Fault, email, password };
