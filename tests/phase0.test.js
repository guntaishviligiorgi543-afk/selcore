"use strict";

// No dependencies: serves an isolated test origin and runs installed headless
// Chromium with a disposable profile. Never reads a user's browser session.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const http = require("node:http");
const vm = require("node:vm");
const { execFileSync, spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const browserExecutable =
  process.env.SELCORE_TEST_BROWSER ||
  process.env.SELCORE_TEST_CHROME ||
  [
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  ].find((candidate) => fs.existsSync(candidate));
assert.ok(
  browserExecutable && fs.existsSync(browserExecutable),
  "Set SELCORE_TEST_BROWSER to an existing Chromium browser executable.",
);
const baseline = execFileSync("git", ["show", "HEAD:products.js"], {
  cwd: root,
  encoding: "utf8",
});
const current = fs.readFileSync(path.join(root, "products.js"), "utf8");
function data(source) {
  const context = vm.createContext({});
  vm.runInContext(source, context);
  return vm.runInContext("JSON.stringify(products)", context);
}
assert.equal(data(current), data(baseline), "Product data must be unchanged.");
const originalCatalogue = execFileSync("git", ["show", "HEAD:allproducts.js"], {
  cwd: root,
  encoding: "utf8",
});
const originalArray = originalCatalogue.match(
  /const products = (\[[\s\S]*?\n\]);/,
)?.[1];
if (originalArray)
  assert.equal(
    vm.runInNewContext("JSON.stringify(" + originalArray + ")"),
    data(current),
    "Canonical data must preserve the old catalogue exactly.",
  );
for (const name of fs
  .readdirSync(root)
  .filter((name) => name.endsWith(".js"))) {
  new vm.Script(fs.readFileSync(path.join(root, name), "utf8"), {
    filename: name,
  });
}
execFileSync("git", ["diff", "--exit-code", "--", "products.js", "images"], {
  cwd: root,
  stdio: "pipe",
});

async function browserTests() {
  const results = [];
  const frame = document.createElement("iframe");
  frame.width = "1400";
  frame.height = "1000";
  document.body.append(frame);
  const check = (condition, name) => {
    results.push({ name, passed: Boolean(condition) });
    if (!condition) console.error("FAIL: " + name);
  };
  const equal = (actual, expected, name) =>
    check(JSON.stringify(actual) === JSON.stringify(expected), name);
  let w, d;
  const q = (selector) => d.querySelector(selector);
  const all = (selector) => [...d.querySelectorAll(selector)];
  const click = (selector) => {
    const element = q(selector);
    if (!element) throw new Error("Missing clickable element: " + selector);
    if (typeof element.click === "function") element.click();
    else
      element.dispatchEvent(
        new w.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
  };
  const input = (selector, value, event = "input") => {
    const element = q(selector);
    element.value = value;
    element.dispatchEvent(new w.Event(event, { bubbles: true }));
  };
  const checked = (selector, value) => {
    const element = q(selector);
    element.checked = value;
    element.dispatchEvent(new w.Event("change", { bubbles: true }));
  };
  const ids = (selector = ".allProductCard") =>
    all(selector).map((node) => Number(node.dataset.id));
  const reset = () => {
    localStorage.removeItem("cart");
    localStorage.removeItem("favorites");
    localStorage.removeItem("chatMessages");
  };
  async function load(page) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Page load timed out: " + page)),
        15000,
      );
      frame.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      frame.src = "/" + page;
    });
    w = frame.contentWindow;
    d = frame.contentDocument;
    await w.Selcore.ready;
    await w.SelcoreAuth?.ready;
    await new Promise((resolve) => setTimeout(resolve, 20));
    await Promise.all(
      [...d.images]
        .filter((img) => img.loading !== "lazy")
        .map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                img.onload = resolve;
                img.onerror = resolve;
              }),
        ),
    );
    check(Boolean(w.Selcore), page + ": shared store initializes");
    equal(
      w.__phase0Errors,
      [],
      page +
        ": no uncaught initialization errors " +
        JSON.stringify(w.__phase0Errors),
    );
  }
  const clean = (name) =>
    equal(w.__phase0Errors, [], name + ": no uncaught interaction errors");
  async function navigate(selector, expected) {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("Navigation timed out: " + selector)),
        15000,
      );
      frame.onload = () => {
        clearTimeout(timer);
        resolve();
      };
      click(selector);
    });
    w = frame.contentWindow;
    d = frame.contentDocument;
    await w.Selcore.ready;
    await new Promise((resolve) => setTimeout(resolve, 20));
    equal(
      w.location.pathname + w.location.search,
      "/" + expected,
      "navigation: " + selector,
    );
    clean("navigation " + selector);
  }
  async function suite(name, action) {
    try {
      await action();
    } catch (error) {
      check(false, name + ": " + error.message);
    }
  }
  await suite("seven pages", async () => {
    reset();
    for (const page of [
      "index.html",
      "allproducts.html",
      "product.html?id=1",
      "cart.html",
      "checkout.html",
      "user.html",
      "contact.html",
    ]) {
      await load(page);
      equal(
        w.getComputedStyle(q(".authNavigation")).display,
        q(".authNavigation").hidden ? "none" : "inline",
        page + ": compact Auth navigation preserves the original header",
      );
      const burger = q("#burger"),
        menu = q(".burgerMenu");
      if (burger && menu) {
        checked("#burger", true);
        check(menu.classList.contains("active"), page + ": burger opens");
        checked("#burger", false);
        check(!menu.classList.contains("active"), page + ": burger closes");
      }
    }
  });
  await suite("restored account menu", async () => {
    await load("index.html");
    const toggle = q(".authNavigationToggle"),
      menu = q(".authNavigationMenu"),
      headerHeight = q("header").getBoundingClientRect().height;
    check(menu.hidden, "layout: account actions start collapsed");
    equal(
      toggle.querySelector("svg").getBoundingClientRect().width,
      32,
      "layout: original account icon dimensions preserved",
    );
    click(".authNavigationToggle");
    check(
      !menu.hidden && toggle.getAttribute("aria-expanded") === "true",
      "layout: account icon exposes guest actions",
    );
    equal(
      q("header").getBoundingClientRect().height,
      headerHeight,
      "layout: account menu does not resize header",
    );
    d.dispatchEvent(
      new w.KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
    check(
      menu.hidden && d.activeElement === toggle,
      "layout: Escape closes account menu and restores focus",
    );
    click(".authNavigationToggle");
    d.body.click();
    check(menu.hidden, "layout: outside click closes account menu");
    click(".authNavigationToggle");
    w.dispatchEvent(new w.Event("resize"));
    check(menu.hidden, "layout: resize closes account menu");
  });
  await suite("homepage", async () => {
    reset();
    await load("index.html");
    equal(
      ids(".bestSellCards"),
      [1, 2, 4, 6],
      "home: database bestseller flags",
    );
    equal(
      ids(".newArrivals .bestSellerCard"),
      [3, 14, 19, 23],
      "home: database arrival flags",
    );
    check(
      Boolean(q(".left").style.transform && q(".right").style.transform),
      "home: local headphone animation initializes",
    );
    // Remote hero images are offline in this suite; keep their intended size
    // so the mouse-coordinate calculation has a real, nonzero layout box.
    for (const image of all(".headpones img")) {
      image.width = 216;
      image.height = 338;
    }
    const transform = q(".left").style.transform;
    const bounds = q(".headpones").getBoundingClientRect();
    q(".headpones").dispatchEvent(
      new w.MouseEvent("mousemove", {
        clientX: bounds.right,
        clientY: bounds.bottom,
        bubbles: true,
      }),
    );
    // Headless virtual clocks do not reliably advance child-frame paint ticks.
    // Execute the app's actual scheduled callback at a controlled frame boundary.
    w.__phase0AnimationStep(w.performance.now());
    check(
      q(".left").style.transform !== transform,
      "home: headphone motion calculations respond to movement (controlled frame)",
    );
    w.Selcore.toggleCart(1);
    click(".cartLink");
    check(q(".cartSidebar").classList.contains("active"), "home: cart opens");
    click(".cartItems .plusBtn");
    check(
      q(".cartSidebar").classList.contains("active"),
      "home: quantity rerender keeps cart open",
    );
    equal(w.Selcore.getCart()[0].quantity, 2, "home: plus increases once");
    check(
      q(".totalPrice").textContent.includes("5398"),
      "home: sale total updates",
    );
    click(".cartItems .minusBtn");
    equal(w.Selcore.getCart()[0].quantity, 1, "home: minus decreases");
    click(".cartItems .minusBtn");
    equal(w.Selcore.getCart().length, 0, "home: minus from one removes");
    check(
      q(".cartItems").textContent.includes("empty"),
      "home: empty cart message",
    );
    w.Selcore.toggleFavorite(3);
    click(".favLink");
    check(
      q(".favContainer").classList.contains("active"),
      "home: favorites opens",
    );
    click(".removeFromFav");
    check(
      q(".favContainer").classList.contains("active"),
      "home: favorite rerender keeps panel open",
    );
    equal(w.Selcore.getFavorites().length, 0, "home: favorite removal");
    click(".closeFav");
    check(
      !q(".favContainer").classList.contains("active"),
      "home: favorites closes",
    );
    click(".contact-svg-p svg");
    input(".writeMsg input", "<img src=x onerror=alert(1)>");
    click(".writeMsg button");
    check(
      q(".chatDisplay").textContent.includes("<img"),
      "home: chat text preserved safely",
    );
    equal(
      all(".chatDisplay img").length,
      0,
      "home: chat does not inject markup",
    );
    click(".deleteChat");
    equal(all(".chatDisplay .sent").length, 0, "home: chat clears");
    click(".closeChat");
    check(
      !q(".chatContainer").classList.contains("active"),
      "home: chat closes",
    );
    const newsletter = q("form");
    newsletter.querySelector("input[type=email]").value =
      "test@example.invalid";
    const submit = new w.Event("submit", { bubbles: true, cancelable: true });
    newsletter.dispatchEvent(submit);
    check(
      submit.defaultPrevented &&
        newsletter.textContent.includes("not been sent"),
      "home: newsletter explicitly unavailable",
    );
    clean("homepage");
  });
  await suite("catalogue", async () => {
    reset();
    await load("allproducts.html");
    equal(ids().length, 24, "catalogue: all products render");
    check(
      all(".allProductCard img").every((img) => img.naturalWidth > 0),
      "catalogue: all product images load",
    );
    click('.cartBtn[data-id="1"]');
    check(
      q('.cartBtn[data-id="1"]').classList.contains("active"),
      "catalogue: cart button active",
    );
    click('.favoriteBtn[data-id="1"]');
    check(
      q('.favoriteBtn[data-id="1"]').classList.contains("favoriteActive"),
      "catalogue: favorite button active",
    );
    input(".searchInput", "iphone");
    equal(ids(), [1], "catalogue: search");
    check(
      q('.cartBtn[data-id="1"]').classList.contains("active") &&
        q('.favoriteBtn[data-id="1"]').classList.contains("favoriteActive"),
      "catalogue: selections survive rerender",
    );
    input(".searchInput", "");
    input("#sortPrice", "lowToHigh", "change");
    const prices = ids().map((id) =>
      w.Selcore.effectivePrice(w.Selcore.getProduct(id)),
    );
    equal(
      prices,
      [...prices].sort((a, b) => a - b),
      "catalogue: ascending effective-price sorting",
    );
    input("#sortPrice", "highToLow", "change");
    equal(
      ids().map((id) => w.Selcore.effectivePrice(w.Selcore.getProduct(id))),
      [...prices].sort((a, b) => b - a),
      "catalogue: descending sorting",
    );
    all("aside nav li")
      .find((node) => node.textContent.trim() === "sales")
      .click();
    check(
      ids().every((id) => w.Selcore.getProduct(id).sale) && ids().length === 13,
      "catalogue: sales category",
    );
    checked(".bestSellerFilter", true);
    equal(
      ids()
        .slice()
        .sort((a, b) => a - b),
      [1, 7, 9, 12, 24],
      "catalogue: sales plus best-seller intersection",
    );
    input(".searchInput", "iphone");
    equal(ids(), [1], "catalogue: sale plus best plus search");
    click('.cartBtn[data-id="1"]');
    equal(
      w.Selcore.getCart().length,
      0,
      "catalogue: second add removes entirely",
    );
    clean("catalogue");
    await load("allproducts.html?brand=Apple&category=sale");
    equal(ids(), [1, 7, 9], "catalogue: URL category and brand combine");
    input("#sortPrice", "lowToHigh", "change");
    equal(ids(), [9, 1, 7], "catalogue: sorting retains URL category/brand");
    checked(".newArrivalFilter", true);
    equal(ids(), [], "catalogue: empty combined filters");
    check(
      q(".emptyProducts").textContent.includes("No products"),
      "catalogue: empty filter message",
    );
    checked(".newArrivalFilter", false);
    all("aside nav li")
      .find((node) => node.textContent.trim() === "computers & tablets")
      .click();
    equal(ids(), [7, 4], "catalogue: sidebar category retains brand and sort");
    check(
      w.location.search.includes("brand=Apple") &&
        w.location.search.includes("category=computer"),
      "catalogue: category URL stays consistent",
    );
    const mappings = {
      mobile: 6,
      computer: 11,
      accessory: 7,
      sale: 13,
      new: 4,
      best: 13,
      headphone: 2,
    };
    for (const [category, count] of Object.entries(mappings)) {
      await load("allproducts.html?category=" + category);
      equal(ids().length, count, "catalogue: URL mapping " + category);
    }
    await load("allproducts.html");
    const links = all(".nav1 a")
      .slice(0, 5)
      .map((node) => node.getAttribute("href"));
    equal(
      links,
      ["new", "mobile", "computer", "accessory", "sale"].map(
        (category) => "allproducts.html?category=" + category,
      ),
      "catalogue: five broken routes fixed",
    );
  });
  await suite("detail IDs", async () => {
    reset();
    for (let id = 1; id <= 24; id++) {
      await load("product.html?id=" + id);
      const product = w.Selcore.getProduct(id);
      equal(
        q(".productName").textContent,
        product.name,
        "detail " + id + ": name resolves",
      );
      equal(
        q(".productPrice").textContent,
        w.Selcore.effectivePrice(product) + " ₾",
        "detail " + id + ": price",
      );
      equal(
        all(".productFeatures p").length,
        Object.keys(product.features).length + 1,
        "detail " + id + ": all specs render",
      );
      check(
        q(".productImage").naturalWidth > 0,
        "detail " + id + ": image loads",
      );
      const expected = w.Selcore.getProducts()
        .filter((item) => item.techType === product.techType && item.id !== id)
        .map((item) => item.id);
      equal(ids(".sameTech"), expected, "detail " + id + ": related products");
    }
    for (const query of ["", "?id=999", "?id=abc", "?id=-1", "?id=1.5"]) {
      await load("product.html" + query);
      check(
        q(".productPage").textContent.includes("Product not found"),
        "detail: invalid ID " + query,
      );
      equal(
        all(".addTocartBtn, .addTofavBtn").length,
        0,
        "detail: no invalid product actions " + query,
      );
    }
  });
  await suite("detail state", async () => {
    reset();
    await load("product.html?id=1");
    click(".addTocartBtn");
    equal(w.Selcore.getCart().length, 1, "detail: add cart");
    click(".addTofavBtn");
    equal(
      all(".favProduct").length,
      1,
      "detail: favorite panel immediately updates",
    );
    click(".favLink");
    click(".addToCartFromFav");
    equal(
      w.Selcore.getCart().length,
      0,
      "detail: favorite-to-cart retains toggle semantics",
    );
    equal(
      q(".addTocartBtn").textContent,
      "Add to cart",
      "detail: main cart button updates",
    );
    click(".addToCartFromFav");
    equal(w.Selcore.getCart().length, 1, "detail: favorite-to-cart adds");
    click(".cartLink");
    click(".removeCart");
    equal(
      q(".addToCartFromFav").textContent,
      "Add to Cart",
      "detail: sidebar removal updates favorite cart button",
    );
    equal(
      q(".addTocartBtn").textContent,
      "Add to cart",
      "detail: sidebar removal updates detail button",
    );
    click(".removeFromFav");
    equal(
      q(".addTofavBtn").textContent,
      "Add to fav",
      "detail: panel removal updates detail favorite button",
    );
    click(".addTofavBtn");
    click(".addTocartBtn");
    click(".addTocartBtn");
    equal(
      w.Selcore.getCart().length,
      0,
      "detail: repeated main add removes entirely",
    );
    clean("detail actions");
  });
  await suite("cart and checkout", async () => {
    reset();
    localStorage.setItem(
      "cart",
      JSON.stringify([
        { id: 1, quantity: 2 },
        { id: 11, quantity: 3 },
      ]),
    );
    await load("cart.html");
    equal(all(".cartCard").length, 2, "cart page: entries display");
    check(q(".cartTotal").textContent.includes("5695"), "cart page: total");
    click('.plusBtn[data-id="1"]');
    check(
      q(".cartTotal").textContent.includes("8394"),
      "cart page: quantity total",
    );
    click('.minusBtn[data-id="1"]');
    click('.removeCart[data-id="11"]');
    equal(w.Selcore.getCart().length, 1, "cart page: removal");
    check(
      q(".checkoutBtn").getAttribute("href") === "checkout.html",
      "cart page: checkout route",
    );
    await load("checkout.html");
    equal(
      all(".checkoutProduct").length,
      1,
      "checkout: cart persists on navigation",
    );
    check(q(".sumPrice").textContent.includes("5398"), "checkout: same total");
    const form = q(".addressForm");
    for (const field of form.querySelectorAll("input"))
      field.value = "Test value";
    const submit = new w.Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(submit);
    check(
      submit.defaultPrevented && form.textContent.includes("not been saved"),
      "checkout: address handler reports unavailable",
    );
    const before = localStorage.getItem("cart");
    click(".buyBtn");
    equal(
      localStorage.getItem("cart"),
      before,
      "checkout: Buy does not clear cart or simulate purchase",
    );
    check(
      q(".buyBtn").parentElement.textContent.includes(
        "no order will be placed",
      ),
      "checkout: clear purchase message",
    );
    click(".removeCheckout");
    equal(w.Selcore.getCart().length, 0, "checkout: remove persists");
    check(q(".sumPrice").textContent.includes("0₾"), "checkout: empty total");
    await load("cart.html");
    check(
      Boolean(q(".shopNow")) &&
        q(".cartContainer").textContent.includes("empty"),
      "cart page: empty navigation state",
    );
    clean("cart/checkout");
  });
  await suite("account/contact", async () => {
    reset();
    await load("user.html");
    click(".toSign");
    equal(q(".userSec2").style.display, "flex", "account: join opens forms");
    click(".signIn");
    check(
      q(".signUpForm").classList.contains("hidden") &&
        !q(".signInForm").classList.contains("hidden"),
      "account: sign-in switch",
    );
    click(".signUp");
    check(
      !q(".signUpForm").classList.contains("hidden"),
      "account: sign-up switch",
    );
    click(".togglePassword");
    equal(
      q("#signupPassword").type,
      "text",
      "account: password visibility opens",
    );
    click(".togglePassword");
    equal(
      q("#signupPassword").type,
      "password",
      "account: password visibility closes",
    );
    input("#signupName", "Test User");
    input("#signupEmail", "test@example.invalid");
    input("#signupPassword", "SafeTest123");
    input("#confirmPassword", "Different123");
    checked("#terms", true);
    check(
      !q("#confirmPassword").checkValidity(),
      "account: mismatched passwords rejected",
    );
    input("#confirmPassword", "SafeTest123");
    check(
      q("#signupForm").checkValidity(),
      "account: valid names/password patterns",
    );
    for (const selector of ["#signupForm", "#signinForm"]) {
      const form = q(selector);
      form.querySelector("input[type=email]").value = "test@example.invalid";
      if (selector === "#signinForm")
        form.querySelector("input[type=password]").value = "SafeTest123";
      let prevented = false;
      form.addEventListener("submit", (event) => {
        prevented = event.defaultPrevented;
      });
      form.requestSubmit();
      check(
        prevented,
        "account: native valid submission prevented " + selector,
      );
      equal(form.method, "post", "account: safe method fallback " + selector);
      check(
        form.textContent.includes("Please wait"),
        "account: authentication loading message " + selector,
      );
      check(
        form.lastElementChild.matches('button[type="submit"]'),
        "account: status preserves submit button CSS " + selector,
      );
      equal(
        w.getComputedStyle(form.querySelector('button[type="submit"]'))
          .paddingTop,
        "10px",
        "account: existing submit styling retained " + selector,
      );
      equal(
        w.getComputedStyle(form.querySelector(".featureStatus")).color,
        "rgb(255, 255, 255)",
        "account: status text readable " + selector,
      );
      while (form.hasAttribute("aria-busy"))
        await new Promise((resolve) => setTimeout(resolve, 20));
      if (selector === "#signinForm") await w.SelcoreAuth.logout();
    }
    equal(w.location.search, "", "account: no credentials in URL");
    clean("account");
    await load("contact.html");
    click('.faqTab[data-category="settingUp"]');
    check(
      q('.faqCategory[data-category="settingUp"]').classList.contains("active"),
      "contact: FAQ tab",
    );
    click('.faqCategory[data-category="settingUp"] .faqQuestion');
    check(
      q(
        '.faqCategory[data-category="settingUp"] .faqQuestion',
      ).parentElement.classList.contains("active"),
      "contact: FAQ opens",
    );
    click('.faqCategory[data-category="settingUp"] .faqQuestion');
    check(
      !q(
        '.faqCategory[data-category="settingUp"] .faqQuestion',
      ).parentElement.classList.contains("active"),
      "contact: FAQ closes",
    );
    const form = q("form");
    for (const field of form.querySelectorAll("input,textarea"))
      field.value =
        field.type === "email" ? "test@example.invalid" : "Test message";
    let prevented = false;
    form.addEventListener("submit", (event) => {
      prevented = event.defaultPrevented;
    });
    form.requestSubmit();
    check(
      prevented && form.method === "post",
      "contact: native valid submission prevented",
    );
    equal(w.location.search, "", "contact: no submitted data in URL");
    check(
      form.textContent.includes("message has not been sent"),
      "contact: honest unavailable message",
    );
    clean("contact");
  });
  await suite("storage/security", async () => {
    reset();
    localStorage.setItem("cart", "{invalid");
    localStorage.setItem("favorites", "null");
    localStorage.setItem("chatMessages", "{}");
    await load("index.html");
    equal(w.Selcore.getCart(), [], "storage: malformed cart JSON recovers");
    equal(
      w.Selcore.getFavorites(),
      [],
      "storage: malformed favorites shape recovers",
    );
    localStorage.setItem(
      "cart",
      JSON.stringify([
        {
          id: 1,
          quantity: 2,
          name: '<img src=x onerror="window.__injected=true">',
          image: "javascript:alert(1)",
          price: 1,
          sale: false,
        },
        { id: 1, quantity: 5 },
        { id: 999, quantity: 1 },
        { id: 2, quantity: -1 },
        { id: 3, quantity: 1.5 },
        { id: 4, quantity: "2" },
        { id: 5, quantity: 0 },
        { id: 6, quantity: null },
        { id: "1abc", quantity: 1 },
      ]),
    );
    localStorage.setItem(
      "favorites",
      JSON.stringify([
        { id: 1, name: "<script>bad</script>", image: "data:text/html,bad" },
        { id: 1 },
        { id: 999 },
      ]),
    );
    await load("checkout.html");
    equal(
      w.Selcore.getCart().map((item) => [item.id, item.quantity]),
      [[1, 2]],
      "storage: invalid IDs/quantities/duplicates rejected",
    );
    check(
      q(".checkoutProducts").textContent.includes("iPhone 15 Pro") &&
        q(".sumPrice").textContent.includes("5398"),
      "security: stored names/prices replaced by canonical data",
    );
    check(
      q(".checkoutProduct img")
        .getAttribute("src")
        .includes(
          "/__image__/storage/v1/object/public/product-images/products/1/",
        ),
      "security: stored image URL ignored",
    );
    check(
      !w.__injected && !q(".checkoutProducts script"),
      "security: injected markup does not execute/render",
    );
    await load("product.html?id=1");
    equal(
      all(".favProduct").length,
      1,
      "storage: invalid/duplicate favorites filtered",
    );
    check(
      q(".favProductNam").textContent === "iPhone 15 Pro",
      "security: favorite snapshot ignored",
    );
    w.Selcore.toggleCart(999);
    equal(w.Selcore.getCart().length, 1, "storage: missing lookup cannot add");
    w.Selcore.changeQuantity(1, 3);
    equal(
      w.Selcore.getCart()[0].quantity,
      2,
      "storage: invalid quantity operation ignored",
    );
    // Storage denial is injected into this isolated frame only.
    const setItem = w.Storage.prototype.setItem;
    w.Storage.prototype.setItem = function () {
      throw new w.DOMException("Storage unavailable", "QuotaExceededError");
    };
    w.Selcore.toggleCart(2);
    check(
      d
        .querySelector("main .featureStatus")
        .textContent.includes("could not be saved"),
      "storage: write failure is visible",
    );
    w.Storage.prototype.setItem = setItem;
    clean("storage/security");
  });
  await suite("cross-tab storage", async () => {
    reset();
    await load("product.html?id=1");
    const other = document.createElement("iframe");
    document.body.append(other);
    await new Promise((resolve) => {
      other.onload = resolve;
      other.src = "/cart.html";
    });
    await other.contentWindow.Selcore.ready;
    other.contentWindow.Selcore.toggleCart(1);
    other.contentWindow.Selcore.toggleFavorite(1);
    await new Promise((resolve) => setTimeout(resolve, 100));
    check(
      w.Selcore.isInCart(1) && w.Selcore.isFavorite(1),
      "storage: real cross-document events synchronize state",
    );
    equal(
      q(".addTocartBtn").textContent,
      "Added to cart",
      "storage: cross-document cart button updates",
    );
    equal(
      q(".addTofavBtn").textContent,
      "Added to fav",
      "storage: cross-document favorite button updates",
    );
    other.contentWindow.localStorage.clear();
    await new Promise((resolve) => setTimeout(resolve, 100));
    check(
      !w.Selcore.isInCart(1) && !w.Selcore.isFavorite(1),
      "storage: clear synchronizes empty state",
    );
    other.remove();
    clean("cross-tab");
  });
  await suite("navigation", async () => {
    reset();
    await load("index.html");
    await navigate(".bestSellCards", "product.html?id=1");
    await load("index.html");
    await navigate(".brandBtn", "allproducts.html?brand=Apple");
    await navigate(".allProductCard", "product.html?id=1");
    await navigate(".sameTech", "product.html?id=2");
    await load("index.html");
    w.Selcore.toggleCart(1);
    click(".cartLink");
    await navigate(".cartProduct", "product.html?id=1");
    await load("index.html");
    w.Selcore.toggleFavorite(3);
    click(".favLink");
    await navigate(".favProductNam", "product.html?id=3");
    await load("cart.html");
    await navigate(".checkoutBtn", "checkout.html");
    reset();
    await load("cart.html");
    await navigate(".shopNow", "allproducts.html");
  });
  await suite("Phase 3 integration states", async () => {
    reset();
    await load("allproducts.html");
    equal(
      all("#categoryFilter option").length,
      5,
      "live: all four category options",
    );
    equal(
      all("#brandFilter option").length,
      18,
      "live: all seventeen brand options",
    );
    for (const [category, count] of [
      ["mobile", 6],
      ["laptop", 6],
      ["tablet", 5],
      ["accessory", 7],
    ]) {
      input("#categoryFilter", category, "change");
      equal(ids().length, count, "live: category dropdown " + category);
    }
    input("#categoryFilter", "", "change");
    input("#brandFilter", "Apple", "change");
    equal(ids(), [1, 4, 7, 9, 23], "live: brand dropdown");
    input("#minPrice", "1000");
    input("#maxPrice", "3000");
    checked(".bestSellerFilter", true);
    input(".searchInput", "ipad");
    equal(ids(), [7], "live: category/brand/price/flag/search pipeline");
    input("#brandFilter", "", "change");
    check(
      !w.location.search.includes("brand="),
      "live: clearing brand clears URL",
    );
    input("#minPrice", "");
    input("#maxPrice", "");
    input(".searchInput", "");
    checked(".bestSellerFilter", false);
    equal(ids().length, 24, "live: reset combined controls");
    equal(
      w.__catalogueRequestCount,
      3,
      "live: one joined query plus two lookups",
    );
    await Promise.all([
      w.SelcoreCatalogue.getProducts(),
      w.SelcoreCatalogue.getBrands(),
      w.SelcoreCatalogue.getCategories(),
      w.SelcoreCatalogue.getProductById(1),
    ]);
    equal(
      w.__catalogueRequestCount,
      3,
      "live: cached service calls avoid extra requests",
    );
    click('.cartBtn[data-id="1"]');
    click('.favoriteBtn[data-id="1"]');
    equal(
      JSON.parse(localStorage.getItem("cart")),
      [{ id: 1, quantity: 1 }],
      "live: cart persists IDs only",
    );
    equal(
      JSON.parse(localStorage.getItem("favorites")),
      [{ id: 1 }],
      "live: favorites persist IDs only",
    );
    const saved = localStorage.getItem("cart");
    await fetch("/__mode__?value=error");
    await load("allproducts.html");
    equal(ids(), [], "failure: no stale catalogue fallback");
    check(
      q(".catalogueStatus").textContent.includes("temporarily"),
      "failure: safe customer error",
    );
    equal(
      localStorage.getItem("cart"),
      saved,
      "failure: saved references retained",
    );
    await fetch("/__mode__?value=normal");
    click(".catalogueRetry");
    await w.SelcoreCatalogue.getProducts();
    await new Promise((resolve) => setTimeout(resolve, 30));
    equal(ids().length, 24, "failure: retry restores live products");
    equal(
      w.Selcore.getCart()[0].price,
      2999,
      "failure: retry rehydrates authoritative price",
    );
    await fetch("/__mode__?value=empty");
    await load("allproducts.html");
    equal(ids(), [], "empty: no cards");
    check(
      q(".emptyProducts").textContent.includes("No products"),
      "empty: clear message",
    );
    await fetch("/__mode__?value=missing-images");
    await load("allproducts.html");
    equal(ids().length, 24, "images: missing image does not lose product");
    equal(
      all(".allProductCard .imageUnavailable").length,
      24,
      "images: accessible placeholders replace missing images",
    );
    await fetch("/__mode__?value=inactive");
    await load("product.html?id=1");
    check(
      q(".productPage").textContent.includes("not found"),
      "inactive: unavailable product handled",
    );
    await fetch("/__mode__?value=malicious");
    await load("allproducts.html");
    check(
      q(".allProductCard").textContent.includes("<img"),
      "DOM: remote names remain text",
    );
    check(!w.__injected, "DOM: remote content cannot execute");
    await fetch("/__mode__?value=normal");
    frame.width = "390";
    await load("allproducts.html");
    input(".searchInput", "pixel");
    equal(ids(), [3], "mobile: search remains functional");
    click('.cartBtn[data-id="3"]');
    check(w.Selcore.isInCart(3), "mobile: cart interaction");
    for (const page of [
      "index.html",
      "allproducts.html",
      "product.html?id=1",
      "cart.html",
      "checkout.html",
      "user.html",
      "contact.html",
    ]) {
      await load(page);
      check(
        d.documentElement.scrollWidth <= 410,
        "mobile: viewport " +
          page +
          " " +
          JSON.stringify({
            width: d.documentElement.scrollWidth,
            offenders: [...d.querySelectorAll("body *")]
              .filter(
                (el) =>
                  el.getBoundingClientRect().right > 410 &&
                  el.getBoundingClientRect().width > 0,
              )
              .slice(0, 12)
              .map((el) => ({
                tag: el.tagName,
                class: el.className,
                width: Math.round(el.getBoundingClientRect().width),
                right: Math.round(el.getBoundingClientRect().right),
              })),
          }),
      );
      clean("mobile " + page);
    }
    check(q("body") !== null, "mobile: all seven pages load");
    await load("index.html");
    click(".cartLink");
    check(
      q(".cartSidebar").classList.contains("active"),
      "mobile: cart sidebar opens",
    );
    check(
      q(".cartSidebar").getBoundingClientRect().right <= 391,
      "mobile: open cart fits viewport",
    );
    await load("user.html");
    click(".toSign");
    check(
      d.documentElement.scrollWidth <= 410,
      "mobile: signup form fits viewport",
    );
    click(".signIn");
    check(
      d.documentElement.scrollWidth <= 410,
      "mobile: signin form fits viewport",
    );
    frame.width = "1400";
    await load("checkout.html");
    check(q(".buyBtn").disabled, "checkout: final purchase button disabled");
    check(
      all(".checkoutProduct").every(
        (card) => w.Selcore.getProduct(card.dataset.id).isPurchasable === false,
      ),
      "checkout: demo products remain restricted",
    );
    reset();
  });
  const requests = await (await fetch("/__requests__")).json();
  await suite("Phase 4 authentication", async () => {
    reset();
    localStorage.removeItem("selcore-test-session");
    const wait = async (test) => {
      for (let n = 0; n < 200; n++) {
        if (test()) return;
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error("Auth UI did not settle");
    };
    const submit = (selector) =>
      q(selector).dispatchEvent(
        new w.Event("submit", { bubbles: true, cancelable: true }),
      );
    const reject = async (fn, name) => {
      let rejected = false;
      try {
        await fn();
      } catch {
        rejected = true;
      }
      check(rejected, name);
    };
    await load("user.html?view=account");
    check(
      w.location.search === "?view=signin",
      "auth: protected account redirects to sign in",
    );
    check(q("#accountDashboard").hidden, "auth: guest dashboard hidden");
    equal(
      [...q(".authNavigation").querySelectorAll("a")].map((a) => a.textContent),
      ["Sign In", "Sign Up"],
      "auth: guest header actions",
    );
    const registration = {
      name: "სახელი გვარი",
      email: "customer@example.invalid",
      password: "SafeTest123",
      confirm: "SafeTest123",
    };
    await reject(
      () => w.SelcoreAuth.register({ ...registration, email: "broken" }),
      "auth: invalid email rejected",
    );
    await reject(
      () =>
        w.SelcoreAuth.register({
          ...registration,
          password: "short",
          confirm: "short",
        }),
      "auth: weak password rejected",
    );
    await reject(
      () => w.SelcoreAuth.register({ ...registration, confirm: "Different" }),
      "auth: password mismatch rejected",
    );
    equal(
      w.__authFixture.calls.signUp || 0,
      0,
      "auth: invalid registration makes no SDK request",
    );
    click(".signUp");
    input("#signupName", registration.name);
    input("#signupEmail", registration.email);
    input("#signupPassword", registration.password);
    input("#confirmPassword", registration.confirm);
    checked("#terms", true);
    check(q("#signupForm").checkValidity(), "auth: Unicode full name accepted");
    submit("#signupForm");
    submit("#signupForm");
    check(
      q('#signupForm button[type="submit"]').disabled,
      "auth: registration loading blocks duplicate submissions",
    );
    await wait(() => !q("#signupForm").hasAttribute("aria-busy"));
    equal(
      w.__authFixture.calls.signUp,
      1,
      "auth: duplicate registration prevented",
    );
    check(
      q("#signupForm").textContent.includes("check your email"),
      "auth: verification confirmation",
    );
    equal(
      q("#signupPassword").value,
      "",
      "auth: password cleared after request",
    );
    const generic = await w.SelcoreAuth.register({
      ...registration,
      email: "existing@example.invalid",
    });
    check(
      generic.includes("If this address"),
      "auth: existing account response avoids enumeration",
    );
    click("#showResend");
    input("#actionEmail", registration.email);
    submit("#emailActionForm");
    await wait(() => !q("#emailActionForm").hasAttribute("aria-busy"));
    equal(w.__authFixture.calls.resend, 1, "auth: resend verification request");
    check(
      q('#emailActionForm button[type="submit"]').disabled,
      "auth: resend cooldown visible",
    );
    submit("#emailActionForm");
    await wait(() => !q("#emailActionForm").hasAttribute("aria-busy"));
    equal(
      w.__authFixture.calls.resend,
      1,
      "auth: cooldown rejects repeated requests",
    );
    await load("user.html?view=signin");
    click("#showResend");
    check(
      q('#emailActionForm button[type="submit"]').disabled,
      "auth: cooldown survives refresh",
    );
    await reject(
      () => w.SelcoreAuth.login(registration.email, "Incorrect123"),
      "auth: incorrect password rejected",
    );
    await reject(
      () =>
        w.SelcoreAuth.login(
          "unverified@example.invalid",
          registration.password,
        ),
      "auth: unverified email cannot sign in",
    );
    await reject(
      () => w.SelcoreAuth.getProfile(),
      "auth: guest profile access rejected",
    );
    await reject(
      () => w.SelcoreAuth.updatePassword("NewSafe123", "NewSafe123"),
      "auth: guest password update rejected",
    );
    localStorage.setItem("cart", JSON.stringify([{ id: 1, quantity: 2 }]));
    localStorage.setItem("favorites", JSON.stringify([{ id: 2 }]));
    await load("user.html?view=signin");
    input("#signinEmail", registration.email);
    input("#signinPassword", registration.password);
    submit("#signinForm");
    await wait(
      () =>
        !q("#accountDashboard").hidden && !q("#profileForm button").disabled,
    );
    check(
      w.SelcoreAuth.snapshot().user.email === registration.email,
      "auth: valid login",
    );
    check(
      q(".authNavigation").textContent.includes("My Account") &&
        q(".authNavigation").textContent.includes("Logout"),
      "auth: signed-in header",
    );
    equal(w.Selcore.getCart(), [], "auth: guest cart not silently merged");
    equal(
      w.Selcore.getFavorites(),
      [],
      "auth: guest favorites not silently merged",
    );
    check(
      q("#accountEmail").textContent === registration.email,
      "auth: account email from validated user",
    );
    check(
      q("#accountCreated").textContent.includes("Registered"),
      "auth: registration date",
    );
    equal(
      w.__authFixture.lastProfileFilter.value,
      w.SelcoreAuth.snapshot().user.id,
      "auth: profile query filters current owner",
    );
    input(
      "#profileName",
      '<img src=x onerror="window.__profileInjected=true">',
    );
    submit("#profileForm");
    await wait(() => !q("#profileForm").hasAttribute("aria-busy"));
    check(
      q("#accountWelcome").textContent.includes("<img"),
      "auth: profile name rendered as text",
    );
    check(!w.__profileInjected, "auth: profile text cannot execute");
    const other = "22222222-2222-4222-8222-222222222222";
    const denied = await w.SelcoreSupabase.from("profiles")
      .select("id")
      .eq("id", other)
      .single();
    check(
      Boolean(denied.error),
      "auth mock: different profile denied (not production RLS proof)",
    );
    w.Selcore.toggleCart(3);
    w.Selcore.toggleFavorite(4);
    equal(
      w.Selcore.getCart().map((x) => x.id),
      [3],
      "auth: account cart works",
    );
    equal(
      w.Selcore.getFavorites().map((x) => x.id),
      [4],
      "auth: account favorites work",
    );
    check(
      q("#accountCart .accountProduct") !== null &&
        q("#accountFavorites .accountProduct") !== null,
      "auth: dashboard renders saved products",
    );
    const owner = w.SelcoreAuth.snapshot().user.id;
    equal(
      JSON.parse(localStorage.getItem("selcore:user:" + owner + ":cart")),
      [{ id: 3, quantity: 1 }],
      "auth: account storage contains references only",
    );
    await load("user.html?view=account");
    await wait(() => !q("#accountDashboard").hidden);
    check(
      Boolean(w.SelcoreAuth.snapshot().user),
      "auth: session restored after refresh",
    );
    equal(
      w.Selcore.getCart().map((x) => x.id),
      [3],
      "auth: account cart restored",
    );
    input("#newPassword", "NewSafe123");
    input("#newPasswordConfirm", "NewSafe123");
    submit("#changePasswordForm");
    await wait(() => !q("#changePasswordForm").hasAttribute("aria-busy"));
    check(
      q("#changePasswordForm").textContent.includes("updated"),
      "auth: change password",
    );
    await w.SelcoreAuth.logout();
    equal(
      w.Selcore.getCart().map((x) => x.id),
      [1],
      "auth: logout restores guest cart",
    );
    equal(
      w.Selcore.getFavorites().map((x) => x.id),
      [2],
      "auth: logout restores guest favorites",
    );
    check(q("#accountDashboard").hidden, "auth: logout hides dashboard");
    await w.SelcoreAuth.login("second@example.invalid", registration.password);
    equal(
      w.Selcore.getCart(),
      [],
      "auth: second account cannot see first account cart",
    );
    equal(
      w.Selcore.getFavorites(),
      [],
      "auth: second account cannot see first account favorites",
    );
    await w.SelcoreAuth.logout();
    await load("user.html?view=signin");
    click("#showForgot");
    input("#actionEmail", registration.email);
    submit("#emailActionForm");
    await wait(() => !q("#emailActionForm").hasAttribute("aria-busy"));
    equal(w.__authFixture.calls.recovery, 1, "auth: password recovery request");
    check(
      q("#emailActionForm").textContent.includes("If an account"),
      "auth: recovery avoids account enumeration",
    );
    await load("user.html?code=expired");
    check(
      q("#authStateStatus").textContent.includes("invalid or expired"),
      "auth: expired link handled",
    );
    check(
      !w.location.search.includes("code"),
      "auth: callback code scrubbed from URL",
    );
    await load("user.html?code=verification");
    check(
      Boolean(w.SelcoreAuth.snapshot().user),
      "auth mock: verification callback",
    );
    check(
      !w.SelcoreAuth.snapshot().recovery,
      "auth: verification cannot grant recovery flow",
    );
    await w.SelcoreAuth.logout();
    await load("user.html?code=recovery");
    check(
      !q("#recoveryPanel").hidden,
      "auth mock: recovery callback shows password form",
    );
    await load("user.html");
    check(
      !q("#recoveryPanel").hidden && w.SelcoreAuth.snapshot().recovery,
      "auth: recovery form survives refresh with a verified session",
    );
    input("#recoveryPassword", "NewSafe123");
    input("#recoveryConfirm", "NewSafe123");
    submit("#recoveryPasswordForm");
    await wait(() => !q("#recoveryPasswordForm").hasAttribute("aria-busy"));
    check(
      !w.SelcoreAuth.snapshot().recovery,
      "auth: recovery completes after password update",
    );
    await w.SelcoreAuth.logout();
    await load("user.html?error=access_denied&error_description=private");
    check(
      q("#authStateStatus").textContent.includes("invalid or expired"),
      "auth: callback error safe",
    );
    check(
      !w.location.search.includes("private"),
      "auth: callback error details scrubbed",
    );
    await load("user.html?view=signin#access_token=untrusted");
    check(
      !w.SelcoreAuth.snapshot().user,
      "auth: arbitrary fragment cannot sign in",
    );
    equal(w.location.hash, "", "auth: unsupported fragment scrubbed");
    await load("user.html?token_hash=untrusted&type=recovery");
    check(
      q("#authStateStatus").textContent.includes("invalid or expired"),
      "auth: unsupported token callback fails closed",
    );
    equal(w.location.search, "", "auth: unsupported token parameters scrubbed");
    await load("user.html?view=signin");
    click(".googleSignIn");
    await wait(() => !q(".googleSignIn").disabled);
    check(
      q("#authStateStatus").textContent.includes("not configured"),
      "auth: disabled Google provider reported",
    );
    await fetch("/__mode__?value=google");
    await load("user.html?view=signin");
    await w.SelcoreAuth.google();
    equal(
      w.__authFixture.calls.google,
      1,
      "auth mock: enabled Google initiates SDK flow",
    );
    await load("user.html?code=google");
    check(
      Boolean(w.SelcoreAuth.snapshot().user),
      "auth mock: OAuth callback restores session",
    );
    await w.SelcoreAuth.logout();
    await fetch("/__mode__?value=normal");
    await load("user.html?view=signin");
    await w.SelcoreAuth.login(registration.email, registration.password);
    w.__authFixture.profileMissing = true;
    w.__authFixture.dropProfile();
    const created = await w.SelcoreAuth.getProfile();
    equal(
      w.__authFixture.calls.profileInsert,
      1,
      "auth mock: missing profile inserts once",
    );
    equal(
      created.id,
      w.SelcoreAuth.snapshot().user.id,
      "auth mock: existing user without profile initialized",
    );
    w.__authFixture.profileDenied = true;
    await reject(
      () => w.SelcoreAuth.getProfile(),
      "auth: unavailable profile fails safely",
    );
    await w.SelcoreAuth.logout();
    frame.width = "390";
    await load("user.html?view=signin");
    await w.SelcoreAuth.login(registration.email, registration.password);
    await wait(() => !q("#accountDashboard").hidden);
    check(
      d.documentElement.scrollWidth <= 410,
      "auth: mobile dashboard fits viewport",
    );
    check(
      q(".authNavigation").textContent.includes("Logout"),
      "auth: mobile navigation reflects session",
    );
    w.__authFixture.userError = true;
    w.dispatchEvent(new w.PageTransitionEvent("pageshow", { persisted: true }));
    check(
      q("#accountDashboard").hidden,
      "auth: browser history restore hides cached account immediately",
    );
    await wait(() => w.SelcoreAuth.snapshot().status === "error");
    equal(
      w.Selcore.getCart(),
      [],
      "auth: unverified session cannot expose cached cart",
    );
    check(
      q(".authNavigation").textContent.includes("Retry"),
      "auth: session validation failure offers retry",
    );
    w.__authFixture.userError = false;
    await w.SelcoreAuth.refresh();
    check(
      Boolean(w.SelcoreAuth.snapshot().user),
      "auth: validation retry restores session",
    );
    check(
      !q("#authStateStatus").textContent.includes("could not be verified"),
      "auth: successful validation retry clears obsolete error notice",
    );
    await w.SelcoreAuth.logout();
    frame.width = "1400";
    check(
      !localStorage.getItem("cart").includes("password"),
      "auth: cart has no credentials",
    );
    for (const key of Object.keys(localStorage))
      check(
        !String(localStorage.getItem(key)).includes("SafeTest123"),
        "auth: password never persisted " + key,
      );
    clean("phase4 auth");
    reset();
    localStorage.removeItem("selcore-test-session");
  });
  equal(
    requests.filter((request) => request.method !== "GET").length,
    0,
    "forms: no submitted network requests",
  );
  const report = {
    passed: results.filter((result) => result.passed).length,
    failed: results.filter((result) => !result.passed),
    total: results.length,
    authentication:
      "Auth and profile flows use isolated local fixtures; real Auth requests are blocked. This does not verify email delivery, Google consent, or production profile RLS.",
    externalAssets:
      "Supabase API responses and Storage bytes refreshed live before launch, replayed through an isolated proxy. Other remote assets/AOS offline; motion uses controlled frames.",
  };
  document.getElementById("results").textContent = JSON.stringify(report);
  document.body.dataset.result = report.failed.length ? "failed" : "passed";
  frame.remove();
}

const requests = [];
let fixtureMode = "normal";
const server = http.createServer((request, response) => {
  requests.push({ method: request.method, path: request.url });
  const url = new URL(request.url, "http://127.0.0.1");
  if (url.pathname === "/__requests__") {
    response.setHeader("Content-Type", "application/json");
    return response.end(JSON.stringify(requests));
  }
  if (url.pathname === "/__authsettings__") {
    response.setHeader("Content-Type", "application/json");
    return response.end(
      JSON.stringify({
        external: { email: true, google: fixtureMode === "google" },
        disable_signup: false,
        mailer_autoconfirm: false,
      }),
    );
  }
  if (url.pathname === "/__phase0_tests__") {
    response.setHeader("Content-Type", "text/html; charset=utf-8");
    const clientSource = browserTests
      .toString()
      .replace(/<\/script/gi, "<\\/script");
    return response.end(
      '<!doctype html><html><head><title>Phase 0 regressions</title></head><body><pre id="results">RUNNING</pre><script>(' +
        clientSource +
        ')().catch(error=>{document.getElementById("results").textContent=JSON.stringify({failed:[{name:error.message}],total:0});document.body.dataset.result="failed";});</script></body></html>',
    );
  }
  if (url.pathname === "/__mode__") {
    fixtureMode = url.searchParams.get("value") || "normal";
    return response.end("OK");
  }
  if (url.pathname.startsWith("/__supabase__/")) {
    response.setHeader("Content-Type", "application/json");
    const table = url.pathname.split("/").pop();
    if (fixtureMode === "error") {
      response.statusCode = 503;
      return response.end(
        JSON.stringify({ code: "TEST_OFFLINE", message: "Unavailable" }),
      );
    }
    let data = live.responses[table];
    if (table === "products") {
      if (fixtureMode === "empty") data = [];
      if (fixtureMode === "inactive")
        data = data.filter((product) => product.id !== 1);
      if (fixtureMode === "missing-images")
        data = data.map((product) => ({ ...product, product_images: [] }));
      if (fixtureMode === "malicious")
        data = data.map((product) =>
          product.id === 1
            ? {
                ...product,
                name: '<img src=x onerror="window.__injected=true">',
              }
            : product,
        );
    }
    return response.end(JSON.stringify(data));
  }
  if (url.pathname.startsWith("/__image__/")) {
    response.setHeader("Content-Type", "image/png");
    return response.end(
      live.images.get(url.pathname.replace("/__image__", "")),
    );
  }
  const target = path.resolve(root, "." + decodeURIComponent(url.pathname));
  if (
    !target.startsWith(root + path.sep) ||
    !fs.existsSync(target) ||
    !fs.statSync(target).isFile()
  ) {
    response.statusCode = 404;
    return response.end("Not found");
  }
  const mime = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".png": "image/png",
  };
  response.setHeader(
    "Content-Type",
    mime[path.extname(target)] || "application/octet-stream",
  );
  if (target.endsWith(".html")) {
    let html = fs.readFileSync(target, "utf8");
    const instrumentation =
      '<script>(()=>{const nativeFetch=window.fetch.bind(window);window.fetch=(input,init)=>{let address=typeof input==="string"?input:input.url;if(address.startsWith("https://ffznkypurnocabqyxpps.supabase.co/rest/v1/")){window.__catalogueRequestCount=(window.__catalogueRequestCount||0)+1;address="/__supabase__"+new URL(address).pathname;}return nativeFetch(address,init);};})();window.__phase0Errors=[];window.addEventListener("error",event=>{if(event.error)window.__phase0Errors.push(event.message);});window.addEventListener("unhandledrejection",event=>window.__phase0Errors.push(String(event.reason)));(()=>{const nativeRAF=window.requestAnimationFrame.bind(window);window.requestAnimationFrame=callback=>{window.__phase0AnimationStep=callback;return nativeRAF(callback);};})();</script>';
    html = html.replace("<head>", "<head>" + instrumentation);
    html = html.replace(
      "window.fetch=(input,init)=>{",
      "window.fetch=(input,init)=>{",
    );
    html = html.replace(
      'address="/__supabase__"+new URL(address).pathname;}',
      'address="/__supabase__"+new URL(address).pathname;}else if(address.startsWith("https://ffznkypurnocabqyxpps.supabase.co/auth/v1/")){if(!address.endsWith("/settings"))throw new Error("Real Auth requests forbidden by test harness");address="/__authsettings__";}',
    );
    // Keep the suite offline and independent of the CDN's availability.
    html = html.replace(/<script src="https?:[^"]+"><\/script>/g, "");
    return response.end(html);
  }
  if (target.endsWith("supabase-client.js")) {
    return response.end(
      fs.readFileSync(target, "utf8") +
        "\n" +
        fs.readFileSync(path.join(root, "tests/auth-fixtures.js"), "utf8") +
        '\nconst originalStorage=window.SelcoreSupabase.storage.from.bind(window.SelcoreSupabase.storage);window.SelcoreSupabase.storage.from=bucket=>{const api=originalStorage(bucket);const originalUrl=api.getPublicUrl.bind(api);api.getPublicUrl=object=>{const r=originalUrl(object);r.data.publicUrl="/__image__"+new URL(r.data.publicUrl).pathname;return r;};return api;};',
    );
  }
  response.end(fs.readFileSync(target));
});
let live;
require("./live-catalogue.cjs")(root)
  .then((result) => {
    live = result;
    server.listen(0, "127.0.0.1", () => {
      const profile = fs.mkdtempSync(path.join(os.tmpdir(), "selcore-phase0-"));
      const address =
        "http://127.0.0.1:" + server.address().port + "/__phase0_tests__";
      const child = spawn(
        browserExecutable,
        [
          "--headless=new",
          "--disable-gpu",
          "--no-first-run",
          "--no-default-browser-check",
          "--disable-background-networking",
          "--disable-component-update",
          "--disable-sync",
          "--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1",
          "--user-data-dir=" + profile,
          "--window-size=1400,1000",
          "--virtual-time-budget=120000",
          "--dump-dom",
          address,
        ],
        { windowsHide: true },
      );
      let stdout = "",
        stderr = "";
      child.stdout.on("data", (chunk) => {
        stdout += chunk;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk;
      });
      const timer = setTimeout(() => {
        child.kill();
      }, 90000);
      child.on("error", (error) => {
        clearTimeout(timer);
        console.error(error);
        server.close();
        process.exitCode = 1;
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        server.close();
        const match = stdout.match(/<pre id="results">([\s\S]*?)<\/pre>/);
        if (!match || match[1] === "RUNNING") {
          console.error("Browser suite did not finish. Exit:", code);
          console.error(
            "Diagnostics:",
            JSON.stringify({
              stdoutLength: stdout.length,
              requests: requests.length,
              profile,
            }),
          );
          console.error(stderr.slice(-3000));
          process.exitCode = 1;
          return;
        }
        const report = JSON.parse(
          match[1]
            .replace(/&quot;/g, '"')
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">"),
        );
        report.browser = path.basename(browserExecutable);
        console.log(JSON.stringify(report, null, 2));
        fs.mkdirSync(path.join(root, "docs"), { recursive: true });
        fs.writeFileSync(
          path.join(root, "docs/phase4-browser-results.json"),
          JSON.stringify(report, null, 2),
        );
        if (report.failed.length || code !== 0) process.exitCode = 1;
      });
    });
  })
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
