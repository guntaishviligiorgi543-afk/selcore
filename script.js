"use strict";

const container = document.querySelector(".headpones");
const left = document.querySelector(".left");
const right = document.querySelector(".right");
const bestSellerContainer = document.querySelector("#bestSellerContainer");
const newArrivalsContainer = document.querySelector(".newArrivals");
const burger = document.querySelector(".burger");
const burgerMenu = document.querySelector(".burgerMenu");
const brandBtns = document.querySelectorAll(".brandBtn");
const cartLink = document.querySelector(".cartLink");
const cartSidebar = document.querySelector(".cartSidebar");
const closeCart = document.querySelector(".closeCart");

//burger

burger.addEventListener("change", function () {
  burgerMenu.classList.toggle("active");
});

//on click to product page

function goToProduct(productId) {
  window.location.href = `product.html?id=${productId}`;
}

//headpons 3d animation

let mouseX = 0;
let mouseY = 0;

let currentX = 0;
let currentY = 0;

container.addEventListener("mousemove", (e) => {
  const rect = container.getBoundingClientRect();

  mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
  mouseY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
});

container.addEventListener("mouseleave", () => {
  mouseX = 0;
  mouseY = 0;
});

function animate() {
  currentX += (mouseX - currentX) * 0.02;
  currentY += (mouseY - currentY) * 0.02;

  left.style.transform = `
  translate(${currentX * 80}px, ${currentY * 80}px)
  rotateX(${-currentY * 50}deg)
  rotateY(${currentX * 50}deg)
`;

  right.style.transform = `
  translate(${-currentX * 80}px, ${-currentY * 80}px)
  rotateX(${currentY * 50}deg)
  rotateY(${-currentX * 50}deg)
`;

  requestAnimationFrame(animate);
}

animate();

const bestSellers = products
  .filter((product) => product.bestSeller === true)
  .sort((a, b) => b.soldCount - a.soldCount)
  .slice(0, 4);

bestSellers.forEach((product) => {
  bestSellerContainer.innerHTML += `
    <div 
      class="bestSellCards"
      onclick="goToProduct(${product.id})"
    >
      <img src="${product.image}" />

      <div>
        <p>${product.name}</p>
        <p>${product.sale ? product.salePrice : product.price} ₾</p>
      </div>
    </div>
  `;
});

const newArrivals = products.filter((product) => product.newArrival).slice(2);

newArrivalsContainer.innerHTML = newArrivals
  .map(
    (product) => `
  <div class="bestSellerCard"
    onclick="goToProduct(${product.id})">
    <div class="image">
      <img src="${product.image}" alt="${product.name}">
    </div>

    <div class="price-name">
      <p>${product.name}</p>
      <p>${product.sale ? product.salePrice : product.price} ₾</p>
    </div>
  </div>
`,
  )
  .join("");

// from brand img to filter

brandBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    const brand = btn.querySelector("img").dataset.brand;

    window.location.href = `allproducts.html?brand=${encodeURIComponent(brand)}`;
  });
});

//cart
if (cartLink && cartSidebar && closeCart) {
  cartLink.addEventListener("click", (e) => {
    e.preventDefault();

    cartSidebar.classList.add("active");
  });

  closeCart.addEventListener("click", () => {
    cartSidebar.classList.remove("active");
  });
}

if (cartLink && cartSidebar && closeCart) {
  cartLink.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation(); // რომ გახსნისას მაშინვე არ დაიხუროს

    cartSidebar.classList.add("active");
  });

  closeCart.addEventListener("click", () => {
    cartSidebar.classList.remove("active");
  });

  cartSidebar.addEventListener("click", (e) => {
    e.stopPropagation(); // cart-ში დაკლიკება არ დახურავს
  });

  document.addEventListener("click", () => {
    cartSidebar.classList.remove("active");
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      cartSidebar.classList.remove("active");
    }
  });
}
//header bg change
const header = document.querySelector("header");
const hero = document.querySelector(".hero");

window.addEventListener("scroll", () => {
  if (window.scrollY > hero.offsetHeight) {
    header.classList.add("purple");
  } else {
    header.classList.remove("purple");
  }
});

("use strict");

// ================= CHAT =================

const messageInput = document.querySelector(".writeMsg input");
const sendButton = document.querySelector(".writeMsg button");
const chatDisplay = document.querySelector(".chatDisplay");
const deleteChat = document.querySelector(".deleteChat");

// ================= OPEN / CLOSE CHAT =================

const contactSvg = document.querySelector(".contact-svg-p svg");
const chatContainer = document.querySelector(".chatContainer");
const closeChat = document.querySelector(".closeChat");

// Open chat
contactSvg.addEventListener("click", function () {
  chatContainer.classList.add("active");
  document.querySelector(".contact-svg-p").classList.add("hide");
});

// Close chat
closeChat.addEventListener("click", function () {
  chatContainer.classList.remove("active");
  document.querySelector(".contact-svg-p").classList.remove("hide");
});

//delete chat
deleteChat.addEventListener("click", function () {
  messages = [];

  localStorage.removeItem("chatMessages");

  renderMessages();
});

// ================= MESSAGES =================

let messages = JSON.parse(localStorage.getItem("chatMessages")) || [];

// Render messages
function renderMessages() {
  chatDisplay.innerHTML = "";

  messages.forEach((message) => {
    const messageDiv = document.createElement("div");

    messageDiv.classList.add("sent");
    messageDiv.textContent = message;

    chatDisplay.appendChild(messageDiv);
  });

  chatDisplay.scrollTop = chatDisplay.scrollHeight;
}

// ================= SEND MESSAGE =================

function sendMessage() {
  const message = messageInput.value.trim();

  if (message === "") return;

  messages.push(message);

  localStorage.setItem("chatMessages", JSON.stringify(messages));

  messageInput.value = "";

  renderMessages();
}

// Send button
sendButton.addEventListener("click", sendMessage);

// Enter key
messageInput.addEventListener("keydown", function (e) {
  if (e.key === "Enter") {
    sendMessage();
  }
});

// Initial render
renderMessages();
