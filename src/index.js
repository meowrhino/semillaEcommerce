/**
 * src/index.js — backend de la tienda en un Cloudflare Worker (Hono).
 *
 * Worker con "static assets": Cloudflare sirve public/ (la web) automáticamente y este Worker
 * solo atiende /api/*. Las rutas que coincidan con un archivo de public/ se sirven directas.
 *
 * Filosofía JAMstack:
 *   - El CATÁLOGO (productos, precios, imágenes, descripciones) vive en public/data/productos.json.
 *     Source of truth editable con un commit. Se importa como módulo y se bundlea en el deploy.
 *   - Los ENVÍOS viven en public/data/envios.json, mismo patrón.
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
import Stripe from "stripe";

import productos from "../public/data/productos.json";
import envios from "../public/data/envios.json";

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

/** Países que acepta Stripe para dirección de envío (ISO 3166-1, sin los no soportados).
 *  Fallback para zonas sin lista `paises` propia en envios.json (p. ej. "internacional"). */
const PAISES_STRIPE = [
  "AD","AE","AF","AG","AI","AL","AM","AO","AR","AT","AU","AW","AX","AZ","BA","BB","BD","BE","BF",
  "BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR","BS","BT","BW","BY","BZ","CA","CD","CF","CG",
  "CH","CI","CK","CL","CM","CN","CO","CR","CV","CW","CY","CZ","DE","DJ","DK","DM","DO","DZ","EC",
  "EE","EG","ER","ES","ET","FI","FJ","FK","FO","FR","GA","GB","GD","GE","GF","GG","GH","GI","GL",
  "GM","GN","GP","GQ","GR","GT","GU","GW","GY","HK","HN","HR","HT","HU","ID","IE","IL","IM","IN",
  "IQ","IS","IT","JE","JM","JO","JP","KE","KG","KH","KI","KM","KN","KR","KW","KY","KZ","LA","LB",
  "LC","LI","LK","LR","LS","LT","LU","LV","LY","MA","MC","MD","ME","MF","MG","MK","ML","MM","MN",
  "MO","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ","NA","NC","NE","NG","NI","NL","NO","NP",
  "NR","NU","NZ","OM","PA","PE","PF","PG","PH","PK","PL","PM","PR","PS","PT","PY","QA","RE","RO",
  "RS","RU","RW","SA","SB","SC","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR","SS","ST",
  "SV","SX","SZ","TC","TD","TG","TH","TJ","TK","TL","TM","TN","TO","TR","TT","TV","TW","TZ","UA",
  "UG","US","UY","UZ","VA","VC","VE","VG","VN","VU","WF","WS","XK","YE","ZA","ZM","ZW",
];

/** Países permitidos para una zona: su lista `paises` del JSON, o todos los de Stripe. */
function paisesDeZona(zona) {
  return Array.isArray(zona.paises) && zona.paises.length ? zona.paises : PAISES_STRIPE;
}

/** Etiqueta de una zona para el checkout de Stripe ({nombre} string u objeto i18n, o el id). */
function nombreDeZona(zona) {
  if (typeof zona.nombre === "string") return zona.nombre;
  return zona.nombre?.es || zona.zona;
}

/** Zona de recogida en mano: marcada con "recogida": true en envios.json (no pide dirección). */
function esZonaRecogida(zona) {
  return zona.recogida === true || zona.zona === "recogida";
}

/** Precio de envío de una zona. Soporta tarifa plana ({precio}) o por peso ({tramos}, gramos). */
function precioEnvio(zona, gramos = 0) {
  if (!zona) return 0;
  if (Array.isArray(zona.tramos)) {
    const tramos = [...zona.tramos].sort((a, b) => a.hasta - b.hasta);
    for (const tr of tramos) if (gramos <= tr.hasta) return Number(tr.precio) || 0;
    return Number(tramos[tramos.length - 1]?.precio) || 0;
  }
  return Number(zona.precio) || 0;
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
  })().catch((err) => {
    // Si D1 falla no dejamos cacheada la promesa rota: el siguiente request reintenta.
    stockInitPromise = null;
    throw err;
  });
  return stockInitPromise;
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
  let pesoTotal = 0; // gramos, para el envío por peso
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

    pesoTotal += (Number(p.peso) || 0) * cantidad;
    resolved.push({ p, talla, cantidad });
  }

  // Envío: si hay zonas configuradas en envios.json, es obligatorio elegir una.
  // El precio se recalcula SIEMPRE en el servidor (plano o por peso), no se acepta del cliente.
  let zonaEnvio = null;
  let envioResolved = null;
  if (envios.length) {
    if (!envioReq?.zona) return c.json({ error: "falta la zona de envío" }, 400);
    zonaEnvio = envios.find((e) => e.zona === envioReq.zona);
    if (!zonaEnvio) return c.json({ error: "zona de envío desconocida" }, 400);
    envioResolved = { zona: zonaEnvio.zona, precio: precioEnvio(zonaEnvio, pesoTotal) };
  }
  const conEnvio = envioResolved && !esZonaRecogida(zonaEnvio);

  if (!c.env.STRIPE_SECRET_KEY) return c.json({ error: "pagos no configurados" }, 503);
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

  const frontend = c.env.FRONTEND_URL || new URL(c.req.url).origin;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      // Sin payment_method_types: Stripe usa los métodos activados en el dashboard
      // (tarjeta + wallets de serie; Bizum/PayPal/etc. se activan allí, sin tocar código).
      line_items,
      // El envío va como shipping_option (no como producto): sale como envío de verdad
      // en el checkout y el recibo. En recogida no se pide dirección ni se cobra nada.
      shipping_address_collection: conEnvio
        ? { allowed_countries: paisesDeZona(zonaEnvio) }
        : undefined,
      shipping_options: conEnvio
        ? [
            {
              shipping_rate_data: {
                type: "fixed_amount",
                display_name: nombreDeZona(zonaEnvio),
                fixed_amount: { amount: toCents(envioResolved.precio), currency: "eur" },
              },
            },
          ]
        : undefined,
      // Campo "¿tienes un código?" en el checkout; los códigos se crean en el dashboard.
      allow_promotion_codes: true,
      // La sesión caduca en 30 min (mínimo de Stripe): acorta la ventana en la que
      // alguien puede pagar stock que ya voló (el stock se descuenta en el webhook).
      expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
      success_url: `${frontend}/gracias.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontend}/sorry.html`,
      // Metadata mínima (límite Stripe: 500 chars/valor): id, talla (si hay) y cantidad.
      // El webhook re-enriquece nombre/precio desde productos.json.
      metadata: {
        carrito: JSON.stringify(
          resolved.map(({ p, talla, cantidad }) =>
            talla !== "_" ? { id: p.id, talla, cantidad } : { id: p.id, cantidad }
          )
        ),
        zona: envioResolved?.zona || "",
      },
    });
    return c.json({ url: session.url, id: session.id });
  } catch (err) {
    console.error("Stripe session error:", err?.message || err);
    return c.json({ error: "no se pudo crear la sesión" }, 500);
  }
});

/** Estado de una sesión de checkout (para gracias.html: confirmar antes de vaciar carrito). */
app.get("/session-status", async (c) => {
  const id = c.req.query("session_id");
  if (!id) return c.json({ error: "session_id requerido" }, 400);
  if (!c.env.STRIPE_SECRET_KEY) return c.json({ error: "pagos no configurados" }, 503);
  const stripe = new Stripe(c.env.STRIPE_SECRET_KEY);
  try {
    const s = await stripe.checkout.sessions.retrieve(id);
    return c.json({
      status: s.status,
      payment_status: s.payment_status,
      email: s.customer_details?.email || null,
    });
  } catch {
    return c.json({ error: "sesión no encontrada" }, 404);
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
      // Metadata trae solo [{id, talla?, cantidad}]; nombre y precio se resuelven del JSON.
      const carrito = JSON.parse(session.metadata?.carrito || "[]");
      const items = carrito.map((it) => {
        const p = findProducto(it.id);
        return {
          id: it.id,
          nombre: p ? p.nombre : String(it.id),
          precio: p ? p.precio : null,
          talla: String(it.talla || "_"),
          cantidad: Number(it.cantidad),
        };
      });

      // Dirección de envío: según versión de API viene en collected_information o en shipping_details.
      const ship = session.collected_information?.shipping_details || session.shipping_details || null;
      const envioInfo = {
        zona: session.metadata?.zona || null,
        nombre: ship?.name || session.customer_details?.name || null,
        direccion: ship?.address || null,
        telefono: session.customer_details?.phone || null,
      };

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
          `INSERT INTO pedidos (id, stripe_session_id, email, amount_total, currency, items, zona, envio, estado)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pendiente')`
        ).bind(
          pedidoId,
          session.id,
          session.customer_details?.email || null,
          session.amount_total,
          session.currency,
          JSON.stringify(items),
          envioInfo.zona,
          JSON.stringify(envioInfo)
        )
      );
      // El batch es atómico y stripe_session_id es UNIQUE: si Stripe reenvía el evento,
      // el INSERT falla y el descuento de stock se revierte con él (idempotencia). No "arreglar".
      await c.env.DB.batch(stmts);
      console.log(`[webhook] pedido ${pedidoId} registrado`);
    } catch (err) {
      console.error("Error procesando checkout.session.completed:", err);
    }
  }

  return c.json({ received: true });
});

// ─── newsletter + contacto (features opcionales) ─────────
const reEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

app.post("/newsletter", async (c) => {
  const { email } = await c.req.json().catch(() => ({}));
  if (!email || !reEmail.test(String(email))) return c.json({ error: "email inválido" }, 400);
  await c.env.DB.prepare(`INSERT OR IGNORE INTO newsletter (email) VALUES (?)`)
    .bind(String(email).trim().toLowerCase())
    .run();
  return c.json({ ok: true });
});

app.post("/contacto", async (c) => {
  const { texto, email, nombre } = await c.req.json().catch(() => ({}));
  const msg = String(texto || "").trim();
  if (!msg) return c.json({ error: "mensaje vacío" }, 400);
  const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await c.env.DB.prepare(`INSERT INTO mensajes (id, nombre, email, texto) VALUES (?, ?, ?, ?)`)
    .bind(id, nombre ? String(nombre).slice(0, 200) : null, email ? String(email).slice(0, 200) : null, msg.slice(0, 5000))
    .run();
  return c.json({ ok: true });
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
    `SELECT id, stripe_session_id, email, amount_total, currency, items, zona, envio, estado,
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
    envio: p.envio ? JSON.parse(p.envio) : null,
  }));
  return c.json(pedidos);
});

const ESTADOS_PEDIDO = ["pendiente", "enviado", "entregado", "cancelado"];

admin.post("/pedido-estado", async (c) => {
  const { id, estado } = await c.req.json().catch(() => ({}));
  if (!id || !ESTADOS_PEDIDO.includes(estado))
    return c.json({ error: `estado debe ser: ${ESTADOS_PEDIDO.join(", ")}` }, 400);
  const r = await c.env.DB.prepare(`UPDATE pedidos SET estado = ? WHERE id = ?`)
    .bind(estado, String(id))
    .run();
  if (!r.meta.changes) return c.json({ error: "pedido no encontrado" }, 404);
  return c.json({ ok: true });
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

admin.get("/newsletter", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT email, created_at AS createdAt FROM newsletter ORDER BY created_at DESC LIMIT 1000`
  ).all();
  return c.json(results);
});

admin.get("/mensajes", async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, nombre, email, texto, created_at AS createdAt FROM mensajes ORDER BY created_at DESC LIMIT 500`
  ).all();
  return c.json(results);
});

app.route("/admin", admin);

// El Worker: Hono atiende /api/*; los assets de public/ los sirve Cloudflare automáticamente.
export default app;
