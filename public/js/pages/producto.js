/**
 * pages/producto.js — ficha de producto (?id=XXX).
 * Galería multi-imagen con < > y miniaturas, tallas opcionales, añadir al carrito con toast.
 */
import { mountLayout } from "../core/layout.js";
import { I18N } from "../core/i18n.js";
import { fetchProducto, escapeHtml, formatPrice, stockTotal } from "../core/data.js";
import { addToCart } from "../core/cart.js";
import { toast } from "../core/ui.js";

mountLayout();

const root = document.querySelector("[data-producto]");
const id = new URLSearchParams(location.search).get("id");
let p = null;
let idx = 0;

function tallasDisponibles() {
  return Object.keys(p.stockByTalla || {}).filter((t) => t !== "_" && Number(p.stockByTalla[t]) > 0);
}

function galeriaHTML() {
  if (!p.imgs.length) return `<div class="galeria"><div class="galeria-stage"></div></div>`;
  const multi = p.imgs.length > 1;
  return `
    <div class="galeria">
      <div class="galeria-stage">
        ${multi ? `<button class="galeria-nav prev" data-prev type="button" aria-label="anterior">‹</button>` : ""}
        <img data-stage src="${p.imgs[idx]}" alt="${escapeHtml(I18N.t(p.nombre))}" />
        ${multi ? `<button class="galeria-nav next" data-next type="button" aria-label="siguiente">›</button>` : ""}
      </div>
      ${multi ? `<div class="galeria-thumbs">${p.imgs
        .map((src, i) => `<button type="button" class="${i === idx ? "on" : ""}" data-thumb="${i}" aria-label="imagen ${i + 1}"><img src="${src}" alt="" loading="lazy"></button>`)
        .join("")}</div>` : ""}
    </div>`;
}

function infoHTML() {
  const tallas = tallasDisponibles();
  const agotado = stockTotal(p) <= 0;
  const selector = tallas.length
    ? `<label class="talla-sel">${I18N.s("product.size")}:
        <select data-talla>${tallas.map((t) => `<option value="${t}">${escapeHtml(t)}</option>`).join("")}</select>
      </label>`
    : "";
  const btn = agotado
    ? `<button class="btn-add" disabled>${I18N.s("product.soldout")}</button>`
    : `<button class="btn-add" data-add>${I18N.s("product.add")}</button>`;

  return `
    <div class="producto-info">
      <h1 class="producto-nombre">${escapeHtml(I18N.t(p.nombre))}</h1>
      <p class="producto-precio">${formatPrice(p.precio)}</p>
      <p class="producto-desc">${escapeHtml(I18N.t(p.descripcion))}</p>
      ${selector}
      ${btn}
    </div>`;
}

function render() {
  root.innerHTML = galeriaHTML() + infoHTML();
  document.title = `${I18N.t(p.nombre)} · ${document.title.split("·").pop().trim()}`;

  const stage = root.querySelector("[data-stage]");
  const go = (n) => {
    idx = (n + p.imgs.length) % p.imgs.length;
    stage.src = p.imgs[idx];
    root.querySelectorAll("[data-thumb]").forEach((t, i) => t.classList.toggle("on", i === idx));
  };
  root.querySelector("[data-prev]")?.addEventListener("click", () => go(idx - 1));
  root.querySelector("[data-next]")?.addEventListener("click", () => go(idx + 1));
  root.querySelectorAll("[data-thumb]").forEach((t) => t.addEventListener("click", () => go(Number(t.dataset.thumb))));

  root.querySelector("[data-add]")?.addEventListener("click", () => {
    const talla = root.querySelector("[data-talla]")?.value || "";
    addToCart({ id: p.id, nombre: I18N.t(p.nombre), precio: p.precio, peso: p.peso || 0, img: p.imgs[0] || "", talla });
    toast(I18N.s("product.added"));
  });
}

async function init() {
  if (!root) return;
  if (!id) { root.innerHTML = `<p class="estado">${I18N.s("error.generic")}</p>`; return; }
  try { p = await fetchProducto(id); } catch (e) { console.error(e); root.innerHTML = `<p class="estado">${I18N.s("error.load")}</p>`; return; }
  if (!p) { root.innerHTML = `<p class="estado">404</p>`; return; }
  render();
  document.addEventListener("qnc:lang", render);
}

init();
