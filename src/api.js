// ─── Llamadas a canislab-api ─────────────────────────────────────────────────
//
// Un solo sitio para la dirección de la API y para el límite de tiempo.
// Antes había DOS copias de API_BASE (App.jsx y suscripcion.jsx) y ninguna
// petición tenía timeout, así que un servidor que no contestaba dejaba la
// app colgada para siempre sin error ninguno.

// Se puede apuntar a otro sitio por variable de entorno (los tests levantan
// una API de mentira en local). Sin variable, la de producción de siempre.
// ⚠️ `?.` Y NO `.` (12 de septiembre): `import.meta.env` solo existe cuando
// quien ejecuta esto es Vite. Fuera de Vite -- las pruebas que importan un
// módulo suelto para comprobar una cuenta, sin navegador -- es `undefined`, y
// leerle una propiedad revienta el import entero. Pasó al hacer que `bcs.js`
// leyera sus cifras del motor: `bcs.spec.js` importa `src/bcs.js` directo.
export const API_BASE = import.meta.env?.VITE_API_BASE || "https://canislab-api.onrender.com";

// 45 s es holgado a propósito: un arranque en frío de Render tarda cerca de
// un minuto, y no queremos abortar una petición que iba a llegar. Los tests
// lo bajan por variable de entorno para no tardar un minuto cada uno.
export const TIEMPO_MAXIMO_PETICION_MS = Number(import.meta.env?.VITE_TIMEOUT_API_MS) || 45000;

// ⚠️ CUÁNTO ESPERAR CUANDO SE PIDEN VARIOS MENÚS DE GOLPE (12 de septiembre
// de 2026), Y ESTO ERA UN FALLO EN PRODUCCIÓN.
//
// CASO REAL: «No hemos encontrado un menú que cumpla», con CUALQUIER perro,
// en rawku.app y en los despliegues de Vercel. No era el motor: era el reloj.
//
// Medido contra la API desplegada, que es la lenta de verdad:
//
//     1 menú ....... 10,6 s
//     3 menús ...... 30,7 s
//     5 menús ...... 50,7 s
//     7 menús ...... 70,5 s   <- la semana entera, que es lo que pide la app
//
// Y la app cortaba a los 45. O sea que la semana NUNCA cabía: se abortaba a
// mitad y la pantalla lo contaba como si el perro no tuviera menú posible.
//
// ⚠️ Y POR QUÉ NO LO VIO NINGUNA PRUEBA: `playwright.real.config.js` --la
// única que habla con el motor de verdad-- le da 120 s, con el comentario «el
// motor tarda de verdad; con 3 s no le daría tiempo ni a empezar». Así que la
// prueba que existe para cazar desacuerdos entre la app y el motor estaba
// tapando justo éste. Reproducido apuntándola a la API desplegada con los 45 s
// de producción: las tres pruebas se caen.
//
// La semana no se puede partir en siete llamadas: el presupuesto semanal de
// seguridad crónica se reparte DENTRO de esa única llamada, y ése es el motivo
// de que exista `/menu/semana`. Así que lo que se ajusta es la espera.
export function tiempoParaVariosMenus(cuantos) {
  const n = Math.max(1, Number(cuantos) || 1);
  // Si alguien ha puesto un tope a mano (las pruebas), se respeta y no se sube.
  if (Number(import.meta.env?.VITE_TIMEOUT_API_MS)) return TIEMPO_MAXIMO_PETICION_MS;
  // 25 s de arranque en frío + 18 s por menú, con techo. Con 7 son 151 s, que
  // es el doble de lo medido: el margen es a propósito, porque Render va más
  // lento cuanto más dormido está.
  return Math.min(180000, 25000 + 18000 * n);
}

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
