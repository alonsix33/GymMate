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

Railway detecta el proyecto solo: lee `railway.json`, construye y arranca con
`npm start`. No tocas ningún ajuste de build.

El comando de build lleva `--include=dev` a propósito: `vite` y `tsc` son
devDependencies, y si Nixpacks pone `NODE_ENV=production` un `npm ci` normal
las omite y el build muere en el primer despliegue. Y lleva
`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` para no descargar un navegador de 150 MB
que solo usan las pruebas.

Pones **tres variables** y, para que la copia sobreviva a los despliegues, el
plugin de Postgres.

---

## 0. Actualiza la app en Netlify

La tarjeta **Servidor** de PERFIL es nueva: la app que tienes instalada no la
tiene todavía. Netlify reconstruye sola al hacer push — entra a Netlify →
**Deploys** y espera a que el último diga **Published**.

Después, en el iPhone: cierra GymMate desde el selector de apps (deslizar
arriba), ábrela, ciérrala otra vez y vuelve a abrirla. Hacen falta **dos
arranques**: en el primero el service worker se descarga la versión nueva, en
el segundo se usa. Ya está cuando en **PERFIL** veas la tarjeta **Servidor**.

Si abres PERFIL y no hay tarjeta, es esto, no Railway.

## 1. Conectar el repo en Railway

Railway → **New Project** → **Deploy from GitHub repo** → `alonsix33/GymMate`.

Al terminar, **Settings → Networking → Generate Domain**. Anota esa URL: es la
de la API, no la de la app.

## 2. Las tres variables

Railway → tu servicio → **Variables**:

| Variable | Para qué | Cómo se saca |
|---|---|---|
| `GYMMATE_TOKEN` | Abre la API para ti. Sin ella todo responde 401 menos `/api/salud`, que queda para diagnosticar; con ella, es lo único que separa tu historial de cualquiera que dé con la URL pública. | `openssl rand -hex 32` |
| `ANTHROPIC_API_KEY` | Enciende el coach con modelo | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |
| `ORIGEN_PERMITIDO` | Deja que la PWA de Netlify hable con esta API. **Sin ella el navegador bloquea cada petición** y la app dice "no responde" con el servidor vivo. | Tu dominio de Netlify, tal cual: `https://tu-app.netlify.app` |

`ORIGEN_PERMITIDO` admite varios separados por coma, por si tienes también un
dominio propio:

```
ORIGEN_PERMITIDO=https://tu-app.netlify.app,https://gymmate.tudominio.com
```

Va el origen exacto: protocolo y host, sin ruta. La barra final da igual, el
servidor la quita de los dos lados. Nunca `*`: con el comodín, cualquier página
que visites podría pedirle tu historial a este servidor — y el servidor se
niega a arrancar si lo pones, en vez de fingir que funciona.

Opcionales: `COACH_MODELO` (por defecto `claude-sonnet-5`) y `COACH_MAX_TOKENS`
(por defecto 700). `PORT` la pone Railway; no la toques.

## 3. Dónde vive tu copia

Elige una. Si no eliges ninguna, el servicio arranca igual y **lo que guardes se
borra entero en el siguiente despliegue**.

Ojo con cómo lo compruebas: el servidor **no distingue** un volumen montado en
`/data` de una carpeta cualquiera. En los dos casos dice
`"almacenamiento": "fichero"` y avisa de que lo mires. La comprobación fiable es
verlo en Railway. Con Postgres sí lo sabe: dice `"persistente": true`.

- **Postgres (recomendado).** Railway → **+ New** → **Database** → **Add
  PostgreSQL**. Nada más: el plugin inyecta `DATABASE_URL` y el servidor crea
  su tabla al arrancar.
- **Volumen.** Railway → tu servicio → **Volumes** → montar en `/data`.

## 4. Conectar la app

En la app: **PERFIL → Servidor**.

- **Token**: el `GYMMATE_TOKEN` que pusiste arriba.
- **URL**: la de Railway, `https://gymmate.up.railway.app`.

Pulsa **Conectar**. Se guarda en el teléfono y **no vuelve a pedirse**: ni
expira, ni hay sesión que renovar. Bajar una copia tampoco lo borra.

Estados que puedes ver:

- `conectado · coach con modelo` — el servidor tiene la clave, el token es
  correcto y el coach ya está enganchado. Listo.
- `conectado · coach en local` — falta `ANTHROPIC_API_KEY`. La copia funciona;
  el coach sigue siendo el del teléfono, con los datos que él calcula, y lo dice.
- `token inválido` — el servidor responde pero no acepta ese token. Cópialo de
  Railway → Variables → `GYMMATE_TOKEN`.
- `no responde` — el navegador no llegó a leer la respuesta. Por frecuencia:
  el teléfono está sin datos, `ORIGEN_PERMITIDO` no es exactamente tu dominio
  de Netlify, o la URL está mal escrita. La app funciona entera sin servidor.

## 5. Comprobar que está bien

```bash
curl https://TU-APP.up.railway.app/api/salud
```

```json
{ "ok": true, "almacenamiento": "postgres", "persistente": true,
  "coach": true, "protegido": true, "avisos": [] }
```

`avisos` vacío significa que el token y la clave del modelo están puestos. **No
comprueba el permiso de origen**, que es lo que más falla, así que haz también
esta segunda prueba:

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
| `OPTIONS /api/*` | El permiso previo que pide el navegador antes de una petición desde otro dominio. No lleva token: el navegador no lo manda. |
| todo lo demás | La PWA, si eliges servirla desde aquí. |

Todo `/api/*` menos `/api/salud` y ese permiso previo exige
`Authorization: Bearer <GYMMATE_TOKEN>`.

**La aritmética no la genera el modelo.** El 1RM, el estancamiento, la racha y
el volumen los calcula tu teléfono y llegan al servidor ya hechos, en el bloque
`PANORAMA`. El modelo solo los explica; tiene prohibido calcular sobre el
registro crudo, porque sacaría cifras que contradicen a la pantalla. Es la regla
del handoff y no cambia por tener backend.

**Qué ve el coach.** Desde la primera pregunta viaja tu año completo: el
panorama ya calculado de todos los ejercicios más la bitácora en texto. No se
elige qué mandar.

El bloque va marcado como cacheable con **una hora** de vida: si preguntas
varias veces dentro de esa hora —una sesión de gimnasio entera— de la segunda
en adelante ese bloque se cobra a una décima parte. Al día siguiente la caché
ya expiró y la primera pregunta lo paga completo otra vez. Medido con un año de
208 sesiones: unos 8.100 tokens, tres centavos la primera y dos milésimas las
siguientes.

**La app no depende del servidor.** Sin token, sin red o sin clave, GymMate es
lo que era: offline-first, todo en el teléfono. El servidor solo añade la copia
fuera del dispositivo y el coach con modelo.

## Correrlo en tu máquina

```bash
npm ci
GYMMATE_TOKEN=loquesea ANTHROPIC_API_KEY=sk-ant-... DATOS_DIR=./.datos npm run servidor
# `.datos/` está en .gitignore: no se te va a colar el historial en un commit.
```

Y la puerta que comprueba todo esto sin desplegar nada:

```bash
npm run verificar:servidor   # levanta el servidor de verdad, 36 chequeos
npm run verificar:mutantes   # rompe el servidor a proposito y exige que la puerta lo note
```
