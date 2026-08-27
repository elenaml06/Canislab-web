// EL CONTRATO DEL DER — que la fórmula de la app no se separe de la del servidor.
//
// ⚠️ POR QUÉ EXISTE. Las kcal diarias de un perro se calculan DOS VECES en
// este proyecto: en `src/der.js` (aquí) y en `der.py` (repo de la API).
// Misma fórmula, mismos coeficientes por actividad y edad, las mismas
// listas de razas de más y de menos gasto, el mismo +10 por macho entero y
// por convivir con otros perros. Escrito dos veces, en dos lenguajes, en
// dos repositorios.
//
// Y LA QUE MANDA ES ESTA: la app calcula el DER y lo manda al servidor en
// `der_objetivo`. Si las dos se separan, el usuario ve unas kcal en
// pantalla y el motor cumple los 30 requisitos de FEDIAF sobre OTRAS -- y
// ninguna de las dos da error, porque cada una por separado es coherente
// consigo misma. De la etapa y de las kcal salen los requisitos: es la
// misma familia de fallos silenciosos que `ficha-ida-y-vuelta.spec.js`.
//
// CÓMO FUNCIONA. `der_casos.json` es el mismo archivo en los dos repos: 85
// casos con sus kcal. Esta prueba comprueba la implementación de AQUÍ; el
// BLOQUE 23 de `pruebas_completas.py` comprueba la de allí. Ninguna de las
// dos necesita al otro repo. Si tocas la fórmula en un lado, la prueba de
// ESE lado se cae en el acto y te obliga a mirar el otro.
//
// SI EL CAMBIO ES A PROPÓSITO: se regeneran los esperados y se copia
// `der_casos.json` A LOS DOS REPOS. Los dos commits, o ninguno.
import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { calcularDER } from "../src/der.js";

const ACTIVIDADES = ["sedentario", "normal", "activo", "muy_activo", "trabajo"];
const contrato = JSON.parse(readFileSync(new URL("../der_casos.json", import.meta.url)));

test("el contrato trae todos los casos", () => {
  // Si alguien recorta la lista, deja de cubrir etapas o regímenes de peso
  // enteros y la prueba pasaría igual sin vigilar nada.
  expect(contrato.casos.length).toBeGreaterThanOrEqual(80);
  const etapas = new Set(contrato.casos.map((c) => c.etapa));
  for (const e of ["adulto", "senior", "cachorro_joven", "cachorro_crecimiento",
                   "gestante_temprana", "gestante_tardia", "lactante"]) {
    expect(etapas.has(e), `el contrato ya no cubre la etapa '${e}'`).toBe(true);
  }
});

contrato.casos.forEach((caso, i) => {
  const o = caso.opciones || {};
  const extra = Object.keys(o).length ? ` ${JSON.stringify(o)}` : "";
  const est = caso.esterilizado ? " esterilizado" : "";
  test(`${i + 1}. DER ${caso.etapa} ${caso.peso}kg ${caso.actividad}${est}${extra}`, () => {
    const obtenido = calcularDER(
      caso.peso, caso.etapa, ACTIVIDADES.indexOf(caso.actividad), caso.esterilizado,
      {
        pesoAdultoKg: o.pesoAdultoKg,
        pesoIdealKg: o.pesoIdealKg,
        raza: o.raza,
        machoEntero: !!o.machoEntero,
        conOtrosPerros: !!o.conOtrosPerros,
        nCachorros: o.nCachorros,
        semanaLactancia: o.semanaLactancia === undefined ? 3 : o.semanaLactancia,
      });
    // 1 kcal de margen: las dos implementaciones redondean al final y un
    // decimal distinto en coma flotante no es una divergencia real.
    expect(Math.abs(obtenido - caso.kcal),
      `calcularDER da ${obtenido} kcal y el contrato dice ${caso.kcal}. O se ha ` +
      `tocado la fórmula de la app sin tocar der.py, o al revés.`).toBeLessThanOrEqual(1);
  });
});
