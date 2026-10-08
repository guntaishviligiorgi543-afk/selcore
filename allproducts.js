"use strict";

// Catalogue controls share one state and one pipeline.
(() => {
  const store = window.Selcore;
  const { create, image, effectivePrice } = store;
  const container = document.querySelector(".allProductContainer");
  if (!container) return;
  const search = document.querySelector(".searchInput");
  const best = document.querySelector(".bestSellerFilter");
  const arrivals = document.querySelector(".newArrivalFilter");
  const sort = document.querySelector("#sortPrice");
  const categories = document.querySelectorAll("aside nav ul li");
  const params = new URLSearchParams(window.location.search);
  const supported = new Set([
    "mobile",
    "laptop",
    "tablet",
    "computer",
    "accessory",
    "sale",
    "new",
    "best",
    "headphone",
  ]);
  const state = {
    category: supported.has(params.get("category"))
      ? params.get("category")
      : "",
    brand: params.get("brand") || "",
  };
  const categoryNames = {
    accsessories: "accessory",
    "best sellers": "best",
    "cell phones": "mobile",
    "computers & tablets": "computer",
    sales: "sale",
  };
  const matchesCategory = (product) => {
    switch (state.category) {
      case "mobile":
        return product.techType === "mobile";
      case "laptop":
        return product.techType === "laptop";
      case "tablet":
        return product.techType === "tablet";
      case "computer":
        return product.techType === "laptop" || product.techType === "tablet";
      case "accessory":
        return product.techType === "accessory";
      case "sale":
        return product.sale;
      case "new":
        return product.newArrival;
      case "best":
        return product.bestSeller;
      case "headphone":
        return product.accessory?.trim() === "headphone";
      default:
        return true;
    }
  };
  const ICONS = [
    '<svg xmlns="http://www.w3.org/2000/svg" width="1.5em" height="1.5em" viewBox="0 0 24 24">\r\n\t<path d="M0 0h24v24H0z" fill="none" />\r\n\t<path fill="currentColor" d="M4.24 12.25a4.2 4.2 0 0 1-1.24-3A4.25 4.25 0 0 1 7.25 5c1.58 0 2.96.86 3.69 2.14h1.12A4.24 4.24 0 0 1 15.75 5A4.25 4.25 0 0 1 20 9.25c0 1.17-.5 2.25-1.24 3L11.5 19.5zm15.22.71C20.41 12 21 10.7 21 9.25A5.25 5.25 0 0 0 15.75 4c-1.75 0-3.3.85-4.25 2.17A5.22 5.22 0 0 0 7.25 4A5.25 5.25 0 0 0 2 9.25c0 1.45.59 2.75 1.54 3.71l7.96 7.96z" />\r\n</svg>',
    '<svg xmlns="http://www.w3.org/2000/svg" width="1.5em" height="1.5em" viewBox="0 0 24 24">\r\n\t<path d="M0 0h24v24H0z" fill="none" />\r\n\t<path fill="currentColor" d="M16 18a2 2 0 0 1 2 2a2 2 0 0 1-2 2a2 2 0 0 1-2-2a2 2 0 0 1 2-2m0 1a1 1 0 0 0-1 1a1 1 0 0 0 1 1a1 1 0 0 0 1-1a1 1 0 0 0-1-1m-9-1a2 2 0 0 1 2 2a2 2 0 0 1-2 2a2 2 0 0 1-2-2a2 2 0 0 1 2-2m0 1a1 1 0 0 0-1 1a1 1 0 0 0 1 1a1 1 0 0 0 1-1a1 1 0 0 0-1-1M18 6H4.27l2.55 6H15c.33 0 .62-.16.8-.4l3-4c.13-.17.2-.38.2-.6a1 1 0 0 0-1-1m-3 7H6.87l-.77 1.56L6 15a1 1 0 0 0 1 1h11v1H7a2 2 0 0 1-2-2a2 2 0 0 1 .25-.97l.72-1.47L2.34 4H1V3h2l.85 2H18a2 2 0 0 1 2 2c0 .5-.17.92-.45 1.26l-2.91 3.89c-.36.51-.96.85-1.64.85" />\r\n</svg>',
  ];
  function productButton(className, label, id, icon) {
    const button = create("button", className);
    button.type = "button";
    button.dataset.id = id;
    button.setAttribute("aria-label", label);
    // Only fixed, existing SVG markup is inserted here; no product/storage fields.
    button.innerHTML = icon;
    return button;
  }
  function render(items) {
    container.replaceChildren();
    if (!items.length) {
      const empty = create(
        "p",
        "emptyProducts",
        "No products match your filters.",
      );
      empty.style.color = "#fff";
      container.append(empty);
    }
    for (const product of items) {
      const card = create("div", "allProductCard");
      card.dataset.id = product.id;
      const icons = create("div", "cardIcons");
      icons.append(
        productButton("favoriteBtn", "Toggle favorite", product.id, ICONS[0]),
        productButton("cartBtn", "Toggle cart", product.id, ICONS[1]),
      );
      const picture = create("div", "image");
      picture.append(image(product));
      const info = create("div", "cardInfo");
      info.append(
        create("p", "", product.name),
        create("p", "", `${effectivePrice(product)} ₾`),
      );
      card.append(icons, picture, info);
      container.append(card);
    }
    categories.forEach((item) =>
      item.classList.toggle(
        "active",
        categoryNames[item.textContent.trim().toLowerCase()] === state.category,
      ),
    );
    document.dispatchEvent(new CustomEvent("selcore:products-rendered"));
  }
  function update() {
    if (store.catalogueState(container)) return;
    const query = (search?.value || "").toLowerCase();
    const items = store
      .getProducts()
      .filter(
        (product) =>
          matchesCategory(product) &&
          (!(document.querySelector("#brandFilter")?.value || state.brand) ||
            product.features.brand ===
              (document.querySelector("#brandFilter")?.value || state.brand)) &&
          (!document.querySelector("#categoryFilter")?.value ||
            product.techType ===
              document.querySelector("#categoryFilter").value) &&
          (!document.querySelector("#brandFilter")?.value ||
            product.features.brand ===
              document.querySelector("#brandFilter").value) &&
          (!document.querySelector("#minPrice")?.value ||
            effectivePrice(product) >=
              Number(document.querySelector("#minPrice").value)) &&
          (!document.querySelector("#maxPrice")?.value ||
            effectivePrice(product) <=
              Number(document.querySelector("#maxPrice").value)) &&
          product.name.toLowerCase().includes(query) &&
          (!best?.checked || product.bestSeller) &&
          (!arrivals?.checked || product.newArrival),
      );
    if (sort?.value === "lowToHigh")
      items.sort((a, b) => effectivePrice(a) - effectivePrice(b));
    if (sort?.value === "highToLow")
      items.sort((a, b) => effectivePrice(b) - effectivePrice(a));
    render(items);
  }
  search?.addEventListener("input", update);
  for (const id of ["minPrice", "maxPrice"])
    document.getElementById(id)?.addEventListener("input", update);
  document
    .getElementById("brandFilter")
    ?.addEventListener("change", (event) => {
      state.brand = event.target.value;
      const url = new URL(window.location.href);
      if (state.brand) url.searchParams.set("brand", state.brand);
      else url.searchParams.delete("brand");
      window.history.replaceState(null, "", url);
      update();
    });
  document
    .getElementById("categoryFilter")
    ?.addEventListener("change", (event) => {
      state.category = event.target.value;
      const url = new URL(window.location.href);
      if (state.category) url.searchParams.set("category", state.category);
      else url.searchParams.delete("category");
      window.history.replaceState(null, "", url);
      update();
    });
  best?.addEventListener("change", update);
  arrivals?.addEventListener("change", update);
  sort?.addEventListener("change", update);
  categories.forEach((item) =>
    item.addEventListener("click", () => {
      state.category =
        categoryNames[item.textContent.trim().toLowerCase()] || "";
      const categorySelect = document.getElementById("categoryFilter");
      if (categorySelect) categorySelect.value = "";
      const url = new URL(window.location.href);
      if (state.category) url.searchParams.set("category", state.category);
      else url.searchParams.delete("category");
      window.history.replaceState(null, "", url);
      update();
    }),
  );
  container.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    const card = event.target.closest(".allProductCard");
    if (card && store.getProduct(card.dataset.id))
      window.location.href = `product.html?id=${card.dataset.id}`;
  });
  let optionsReady = false;
  document.addEventListener("selcore:catalogue-change", async () => {
    if (store.getCatalogueStatus() === "ready" && !optionsReady) {
      optionsReady = true;
      const categories = await window.SelcoreCatalogue.getCategories();
      const brands = await window.SelcoreCatalogue.getBrands();
      for (const [id, items] of [
        ["categoryFilter", categories],
        ["brandFilter", brands],
      ]) {
        const select = document.getElementById(id);
        if (!select) continue;
        for (const item of items) {
          const option = create("option", "", item.name);
          option.value = item.name;
          select.append(option);
        }
      }
      const brand = document.getElementById("brandFilter");
      if (brand) brand.value = state.brand;
    }
    update();
  });
  update();
})();
