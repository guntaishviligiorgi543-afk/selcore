"use strict";
(() => {
  const store = window.Selcore;
  const { create, image, effectivePrice } = store;
  const page = document.querySelector(".productPage");
  if (!page) return;
  const product = store.getProduct(new URLSearchParams(window.location.search).get("id"));
  const slider = document.querySelector(".sameTechSlider");
  if (!product) {
    const message = create("h1", "", "Product not found");
    message.style.color = "#fff";
    page.replaceChildren(message);
    const relatedMessage = create("p", "", "No similar products found.");
    relatedMessage.style.color = "#fff";
    slider?.replaceChildren(relatedMessage);
    return;
  }
  const picture = document.querySelector(".productImage");
  if (picture) { picture.src = product.image; picture.alt = product.name; }
  const name = document.querySelector(".productName");
  if (name) name.textContent = product.name;
  const price = document.querySelector(".productPrice");
  if (price) price.textContent = `${effectivePrice(product)} ₾`;
  const features = document.querySelector(".productFeatures");
  if (features) {
    features.replaceChildren();
    for (const [key, value] of Object.entries(product.features)) {
      const row = create("p");
      row.append(create("strong", "", `${key}:`), document.createTextNode(` ${value}`));
      features.append(row);
    }
  }
  for (const button of document.querySelectorAll(".addTocartBtn, .addTofavBtn")) button.dataset.id = product.id;
  if (!slider) return;
  slider.replaceChildren();
  const related = store.getProducts().filter((item) => item.techType === product.techType && item.id !== product.id);
  if (!related.length) slider.append(create("p", "", "No similar products found."));
  for (const item of related) {
    const card = create("div", "sameTech");
    card.dataset.id = item.id;
    card.append(image(item), create("h3", "", item.name), create("p", "", `${effectivePrice(item)} ₾`));
    slider.append(card);
  }
  let dragging = false;
  let moved = false;
  let startX = 0;
  let startScrollLeft = 0;
  slider.addEventListener("click", (event) => {
    if (moved) { event.preventDefault(); moved = false; return; }
    const card = event.target.closest(".sameTech");
    if (card && store.getProduct(card.dataset.id)) window.location.href = `product.html?id=${card.dataset.id}`;
  });
  document.querySelector(".sameTechLeft")?.addEventListener("click", () => slider.scrollBy({ left: -300, behavior: "smooth" }));
  document.querySelector(".sameTechRight")?.addEventListener("click", () => slider.scrollBy({ left: 300, behavior: "smooth" }));
  slider.addEventListener("mousedown", (event) => {
    dragging = true; moved = false; startX = event.pageX; startScrollLeft = slider.scrollLeft;
    slider.classList.add("dragging");
  });
  function endDrag() { dragging = false; slider.classList.remove("dragging"); }
  slider.addEventListener("mouseleave", endDrag);
  window.addEventListener("mouseup", endDrag);
  slider.addEventListener("mousemove", (event) => {
    if (!dragging) return;
    const distance = event.pageX - startX;
    if (Math.abs(distance) > 4) moved = true;
    event.preventDefault();
    slider.scrollLeft = startScrollLeft - distance * 1.5;
  });
})();
