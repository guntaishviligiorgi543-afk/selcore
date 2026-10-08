"use strict";
(() => {
  const store = window.Selcore;
  const { create, image, effectivePrice } = store;
  const burger = document.querySelector("#burger");
  const menu = document.querySelector(".burgerMenu");
  if (burger && menu) burger.addEventListener("change", () => menu.classList.toggle("active", burger.checked));

  function renderFeatured(container, items, className, withImageWrapper) {
    if (!container) return;
    container.replaceChildren();
    for (const product of items) {
      const card = create("div", className);
      card.dataset.id = product.id;
      card.addEventListener("click", () => { window.location.href = `product.html?id=${product.id}`; });
      const picture = image(product);
      if (withImageWrapper) {
        const wrapper = create("div", "image");
        wrapper.append(picture);
        card.append(wrapper);
      } else card.append(picture);
      const info = create("div", withImageWrapper ? "price-name" : "");
      info.append(create("p", "", product.name), create("p", "", `${effectivePrice(product)} ₾`));
      card.append(info);
      container.append(card);
    }
  }
  const products = store.getProducts();
  renderFeatured(document.querySelector("#bestSellerContainer"), products.filter((product) => product.bestSeller).sort((a, b) => b.soldCount - a.soldCount).slice(0, 4), "bestSellCards", false);
  // Preserve the original selection: the first two flagged arrivals are skipped.
  renderFeatured(document.querySelector(".newArrivals"), products.filter((product) => product.newArrival).slice(2), "bestSellerCard", true);

  const headphones = document.querySelector(".headpones");
  const left = document.querySelector(".left");
  const right = document.querySelector(".right");
  if (headphones && left && right) {
    let mouseX = 0, mouseY = 0, currentX = 0, currentY = 0;
    headphones.addEventListener("mousemove", (event) => {
      const rect = headphones.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      mouseX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      mouseY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    });
    headphones.addEventListener("mouseleave", () => { mouseX = 0; mouseY = 0; });
    function animate() {
      currentX += (mouseX - currentX) * 0.02;
      currentY += (mouseY - currentY) * 0.02;
      left.style.transform = `translate(${currentX * 80}px, ${currentY * 80}px) rotateX(${-currentY * 50}deg) rotateY(${currentX * 50}deg)`;
      right.style.transform = `translate(${-currentX * 80}px, ${-currentY * 80}px) rotateX(${currentY * 50}deg) rotateY(${-currentX * 50}deg)`;
      requestAnimationFrame(animate);
    }
    animate();
  }
  document.querySelectorAll(".brandBtn").forEach((button) => {
    button.addEventListener("click", () => {
      const brand = button.querySelector("img")?.dataset.brand;
      if (brand) window.location.href = `allproducts.html?brand=${encodeURIComponent(brand)}`;
    });
  });
  const header = document.querySelector("header");
  const hero = document.querySelector(".hero");
  if (header && hero) window.addEventListener("scroll", () => header.classList.toggle("purple", window.scrollY > hero.offsetHeight));

  // These forms have no backend. Prevent native navigation and say so explicitly.
  document.querySelectorAll("form[data-unavailable]").forEach((form) => {
    store.showMessage(form, form.dataset.unavailable);
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      store.showMessage(form, form.dataset.unavailable);
    });
  });
  const buy = document.querySelector(".buyBtn");
  if (buy) {
    const message = "Purchases are not available yet. No payment will be taken and no order will be placed.";
    store.showMessage(buy.parentElement, message);
    buy.addEventListener("click", () => store.showMessage(buy.parentElement, message));
  }

  const input = document.querySelector(".writeMsg input");
  const send = document.querySelector(".writeMsg button");
  const display = document.querySelector(".chatDisplay");
  const launcher = document.querySelector(".contact-svg-p");
  const chat = document.querySelector(".chatContainer");
  if (input && send && display && launcher && chat) {
    const stored = store.readArray("chatMessages");
    let messages = stored.filter((message) => typeof message === "string");
    if (messages.length !== stored.length) console.warn("Ignored invalid chatMessages entries.");
    function renderMessages() {
      display.replaceChildren(...messages.map((message) => create("div", "sent", message)));
      display.scrollTop = display.scrollHeight;
    }
    launcher.querySelector("svg")?.addEventListener("click", () => {
      chat.classList.add("active");
      launcher.classList.add("hide");
    });
    chat.querySelector(".closeChat")?.addEventListener("click", () => {
      chat.classList.remove("active");
      launcher.classList.remove("hide");
    });
    chat.querySelector(".deleteChat")?.addEventListener("click", () => {
      messages = [];
      try { localStorage.removeItem("chatMessages"); }
      catch (error) {
        console.warn("Unable to remove chatMessages from browser storage.", error);
        store.showMessage(chat, "Chat history could not be cleared from browser storage.");
      }
      renderMessages();
    });
    function sendMessage() {
      const message = input.value.trim();
      if (!message) return;
      messages.push(message);
      store.writeStorage("chatMessages", messages);
      input.value = "";
      renderMessages();
    }
    send.addEventListener("click", sendMessage);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); sendMessage(); }
    });
    store.showMessage(chat, "This chat saves messages in your browser only. Support is not connected.");
    renderMessages();
  }
})();
