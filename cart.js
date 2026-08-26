"use strict";
// ================= CART =================
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

let cart = JSON.parse(localStorage.getItem("cart")) || [];

const cartItems = document.querySelector(".cartItems");
const cartQuantity = document.querySelector(".cartQuantity");
const totalPrice = document.querySelector(".totalPrice");

// ================= ADD TO CART =================

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".cartBtn");

  if (!btn) return;

  const productId = Number(btn.dataset.id);

  const product = products.find((item) => item.id === productId);

  addToCart(product);
});

// ================= SAVE =================

function saveCart() {
  localStorage.setItem("cart", JSON.stringify(cart));
}

// ================= RENDER =================

function renderCart() {
  cartItems.innerHTML = "";

  let total = 0;
  let quantity = 0;

  cart.forEach((product) => {
    const price = product.sale ? product.salePrice : product.price;

    total += price * product.quantity;
    quantity += product.quantity;

    cartItems.innerHTML += `
 <div class="cartProduct" data-id="${product.id}">
    <div class="cartImgPrice">
  <img src="${product.image}" alt="${product.name}" />
  <p>${price}₾</p>
</div>

         <div class="cartInfo">

          <h3  class="prodNam">${product.name}</h3>

 
          <div class="quantityBox">

            <button class="minusBtn" data-id="${product.id}">-</button>

            <span>${product.quantity}</span>

            <button class="plusBtn" data-id="${product.id}">+</button>

          </div>

          <button
            class="removeCart"
            data-id="${product.id}">
            Remove
          </button>
 
        </div>

      </div>
    `;
  });

  cartQuantity.textContent = `Quantity of items: ${quantity}`;
  totalPrice.textContent = `Total price: ${total}₾`;
}

// ================= CART EVENTS =================

cartItems.addEventListener("click", (e) => {
  // Remove
  const removeBtn = e.target.closest(".removeCart");

  if (removeBtn) {
    const id = Number(removeBtn.dataset.id);

    cart = cart.filter((item) => item.id !== id);

    saveCart();
    renderCart();

    return;
  }

  // Plus
  const plusBtn = e.target.closest(".plusBtn");

  if (plusBtn) {
    const id = Number(plusBtn.dataset.id);

    const product = cart.find((item) => item.id === id);

    if (product) {
      product.quantity++;
    }

    saveCart();
    renderCart();

    return;
  }

  // Minus
  const minusBtn = e.target.closest(".minusBtn");

  if (minusBtn) {
    const id = Number(minusBtn.dataset.id);

    const product = cart.find((item) => item.id === id);

    if (product) {
      if (product.quantity > 1) {
        product.quantity--;
      } else {
        cart = cart.filter((item) => item.id !== id);
      }
    }

    saveCart();
    renderCart();
  }
});

// ================= FIRST LOAD =================

renderCart();

// ================= ADD PRODUCT =================

function addToCart(product) {
  const existingIndex = cart.findIndex((item) => item.id === product.id);

  const btn = document.querySelector(`.cartBtn[data-id="${product.id}"]`);
  const card = btn?.closest(".allProductCard");

  if (existingIndex !== -1) {
    cart.splice(existingIndex, 1);

    if (btn) btn.classList.remove("active");
    if (card) card.classList.remove("active");
  } else {
    cart.push({
      ...product,
      quantity: 1,
    });

    if (btn) btn.classList.add("active");
    if (card) card.classList.add("active");
  }
  saveCart();
  renderCart();

  if (typeof renderFavorites === "function") {
    renderFavorites();
  }
}
// Product card click

allProductContainer.addEventListener("click", (e) => {
  if (e.target.closest(".cartBtn") || e.target.closest(".favoriteBtn")) {
    return;
  }

  const card = e.target.closest(".allProductCard");

  if (!card) return;

  const productId = card.dataset.id;

  window.location.href = `product.html?id=${productId}`;
});
// ================= FAVORITE PRODUCT CLICK =================
cartItems.addEventListener("click", (e) => {
  if (
    e.target.closest(".plusBtn") ||
    e.target.closest(".minusBtn") ||
    e.target.closest(".removeCart")
  ) {
    return;
  }

  const cartProduct = e.target.closest(".cartProduct");

  if (!cartProduct) return;

  const productId = cartProduct.dataset.id;

  window.location.href = `product.html?id=${productId}`;
});
