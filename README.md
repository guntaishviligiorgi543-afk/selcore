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

For the restricted local preview, run `node tools/serve.cjs`. Authentication requires HTTPS or localhost; opening HTML files directly is unsupported.

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

GitHub Pages hosts the static frontend. Hosted Supabase Auth handles signup, password login, email confirmation and password recovery; Supabase Database, Storage and RLS serve catalogue and profile data. Cart and favorites remain in browser storage; checkout remains a demo without payment processing.

The target email architecture uses Supabase Email OTP with eight digits and Resend SMTP delivery. The current frontend still uses confirmation/recovery links; native OTP entry and additional device/sensitive-action policies remain follow-up work. See [the Supabase-only architecture and cleanup audit](docs/supabase-only-architecture.md). No Railway, Docker, private Auth server or custom OTP gateway is required.
