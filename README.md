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
- Puedes hacer `git blame` sobre el catálogo y ver quién cambió qué y cuándo.
- Si rompes algo con una edición mala, `git revert` y listo.

---

## 2. Qué tecnologías hay aquí y por qué

Piensa en Cloudflare como "Render + GitHub Pages + SQLite + DNS, todo junto bajo un mismo login".

| Pieza | Qué es | Para qué la usamos |
|---|---|---|
| **Cloudflare Pages** | Hosting de sitios estáticos (como GitHub Pages). | Sirve el HTML/CSS/JS y los archivos de `/data/`. |
| **Pages Functions** | Pequeñas funciones de backend que corren junto a Pages, sin configurar servidor. | Aquí vive la API (`/api/productos`, `/api/crear-sesion`, etc). |
| **Hono** | Framework para escribir APIs en Workers, muy parecido a Express. | Organiza las rutas del backend. |
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

### 4.9 — Conectar el repo a Cloudflare Pages

1. https://dash.cloudflare.com → **Workers & Pages** → **Create application** → pestaña **Pages** → **Connect to Git**.
2. Autoriza GitHub, selecciona el repo.
3. Configuración:
   - **Production branch**: `master`
   - **Framework preset**: *None*
   - **Build command**: *(vacío)*
   - **Build output directory**: `/`
4. **Save and Deploy**. Tarda ~30s. URL tipo `https://tienda-elcliente.pages.dev`.

Cada `git push origin master` redespliega automáticamente.

### 4.10 — Enlazar la D1 al sitio desplegado

En tu proyecto de Pages:
- **Settings** → **Functions** → **D1 database bindings** → **Add binding**.
  - Variable name: `DB`
  - D1 database: `shop`

### 4.11 — Secretos de producción

**Settings** → **Environment variables** → sección **Production** → **Add variable** (marca **Encrypted**):

| Variable | Valor |
|---|---|
| `STRIPE_SECRET_KEY` | `sk_test_...` o `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` de Stripe (paso 4.13) |
| `ADMIN_TOKEN` | un string largo; lo meterás en `/admin/` para entrar |
| `FRONTEND_URL` | p.ej. `https://tutienda.com` o `https://tienda-elcliente.pages.dev` |

Tras añadirlos, **Deployments → Retry deployment** para que los coja.

### 4.12 — Dominio del cliente

**Custom domains** → escribe `tutienda.com` → siguiente. Si el DNS ya está en Cloudflare (lo normal), HTTPS automático en 1-2 min.

### 4.13 — Webhook de Stripe en producción

Stripe dashboard → **Developers** → **Webhooks** → **Add endpoint**:
- URL: `https://tutienda.com/api/stripe-webhook`
- Evento mínimo: `checkout.session.completed`
- Copia el **Signing secret** y actualiza `STRIPE_WEBHOOK_SECRET` en Cloudflare.
- Relanza el deploy.

### 4.14 — Rellenar el catálogo real

Ver sección siguiente.

### 4.15 — Pintar la marca

- [`css/styles.css`](css/styles.css) está neutro a propósito. Pinta colores, fuentes, espacios.
- [`js/config.js`](js/config.js): ajusta `TIENDA_NOMBRE`.
- Textos de [`index.html`](index.html) y hermanos.

---

## 5. Añadir, editar o quitar productos (día a día)

### Añadir un producto

1. Pon la imagen en `/img/` (p.ej. `/img/taza-azul.jpg`).
2. Abre [`data/productos.json`](data/productos.json) y añade un objeto:

```json
{
  "id": "taza-azul",
  "nombre": "Taza cerámica azul",
  "descripcion": "Cerámica esmaltada. 350 ml.",
  "precio": 14.90,
  "img": "/img/taza-azul.jpg",
  "stockInicial": 20
}
```

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

Edita [`data/envios.json`](data/envios.json), añade `{ "zona": "...", "precio": ... }`, push.

---

## 6. Día a día trabajando en local

```bash
npm run dev                                      # levanta todo
stripe listen --forward-to http://localhost:8788/api/stripe-webhook   # si tocas el flujo de pago
```

Cambias HTML/CSS/JS o `functions/api/[[route]].js` o `data/*.json` → wrangler reinicia solo (el JSON se re-bundlea al arrancar la función).

Resetear la DB local:
```bash
npx wrangler d1 execute shop --local --command="DROP TABLE stock; DROP TABLE pedidos;"
npm run db:init:local
```

---

## 7. Gestionar la tienda ya desplegada

### Ver pedidos
- Navegador: `https://tutienda.com/admin/` → meter `ADMIN_TOKEN` → **Historial**.
- CLI: `npx wrangler d1 execute shop --command="SELECT * FROM pedidos ORDER BY created_at DESC LIMIT 20"`.

### Cambiar stock
- Navegador: `https://tutienda.com/admin/stock.html`.
- Lee los productos de `productos.json`, los números muestran el stock actual de D1. Editas y guardas.

### Ver logs en producción
- Cloudflare dashboard → Pages → proyecto → **Functions** → **Real-time logs**.
- CLI: `npx wrangler pages deployment tail`.

---

## 8. Mapa del repo

```
semillaEcommerce/
├─ index.html                  # Home (catálogo)
├─ producto.html               # Detalle de producto
├─ checkout.html               # Carrito antes de Stripe
├─ gracias.html                # Post-pago OK
├─ sorry.html                  # Pago cancelado
├─ admin/
│  ├─ index.html               # Guardar ADMIN_TOKEN
│  ├─ tickets.html             # Ver pedidos
│  └─ stock.html               # Ajustar stock
├─ css/styles.css              # Base neutra
├─ js/
│  ├─ config.js, app.js, home.js, producto.js, checkout.js
├─ functions/
│  └─ api/[[route]].js         # Backend (Hono + D1 + Stripe)
├─ data/
│  ├─ productos.json           # ← CATÁLOGO (edítame)
│  ├─ envios.json              # ← ZONAS Y TARIFAS (edítame)
│  └─ schema.sql               # Tablas de D1 (stock + pedidos)
├─ img/                        # Imágenes de producto
├─ wrangler.toml               # Config Cloudflare
├─ package.json                # Deps + scripts npm
└─ .dev.vars.example           # Plantilla de secretos locales
```

---

## 9. Endpoints de la API

Todos bajo `/api/*`. Como frontend y backend viven en el mismo dominio, no hay CORS.

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/api/health` | Estado + nº de productos cargados. |
| GET | `/api/productos` | Catálogo activo (leído del JSON) con stock actual (de D1). |
| GET | `/api/productos/:id` | Detalle de un producto. |
| GET | `/api/envios` | Zonas y tarifas (leído del JSON). |
| POST | `/api/crear-sesion` | Recibe `{ carrito, envio }`. Revalida precio/nombre contra JSON y stock contra D1. Crea sesión Stripe. |
| POST | `/api/stripe-webhook` | Lo llama Stripe. Verifica firma → baja stock → inserta pedido. |
| GET | `/api/admin/historial?limit=100` | (Bearer) Lista pedidos. |
| POST | `/api/admin/stock-bulk` | (Bearer) Actualiza stock en masa. |

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
