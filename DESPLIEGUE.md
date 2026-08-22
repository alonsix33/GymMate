# Desplegar GymMate en Railway

El repo ya viene listo. Railway detecta el proyecto solo: lee `railway.json`,
construye con `npm ci && npm run build` y arranca con `npm start`. No tienes
que tocar ningún ajuste de build.

Lo único que pones tú son **dos variables** y, si quieres que la copia
sobreviva a los despliegues, **el plugin de Postgres**.

---

## 1. Conectar el repo

Railway → **New Project** → **Deploy from GitHub repo** → `alonsix33/GymMate`.

Al terminar, **Settings → Networking → Generate Domain**. Esa es la URL de tu
app: ábrela en el iPhone y añádela a la pantalla de inicio.

## 2. Las dos variables

Railway → tu servicio → **Variables**:

| Variable | Para qué | Cómo se saca |
|---|---|---|
| `GYMMATE_TOKEN` | Cierra la API. **Sin esto, cualquiera con tu URL lee tu historial y gasta tu crédito del modelo.** | `openssl rand -hex 32`, o cualquier cadena larga y aleatoria |
| `ANTHROPIC_API_KEY` | Enciende el coach con modelo | [console.anthropic.com/settings/keys](https://console.anthropic.com/settings/keys) |

Opcionales: `COACH_MODELO` (por defecto `claude-sonnet-5`) y `COACH_MAX_TOKENS`
(por defecto 700).

`PORT` la pone Railway. No la toques.

## 3. Dónde vive tu copia

Elige una. Si no eliges ninguna, el servicio arranca igual, pero **lo que
guardes se borra en el siguiente despliegue** y `/api/salud` te lo dice.

- **Postgres (recomendado).** Railway → **+ New** → **Database** → **Add
  PostgreSQL**. Nada más: el plugin inyecta `DATABASE_URL` y el servidor crea
  su tabla al arrancar.
- **Volumen.** Railway → tu servicio → **Volumes** → montar en `/data`.

## 4. Conectar la app

En la app: **PERFIL → Servidor**. Pega el `GYMMATE_TOKEN` y pulsa **Conectar**.
La URL se deja vacía si la app la sirve el mismo servicio (el caso normal).

Verás uno de estos estados:

- `conectado · coach con modelo` — todo listo.
- `conectado · coach en local` — falta `ANTHROPIC_API_KEY`; el coach responde
  con los datos que calcula tu teléfono.
- `no responde` — revisa la URL. La app sigue funcionando entera sin servidor.

Y el aviso del toast te dirá si falta algo, incluido el caso feo: servidor sin
almacenamiento persistente.

## 5. Comprobar que está bien

```
curl https://TU-APP.up.railway.app/api/salud
```

```json
{ "ok": true, "almacenamiento": "postgres", "persistente": true,
  "coach": true, "protegido": true, "avisos": [] }
```

`avisos` vacío es lo que buscas. Si trae algo, lo dice en castellano.

---

## Qué hace el servidor

| Ruta | Qué es |
|---|---|
| `GET /api/salud` | Estado. La única sin token, para poder diagnosticar. |
| `GET /api/datos` | La última copia guardada. |
| `PUT /api/datos` | Guarda una copia. |
| `POST /api/coach` | Pregunta al modelo, respondiendo en streaming. |
| todo lo demás | La PWA. |

Todo `/api/*` menos `/api/salud` exige `Authorization: Bearer <GYMMATE_TOKEN>`.

**La aritmética no la genera el modelo.** El 1RM, el estancamiento y el próximo
peso los calcula tu teléfono y llegan al servidor ya hechos; el modelo solo los
explica. Si se equivoca en una cifra, la tarjeta de datos que se pinta al lado
sigue diciendo la verdad. Es la regla del handoff y no cambia por tener backend.

**La app no depende del servidor.** Sin token, sin red o sin clave, GymMate es
lo que era: offline-first, todo en el teléfono. El servidor solo añade la copia
fuera del dispositivo y el coach con modelo.

## Correrlo en tu máquina

```bash
npm ci
GYMMATE_TOKEN=loquesea ANTHROPIC_API_KEY=sk-ant-... DATOS_DIR=./.datos npm run servidor
```
