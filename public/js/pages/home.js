/**
 * pages/home.js — galería de la tienda.
 */
import { mountLayout } from "../core/layout.js";
import { I18N } from "../core/i18n.js";
import { fetchProductos } from "../core/data.js";
import { productoCardHTML } from "../core/ui.js";

mountLayout();

const container = document.querySelector("[data-productos]");
let productos = [];

function render() {
  if (!container) return;
  container.innerHTML = productos.length
    ? productos.map(productoCardHTML).join("")
    : `<p class="estado">${I18N.s("error.load")}</p>`;
}

async function init() {
  try { productos = await fetchProductos(); } catch (e) { console.error("home", e); }
  render();
}

init();
document.addEventListener("qnc:lang", render);
