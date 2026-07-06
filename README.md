# semillaEcommerce

Plantilla para montar un ecommerce pequeño desde cero, diseñada con filosofía **JAMstack**: el catálogo vive en un archivo de texto que se edita con un editor y se publica con un `git push`. Todo corre en **Cloudflare gratis**: web, backend, base de datos y dominio, bajo la misma cuenta.

Este README está escrito pensando en que **no has tocado Cloudflare Pages ni D1 antes**. Te lleva paso a paso desde clonar el repo hasta tener una tienda viva con pagos reales.

---

## Tabla de contenidos

1. [La filosofía: editar un archivo, hacer push](#1-la-filosofía-editar-un-archivo-hacer-push)
2. [Qué tecnologías hay aquí y por qué](#2-qué-tecnologías-hay-aquí-y-por-qué)
3. [Requisitos previos](#3-requisitos-previos)
4. [Primera tienda: de cero a viva, paso a paso](#4-primera-tienda-de-cero-a-viva-paso-a-paso)
5. [Añadir, editar o quitar productos (día a día)](#5-añadir-editar-o-quitar-productos-día-a-día)
6. [Día a día trabajando en local](#6-día-a-día-trabajando-en-local)
7. [Gestionar la tienda ya desplegada](#7-gestionar-la-tienda-ya-desplegada)
8. [Mapa del repo](#8-mapa-del-repo)
9. [Endpoints de la API](#9-endpoints-de-la-api)
10. [Problemas comunes](#10-problemas-comunes)
11. [Rescatar la versión Node/Render anterior](#11-rescatar-la-versión-noderender-anterior)

---

## 1. La filosofía: editar un archivo, hacer push

Toda la información que se describe con texto (catálogo, zonas de envío, descripciones, precios, imágenes asociadas) vive en **archivos JSON dentro del repo**. No hay panel web para darle de alta a un producto: editas el archivo, haces commit, pusheas. Cloudflare redespliega sola y la tienda sale online con el cambio.

Los archivos editables son:

- [`data/productos.json`](data/productos.json) — el catálogo completo.
- [`data/envios.json`](data/envios.json) — zonas y tarifas.

La **base de datos** (D1) sólo guarda lo que realmente cambia en caliente y no podrías mantener a mano:

- **stock** — bajan los números con cada venta.
- **pedidos** — historial de compras confirmadas.

Esto significa que:

- El precio/nombre/descripción de un producto **siempre** es lo que dice el JSON del commit desplegado. El cliente final no puede manipular precios desde el navegador (el backend revalida todo).
- Añadir un producto son **2 acciones**: editar un JSON y poner la imagen en `/img/`.
- La home y las fichas de producto leen el catálogo directamente del JSON (no llaman a la API para listarlo) → se pueden **previsualizar con cualquier servidor estático** sin levantar las Functions. Perfecto para maquetar.
- Puedes hacer `git blame` sobre el catálogo y ver quién cambió qué y cuándo.
- Si rompes algo con una edición mala, `git revert` y listo.

---

## 2. Qué tecnologías hay aquí y por qué

Piensa en Cloudflare como "Render + GitHub Pages + SQLite + DNS, todo junto bajo un mismo login".

| Pieza | Qué es | Para qué la usamos |
|---|---|---|
| **Cloudflare Workers** (con *static assets*) | Plataforma serverless. Un único Worker sirve la web estática (`public/`) **y** la API. | Sirve el HTML/CSS/JS de `public/` y ejecuta el backend en `/api/*`. |
| **Hono** | Framework para escribir APIs en Workers, muy parecido a Express. | Organiza las rutas del backend (`src/index.js`). |
| **D1** | Base de datos SQLite "serverless" de Cloudflare. Gratis hasta 5 GB. | Guarda stock y pedidos (NO el catálogo). |
| **Stripe Checkout** | Página de pago alojada por Stripe. | Cobrar. |
| **wrangler** | CLI oficial de Cloudflare. | Crear la DB, levantar dev local, desplegar. |

---

## 3. Requisitos previos

Necesitas:

- **Node.js 18+** (`node -v` para comprobar).
- **Git** y **gh** (CLI de GitHub).
- Cuenta en **Cloudflare** (gratis): https://dash.cloudflare.com/sign-up
- Cuenta en **Stripe** (gratis): https://dashboard.stripe.com/register
- **Stripe CLI** (opcional, para probar webhooks en local): `brew install stripe/stripe-cli/stripe`

No hace falta instalar `wrangler` global: viene como dependencia del proyecto.

---

## 4. Primera tienda: de cero a viva, paso a paso

Supongamos que la tienda nueva es para un cliente llamado **elcliente**.

### 4.1 — Crear un repo a partir de esta semilla

Cada tienda es un repo independiente, para no mezclar código entre clientes.

Desde la web de GitHub: https://github.com/meowrhino/semillaEcommerce → botón **Use this template** → **Create a new repository**.

O desde terminal:
```bash
gh repo create meowrhino/tienda-elcliente --public \
  --template meowrhino/semillaEcommerce \
  --clone
cd tienda-elcliente
```

### 4.2 — Instalar dependencias

```bash
npm install
```

### 4.3 — Login en Cloudflare

```bash
npx wrangler login
```

Se abre el navegador, aceptas, vuelves a la terminal. Una sola vez por máquina.

### 4.4 — Crear la base de datos D1

```bash
npx wrangler d1 create shop
```

Te devuelve algo así:

```
✅ Successfully created DB 'shop'
[[d1_databases]]
binding = "DB"
database_name = "shop"
database_id = "abc123-def456-..."
```

**Copia ese `database_id`** y pégalo en [`wrangler.toml`](wrangler.toml) donde pone `database_id = "PEGA_AQUI_..."`.

### 4.5 — Crear las tablas

La base de datos tiene dos: `stock` y `pedidos`. No hay tabla de productos — el catálogo es el JSON.

```bash
# Local (una SQLite en tu máquina, para desarrollo):
npm run db:init:local

# Remoto (la D1 real en Cloudflare, producción):
npm run db:init
```

No hay paso de "seed": el stock se inicializa solo la primera vez que la tienda recibe una petición, leyendo `stockInicial` de cada producto en `productos.json`.

### 4.6 — Secretos locales

Los secretos no van al repo. En local los ponemos en `.dev.vars` (ignorado por git).

```bash
cp .dev.vars.example .dev.vars
```

Edita `.dev.vars` y rellena:
```
STRIPE_SECRET_KEY="sk_test_XXXX"
STRIPE_WEBHOOK_SECRET="whsec_XXXX"
ADMIN_TOKEN="inventate-uno-largo"
```

Consigue `STRIPE_SECRET_KEY` en https://dashboard.stripe.com/test/apikeys → **Secret key** → **Reveal**. Empieza por `sk_test_`.

### 4.7 — Levantar el entorno local

```bash
npm run dev
```

Imprime `Ready on http://localhost:8788`. Abre esa URL: ves la home con los 2 productos demo. El admin está en `/admin/`.

### 4.8 — Probar webhooks de Stripe en local (recomendado)

En otra terminal:
```bash
stripe login
stripe listen --forward-to http://localhost:8788/api/stripe-webhook
```

Te imprime un `whsec_...`. Ponlo como `STRIPE_WEBHOOK_SECRET` en `.dev.vars` y reinicia `npm run dev`.

Prueba un pago con tarjeta **4242 4242 4242 4242**, cualquier fecha futura, cualquier CVC. Verás el pedido en `/admin/tickets.html`.

### 4.9 — Desplegar el Worker

La D1 ya está enlazada por `wrangler.toml` (el binding `DB` y el `database_id` del paso 4.4). Despliega:

```bash
npm run deploy      # = npx wrangler deploy
```

Sube `src/index.js` + los assets de `public/`. Te devuelve la URL `https://semilla-ecommerce.<tu-subdominio>.workers.dev`.

**Opción (recomendada): auto-deploy desde GitHub.** Dashboard → el Worker → **Settings → Builds → Connect** al repo (rama `master`). A partir de ahí cada `git push` despliega solo, sin tocar la CLI.

### 4.10 — Secretos de producción

Se añaden por CLI (NO van al repo):

```bash
npx wrangler secret put STRIPE_SECRET_KEY      # sk_test_... o sk_live_...
npx wrangler secret put STRIPE_WEBHOOK_SECRET   # whsec_... (paso 4.13)
npx wrangler secret put ADMIN_TOKEN             # string largo, para entrar en /admin/
```

`FRONTEND_URL` es opcional: si lo dejas vacío, el Worker usa el origen de cada petición (funciona
igual con el dominio `.workers.dev` que con el dominio propio).

### 4.11 — Dominio del cliente

Dashboard → el Worker → **Settings → Domains & Routes → Add → Custom domain** → escribe `tutienda.com`. Si el DNS ya está en Cloudflare (lo normal), HTTPS automático en 1-2 min.

### 4.12 — Configurar Stripe desde el dashboard (sin tocar código)

El Worker no fija métodos de pago ni cupones: todo eso se gestiona en el dashboard de Stripe
y aparece solo en el checkout.

- **Métodos de pago** (Settings → Payment methods): tarjeta + Apple/Google Pay vienen de serie.
  Activa **Bizum** (imprescindible vendiendo en España), PayPal, Klarna… sin redeploy.
- **Cupones** (Products → Coupons → crea el cupón → Promotion codes): códigos con %, importe fijo,
  caducidad o límite de usos. El checkout ya muestra el campo "¿tienes un código?"
  (`allow_promotion_codes` está activado).
- **Recibos por email** (Settings → Emails): activa "Successful payments" (solo funciona en live).
- **IVA:** no se calcula ni se desglosa. B2C en España = el precio del JSON es el precio final,
  IVA incluido (lo estándar y legal). Solo si un cliente superara los 10.000 €/año en ventas a
  otros países UE (régimen OSS) haría falta activar **Stripe Tax** — es un parámetro más en la
  sesión, no un rediseño.

### 4.13 — Webhook de Stripe en producción

Stripe dashboard → **Developers** → **Webhooks** → **Add endpoint**:
- URL: `https://tutienda.com/api/stripe-webhook`
- Evento mínimo: `checkout.session.completed`
- Copia el **Signing secret** y actualiza `STRIPE_WEBHOOK_SECRET` en Cloudflare.
- Relanza el deploy.

### 4.14 — Rellenar el catálogo real

Ver sección siguiente.

### 4.15 — Pintar la marca

- [`public/css/styles.css`](public/css/styles.css) está neutro a propósito. Pinta colores, fuentes, espacios.
- [`public/js/core/config.js`](public/js/core/config.js): ajusta `TIENDA_NOMBRE` y `LANGS` (idiomas).
- Textos de UI traducibles en `public/js/core/i18n.js`.

---

## 5. Añadir, editar o quitar productos (día a día)

### Añadir un producto

1. Pon las imágenes en `public/img/` (p.ej. `public/img/taza-azul/1.jpg`).
2. Abre [`public/data/productos.json`](public/data/productos.json) y añade un objeto:

```json
{
  "id": "taza-azul",
  "nombre": "Taza cerámica azul",
  "descripcion": "Cerámica esmaltada. 350 ml.",
  "precio": 14.90,
  "peso": 350,
  "imgs": ["img/taza-azul/1.jpg", "img/taza-azul/2.jpg"],
  "stockInicial": 20
}
```

- `imgs` es un **array**: con varias imágenes la ficha muestra visor `< >` + miniaturas. (También
  vale `"img": "ruta"` para una sola.)
- `peso` (en **gramos**) es opcional, solo para el envío por peso. Si no lo pones, cuenta como 0.
- `nombre` y `descripcion` admiten **texto plano** o, si usas multi-idioma, un objeto `{es:"…", en:"…"}`.

3. Si tiene tallas, `stockInicial` es un objeto:
```json
"stockInicial": { "S": 5, "M": 8, "L": 3 }
```

4. `git add . && git commit -m "add: taza azul" && git push`.

Cloudflare redespliega en ~30s. La primera petición tras el deploy inicializa el stock del producto nuevo en D1 (usando `stockInicial`). A partir de ahí, D1 manda sobre el stock — `stockInicial` ya no se vuelve a leer para ese producto.

### Editar precio / descripción / imagen

Editar el JSON y `git push`. Se aplica al instante tras el deploy.

### Ocultar temporalmente un producto

Añade `"activo": false`:
```json
{ "id": "taza-azul", ..., "activo": false }
```

Desaparece del catálogo y no se puede comprar, pero el stock se conserva para cuando lo reactives.

### Borrar un producto

Quítalo del JSON. El stock y los pedidos históricos permanecen en D1 (puedes limpiarlos manualmente si quieres).

### Editar el stock actual

**NO** toques `stockInicial` del JSON (solo se usa la primera vez). Edita el stock vivo desde `/admin/stock.html` en la tienda desplegada — ver sección 7.

### Añadir una zona de envío

Edita [`data/envios.json`](data/envios.json) y haz push. Cada zona admite **dos formatos**:

```json
[
  { "zona": "peninsula", "precio": 4.90 },
  { "zona": "internacional", "tramos": [
    { "hasta": 500,    "precio": 7.00 },
    { "hasta": 2000,   "precio": 12.00 },
    { "hasta": 100000, "precio": 22.00 }
  ] }
]
```

- **Tarifa plana:** `{ "zona": "x", "precio": 4.90 }`.
- **Por peso:** `{ "zona": "x", "tramos": [ { "hasta": <gramos>, "precio": <€> }, ... ] }`. Se suma el
  `peso` (gramos) × cantidad de todo el carrito y se aplica el primer tramo cuyo `hasta` lo cubra.

Campos opcionales por zona:

- `"nombre"`: etiqueta que ve el comprador (string u objeto i18n `{es, en}`). Sin él, se usa el id.
- `"paises"`: lista ISO de países que Stripe acepta como dirección de envío para esa zona
  (p.ej. `["ES"]` para península). Sin él, se permiten todos → útil para "internacional".
  Así nadie paga envío de península con dirección de Berlín.
- `"recogida": true`: la zona es recogida en mano → no se pide dirección ni se cobra envío.

El backend **recalcula** el precio del envío (nunca se fía del cliente), igual que con el precio de
los productos, y lo pasa a Stripe como envío de verdad (`shipping_options`), no como un producto más.

---

## 6. Día a día trabajando en local

### Modo completo (con Functions, D1, Stripe)

```bash
npm run dev                                      # levanta todo en http://localhost:8788
stripe listen --forward-to http://localhost:8788/api/stripe-webhook   # si tocas el flujo de pago
```

Cambias HTML/CSS/JS o `functions/api/[[route]].js` o `data/*.json` → wrangler reinicia solo (el JSON se re-bundlea al arrancar la función).

Resetear la DB local:
```bash
npx wrangler d1 execute shop --local --command="DROP TABLE stock; DROP TABLE pedidos;"
npm run db:init:local
```

### Modo "solo maquetación" (sin Functions)

Si solo quieres trabajar CSS / HTML / maquetación y no te interesa Stripe ni admin, abre la tienda con cualquier servidor estático:

```bash
node serve.mjs          # servidor estático incluido → http://localhost:8123
# o
npx serve .
# o
python3 -m http.server 8000
```

Funciona porque:
- La home y las fichas leen el catálogo directamente de [`data/productos.json`](data/productos.json).
- Como `stock` vivo no está disponible, se usa el `stockInicial` declarado en el JSON (suficiente para previsualizar).
- El botón de pagar fallará porque llama a `/api/crear-sesion` (eso sí requiere el Worker: `npm run dev`).

Útil para iterar diseño sin tener que arrancar `wrangler`.

---

## 7. Gestionar la tienda ya desplegada

### Ver y gestionar pedidos
- Navegador: `https://tutienda.com/admin/` → meter `ADMIN_TOKEN` → **Historial**. Cada pedido
  muestra email, items, **zona + dirección de envío** (la que el comprador puso en Stripe) y un
  selector de **estado** (`pendiente → enviado → entregado / cancelado`) que se guarda solo.
- CLI: `npx wrangler d1 execute shop --command="SELECT * FROM pedidos ORDER BY created_at DESC LIMIT 20"`.

### Copia de seguridad de la base (recomendado)
D1 tiene *Time Travel* (restaura hasta 30 días atrás), pero no protege contra borrar la base
entera desde el dashboard. Exporta de vez en cuando:
```bash
npx wrangler d1 export shop --remote --output=backup-$(date +%F).sql
```

### Cambiar stock
- Navegador: `https://tutienda.com/admin/stock.html`.
- Lee los productos de `productos.json`, los números muestran el stock actual de D1. Editas y guardas.

### Ver logs en producción
- Cloudflare dashboard → el Worker → **Logs** (Real-time logs).
- CLI: `npx wrangler tail`.

---

## 8. Mapa del repo

```
semillaEcommerce/
├─ public/                     # ← LA WEB (Cloudflare la sirve como static assets)
│  ├─ index.html · producto.html · checkout.html · gracias.html · sorry.html
│  ├─ newsletter.html · contacto.html        # features opcionales
│  ├─ css/styles.css           # Base neutra
│  ├─ js/
│  │  ├─ core/                 # config · i18n · data · cart · ui · layout  (módulos compartidos)
│  │  └─ pages/                # un módulo ES por página (home, producto, checkout, …)
│  ├─ admin/                   # index (token) · tickets · stock · newsletter · mensajes
│  ├─ img/                     # Imágenes de producto
│  └─ data/
│     ├─ productos.json        # ← CATÁLOGO (edítame)
│     ├─ envios.json           # ← ZONAS Y TARIFAS (edítame)
│     └─ schema.sql            # Tablas de D1 (stock · pedidos · newsletter · mensajes)
├─ src/index.js                # ← EL WORKER (Hono + D1 + Stripe). Solo /api/*
├─ serve.mjs                   # Preview estático local (sirve public/)
├─ wrangler.toml               # Config: main, [assets] directory=public, binding D1
├─ package.json                # Deps + scripts npm
└─ .dev.vars.example           # Plantilla de secretos locales
```

La web usa **ES modules**: cada HTML carga un único `<script type="module" src="js/pages/X.js">`,
que importa lo que necesita de `js/core/`. Por eso el preview necesita un **servidor** (`node serve.mjs`,
`npx serve .` o `npm run dev`) — ya no vale abrir el HTML con `file://`.

### Features opcionales (módulos)

- **Multi-idioma (i18n).** En [`public/js/core/config.js`](public/js/core/config.js) pon los idiomas
  en `LANGS` (p.ej. `["es","en"]`); el primero es el de por defecto y con uno solo el selector se
  oculta. Traduce los textos de UI en `public/js/core/i18n.js` (`STRINGS`) y, en los JSON, usa objetos
  `{es:"…", en:"…"}` en los campos que quieras traducir (`nombre`, `descripcion`). Lo que dejes como
  texto plano sale igual en todos los idiomas.
- **Newsletter y contacto.** Páginas `newsletter.html` / `contacto.html`, endpoints
  `POST /api/newsletter` y `/api/contacto`, y vistas en `/admin/`. Para quitarlas: borra esas páginas
  y sus módulos en `js/pages/`, sus enlaces en `js/core/layout.js` (`NAV`), los endpoints en
  `src/index.js` y, si quieres, las tablas `newsletter`/`mensajes`.
- **Galería multi-imagen.** Pon varias rutas en `"imgs": [...]` de un producto → visor `< >` +
  miniaturas. Con una sola imagen no hay miniaturas.
- **Tallas, envío por peso, toast "añadido", cantidad editable y transiciones de página** ya vienen
  integrados.

---

## 9. Endpoints de la API

Todos bajo `/api/*`. Como frontend y backend viven en el mismo dominio, no hay CORS.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/health` | Estado + nº de productos cargados. |
| GET | `/api/productos` | Catálogo activo (leído del JSON) con stock actual (de D1). |
| GET | `/api/productos/:id` | Detalle de un producto. |
| GET | `/api/envios` | Zonas y tarifas (leído del JSON). |
| GET | `/api/stock` | `{ [id]: { [talla]: cantidad } }`. Stock vivo. Se usa para enriquecer el catálogo estático que el front lee de `data/productos.json`. |
| POST | `/api/crear-sesion` | Recibe `{ carrito, envio }`. Revalida precio/nombre contra JSON y stock contra D1. Crea sesión Stripe (caduca a los 30 min; envío como `shipping_options`; cupones activados). |
| GET | `/api/session-status?session_id=…` | Estado de una sesión (lo usa `gracias.html` para verificar el pago antes de vaciar el carrito). |
| POST | `/api/stripe-webhook` | Lo llama Stripe. Verifica firma → baja stock → inserta pedido (con zona, dirección y estado). |
| POST | `/api/newsletter` | (opcional) Guarda un email en la tabla `newsletter`. |
| POST | `/api/contacto` | (opcional) Guarda un mensaje en la tabla `mensajes`. |
| GET | `/api/admin/historial?limit=100` | (Bearer) Lista pedidos (items, zona, dirección, estado). |
| POST | `/api/admin/pedido-estado` | (Bearer) `{ id, estado }` → pendiente / enviado / entregado / cancelado. |
| POST | `/api/admin/stock-bulk` | (Bearer) Actualiza stock en masa. |
| GET | `/api/admin/newsletter` | (Bearer) Lista altas de newsletter. |
| GET | `/api/admin/mensajes` | (Bearer) Lista mensajes de contacto. |

---

## 10. Problemas comunes

**"D1_ERROR: no such table: stock"**
No aplicaste el schema. `npm run db:init:local` (local) o `npm run db:init` (prod).

**"Webhook signature failed"**
`STRIPE_WEBHOOK_SECRET` no coincide. Si local, relanza `stripe listen` y copia de nuevo. Si prod, dashboard Stripe → webhooks → **Reveal signing secret** y actualiza la var en Cloudflare.

**"No se pudo crear la sesión"**
Revisa `STRIPE_SECRET_KEY`. Test empieza por `sk_test_`, live por `sk_live_`. No los mezcles.

**Añadí un producto al JSON pero no aparece en la tienda.**
¿Hiciste `git push`? Mira en Cloudflare Pages → Deployments si se desplegó. A veces tarda ~30s en propagar.

**Añadí un producto pero no tiene stock disponible.**
El stock se inicializa en la primera petición tras el deploy. Refresca la home una vez y debería aparecer. Si no, revisa que `stockInicial` esté bien formado (número o objeto `{talla: cantidad}`).

**Edité `stockInicial` de un producto existente pero el stock no cambia.**
Correcto, es el comportamiento esperado: `stockInicial` solo se usa la primera vez. Para editar stock vivo, usa `/admin/stock.html`.

**"unauthorized" en el admin**
`localStorage` del navegador no tiene el token o está mal. Ve a `/admin/`, guarda de nuevo.

**Cambios en `.dev.vars` no se aplican.**
Reinicia `npm run dev`. No hay hot-reload de secretos.

**Vars nuevas en Cloudflare parecen ignoradas.**
Pages sólo coge env vars al build. Tras añadirlas, **Deployments → Retry deployment**.

---

## 11. Rescatar la versión Node/Render anterior

```bash
git checkout legacy/node-render
```
o por tag:
```bash
git checkout v0.1-node-render
```

Es el mismo código pero con Express + JSON en GitHub + Render. Útil si un cliente no puede usar Cloudflare.

---

## Licencia

MIT recomendada (plantilla reutilizable).
