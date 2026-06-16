/**
 * core/i18n.js — internacionalización OPCIONAL.
 *
 *  - Lee los idiomas de CONFIG.LANGS (el primero es el de por defecto).
 *  - Con un solo idioma queda inerte (el selector no se muestra).
 *  - I18N.t(obj)  → traduce un campo de datos: string tal cual, u objeto {es,en,...} con fallback.
 *  - I18N.s(key)  → textos fijos de la interfaz (edita STRINGS abajo).
 *  - I18N.cycle() → rota idiomas, repinta los [data-i18n] y emite el evento 'qnc:lang'.
 *
 * Para QUITAR i18n: deja CONFIG.LANGS = ["es"] (o tu idioma). No hace falta borrar nada.
 */
import { CONFIG } from "./config.js";

const LANGS = Array.isArray(CONFIG.LANGS) && CONFIG.LANGS.length ? CONFIG.LANGS : ["es"];
const DEFAULT = LANGS[0];
const KEY = "shop.lang";

function stored() {
  const v = localStorage.getItem(KEY);
  return LANGS.includes(v) ? v : DEFAULT;
}
let lang = stored();

// Textos fijos de la interfaz. Añade una entrada por idioma de CONFIG.LANGS.
const STRINGS = {
  "nav.tienda": { es: "Tienda", en: "Shop" },
  "nav.newsletter": { es: "Newsletter", en: "Newsletter" },
  "nav.contacto": { es: "Contacto", en: "Contact" },
  "cart.title": { es: "Carrito", en: "Cart" },
  "cart.empty": { es: "El carrito está vacío.", en: "Your cart is empty." },
  "cart.subtotal": { es: "Subtotal", en: "Subtotal" },
  "cart.shipping": { es: "Envío", en: "Shipping" },
  "cart.total": { es: "Total", en: "Total" },
  "cart.zone": { es: "Zona de envío", en: "Shipping zone" },
  "cart.weight": { es: "Peso total", en: "Total weight" },
  "cart.pay": { es: "Pagar", en: "Checkout" },
  "cart.continue": { es: "Seguir comprando", en: "Keep shopping" },
  "product.size": { es: "Talla", en: "Size" },
  "product.add": { es: "Añadir al carrito", en: "Add to cart" },
  "product.added": { es: "Añadido al carrito", en: "Added to cart" },
  "product.soldout": { es: "Agotado", en: "Sold out" },
  "news.title": { es: "Apúntate a la newsletter", en: "Join our newsletter" },
  "news.placeholder": { es: "tu email", en: "your email" },
  "news.send": { es: "Enviar", en: "Send" },
  "news.ok": { es: "¡Gracias! Te has apuntado.", en: "Thanks! You're in." },
  "contact.title": { es: "Escríbenos", en: "Write to us" },
  "contact.placeholder": { es: "tu mensaje", en: "your message" },
  "contact.email": { es: "tu email (opcional)", en: "your email (optional)" },
  "contact.send": { es: "Enviar", en: "Send" },
  "contact.ok": { es: "¡Gracias! Lo hemos recibido.", en: "Thanks! We got it." },
  "loading": { es: "Cargando…", en: "Loading…" },
  "error.load": { es: "Error al cargar.", en: "Loading error." },
  "error.generic": { es: "Algo ha fallado.", en: "Something went wrong." },
};

function t(obj) {
  if (obj == null) return "";
  if (Array.isArray(obj)) return obj.join("\n");
  if (typeof obj === "object") return obj[lang] ?? obj[DEFAULT] ?? Object.values(obj)[0] ?? "";
  return String(obj);
}

function s(key) {
  const o = STRINGS[key];
  return o ? o[lang] ?? o[DEFAULT] ?? key : key;
}

function apply(root) {
  const scope = root || document;
  scope.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = s(el.getAttribute("data-i18n")); });
  scope.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.setAttribute("placeholder", s(el.getAttribute("data-i18n-ph"))); });
  document.documentElement.lang = lang;
}

function set(l) {
  if (!LANGS.includes(l) || l === lang) return;
  lang = l;
  localStorage.setItem(KEY, l);
  apply();
  document.dispatchEvent(new CustomEvent("qnc:lang", { detail: { lang } }));
}

function cycle() { set(LANGS[(LANGS.indexOf(lang) + 1) % LANGS.length]); }

export const I18N = {
  get lang() { return lang; },
  LANGS,
  multi: LANGS.length > 1,
  STRINGS,
  t, s, set, cycle, apply,
  label: (l = lang) => l.toUpperCase(),
};
