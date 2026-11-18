/** La Content-Security-Policy de la PWA. La usa el servidor y la repite netlify.toml (un test las compara). */
export const CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
  "img-src 'self' data: https://raw.githubusercontent.com; font-src 'self' data:; " +
  "connect-src 'self' https:; worker-src 'self'; manifest-src 'self'; " +
  "object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'";
