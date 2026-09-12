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
import { calcularDER, pctPesoAdultoFediaf, pesoAdultoDesdeCurvaFediaf } from "../src/der.js";

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
        // ⚠️ AÑADIDO (9 sep): sin la edad, el contrato no podía cubrir el ajuste
        // de «adulto joven» de la Tabla VII-6 de FEDIAF, que hasta ese día era
        // código muerto en los dos repos.
        mesesEdad: o.mesesEdad,
      });
    // 1 kcal de margen: las dos implementaciones redondean al final y un
    // decimal distinto en coma flotante no es una divergencia real.
    expect(Math.abs(obtenido - caso.kcal),
      `calcularDER da ${obtenido} kcal y el contrato dice ${caso.kcal}. O se ha ` +
      `tocado la fórmula de la app sin tocar der.py, o al revés.`).toBeLessThanOrEqual(1);
  });
});

// ─── LO QUE EL CONTRATO COMPARTIDO NO PUEDE CUBRIR ──────────────────────────
//
// ⚠️ AÑADIDO (8 septiembre). El respaldo de crecimiento —qué se hace con un
// cachorro del que NO se sabe el peso adulto esperado— no puede vivir en
// `der_casos.json`, y el motivo está escrito en el propio fichero: `der.py`,
// al recibir la edad, DEDUCE el peso adulto con `peso_adulto_desde_curva` y
// pasa a la ecuación de Klein, mientras que `der.js` no tiene esa función
// (la app deduce el peso adulto por su cuenta y lo pasa ya hecho). Con la
// edad los dos toman caminos distintos A PROPÓSITO.
//
// Pero la REGLA sí es la misma en los dos, y hay que vigilarla aquí. Antes
// había una tabla de tres escalones (210 / 175 / 140) por % del peso adulto
// de la que el código leía SIEMPRE el último: un cachorro de dos meses sin
// peso adulto esperado recibía 140 (= 2 x RER), que es lo que corresponde
// DESPUÉS de los cuatro meses. Un 33 % menos de lo que le toca.
//
// FEDIAF no cubre este caso (su ecuación necesita el peso adulto), así que
// manda SACN5, Tabla 5-2, parte 2 canina: «Daily energy intake for growing
// puppies should be 3 x RER from weaning until four months of age. At four
// months of age energy intake should be reduced to 2 x RER until the puppy
// reaches adult size.» 3 x RER = 210 · 2 x RER = 140, y cortan por EDAD.
// ⚠️ Y EL 11 DE SEPTIEMBRE ESO DEJÓ DE SER EL PRIMER RECURSO. «FEDIAF no cubre
// este caso» era FALSO: su Tabla VII-8a publica la curva de crecimiento como
// cinco ecuaciones por banda de peso adulto, válidas de las 8 semanas al año.
// Con la edad y el peso de hoy se despeja el peso adulto y se usa la ecuación
// de Klein, que es la que ya recibían todos los cachorros de raza. El respaldo
// de SACN5 se queda SOLO para lo que FEDIAF no cubre: <8 semanas y >1 año.
test.describe("el crecimiento sin peso adulto: primero FEDIAF, y SACN5 solo fuera de su rango", () => {
  const kcal = (coef, peso) => Math.round(coef * Math.pow(peso, 0.75));
  const klein = (actual, adulto) =>
    Math.round(Math.max((1.063 - 0.565 * Math.min(actual / adulto, 1)) * 239, 98) *
               Math.pow(actual, 0.75));

  test("dentro del rango de FEDIAF se despeja el peso adulto y manda Klein", () => {
    // 5 kg a los 6 meses: la banda ≤7 kg da 36,92·Ln(26,1) − 43,57 = 76,8 %,
    // así que el peso adulto esperado sale ~6,5 kg.
    const got = calcularDER(5, "cachorro_crecimiento", 1, false, { mesesEdad: 6 });
    expect(got, "con edad dentro del rango NO se usa el respaldo de SACN5"
    ).not.toBe(kcal(140, 5));
    const adulto = pesoAdultoDesdeCurvaFediaf(5, 6);
    expect(adulto, "la Tabla VII-8a tiene que dar un peso adulto").toBeGreaterThan(5);
    expect(got).toBe(klein(5, adulto));
  });

  test("el cachorro MESTIZO recibe ya lo mismo que el de raza, que es el arreglo", () => {
    // Es el motivo del cambio: hasta hoy el de raza iba por Klein y el mestizo
    // por un escalón plano, y un cachorro de 10 kg a los 4 meses recibía 1125
    // o 787 según si su raza estaba en la lista.
    const conRaza = calcularDER(10, "cachorro_crecimiento", 1, false,
                                { pesoAdultoKg: 25, mesesEdad: 4 });
    const mestizo = calcularDER(10, "cachorro_crecimiento", 1, false, { mesesEdad: 4 });
    expect(Math.abs(mestizo - conRaza) / conRaza,
      "el mestizo ya no puede quedarse a un tercio del de raza"
    ).toBeLessThan(0.15);
    expect(mestizo, "y desde luego ya no es el escalón plano de 2 x RER"
    ).not.toBe(kcal(140, 10));
  });

  test("por DEBAJO de las 8 semanas, que FEDIAF no cubre, manda SACN5 con 3 x RER", () => {
    const got = calcularDER(5, "cachorro_joven", 1, false, { mesesEdad: 1.5 });
    expect(pesoAdultoDesdeCurvaFediaf(5, 1.5),
      "la Tabla VII-8a vale «from weaning age (8 weeks)», no antes").toBe(null);
    expect(got, "SACN5 da 3 x RER (210 kcal/kg^0,75) hasta los cuatro meses"
    ).toBe(kcal(210, 5));
  });

  test("por ENCIMA del año, que FEDIAF tampoco cubre, manda SACN5 con 2 x RER", () => {
    const got = calcularDER(5, "cachorro_crecimiento", 1, false, { mesesEdad: 14 });
    expect(pesoAdultoDesdeCurvaFediaf(5, 14),
      "la Tabla VII-8a vale «to 1 year», no más").toBe(null);
    expect(got).toBe(kcal(140, 5));
  });

  test("sin edad ni peso adulto se queda en el lado prudente", () => {
    const got = calcularDER(5, "cachorro_crecimiento", 1, false, {});
    expect(got).toBe(kcal(140, 5));
  });

  test("con peso adulto declarado manda ese, no el despejado de la curva", () => {
    // FEDIAF VII-8b: [254,1 − 135,0 × (actual/adulto)] × kg^0,75. Un cachorro
    // de 5 kg que va para 20 está al 25 %: 254,1 − 33,75 = 220,4.
    const got = calcularDER(5, "cachorro_crecimiento", 1, false,
                            { pesoAdultoKg: 20, mesesEdad: 6 });
    expect(got, "con el peso adulto en la mano no se despeja nada"
    ).toBe(klein(5, 20));
  });

  // ⚠️ LA TRAMPA DE LA TABLA VII-8a, sembrada aquí porque es donde muerde: en
  // el texto extraído del PDF sus cinco bandas y sus cinco ecuaciones salen en
  // dos columnas cruzadas, y el término independiente NO es monótono. Quien las
  // empareje «de menor a mayor» las cruza, y el resultado sigue teniendo forma
  // de dato bueno. Esto lo mismo que el BLOQUE 96 del repo del motor.
  test("las cinco ecuaciones de la Tabla VII-8a están en su banda", () => {
    const esperado = [
      [4.0, 3, 0.5125], [8.0, 4, 0.5705], [20.0, 9, 0.8554],
      [35.0, 6, 0.6437], [55.0, 6, 0.5701],
    ];
    for (const [adulto, meses, pct] of esperado) {
      expect(Math.abs(pctPesoAdultoFediaf(meses, adulto) - pct),
        `banda de ${adulto} kg a los ${meses} meses: si falla, las cinco ecuaciones ` +
        `están emparejadas con la banda equivocada (>15-27,5 lleva −60,70 y ` +
        `>27,5-47,5 lleva −56,18: NO es monótono)`).toBeLessThan(0.0005);
    }
  });
});

// ─── EL CORTE DE EARLY GROWTH SON LAS 14 SEMANAS DE FEDIAF ──────────────────
//
// ⚠️ CAMBIADO (9 septiembre). Aquí el corte estaba en «4 meses» —unas 17
// semanas— y se defendía como diferencia deliberada «al lado estricto». Pero
// FEDIAF titula las dos columnas de sus tablas de requisitos «Early Growth
// (< 14 weeks)» y «Late Growth (≥ 14 weeks)», así que el umbral lo pone la
// fuente y no nosotras: tres semanas de más con los requisitos de cachorro
// joven (calcio 2500 contra 2000, fósforo 2250 contra 1750, proteína 62,5
// contra 50) es inventarse un número existiendo el bueno.
//
// De la etapa salen los 43 requisitos, así que este corte decide contra qué
// se verifica el menú. Por eso se prueba por los dos lados del día 98, y no
// solo «un cachorro pequeño sale cachorro joven».
import { determinarEtapa, EARLY_GROWTH_DIAS } from "../src/der.js";

test.describe("el corte de Early Growth", () => {
  test("son las 14 semanas de FEDIAF, no los 4 meses", () => {
    expect(EARLY_GROWTH_DIAS).toBe(98);
  });

  test("el día 97 todavía es cachorro joven y el 98 ya no", () => {
    const edad = (d) => ({ totalDias: d, totalMeses: Math.floor(d / 30.44), anios: 0 });
    expect(determinarEtapa(edad(97), 22)).toBe("cachorro_joven");
    expect(determinarEtapa(edad(98), 22)).toBe("cachorro_crecimiento");
    // Y con el corte viejo de 4 meses, el día 98 seguía siendo cachorro joven:
    // si alguien lo devuelve, esta línea se cae.
    expect(determinarEtapa(edad(120), 22)).toBe("cachorro_crecimiento");
  });

  test("sin `totalDias` se cae al lado estricto, no a Late Growth", () => {
    // Una ficha guardada antes de que existiera el campo. Comparar contra
    // `undefined` daría siempre false y mandaría a un cachorro de dos meses a
    // Late Growth, que pide MENOS: un fallo de datos no puede bajar requisitos.
    expect(determinarEtapa({ totalMeses: 2, anios: 0 }, 22)).toBe("cachorro_joven");
    expect(determinarEtapa({ totalMeses: 5, anios: 0 }, 22)).toBe("cachorro_crecimiento");
  });
});
