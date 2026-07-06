/**
 * core/layout.js — cabecera compartida en todas las páginas.
 *
 * mountLayout() inyecta el <header> (logo + navegación + idioma + carrito) al principio
 * del <body>. Edita NAV para cambiar los enlaces. El selector de idioma sólo aparece si
 * CONFIG.LANGS tiene más de un idioma.
 */
import { CONFIG } from "./config.js";
import { I18N } from "./i18n.js";
import { renderCartBadge } from "./cart.js";

// Enlaces del menú. Quita newsletter/contacto si no usas esas páginas.
const NAV = [
  { href: "index.html", key: "nav.tienda" },
  { href: "newsletter.html", key: "nav.newsletter" },
  { href: "contacto.html", key: "nav.contacto" },
  { href: "legal.html", key: "nav.legal" },
];

function build() {
  const langBtn = I18N.multi
    ? `<button class="lang-toggle" data-lang-toggle type="button" title="idioma">${I18N.label()}</button>`
    : "";

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <header class="shop-header">
      <a class="shop-logo" href="index.html">${CONFIG.TIENDA_NOMBRE}</a>
      <nav class="shop-nav">
        ${NAV.map((n) => `<a href="${n.href}" data-i18n="${n.key}"></a>`).join("")}
      </nav>
      <div class="shop-right">
        ${langBtn}
        <a class="shop-cart" href="checkout.html">
          <span data-i18n="cart.title"></span>
          <span class="cart-badge" data-cart-count></span>
        </a>
      </div>
    </header>
  `;
  const here = location.pathname.split("/").pop() || "index.html";
  wrap.querySelectorAll(".shop-nav a").forEach((a) => {
    if (a.getAttribute("href") === here) a.classList.add("is-active");
  });
  Array.from(wrap.children).reverse().forEach((el) => document.body.prepend(el));
}

function wire() {
  const toggle = document.querySelector("[data-lang-toggle]");
  toggle?.addEventListener("click", () => {
    const main = document.querySelector("main");
    if (!main) return I18N.cycle();
    main.classList.add("lang-fade");
    setTimeout(() => { I18N.cycle(); main.classList.remove("lang-fade"); }, 220);
  });
  document.addEventListener("qnc:lang", () => {
    if (toggle) toggle.textContent = I18N.label();
  });
}

export function mountLayout() {
  build();
  I18N.apply();
  wire();
  renderCartBadge();
}
