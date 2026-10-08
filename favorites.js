"use strict";
(() => {
  const store = window.Selcore;
  const { create, image } = store;
  const panel = document.querySelector(".favContainer");
  const link = document.querySelector(".favLink");
  const container = panel?.querySelector(".favProductsCont");
  function updateButtons() {
    document
      .querySelectorAll(".favoriteBtn, .addTofavBtn")
      .forEach((button) => {
        const active = store.isFavorite(button.dataset.id);
        button.setAttribute("aria-pressed", String(active));
        if (button.classList.contains("favoriteBtn"))
          button.classList.toggle("favoriteActive", active);
        else {
          button.classList.toggle("active", active);
          button.textContent = active ? "Added to fav" : "Add to fav";
        }
      });
    document.querySelectorAll(".addToCartFromFav").forEach((button) => {
      const active = store.isInCart(button.dataset.id);
      button.textContent = active ? "Added to Cart" : "Add to Cart";
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
    });
  }
  function render() {
    if (store.catalogueState(container)) {
      updateButtons();
      return;
    }
    if (container) {
      container.replaceChildren();
      const items = store.getFavorites();
      if (!items.length) {
        const empty = create("p", "emptyFavorites", "No favorites yet");
        empty.style.color = "#fff";
        container.append(empty);
      }
      for (const product of items) {
        const card = create("div", "favProduct");
        card.dataset.id = product.id;
        const buttons = create("div", "favBtns");
        const add = create("button", "addToCartFromFav", "Add to Cart");
        const remove = create("button", "removeFromFav", "remove");
        for (const button of [add, remove]) {
          button.type = "button";
          button.dataset.id = product.id;
        }
        buttons.append(add, remove);
        card.append(
          image(product),
          create("h3", "favProductNam", product.name),
          buttons,
        );
        container.append(card);
      }
      if (store.hasRemovedSavedItems())
        container.append(
          create(
            "p",
            "unavailableSavedItems",
            "Some saved items are no longer available and have been omitted.",
          ),
        );
    }
    updateButtons();
  }
  link?.addEventListener("click", (event) => {
    if (!panel) return;
    event.preventDefault();
    panel.classList.add("active");
  });
  panel
    ?.querySelector(".closeFav")
    ?.addEventListener("click", () => panel.classList.remove("active"));
  document.addEventListener("click", (event) => {
    const insidePanel = panel?.contains(event.target);
    const insideLink = link?.contains(event.target);
    const toggle = event.target.closest(".favoriteBtn, .addTofavBtn");
    const remove = event.target.closest(".removeFromFav");
    if (toggle) store.toggleFavorite(toggle.dataset.id);
    else if (remove) store.removeFavorite(remove.dataset.id);
    else if (!event.target.closest(".addToCartFromFav")) {
      const card = event.target.closest(".favProduct[data-id]");
      if (card && container?.contains(card))
        window.location.href = `product.html?id=${card.dataset.id}`;
    }
    if (panel && !insidePanel && !insideLink) panel.classList.remove("active");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") panel?.classList.remove("active");
  });
  document.addEventListener("selcore:favorites-change", render);
  document.addEventListener("selcore:cart-change", updateButtons);
  document.addEventListener("selcore:products-rendered", updateButtons);
  document.addEventListener("selcore:catalogue-change", render);
  render();
})();
