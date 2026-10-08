"use strict";
(() => {
  const store = window.Selcore;
  const { create, image, effectivePrice } = store;
  const sidebar = document.querySelector(".cartSidebar");
  const link = document.querySelector(".cartLink");
  const sidebarItems = sidebar?.querySelector(".cartItems");
  const pageItems = document.querySelector(".cartContainer");
  const checkoutItems = document.querySelector(".checkoutProducts");
  function button(className, text, action, id) {
    const node = create("button", className, text);
    node.type = "button";
    node.dataset.cartAction = action;
    node.dataset.id = id;
    return node;
  }
  function quantityControls(item, className) {
    const node = create("div", className);
    node.append(button("minusBtn", "−", "minus", item.id), create("span", "", item.quantity), button("plusBtn", "+", "plus", item.id));
    return node;
  }
  function updateButtons() {
    document.querySelectorAll(".cartBtn, .addTocartBtn, .addToCartFromFav").forEach((node) => {
      const active = store.isInCart(node.dataset.id);
      node.classList.toggle("active", active);
      node.setAttribute("aria-pressed", String(active));
      if (node.classList.contains("cartBtn")) node.closest(".allProductCard")?.classList.toggle("active", active);
      else node.textContent = active ? "Added to cart" : "Add to cart";
    });
  }
  function render() {
    const items = store.getCart();
    const total = items.reduce((sum, item) => sum + effectivePrice(item) * item.quantity, 0);
    const quantity = items.reduce((sum, item) => sum + item.quantity, 0);
    for (const [container, mode] of [[sidebarItems, "sidebar"], [pageItems, "page"], [checkoutItems, "checkout"]]) {
      if (!container) continue;
      container.replaceChildren();
      if (!items.length) {
        if (mode === "page") {
          const empty = create("div", "emptyCart");
          empty.append(create("h2", "", "Your cart is empty"));
          container.append(empty);
        } else container.append(create("p", "emptyCart", "Your cart is empty"));
      }
      for (const item of items) {
        const price = effectivePrice(item);
        const card = create("div", mode === "sidebar" ? "cartProduct" : mode === "page" ? "cartCard" : "checkoutProduct");
        card.dataset.id = item.id;
        const picture = create("div", mode === "sidebar" ? "cartImgPrice" : mode === "page" ? "cartCardImage" : "checkoutProductImage");
        picture.append(image(item));
        const content = create("div", mode === "sidebar" ? "cartInfo" : mode === "page" ? "cartCardContent" : "checkoutProductContent");
        content.append(create(mode === "sidebar" ? "h3" : "h2", mode === "sidebar" ? "prodNam" : "", item.name));
        if (mode === "sidebar") picture.append(create("p", "", `${price}₾`));
        else content.append(create("p", mode === "page" ? "cartPrice" : "", mode === "page" ? `${price}₾` : `Price: ${price}₾`));
        if (mode === "checkout") content.append(create("p", "", `Quantity: ${item.quantity}`), create("p", "", `Total: ${price * item.quantity}₾`));
        else content.append(quantityControls(item, mode === "page" ? "cartQuantity" : "quantityBox"));
        content.append(button(mode === "checkout" ? "removeCheckout" : "removeCart", "Remove", "remove", item.id));
        card.append(picture, content);
        container.append(card);
      }
    }
    const count = sidebar?.querySelector(".cartQuantity");
    const sideTotal = sidebar?.querySelector(".totalPrice");
    if (count) count.textContent = `Quantity of items: ${quantity}`;
    if (sideTotal) sideTotal.textContent = `Total price: ${total}₾`;
    const pageTotal = document.querySelector(".cartTotal");
    if (pageTotal) pageTotal.replaceChildren(create("span", "", `Total Price: ${total}₾`));
    const checkoutTotal = document.querySelector(".sumPrice");
    if (checkoutTotal) checkoutTotal.replaceChildren(create("h2", "", `Total Price: ${total}₾`));
    const buy = document.querySelector(".buyContainer");
    if (buy) {
      const node = items.length ? create("a", "checkoutBtn", "Checkout") : create("button", "shopNow", "Shop Now");
      if (items.length) node.href = "checkout.html";
      else {
        node.type = "button";
        node.addEventListener("click", () => { window.location.href = "allproducts.html"; });
      }
      buy.replaceChildren(node);
    }
    updateButtons();
  }
  link?.addEventListener("click", (event) => {
    if (!sidebar) return;
    event.preventDefault();
    sidebar.classList.add("active");
  });
  sidebar?.querySelector(".closeCart")?.addEventListener("click", () => sidebar.classList.remove("active"));
  document.addEventListener("click", (event) => {
    // Rendering may detach the clicked node; capture containment beforehand.
    const insideSidebar = sidebar?.contains(event.target);
    const insideLink = link?.contains(event.target);
    const toggle = event.target.closest(".cartBtn, .addTocartBtn, .addToCartFromFav");
    const action = event.target.closest("[data-cart-action]");
    if (toggle) store.toggleCart(toggle.dataset.id);
    else if (action) {
      if (action.dataset.cartAction === "remove") store.removeCart(action.dataset.id);
      else if (action.dataset.cartAction === "plus") store.changeQuantity(action.dataset.id, 1);
      else if (action.dataset.cartAction === "minus") store.changeQuantity(action.dataset.id, -1);
    } else {
      const card = event.target.closest(".cartProduct[data-id]");
      if (card && sidebar?.contains(card)) window.location.href = `product.html?id=${card.dataset.id}`;
    }
    if (sidebar && !insideSidebar && !insideLink) sidebar.classList.remove("active");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") sidebar?.classList.remove("active");
  });
  document.addEventListener("selcore:cart-change", render);
  document.addEventListener("selcore:products-rendered", updateButtons);
  document.addEventListener("selcore:favorites-change", updateButtons);
  render();
})();
