"use strict";
// Local preview only. Never serves migration/admin tooling, secrets or Git files.
const fs = require("node:fs"),
  path = require("node:path"),
  http = require("node:http");
const root = path.resolve(__dirname, "..");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
};
http
  .createServer((request, response) => {
    try {
      if (!["GET", "HEAD"].includes(request.method)) {
        response.writeHead(405);
        return response.end();
      }
      const url = new URL(request.url, "http://127.0.0.1"),
        name = decodeURIComponent(
          url.pathname === "/" ? "/index.html" : url.pathname,
        );
      const allowed =
        /^\/[a-z][a-z0-9-]*\.(html|js|css)$/.test(name) ||
        name === "/signForm.css" ||
        name === "/vendor/supabase-2.110.7.js" ||
        /^\/images\/[a-zA-Z0-9_.-]+\.(png|jpe?g|svg|webp|ico)$/.test(name);
      const file = path.resolve(root, "." + name);
      if (
        !allowed ||
        !file.startsWith(root + path.sep) ||
        !fs.existsSync(file) ||
        !fs.statSync(file).isFile()
      ) {
        response.writeHead(404);
        return response.end("Not found");
      }
      const real = fs.realpathSync(file);
      if (!real.startsWith(root + path.sep)) {
        response.writeHead(404);
        return response.end("Not found");
      }
      response.setHeader(
        "Content-Type",
        mime[path.extname(file)] || "application/octet-stream",
      );
      response.setHeader("Cache-Control", "no-store");
      response.setHeader("Referrer-Policy", "no-referrer");
      response.setHeader("X-Content-Type-Options", "nosniff");
      if (request.method === "HEAD") return response.end();
      fs.createReadStream(file).pipe(response);
    } catch {
      response.writeHead(400);
      response.end("Invalid request");
    }
  })
  .listen(
    Number(process.env.SELCORE_PREVIEW_PORT || 8080),
    "127.0.0.1",
    function () {
      process.stdout.write(
        `Selcore local preview: http://127.0.0.1:${this.address().port}\n`,
      );
    },
  );
