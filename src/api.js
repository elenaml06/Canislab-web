// ─── Llamadas a canislab-api ─────────────────────────────────────────────────
//
// Un solo sitio para la dirección de la API y para el límite de tiempo.
// Antes había DOS copias de API_BASE (App.jsx y suscripcion.jsx) y ninguna
// petición tenía timeout, así que un servidor que no contestaba dejaba la
// app colgada para siempre sin error ninguno.

// Se puede apuntar a otro sitio por variable de entorno (los tests levantan
// una API de mentira en local). Sin variable, la de producción de siempre.
export const API_BASE = import.meta.env.VITE_API_BASE || "https://canislab-api.onrender.com";

// 45 s es holgado a propósito: un arranque en frío de Render tarda cerca de
// un minuto, y no queremos abortar una petición que iba a llegar. Los tests
// lo bajan por variable de entorno para no tardar un minuto cada uno.
export const TIEMPO_MAXIMO_PETICION_MS = Number(import.meta.env.VITE_TIMEOUT_API_MS) || 45000;

// fetch con límite de tiempo. Si el servidor no contesta, aborta y lanza un
// error marcado con `esTimeout`, que es lo que permite distinguir "no
// contesta" (reintentable) de "contesta que no se puede" (no reintentable).
export async function fetchConTimeout(url, opciones = {}, ms = TIEMPO_MAXIMO_PETICION_MS) {
  const control = new AbortController();
  const alarma = setTimeout(() => control.abort(), ms);
  try {
    return await fetch(url, { ...opciones, signal: control.signal });
  } catch (err) {
    if (err?.name === "AbortError") {
      const e = new Error(`El servidor no respondió en ${Math.round(ms / 1000)} segundos.`);
      e.esTimeout = true;
      throw e;
    }
    throw err;
  } finally {
    clearTimeout(alarma);
  }
}
