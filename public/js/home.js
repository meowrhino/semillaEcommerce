/**
 * home.js — carga productos y pinta la galería.
 */
(async function () {
  const container = document.querySelector("[data-productos]");
  if (!container) return;

  try {
    const productos = await SemillaCart.fetchProductos();

    if (!productos.length) {
      container.innerHTML = "<p>No hay productos todavía.</p>";
      return;
    }

    container.innerHTML = productos
      .map(
        (p) => `
        <article class="producto-card" data-id="${p.id}">
          ${p.img ? `<img src="${p.img}" alt="${escapeHtml(p.nombre)}">` : ""}
          <h3>${escapeHtml(p.nombre)}</h3>
          <p class="precio">${SemillaCart.formatPrice(p.precio)}</p>
          <a href="producto.html?id=${encodeURIComponent(p.id)}">Ver</a>
        </article>
      `
      )
      .join("");
  } catch (err) {
    console.error("home.js", err);
    container.innerHTML =
      '<p>Error cargando productos. Revisa que el backend esté activo.</p>';
  }
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
