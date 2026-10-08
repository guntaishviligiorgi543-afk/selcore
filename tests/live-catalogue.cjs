"use strict";
// Read-only live integration preflight. Uses only the frontend publishable key.
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
module.exports = async function liveCatalogue(root) {
  const {
    createClient,
  } = require("../migration/phase2/runtime/node_modules/@supabase/supabase-js");
  const responses = {},
    images = new Map();
  const context = {
    window: {
      supabase: {
        createClient: (url, key, options) => {
          assert.equal(url, "https://ffznkypurnocabqyxpps.supabase.co");
          assert(key.startsWith("sb_publishable_"));
          return createClient(url, key, {
            ...options,
            global: {
              fetch: async (input, init) => {
                const response = await fetch(input, {
                  ...init,
                  redirect: "error",
                  signal: AbortSignal.timeout(30000),
                });
                assert.equal(response.status, 200);
                const address = new URL(
                  typeof input === "string" ? input : input.url,
                );
                responses[address.pathname.split("/").pop()] = await response
                  .clone()
                  .json();
                return response;
              },
            },
          });
        },
      },
    },
    console,
    setTimeout,
    clearTimeout,
    AbortController,
  };
  vm.createContext(context);
  for (const file of ["supabase-client.js", "catalogue-service.js"])
    vm.runInContext(fs.readFileSync(path.join(root, file), "utf8"), context);
  const products = await context.window.SelcoreCatalogue.getProducts();
  assert.equal(products.length, 24);
  assert.equal(
    (await context.window.SelcoreCatalogue.getCategories()).length,
    4,
  );
  assert.equal((await context.window.SelcoreCatalogue.getBrands()).length, 17);
  assert.equal(Object.keys(responses).length, 3, "Single request per table");
  const original = JSON.parse(
    fs.readFileSync(
      path.join(root, "migration/phase2/source-catalogue.json"),
      "utf8",
    ),
  ).products;
  for (const product of products) {
    const expected = original.find((p) => p.id === product.id);
    assert.equal(product.price, expected.price);
    assert.equal(product.salePrice, expected.salePrice);
    assert.deepEqual(
      JSON.parse(JSON.stringify(product.features)),
      expected.features,
    );
    assert.equal(product.stockQuantity, 0);
    assert.equal(product.isPurchasable, false);
  }
  await Promise.all(
    products.map(async (product) => {
      const address = new URL(product.image);
      assert.equal(address.hostname, "ffznkypurnocabqyxpps.supabase.co");
      const response = await fetch(address, {
        signal: AbortSignal.timeout(30000),
      });
      assert.equal(response.status, 200);
      const bytes = Buffer.from(await response.arrayBuffer());
      const source = original.find((p) => p.id === product.id);
      assert.equal(
        crypto.createHash("sha256").update(bytes).digest("hex"),
        crypto
          .createHash("sha256")
          .update(fs.readFileSync(path.resolve(root, source.image)))
          .digest("hex"),
      );
      images.set(address.pathname, bytes);
    }),
  );
  console.log(
    "Live preflight passed: 24 products, 4 categories, 17 brands, 3 shared read queries, 24 original public image downloads.",
  );
  return { responses, images };
};
