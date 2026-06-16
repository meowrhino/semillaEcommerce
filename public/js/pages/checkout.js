/**
 * pages/checkout.js — carrito + envío (plano o por peso) + sesión Stripe.
 * El backend revalida precio/stock y recalcula el envío.
 */
import { mountLayout } from "../core/layout.js";
import { I18N } from "../core/i18n.js";
import { CONFIG } from "../core/config.js";
import { fetchEnvios, escapeHtml, formatPrice, precioEnvio } from "../core/data.js";
import { getCart, cartTotal, cartWeight, setQty, removeItem } from "../core/cart.js";

mountLayout();

const listEl = document.querySelector("[data-carrito]");
const resumenEl = document.querySelector("[data-resumen]");

let envios = [];
let zonaSel = null;
const zonaActual = () => envios.find((z) => z.zona === zonaSel) || envios[0] || null;
const zonaLabel = (z) => (z.nombre ? I18N.t(z.nombre) : z.zona);

function render() {
  if (!listEl) return;
  const cart = getCart();

  if (!cart.length) {
    listEl.innerHTML = `<p class="estado">${I18N.s("cart.empty")}</p>`;
    resumenEl.innerHTML = `<p><a href="index.html">← ${I18N.s("cart.continue")}</a></p>`;
    return;
  }

  listEl.innerHTML = cart
    .map(
      (it, i) => `
      <div class="carrito-item" data-i="${i}">
        <span class="it-nombre">${escapeHtml(it.nombre)}${it.talla ? " · " + escapeHtml(it.talla) : ""}</span>
        <input class="carrito-qty" type="number" min="1" step="1" value="${it.cantidad}" data-qty aria-label="cantidad" />
        <span>${formatPrice(it.precio * it.cantidad)}
          <button class="carrito-remove" data-remove aria-label="quitar">×</button>
        </span>
      </div>`
    )
    .join("");

  listEl.querySelectorAll(".carrito-item").forEach((row) => {
    const it = getCart()[Number(row.dataset.i)];
    if (!it) return;
    row.querySelector("[data-qty]").addEventListener("change", (e) => { setQty(it.id, it.talla, e.target.value); render(); });
    row.querySelector("[data-remove]").addEventListener("click", () => { removeItem(it.id, it.talla); render(); });
  });

  const peso = cartWeight();
  const subtotal = cartTotal();
  const envio = precioEnvio(zonaActual(), peso);

  resumenEl.innerHTML = `
    <div class="fila">
      <label>${I18N.s("cart.zone")}:
        <select data-zona>${envios.map((z) => `<option value="${z.zona}" ${z.zona === zonaSel ? "selected" : ""}>${escapeHtml(zonaLabel(z))}</option>`).join("")}</select>
      </label>
    </div>
    <div class="fila"><span>${I18N.s("cart.weight")}</span><span>${(peso / 1000).toFixed(3).replace(".", ",")} kg</span></div>
    <div class="fila"><span>${I18N.s("cart.subtotal")}</span><span>${formatPrice(subtotal)}</span></div>
    <div class="fila"><span>${I18N.s("cart.shipping")}</span><span>${formatPrice(envio)}</span></div>
    <div class="fila total"><span>${I18N.s("cart.total")}</span><span>${formatPrice(subtotal + envio)}</span></div>
    <button class="btn-pagar" data-pagar>${I18N.s("cart.pay")}</button>
    <p style="margin-top:1rem"><a href="index.html">← ${I18N.s("cart.continue")}</a></p>`;

  resumenEl.querySelector("[data-zona]").addEventListener("change", (e) => { zonaSel = e.target.value; render(); });
  resumenEl.querySelector("[data-pagar]").addEventListener("click", pagar);
}

async function pagar(e) {
  const btn = e.currentTarget;
  btn.disabled = true;
  try {
    const res = await fetch(`${CONFIG.API_BASE}/crear-sesion`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ carrito: getCart(), envio: { zona: zonaSel } }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "error");
    window.location.href = data.url;
  } catch (err) {
    console.error(err);
    alert(I18N.s("error.generic") + " " + err.message);
    btn.disabled = false;
  }
}

async function init() {
  try { envios = await fetchEnvios(); zonaSel = envios[0]?.zona || null; } catch (e) { console.warn("envios", e); }
  render();
}

init();
document.addEventListener("qnc:lang", render);
