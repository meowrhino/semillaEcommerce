# semillaEcommerce

Plantilla de partida para ecommerces pequeños. Frontend estático en GitHub Pages + backend Node/Express en Render + Stripe Checkout + persistencia pluggable (JSON por defecto, SQLite/Turso opcional).

Derivado de [anakatana](https://github.com/meowrhino/anakatana), limpiado de marca y parametrizado.

---

## Stack

- **Frontend:** HTML/CSS/JS vanilla (GitHub Pages o cualquier hosting estático).
- **Backend:** Node.js 20 + Express 5 (Render, Fly, Railway…).
- **Pagos:** Stripe Checkout.
- **Persistencia:** capa `server/store.js` abstracta.
  - Default: JSON local + commit a GitHub vía Octokit.
  - Opcional: SQLite (Render Disk) o Turso/LibSQL (serverless, free tier).
- **Admin:** Bearer token en header `Authorization`.

## Estructura

```
semillaEcommerce/
├─ index.html, producto.html, checkout.html, gracias.html, sorry.html
├─ admin/                      # UI admin (token + vistas)
├─ css/styles.css              # base neutra, pinta tu marca encima
├─ js/
│  ├─ config.js                # API_BASE según entorno (local vs prod)
│  ├─ app.js                   # carrito en localStorage
│  ├─ checkout.js              # flujo Stripe
│  ├─ home.js, producto.js     # render catálogo y ficha
├─ data/
│  ├─ productos.json           # catálogo (fuente de verdad)
│  └─ envios.json              # zonas y tarifas
└─ server/                     # backend que se despliega en Render
   ├─ index.js                 # Express app
   ├─ store.js                 # abstracción de persistencia
   ├─ jsonStore.js             # backend JSON (default)
   ├─ stripe.js                # create-session + webhook
   ├─ package.json
   └─ .env.example
```

Importante: **GitHub Pages no ejecuta Node**. El contenido de `server/` se despliega aparte (Render). GH Pages solo sirve los archivos estáticos del root.

---

## Variables de entorno (server/.env)

| Variable            | Uso |
|---------------------|-----|
| `PORT`              | Puerto (Render lo inyecta). |
| `FRONTEND_URL`      | URL pública del front, p.ej. `https://usuario.github.io/tu-tienda`. Usado en `success_url`/`cancel_url` de Stripe. |
| `CORS_ORIGINS`      | Lista separada por comas. Soporta `*.github.io`. |
| `ADMIN_TOKEN`       | Token secreto para rutas `/admin/*`. |
| `STRIPE_SECRET_KEY` | Clave secreta de Stripe (`sk_live_...` o `sk_test_...`). |
| `STRIPE_WEBHOOK_SECRET` | Secret del endpoint webhook de Stripe. |
| `STORE_DRIVER`      | `json` (default) \| `turso` \| `sqlite`. |
| `GITHUB_TOKEN`      | (Solo driver `json`) Token con permisos de write al repo. |
| `GITHUB_OWNER`      | (Solo driver `json`) Usuario/org del repo de datos. |
| `GITHUB_REPO`       | (Solo driver `json`) Nombre del repo de datos. |
| `TURSO_URL`         | (Solo driver `turso`) URL libSQL del DB. |
| `TURSO_AUTH_TOKEN`  | (Solo driver `turso`) Token libSQL. |

El front lee la URL del backend de `js/config.js`. Ajústala ahí (no hay env vars en GH Pages).

---

## Quick start

```bash
# Backend
cd server
cp .env.example .env
# rellena STRIPE_SECRET_KEY, ADMIN_TOKEN, etc.
npm install
npm run dev   # http://localhost:3000

# Frontend
# En otra terminal, desde la raíz:
npx serve .   # o Live Server de VSCode
# Asegúrate de que js/config.js apunta a http://localhost:3000 en dev
```

## Endpoints

| Método | Ruta                  | Descripción |
|-------:|-----------------------|-------------|
| GET    | `/health`             | Healthcheck. |
| GET    | `/productos`          | Catálogo. |
| POST   | `/crear-sesion`       | Crea sesión Stripe desde carrito. |
| POST   | `/stripe-webhook`     | Recibe eventos (raw body). Registra pedido y baja stock. |
| GET    | `/admin/historial`    | (admin) Lista pedidos. |
| POST   | `/admin/stock-bulk`   | (admin) Actualiza stock en masa. |

---

## Migrar persistencia a SQLite / Turso

La capa `server/store.js` expone una API fija:

```js
store.productos.list()
store.productos.get(id)
store.productos.updateStock(id, talla, delta)
store.pedidos.create(pedido)
store.pedidos.list({ limit })
```

Para cambiar de driver, añade un archivo `server/tursoStore.js` que implemente la misma API y selecciónalo con `STORE_DRIVER=turso`. El resto del código no cambia.

**Recomendación:** arranca con `STORE_DRIVER=json`. Migra cuando el volumen de pedidos o la concurrencia empiecen a doler (señales: commits cada minuto, conflictos 409 de GitHub, o >50 pedidos/día).

### Opción A — SQLite con Render Disk (~$1/mes)
- Añade un Disk en Render montado en `/data`.
- `STORE_DRIVER=sqlite`, db en `/data/shop.db`.
- Driver: `better-sqlite3`.

### Opción B — Turso (libSQL, serverless, free tier)
- Crea DB en turso.tech → `turso db create shop`.
- Copia URL y token.
- `STORE_DRIVER=turso`.
- Driver: `@libsql/client`.
- Ventaja: sin disco, misma sintaxis SQLite, réplicas globales.

GH Pages no se entera de nada: sigue siendo estático.

---

## Despliegue

1. **Backend en Render**: Web Service apuntando a `server/`, start `npm start`, rellena env vars, configura webhook Stripe a `https://tu-backend.onrender.com/stripe-webhook`.
2. **Frontend en GitHub Pages**: publicar rama `main` raíz. Verifica que `js/config.js` apunta al backend de Render.
3. **Dominio propio**: apunta CNAME al host de GH Pages y añade el dominio a `CORS_ORIGINS`.

---

## Próximos pasos tras clonar

- [ ] Rellena `data/productos.json` con tu catálogo.
- [ ] Ajusta `data/envios.json` a tus tarifas.
- [ ] Pinta `css/styles.css` con tu marca (es intencionalmente neutro).
- [ ] Copia imágenes de producto a `/img` y referencia desde `productos.json`.
- [ ] Cambia la URL de backend en `js/config.js`.
- [ ] Configura webhook de Stripe en el dashboard y guarda el secret.
- [ ] Rota `ADMIN_TOKEN` antes de producción.
