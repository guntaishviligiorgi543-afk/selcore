"use strict";
window.SelcoreCatalogue = (() => {
  let products = [],
    categories = [],
    brands = [],
    pending = null,
    status = "loading";
  const client = window.SelcoreSupabase;
  const number = (value, label) => {
    if (value === null || value === undefined || value === "")
      throw new Error(`Missing catalogue ${label}`);
    const result = Number(value);
    if (!Number.isFinite(result)) throw new Error(`Invalid catalogue ${label}`);
    return result;
  };
  function model(row) {
    const id = number(row.id, "ID");
    if (
      !Number.isSafeInteger(id) ||
      id < 1 ||
      !row.category ||
      !row.brand ||
      !row.name ||
      row.currency !== "GEL"
    )
      throw new Error("Invalid catalogue record");
    const price = number(row.price, "price");
    const salePrice =
      row.sale_price === null
        ? undefined
        : number(row.sale_price, "sale price");
    if (
      price < 0 ||
      (salePrice !== undefined && (salePrice < 0 || salePrice > price))
    )
      throw new Error("Invalid catalogue price");
    const primary = row.product_images
      ?.filter((image) => image.is_primary)
      .sort((a, b) => a.display_order - b.display_order)[0];
    const storagePath = primary?.storage_path;
    const image =
      storagePath &&
      !storagePath.startsWith("/") &&
      !storagePath.split("/").includes("..")
        ? client.storage.from("product-images").getPublicUrl(storagePath).data
            .publicUrl
        : null;
    if (
      !row.specifications ||
      typeof row.specifications !== "object" ||
      Array.isArray(row.specifications)
    )
      throw new Error("Invalid catalogue specifications");
    const features = { ...row.specifications, brand: row.brand.name };
    return Object.freeze({
      id,
      name: row.name,
      description: row.description,
      techType: row.category.name,
      categoryId: number(row.category_id, "category"),
      brandId: number(row.brand_id, "brand"),
      price,
      salePrice,
      sale: salePrice !== undefined,
      bestSeller: row.is_bestseller === true,
      newArrival: row.is_new_arrival === true,
      features: Object.freeze(features),
      image,
      imageAlt: primary?.alt_text || row.name,
      stockQuantity: number(row.stock_quantity, "stock"),
      isPurchasable: row.is_purchasable === true,
      accessory: /headphones|earbuds/i.test(features.type || "")
        ? "headphone"
        : undefined,
    });
  }
  async function load() {
    if (status === "ready") return products;
    if (pending) return pending;
    status = "loading";
    pending = (async () => {
      try {
        if (!client) throw new Error("Catalogue client unavailable");
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        let responses;
        try {
          responses = await Promise.all([
            client
              .from("products")
              .select(
                "id,name,description,price,sale_price,currency,specifications,stock_quantity,is_purchasable,is_bestseller,is_new_arrival,category_id,brand_id,category:categories(id,name,slug),brand:brands(id,name,slug),product_images(storage_path,alt_text,display_order,is_primary)",
              )
              .eq("is_active", true)
              .order("id")
              .abortSignal(controller.signal),
            client
              .from("categories")
              .select("id,name,slug")
              .order("id")
              .abortSignal(controller.signal),
            client
              .from("brands")
              .select("id,name,slug")
              .order("id")
              .abortSignal(controller.signal),
          ]);
        } finally {
          clearTimeout(timer);
        }
        for (const response of responses)
          if (response.error)
            throw new Error(
              `Catalogue request failed (${response.error.code || "network"})`,
            );
        products = responses[0].data.map(model);
        if (new Set(products.map((p) => p.id)).size !== products.length)
          throw new Error("Duplicate catalogue IDs");
        categories = responses[1].data;
        brands = responses[2].data;
        status = "ready";
        return products;
      } catch (error) {
        products = [];
        categories = [];
        brands = [];
        status = "error";
        console.warn("Unable to load Supabase catalogue:", error.message);
        throw error;
      } finally {
        pending = null;
      }
    })();
    return pending;
  }
  return Object.freeze({
    load,
    getStatus: () => status,
    snapshot: () => products.slice(),
    getProducts: async () => (await load()).slice(),
    getProductById: async (id) =>
      (await load()).find((p) => p.id === Number(id)),
    getCategories: async () => {
      await load();
      return categories.map((c) => ({ ...c }));
    },
    getBrands: async () => {
      await load();
      return brands.map((b) => ({ ...b }));
    },
    getProductsByCategory: async (id) =>
      (await load()).filter((p) => p.categoryId === Number(id)),
    getFeaturedProducts: async () =>
      (await load()).filter((p) => p.bestSeller || p.newArrival),
  });
})();
