// ─── El peso objetivo viaja en TODAS las peticiones de menú ─────────────────
//
// POR QUÉ EXISTE (28 de agosto)
//
// FEDIAF, apartado 7.2.5 de las Nutritional Guidelines 2025, dice que cuando
// un perro come menos de lo normal hay que subirle los mínimos de nutrientes
// POR CADA 1000 KCAL:
//
//   «the energy needs may be satisfied before the requirements of protein,
//    minerals or vitamins are met […] hence a systematic adjustment applied
//    to all essential nutrients is needed when fed below…»
//
// La razón es simple: el perro necesita los mismos miligramos de zinc coma lo
// que coma. Si está a dieta y esos miligramos tienen que caber en menos
// calorías, la densidad sube. Medido: a la ración de bajada media (AAHA 2021,
// 63 kcal/kg^0,75) la proteína mínima pasa de 52,10 a 78,6 g/1000 kcal.
//
// El motor lo calcula con `kcal / peso^0,75`, y ese peso tiene que ser EL
// MISMO que se usó para las kcal — que en un perro con sobrepeso es el
// OBJETIVO, no el real. Por eso hace falta `peso_objetivo_kg` en la petición.
//
// Y ESTE ES EL FALLO QUE VIGILA, que es de la peor familia: sin ese campo el
// escalado está implementado en el servidor y APAGADO en la práctica. No da
// error, no cambia la pantalla, no cambia el semáforo. Parece hecho y no lo
// está. Es exactamente lo mismo que `peso_adulto_esperado_kg` y el mínimo de
// calcio de las razas grandes.
//
// El servidor tiene su mitad: si el campo no llega, usa el peso real y escala
// un poco de más, que es el lado seguro. Pero «un poco de más» no es lo que
// se quiere, y en un perro sin sobrepeso los dos pesos coinciden, así que el
// fallo no se notaría nunca mirando un perro normal.

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { irAlGenerador } from "./ayudas.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SUPABASE_FALSO = "http://127.0.0.1:54321";

async function configurarBackend(request, opciones) {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

// Un perro CON SOBREPESO, que es donde los dos pesos se separan. Con uno
// normal esta prueba pasaría aunque se mandara el peso equivocado.
function perroConSobrepeso() {
  return {
    ...PERRO_DE_PRUEBA,
    nombre: "Nala",
    peso_actual: 32.0,
    condicion_idx: 3,          // "rellenito": de aquí sale un objetivo por debajo
    etapa: "adulto",
    tamano: "grande",
    raza: "Pastor alemán",
    fecha_nacimiento: "2021-05-14",
    dieta_actual: "barf",
  };
}

test.describe("el peso objetivo llega al servidor", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      retrasoPerrosMs: 50,
      perros: [perroConSobrepeso()],
      menus: [],
      premium: true,
    });
  });

  test("al generar el menú de un perro con sobrepeso", async ({ page, request }) => {
    await page.goto("/");
    await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
    await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await irAlGenerador(page);

    await page.getByRole("button", { name: /^Automático/ }).click();
    await page.getByRole("button", { name: /^(Generar|Hacer)/ }).click();
    await expect(page.getByText(/Semana de/)).toBeVisible({ timeout: 30000 });

    const { peticionesMenu } = await configurarBackend(request, { olvidarPeticionesMenu: false });
    expect(peticionesMenu.length, "no ha salido ninguna petición de menú").toBeGreaterThan(0);

    for (const [i, p] of peticionesMenu.entries()) {
      expect(typeof p.peso_objetivo_kg,
        `la petición ${i + 1} va sin peso_objetivo_kg. El servidor caerá al peso real y escalará ` +
        `los mínimos de más, sin dar ningún error y sin que se note en pantalla`)
        .toBe("number");
      // Y tiene que ser el OBJETIVO, no el actual: si fueran el mismo número,
      // el campo estaría ahí sin servir para nada, que es el fallo con otra
      // cara. Este perro pesa 32 y su objetivo está por debajo.
      expect(p.peso_objetivo_kg,
        `la petición ${i + 1} manda ${p.peso_objetivo_kg} kg de objetivo y el perro pesa ` +
        `${p.peso_perro_kg}. En un perro con sobrepeso el objetivo tiene que ser MENOR que el ` +
        `peso real — si van iguales, se está mandando el peso actual con otro nombre`)
        .toBeLessThan(p.peso_perro_kg);
    }
  });
});

// ─── Y en los otros caminos, leyendo el código ───────────────────────────────
//
// Mismo motivo que en `peso-adulto-en-cada-peticion.spec.js`: lo que hay que
// vigilar no es el recorrido de cada pantalla, es que el cuerpo de la petición
// lleve el campo. En el backend pasó justo eso con el peso adulto — tres
// llamadas de cuatro lo pasaban y una no, y ninguna prueba lo vio.
test.describe("ningún camino se queda sin mandarlo", () => {
  test("los cinco cuerpos de petición llevan peso_objetivo_kg", () => {
    const app = fs.readFileSync(path.resolve(AQUI, "../src/App.jsx"), "utf-8");

    const CUERPOS = [
      ["llamarRecalculo (/menu/anadir, /menu/quitar, /menu/cambiar)", "const llamarRecalculo"],
      ["cuerpoApiDeUnPerro (/menu/varios-perros)", "function cuerpoApiDeUnPerro"],
      ["la revisión de menús guardados (/menu/revalidar)", "const cuerpoBase = {\n      der_objetivo: derReal,"],
      ["el generador de un menú (/menu/v2)", "`${API_BASE}/menu/v2`"],
      ["la semana entera (/menu/semana)", "const cuerpoBase = {\n            modo: \"automatico\","],
    ];

    for (const [quien, marca] of CUERPOS) {
      const i = app.indexOf(marca);
      expect(i, `no se encuentra en App.jsx el bloque de ${quien} ` +
                `(buscando ${JSON.stringify(marca)}). Si se ha renombrado, hay que actualizar ` +
                `esta prueba -- no borrarla`).toBeGreaterThan(-1);
      // La ventana llega hasta el CIERRE del objeto que se serializa, no un
      // número fijo de caracteres: el cuerpo de /menu/v2 lleva comentarios
      // largos dentro y con 3000 se quedaba corta, dando un falso fallo
      // mientras la petición real sí llevaba el campo. Cortar por el cierre
      // es además lo correcto: así no se puede encontrar por accidente el
      // campo de OTRO cuerpo más abajo y darlo por bueno.
      const cierre = app.indexOf("\n        }),", i);
      const bloque = app.slice(i, cierre > i ? cierre : i + 6000);
      expect(bloque,
        `el cuerpo de ${quien} no manda peso_objetivo_kg. Por ese camino, un perro a dieta ` +
        `recibirá la densidad de nutrientes de un perro normal (o el servidor escalará sobre el ` +
        `peso real y pedirá de más). En ninguno de los dos casos hay error: el menú sale verde`)
        .toContain("peso_objetivo_kg");
    }
  });
});
