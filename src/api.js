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
  // UNA SOLA REGLA: lo que se espera por UNA petición, más 18 s por cada menú
  // de más. Con el tope de siempre (45 s) y siete menús son 153 s.
  //
  // ⚠️ Y NO HAY EXCEPCIÓN PARA LAS PRUEBAS, QUE ES LO QUE ESTABA MAL (16 de
  // septiembre de 2026). Aquí había un `if (VITE_TIMEOUT_API_MS) return
  // TIEMPO_MAXIMO_PETICION_MS`, puesto para que un tope a mano no se subiera —
  // y `playwright.real.config.js` pone ese tope a 45 s A PROPÓSITO, para no
  // darse más margen que el producto. Juntas, las dos cosas le daban a la
  // semana 45 s donde el producto le da 151: o sea que la prueba se daba MENOS
  // margen que el producto, que es el mismo error del 12 de septiembre con el
  // signo cambiado.
  //
  // CASO REAL: `dueño · Cairo más del máximo` salía rojo con la app colgada en
  // «Despertando el servidor...» —que es lo que se ve cuando la petición se
  // aborta— mientras el motor contestaba bien en 44 s. Una prueba que corta
  // antes que el producto acusa al motor de algo que al usuario no le pasa.
  //
  // Con la regla unificada el tope a mano sigue mandando sobre la BASE (una
  // petición nunca espera más de lo que diga), y la semana escala igual en la
  // prueba y en producción.
  return Math.min(180000, TIEMPO_MAXIMO_PETICION_MS + 18000 * (n - 1));
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
