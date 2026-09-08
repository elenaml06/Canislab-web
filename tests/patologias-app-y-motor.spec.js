// ─── La app y el motor tienen que decir lo mismo de cada patología ──────────
//
// POR QUÉ EXISTE (8 de septiembre)
//
// `App.jsx` lleva su propia lista `PATOLOGIAS` con un campo `segura`, y ese
// campo es EL MISMO dato que `formulable` en `patologias.json` del motor: si
// a este perro se le genera menú automático o se le para en seco. Su propio
// comentario lo admite -- «cualquier cambio de `formulable` en
// patologias.json tiene que reflejarse aquí también» -- y hasta hoy no había
// NADA que lo comprobara.
//
// Es exactamente el fallo de la regla 5 del CLAUDE.md del motor: dos listas
// que tienen que coincidir, ninguna prueba que lo mire, y el menú saliendo
// verde igual mientras divergen. Ya pasó con el catálogo de alimentos
// (`catalogo-app-y-motor.spec.js`), y con la tabla de patologías duplicada
// del `POST /menu`, que se borró justo por esto.
//
// Y hay una TERCERA copia: `tests/fake-supabase.js`, el servidor de mentira
// contra el que corren casi todas estas pruebas. Sus filas están puestas a
// mano. Si se separan de la realidad, las pruebas siguen pasando contra una
// ficción -- que es literalmente lo que ya pasó en este repo con
// `dentro_de_rango`: «las pruebas pasaban, porque el Supabase de mentira
// devolvía el nombre equivocado igual que el código».
//
// ⚠️ ESTA PRUEBA NO SE SALTA SOLA SI FALTA EL MOTOR. Falla y dice qué
// clonar. `catalogo-app-y-motor.spec.js` tenía un `test.skip` que la daba
// por buena cuando el repo del motor no estaba al lado, y llevó días en
// verde sin ejecutarse mientras un desajuste estaba en producción. Un
// desajuste que no se puede comprobar no es un desajuste que no existe.

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const TABLA = path.resolve(AQUI, "../../Canislab-api/patologias.json");

function tablaDelMotor() {
  if (!fs.existsSync(TABLA)) {
    throw new Error(
      "No se encuentra patologias.json del motor en " + TABLA + ".\n" +
      "Los dos repos tienen que estar clonados uno al lado del otro:\n" +
      "  git clone https://github.com/elenaml06/Canislab-api\n" +
      "Esta prueba NO se salta: compara si la app y el motor dicen lo mismo " +
      "sobre a qué perro se le genera menú, y no comprobarlo no es lo mismo " +
      "que que esté bien.");
  }
  return JSON.parse(fs.readFileSync(TABLA, "utf-8")).patologias;
}

// Las patologías que ofrece la app, con su `segura`. Se lee del bloque
// `const PATOLOGIAS = [...]` de App.jsx, sin comentarios: los comentarios de
// ese bloque citan claves y valores, y contarlos daría falsos positivos.
function patologiasQueOfreceLaApp() {
  const app = fs.readFileSync(path.resolve(AQUI, "../src/App.jsx"), "utf-8");
  const ini = app.indexOf("const PATOLOGIAS = [");
  if (ini < 0) throw new Error("no se encuentra `const PATOLOGIAS` en App.jsx");
  const bloque = app.slice(ini, app.indexOf("\n];", ini))
    .split("\n").map((l) => l.replace(/^\s*\/\/.*$/, "")).join("\n");
  const salida = new Map();
  for (const m of bloque.matchAll(/\{\s*key:\s*"([^"]+)"[\s\S]*?segura:\s*(true|false)/g)) {
    salida.set(m[1], m[2] === "true");
  }
  if (salida.size === 0) throw new Error("no se ha leído ninguna patología de App.jsx");
  return salida;
}

test.describe("la app y el motor dicen lo mismo de cada patología", () => {
  test("toda patología que ofrece la app existe en el motor", () => {
    const motor = tablaDelMotor();
    const inventadas = [...patologiasQueOfreceLaApp().keys()].filter((k) => !(k in motor));

    expect(inventadas.sort(),
      "la app ofrece patologías que el motor no conoce: al marcarlas, el " +
      "motor las ignoraría y el menú saldría verde sin tenerlas en cuenta"
    ).toEqual([]);
  });

  test("`segura` de la app es `formulable` del motor, patología por patología", () => {
    const motor = tablaDelMotor();
    const desacuerdos = [];
    for (const [clave, segura] of patologiasQueOfreceLaApp()) {
      const formulable = motor[clave]?.formulable;
      if (formulable === undefined) continue;   // lo caza la prueba de arriba
      if (Boolean(formulable) !== segura) {
        desacuerdos.push(
          `${clave}: la app dice segura=${segura} y el motor dice formulable=${formulable}`);
      }
    }

    expect(desacuerdos.sort(),
      "la app y el motor no dicen lo mismo sobre si a este perro se le genera " +
      "menú automático. Con `segura: true` y `formulable: false` la app deja " +
      "pasar a alguien que el servidor va a rechazar al final del generador; " +
      "al revés, asusta con un aviso que ya no aplica. Es una DECISIÓN CLÍNICA " +
      "escrita en la interfaz: el dato vive en patologias.json"
    ).toEqual([]);
  });

  // ─── Y EL SERVIDOR DE MENTIRA NO PUEDE MENTIR EN LO QUE DECIDE ───────────
  //
  // Sus textos SÍ pueden ser de mentira (la pantalla solo los pinta). Lo que
  // no puede inventarse son los campos de los que cuelga una rama del código:
  // si el mock dice `formulable: true` donde el motor dice `false`, la prueba
  // que cubre esa pantalla pasa y la pantalla está mal.
  // Los que el endpoint devuelve como `false` cuando no están en el fichero.
  const BOOLEANOS = new Set([
    "formulable", "formulable_por_profesional", "necesita_bajo_fediaf",
    "solo_en_adulto",
  ]);
  const CAMPOS_QUE_DECIDEN = [
    "formulable", "formulable_por_profesional", "necesita_bajo_fediaf",
    "nutriente_frontera", "objetivo_terapeutico_por_1000kcal",
    "solo_en_adulto", "en_crecimiento",
  ];

  test("el servidor de mentira no contradice al motor en lo que decide", () => {
    const motor = tablaDelMotor();
    const fake = fs.readFileSync(path.resolve(AQUI, "./fake-supabase.js"), "utf-8");
    const ini = fake.indexOf('if (ruta === "/patologias")');
    expect(ini, "el servidor de mentira ya no sirve /patologias").toBeGreaterThan(-1);
    const bloque = fake.slice(ini, fake.indexOf("\n    if (ruta ===", ini + 10));

    const problemas = [];
    // Cada fila del mock: `clave: { ... },` en el primer nivel de `patologias`
    for (const m of bloque.matchAll(/\n          ([a-z_0-9]+): \{([\s\S]*?)\n          \},/g)) {
      const clave = m[1];
      const cuerpo = m[2];
      const real = motor[clave];
      if (!real) { problemas.push(`${clave}: el mock la sirve y el motor no la tiene`); continue; }

      for (const campo of CAMPOS_QUE_DECIDEN) {
        const hit = cuerpo.match(new RegExp(`\\b${campo}:\\s*("[^"]*"|true|false|null|[0-9.]+)`));
        if (!hit) continue;                      // el mock no lo declara: no miente
        const enElMock = JSON.parse(hit[1]);
        // El mock imita `GET /patologias`, no el JSON en bruto: el endpoint
        // normaliza lo que no está puesto. Un campo booleano ausente sale
        // `false` y el resto sale `null`. Comparar contra el fichero crudo
        // daría catorce falsos positivos de «null vs false» y ni uno real.
        const enElMotor = real[campo] === undefined
          ? (BOOLEANOS.has(campo) ? false : null)
          : real[campo];
        if (JSON.stringify(enElMock) !== JSON.stringify(enElMotor)) {
          problemas.push(`${clave}.${campo}: el mock dice ${JSON.stringify(enElMock)} y el motor ${JSON.stringify(enElMotor)}`);
        }
      }

      // Los topes y los suelos: nutriente y valor, que es lo que se pinta y
      // lo que un veterinario lee como una cifra real.
      for (const [grupo, campoMotor] of [["topes", "topes_por_1000kcal"],
                                         ["suelos", "suelos_por_1000kcal"]]) {
        const trozo = cuerpo.match(new RegExp(`${grupo}: \\[([\\s\\S]*?)\\],\\n`));
        if (!trozo) continue;
        const delMock = [...trozo[1].matchAll(/nutriente:\s*"([^"]+)",\s*unidad:\s*"[^"]*",\s*valor:\s*([0-9.]+)/g)]
          .map((x) => [x[1], Number(x[2])]);
        const delMotor = Object.entries(real[campoMotor] || {}).map(([n, t]) => [n, t.valor]);
        for (const [nutriente, valor] of delMock) {
          const real1 = delMotor.find(([n]) => n === nutriente);
          if (!real1) problemas.push(`${clave}.${grupo}: el mock inventa ${nutriente}`);
          else if (real1[1] !== valor) {
            problemas.push(`${clave}.${grupo}.${nutriente}: el mock dice ${valor} y el motor ${real1[1]}`);
          }
        }
      }
    }

    expect(problemas.sort(),
      "el servidor de mentira contradice al motor en campos de los que cuelga " +
      "una rama del código. Un servidor de mentira solo comprueba lo que ya " +
      "sabes: si miente aquí, las pruebas pasan y la pantalla está mal"
    ).toEqual([]);
  });
});
