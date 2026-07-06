/**
 * pages/gracias.js — post-pago: verifica la sesión con el backend antes de vaciar
 * el carrito (visitar la URL a pelo no borra nada) y muestra el email del recibo.
 */
import { mountLayout } from "../core/layout.js";
import { CONFIG } from "../core/config.js";
import { clearCart } from "../core/cart.js";

mountLayout();

const sid = new URLSearchParams(location.search).get("session_id");
if (sid) {
  fetch(`${CONFIG.API_BASE}/session-status?session_id=${encodeURIComponent(sid)}`)
    .then((r) => r.json())
    .then((d) => {
      if (d.payment_status === "paid" || d.status === "complete") {
        clearCart();
        const el = document.querySelector("[data-confirm-email]");
        if (el && d.email) {
          el.textContent = d.email;
          el.closest("[data-confirm]")?.removeAttribute("hidden");
        }
      }
    })
    // Si la API no responde, venimos igualmente de Stripe (success_url): vaciamos como antes.
    .catch(() => clearCart());
}
