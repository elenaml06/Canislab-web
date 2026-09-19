// ─── EL RELOJ DE LA APP SALE DEL MOTOR, NO DE LA APP ─────────────────────────
//
// ⚠️ CASO REAL, EN PRODUCCIÓN (19 de septiembre de 2026). La app cortaba toda
// petición de menú a los 45 s (`TIEMPO_MAXIMO_PETICION_MS`) y el motor se da
// **90** para un menú suelto (`PRESUPUESTO_SEGUNDOS_MENU_UNICO`). El tramo
// entre los dos es tiempo en el que el motor trabaja para nadie: encuentra el
// menú y no lo recibe ninguna pantalla.
//
// Y no era un rincón. La ficha pide UN menú por omisión, y con uno solo la app
// no va por `/menu/semana` sino por `/menu/v2`, que era justo la llamada sin
// reloj propio. O sea: el camino normal.
//
// Medido contra el motor DESPLEGADO, con la app colgando a los 45,3 s:
//
//     Cairo (cachorro de raza grande) ... menú verde en 79,8 · 79,8 · 81,4 · 68,1 s
//     adulto toy, cocinado ............. menú verde en 37,0 s
//     Cairo sin premios, cocinado ...... menú verde en 86,5 s
//
// ⚠️ LA SEMANA YA LO TENÍA ARREGLADO desde el 16 de septiembre
// (`tiempoParaVariosMenus`), y por eso se ve tan claro lo que le faltaba al
// menú suelto: se arregló el camino de los siete menús y se quedó el de uno.
//
// ⚠️ SE SIEMBRA UN NÚMERO INVENTADO, que es lo único que distingue «la app lo
// ha leído del motor» de «la app está usando su respaldo»: con el número de
// verdad las dos cosas dan exactamente el mismo resultado, y esta prueba
// pasaría en verde con la petición entera comentada.
import { test, expect } from "@playwright/test";
import {
  PRESUPUESTO_DE_TIEMPO_RESPALDO, MARGEN_SOBRE_EL_PRESUPUESTO_MS,
  anotarPresupuestoDeTiempo, tiempoParaUnMenu, tiempoParaVariosPerros,
  tiempoParaVariosMenus, TIEMPO_MAXIMO_PETICION_MS,
} from "../src/api.js";

// Ni 90 ni 85 ni 70: si sale alguno de esos, es el respaldo.
const INVENTADO = {
  menu_unico_segundos: 101,
  semana_total_segundos: 102,
  semana_primer_menu_segundos: 33,
  varios_perros_segundos: 103,
};

test.describe("el reloj de la app sale del motor", () => {
  test("sin motor, el respaldo; y el respaldo ya es mayor que el tope de siempre", () => {
    // El respaldo no puede ser menor que lo que el motor aplica hoy, o la app
    // con Render dormido volvería a cortar antes de tiempo.
    expect(PRESUPUESTO_DE_TIEMPO_RESPALDO.menu_unico_segundos).toBeGreaterThanOrEqual(90);
    // Y el reloj de un menú tiene que ser mayor que el de una petición normal:
    // si fueran iguales, este arreglo no está puesto.
    expect(tiempoParaUnMenu(),
      "`tiempoParaUnMenu()` devuelve el tope de siempre. El motor se da 90 s para un menú "
      + "suelto: con 45 la app tira menús que el motor ya ha calculado")
      .toBeGreaterThan(TIEMPO_MAXIMO_PETICION_MS);
  });

  test("lo que sirve el motor manda sobre el respaldo", () => {
    anotarPresupuestoDeTiempo(INVENTADO);
    try {
      expect(tiempoParaUnMenu(),
        "la app no está usando el presupuesto que sirve el motor: si sale 150000 es que se "
        + "ha quedado con PRESUPUESTO_DE_TIEMPO_RESPALDO, y el día que se suba el presupuesto "
        + "del motor la app seguiría cortando donde cortaba")
        .toBe(101 * 1000 + MARGEN_SOBRE_EL_PRESUPUESTO_MS);
      expect(tiempoParaVariosPerros()).toBe(103 * 1000 + MARGEN_SOBRE_EL_PRESUPUESTO_MS);
      // La semana: manda la regla de siempre o el techo del motor, lo que sea
      // MÁS, y nunca por debajo de ninguno de los dos.
      expect(tiempoParaVariosMenus(7))
        .toBeGreaterThanOrEqual(102 * 1000 + MARGEN_SOBRE_EL_PRESUPUESTO_MS);
    } finally {
      anotarPresupuestoDeTiempo(PRESUPUESTO_DE_TIEMPO_RESPALDO);
    }
  });

  test("una respuesta rota no deja la app sin reloj", () => {
    // Un motor que contesta a medias no puede dejar el reloj en NaN: eso
    // abortaría la petición al instante y el dueño vería «no hay menú» sin
    // que nadie hubiera calculado nada.
    for (const roto of [null, undefined, {}, { menu_unico_segundos: "mucho" },
                        { menu_unico_segundos: -3 }, { menu_unico_segundos: 0 }]) {
      anotarPresupuestoDeTiempo(roto);
      expect(Number.isFinite(tiempoParaUnMenu()),
        `con \`${JSON.stringify(roto)}\` el reloj deja de ser un número`).toBe(true);
      expect(tiempoParaUnMenu()).toBeGreaterThanOrEqual(TIEMPO_MAXIMO_PETICION_MS);
    }
    anotarPresupuestoDeTiempo(PRESUPUESTO_DE_TIEMPO_RESPALDO);
  });
});

// ─── Y QUE NINGÚN CAMINO SE QUEDE SIN RELOJ ──────────────────────────────────
//
// ⚠️ ASÍ APARECIÓ EL FALLO, Y ASÍ VUELVE A APARECER: no por un número mal
// puesto, sino por una llamada SIN TERCER ARGUMENTO. `fetchConTimeout` tiene un
// valor por omisión —los 45 s de una petición normal— así que olvidarse no da
// ningún error: la llamada funciona, y solo se nota en los perros que tardan.
//
// Es el mismo guardia que `crudo-o-cocinado.spec.js` le puso a
// `modo_de_preparacion`, y por el mismo motivo escrito en el motor: «si un
// camino nuevo llama al motor, tiene que pasarle `patologias` — se olvidó una
// vez en la edición y una sola edición tiraba el tope».
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));

test("las cinco llamadas de menú llevan su reloj", () => {
  const app = fs.readFileSync(path.resolve(AQUI, "../src/App.jsx"), "utf-8");
  // Cada llamada al motor que resuelve un menú, con el reloj que le toca.
  const ESPERADO = [
    ["/menu/v2", "tiempoParaUnMenu()"],
    ["/menu/semana", "tiempoParaVariosMenus("],
    ["/menu/varios-perros", "tiempoParaVariosPerros()"],
    ["/menu/revalidar", "tiempoParaUnMenu()"],
    // Las tres ediciones comparten `llamarRecalculo`, así que se mira ahí.
    ["${endpoint}", "tiempoParaUnMenu()"],
  ];
  const sinReloj = [];
  for (const [ruta, reloj] of ESPERADO) {
    // El fuente pone fetchConTimeout(`${API_BASE}/menu/...`), y eso hay que
    // buscarlo como texto plano: interpolarlo aquí lo convertiría en otra cosa.
    const i = app.indexOf('fetchConTimeout(`' + '${API_BASE}' + ruta);
    if (i === -1) { sinReloj.push(`${ruta}: no encuentro la llamada`); continue; }
    // El reloj va al cerrar la llamada, así que se mira el trozo desde ahí
    // hasta bastante después. No se puede acotar por líneas: estos cuerpos
    // tienen comentarios largos a propósito.
    const trozo = app.slice(i, i + 12000);
    const cierre = trozo.indexOf("tiempoPara");
    if (cierre === -1 || !trozo.slice(0, cierre + 60).includes(reloj)) {
      sinReloj.push(`${ruta}: no le pasa \`${reloj}\``);
    }
  }
  expect(sinReloj,
    "hay llamadas de menú sin reloj propio. `fetchConTimeout` tiene los 45 s por omisión, así "
    + "que olvidarse NO da error: la app corta antes que el motor y tira menús ya calculados, y "
    + "solo se nota en los perros que tardan — que son justo los que más lo necesitan")
    .toEqual([]);
});
