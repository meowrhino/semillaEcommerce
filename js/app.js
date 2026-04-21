/**
 * app.js — utilidades comunes + carrito en localStorage.
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

async function fetchProductos() {
  const res = await fetch(`${window.APP_CONFIG.API_BASE}/productos`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
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
  formatPrice,
};

document.addEventListener("DOMContentLoaded", renderCartBadge);
