# Selcore

Selcore is a responsive, front-end electronics storefront. It showcases phones, laptops, tablets, audio gear, and accessories through a browsable product catalogue and a client-side shopping flow.

## Features

- Product catalogue with category, brand, best-seller, new-arrival, and price filters
- Product-detail pages linked by product ID
- Search and sorting controls
- Shopping cart with quantity controls and persisted `localStorage` state
- Favorites panel backed by browser storage
- Sale pricing, featured products, and brand navigation
- Sign-up/sign-in interface with password visibility controls
- Contact and checkout pages
- Responsive navigation, animated page elements, and locally hosted product imagery

## Run locally

This project has no build step or package dependencies. Serve the project folder with any static web server, then open the local address in a browser.

For example, with Python installed:

```bash
python -m http.server 8000
```

Then visit [http://localhost:8000](http://localhost:8000).

You can also open `index.html` directly, although running a local server is recommended for a browser-like development environment.

## Project structure

```text
index.html            Home page
allproducts.html      Catalogue and filters
product.html          Product details
cart.html             Cart view
checkout.html         Checkout view
user.html             Account/sign-in interface
contact.html          Contact page
*.js                  Client-side interactions and product data
*.css                 Page styling
images/               Product and site image assets
```

## Tech

HTML, CSS, and vanilla JavaScript. The home page also loads [AOS](https://michalsnik.github.io/aos/) for scroll animations.

## Notes

The catalogue and cart are demo functionality: product data is stored in front-end JavaScript and cart/favorite selections are kept in the browser's `localStorage`. No backend, authentication service, or payment processor is connected.
