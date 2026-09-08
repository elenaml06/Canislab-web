// ─── La app no le da al dueño reglas que el motor no tiene ──────────────────
//
// POR QUÉ EXISTE (8 de septiembre)
//
// CASO REAL. `src/instrucciones.js` le decía al dueño, en la pestaña «Cómo
// darlo» de Pescados y mariscos: «Si usas atún u otro pescado grande, no más
// de 1 vez por semana». Esa regla existió en el motor como
// `TOPE_MERCURIO_DIAS_SEMANA = 1` y **se borró el 25 de agosto**, con dos
// motivos escritos en `motor/seguridad.py`:
//
//   · no la leía ninguna línea del repositorio, o sea que era una regla
//     declarada y no aplicada;
//   · y no tiene base en perros — es una transposición de las guías de
//     FDA/EFSA para embarazadas y niños pequeños.
//
// O sea: el motor retiró una regla por no tener respaldo, y la app se la
// siguió dando al dueño **catorce días**. Nadie se enteró porque no es un
// error: es un texto, y los textos no fallan solos.
//
// Es la misma familia que `catalogo-app-y-motor.spec.js` y
// `patologias-app-y-motor.spec.js`, con la diferencia de que aquí lo que se
// desincroniza no es un dato sino una FRASE. Y una frase con una cifra
// dentro es un dato: la sección 8 del encargo de cierre lo dice tal cual --
// «ningún número nutricional puede vivir en el front, ni un texto que diga
// una cifra».
//
// QUÉ COMPRUEBA, exactamente: que la app no le dé al dueño una regla de
// FRECUENCIA («x veces por semana») sobre un alimento, mientras el motor no
// tenga ninguna. El motor razona por CONCENTRACIÓN — el atún no puede pasar
// del 10 % de las kcal del día (`TOPE_MERCURIO_KCAL`) — y eso ya lo aplica
// él, dentro del solver, sin que el dueño tenga que contar nada.

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SEGURIDAD = path.resolve(AQUI, "../../Canislab-api/motor/seguridad.py");

// ⚠️ LOS COMENTARIOS FUERA ANTES DE MIRAR NADA, Y EN ESTE ORDEN.
//
// Esta prueba busca frases dentro de CADENAS. Los comentarios de este repo
// citan justo las frases retiradas (el de arriba mismo cita la del atún), así
// que contarlos daría un falso positivo permanente y la prueba nacería rota.
//
// Se quitan las líneas que son comentario ENTERAS y los bloques /* */. No se
// intenta limpiar un `//` a media línea: para eso hay que limpiar las cadenas
// primero, y un `https://…` dentro de una cadena se lee como comentario y se
// come el resto de la línea con su llave de cierre. Ya pasó en este repo.
function cadenasDe(fichero) {
  const bruto = fs.readFileSync(fichero, "utf-8");
  const sinComentarios = bruto
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .split("\n")
    .filter((l) => !/^\s*\/\//.test(l))
    .join("\n");
  return [...sinComentarios.matchAll(/"((?:[^"\\]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)]
    .map((m) => m[1] ?? m[2]);
}

// «1 vez por semana», «dos veces a la semana», «3 días a la semana»…
const REGLA_DE_FRECUENCIA =
  /\b(\d+|un|una|dos|tres|cuatro|cinco)\s+(vez|veces|d[ií]a|d[ií]as)\s+(por|a la)\s+semana\b/i;

test.describe("la app no da reglas que el motor no aplica", () => {
  test("el motor sigue sin tener ninguna regla de frecuencia semanal", () => {
    expect(fs.existsSync(SEGURIDAD),
      "No se encuentra motor/seguridad.py del motor en " + SEGURIDAD + ".\n" +
      "Los dos repos tienen que estar clonados uno al lado del otro:\n" +
      "  git clone https://github.com/elenaml06/Canislab-api\n" +
      "Esta prueba NO se salta: comprueba que la app no le dé al dueño una " +
      "regla de seguridad que el motor retiró por no tener base en perros."
    ).toBe(true);

    // Solo las CONSTANTES declaradas, no los comentarios: `seguridad.py`
    // explica en un comentario largo por qué se quitó `TOPE_MERCURIO_DIAS_
    // SEMANA`, y ese comentario tiene que poder seguir ahí.
    const declaradas = fs.readFileSync(SEGURIDAD, "utf-8")
      .split("\n")
      .filter((l) => /^[A-Z_]+\s*=/.test(l))
      .filter((l) => /DIAS_SEMANA|VECES_SEMANA|FRECUENCIA/.test(l));

    expect(declaradas,
      "el motor ha vuelto a declarar una regla de frecuencia semanal. Si es a " +
      "propósito, la app puede volver a decirla — pero entonces hay que " +
      "actualizar esta prueba y el texto A LA VEZ, que es justo lo que no pasó " +
      "cuando se retiró"
    ).toEqual([]);
  });

  test("ningún texto de la app le pide al dueño contar veces por semana", () => {
    const ficheros = ["../src/instrucciones.js", "../src/texto.js", "../src/cesta.js"]
      .map((f) => path.resolve(AQUI, f))
      .filter((f) => fs.existsSync(f));

    const infracciones = [];
    for (const f of ficheros) {
      for (const cadena of cadenasDe(f)) {
        if (REGLA_DE_FRECUENCIA.test(cadena)) {
          infracciones.push(`${path.basename(f)}: «${cadena.slice(0, 120)}…»`);
        }
      }
    }

    expect(infracciones.sort(),
      "la app le da al dueño una regla de «x veces por semana» y el motor no " +
      "tiene ninguna. El motor razona por CONCENTRACIÓN (el atún no puede " +
      "pasar del 10 % de las kcal del día, y eso lo aplica él dentro del " +
      "solver): pedirle además al dueño que lleve una cuenta semanal es una " +
      "regla que nadie comprueba y que en el caso del mercurio ni siquiera " +
      "tiene base en perros"
    ).toEqual([]);
  });
});
