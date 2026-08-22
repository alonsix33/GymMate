/**
 * A que conexiones se les pide TLS.
 *
 * Esto no es un detalle de configuracion: forzar TLS contra la red PRIVADA de
 * Railway es un fallo de ARRANQUE. El Postgres interno no negocia TLS, `pg`
 * responde "The server does not support SSL connections", el servicio no
 * levanta y el healthcheck lo reinicia en bucle. Comprobado ejecutando contra
 * un Postgres real con `ssl = off`:
 *
 *   ssl forzado -> FALLA :: The server does not support SSL connections
 *   sin ssl     -> CONECTA
 *
 * La regla vieja era `url.includes('localhost')`, que deja fuera
 * `postgres.railway.internal` —el caso normal— y tambien `127.0.0.1`.
 */
import { describe, it, expect } from 'vitest';
import { necesitaTls } from './almacen.mjs';

describe('necesitaTls · dentro del proyecto no hace falta', () => {
  it('la red privada de Railway va sin TLS', () => {
    expect(necesitaTls('postgresql://u:p@postgres.railway.internal:5432/railway')).toBe(false);
  });

  it('cualquier nombre bajo railway.internal, no solo el que empieza por postgres', () => {
    expect(necesitaTls('postgresql://u:p@db.railway.internal:5432/railway')).toBe(false);
    expect(necesitaTls('postgresql://u:p@pg-produccion.railway.internal:5432/x')).toBe(false);
  });

  it('localhost y 127.0.0.1, que la regla vieja tampoco cubria entera', () => {
    expect(necesitaTls('postgresql://u:p@localhost:5432/x')).toBe(false);
    expect(necesitaTls('postgresql://u:p@127.0.0.1:5432/x')).toBe(false);
  });

  it('y si alguien lo pide explicitamente, se respeta', () => {
    expect(necesitaTls('postgresql://u:p@externo.com/db?sslmode=disable')).toBe(false);
  });
});

describe('necesitaTls · lo que cruza internet SI lo lleva', () => {
  it('la URL publica de Railway, que sale del proyecto', () => {
    expect(necesitaTls('postgresql://u:p@mainline.proxy.rlwy.net:1234/railway')).toBe(true);
  });

  it('un proveedor de fuera', () => {
    expect(necesitaTls('postgresql://u:p@algo.neon.tech/db')).toBe(true);
  });

  it('un dominio que solo CONTIENE railway.internal no cuela', () => {
    // `includes` habria dicho que si. El ancla del final es lo que lo impide.
    expect(necesitaTls('postgresql://u:p@railway.internal.malicioso.com/db')).toBe(true);
  });

  it('y uno que solo contiene localhost tampoco', () => {
    // El fallo exacto de la regla vieja, al reves: `includes('localhost')`
    // desactivaba TLS para cualquier host que llevara esa palabra dentro.
    expect(necesitaTls('postgresql://u:p@localhost.malicioso.com/db')).toBe(true);
  });
});

describe('necesitaTls · entradas raras', () => {
  it('una URL que no se puede parsear no revienta', () => {
    expect(() => necesitaTls('no-es-una-url')).not.toThrow();
    // Y devuelve false: que falle por el error de conexion de verdad, no por
    // uno de TLS que despistaria del problema real.
    expect(necesitaTls('no-es-una-url')).toBe(false);
  });

  it('vacio tampoco', () => {
    expect(necesitaTls('')).toBe(false);
    expect(necesitaTls(undefined)).toBe(false);
  });
});
