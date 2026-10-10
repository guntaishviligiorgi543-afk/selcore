"use strict";
const net = require("node:net");
const { createClient } = require("@supabase/supabase-js");
const { Fault } = require("./gateway.cjs");
function privateAddress(host) {
  if (host === "localhost" || host === "[::1]") return true;
  if (!net.isIP(host)) return false;
  const parts = host.split(".").map(Number);
  return (
    parts[0] === 127 ||
    parts[0] === 10 ||
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
    (parts[0] === 192 && parts[1] === 168)
  );
}
function nativeAuth({ origin, publishableKey, administrativeKey }) {
  const url = new URL(origin);
  // A reverse proxy in front of the PUBLIC hosted endpoint does not close its bypass.
  if (
    !privateAddress(url.hostname) ||
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  )
    throw Error(
      "Strict OTP requires an internal Auth origin. The public hosted Supabase Auth endpoint is deliberately refused.",
    );
  if (!publishableKey || !administrativeKey)
    throw Error("Server-only private Auth credentials are required.");
  const safeFetch = (input, init) => {
    if (
      new URL(typeof input === "string" ? input : input.url || input.href)
        .origin !== url.origin
    )
      throw Error("Refusing credential forwarding.");
    return fetch(input, {
      ...init,
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
  };
  const make = (key, session) =>
    createClient(url.origin, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      global: {
        fetch: safeFetch,
        ...(session
          ? { headers: { Authorization: "Bearer " + session.access_token } }
          : {}),
      },
    });
  const admin = make(administrativeKey),
    publicClient = () => make(publishableKey);
  function result(response) {
    if (response.error) {
      const e = new Fault(
        response.error.code === "otp_expired" ? "expired" : "native_failure",
        response.error.code === "otp_expired" ? 400 : 502,
      );
      e.duplicate = ["email_exists", "user_already_exists"].includes(
        response.error.code,
      );
      throw e;
    }
    return response.data;
  }
  return {
    async link(params) {
      const data = result(await admin.auth.admin.generateLink(params));
      if (
        !/^[0-9]{8}$/.test(data.properties?.email_otp || "") ||
        !data.properties.hashed_token
      )
        throw new Fault("native_configuration", 503);
      return {
        code: data.properties.email_otp,
        tokenHash: data.properties.hashed_token,
        userId: data.user?.id,
      };
    },
    async unconfirmed(userId) {
      return !result(await admin.auth.admin.getUserById(userId)).user
        .email_confirmed_at;
    },
    async login(email, password) {
      return result(
        await publicClient().auth.signInWithPassword({ email, password }),
      ).session;
    },
    async user(session) {
      return result(await publicClient().auth.getUser(session.access_token))
        .user;
    },
    async refreshIfNeeded(session) {
      if (session.expires_at * 1000 > Date.now() + 30000) return session;
      return result(
        await publicClient().auth.refreshSession({
          refresh_token: session.refresh_token,
        }),
      ).session;
    },
    async verify(token_hash, type) {
      return result(await publicClient().auth.verifyOtp({ token_hash, type }))
        .session;
    },
    async password(userId, password) {
      result(await admin.auth.admin.updateUserById(userId, { password }));
    },
    async logout(session, scope) {
      result(await admin.auth.admin.signOut(session.access_token, scope));
    },
    async profile(session, userId, name) {
      const client = make(publishableKey, session);
      const query =
        name === undefined
          ? client
              .from("profiles")
              .select("id,full_name,avatar_url,created_at,updated_at")
          : client
              .from("profiles")
              .update({ full_name: name })
              .select("id,full_name,avatar_url,created_at,updated_at");
      const data = result(await query.eq("id", userId).single());
      if (data.id !== userId) throw new Fault("profile_unavailable", 403);
      return data;
    },
  };
}
module.exports = { nativeAuth, privateAddress };
