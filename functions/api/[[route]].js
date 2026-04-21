/**
 * [[route]].js — backend de la tienda en Cloudflare Pages Functions (Hono).
 *
 * Filosofía JAMstack:
 *   - El CATÁLOGO (productos, precios, imágenes, descripciones) vive en data/productos.json.
 *     Source of truth editable con un commit. Se importa como módulo y se bundlea en el deploy.
 *   - Los ENVÍOS viven en data/envios.json, mismo patrón.
 *   - D1 sólo guarda lo MUTABLE: stock vivo y pedidos. No duplica el catálogo.
 *
 * Esto significa que en producción el precio/nombre de un producto es SIEMPRE
 * el de productos.json en el commit desplegado; el cliente no puede manipularlo.
 *
 * Bindings (ver wrangler.toml y .dev.vars):
 *   env.DB                     → D1 Database
 *   env.STRIPE_SECRET_KEY      → secret
 *   env.STRIPE_WEBHOOK_SECRET  → secret
 *   env.ADMIN_TOKEN            → secret
 *   env.FRONTEND_URL           → var
 */

import { Hono } from "hono";
import { handle } from "hono/cloudflare-pages";
import Stripe from "stripe";

import productos from "../../data/productos.json";
import envios from "../../data/envios.json";

const app = new Hono().basePath("/api");

// ─── helpers ─────────────────────────────────────────────
const toCents = (eur) => Math.round(Number(eur) * 100);

/** stockInicial admite:
 *   - número (producto sin variantes):  10  → { _: 10 }
 *   - objeto {talla: cantidad}:          { S: 3, M: 5 }
 *   - undefined/null:                    se asume 0, producto aparece pero sin stock */
function normalizeStockInicial(si) {
  if (typeof si === "number" && Number.isFinite(si)) return { _: Math.max(0, si) };
  if (si && typeof si === "object") {
    const out = {};
    for (const [k, v] of Object.entries(si)) out[k] = Math.max(0, Number(v) || 0);
    return out;
  }
  return {};
}

function findProducto(id) {
  return productos.find((p) => String(p.id) === String(id));
}

/** Inicializa en D1 las filas de stock que falten, usando stockInicial del JSON.
 *  Idempotente (INSERT OR IGNORE). Se memoiza por isolate para no lanzar
 *  el batch en cada request; tras un redeploy, el isolate se recrea y vuelve a comprobar. */
let stockInitPromise = null;
function ensureStock(env) {
  if (stockInitPromise) return stockInitPromise;
  stockInitPromise = (async () => {
    const stmts = [];
    for (const p of productos) {
      const inicial = normalizeStockInicial(p.stockInicial);
      for (const [talla, cantidad] of Object.entries(inicial)) {
        stmts.push(
          env.DB.prepare(
            `INSERT OR IGNORE INTO stock (producto_id, talla, cantidad) VALUES (?, ?, ?)`
          ).bind(String(p.id), String(talla), cantidad)
        );
      }
    }
    if (stmts.length) await env.DB.batch(stmts);
  })();
  try {
    return stockInitPromise;
  } catch {
    stockInitPromise = null;
    throw new Error("ensureStock failed");
  }
}

async function fetchStock(env, productoId = null) {
  const stmt = productoId
    ? env.DB.prepare(`SELECT producto_id, talla, cantidad FROM stock WHERE producto_id = ?`).bind(productoId)
    : env.DB.prepare(`SELECT producto_id, talla, cantidad FROM stock`);
  const { results } = await stmt.all();
  const byProducto = {};
  for (const row of results) {
    (byProducto[row.producto_id] ||= {})[row.talla] = row.cantidad;
  }
  return byProducto;
}

function hydrateProducto(p, stockMap) {
  return {
    id: p.id,
    nombre: p.nombre,
    descripcion: p.descripcion ?? "",
    precio: p.precio,
    img: p.img ?? "",
    stockByTalla: stockMap[p.id] || {},
  };
}

// ─── catálogo ────────────────────────────────────────────
app.get("/health", (c) =>
  c.json({ ok: true, runtime: "workers", db: "d1", productos: productos.length })
);

app.get("/productos", async (c) => {
  await ensureStock(c.env);
  const stock = await fetchStock(c.env);
  const activos = productos.filter((p) => p.activo !== false);
  return c.json(activos.map((p) => hydrateProducto(p, stock)));
});

app.get("/productos/:id", async (c) => {
  await ensureStock(c.env);
  const p = findProducto(c.req.param("id"));
  if (!p || p.activo === false) return c.json({ error: "no encontrado" }, 404);
  const stock = await fetchStock(c.env, p.id);
  return c.json(hydrateProducto(p, stock));
});

app.get("/envios", (c) => c.json(envios));

/** Sólo el stock vivo, para que el front pueda leer catálogo estático y
 *  enriquecerlo con stock cuando las Functions estén disponibles. */
app.get("/stock", async (c) => {
  await ensureStock(c.env);
  const stock = await fetchStock(c.env);
  return c.json(stock);
});

// ─── Stripe checkout ─────────────────────────────────────
app.post("/crear-sesion", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const carrito = Array.isArray(body.carrito) ? body.carrito : [];
  const envioReq = body.envio || null;

  if (!carrito.length) return c.json({ error: "carrito vacío" }, 400);

  await ensureStock(c.env);

  // Resolvemos cada ítem contra el JSON (precio/nombre no se aceptan del cliente)
  // y contra D1 (stock).
  const resolved = [];
  for (let i = 0; i < carrito.length; i++) {
    const it = carrito[i];
    const p = findProducto(it.id);
    if (!p) return c.json({ error: `producto ${it.id} no existe` }, 400);
    if (p.activo === false) return c.json({ error: `producto ${it.id} no activo` }, 400);

    const talla = String(it.talla || "_");
    const cantidad = Number(it.cantidad);
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      return c.json({ error: `cantidad inválida en ítem ${i}` }, 400);
    }

    const row = await c.env.DB.prepare(
      `SELECT cantidad FROM stock WHERE producto_id = ? AND talla = ?`
    )
      .bind(p.id, talla)
      .first();
    const disponible = row ? Number(row.cantidad) : 0;
    if (disponible < cantidad) {
      return c.json(
        {
          error: `sin stock para ${p.nombre}${talla !== "_" ? " · " + talla : ""}`,
          disponible,
        },
        409
      );
    }

    resolved.push({ p, talla, cantidad });
  }

  // Validar envío: precio del JSON, no del cliente.
  let envioResolved = null;
  if (envioReq && envioReq.zona) {
    const match = envios.find((e) => e.zona === envioReq.zona);
    if (!match) return c.json({ error: "zona de envío desconocida" }, 400);
    envioResolved = { zona: match.zona, precio: Number(match.precio) || 0 };
  }

  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);

  const line_items = resolved.map(({ p, talla, cantidad }) => ({
    quantity: cantidad,
    price_data: {
      currency: "eur",
      product_data: {
        name: talla !== "_" ? `${p.nombre} · ${talla}` : p.nombre,
        metadata: { id: String(p.id), talla },
      },
      unit_amount: toCents(p.precio),
    },
  }));

  if (envioResolved && envioResolved.precio > 0) {
    line_items.push({
      quantity: 1,
      price_data: {
        currency: "eur",
        product_data: { name: `Envío · ${envioResolved.zona}` },
        unit_amount: toCents(envioResolved.precio),
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
          resolved.map(({ p, talla, cantidad }) => ({
            id: p.id,
            nombre: p.nombre,
            precio: p.precio,
            talla,
            cantidad,
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
    event = await stripe.webhooks.constructEventAsync(
      body,
      sig,
      c.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return c.text(`Webhook Error: ${err.message}`, 400);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    try {
      const carrito = JSON.parse(session.metadata?.carrito || "[]");
      const stmts = [];
      for (const it of carrito) {
        stmts.push(
          c.env.DB.prepare(
            `UPDATE stock SET cantidad = MAX(0, cantidad - ?)
              WHERE producto_id = ? AND talla = ?`
          ).bind(Number(it.cantidad), String(it.id), String(it.talla || "_"))
        );
      }
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

// ─── admin ───────────────────────────────────────────────
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
  const limit =
    Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100;

  const { results } = await c.env.DB.prepare(
    `SELECT id, stripe_session_id, email, amount_total, currency, items,
            created_at AS createdAt
       FROM pedidos
      ORDER BY created_at DESC
      LIMIT ?`
  )
    .bind(limit)
    .all();

  const pedidos = results.map((p) => ({
    ...p,
    items: JSON.parse(p.items || "[]"),
  }));
  return c.json(pedidos);
});

admin.post("/stock-bulk", async (c) => {
  const { productos: updates = [] } = await c.req.json().catch(() => ({}));
  if (!Array.isArray(updates))
    return c.json({ error: "productos debe ser array" }, 400);

  const stmts = [];
  for (const u of updates) {
    if (!u?.id || !u?.stockByTalla) continue;
    for (const [talla, cantidad] of Object.entries(u.stockByTalla)) {
      stmts.push(
        c.env.DB.prepare(
          `INSERT INTO stock (producto_id, talla, cantidad) VALUES (?, ?, ?)
           ON CONFLICT (producto_id, talla) DO UPDATE SET cantidad = excluded.cantidad`
        ).bind(String(u.id), String(talla), Math.max(0, Number(cantidad) || 0))
      );
    }
  }
  if (stmts.length) await c.env.DB.batch(stmts);
  return c.json({ updated: updates.length });
});

app.route("/admin", admin);

export const onRequest = handle(app);
