/**
 * index.js — Backend Express para semillaEcommerce
 *
 * Secciones:
 *   1) Setup (env, express, cors)
 *   2) Auth admin (Bearer)
 *   3) Validadores
 *   4) Rutas catálogo
 *   5) Rutas Stripe (crear-sesion + webhook)
 *   6) Rutas admin
 *   7) Healthcheck + arranque
 */

require("dotenv").config();

const express = require("express");
const cors = require("cors");

const store = require("./store");

// ───────────────────────────────────────────────
// 1) SETUP
// ───────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
const FRONTEND_URL = process.env.FRONTEND_URL || "http://127.0.0.1:5500";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || "";
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || "";

const stripe = STRIPE_SECRET_KEY ? require("stripe")(STRIPE_SECRET_KEY) : null;

const app = express();

function buildOriginMatcher(list) {
  const exact = new Set();
  const suffixes = [];
  for (const raw of list) {
    const o = String(raw || "").trim();
    if (!o) continue;
    if (o.startsWith("*.")) suffixes.push(o.slice(1));
    else exact.add(o);
  }
  return (origin) => {
    if (!origin) return true;
    if (exact.has(origin)) return true;
    return suffixes.some((suf) => origin.endsWith(suf));
  };
}

const DEFAULT_ORIGINS = [
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "https://*.github.io",
];
const ORIGINS = (process.env.CORS_ORIGINS || DEFAULT_ORIGINS.join(","))
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const isAllowed = buildOriginMatcher(ORIGINS);

const corsOptions = {
  origin(origin, cb) {
    if (isAllowed(origin)) return cb(null, true);
    cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));

// Webhook de Stripe necesita el body raw — registramos ANTES de express.json()
app.post(
  "/stripe-webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

app.use(express.json());

// ───────────────────────────────────────────────
// 2) AUTH ADMIN
// ───────────────────────────────────────────────
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "";
function adminAuth(req, res, next) {
  const h = req.headers["authorization"] || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  if (ADMIN_TOKEN && token === ADMIN_TOKEN) return next();
  return res.status(401).json({ error: "unauthorized" });
}

// ───────────────────────────────────────────────
// 3) VALIDADORES
// ───────────────────────────────────────────────
const isNonEmptyString = (v) => typeof v === "string" && v.trim().length > 0;
const toCents = (eur) => Math.round(Number(eur) * 100);

function validateCarritoCheckout(carrito) {
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

// ───────────────────────────────────────────────
// 4) RUTAS CATÁLOGO
// ───────────────────────────────────────────────
app.get("/productos", async (req, res) => {
  try {
    const productos = await store.productos.list();
    res.json(productos);
  } catch (err) {
    console.error("GET /productos", err);
    res.status(500).json({ error: "no se pudo leer el catálogo" });
  }
});

app.get("/productos/:id", async (req, res) => {
  try {
    const producto = await store.productos.get(req.params.id);
    if (!producto) return res.status(404).json({ error: "no encontrado" });
    res.json(producto);
  } catch (err) {
    console.error("GET /productos/:id", err);
    res.status(500).json({ error: "fallo interno" });
  }
});

// ───────────────────────────────────────────────
// 5) RUTAS STRIPE
// ───────────────────────────────────────────────
app.post("/crear-sesion", async (req, res) => {
  if (!stripe) return res.status(500).json({ error: "Stripe no configurado" });

  const { carrito = [], envio = null } = req.body || {};
  const { ok, errors } = validateCarritoCheckout(carrito);
  if (!ok) return res.status(400).json({ error: "carrito inválido", errors });

  // Pre-chequeo de stock
  for (const item of carrito) {
    const producto = await store.productos.get(item.id);
    if (!producto) {
      return res.status(400).json({ error: `producto ${item.id} no existe` });
    }
    const disponible = Number((producto.stockByTalla || {})[item.talla || "_"] || 0);
    if (disponible < Number(item.cantidad)) {
      return res.status(409).json({
        error: `sin stock para ${producto.nombre}${item.talla ? " · " + item.talla : ""}`,
        disponible,
      });
    }
  }

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

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      line_items,
      success_url: `${FRONTEND_URL}/gracias.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${FRONTEND_URL}/sorry.html`,
      metadata: {
        carrito: JSON.stringify(
          carrito.map((it) => ({ id: it.id, talla: it.talla || "", cantidad: it.cantidad }))
        ),
      },
    });
    res.json({ url: session.url, id: session.id });
  } catch (err) {
    console.error("Stripe session error:", err.message || err);
    res.status(500).json({ error: "no se pudo crear la sesión" });
  }
});

async function handleStripeWebhook(req, res) {
  if (!stripe) return res.status(500).send("Stripe no configurado");
  if (!STRIPE_WEBHOOK_SECRET) {
    console.warn("STRIPE_WEBHOOK_SECRET vacío — ignorando webhook");
    return res.status(200).send("ignored");
  }

  let event;
  try {
    const sig = req.headers["stripe-signature"];
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    try {
      const carrito = JSON.parse(session.metadata?.carrito || "[]");

      // Bajar stock por cada ítem
      for (const it of carrito) {
        await store.productos.updateStock(it.id, it.talla, -Number(it.cantidad));
      }

      // Registrar pedido
      await store.pedidos.create({
        stripeSessionId: session.id,
        email: session.customer_details?.email || null,
        amountTotal: session.amount_total,
        currency: session.currency,
        items: carrito,
      });

      console.log(`[webhook] pedido registrado: ${session.id}`);
    } catch (err) {
      console.error("Error procesando checkout.session.completed:", err);
    }
  }

  res.json({ received: true });
}

// ───────────────────────────────────────────────
// 6) RUTAS ADMIN
// ───────────────────────────────────────────────
app.get("/admin/historial", adminAuth, async (req, res) => {
  const limit = Number(req.query.limit);
  const pedidos = await store.pedidos.list({
    limit: Number.isFinite(limit) ? limit : undefined,
  });
  res.json(pedidos);
});

app.post("/admin/stock-bulk", adminAuth, async (req, res) => {
  const { productos = [] } = req.body || {};
  if (!Array.isArray(productos)) {
    return res.status(400).json({ error: "productos debe ser array" });
  }

  const results = [];
  for (const p of productos) {
    if (!p || typeof p !== "object") continue;
    if (p.stockByTalla && typeof p.stockByTalla === "object") {
      const current = await store.productos.get(p.id);
      const prev = (current && current.stockByTalla) || {};
      for (const talla of Object.keys(p.stockByTalla)) {
        const target = Number(p.stockByTalla[talla]) || 0;
        const delta = target - (Number(prev[talla]) || 0);
        if (delta !== 0) await store.productos.updateStock(p.id, talla, delta);
      }
      results.push({ id: p.id, ok: true });
    }
  }
  res.json({ updated: results });
});

// ───────────────────────────────────────────────
// 7) HEALTHCHECK + ARRANQUE
// ───────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ ok: true, driver: process.env.STORE_DRIVER || "json", uptime: process.uptime() });
});

app.listen(PORT, () => {
  console.log(`[server] escuchando en puerto ${PORT}`);
  console.log(`[server] FRONTEND_URL=${FRONTEND_URL}`);
  console.log(`[server] CORS=${ORIGINS.join(", ")}`);
});
