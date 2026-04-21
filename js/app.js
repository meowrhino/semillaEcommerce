/**
 * app.js — utilidades comunes + carrito en localStorage.
 *
 * Estrategia JAMstack:
 *   - El catálogo (nombres, precios, imágenes) se lee de /data/productos.json,
 *     que es un archivo estático del repo. Esto permite abrir la web con
 *     cualquier servidor (o incluso `file://`) y ver la tienda sin Functions.
 *   - El stock vivo se consulta a /api/stock, que sí requiere Functions.
 *     Si no está disponible (preview local estática), caemos a stockInicial
 *     declarado en el propio JSON — suficiente para diseñar/maquetar.
 *
 * Cada item del carrito: { id, nombre, precio, cantidad, talla?, img? }
 */

const CART_KEY = "semilla.cart";

function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || "[]");
  } catch {
    return [];
  }
}

function setCart(items) {
  localStorage.setItem(CART_KEY, JSON.stringify(items));
  renderCartBadge();
}

function cartCount() {
  return getCart().reduce((n, it) => n + Number(it.cantidad || 0), 0);
}

function cartTotal() {
  return getCart().reduce(
    (sum, it) => sum + Number(it.precio || 0) * Number(it.cantidad || 0),
    0
  );
}

function addToCart(item) {
  const cart = getCart();
  const existing = cart.find(
    (it) => it.id === item.id && (it.talla || "") === (item.talla || "")
  );
  if (existing) {
    existing.cantidad = Number(existing.cantidad) + Number(item.cantidad || 1);
  } else {
    cart.push({ ...item, cantidad: Number(item.cantidad || 1) });
  }
  setCart(cart);
}

function updateQty(id, talla, delta) {
  const cart = getCart()
    .map((it) => {
      if (it.id !== id || (it.talla || "") !== (talla || "")) return it;
      return { ...it, cantidad: Math.max(0, Number(it.cantidad) + delta) };
    })
    .filter((it) => it.cantidad > 0);
  setCart(cart);
}

function removeItem(id, talla) {
  const cart = getCart().filter(
    (it) => !(it.id === id && (it.talla || "") === (talla || ""))
  );
  setCart(cart);
}

function clearCart() {
  setCart([]);
}

function renderCartBadge() {
  const nodes = document.querySelectorAll("[data-cart-count]");
  const n = cartCount();
  nodes.forEach((el) => {
    el.textContent = n;
    el.style.display = n > 0 ? "" : "none";
  });
}

/** stockInicial puede venir como número o como {talla: cantidad}. Normaliza. */
function normalizeStockInicial(si) {
  if (typeof si === "number" && Number.isFinite(si)) return { _: Math.max(0, si) };
  if (si && typeof si === "object") {
    const out = {};
    for (const [k, v] of Object.entries(si)) out[k] = Math.max(0, Number(v) || 0);
    return out;
  }
  return {};
}

/** Carga el catálogo estático (data/productos.json) e intenta enriquecerlo
 *  con stock vivo de /api/stock. Si la API no está disponible, cae a stockInicial. */
async function fetchProductos() {
  const catRes = await fetch("data/productos.json", { cache: "no-cache" });
  if (!catRes.ok) throw new Error(`catálogo no disponible (HTTP ${catRes.status})`);
  const catalogo = (await catRes.json()).filter((p) => p.activo !== false);

  let stockVivo = null;
  try {
    const stRes = await fetch(`${window.APP_CONFIG.API_BASE}/stock`);
    if (stRes.ok) stockVivo = await stRes.json();
  } catch {
    // Sin Functions: seguimos con stockInicial del JSON.
  }

  return catalogo.map((p) => ({
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion ?? "",
    precio: p.precio,
    img: p.img ?? "",
    stockByTalla:
      (stockVivo && stockVivo[p.id]) || normalizeStockInicial(p.stockInicial),
  }));
}

/** Devuelve un producto o null si no existe o está inactivo. */
async function fetchProducto(id) {
  const productos = await fetchProductos();
  return productos.find((p) => String(p.id) === String(id)) || null;
}

async function fetchEnvios() {
  const res = await fetch("data/envios.json", { cache: "no-cache" });
  if (!res.ok) throw new Error(`envios no disponibles (HTTP ${res.status})`);
  return res.json();
}

function formatPrice(eur) {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: window.APP_CONFIG?.MONEDA || "EUR",
  }).format(Number(eur) || 0);
}

window.SemillaCart = {
  getCart,
  setCart,
  cartCount,
  cartTotal,
  addToCart,
  updateQty,
  removeItem,
  clearCart,
  renderCartBadge,
  fetchProductos,
  fetchProducto,
  fetchEnvios,
  formatPrice,
};

document.addEventListener("DOMContentLoaded", renderCartBadge);
