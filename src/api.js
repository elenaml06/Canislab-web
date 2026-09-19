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

// ─── CUÁNTO SE PERMITE TARDAR EL MOTOR, DICHO POR EL MOTOR ───────────────────
//
// ⚠️ CASO REAL, EN PRODUCCIÓN (19 de septiembre de 2026). La app cortaba toda
// petición de menú a los 45 s y el motor se da **90** para el menú suelto
// (`PRESUPUESTO_SEGUNDOS_MENU_UNICO`). El tramo entre los dos es tiempo en el
// que el motor trabaja para nadie: encuentra el menú y no lo recibe ninguna
// pantalla.
//
// Y no era un rincón: la ficha por omisión pide UN menú, y con uno solo la app
// no va por `/menu/semana` sino por `/menu/v2`. O sea el camino normal.
//
// Medido contra el motor DESPLEGADO, con la app cortando a los 45,3 s:
//
//     Cairo (cachorro de raza grande) ... menú en 79,8 · 79,8 · 81,4 · 68,1 s
//     adulto toy, cocinado ............. menú en 37,0 s
//     Cairo sin premios, cocinado ...... menú en 86,5 s
//
// Los tres existen, los tres están en verde y ninguno llegaba a la pantalla.
//
// ⚠️ Y EL NÚMERO NO SE ESCRIBE AQUÍ (regla 6): es el presupuesto DEL MOTOR, así
// que lo sirve `GET /vocabulario` en `presupuesto_de_tiempo` y esto solo lo
// anota. Lo de abajo es el RESPALDO para cuando Render duerme -- si se copiara
// a mano, el día que se suba el presupuesto del motor la app seguiría cortando
// donde cortaba, que es el fallo de las seis categorías de Personalizar otra
// vez. Lo vigila el BLOQUE 132 en el motor y `la-ley-del-motor.spec.js` aquí.
export const PRESUPUESTO_DE_TIEMPO_RESPALDO = {
  menu_unico_segundos: 90,
  semana_total_segundos: 85,
  semana_primer_menu_segundos: 40,
  varios_perros_segundos: 70,
};
export let PRESUPUESTO_DE_TIEMPO = PRESUPUESTO_DE_TIEMPO_RESPALDO;

/** Lo llama `vocabulario.js` cuando llega la respuesta del motor. */
export function anotarPresupuestoDeTiempo(servido) {
  if (!servido || typeof servido !== "object") return;
  const n = (x) => (Number.isFinite(Number(x)) && Number(x) > 0 ? Number(x) : null);
  const nuevo = { ...PRESUPUESTO_DE_TIEMPO };
  for (const k of Object.keys(PRESUPUESTO_DE_TIEMPO_RESPALDO)) {
    const v = n(servido[k]);
    if (v !== null) nuevo[k] = v;
  }
  PRESUPUESTO_DE_TIEMPO = nuevo;
}

// ⚠️ EL MARGEN NO ES UN NÚMERO REDONDO: ES UNA MEDIDA. El presupuesto acota el
// BUCLE DEL SOLVER, no la respuesta entera -- después vienen la verificación de
// cero, los avisos y la ficha. Medido contra el motor desplegado, el perro que
// más tarda (Cairo con premios al máximo) devolvió HTTP 200 con menú en
// **105,2 · 144,7 · 148,4 s** contra un presupuesto de 90. O sea que el
// desbordamiento llega a ~58 s, y con 60 cabe el peor caso medido.
//
// ⚠️ Y de paso esas tres tiradas tiran la premisa que sostenía los dos techos
// del motor: «Render documenta 100 s como máximo de una petición» está escrito
// en cuatro sitios del repo y **Render sirvió las tres, la más larga a 148,4 s**.
export const MARGEN_SOBRE_EL_PRESUPUESTO_MS = 60000;
const TOPE_DE_ESPERA_MS = 180000;

/** Lo que se espera por UN menú: lo que el motor dice que puede tardar, más el
 *  margen de la respuesta. Nunca menos que el tope de siempre.
 *  Vale para `/menu/v2` y para las ediciones (`/menu/anadir`, `/menu/quitar`,
 *  `/menu/cambiar`, `/menu/revalidar`), que resuelven UN menú cada una. */
export function tiempoParaUnMenu() {
  const delMotor = PRESUPUESTO_DE_TIEMPO.menu_unico_segundos * 1000
                   + MARGEN_SOBRE_EL_PRESUPUESTO_MS;
  return Math.min(TOPE_DE_ESPERA_MS, Math.max(TIEMPO_MAXIMO_PETICION_MS, delMotor));
}

/** La pantalla de varios perros tiene su propio techo en el motor
 *  (`PRESUPUESTO_SEGUNDOS_VARIOS_PERROS`), y también viaja. */
export function tiempoParaVariosPerros() {
  const delMotor = PRESUPUESTO_DE_TIEMPO.varios_perros_segundos * 1000
                   + MARGEN_SOBRE_EL_PRESUPUESTO_MS;
  return Math.min(TOPE_DE_ESPERA_MS, Math.max(TIEMPO_MAXIMO_PETICION_MS, delMotor));
}

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
  // ⚠️ Y NUNCA MENOS QUE LO QUE EL MOTOR DICE QUE PUEDE TARDAR LA SEMANA
  // (19 de septiembre de 2026). La regla de arriba se escribió cuando el techo
  // del motor no viajaba; hoy lo sirve `/vocabulario`, y si la semana se diera
  // más que esto la app volvería a tirar menús ya calculados.
  const porLaRegla = TIEMPO_MAXIMO_PETICION_MS + 18000 * (n - 1);
  const delMotor = PRESUPUESTO_DE_TIEMPO.semana_total_segundos * 1000
                   + MARGEN_SOBRE_EL_PRESUPUESTO_MS;
  return Math.min(TOPE_DE_ESPERA_MS, Math.max(porLaRegla, delMotor));
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
