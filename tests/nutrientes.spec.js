// ─── LOS 41 NUTRIENTES, AGRUPADOS Y SIN PERDER NINGUNO ──────────────────────
//
// El motor devuelve tres listas (faltan / se pasan / dentro) y esa es la
// forma correcta para decidir si un menú sale. No es la forma en que se lee
// una ficha: un veterinario quiere los minerales juntos y los aminoácidos
// juntos. Aquí solo se reordena -- y lo que se vigila es que reordenar no
// pierda nada por el camino, que es lo que haría un filtro por lista blanca.
import { test, expect } from "@playwright/test";
import { GRUPOS, agruparNutrientes, resumenDeLaFicha, nombreLegible } from "../src/nutrientes.js";

// Los 41 de la Tabla III-3b, copiados de `MAPA` (verificar.py). Si el motor
// añade uno y aquí no está, esta lista se queda corta y hay que tocarla a
// mano -- a propósito: es una decisión, no un descuido.
const LOS_41 = [
  "Proteína_total", "Grasa_total", "Calcio", "Fósforo", "Potasio", "Sodio",
  "Cloruro", "Magnesio", "Cobre", "Yodo", "Hierro", "Manganeso", "Selenio",
  "Zinc", "Vitamina_A", "Vitamina_D", "Vitamina_E", "Tiamina", "Riboflavina",
  "Acido_pantotenico", "Vitamina_B6", "Vitamina_B12", "Niacina", "Folato",
  "Colina", "Linoleico", "Linolénico", "Araquidónico", "EPA_DHA_total",
  "Arginina", "Histidina", "Isoleucina", "Leucina", "Lisina", "Metionina",
  "Metionina_cistina", "Fenilalanina", "Fenilalanina_tirosina", "Treonina",
  "Triptofano", "Valina",
];

test("los 41 de FEDIAF tienen grupo, y ninguno está dos veces", () => {
  const enGrupos = GRUPOS.flatMap((g) => g.nutrientes);
  expect(new Set(enGrupos).size).toBe(enGrupos.length);   // ninguno repetido
  // Los 41 nutrientes MÁS la relación Ca:P, que el motor devuelve en las
  // mismas listas aunque no sea un nutriente: es una relación, y se lee al
  // lado del calcio y el fósforo. Son las 42 filas que devuelve verificar().
  expect([...enGrupos].sort()).toEqual([...LOS_41, "Relación Ca:P"].sort());
});

test("un nutriente que el motor añada mañana NO desaparece: cae en Otros", () => {
  // Es la diferencia entre reordenar y filtrar. Un filtro por lista blanca
  // escondería el nutriente nuevo y la ficha diría 41 donde el motor dice 42
  // -- sin un solo error.
  const grupos = agruparNutrientes({
    faltan: [], se_pasa: [],
    dentro_de_rango: [{ nutriente: "Nutriente_del_futuro", tiene: 1, minimo: 0.5, maximo: null }],
  });
  expect(grupos.map((g) => g.titulo)).toContain("Otros");
});

test("dentro de cada grupo, primero lo que hay que mirar", () => {
  const grupos = agruparNutrientes({
    faltan: [{ nutriente: "Calcio", tiene: 0.2, necesita: 1.4, cubre_pct: 14 }],
    se_pasa: [{ nutriente: "Fósforo", tiene: 3.1, maximo: 2.5, veces: 1.24 }],
    dentro_de_rango: [{ nutriente: "Sodio", tiene: 1.1, minimo: 0.8, maximo: null }],
  });
  const minerales = grupos.find((g) => g.titulo === "Minerales");
  expect(minerales.filas.map((f) => f.nutriente)).toEqual(["Fósforo", "Calcio", "Sodio"]);
  expect(minerales.cuantos).toEqual({ se_pasa: 1, falta: 1, dentro: 1 });
});

test("los grupos vacíos no se pintan", () => {
  // En una ración a medias media tabla está vacía, y una lista de títulos
  // sin nada debajo es ruido.
  const grupos = agruparNutrientes({
    faltan: [{ nutriente: "Calcio", tiene: 0.2, necesita: 1.4 }], se_pasa: [], dentro_de_rango: [],
  });
  expect(grupos.map((g) => g.titulo)).toEqual(["Minerales"]);
});

test("sin ficha no se inventa nada", () => {
  expect(agruparNutrientes(null)).toEqual([]);
  expect(resumenDeLaFicha(null)).toEqual({ falta: 0, se_pasa: 0, dentro: 0, total: 0 });
});

test("el resumen cuenta lo que hay", () => {
  expect(resumenDeLaFicha({
    faltan: [1, 2], se_pasa: [3], dentro_de_rango: [4, 5, 6],
  })).toEqual({ falta: 2, se_pasa: 1, dentro: 3, total: 6 });
});

test("los nombres se leen sin guiones bajos", () => {
  expect(nombreLegible("Metionina_cistina")).toBe("Metionina cistina");
  expect(nombreLegible("EPA_DHA_total")).toBe("EPA DHA total");
});
