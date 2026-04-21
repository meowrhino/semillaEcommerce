/**
 * producto.js — ficha de producto. Espera ?id=XXX en la URL.
 */
(async function () {
  const root = document.querySelector("[data-producto]");
  if (!root) return;

  const id = new URLSearchParams(location.search).get("id");
  if (!id) {
    root.innerHTML = "<p>Producto no especificado.</p>";
    return;
  }

  try {
    const res = await fetch(`${window.APP_CONFIG.API_BASE}/productos/${encodeURIComponent(id)}`);
    if (!res.ok) throw new Error("no encontrado");
    const p = await res.json();

    const tallas = Object.keys(p.stockByTalla || {}).filter(
      (t) => Number(p.stockByTalla[t]) > 0
    );

    root.innerHTML = `
      ${p.img ? `<img src="${p.img}" alt="${escapeHtml(p.nombre)}">` : ""}
      <h1>${escapeHtml(p.nombre)}</h1>
      <p class="precio">${SemillaCart.formatPrice(p.precio)}</p>
      <p>${escapeHtml(p.descripcion || "")}</p>
      ${
        tallas.length
          ? `<label>Talla:
              <select data-talla>${tallas
                .map((t) => `<option value="${t}">${t}</option>`)
                .join("")}</select>
            </label>`
          : ""
      }
      <button data-add>Añadir al carrito</button>
    `;

    root.querySelector("[data-add]").addEventListener("click", () => {
      const talla = root.querySelector("[data-talla]")?.value || "";
      SemillaCart.addToCart({
        id: p.id,
        nombre: p.nombre,
        precio: p.precio,
        img: p.img,
        talla,
        cantidad: 1,
      });
      alert("Añadido al carrito");
    });
  } catch (err) {
    console.error(err);
    root.innerHTML = "<p>No se pudo cargar el producto.</p>";
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
