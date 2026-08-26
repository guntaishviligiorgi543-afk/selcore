"use strict";

/* =====================================================
   PRODUCT PAGE
===================================================== */

const params = new URLSearchParams(window.location.search);
const productId = Number(params.get("id"));
const addTofavBtn = document.querySelector(".addTofavBtn");
const product = products.find((item) => item.id === productId);

const productImage = document.querySelector(".productImage");
const productName = document.querySelector(".productName");
const productPrice = document.querySelector(".productPrice");
const productFeatures = document.querySelector(".productFeatures");
const addTocartBtn = document.querySelector(".addTocartBtn");

/* =====================================================
   CART DATA
===================================================== */

let cart = JSON.parse(localStorage.getItem("cart")) || [];

/* =====================================================
   PRODUCT PAGE RENDER
===================================================== */

if (!product) {
  const productPage = document.querySelector(".productPage");

  if (productPage) {
    productPage.innerHTML = `
      <h1>Product not found</h1>
    `;
  }
} else {
  /* IMAGE */

  if (productImage) {
    productImage.src = product.image;
    productImage.alt = product.name;
  }

  /* NAME */

  if (productName) {
    productName.textContent = product.name;
  }

  /* PRICE */

  if (productPrice) {
    const price = product.sale ? product.salePrice : product.price;

    productPrice.textContent = `${price} ₾`;
  }

  /* FEATURES */

  if (productFeatures) {
    productFeatures.innerHTML = "";

    Object.entries(product.features).forEach(([key, value]) => {
      const feature = document.createElement("p");

      feature.innerHTML = `
        <strong>${key}:</strong> ${value}
      `;

      productFeatures.appendChild(feature);
    });
  }

  /* =====================================================
     PRODUCT PAGE ADD TO CART BUTTON
  ===================================================== */

  if (addTocartBtn) {
    updateProductPageButton();

    addTocartBtn.addEventListener("click", () => {
      const existingProduct = cart.find((item) => item.id === product.id);

      if (existingProduct) {
        /* SECOND CLICK → REMOVE */

        cart = cart.filter((item) => item.id !== product.id);
      } else {
        /* FIRST CLICK → ADD */

        cart.push({
          ...product,
          quantity: 1,
        });
      }

      saveCart();

      renderCart();

      updateProductPageButton();

      updateAllCartButtons();
    });
  }
}

/* =====================================================
   PRODUCT PAGE BUTTON STATE
===================================================== */

function updateProductPageButton() {
  if (!addTocartBtn || !product) return;

  const isInCart = cart.some((item) => item.id === product.id);

  if (isInCart) {
    addTocartBtn.textContent = "Added to cart";
    addTocartBtn.classList.add("active");
  } else {
    addTocartBtn.textContent = "Add to cart";
    addTocartBtn.classList.remove("active");
  }
}

/* =====================================================
   SAVE CART
===================================================== */

function saveCart() {
  localStorage.setItem("cart", JSON.stringify(cart));
}

/* =====================================================
   CART SIDEBAR
===================================================== */

const cartLink = document.querySelector(".cartLink");
const cartSidebar = document.querySelector(".cartSidebar");
const closeCart = document.querySelector(".closeCart");

const cartItems = document.querySelector(".cartItems");
const cartQuantity = document.querySelector(".cartQuantity");
const totalPrice = document.querySelector(".totalPrice");

/* =====================================================
   OPEN CART
===================================================== */

if (cartLink && cartSidebar) {
  cartLink.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    cartSidebar.classList.add("active");

    renderCart();
  });
}

/* =====================================================
   CLOSE CART
===================================================== */

if (closeCart && cartSidebar) {
  closeCart.addEventListener("click", (e) => {
    e.stopPropagation();

    cartSidebar.classList.remove("active");
  });
}

/* =====================================================
   DON'T CLOSE WHEN CLICKING INSIDE CART
===================================================== */

if (cartSidebar) {
  cartSidebar.addEventListener("click", (e) => {
    e.stopPropagation();
  });
}

/* =====================================================
   ESCAPE → CLOSE CART
===================================================== */

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && cartSidebar) {
    cartSidebar.classList.remove("active");
  }
});

/* =====================================================
   CART BUTTONS FROM ALL PRODUCTS PAGE
===================================================== */

document.addEventListener("click", (e) => {
  const btn = e.target.closest(".cartBtn");

  if (!btn) return;

  const id = Number(btn.dataset.id);

  const product = products.find((item) => item.id === id);

  if (!product) return;

  addToCart(product);
});

/* =====================================================
   ADD / REMOVE PRODUCT
===================================================== */

function addToCart(product) {
  const existingIndex = cart.findIndex((item) => item.id === product.id);

  /* ===================================================
     ALREADY IN CART → REMOVE
  =================================================== */

  if (existingIndex !== -1) {
    cart.splice(existingIndex, 1);
  } else {
    /* ===================================================
     NOT IN CART → ADD
  =================================================== */
    cart.push({
      ...product,
      quantity: 1,
    });
  }

  saveCart();

  renderCart();

  updateAllCartButtons();

  updateProductPageButton();
}

/* =====================================================
   UPDATE ALL "ADD TO CART" BUTTONS
===================================================== */

function updateAllCartButtons() {
  const buttons = document.querySelectorAll(".cartBtn");

  buttons.forEach((btn) => {
    const id = Number(btn.dataset.id);

    const isInCart = cart.some((item) => item.id === id);

    if (isInCart) {
      btn.textContent = "Added to cart";
      btn.classList.add("active");
    } else {
      btn.textContent = "Add to cart";
      btn.classList.remove("active");
    }
  });
}

/* =====================================================
   RENDER CART SIDEBAR
===================================================== */

function renderCart() {
  if (!cartItems) return;

  cartItems.innerHTML = "";

  let total = 0;
  let quantity = 0;

  /* ===================================================
     EMPTY CART
  =================================================== */

  if (cart.length === 0) {
    cartItems.innerHTML = `
      <p class="emptyCart">
        Your cart is empty
      </p>
    `;

    if (cartQuantity) {
      cartQuantity.textContent = "Quantity of items: 0";
    }

    if (totalPrice) {
      totalPrice.textContent = "Total price: 0₾";
    }

    updateAllCartButtons();
    updateProductPageButton();

    return;
  }

  /* ===================================================
     CART PRODUCTS
  =================================================== */

  cart.forEach((product) => {
    const price = product.sale ? product.salePrice : product.price;

    const productTotal = price * (product.quantity || 1);

    total += productTotal;

    quantity += product.quantity || 1;

    cartItems.innerHTML += `

      <div class="cartProduct">

        <div class="cartImage">
          <img
            src="${product.image}"
            alt="${product.name}"
          />
        </div>

        <div class="cartInfo">

          <h3 class="prodNam">
            ${product.name}
          </h3>

          <p class="cartPrice">
            ${price}₾
          </p>


          <div class="quantityBox">

            <button
              class="minusBtn"
              data-id="${product.id}">
              -
            </button>

            <span>
              ${product.quantity || 1}
            </span>

            <button
              class="plusBtn"
              data-id="${product.id}">
              +
            </button>

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

  /* ===================================================
     TOTAL
  =================================================== */

  if (cartQuantity) {
    cartQuantity.textContent = `Quantity of items: ${quantity}`;
  }

  if (totalPrice) {
    totalPrice.textContent = `Total price: ${total}₾`;
  }

  /* UPDATE BUTTONS */

  updateAllCartButtons();
  updateProductPageButton();
}

/* =====================================================
   CART EVENTS
===================================================== */

if (cartItems) {
  cartItems.addEventListener("click", (e) => {
    /* =================================================
       REMOVE
    ================================================= */

    const removeBtn = e.target.closest(".removeCart");

    if (removeBtn) {
      const id = Number(removeBtn.dataset.id);

      /* REMOVE FROM CART */

      cart = cart.filter((item) => item.id !== id);

      saveCart();

      renderCart();

      /*
        IMPORTANT:
        ეს ცვლის შესაბამის პროდუქტზე
        "Added to cart" → "Add to cart"
      */

      updateAllCartButtons();

      updateProductPageButton();

      return;
    }

    /* =================================================
       PLUS
    ================================================= */

    const plusBtn = e.target.closest(".plusBtn");

    if (plusBtn) {
      const id = Number(plusBtn.dataset.id);

      const product = cart.find((item) => item.id === id);

      if (product) {
        product.quantity = (product.quantity || 1) + 1;
      }

      saveCart();

      renderCart();

      return;
    }

    /* =================================================
       MINUS
    ================================================= */

    const minusBtn = e.target.closest(".minusBtn");

    if (minusBtn) {
      const id = Number(minusBtn.dataset.id);

      const product = cart.find((item) => item.id === id);

      if (product) {
        if ((product.quantity || 1) > 1) {
          product.quantity--;
        } else {
          /*
            თუ quantity = 1,
            მთლიანად წაიშლება
          */

          cart = cart.filter((item) => item.id !== id);
        }
      }

      saveCart();

      renderCart();

      updateAllCartButtons();

      updateProductPageButton();

      return;
    }
  });
}

/* =====================================================
   FIRST LOAD
===================================================== */

renderCart();

updateAllCartButtons();

updateProductPageButton();

/* =====================================================
   PRODUCT PAGE FAVORITE
===================================================== */

if (addTofavBtn && product) {
  updateProductFavoriteButton();

  addTofavBtn.addEventListener("click", () => {
    let favorites = JSON.parse(localStorage.getItem("favorites")) || [];

    const existingFavorite = favorites.some((item) => item.id === product.id);

    if (existingFavorite) {
      // თუ უკვე ფავორიტებშია → წაშლა
      favorites = favorites.filter((item) => item.id !== product.id);

      addTofavBtn.textContent = "Add to fav";
      addTofavBtn.classList.remove("active");
    } else {
      // დამატება
      favorites.push(product);

      addTofavBtn.textContent = "Added to fav";
      addTofavBtn.classList.add("active");
    }

    localStorage.setItem("favorites", JSON.stringify(favorites));

    // განაახლებს ყველა გვერდზე არსებულ favorites container-ს
    if (typeof renderFavorites === "function") {
      renderFavorites();
    }

    if (typeof updateFavoriteButton === "function") {
      updateFavoriteButton();
    }
  });
}

/* =====================================================
   PRODUCT FAVORITE BUTTON STATE
===================================================== */

function updateProductFavoriteButton() {
  if (!addTofavBtn || !product) return;

  const favorites = JSON.parse(localStorage.getItem("favorites")) || [];

  const isFavorite = favorites.some((item) => item.id === product.id);

  if (isFavorite) {
    addTofavBtn.textContent = "Added to fav";
    addTofavBtn.classList.add("active");
  } else {
    addTofavBtn.textContent = "Add to fav";
    addTofavBtn.classList.remove("active");
  }
}
/* =====================================================
   SAME TECH PRODUCTS
===================================================== */

const sameTechSlider = document.querySelector(".sameTechSlider");

function renderSameTechProducts() {
  if (!sameTechSlider || !product) return;

  const currentTechType = product.techType;

  const sameProducts = products.filter(
    (item) => item.techType === currentTechType && item.id !== product.id,
  );

  sameTechSlider.innerHTML = "";

  if (sameProducts.length === 0) {
    sameTechSlider.innerHTML = `
      <p style="color: white; font-size: 20px;">
        No similar products found.
      </p>
    `;
    return;
  }

  sameProducts.forEach((item) => {
    const price = item.sale ? item.salePrice : item.price;

    sameTechSlider.innerHTML += `
      <div class="sameTech" data-id="${item.id}">
        <img src="${item.image}" alt="${item.name}">

        <h3>${item.name}</h3>

        <p>${price} ₾</p>
      </div>
    `;
  });
}

/* =====================================================
   CLICK → PRODUCT PAGE
===================================================== */

if (sameTechSlider) {
  sameTechSlider.addEventListener("click", (e) => {
    const card = e.target.closest(".sameTech");

    if (!card) return;

    const id = card.dataset.id;

    window.location.href = `product.html?id=${id}`;
  });
}

/* =====================================================
   FIRST RENDER
===================================================== */

renderSameTechProducts();

/* =====================================================
   SAME TECH SLIDER ARROWS
===================================================== */

const sameTechLeft = document.querySelector(".sameTechLeft");
const sameTechRight = document.querySelector(".sameTechRight");

if (sameTechSlider) {
  sameTechLeft?.addEventListener("click", () => {
    sameTechSlider.scrollBy({
      left: -300,
      behavior: "smooth",
    });
  });

  sameTechRight?.addEventListener("click", () => {
    sameTechSlider.scrollBy({
      left: 300,
      behavior: "smooth",
    });
  });
}

/* =====================================================
   DRAG TO SCROLL
===================================================== */

let isDragging = false;
let startX;
let startScrollLeft;

sameTechSlider.addEventListener("mousedown", (e) => {
  isDragging = true;

  sameTechSlider.classList.add("dragging");

  startX = e.pageX - sameTechSlider.offsetLeft;
  startScrollLeft = sameTechSlider.scrollLeft;
});

sameTechSlider.addEventListener("mouseleave", () => {
  isDragging = false;
  sameTechSlider.classList.remove("dragging");
});

sameTechSlider.addEventListener("mouseup", () => {
  isDragging = false;
  sameTechSlider.classList.remove("dragging");
});

sameTechSlider.addEventListener("mousemove", (e) => {
  if (!isDragging) return;

  e.preventDefault();

  const x = e.pageX - sameTechSlider.offsetLeft;
  const distance = (x - startX) * 1.5;

  sameTechSlider.scrollLeft = startScrollLeft - distance;
});
