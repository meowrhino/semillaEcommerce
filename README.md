# semillaEcommerce

Plantilla para montar un ecommerce pequeño desde cero. Viene preparada para correr **100 % en Cloudflare gratis**: la web, el backend, la base de datos y el dominio, todo bajo la misma cuenta.

Este README está escrito pensando en que **no has tocado Cloudflare Pages ni D1 antes**. Te lleva paso a paso desde clonar el repo hasta tener una tienda viva con pagos reales.

---

## Tabla de contenidos

1. [Qué tecnologías hay aquí y por qué](#1-qué-tecnologías-hay-aquí-y-por-qué)
2. [Requisitos previos](#2-requisitos-previos)
3. [Primera tienda: de cero a viva, paso a paso](#3-primera-tienda-de-cero-a-viva-paso-a-paso)
4. [Día a día trabajando en local](#4-día-a-día-trabajando-en-local)
5. [Gestionar la tienda ya desplegada](#5-gestionar-la-tienda-ya-desplegada)
6. [Mapa del repo](#6-mapa-del-repo)
7. [Endpoints de la API](#7-endpoints-de-la-api)
8. [Problemas comunes](#8-problemas-comunes)
9. [Rescatar la versión Node/Render anterior](#9-rescatar-la-versión-noderender-anterior)

---

## 1. Qué tecnologías hay aquí y por qué

Piensa en Cloudflare como "Render + GitHub Pages + SQLite + DNS, todo junto bajo un mismo login". No tienes que elegir proveedores por separado: ya está integrado.

| Pieza | Qué es | Para qué la usamos |
|---|---|---|
| **Cloudflare Pages** | Hosting de sitios estáticos (como GitHub Pages). | Sirve el HTML/CSS/JS de la tienda. |
| **Pages Functions** | Pequeñas funciones de backend que corren junto a Pages, sin configurar servidor. | Aquí vive nuestra API (`/api/productos`, `/api/crear-sesion`, etc). |
| **Hono** | Un framework para escribir APIs en Workers, muy parecido a Express pero adaptado a Cloudflare. | Organiza las rutas del backend. |
| **D1** | Base de datos SQLite "serverless" de Cloudflare. Gratis hasta 5 GB. | Guarda productos, stock, pedidos. |
| **Stripe Checkout** | Página de pago alojada por Stripe (lo mismo que usamos en Anakatana). | Cobrar. |
| **wrangler** | La CLI oficial de Cloudflare. La usas desde la terminal para crear la DB, levantar el entorno local y desplegar. | Herramienta de desarrollo. |

**Dos diferencias grandes respecto a Anakatana:**

- Ya **no hay** una carpeta `server/` con Express. Todo lo que era `index.js` del backend está ahora en un único archivo: [`functions/api/[[route]].js`](functions/api/%5B%5Broute%5D%5D.js). La sintaxis cambia un poco pero la lógica es la misma.
- Ya **no hay** `productos.json` ni `registro.json` versionados en git. Todo eso vive ahora en D1 (SQLite). Para arrancar con datos de ejemplo hay un `seed.sql`.

---

## 2. Requisitos previos

Tienes que tener instalado / tener cuenta:

- **Node.js 18+** — probablemente ya lo tienes. Comprueba con `node -v`.
- **Git** y el CLI `gh` de GitHub — también los usamos en Anakatana.
- **Cuenta en Cloudflare** (gratis) — https://dash.cloudflare.com/sign-up
- **Cuenta en Stripe** (gratis) — https://dashboard.stripe.com/register. Tendrás dos modos: *test* (para probar) y *live* (para cobrar de verdad).
- **Stripe CLI** (opcional pero recomendado) — para probar los webhooks en local. `brew install stripe/stripe-cli/stripe`.

No hace falta que instales `wrangler` globalmente: viene como dependencia del proyecto y se ejecuta con `npx wrangler ...` o vía los scripts de `npm`.

---

## 3. Primera tienda: de cero a viva, paso a paso

Imaginemos que vas a montar la tienda para un cliente nuevo llamado **"elcliente"**.

### Paso 3.1 — Crear un repo nuevo a partir de esta semilla

La semilla vive en `meowrhino/semillaEcommerce`. Para cada tienda nueva creas **un repo aparte** usando esta como template. De esta forma el código de ese cliente no contamina la semilla, y si mejoras la semilla más adelante, los cambios no pisan el cliente antiguo.

Opción A, desde la web de GitHub: ve a https://github.com/meowrhino/semillaEcommerce, botón verde "Use this template" → "Create a new repository".

Opción B, desde terminal:
```bash
gh repo create meowrhino/tienda-elcliente --public \
  --template meowrhino/semillaEcommerce \
  --clone
cd tienda-elcliente
```

A partir de aquí todas las instrucciones son dentro de la carpeta del nuevo repo.

### Paso 3.2 — Instalar dependencias

```bash
npm install
```

Esto baja `hono`, `stripe` y `wrangler`. Se crea `node_modules/` (ya está en `.gitignore`).

### Paso 3.3 — Loguearte en Cloudflare desde la terminal

```bash
npx wrangler login
```

Se abre el navegador, aceptas, vuelves a la terminal. Solo hace falta hacerlo una vez por máquina. Luego `wrangler` ya habla con tu cuenta.

### Paso 3.4 — Crear la base de datos D1

```bash
npx wrangler d1 create shop
```

Te devuelve un bloque parecido a esto:

```
✅ Successfully created DB 'shop'
[[d1_databases]]
binding = "DB"
database_name = "shop"
database_id = "abc123-def456-..."
```

**Copia ese `database_id`** y pégalo en [`wrangler.toml`](wrangler.toml), en la línea que pone `database_id = "PEGA_AQUI_EL_ID_DEVUELTO_POR_D1_CREATE"`. Queda así:

```toml
[[d1_databases]]
binding = "DB"
database_name = "shop"
database_id = "abc123-def456-..."
```

### Paso 3.5 — Crear las tablas y meter datos de ejemplo

Hay dos entornos: **local** (una SQLite que vive en tu máquina dentro de `.wrangler/`) y **remoto** (la D1 real en Cloudflare). Queremos preparar los dos.

```bash
# Local (para probar en tu ordenador):
npm run db:init:local     # crea las tablas
npm run db:seed:local     # mete productos y envíos de ejemplo

# Remoto (el que usará la tienda en producción):
npm run db:init           # crea las tablas en la D1 real
npm run db:seed           # (opcional) mete los mismos datos de ejemplo
```

Si quieres ver que funcionó:
```bash
npx wrangler d1 execute shop --local --command="SELECT id, nombre, precio FROM productos"
```

### Paso 3.6 — Configurar los secretos locales

Los **secretos** (claves de Stripe, token de admin) nunca van al repo. En local los ponemos en `.dev.vars` (ignorado por git). En producción los pondremos en Cloudflare directamente.

```bash
cp .dev.vars.example .dev.vars
```

Ahora abre `.dev.vars` y rellena:

```
STRIPE_SECRET_KEY="sk_test_XXXX"         # de Stripe dashboard → Developers → API keys (modo test)
STRIPE_WEBHOOK_SECRET="whsec_XXXX"       # de `stripe listen` (ver paso 3.8)
ADMIN_TOKEN="loquequieras"               # invéntate uno largo
```

Para conseguir `STRIPE_SECRET_KEY`: https://dashboard.stripe.com/test/apikeys → "Secret key" → "Reveal". Empieza por `sk_test_...` mientras estés en modo test.

### Paso 3.7 — Levantar el entorno local

```bash
npm run dev
```

Eso arranca `wrangler pages dev`. Verás algo tipo:

```
⎔ Starting local server...
[wrangler:inf] Ready on http://localhost:8788
```

Abre **http://localhost:8788** y deberías ver la home con los 2 productos de ejemplo. El admin está en **http://localhost:8788/admin/**.

Mientras `wrangler dev` esté corriendo, también tienes el backend en `http://localhost:8788/api/*`. Puedes probar:

```bash
curl http://localhost:8788/api/productos
```

### Paso 3.8 — Probar pagos de Stripe en local (opcional pero recomendado)

Cuando alguien paga, Stripe envía un *webhook* a tu backend para confirmarlo. En local necesitas un puente. Abre **otra terminal** (deja `npm run dev` corriendo):

```bash
stripe login
stripe listen --forward-to http://localhost:8788/api/stripe-webhook
```

`stripe listen` imprime una línea así:
```
> Ready! Your webhook signing secret is whsec_XXXXXXX (^C to quit)
```

**Copia ese `whsec_...`** y ponlo en `.dev.vars` como `STRIPE_WEBHOOK_SECRET`. Reinicia `npm run dev` para que cargue el nuevo secreto.

Ahora puedes hacer un pago de prueba en la tienda con la tarjeta de test **4242 4242 4242 4242**, cualquier CVC, cualquier fecha futura. Verás en la consola de `npm run dev` algo como `[webhook] pedido ord_... registrado` y en el admin (`/admin/tickets.html`) el pedido nuevo.

### Paso 3.9 — Conectar el repo a Cloudflare Pages (deploy)

Ya funciona en local. Toca publicarlo.

1. Entra en https://dash.cloudflare.com → **Workers & Pages** → **Create application** → pestaña **Pages** → **Connect to Git**.
2. Autoriza GitHub si es la primera vez, y selecciona el repo `meowrhino/tienda-elcliente`.
3. En la configuración:
   - **Production branch**: `master`
   - **Framework preset**: *None*
   - **Build command**: *(dejar vacío)*
   - **Build output directory**: `/`
4. Botón **Save and Deploy**. Tarda ~30 s. Te queda en una URL tipo `https://tienda-elcliente.pages.dev`.

A partir de ahora, cada `git push origin master` redespliega automáticamente.

### Paso 3.10 — Enlazar la D1 al sitio desplegado

El sitio ya está online, pero todavía no puede hablar con D1 ni tiene las claves de Stripe. Hay que atarlo todo.

En el dashboard de Cloudflare, dentro de tu proyecto de Pages:

- **Settings** → **Functions** → **D1 database bindings** → **Add binding**.
  - Variable name: `DB`
  - D1 database: `shop`
  - Guardar.

### Paso 3.11 — Añadir los secretos de producción

Dentro del mismo proyecto de Pages:

- **Settings** → **Environment variables** → sección **Production** → **Add variable**.

Añade cada uno **como "Encrypted"** (así quedan cifrados):

| Variable | Valor |
|---|---|
| `STRIPE_SECRET_KEY` | La *live* de Stripe (empieza por `sk_live_...`) cuando vayas a cobrar de verdad, o `sk_test_...` si sigues en test. |
| `STRIPE_WEBHOOK_SECRET` | El que te dará Stripe al configurar el webhook (paso 3.13). |
| `ADMIN_TOKEN` | Un string largo inventado. Será lo que metas en `/admin/` en el navegador. |
| `FRONTEND_URL` | La URL final de la tienda, p.ej. `https://tutienda.com` o `https://tienda-elcliente.pages.dev`. Se usa para los `success_url`/`cancel_url` de Stripe. |

Tras añadirlos, ve a **Deployments** y vuelve a lanzar el último deploy con "Retry deployment" para que los coja.

### Paso 3.12 — Configurar el dominio del cliente

Si el cliente ya tiene el dominio en Cloudflare (lo habitual):

- **Custom domains** → **Set up a custom domain** → escribe `tutienda.com` → siguiente.
- Cloudflare crea el CNAME y activa HTTPS automáticamente. En 1-2 minutos está listo.

Si el dominio no está en Cloudflare:
- Migra los nameservers del dominio a Cloudflare (es gratis, 5 min).
- Luego repite el paso anterior.

Acuérdate de actualizar `FRONTEND_URL` para que apunte al dominio definitivo.

### Paso 3.13 — Configurar el webhook de Stripe en producción

En el dashboard de Stripe, **con el modo en el que estés trabajando** (test o live):

- **Developers** → **Webhooks** → **Add endpoint**.
- **Endpoint URL**: `https://tutienda.com/api/stripe-webhook`
- **Events to send**: selecciona `checkout.session.completed`.
- Guarda. Stripe te da un "Signing secret" (`whsec_...`).
- Vuelve a Cloudflare → Pages → Settings → Environment variables → edita `STRIPE_WEBHOOK_SECRET` con ese valor.
- Relanza el deploy.

### Paso 3.14 — Rellenar el catálogo real del cliente

Borra los productos de ejemplo y mete los reales. Edita [`data/seed.sql`](data/seed.sql):

```sql
DELETE FROM productos;
DELETE FROM stock_variantes;

INSERT INTO productos (id, nombre, descripcion, precio, img) VALUES
  ('camiseta-azul', 'Camiseta azul', 'Algodón orgánico', 24.90, '/img/camiseta-azul.jpg'),
  ...;

INSERT INTO stock_variantes (producto_id, talla, cantidad) VALUES
  ('camiseta-azul', 'S', 5),
  ('camiseta-azul', 'M', 8),
  ...;
```

Y lo aplicas a la DB remota:
```bash
npm run db:seed    # ejecuta seed.sql en la D1 de producción
```

(También puedes gestionar stock desde `/admin/stock.html` sin tocar SQL.)

### Paso 3.15 — Pintar la marca

- [`css/styles.css`](css/styles.css) está vacío de marca aposta, con variables CSS neutras. Cambia colores, fuentes, etc.
- [`js/config.js`](js/config.js): ajusta `TIENDA_NOMBRE`.
- Pon el logo y las imágenes de producto en `/img/` y referéncialas desde `seed.sql`.
- Ajusta los textos de [`index.html`](index.html), [`about.html`](about.html) (si la creas), etc.

A cada `git push` se redespliega solo.

Cuando estés listo para cobrar de verdad, pasa Stripe a modo **live** y mete la `sk_live_...` en Cloudflare.

---

## 4. Día a día trabajando en local

Una vez hecho el setup inicial, tu loop diario es:

```bash
npm run dev                                           # levanta todo
stripe listen --forward-to http://localhost:8788/api/stripe-webhook    # si tocas el flujo de pago
```

Cambias HTML/CSS/JS → recargas navegador. Cambias `functions/api/[[route]].js` → wrangler reinicia solo.

Para resetear la DB local (dev destructivo):
```bash
npm run db:init:local    # borra y recrea tablas
npm run db:seed:local    # remete los datos de ejemplo
```

---

## 5. Gestionar la tienda ya desplegada

### Ver pedidos
- Con navegador: `https://tutienda.com/admin/` → mete el `ADMIN_TOKEN` → **Historial**.
- Con SQL directo: `npx wrangler d1 execute shop --command="SELECT * FROM pedidos ORDER BY created_at DESC LIMIT 20"`.

### Cambiar stock
- Con navegador: `https://tutienda.com/admin/stock.html`.
- O editando `seed.sql` y reaplicando con `npm run db:seed` (ojo, el seed actual borra y reinserta).

### Añadir productos nuevos sin tocar código
Por ahora hay que hacer `INSERT` directo en D1 o usar `/admin/stock.html`. Si queremos una UI de admin para crear productos se añade sobre lo mismo; díselo y lo montamos.

### Ver logs y errores en producción
- Cloudflare dashboard → Pages → tu proyecto → **Functions** → **Real-time logs**.
- O desde CLI: `npx wrangler pages deployment tail`.

---

## 6. Mapa del repo

```
semillaEcommerce/
├─ index.html                        # Home (catálogo)
├─ producto.html                     # Detalle de producto
├─ checkout.html                     # Carrito antes de Stripe
├─ gracias.html                      # Post-pago OK
├─ sorry.html                        # Pago cancelado
├─ admin/
│  ├─ index.html                     # Guardar el ADMIN_TOKEN
│  ├─ tickets.html                   # Ver pedidos
│  └─ stock.html                     # Ajustar stock
├─ css/styles.css                    # Base neutra
├─ js/
│  ├─ config.js                      # API_BASE = "/api" (mismo origen)
│  ├─ app.js                         # Carrito en localStorage
│  ├─ home.js, producto.js, checkout.js
├─ functions/
│  └─ api/[[route]].js               # TODA la lógica del backend (Hono)
├─ data/
│  ├─ schema.sql                     # Tablas de D1
│  └─ seed.sql                       # Datos de ejemplo
├─ wrangler.toml                     # Config Cloudflare (enlaza D1, flags)
├─ package.json                      # Dependencias + scripts npm
└─ .dev.vars.example                 # Plantilla de secretos locales
```

---

## 7. Endpoints de la API

Todos viven en `/api/*`. Como el front está en el mismo dominio, no hay CORS.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/health` | Dice si el backend está vivo y con qué runtime. Útil para verificar deploys. |
| GET | `/api/productos` | Lista productos activos con stock por talla. |
| GET | `/api/productos/:id` | Detalle de un producto. |
| GET | `/api/envios` | Zonas y tarifas. |
| POST | `/api/crear-sesion` | Recibe `{ carrito, envio }`, valida stock y crea una sesión de Stripe Checkout. |
| POST | `/api/stripe-webhook` | Lo llama Stripe. Verifica firma → baja stock → inserta pedido. |
| GET | `/api/admin/historial?limit=100` | (Bearer) Lista pedidos. |
| POST | `/api/admin/stock-bulk` | (Bearer) Actualiza stock en masa. |

Rutas `/admin/*` requieren header `Authorization: Bearer <ADMIN_TOKEN>`.

---

## 8. Problemas comunes

**"Error: D1_ERROR: no such table: productos"**
No aplicaste el schema. Ejecuta `npm run db:init:local` (o `:init` si es producción).

**"Webhook signature failed"**
El `STRIPE_WEBHOOK_SECRET` no coincide. Si es en local, relánzalo desde `stripe listen` y copia de nuevo. Si es producción, en el dashboard de Stripe → Webhooks → tu endpoint → "Reveal signing secret" y actualízalo en Cloudflare.

**"No se pudo crear la sesión"**
Revisa `STRIPE_SECRET_KEY`. En modo test empieza por `sk_test_`, en live por `sk_live_`. Si mezclas test y live (sk_test_ con un webhook de live) falla silencioso.

**"unauthorized" en el admin**
El navegador no guardó el token, o está mal. Abre `/admin/`, borra y vuelve a guardar. O en DevTools Console: `localStorage.getItem("semilla.admin")`.

**Cambios en `.dev.vars` no se aplican**
Hay que reiniciar `npm run dev`. No hay hot-reload para secretos.

**Después de un deploy las variables parecen ignoradas**
Cloudflare Pages solo coge las env vars en el momento del build. Tras añadir/editar una var en el dashboard hay que **relanzar el deploy** (Deployments → ⋯ → Retry deployment).

**"npm run dev" dice que no encuentra wrangler**
¿Hiciste `npm install`? Si sí, borra `node_modules/` y `package-lock.json` y vuelve a instalar.

---

## 9. Rescatar la versión Node/Render anterior

La versión antigua (Express + JSON en GitHub + Render) está congelada en esta rama/tag:

```bash
git checkout legacy/node-render
# o por tag:
git checkout v0.1-node-render
```

Úsala solo si un cliente no puede/no quiere Cloudflare. El README de esa rama explica cómo desplegarla.

---

## Licencia

MIT recomendada. Al ser una semilla reutilizable, mantenla permisiva.
