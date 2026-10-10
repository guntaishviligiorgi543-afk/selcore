"use strict";
const { Fault } = require("./gateway.cjs");
function handler(gateway, { origin, allowLocalHttp = false }) {
  const address = new URL(origin),
    local = ["localhost", "127.0.0.1"].includes(address.hostname);
  if (
    address.origin !== origin ||
    (address.protocol !== "https:" && !(local && allowLocalHttp))
  )
    throw Error(
      "The authentication gateway requires a canonical HTTPS origin.",
    );
  const cookieName =
    address.protocol === "https:"
      ? "__Host-selcore_session"
      : "selcore_local_session";
  const routes = {
    register: "registration",
    login: "login",
    recover: "recover",
    verify: "verify",
    resend: "resend",
    "password/request": "beginPassword",
    "password/commit": "commitPassword",
    "email/request": "beginEmail",
    logout: "logout",
    cancel: "cancel",
  };
  return async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("X-Content-Type-Options", "nosniff");
    try {
      const pathname = new URL(req.url, origin).pathname;
      if (!pathname.startsWith("/api/auth/")) throw new Fault("invalid", 404);
      const route = pathname.slice("/api/auth/".length);
      if (!["GET", "POST"].includes(req.method))
        throw new Fault("invalid", 405);
      if (
        req.method === "POST" &&
        (req.headers.origin !== origin ||
          req.headers["sec-fetch-site"] === "cross-site")
      )
        throw new Fault("invalid", 403);
      if (
        req.method === "POST" &&
        !/^application\/json(?:;|$)/i.test(req.headers["content-type"] || "")
      )
        throw new Fault("invalid", 415);
      const pair = (req.headers.cookie || "")
        .split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith(cookieName + "="));
      const ctx = await gateway.context(
        pair?.slice(cookieName.length + 1),
        req.socket.remoteAddress,
      );
      let data;
      if (req.method === "GET") {
        if (route === "state") data = await gateway.snapshot(ctx);
        else if (route === "profile") data = await gateway.profile(ctx);
        else throw new Fault("invalid", 404);
      } else {
        const chunks = [];
        let bytes = 0;
        for await (const chunk of req) {
          bytes += chunk.length;
          if (bytes > 4096) throw new Fault("invalid", 413);
          chunks.push(chunk);
        }
        const raw = Buffer.concat(chunks).toString("utf8");
        let body;
        try {
          body = JSON.parse(raw);
        } catch {
          throw new Fault("invalid");
        }
        if (!body || typeof body !== "object" || Array.isArray(body))
          throw new Fault("invalid");
        if (route === "profile") data = await gateway.profile(ctx, body.name);
        else if (route === "stepup") {
          await gateway.beginLogin(ctx);
          data = await gateway.snapshot(ctx);
        } else if (Object.hasOwn(routes, route))
          data = await gateway[routes[route]](ctx, body);
        else throw new Fault("invalid", 404);
      }
      const clear = route === "logout" || route === "password/commit";
      res.setHeader(
        "Set-Cookie",
        `${cookieName}=${clear ? "" : ctx.token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear ? 0 : 604800}${address.protocol === "https:" ? "; Secure" : ""}`,
      );
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify(data));
    } catch (e) {
      // Never log arbitrary SDK/SMTP errors, request bodies, cookies or headers.
      const fault = e instanceof Fault ? e : new Fault("unavailable", 503);
      res.writeHead(fault.status, {
        "Content-Type": "application/json; charset=utf-8",
      });
      res.end(JSON.stringify({ error: fault.code, message: fault.message }));
    }
  };
}
module.exports = { handler };
