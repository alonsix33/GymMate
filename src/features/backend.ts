/**
 * El puente con el servidor de Railway.
 *
 * Todo aqui es OPCIONAL y la app no depende de ello: sin backend configurado,
 * GymMate sigue siendo exactamente lo que era —offline-first, todo en el
 * telefono— y ni una pantalla cambia. El servidor solo añade dos cosas: un
 * coach con modelo de verdad y una copia de tus datos fuera del dispositivo.
 *
 * El token se guarda en el propio navegador. No hay cuentas ni contraseñas:
 * es una app de una persona, y una sesión de login seria mas superficie de la
 * que hace falta.
 */
const CLAVE_TOKEN = 'gymmate_backend_token';
const CLAVE_URL = 'gymmate_backend_url';

/** Las claves que SI viajan. El borrador y la sesion en curso no: son de este
 *  telefono y de este momento. */
const CLAVES_QUE_VIAJAN = [
  'gymmate_history',
  'gymmate_prs',
  'gymmate_profile',
  'gymmate_body_measurements',
  'gymmate_custom_workouts',
  'gymmate_custom_exercises',
  'gymmate_gamification',
  'gymmate_xp_history',
  'gymmate_coach_conversacion',
] as const;

export interface EstadoBackend {
  ok: boolean;
  almacenamiento?: string;
  persistente?: boolean;
  coach?: boolean;
  avisos?: string[];
}

export function urlBackend(): string {
  // Por defecto el mismo origen: si la PWA la sirve el servidor de Railway,
  // no hay nada que configurar.
  return localStorage.getItem(CLAVE_URL) || '';
}

export function tokenBackend(): string {
  return localStorage.getItem(CLAVE_TOKEN) || '';
}

/**
 * Normaliza la URL del servidor, o devuelve null si no sirve.
 *
 * Sin esto, escribir "gymmate.up.railway.app" sin `https://` daba una ruta
 * RELATIVA: `subirCopia()` mandaba la instantanea entera —con la cabecera
 * `Authorization: Bearer <token>`— contra el origen de Netlify, donde acaba
 * en sus registros de acceso. Y como Netlify redirige todo a `index.html`,
 * la respuesta era un 200 con HTML, `r.json()` reventaba, y la app decia
 * "no responde": el token se habia ido y no habia forma de enterarse.
 *
 * El `<input type="url">` no salva de esto: no esta dentro de un `<form>`,
 * asi que la validacion del navegador nunca corre.
 */
export function normalizarUrl(bruta: string): string | null {
  const t = bruta.trim().replace(/\/$/, '');
  if (!t) return '';
  const conEsquema = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  try {
    const u = new URL(conEsquema);
    // Solo https: en http el token viaja en claro.
    if (u.protocol !== 'https:') return null;
    if (!u.hostname.includes('.')) return null;
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/** Devuelve false si la URL no sirve, para que quien llame pueda decirlo. */
export function configurarBackend(token: string, url = ''): boolean {
  const limpia = normalizarUrl(url);
  if (limpia === null) return false;
  if (token) localStorage.setItem(CLAVE_TOKEN, token.trim());
  else localStorage.removeItem(CLAVE_TOKEN);
  if (limpia) localStorage.setItem(CLAVE_URL, limpia);
  else localStorage.removeItem(CLAVE_URL);
  return true;
}

/**
 * Comprueba el token de verdad, no solo que el servidor conteste.
 *
 * `estadoBackend()` pega a `/api/salud`, que esta FUERA de la puerta de auth:
 * con el token mal escrito devolvia 200 y la pantalla pintaba "conectado" en
 * verde. Alonso se olvidaba del asunto y lo descubria el dia que necesitara
 * restaurar. Esto pide una ruta que si exige token.
 */
export async function comprobarToken(): Promise<'ok' | 'token' | 'red'> {
  if (!hayBackend()) return 'token';
  try {
    const r = await fetch(endpoint('/api/datos'), { headers: cabeceras(), cache: 'no-store' });
    if (r.status === 401) return 'token';
    return r.ok ? 'ok' : 'red';
  } catch {
    return 'red';
  }
}

export function hayBackend(): boolean {
  return tokenBackend() !== '';
}

function endpoint(ruta: string): string {
  return `${urlBackend()}${ruta}`;
}

function cabeceras(): HeadersInit {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${tokenBackend()}` };
}

/** Estado del servicio. Devuelve null si no responde: sin red no hay drama. */
export async function estadoBackend(): Promise<EstadoBackend | null> {
  try {
    const r = await fetch(endpoint('/api/salud'), { cache: 'no-store' });
    return r.ok ? ((await r.json()) as EstadoBackend) : null;
  } catch {
    return null;
  }
}

/** Todo lo que la app guarda y merece sobrevivir a este telefono. */
export function instantanea(): Record<string, unknown> {
  const datos: Record<string, unknown> = { version: 1, guardadoEn: new Date().toISOString() };
  for (const clave of CLAVES_QUE_VIAJAN) {
    const bruto = localStorage.getItem(clave);
    if (bruto === null) continue;
    try {
      datos[clave] = JSON.parse(bruto);
    } catch {
      // Una clave corrupta no puede impedir que el resto se respalde.
    }
  }
  return datos;
}

export async function subirCopia(): Promise<{ ok: boolean; error?: string }> {
  if (!hayBackend()) return { ok: false, error: 'sin backend configurado' };
  try {
    const r = await fetch(endpoint('/api/datos'), {
      method: 'PUT',
      headers: cabeceras(),
      body: JSON.stringify({ datos: instantanea() }),
    });
    if (r.status === 413) {
      return { ok: false, error: 'La copia pesa más de lo que el servidor acepta (8 MB).' };
    }
    if (r.status === 401) return { ok: false, error: 'Token inválido: no coincide con el del servidor.' };
    if (!r.ok) return { ok: false, error: (await r.json().catch(() => ({}))).error ?? `HTTP ${r.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * Baja la copia y la escribe encima. Devuelve cuantas claves entraron.
 *
 * Es DESTRUCTIVO a proposito —restaurar es restaurar— asi que quien lo llame
 * tiene que preguntar antes. La gamificacion se recalcula despues por
 * `fusionarGamificacion`, que nunca baja ninguna cifra.
 */
export async function bajarCopia(): Promise<{ ok: boolean; claves: number; error?: string }> {
  if (!hayBackend()) return { ok: false, claves: 0, error: 'sin backend configurado' };
  try {
    const r = await fetch(endpoint('/api/datos'), { headers: cabeceras(), cache: 'no-store' });
    if (!r.ok) return { ok: false, claves: 0, error: `HTTP ${r.status}` };
    const cuerpo = (await r.json()) as { datos: Record<string, unknown> | null };
    if (!cuerpo.datos) return { ok: false, claves: 0, error: 'el servidor no tiene ninguna copia' };
    let claves = 0;
    for (const clave of CLAVES_QUE_VIAJAN) {
      if (!(clave in cuerpo.datos)) continue;
      localStorage.setItem(clave, JSON.stringify(cuerpo.datos[clave]));
      claves++;
    }
    return { ok: true, claves };
  } catch (e) {
    return { ok: false, claves: 0, error: (e as Error).message };
  }
}
