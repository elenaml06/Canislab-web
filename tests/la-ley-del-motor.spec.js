// ─── LA LEY: nada de lo que pinta la app vive solo en la app ─────────────────
//
// Elena, 12 de septiembre de 2026: «NADA VIVA SOLO EN LA APP, TIENE QUE LLAMAR
// A COSAS QUE VIVAN EN EL MOTOR PARA QUE CUANDO SE CAMBIE ALGO SE APLIQUE Y LA
// APP LO PILLE DIRECTO. PARA TODO».
//
// POR QUÉ HACE FALTA UNA PRUEBA Y NO BASTA LA FRASE: la ley ya estaba dicha y
// se seguía rompiendo. Una frase no se ejecuta -- es la misma lección de
// `auditar_conversiones.py` en el motor. Cinco veces el mismo fallo en dos
// semanas: las seis categorías de Personalizar, los cinco niveles de actividad,
// las 47 patologías, las 255 razas y los 163 alimentos. Y las cinco se
// descubrieron POR CASUALIDAD, porque una lista copiada a mano no da error: se
// queda parada y la pantalla se ve perfecta.
//
// El caso que cerró la discusión: el aceite de salmón Pets Purest entró al
// catálogo del motor el 7 de septiembre con la foto de su etiqueta, el motor lo
// usa en 23 de los 216 menús precalculados, y en la app no aparecía. Elena lo
// dijo dos veces antes de que se mirara.
//
// ESTA ES LA PUNTA DE LA APP. La del motor -- que el endpoint declarado sirva
// esa lista de verdad y no venga vacía -- la vigila el BLOQUE 99 de
// `pruebas_completas.py`. Hacen falta las dos: una lista puede estar declarada
// y no servirse, o servirse y no estar declarada.
import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const LEY = path.resolve(AQUI, "../../Canislab-api/lo_que_la_app_pinta.json");

function fuentesDeLaApp() {
  const dir = path.resolve(AQUI, "../src");
  return fs.readdirSync(dir)
    .filter((f) => f.endsWith(".js") || f.endsWith(".jsx"))
    .map((f) => ({ fichero: f, texto: fs.readFileSync(path.join(dir, f), "utf-8") }));
}

test.describe("la ley del motor", () => {
  test("el inventario del motor existe y se puede leer", () => {
    expect(fs.existsSync(LEY),
      `No se encuentra ${LEY}. Es donde el motor declara qué pinta la app y de dónde lo saca`
    ).toBe(true);
    const ley = JSON.parse(fs.readFileSync(LEY, "utf-8"));
    expect(ley.listas.length,
      "el inventario dice una cantidad y trae otra: el recuento va clavado a propósito"
    ).toBe(ley._meta.cuantas);
  });

  // ⚠️ ESTA ES LA QUE CAZA EL FALLO. Una lista nueva escrita a mano en la app,
  // sin motor detrás, no da error en ningún sitio: la pantalla se ve perfecta y
  // se queda parada para siempre. El único momento en el que se puede cazar es
  // al escribirla.
  test("toda constante *_RESPALDO de la app está declarada en el motor", () => {
    const ley = JSON.parse(fs.readFileSync(LEY, "utf-8"));
    const declaradas = new Set(ley.listas.map((l) => l.respaldo));
    const enLaApp = new Map();
    for (const { fichero, texto } of fuentesDeLaApp()) {
      for (const m of texto.matchAll(/\b(?:const|let|var)\s+([A-Z][A-Z0-9_]*_RESPALDO)\b/g)) {
        enLaApp.set(m[1], fichero);
      }
    }
    expect(enLaApp.size, "la app no tiene ni un respaldo: o se han borrado, o esta prueba ya no mira donde debe"
    ).toBeGreaterThan(0);
    const sinDeclarar = [...enLaApp.keys()].filter((n) => !declaradas.has(n));
    expect(sinDeclarar,
      `estas listas viven solo en la app: ${sinDeclarar.map((n) => `${n} (${enLaApp.get(n)})`).join(", ")}. ` +
      `Cada una tiene que salir del motor y declararse en lo_que_la_app_pinta.json, o el día que ` +
      `el motor cambie la app se quedará con su copia vieja sin decirlo`
    ).toEqual([]);
  });

  // Y la dirección contraria: un respaldo declarado que ya no existe en la app
  // es una línea de inventario que no vigila nada, y un inventario en el que no
  // se puede confiar se deja de mirar.
  test("todo lo declarado en el motor existe de verdad en la app", () => {
    const ley = JSON.parse(fs.readFileSync(LEY, "utf-8"));
    const texto = fuentesDeLaApp().map((f) => f.texto).join("\n");
    const fantasmas = ley.listas.map((l) => l.respaldo).filter((n) => !texto.includes(n));
    expect(fantasmas,
      `el motor declara respaldos que la app ya no tiene: ${fantasmas.join(", ")}`
    ).toEqual([]);
  });

  // ⚠️ Y LA QUE DE VERDAD CIERRA LA LEY (12 de septiembre, noche). Mirar solo
  // las constantes `*_RESPALDO` no sirve: una lista NUEVA escrita a mano no se
  // va a llamar así. Elena: «Y eso para todo, cálculos, razas, patologías,
  // lista de alimentos, todo».
  //
  // Así que se recorre `src/` buscando TODA lista escrita a nivel de módulo con
  // cinco entradas o más, y cada una tiene que estar en una de las tres
  // casillas del inventario: sale del motor, es de la app a propósito, o falta
  // por traer. Ninguna puede no estar en ninguna.
  //
  // «Falta por traer» no es aprobarla: es que está CONTADA. Hoy son 15, y las
  // dos peores son `COMO_DAR_ALIMENTO` (91 entradas indexadas por nombre de
  // alimento, contra 163 del catálogo) y las siete copias de los niveles de
  // actividad. Lo que no se puede es que aparezca una nueva sin decir nada.
  test("ninguna lista de la app se queda fuera del inventario", () => {
    const ley = JSON.parse(fs.readFileSync(LEY, "utf-8"));
    const conocidas = new Set([
      ...ley.listas.map((l) => l.respaldo),
      ...ley.de_la_app_a_proposito.map((l) => l.nombre),
      ...ley.faltan_por_traer_del_motor.map((l) => l.nombre),
    ]);
    const sinDeclarar = [];
    for (const { fichero, texto } of fuentesDeLaApp()) {
      const re = /^(?:export\s+)?(?:const|let|var)\s+([A-Z][A-Z0-9_]*)\s*=\s*[[{]/gm;
      for (const m of texto.matchAll(re)) {
        const nombre = m[1];
        if (conocidas.has(nombre)) continue;
        // cuántas entradas de primer nivel tiene
        let prof = 0, comas = 0, i = m.index + m[0].length - 1;
        for (; i < texto.length; i++) {
          const c = texto[i];
          if (c === "[" || c === "{") prof++;
          else if (c === "]" || c === "}") { prof--; if (prof === 0) break; }
          else if (c === "," && prof === 1) comas++;
        }
        if (comas >= 4) sinDeclarar.push(`${nombre} (${fichero}, ~${comas + 1} entradas)`);
      }
    }
    expect(sinDeclarar,
      `estas listas no están en el inventario del motor: ${sinDeclarar.join(", ")}. ` +
      `Cada lista de la app tiene que declararse en lo_que_la_app_pinta.json en una de las tres ` +
      `casillas: sale del motor, es de la app a propósito (y por qué), o falta por traer (y qué ` +
      `riesgo tiene). Una lista sin declarar se queda parada el día que el motor cambie, y no da error`
    ).toEqual([]);
  });

  // Cada lista declarada tiene que decir las cuatro cosas, porque una sin
  // endpoint o sin camino no se puede comprobar por el lado del motor.
  test("cada lista declarada dice de dónde sale", () => {
    const ley = JSON.parse(fs.readFileSync(LEY, "utf-8"));
    for (const l of ley.listas) {
      for (const campo of ["respaldo", "que_es", "endpoint", "camino", "dato_del_motor"]) {
        expect(l[campo], `a «${l.respaldo || "(sin nombre)"}» le falta «${campo}»`).toBeTruthy();
      }
      expect(l.endpoint.startsWith("/"), `«${l.respaldo}» no declara un endpoint`).toBe(true);
    }
  });
});
