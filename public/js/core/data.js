/**
 * core/data.js — capa de datos (catálogo, envíos) + utilidades.
 *
 * El catálogo se lee de public/data/productos.json (estático). El stock vivo se pide a
 * /api/stock; si no hay Functions, se cae a stockInicial.
 *
 * Producto (campos): id, nombre, descripcion, precio, peso(g), stockInicial, activo,
 *   img (1 imagen) | imgs ([...] varias),  nombre/descripcion pueden ser string o {es,en,...}.
 */
import { CONFIG } from "./config.js";

export function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function formatPrice(eur) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency: CONFIG.MONEDA || "EUR" }).format(Number(eur) || 0);
}

export function normalizeStockInicial(si) {
  if (typeof si === "number" && Number.isFinite(si)) return { _: Math.max(0, si) };
  if (si && typeof si === "object") {
    const out = {};
    for (const [k, v] of Object.entries(si)) out[k] = Math.max(0, Number(v) || 0);
    return out;
  }
  return {};
}

export function stockTotal(p) {
  return Object.values(p.stockByTalla || {}).reduce((n, v) => n + Number(v || 0), 0);
}

/** Precio de envío de una zona: tarifa plana ({precio}) o por peso ({tramos}, gramos). */
export function precioEnvio(zona, gramos = 0) {
  if (!zona) return 0;
  if (Array.isArray(zona.tramos)) {
    const tramos = [...zona.tramos].sort((a, b) => a.hasta - b.hasta);
    for (const tr of tramos) if (gramos <= tr.hasta) return Number(tr.precio) || 0;
    return Number(tramos[tramos.length - 1]?.precio) || 0;
  }
  return Number(zona.precio) || 0;
}

async function getJSON(path) {
  const res = await fetch(path, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${path} no disponible (HTTP ${res.status})`);
  return res.json();
}

async function stockVivo() {
  try {
    const res = await fetch(`${CONFIG.API_BASE}/stock`);
    if (res.ok) return await res.json();
  } catch { /* preview estático sin Functions */ }
  return null;
}

function hydrate(raw, stock) {
  return {
    ...raw,
    imgs: Array.isArray(raw.imgs) ? raw.imgs : raw.img ? [raw.img] : [],
    peso: Number(raw.peso) || 0,
    stockByTalla: (stock && stock[raw.id]) || normalizeStockInicial(raw.stockInicial),
  };
}

export async function fetchProductos() {
  const [cat, stock] = await Promise.all([getJSON("data/productos.json"), stockVivo()]);
  return cat.filter((p) => p.activo !== false).map((p) => hydrate(p, stock));
}

export async function fetchProducto(id) {
  const [cat, stock] = await Promise.all([getJSON("data/productos.json"), stockVivo()]);
  const raw = cat.find((p) => String(p.id) === String(id));
  return raw ? hydrate(raw, stock) : null;
}

export const fetchEnvios = () => getJSON("data/envios.json");
