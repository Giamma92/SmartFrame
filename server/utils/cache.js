/**
 * cache.js
 * Wrapper con TTL per funzioni asincrone:
 *  - evita chiamate duplicate concorrenti (dedupe delle richieste in corso)
 *  - in caso di errore restituisce l'ultimo valore valido ("stale") se esiste
 */

/** Errore applicativo con uno "state" leggibile dal frontend. */
export class ServiceError extends Error {
  /**
   * @param {string} message
   * @param {'error'|'not_configured'|'not_authorized'} state
   */
  constructor(message, state = 'error') {
    super(message);
    this.state = state;
  }
}

/**
 * @template T
 * @param {() => Promise<T>} fn  funzione che produce il dato
 * @param {number} ttlMs         validità della cache in millisecondi
 */
export function cached(fn, ttlMs) {
  let value;
  let expires = 0;
  let pending = null;
  let lastError = null;

  const get = async ({ force = false } = {}) => {
    if (!force && value !== undefined && Date.now() < expires) return value;
    if (pending) return pending;

    pending = (async () => {
      try {
        value = await fn();
        expires = Date.now() + ttlMs;
        lastError = null;
        return value;
      } catch (err) {
        lastError = err;
        // Riprova al massimo dopo 1 minuto, servendo nel frattempo il dato vecchio.
        expires = Date.now() + Math.min(ttlMs, 60_000);
        if (value !== undefined && !(err instanceof ServiceError && err.state !== 'error')) {
          return value;
        }
        throw err;
      } finally {
        pending = null;
      }
    })();
    return pending;
  };

  get.invalidate = () => { expires = 0; };
  get.reset = () => { value = undefined; expires = 0; };
  get.lastError = () => lastError;
  return get;
}
