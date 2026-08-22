# Desplegar GymMate

La app se queda en **Netlify**, que es donde ya está y donde vive tu historial.
Railway se añade al lado, solo como **API y coach**. No migras nada.

> Por qué importa: `localStorage` es por dominio. Todo lo que la app ha
> guardado está atado a tu URL de Netlify. Cambiar de dominio significaría
> abrir una app vacía y recuperar tu historial exportando e importando el CSV.
> No hace falta.

```
tu iPhone ──► Netlify   la PWA (HTML, JS, CSS, iconos)   ← tu data vive aquí
          └─► Railway   /api/datos, /api/coach
```

Railway detecta el proyecto solo: lee `railway.json`, construye con
`npm ci && npm run build` y arranca con `npm start`. No tocas ningún ajuste de
build.

Pones **tres variables** y, para que la copia sobreviva a los despliegues, el
plugin de Postgres.

---

## 1. Conectar el repo en Railway

Railway → **New Project** → **Deploy from GitHub repo** → `alonsix33/GymMate`.

Al terminar, **Settings → Networking → Generate Domain**. Anota esa URL: es la
de la API, no la de la app.

## 2. Las tres variables

Railway → tu servicio → **Variables**:

| Variable | Para qué | Cómo se saca |
|---|---|---|
| `GYMMATE_TOKEN` | Abre la API para ti. Sin ella el servidor responde 401 a todo y no sirve de nada; con ella, es lo único que separa tu historial de cualquiera que dé con la URL pública. | `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | Enciende el coach con modelo | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| `ORIGEN_PERMITIDO` | Deja que la PWA de Netlify hable con esta API. **Sin ella el navegador bloquea cada petición** y la app dice "no responde" con el servidor vivo. | Tu dominio de Netlify, tal cual: `https://tu-app.netlify.app` |

`ORIGEN_PERMITIDO` admite varios separados por coma, por si tienes también un
dominio propio:

```
ORIGEN_PERMITIDO=https://tu-app.netlify.app,https://gymmate.tudominio.com
```

Va el origen exacto —protocolo y host, sin barra final ni ruta—. Nunca `*`: con
el comodín, cualquier página que visites podría pedirle tu historial a este
servidor.

Opcionales: `COACH_MODELO` (por defecto `claude-sonnet-5`) y `COACH_MAX_TOKENS`
(por defecto 700). `PORT` la pone Railway; no la toques.

## 3. Dónde vive tu copia

Elige una. Si no eliges ninguna, el servicio arranca igual, pero **lo que
guardes se borra en el siguiente despliegue** y `/api/salud` te lo dice.

- **Postgres (recomendado).** Railway → **+ New** → **Database** → **Add
  PostgreSQL**. Nada más: el plugin inyecta `DATABASE_URL` y el servidor crea
  su tabla al arrancar.
- **Volumen.** Railway → tu servicio → **Volumes** → montar en `/data`.

## 4. Conectar la app

En la app: **PERFIL → Servidor**.

- **URL**: la de Railway, `https://tu-servicio.up.railway.app`.
- **Token**: el `GYMMATE_TOKEN` que pusiste arriba.

Pulsa **Conectar**. Se guarda en el teléfono y **no vuelve a pedirse**: ni
expira, ni hay sesión que renovar. Bajar una copia tampoco lo borra.

Estados que puedes ver:

- `conectado · coach con modelo` — todo listo.
- `conectado · coach en local` — falta `ANTHROPIC_API_KEY`; el coach responde
  con los datos que calcula tu teléfono y lo dice.
- `no responde` — revisa, por este orden: que `ORIGEN_PERMITIDO` sea exactamente
  tu dominio de Netlify, que la URL de Railway esté bien escrita, y que el token
  coincida. La app sigue funcionando entera sin servidor.

## 5. Comprobar que está bien

```bash
curl https://TU-APP.up.railway.app/api/salud
```

```json
{ "ok": true, "almacenamiento": "postgres", "persistente": true,
  "coach": true, "protegido": true, "avisos": [] }
```

`avisos` vacío es lo que buscas. Y para comprobar el permiso de origen, que es
lo que más falla:

```bash
curl -i -X OPTIONS https://TU-APP.up.railway.app/api/datos \
  -H 'Origin: https://tu-app.netlify.app' \
  -H 'Access-Control-Request-Method: PUT'
```

Tiene que responder `204` y traer
`Access-Control-Allow-Origin: https://tu-app.netlify.app`. Si responde `403`,
`ORIGEN_PERMITIDO` no coincide con tu dominio.

---

## Si algún día quieres un solo servicio

El servidor también sabe entregar la PWA: si la ruta no empieza por `/api/`,
sirve el archivo de `dist/`. Bastaría con apuntar a la URL de Railway y borrar
`ORIGEN_PERMITIDO`.

Pero cambia el dominio, y con él el cajón de `localStorage`: la app saldría
vacía. Habría que exportar el CSV desde PERFIL en la vieja e importarlo en la
nueva. No hay ninguna ventaja que lo justifique hoy.

## Qué hace el servidor

| Ruta | Qué es |
|---|---|
| `GET /api/salud` | Estado. La única sin token, para poder diagnosticar. |
| `GET /api/datos` | La última copia guardada. |
| `PUT /api/datos` | Guarda una copia. |
| `POST /api/coach` | Pregunta al modelo, respondiendo en streaming. |
| `OPTIONS /api/*` | El permiso de origen que pide el navegador. Sin token: el navegador no lo manda, y exigirlo condena la petición real. |
| todo lo demás | La PWA, si eliges servirla desde aquí. |

Todo `/api/*` menos `/api/salud` y el preflight exige
`Authorization: Bearer <GYMMATE_TOKEN>`.

**La aritmética no la genera el modelo.** El 1RM, el estancamiento, la racha y
el volumen los calcula tu teléfono y llegan al servidor ya hechos, en el bloque
`PANORAMA`. El modelo solo los explica; tiene prohibido calcular sobre el
registro crudo, porque sacaría cifras que contradicen a la pantalla. Es la regla
del handoff y no cambia por tener backend.

**Qué ve el coach.** Desde la primera pregunta viaja tu año completo: el
panorama ya calculado de todos los ejercicios más la bitácora en texto. No se
elige qué mandar. El bloque va marcado como cacheable, así que de la segunda
pregunta en adelante se cobra a una décima parte.

**La app no depende del servidor.** Sin token, sin red o sin clave, GymMate es
lo que era: offline-first, todo en el teléfono. El servidor solo añade la copia
fuera del dispositivo y el coach con modelo.

## Correrlo en tu máquina

```bash
npm ci
GYMMATE_TOKEN=loquesea ANTHROPIC_API_KEY=sk-ant-... DATOS_DIR=./.datos npm run servidor
```

Y la puerta que comprueba todo esto sin desplegar nada:

```bash
npm run verificar:servidor
```
