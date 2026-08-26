"use strict";
//==================favorites nav svg================

const favs = document.querySelector(".favs");
const favLink = document.querySelector(".favLink");
const favContainer = document.querySelector(".favContainer");
const closeFav = document.querySelector(".closeFav");

//open
favLink.addEventListener("click", function (e) {
  e.preventDefault();

  favContainer.classList.add("active");
});
//on X click

closeFav.addEventListener("click", function () {
  favContainer.classList.remove("active");
});

//close if clicked out of container

document.addEventListener("click", function (e) {
  if (
    favContainer.classList.contains("active") &&
    !favContainer.contains(e.target) &&
    !favLink.contains(e.target)
  ) {
    favContainer.classList.remove("active");
  }
});
// ================= FAVORITES =================

let favorites = JSON.parse(localStorage.getItem("favorites")) || [];

const favProductsCont = document.querySelector(".favProductsCont");

// Save favorites
function saveFavorites() {
  localStorage.setItem("favorites", JSON.stringify(favorites));
}

// Render favorites
function renderFavorites() {
  if (!favProductsCont) return;

  favProductsCont.innerHTML = "";

  if (favorites.length === 0) {
    favProductsCont.innerHTML = `
      <p class="emptyFavorites">No favorites yet</p>
    `;

    updateFavoriteButtons();
    return;
  }

  favorites.forEach((product) => {
    favProductsCont.innerHTML += `
      <div class="favProduct" data-id="${product.id}">

        <img src="${product.image}" alt="${product.name}" />

        <h3 class="favProductNam">${product.name}</h3>
              <div class="favBtns">
        <button 
          class="addToCartFromFav" 
          data-id="${product.id}">
          add to cart
        </button>

        <button 
          class="removeFromFav" 
          data-id="${product.id}">
          remove
        </button>

               </div>

 
      </div>
    `;
  });

  updateFavoriteButtons();
  updateFavoriteCartButtons();
}

// ================= FAVORITE BUTTON COLOR =================

function updateFavoriteButtons() {
  document.querySelectorAll(".favoriteBtn").forEach((btn) => {
    const productId = Number(btn.dataset.id);

    const isFavorite = favorites.some((product) => product.id === productId);

    if (isFavorite) {
      btn.classList.add("favoriteActive");
    } else {
      btn.classList.remove("favoriteActive");
    }
  });
}

// ================= ADD / REMOVE FAVORITE =================

function toggleFavorite(productId) {
  const existingIndex = favorites.findIndex(
    (product) => product.id === productId,
  );

  if (existingIndex !== -1) {
    // Remove
    favorites.splice(existingIndex, 1);
  } else {
    // Add
    const product = products.find((product) => product.id === productId);

    if (!product) return;

    favorites.push(product);
  }

  saveFavorites();
  renderFavorites();
}
function updateFavoriteCartButtons() {
  const currentCart = JSON.parse(localStorage.getItem("cart")) || [];

  document.querySelectorAll(".addToCartFromFav").forEach((button) => {
    const productId = Number(button.dataset.id);

    const isInCart = currentCart.some((item) => item.id === productId);

    button.textContent = isInCart ? "Added to Cart" : "Add to Cart";
  });
}

// ================= FAVORITE BUTTON CLICK =================

document.addEventListener("click", function (e) {
  const favoriteBtn = e.target.closest(".favoriteBtn");

  if (!favoriteBtn) return;

  const productId = Number(favoriteBtn.dataset.id);

  toggleFavorite(productId);
});

// ================= REMOVE FROM FAVORITES =================

document.addEventListener("click", function (e) {
  const removeBtn = e.target.closest(".removeFromFav");

  if (!removeBtn) return;

  const productId = Number(removeBtn.dataset.id);

  favorites = favorites.filter((product) => product.id !== productId);

  saveFavorites();
  renderFavorites();
});

// ================= ADD TO CART FROM FAVORITES =================

document.addEventListener("click", function (e) {
  const addCartBtn = e.target.closest(".addToCartFromFav");

  if (!addCartBtn) return;

  const productId = Number(addCartBtn.dataset.id);

  const product = products.find((product) => product.id === productId);

  if (!product) return;

  const isAlreadyInCart = cart.some((item) => item.id === productId);

  addToCart(product);

  if (isAlreadyInCart) {
    addCartBtn.textContent = "Add to Cart";
  } else {
    addCartBtn.textContent = "Added to Cart";
  }
});
// ================= FIRST FAVORITES LOAD =================

renderFavorites();
// ================= FAVORITE PRODUCT CLICK =================

favProductsCont.addEventListener("click", function (e) {
  if (e.target.closest(".addToCartFromFav")) {
    return;
  }

  if (e.target.closest(".removeFromFav")) {
    return;
  }

  const favProduct = e.target.closest(".favProduct");

  if (!favProduct) return;

  const productId = favProduct.dataset.id;

  window.location.href = `product.html?id=${productId}`;
});
