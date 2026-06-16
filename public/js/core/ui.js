/**
 * core/ui.js — fragmentos de UI reutilizables: toast + card de producto.
 */
import { I18N } from "./i18n.js";
import { escapeHtml, formatPrice } from "./data.js";

let toastTimer = null;
/** Aviso flotante temporal (p.ej. "Añadido al carrito"). */
export function toast(msg) {
  let el = document.querySelector(".shop-toast");
  if (!el) {
    el = document.createElement("div");
    el.className = "shop-toast";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 1600);
}

/** Card de producto para la home (imagen + nombre + precio). */
export function productoCardHTML(p) {
  const nombre = I18N.t(p.nombre);
  const cover = (p.imgs || [])[0];
  const img = cover
    ? `<div class="card-img"><img src="${cover}" alt="${escapeHtml(nombre)}" loading="lazy"></div>`
    : `<div class="card-img is-empty"></div>`;
  return `
    <a class="card" href="producto.html?id=${encodeURIComponent(p.id)}">
      ${img}
      <h3 class="card-nombre">${escapeHtml(nombre)}</h3>
      <p class="card-precio">${formatPrice(p.precio)}</p>
    </a>`;
}
