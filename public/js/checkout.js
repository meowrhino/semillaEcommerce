/**
 * checkout.js — pinta carrito, recoge envío y crea sesión Stripe.
 */
(async function () {
  const listEl = document.querySelector("[data-carrito]");
  const totalEl = document.querySelector("[data-total]");
  const envioSelect = document.querySelector("[data-envio]");
  const btnPagar = document.querySelector("[data-pagar]");

  if (!listEl || !btnPagar) return;

  let envios = [];
  try {
    envios = await SemillaCart.fetchEnvios();
  } catch (err) {
    console.warn("No se pudieron cargar los envíos:", err);
  }

  if (envioSelect) {
    envioSelect.innerHTML = envios
      .map((e) => {
        const etiqueta = Array.isArray(e.tramos)
          ? "(según peso)"
          : SemillaCart.formatPrice(e.precio);
        return `<option value="${e.zona}">${e.zona} — ${etiqueta}</option>`;
      })
      .join("");
    envioSelect.addEventListener("change", render);
  }

  // Resuelve la zona elegida y calcula su precio (plano o por peso del carrito).
  function getEnvio() {
    if (!envioSelect) return null;
    const opt = envioSelect.selectedOptions[0];
    if (!opt) return null;
    const zona = envios.find((e) => e.zona === opt.value);
    return { zona: opt.value, precio: SemillaCart.precioEnvio(zona, SemillaCart.cartWeight()) };
  }

  function render() {
    const cart = SemillaCart.getCart();

    if (!cart.length) {
      listEl.innerHTML = "<p>Carrito vacío.</p>";
      if (totalEl) totalEl.textContent = SemillaCart.formatPrice(0);
      btnPagar.disabled = true;
      return;
    }

    listEl.innerHTML = cart
      .map(
        (it, i) => `
        <div class="carrito-item" data-i="${i}">
          <span>${escapeHtml(it.nombre)}${it.talla ? " · " + escapeHtml(it.talla) : ""}</span>
          <span>${it.cantidad} × ${SemillaCart.formatPrice(it.precio)}</span>
          <button data-remove="${i}" aria-label="quitar">×</button>
        </div>
      `
      )
      .join("");

    listEl.querySelectorAll("[data-remove]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.dataset.remove);
        const target = SemillaCart.getCart()[idx];
        if (target) SemillaCart.removeItem(target.id, target.talla);
        render();
      });
    });

    const envio = getEnvio();
    const subtotal = SemillaCart.cartTotal();
    const total = subtotal + (envio?.precio || 0);
    if (totalEl) totalEl.textContent = SemillaCart.formatPrice(total);
    btnPagar.disabled = false;
  }

  btnPagar.addEventListener("click", async () => {
    btnPagar.disabled = true;
    try {
      const res = await fetch(`${window.APP_CONFIG.API_BASE}/crear-sesion`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carrito: SemillaCart.getCart(),
          envio: getEnvio(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "error");
      window.location.href = data.url;
    } catch (err) {
      console.error(err);
      alert("No se pudo iniciar el pago: " + err.message);
      btnPagar.disabled = false;
    }
  });

  render();
})();

function escapeHtml(str) {
  return String(str || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[c]));
}
