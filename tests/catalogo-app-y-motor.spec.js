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
import { fuenteDeLaApp } from "./fuente.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const CATALOGO = path.resolve(AQUI, "../../Canislab-api/alimentos_v3_final.json");

// ⚠️ ESTA PRUEBA SE SALTABA SOLA, Y SALTARSE ES SALIR EN VERDE.
//
// Hasta el 8 de septiembre aquí ponía:
//
//     test.skip(!fs.existsSync(CATALOGO), "El catálogo del backend no está
//     a mano (los dos repos tienen que estar juntos)");
//
// Que es exactamente la enfermedad contra la que existe esta prueba. En
// cualquier sitio donde `Canislab-api` no esté al lado — un portátil
// recién clonado, un runner de CI, Vercel — se saltaba, salía en verde, y
// el hígado de pato podía volver a aparecer como "Extra" con la
// instrucción de los aceites sin que nadie viera nada.
//
// Ahora FALLA y dice qué hacer. Si te falta el repo hermano, el arreglo es
// clonarlo, no saltarse la comprobación.
if (!fs.existsSync(CATALOGO)) {
  throw new Error(
    `No encuentro el catálogo del motor en ${CATALOGO}.\n` +
    "Esta prueba compara la lista de alimentos de la app con la del backend, " +
    "así que necesita los dos repos como hermanos:\n\n" +
    "    <carpeta>/canislab-web      (este)\n" +
    "    <carpeta>/Canislab-api\n\n" +
    "    git clone https://github.com/elenaml06/Canislab-api ../Canislab-api\n"
  );
}

test.describe("la app conoce todos los alimentos del motor", () => {

// Los alimentos que ofrece la app: SOLO lo que hay dentro de las listas.
//
// ⚠️ La primera versión cogía cualquier texto entrecomillado del bloque, y
// no servía: se tragaba los comentarios (que citan nombres de alimentos) y
// las claves de especie ("Levadura de cerveza" es una especie, no un
// alimento; sus productos son "GRAU Levadura de cerveza" y otro). Daba
// cinco falsos positivos y ni uno real.
function alimentosQueOfreceLaApp() {
  const app = fuenteDeLaApp();
  const ini = app.indexOf("export const CATEGORIAS_ALIMENTO");
  if (ini < 0) throw new Error("no se encuentra CATEGORIAS_ALIMENTO en src/ (vivía en App.jsx; desde el 8 de septiembre, en catalogoapp.jsx)");
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

  // ─── Y LA CATEGORÍA TIENE QUE SER LA MISMA ────────────────────────────────
  //
  // ⚠️ AÑADIDO EL 8 DE SEPTIEMBRE, después de que este archivo dejara pasar
  // un desajuste que llevaba un día en producción.
  //
  // Las dos comprobaciones de arriba miran si el alimento EXISTE en los dos
  // sitios, y las dos daban verde con "Laringe de vacuno" ofrecida en la app
  // como "Hueso carnoso" cuando en el motor era "Extras" desde el 7 de
  // septiembre. Existía en los dos lados; lo que no coincidía era la
  // CATEGORÍA, y eso no lo miraba nadie.
  //
  // Importa porque la categoría es lo que decide qué pasa al elegirlo: un
  // alimento ofrecido en la categoría equivocada se puede elegir, no hace
  // nada, y el menú sale verde igual -- que es literalmente el fallo que
  // describe la regla 5 del CLAUDE.md del backend ("elegir en las que sobran
  // no hará nada y nadie se enterará"). La laringe además es cartílago con 66
  // mg de calcio: como hueso carnoso no aporta el calcio que su categoría
  // promete.
  //
  // "Suplementos comerciales" queda fuera a propósito: es un grupo paraguas
  // de la app cuyas subclaves ("Multivitamínico", "Omega-3", "Yodo"...) sí
  // son las categorías reales del motor, así que comparar el nombre del
  // paraguas contra el catálogo daría un falso positivo por cada suplemento.
  test("la app no ofrece ningún alimento en una categoría que no es la suya", () => {
    const app = fuenteDeLaApp();
    const ini = app.indexOf("export const CATEGORIAS_ALIMENTO");
    const bloque = app.slice(ini, app.indexOf("\n};", ini))
      .split("\n").map((l) => l.replace(/\/\/.*$/, "")).join("\n");

    const categoriaEnElMotor = new Map(
      alimentosDelMotor().map((a) => [a.nombre, a.categoria]));

    const desajustes = [];
    for (const [, categoria, cuerpo] of bloque.matchAll(/\n  "([^"]+)": \{([\s\S]*?)\n  \},/g)) {
      if (categoria === "Suplementos comerciales") continue;
      for (const [, lista] of cuerpo.matchAll(/"[^"]+":\s*\[([^\]]*)\]/g)) {
        for (const [, alimento] of lista.matchAll(/"([^"]+)"/g)) {
          const real = categoriaEnElMotor.get(alimento);
          if (real && real !== categoria) {
            desajustes.push(`${alimento}: la app lo ofrece en «${categoria}» y el motor dice «${real}»`);
          }
        }
      }
    }

    expect(desajustes.sort(),
      "la app ofrece alimentos en una categoría distinta a la del motor: se " +
      "pueden elegir, no hacen lo que la categoría promete, y el menú sale " +
      "verde igual -- nadie se entera"
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
