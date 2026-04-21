/**
 * [[route]].js — Backend de la tienda en Cloudflare Pages Functions (Hono).
 *
 * Esto es un catch-all que atiende cualquier request a /api/*.
 * Equivalente al anterior Express de Node, pero corre en Workers/V8 (no Node).
 *
 * Bindings esperados (ver wrangler.toml y .dev.vars):
 *   - env.DB                     → D1 Database
 *   - env.STRIPE_SECRET_KEY      → secret
 *   - env.STRIPE_WEBHOOK_SECRET  → secret
 *   - env.ADMIN_TOKEN            → secret
 *   - env.FRONTEND_URL           → var (para success/cancel URLs de Stripe)
 */

import { Hono } from "hono";
import { handle } from "hono/cloudflare-pages";
import Stripe from "stripe";

const app = new Hono().basePath("/api");

// ─────────────────────────────────────────────
// Healthcheck
// ─────────────────────────────────────────────
app.get("/health", (c) =>
  c.json({ ok: true, runtime: "workers", db: "d1" })
);

// ─────────────────────────────────────────────
// Catálogo
// ─────────────────────────────────────────────
app.get("/productos", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.nombre, p.descripcion, p.precio, p.img,
            (SELECT json_group_object(talla, cantidad)
               FROM stock_variantes s WHERE s.producto_id = p.id) AS stockByTalla
       FROM productos p
      WHERE p.activo = 1
      ORDER BY p.created_at DESC`
  ).all();

  const productos = results.map((r) => ({
    ...r,
    stockByTalla: r.stockByTalla ? JSON.parse(r.stockByTalla) : {},
  }));
  return c.json(productos);
});

app.get("/productos/:id", async (c) => {
  const id = c.req.param("id");
  const producto = await c.env.DB.prepare(
    `SELECT id, nombre, descripcion, precio, img FROM productos WHERE id = ? AND activo = 1`
  ).bind(id).first();

  if (!producto) return c.json({ error: "no encontrado" }, 404);

  const { results: stock } = await c.env.DB.prepare(
    `SELECT talla, cantidad FROM stock_variantes WHERE producto_id = ?`
  ).bind(id).all();

  producto.stockByTalla = Object.fromEntries(stock.map((s) => [s.talla, s.cantidad]));
  return c.json(producto);
});

app.get("/envios", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT zona, precio FROM envios ORDER BY precio ASC`
  ).all();
  return c.json(results);
});

// ─────────────────────────────────────────────
// Stripe Checkout
// ─────────────────────────────────────────────
const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;
const toCents = (eur) => Math.round(Number(eur) * 100);

function validateCarrito(carrito) {
  const errors = [];
  if (!Array.isArray(carrito) || carrito.length === 0) {
    return { ok: false, errors: ["carrito debe ser un array con al menos 1 ítem"] };
  }
  carrito.forEach((it, idx) => {
    if (!isNonEmptyString(it.nombre)) errors.push(`item[${idx}].nombre requerido`);
    const precioNum = Number(it.precio);
    if (!Number.isFinite(precioNum) || precioNum < 0)
      errors.push(`item[${idx}].precio debe ser número ≥ 0`);
    const qty = Number(it.cantidad);
    if (!Number.isInteger(qty) || qty <= 0)
      errors.push(`item[${idx}].cantidad debe ser entero ≥ 1`);
  });
  return { ok: errors.length === 0, errors };
}

app.post("/crear-sesion", async (c) => {
  const { carrito = [], envio = null } = await c.req.json();

  const { ok, errors } = validateCarrito(carrito);
  if (!ok) return c.json({ error: "carrito inválido", errors }, 400);

  // Pre-chequeo de stock
  for (const item of carrito) {
    const row = await c.env.DB.prepare(
      `SELECT p.nombre, COALESCE(s.cantidad, 0) AS disponible
         FROM productos p
         LEFT JOIN stock_variantes s
           ON s.producto_id = p.id AND s.talla = ?
        WHERE p.id = ? AND p.activo = 1`
    ).bind(item.talla || "_", item.id).first();

    if (!row) return c.json({ error: `producto ${item.id} no existe` }, 400);

    if (Number(row.disponible) < Number(item.cantidad)) {
      return c.json(
        {
          error: `sin stock para ${row.nombre}${item.talla ? " · " + item.talla : ""}`,
          disponible: Number(row.disponible),
        },
        409
      );
    }
  }

  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);

  const line_items = carrito.map((it) => ({
    quantity: Number(it.cantidad),
    price_data: {
      currency: "eur",
      product_data: {
        name: it.talla ? `${it.nombre} · ${it.talla}` : it.nombre,
        metadata: { id: String(it.id || ""), talla: String(it.talla || "") },
      },
      unit_amount: toCents(it.precio),
    },
  }));

  if (envio && Number(envio.precio) > 0) {
    line_items.push({
      quantity: 1,
      price_data: {
        currency: "eur",
        product_data: { name: `Envío · ${envio.zona || "standard"}` },
        unit_amount: toCents(envio.precio),
      },
    });
  }

  const frontend = c.env.FRONTEND_URL || new URL(c.req.url).origin;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items,
      success_url: `${frontend}/gracias.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontend}/sorry.html`,
      metadata: {
        carrito: JSON.stringify(
          carrito.map((it) => ({
            id: it.id,
            nombre: it.nombre,
            precio: it.precio,
            talla: it.talla || "",
            cantidad: it.cantidad,
          }))
        ),
      },
    });
    return c.json({ url: session.url, id: session.id });
  } catch (err) {
    console.error("Stripe session error:", err?.message || err);
    return c.json({ error: "no se pudo crear la sesión" }, 500);
  }
});

app.post("/stripe-webhook", async (c) => {
  if (!c.env.STRIPE_WEBHOOK_SECRET) {
    console.warn("STRIPE_WEBHOOK_SECRET vacío — ignorando webhook");
    return c.text("ignored", 200);
  }

  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);
  const sig = c.req.header("stripe-signature");
  const body = await c.req.text();

  let event;
  try {
    // En Workers usamos constructEventAsync (la versión sync usa crypto de Node).
    event = await stripe.webhooks.constructEventAsync(body, sig, c.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return c.text(`Webhook Error: ${err.message}`, 400);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    try {
      const carrito = JSON.parse(session.metadata?.carrito || "[]");

      const stmts = [];

      // Bajar stock
      for (const it of carrito) {
        stmts.push(
          c.env.DB.prepare(
            `UPDATE stock_variantes
                SET cantidad = MAX(0, cantidad - ?)
              WHERE producto_id = ? AND talla = ?`
          ).bind(Number(it.cantidad), String(it.id), String(it.talla || "_"))
        );
      }

      // Registrar pedido
      const pedidoId = `ord_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      stmts.push(
        c.env.DB.prepare(
          `INSERT INTO pedidos (id, stripe_session_id, email, amount_total, currency, items)
           VALUES (?, ?, ?, ?, ?, ?)`
        ).bind(
          pedidoId,
          session.id,
          session.customer_details?.email || null,
          session.amount_total,
          session.currency,
          JSON.stringify(carrito)
        )
      );

      await c.env.DB.batch(stmts);
      console.log(`[webhook] pedido ${pedidoId} registrado`);
    } catch (err) {
      console.error("Error procesando checkout.session.completed:", err);
    }
  }

  return c.json({ received: true });
});

// ─────────────────────────────────────────────
// Admin (Bearer token)
// ─────────────────────────────────────────────
const admin = new Hono();

admin.use("*", async (c, next) => {
  const auth = c.req.header("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!c.env.ADMIN_TOKEN || token !== c.env.ADMIN_TOKEN) {
    return c.json({ error: "unauthorized" }, 401);
  }
  await next();
});

admin.get("/historial", async (c) => {
  const limitRaw = Number(c.req.query("limit"));
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100;

  const { results } = await c.env.DB.prepare(
    `SELECT id, stripe_session_id, email, amount_total, currency, items, created_at AS createdAt
       FROM pedidos
      ORDER BY created_at DESC
      LIMIT ?`
  ).bind(limit).all();

  const pedidos = results.map((p) => ({ ...p, items: JSON.parse(p.items || "[]") }));
  return c.json(pedidos);
});

admin.post("/stock-bulk", async (c) => {
  const { productos = [] } = await c.req.json();
  if (!Array.isArray(productos)) {
    return c.json({ error: "productos debe ser array" }, 400);
  }

  const stmts = [];
  for (const p of productos) {
    if (!p || typeof p !== "object" || !p.id || !p.stockByTalla) continue;
    for (const [talla, cantidad] of Object.entries(p.stockByTalla)) {
      stmts.push(
        c.env.DB.prepare(
          `INSERT INTO stock_variantes (producto_id, talla, cantidad)
           VALUES (?, ?, ?)
           ON CONFLICT (producto_id, talla) DO UPDATE SET cantidad = excluded.cantidad`
        ).bind(String(p.id), String(talla), Math.max(0, Number(cantidad) || 0))
      );
    }
  }

  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ updated: productos.length });
});

app.route("/admin", admin);

// ─────────────────────────────────────────────
// Pages Functions adapter
// ─────────────────────────────────────────────
export const onRequest = handle(app);
