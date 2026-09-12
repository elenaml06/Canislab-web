// ─── La semana entera tiene que CABER en el tiempo que la app espera ─────────
//
// ⚠️ CASO REAL EN PRODUCCIÓN (12 de septiembre de 2026). La usuaria, en
// rawku.app y en los despliegues de Vercel: «No hemos encontrado un menú que
// cumpla», con CUALQUIER perro.
//
// No era el motor. Era el reloj. Medido contra la API desplegada:
//
//     1 menú ....... 10,6 s
//     3 menús ...... 30,7 s
//     5 menús ...... 50,7 s
//     7 menús ...... 70,5 s   <- la semana, que es lo que pide la app
//
// Y la app abortaba a los 45. La semana NUNCA cabía.
//
// ⚠️ POR QUÉ NO LO VIO NINGUNA PRUEBA, que es lo que hay que arreglar de
// verdad: `playwright.real.config.js` -- la única que habla con el motor de
// verdad -- le da **120 s**, con el comentario «el motor tarda de verdad; con
// 3 s no le daría tiempo ni a empezar». O sea que la prueba que existe para
// cazar desacuerdos entre la app y el motor estaba tapando justo éste, porque
// se daba a sí misma un tiempo que la app real no se da.
//
// Esta prueba mira el reloj de la app contra lo MEDIDO, sin red y sin
// navegador: es aritmética, y por eso no puede volver a taparse con un tiempo
// de espera generoso.
import { test, expect } from "@playwright/test";
import { tiempoParaVariosMenus, TIEMPO_MAXIMO_PETICION_MS } from "../src/api.js";

// Lo medido el 12 de septiembre contra `canislab-api.onrender.com`, en
// segundos por menú. Si el motor se hace más lento, esta cifra sube AQUÍ y con
// ella el tiempo de espera -- no al revés.
const SEGUNDOS_POR_MENU_MEDIDOS = 10.6;

test("pedir la semana entera cabe en lo que la app espera", () => {
  for (const cuantos of [1, 3, 5, 7]) {
    const necesita = SEGUNDOS_POR_MENU_MEDIDOS * cuantos * 1000;
    const espera = tiempoParaVariosMenus(cuantos);
    expect(espera,
      `con ${cuantos} menús el motor tarda ~${Math.round(necesita / 1000)} s y la app solo ` +
      `espera ${Math.round(espera / 1000)} s: se aborta a mitad y la pantalla lo cuenta como ` +
      `si el perro no tuviera menú posible`)
      .toBeGreaterThan(necesita);
  }
});

test("y con margen de sobra, porque Render va más lento cuanto más dormido está", () => {
  // El doble de lo medido, que es el margen que se decidió a propósito.
  expect(tiempoParaVariosMenus(7)).toBeGreaterThan(2 * SEGUNDOS_POR_MENU_MEDIDOS * 7 * 1000);
});

test("el tiempo de siempre NO basta para la semana, que es lo que se rompió", () => {
  // Esta es la que falla si alguien devuelve la llamada al tiempo por defecto.
  expect(TIEMPO_MAXIMO_PETICION_MS,
    "45 s era el tiempo de siempre y con él la semana entera no cabe")
    .toBeLessThan(SEGUNDOS_POR_MENU_MEDIDOS * 7 * 1000);
});
