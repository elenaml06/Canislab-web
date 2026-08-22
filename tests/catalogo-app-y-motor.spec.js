// ─── La app y el motor tienen que conocer los mismos alimentos ───────────────
//
// POR QUÉ EXISTE
// El catálogo de alimentos vive en el backend (alimentos_v3_final.json), pero
// la app tiene SU PROPIA lista (CATEGORIAS_ALIMENTO) para saber de qué
// categoría es cada alimento y qué instrucción de preparación darle.
//
// Son dos listas separadas, y nada las obligaba a coincidir. El 21 de agosto
// se añadieron tres alimentos al backend (corazón de pavo, hígado de pavo,
// hígado de pato) y la app no se enteró: `categoriaDeAlimento` tiene un
// respaldo que devuelve "Extras" para lo que no reconoce, así que un HÍGADO
// aparecía como Extra y se le daba la instrucción de los aceites y las
// semillas — "se añaden crudos por encima al final, nunca se congelan".
// Consejo equivocado, sin ningún error por medio.
//
// Esto no se ve en pantalla salvo que abras justo ese alimento, justo en ese
// menú. Por eso hace falta una prueba y no basta con mirar.

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CATALOGO = path.resolve(AQUI, "../../Canislab-api/alimentos_v3_final.json");

test.describe("la app conoce todos los alimentos del motor", () => {
  test.skip(!fs.existsSync(CATALOGO),
    "El catálogo del backend no está a mano (los dos repos tienen que estar juntos)");

// Los alimentos que ofrece la app: SOLO lo que hay dentro de las listas.
//
// ⚠️ La primera versión cogía cualquier texto entrecomillado del bloque, y
// no servía: se tragaba los comentarios (que citan nombres de alimentos) y
// las claves de especie ("Levadura de cerveza" es una especie, no un
// alimento; sus productos son "GRAU Levadura de cerveza" y otro). Daba
// cinco falsos positivos y ni uno real.
function alimentosQueOfreceLaApp() {
  const app = fs.readFileSync(path.resolve(AQUI, "../src/App.jsx"), "utf-8");
  const ini = app.indexOf("const CATEGORIAS_ALIMENTO");
  if (ini < 0) throw new Error("no se encuentra CATEGORIAS_ALIMENTO en App.jsx");
  const bloque = app.slice(ini, app.indexOf("\n};", ini))
    .split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");   // fuera comentarios
  const nombres = new Set();
  for (const lista of bloque.matchAll(/\[([^\]]*)\]/g)) {
    for (const m of lista[1].matchAll(/"([^"]+)"/g)) nombres.add(m[1]);
  }
  return nombres;
}

function alimentosDelMotor() {
  return JSON.parse(fs.readFileSync(CATALOGO, "utf-8"));
}

  test("ningún alimento del catálogo cae en 'Extras' por no conocerlo", () => {
    const conocidos = alimentosQueOfreceLaApp();

    // Solo los alimentos: los suplementos comerciales tienen su propio
    // camino en la app y no pasan por CATEGORIAS_ALIMENTO.
    const alimentos = alimentosDelMotor()
      .filter((a) => a.tipo === "Alimento").map((a) => a.nombre);
    const desconocidos = alimentos.filter((n) => !conocidos.has(n));

    expect(desconocidos,
      "estos alimentos existen en el motor pero la app no los conoce, así que " +
      "saldrían como 'Extras' con la instrucción de los aceites y las semillas"
    ).toEqual([]);
  });

  test("la app no inventa alimentos que el motor no tiene", () => {
    const enElMotor = new Set(alimentosDelMotor().map((a) => a.nombre));
    const sospechosos = [...alimentosQueOfreceLaApp()].filter((n) => !enElMotor.has(n));

    expect(sospechosos.sort(),
      "la app ofrece alimentos que el motor no tiene: al elegirlos, el menú " +
      "los ignoraría en silencio o fallaría"
    ).toEqual([]);
  });
});
