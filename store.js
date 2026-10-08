"use strict";

// One state/persistence boundary for every page. Existing storage keys and
// complete-product snapshots are retained for compatibility with saved carts.
window.Selcore = (() => {
  const catalogue = products;
  const productById = new Map(catalogue.map((product) => [product.id, product]));
  const create = (tag, className = "", text) => {
    const element = document.createElement(tag);
    element.className = className;
    if (text !== undefined) element.textContent = String(text);
    return element;
  };
  const image = (product) => {
    const element = create("img");
    element.src = product.image;
    element.alt = product.name;
    return element;
  };
  const effectivePrice = (product) => product.sale ? product.salePrice : product.price;
  const parseId = (value) => {
    if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value))) return null;
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  };
  const getProduct = (id) => productById.get(parseId(id));
  function showMessage(container, message) {
    if (!container) return;
    let status = container.querySelector(".featureStatus");
    if (!status) {
      status = create("p", "featureStatus");
      status.setAttribute("role", "status");
      // Keep form submit buttons last: existing account CSS relies on it.
      const submit = [...container.children].find((child) => child.matches('button[type="submit"]'));
      container.insertBefore(status, submit || null);
      // Status messages must be readable on both light and dark page themes.
      status.style.cssText = "color: #fff; background-color: #191529; padding: 0.5rem; font: 14px/1.4 Arial, sans-serif; text-transform: none;";
    }
    status.textContent = message;
  }
  function readArray(key) {
    let raw;
    try {
      raw = localStorage.getItem(key);
    } catch (error) {
      console.warn(`Unable to read ${key} from browser storage.`, error);
      return [];
    }
    if (raw === null) return [];
    let value;
    try {
      value = JSON.parse(raw);
    } catch (error) {
      console.warn(`Invalid JSON in ${key}; using an empty list.`, error);
      return [];
    }
    if (!Array.isArray(value)) {
      console.warn(`Invalid ${key} data; expected an array.`);
      return [];
    }
    return value;
  }
  function writeStorage(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.warn(`Unable to save ${key} to browser storage.`, error);
      showMessage(document.querySelector("main"), "Your changes could not be saved in this browser. They may be lost when you leave this page.");
      return false;
    }
  }
  function normalize(key, stored) {
    const seen = new Set();
    const result = [];
    let rejected = false;
    for (const item of stored) {
      const product = item && typeof item === "object" ? getProduct(item.id) : undefined;
      const quantity = item?.quantity === undefined ? 1 : item.quantity;
      if (!product || seen.has(product.id) || (key === "cart" && (!Number.isSafeInteger(quantity) || quantity < 1))) {
        rejected = true;
        continue;
      }
      seen.add(product.id);
      // Never render or calculate from LocalStorage-supplied product fields.
      result.push(key === "cart" ? { ...product, quantity } : { ...product });
    }
    if (rejected) console.warn(`Ignored invalid or duplicate items in ${key}.`);
    return result;
  }
  let cart = normalize("cart", readArray("cart"));
  let favorites = normalize("favorites", readArray("favorites"));
  function notify(key) {
    document.dispatchEvent(new CustomEvent(`selcore:${key}-change`));
  }
  function save(key) {
    writeStorage(key, key === "cart" ? cart : favorites);
    notify(key);
  }
  function toggleCart(id) {
    const product = getProduct(id);
    if (!product) {
      console.warn("Cannot toggle cart: product ID was not found.");
      return false;
    }
    const index = cart.findIndex((item) => item.id === product.id);
    if (index === -1) cart.push({ ...product, quantity: 1 });
    else cart.splice(index, 1);
    save("cart");
    return true;
  }
  function removeCart(id) {
    const productId = parseId(id);
    if (productId === null || !cart.some((item) => item.id === productId)) return;
    cart = cart.filter((item) => item.id !== productId);
    save("cart");
  }
  function changeQuantity(id, delta) {
    if (delta !== 1 && delta !== -1) return;
    const item = cart.find((product) => product.id === parseId(id));
    if (!item) return;
    const quantity = item.quantity + delta;
    if (quantity === 0) return removeCart(id);
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      console.warn("Cannot change cart quantity: quantity is outside the safe integer range.");
      return;
    }
    item.quantity = quantity;
    save("cart");
  }
  function toggleFavorite(id) {
    const product = getProduct(id);
    if (!product) {
      console.warn("Cannot toggle favorite: product ID was not found.");
      return false;
    }
    const index = favorites.findIndex((item) => item.id === product.id);
    if (index === -1) favorites.push({ ...product });
    else favorites.splice(index, 1);
    save("favorites");
    return true;
  }
  function removeFavorite(id) {
    const productId = parseId(id);
    if (productId === null || !favorites.some((item) => item.id === productId)) return;
    favorites = favorites.filter((item) => item.id !== productId);
    save("favorites");
  }
  window.addEventListener("storage", (event) => {
    if (event.storageArea && event.storageArea !== localStorage) return;
    if (event.key === "cart" || event.key === null) {
      cart = normalize("cart", readArray("cart"));
      notify("cart");
    }
    if (event.key === "favorites" || event.key === null) {
      favorites = normalize("favorites", readArray("favorites"));
      notify("favorites");
    }
  });
  return Object.freeze({
    create, image, effectivePrice, parseId, getProduct, showMessage, readArray, writeStorage,
    getProducts: () => catalogue.slice(),
    getCart: () => cart.map((item) => ({ ...item })),
    getFavorites: () => favorites.map((item) => ({ ...item })),
    isInCart: (id) => cart.some((item) => item.id === parseId(id)),
    isFavorite: (id) => favorites.some((item) => item.id === parseId(id)),
    toggleCart, removeCart, changeQuantity, toggleFavorite, removeFavorite,
  });
})();
