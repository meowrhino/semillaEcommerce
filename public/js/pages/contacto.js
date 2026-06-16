/**
 * pages/contacto.js — mensaje → POST /api/contacto (guarda en D1).
 * Feature opcional: borra esta página, su HTML y el endpoint si no la usas.
 */
import { mountLayout } from "../core/layout.js";
import { I18N } from "../core/i18n.js";
import { CONFIG } from "../core/config.js";

mountLayout();

const form = document.querySelector("[data-contacto]");

if (form) {
  const fb = form.querySelector("[data-feedback]");
  const texto = form.querySelector('textarea[name="texto"]');
  const email = form.querySelector('input[name="email"]');
  const btn = form.querySelector('button[type="submit"]');
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = texto.value.trim();
    if (!msg) { fb.textContent = I18N.s("error.generic"); return; }
    btn.disabled = true; fb.textContent = "…";
    try {
      const res = await fetch(`${CONFIG.API_BASE}/contacto`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: msg, email: email.value.trim() }) });
      if (!res.ok) throw new Error("http " + res.status);
      fb.textContent = I18N.s("contact.ok"); form.reset();
    } catch (err) { console.error(err); fb.textContent = I18N.s("error.generic"); }
    finally { btn.disabled = false; }
  });
  document.addEventListener("qnc:lang", () => { fb.textContent = ""; });
}
