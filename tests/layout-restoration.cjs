"use strict";
// Visual audit only. Uses disposable Edge profiles, read-only Git exports and
// local Auth fixtures. No production Auth request or database write is allowed.
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  http = require("node:http"),
  crypto = require("node:crypto");
const { execFileSync, spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const stage = process.argv[2] || "before";
if (
  ![
    "before",
    "after",
    "sections",
    "inspect",
    "auth-refresh",
    "checkout-refresh",
    "home-refresh",
  ].includes(stage)
)
  throw Error(
    "Use before, after, sections, inspect, auth-refresh, checkout-refresh or home-refresh",
  );
const output = path.join(root, "docs/layout-restoration");
fs.mkdirSync(output, { recursive: true });
const pointer = path.join(output, "runtime.json");
let runtime;
if (stage === "before") {
  runtime = fs.mkdtempSync(path.join(os.tmpdir(), "selcore-layout-"));
  fs.mkdirSync(path.join(runtime, "baseline"));
  fs.mkdirSync(path.join(runtime, "before"));
  fs.mkdirSync(path.join(runtime, "assets"));
  const names = execFileSync(
    "git",
    ["ls-tree", "-r", "--name-only", "830aaff"],
    { cwd: root, encoding: "utf8" },
  )
    .trim()
    .split(/\r?\n/);
  for (const name of names.filter((n) =>
    /\.(html|css|js|png|jpe?g|webp|svg|ico)$/i.test(n),
  )) {
    const target = path.join(runtime, "baseline", name);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(
      target,
      execFileSync("git", ["show", `830aaff:${name}`], {
        cwd: root,
        maxBuffer: 20 * 1024 * 1024,
      }),
    );
  }
  for (const name of fs
    .readdirSync(root)
    .filter((n) => /\.(html|css|js)$/.test(n)))
    fs.copyFileSync(path.join(root, name), path.join(runtime, "before", name));
  for (const folder of ["images", "vendor"])
    fs.cpSync(path.join(root, folder), path.join(runtime, "before", folder), {
      recursive: true,
    });
  fs.writeFileSync(
    pointer,
    JSON.stringify({ runtime, reference: "830aaff" }, null, 2),
  );
} else runtime = JSON.parse(fs.readFileSync(pointer, "utf8")).runtime;
const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const widths = [1440, 1024, 768, 390, 320];
const pages = [
  "index.html",
  "allproducts.html",
  "product.html?id=1",
  "cart.html",
  "checkout.html",
  "contact.html",
  "user.html",
];
const assetErrors = [];
const pendingAssets = new Map();
function proxy(address) {
  return "/__asset__?url=" + encodeURIComponent(address);
}
function rewriteAssets(text, base) {
  text = text.replace(/(?:src|href)="(https:\/\/[^"<>]+)"/g, (match, address) =>
    match.replace(address, proxy(address.replaceAll("&amp;", "&"))),
  );
  if (base)
    text = text.replace(
      /url\((["']?)([^)'"\s]+)\1\)/g,
      (match, quote, address) =>
        address.startsWith("data:") || address.startsWith("/__asset__")
          ? match
          : `url("${proxy(new URL(address, base).href)}")`,
    );
  return text;
}
async function asset(address) {
  const url = new URL(address);
  if (
    url.protocol !== "https:" ||
    ![
      "static.wixstatic.com",
      "cdnjs.cloudflare.com",
      "fonts.googleapis.com",
      "fonts.gstatic.com",
      "cdn.jsdelivr.net",
      "images.unsplash.com",
    ].includes(url.hostname)
  )
    throw Error("Asset host not allowlisted: " + url.hostname);
  const name = crypto.createHash("sha256").update(address).digest("hex"),
    file = path.join(runtime, "assets", name);
  if (fs.existsSync(file + ".json"))
    return {
      bytes: fs.readFileSync(file),
      ...JSON.parse(fs.readFileSync(file + ".json", "utf8")),
    };
  if (pendingAssets.has(address)) return pendingAssets.get(address);
  const task = (async () => {
    const response = await fetch(address, {
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw Error("Asset HTTP " + response.status);
    let bytes = Buffer.from(await response.arrayBuffer());
    const type =
      response.headers.get("content-type") || "application/octet-stream";
    if (type.includes("text/css"))
      bytes = Buffer.from(rewriteAssets(bytes.toString(), address));
    fs.writeFileSync(file, bytes);
    fs.writeFileSync(file + ".json", JSON.stringify({ type }));
    return { bytes, type };
  })();
  pendingAssets.set(address, task);
  return task;
}
const authFixture = fs.readFileSync(
  path.join(root, "tests/auth-fixtures.js"),
  "utf8",
);
let live;
const server = http.createServer(async (request, response) => {
  try {
    const url = new URL(request.url, "http://127.0.0.1");
    if (!["GET", "HEAD"].includes(request.method)) {
      response.writeHead(405);
      return response.end();
    }
    if (url.pathname === "/__asset__") {
      try {
        const a = await asset(url.searchParams.get("url"));
        response.setHeader("Content-Type", a.type);
        return response.end(a.bytes);
      } catch (error) {
        assetErrors.push({
          url: url.searchParams.get("url"),
          error: error.message,
        });
        response.writeHead(502);
        return response.end();
      }
    }
    if (url.pathname === "/__settings__") {
      response.setHeader("Content-Type", "application/json");
      return response.end(
        JSON.stringify({
          external: { email: true, google: true },
          disable_signup: false,
          mailer_autoconfirm: false,
        }),
      );
    }
    if (url.pathname.startsWith("/__catalogue__/")) {
      response.setHeader("Content-Type", "application/json");
      return response.end(
        JSON.stringify(live.responses[url.pathname.split("/").pop()]),
      );
    }
    if (url.pathname.startsWith("/__image__/")) {
      response.setHeader("Content-Type", "image/png");
      return response.end(
        live.images.get(url.pathname.replace("/__image__", "")),
      );
    }
    const parts = url.pathname.split("/").filter(Boolean),
      source = parts.shift();
    if (!["baseline", "before", "after"].includes(source)) {
      response.writeHead(404);
      return response.end();
    }
    const sourceRoot = source === "after" ? root : path.join(runtime, source);
    const name = decodeURIComponent(parts.join("/"));
    if (
      !/^(?:[a-zA-Z][a-zA-Z0-9-]*\.(?:html|js|css)|(?:images|vendor)\/[a-zA-Z0-9_.-]+)$/.test(
        name,
      )
    ) {
      response.writeHead(404);
      return response.end();
    }
    const file = path.resolve(sourceRoot, name);
    if (!file.startsWith(sourceRoot + path.sep) || !fs.existsSync(file)) {
      response.writeHead(404);
      return response.end();
    }
    const ext = path.extname(file);
    response.setHeader(
      "Content-Type",
      {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript; charset=utf-8",
        ".css": "text/css; charset=utf-8",
        ".png": "image/png",
      }[ext] || "application/octet-stream",
    );
    if (ext === ".html") {
      let html = rewriteAssets(fs.readFileSync(file, "utf8"));
      const instrument = `<script>(()=>{const original=window.fetch.bind(window);window.fetch=(input,init)=>{let address=typeof input==='string'?input:input.url;if(address.startsWith('https://ffznkypurnocabqyxpps.supabase.co/rest/v1/'))address='/__catalogue__/'+new URL(address).pathname.split('/').pop();else if(address.startsWith('https://ffznkypurnocabqyxpps.supabase.co/auth/v1/')){if(!address.endsWith('/settings'))throw Error('Production Auth forbidden');address='/__settings__';}return original(address,init);};})();</script>`;
      html = html.replace("<head>", "<head>" + instrument);
      return response.end(html);
    }
    if (name === "supabase-client.js")
      return response.end(
        fs.readFileSync(file, "utf8") +
          "\n" +
          authFixture +
          `\n(()=>{const original=window.SelcoreSupabase.storage.from.bind(window.SelcoreSupabase.storage);window.SelcoreSupabase.storage.from=bucket=>{const api=original(bucket),native=api.getPublicUrl.bind(api);api.getPublicUrl=object=>{const r=native(object);r.data.publicUrl='/__image__'+new URL(r.data.publicUrl).pathname;return r;};return api;};})();`,
      );
    response.end(
      ext === ".css"
        ? rewriteAssets(fs.readFileSync(file, "utf8"))
        : fs.readFileSync(file),
    );
  } catch (error) {
    response.writeHead(500);
    response.end("Visual fixture failed");
    console.error(error.message);
  }
});
class CDP {
  constructor(socket) {
    this.socket = socket;
    this.next = 1;
    this.pending = new Map();
    this.events = [];
    socket.addEventListener("message", (e) => {
      const m = JSON.parse(e.data);
      if (m.id) {
        const p = this.pending.get(m.id);
        this.pending.delete(m.id);
        m.error ? p.reject(Error(m.error.message)) : p.resolve(m.result);
      } else this.events.push(m);
    });
  }
  async send(method, params = {}) {
    const id = this.next++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("CDP timeout: " + method)),
        30000,
      );
      this.pending.set(id, {
        resolve: (r) => {
          clearTimeout(timer);
          resolve(r);
        },
        reject: (e) => {
          clearTimeout(timer);
          reject(e);
        },
      });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression) {
    const r = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (r.exceptionDetails)
      throw Error(
        r.exceptionDetails.text +
          ": " +
          r.exceptionDetails.exception?.description,
      );
    return r.result.value;
  }
}
let edge;
(async () => {
  const catalogueSnapshot = path.join(runtime, "verified-catalogue.json");
  if (process.argv.includes("--local-catalogue")) {
    const source = JSON.parse(
      fs.readFileSync(
        path.join(root, "migration/phase2/source-catalogue.json"),
        "utf8",
      ),
    );
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(root, "migration/phase2/image-manifest.json"),
        "utf8",
      ),
    );
    const categories = source.categories.map((row, i) => ({
      ...row,
      id: i + 1,
    }));
    const brands = source.brands.map((row, i) => ({ ...row, id: i + 1 }));
    const products = source.products.map((product) => {
      const category = categories.find((row) => row.name === product.techType);
      const brand = brands.find((row) => row.name === product.features.brand);
      const image = manifest.images.find(
        (row) => row.product_id === product.id,
      );
      return {
        id: product.id,
        name: product.name,
        description: product.description,
        price: product.price,
        sale_price: product.sale ? product.salePrice : null,
        currency: "GEL",
        specifications: product.features,
        stock_quantity: 0,
        is_purchasable: false,
        is_bestseller: product.bestSeller,
        is_new_arrival: product.newArrival || product.releaseYear >= 2024,
        category_id: category.id,
        brand_id: brand.id,
        category,
        brand,
        product_images: [image],
      };
    });
    const images = new Map(
      manifest.images.map((image) => {
        const bytes = fs.readFileSync(path.resolve(root, image.local_path));
        if (
          crypto.createHash("sha256").update(bytes).digest("hex") !==
          image.sha256
        )
          throw Error("Local image integrity failure");
        return [new URL(image.public_url).pathname, bytes];
      }),
    );
    live = { responses: { products, categories, brands }, images };
    console.log(
      "Explicit local catalogue/image fixtures; live access was verified independently by the frontend regression preflight.",
    );
  } else if (stage !== "before" && fs.existsSync(catalogueSnapshot)) {
    const snapshot = JSON.parse(fs.readFileSync(catalogueSnapshot, "utf8"));
    live = {
      responses: snapshot.responses,
      images: new Map(
        snapshot.images.map(([name, bytes]) => [
          name,
          Buffer.from(bytes, "base64"),
        ]),
      ),
    };
    console.log(
      "Reusing the verified read-only public catalogue/image snapshot from " +
        snapshot.date,
    );
  } else {
    live = await require("./live-catalogue.cjs")(root);
    fs.writeFileSync(
      catalogueSnapshot,
      JSON.stringify({
        date: new Date().toISOString(),
        responses: live.responses,
        images: [...live.images].map(([name, bytes]) => [
          name,
          bytes.toString("base64"),
        ]),
      }),
    );
  }
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const origin = "http://127.0.0.1:" + server.address().port;
  const profile = fs.mkdtempSync(
    path.join(os.tmpdir(), "selcore-layout-edge-"),
  );
  const executable = [
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
  ].find((p) => fs.existsSync(p));
  if (!executable) throw Error("No Chromium browser installed");
  edge = spawn(
    executable,
    [
      "--headless=new",
      "--disable-gpu",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-sync",
      "--remote-debugging-port=0",
      "--user-data-dir=" + profile,
      "about:blank",
    ],
    { windowsHide: true, stdio: "ignore" },
  );
  const active = path.join(profile, "DevToolsActivePort");
  for (let i = 0; !fs.existsSync(active) && i < 100; i++) await delay(100);
  const port = fs.readFileSync(active, "utf8").split(/\r?\n/)[0];
  const targets = await (
    await fetch(`http://127.0.0.1:${port}/json/list`)
  ).json();
  const socket = new WebSocket(
    targets.find((t) => t.type === "page").webSocketDebuggerUrl,
  );
  await new Promise((r, j) => {
    socket.addEventListener("open", r, { once: true });
    socket.addEventListener("error", j, { once: true });
  });
  const cdp = new CDP(socket);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  await cdp.send("Network.setBlockedURLs", {
    urls: ["https://ffznkypurnocabqyxpps.supabase.co/auth/*"],
  });
  await cdp.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `localStorage.setItem('cart',JSON.stringify([{id:1,quantity:1},{id:5,quantity:2}]));localStorage.setItem('favorites',JSON.stringify([{id:1}]));localStorage.removeItem('selcore-test-session');localStorage.setItem('selcore:user:11111111-1111-4111-8111-111111111111:cart',JSON.stringify([{id:1,quantity:1}]));localStorage.setItem('selcore:user:11111111-1111-4111-8111-111111111111:favorites',JSON.stringify([{id:5}]));`,
  });
  const records = [];
  async function capture(source, page, width, state = "guest") {
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    cdp.events = [];
    await cdp.send("Page.navigate", {
      url:
        origin +
        "/" +
        source +
        "/" +
        (state === "new-password" ? "user.html?code=recovery" : page),
    });
    for (let i = 0; i < 150; i++) {
      const ready = await cdp
        .evaluate(
          "document.readyState==='complete' && !!window.Selcore && window.Selcore.getCatalogueStatus()==='ready' && (!window.SelcoreAuth || window.SelcoreAuth.snapshot().status==='ready')",
        )
        .catch(() => false);
      if (ready) break;
      await delay(100);
    }
    if (state === "signup")
      await cdp.evaluate(
        "document.querySelector('.toSign').click(); document.querySelector('.signUp').click()",
      );
    if (state === "signin")
      await cdp.evaluate(
        "document.querySelector('.toSign').click(); document.querySelector('.signIn').click()",
      );
    if (state === "recovery")
      await cdp.evaluate(
        "document.querySelector('.toSign').click();document.querySelector('#showForgot').click()",
      );
    if (state === "resend")
      await cdp.evaluate(
        "document.querySelector('.toSign').click();document.querySelector('#showResend').click()",
      );
    if (state === "account") {
      await cdp.evaluate(
        "window.SelcoreAuth.login('customer@example.invalid','SafeTest123')",
      );
    }
    if (state === "navigation")
      await cdp.evaluate("document.querySelector('#burger')?.click()");
    if (state === "account-menu")
      await cdp.evaluate(
        "document.querySelector('.authNavigationToggle')?.click()",
      );
    await cdp.evaluate(
      "Promise.all([...document.images].map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r;setTimeout(r,5000)})))",
    );
    await cdp.evaluate("document.fonts.ready");
    await delay(1100);
    if (stage === "sections") {
      const height = await cdp.evaluate(
        "document.documentElement.scrollHeight",
      );
      for (let y = 0; y < height; y += 800) {
        await cdp.evaluate(`scrollTo(0,${y})`);
        await delay(150);
      }
      await cdp.evaluate("scrollTo(0,0)");
      await delay(300);
    }
    if (stage === "inspect")
      console.log(
        JSON.stringify(
          await cdp.evaluate(
            `([...document.querySelectorAll('*')].filter(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().right>document.documentElement.clientWidth+1).map(e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {name:e.id||e.className||e.tagName,parent:e.parentElement?.className,right:r.right,width:r.width,display:s.display,opacity:s.opacity,visibility:s.visibility,transform:s.transform,overflow:s.overflow}}).slice(0,35))`,
          ),
        ),
      );
    const metrics = await cdp.evaluate(
      `(()=>{const rect=e=>{const r=e.getBoundingClientRect(),s=getComputedStyle(e);return {x:r.x,y:r.y,width:r.width,height:r.height,display:s.display,font:s.font,padding:s.padding,background:s.backgroundColor}};const visible=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return s.display!=='none'&&s.visibility!=='hidden'&&r.width>0&&r.height>0&&Number(s.opacity)>0};return {url:location.pathname,width:innerWidth,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,header:rect(document.querySelector('header')),main:rect(document.querySelector('main')),logo:rect(document.querySelector('.logo')),navigation:[...document.querySelectorAll('header > *,header .nav2 > *')].filter(visible).map(e=>({name:e.className||e.tagName,...rect(e)})),overflow:[...document.querySelectorAll('main *,footer *')].filter(e=>visible(e)&&e.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(e=>({name:e.id||e.className||e.tagName,...rect(e)})),forms:[...document.querySelectorAll('.signForms,.selectform,.signInForm,.signUpForm,.authExtras,.accountDashboard,.accountFlow')].filter(visible).map(e=>({name:e.className,...rect(e)})),products:document.querySelectorAll('.allProductCard').length,images:[...document.images].filter(visible).map(i=>({src:i.getAttribute('src'),loaded:i.complete&&i.naturalWidth>0})),footer:document.querySelector('footer')?rect(document.querySelector('footer')):null}})()`,
    );
    const exceptions = cdp.events
      .filter((e) => e.method === "Runtime.exceptionThrown")
      .map(
        (e) =>
          e.params.exceptionDetails.exception?.description ||
          e.params.exceptionDetails.text,
      );
    const name = page.split(/[.?]/)[0] + "-" + width + "-" + state;
    const folder = path.join(output, source);
    fs.mkdirSync(folder, { recursive: true });
    const screenshot = await cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    fs.writeFileSync(
      path.join(folder, name + ".png"),
      Buffer.from(screenshot.data, "base64"),
    );
    // A page overview includes all sections/footer while preserving real viewport breakpoints.
    const overview = await cdp.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: true,
      clip: {
        x: 0,
        y: 0,
        width,
        height: Math.min(metrics.height, 15000),
        scale: Math.min(1, 2000 / metrics.height),
      },
    });
    fs.writeFileSync(
      path.join(folder, name + "-overview.png"),
      Buffer.from(overview.data, "base64"),
    );
    let footer;
    if (stage === "sections") {
      await cdp.evaluate("scrollTo(0,document.documentElement.scrollHeight)");
      await delay(400);
      const shot = await cdp.send("Page.captureScreenshot", {
        format: "png",
        captureBeyondViewport: false,
      });
      footer = source + "/" + name + "-footer.png";
      fs.writeFileSync(
        path.join(output, footer),
        Buffer.from(shot.data, "base64"),
      );
    }
    records.push({
      source,
      page,
      width,
      state,
      screenshot: source + "/" + name + ".png",
      overview: source + "/" + name + "-overview.png",
      footerScreenshot: footer,
      ...metrics,
      exceptions,
    });
    console.log(
      JSON.stringify({
        source,
        page,
        width,
        state,
        scrollWidth: metrics.scrollWidth,
        overflow: metrics.overflow.map((e) => e.name),
        exceptions: exceptions.length,
      }),
    );
  }
  if (stage === "inspect") await capture("after", "index.html", 320);
  else if (stage === "home-refresh") {
    for (const state of ["guest", "account", "navigation", "account-menu"])
      await capture("after", "index.html", 320, state);
  } else if (stage === "checkout-refresh") {
    for (const state of ["guest", "account"])
      await capture("after", "checkout.html", 1024, state);
  } else if (stage === "auth-refresh") {
    for (const width of widths)
      for (const state of ["signup", "signin"])
        await capture("after", "user.html", width, state);
  } else
    for (const source of stage === "before"
      ? ["baseline", "before"]
      : stage === "sections"
        ? ["baseline", "after"]
        : ["after"]) {
      for (const width of widths) {
        for (const page of pages) await capture(source, page, width);
        for (const state of stage === "sections" ? [] : ["signup", "signin"])
          await capture(source, "user.html", width, state);
      }
      if (source !== "baseline" && stage !== "sections")
        for (const width of widths) {
          for (const state of stage === "after"
            ? ["recovery", "resend", "account", "new-password"]
            : ["recovery", "resend", "account"])
            await capture(source, "user.html", width, state);
          for (const page of stage === "after"
            ? pages.filter((p) => p !== "user.html")
            : ["index.html"])
            await capture(source, page, width, "account");
          if (width <= 1024)
            await capture(source, "index.html", width, "navigation");
          if (stage === "after")
            await capture(source, "index.html", width, "account-menu");
        }
    }
  fs.writeFileSync(
    path.join(output, stage + ".json"),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        reference: "830aaff",
        records,
        assetErrors,
        catalogueSource: process.argv.includes("--local-catalogue")
          ? "Local prepared catalogue and manifest; original image SHA-256 validated. Live verification is separate."
          : "Verified read-only public catalogue/image snapshot",
        notes:
          "Isolated real Edge with local Auth fixtures. Public catalogue/images preflight read-only. Both versions replay the same cached external assets. Overview captures preserve viewport layout and scale only the screenshot.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ stage, captures: records.length, assetErrors }));
  socket.close();
  edge.kill();
  server.close();
})().catch((error) => {
  console.error(error.stack);
  edge?.kill();
  server.close();
  process.exitCode = 1;
});
