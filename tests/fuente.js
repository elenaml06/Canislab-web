// ─── Todo el código de `src/`, en un solo texto ──────────────────────────────
//
// POR QUÉ EXISTE (8 de septiembre)
//
// Hay cuatro pruebas que no miran lo que hace la app: miran cómo está
// ESCRITA. Comprueban que ningún camino se olvide de mandar
// `peso_adulto_esperado_kg`, que nadie vuelva a pintar la lista de especies
// a mano, que la lista de alimentos de la app cuadre con la del motor.
// Son pruebas de código fuente, y hasta hoy todas leían `src/App.jsx`
// directamente.
//
// El día que App.jsx se partió en ocho módulos, tres de esas marcas se
// fueron a otro fichero (`llamarRecalculo` a vistamenus.jsx,
// `CATEGORIAS_ALIMENTO` a catalogoapp.jsx) y las pruebas se quedaron
// buscando en el sitio equivocado. Eso, según la prueba, es fallar
// ruidosamente o pasar sin comprobar nada — y lo segundo es peor.
//
// Leer TODO `src/` quita el problema de raíz: da igual en qué fichero acabe
// cada bloque, y el próximo corte de App.jsx no rompe nada de esto.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../src");

/** El texto de todos los .js/.jsx de src/, concatenado y en orden estable. */
export function fuenteDeLaApp() {
  return fs.readdirSync(SRC)
    .filter((f) => f.endsWith(".js") || f.endsWith(".jsx"))
    .sort()
    // El separador lleva el nombre del fichero para que, cuando una de
    // estas pruebas falle, se pueda ver de un vistazo dónde estaba mirando.
    .map((f) => `\n// ===== src/${f} =====\n` + fs.readFileSync(path.join(SRC, f), "utf-8"))
    .join("\n");
}

/** Las líneas de todos los .js/.jsx de src/, con fichero y número. */
export function lineasDeLaApp() {
  const out = [];
  for (const f of fs.readdirSync(SRC).filter((x) => x.endsWith(".js") || x.endsWith(".jsx")).sort()) {
    fs.readFileSync(path.join(SRC, f), "utf-8").split("\n")
      .forEach((linea, i) => out.push({ fichero: `src/${f}`, n: i + 1, linea }));
  }
  return out;
}
