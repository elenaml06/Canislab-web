// ─── QUÉ PREMIOS LE DAS, NO SOLO CUÁNTOS ─────────────────────────────────────
//
// ⚠️ PEDIDO EXPRESO (Elena, 19 de septiembre de 2026):
//
//     «ADEMÁS no me pregunta qué tipo de premios le das. Que dijimos que tenía
//      que preguntarlo»
//
// Y lo había pedido antes, el 16: «tiene que haber una parte en la que elija lo
// que le da y se meta en el plato».
//
// ⚠️ EL MOTOR YA SABÍA HACERLO Y LA APP NO SE LO PEDÍA NUNCA. `premios_declarados`
// ({nombre: gramos}) existe en el modelo de `/menu/v2` desde el 16 de
// septiembre, con su justificación escrita -- es lo que hace el formulador de
// Sean Delaney, coeditor de Fascetti & Delaney: «Some of these can be selected
// as "Treats & Enticers" when creating a recipe (...) no more than 10% of daily
// calories IF NOT CALLED FOR AND ACCOUNTED FOR SPECIFICALLY IN THE RECIPE».
// Declarado = está en la receta. Es la regla 6 por la mitad que no se ve: el
// motor sirve la capacidad y no la usa nadie.
//
// LA DIFERENCIA, que es lo que esto protege: un premio SIN declarar son kcal a
// ciegas -- el motor formula la ración con las que quedan y le sigue exigiendo
// el día entero de nutrientes. Un premio DECLARADO entra en el plato como
// gramos fijos y sus nutrientes cuentan. Si la app no lo manda, el dueño ve que
// ha declarado 60 g de pavo y el motor formula como si no existieran.
import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { irAlGenerador } from "./ayudas.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));

const SUPABASE_FALSO = "http://127.0.0.1:54321";

const configurar = async (request, opciones) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
};

const entrar = async (page) => {
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
};

test.describe("declarar qué premios come", () => {
  test("lo declarado viaja en la petición, con sus gramos", async ({ page, request }) => {
    await configurar(request, {
      premium: true, retrasoPerrosMs: 50, menus: [],
      perros: [{ ...PERRO_DE_PRUEBA, dieta_actual: "barf",
                 premios_nivel: "hasta_el_maximo",
                 premios_declarados: { "Zanahoria": 25 } }],
    });
    await entrar(page);
    await irAlGenerador(page);
    await page.getByRole("button", { name: /^Automático/ }).click();
    await page.getByRole("button", { name: /^(Generar|Hacer)/ }).click();
    await expect(page.getByText(/Semana de/)).toBeVisible({ timeout: 30_000 });

    const { peticionesMenu } = await configurar(request, { olvidarPeticionesMenu: false });
    expect((peticionesMenu || []).length, "no ha salido ninguna petición").toBeGreaterThan(0);
    for (const [i, p] of peticionesMenu.entries()) {
      expect(p.premios_declarados,
        `la petición ${i + 1} no lleva los premios declarados. El dueño los ha dicho y el motor ` +
        `va a formular como si no estuvieran en el plato`)
        .toEqual({ "Zanahoria": 25 });
    }
  });

  // ⚠️ LA OTRA DIRECCIÓN, y hace falta: si el campo se mandara SIEMPRE, un
  // perro que no come nada fuera de su ración llevaría una declaración vacía y
  // esta prueba no distinguiría «lo manda cuando toca» de «lo manda siempre».
  test("sin premios declarados, el campo va vacío y no inventa nada",
    async ({ page, request }) => {
      await configurar(request, {
        premium: true, retrasoPerrosMs: 50, menus: [],
        perros: [{ ...PERRO_DE_PRUEBA, dieta_actual: "barf",
                   premios_nivel: "ninguno", premios_declarados: null }],
      });
      await entrar(page);
      await irAlGenerador(page);
      await page.getByRole("button", { name: /^Automático/ }).click();
      await page.getByRole("button", { name: /^(Generar|Hacer)/ }).click();
      await expect(page.getByText(/Semana de/)).toBeVisible({ timeout: 30_000 });

      const { peticionesMenu } = await configurar(request, { olvidarPeticionesMenu: false });
      for (const p of peticionesMenu || []) {
        expect(p.premios_declarados,
          "va una declaración de premios en un perro que no come nada fuera de su ración")
          .toBeFalsy();
      }
    });

  // ⚠️ Y QUE LA PREGUNTA SOLO SALGA CUANDO TIENE RESPUESTA. Preguntarle CUÁLES
  // a quien ha contestado «ninguno» es una pregunta sin respuesta posible, y
  // una pantalla con preguntas que no van a ninguna parte es la que se abandona.
  //
  // ⚠️ SE MIRA EL FUENTE, y va dicho en vez de disfrazarlo de prueba de
  // pantalla: llegar al paso 5 del cuestionario del dueño por el navegador
  // cuesta rellenar la ficha entera, y la primera versión de esto -- que
  // entraba sin perro y buscaba el texto -- pasaba en verde con la condición
  // QUITADA. Una prueba que no se cae con el fallo puesto es peor que no
  // tenerla. Esto sí se cae: comprobado.
  test("la pregunta de CUÁLES está atada a haber contestado CUÁNTOS", () => {
    const app = fs.readFileSync(path.resolve(AQUI, "../src/App.jsx"), "utf-8");
    const apariciones = [...app.matchAll(/textosDeDeclararPremios\(vocab, "(dueno|veterinario)"\)\.pregunta/g)];
    expect(apariciones.length,
      "no se pinta la pregunta de QUÉ premios en ninguna pantalla").toBe(2);
    for (const m of apariciones) {
      // Los 400 caracteres de delante tienen que traer la guarda. Si alguien la
      // quita, a quien contesta «ninguno» se le pregunta cuáles de los ninguno.
      const antes = app.slice(Math.max(0, m.index - 400), m.index);
      expect(antes,
        `la pregunta de QUÉ premios (registro ${m[1]}) se pinta sin comprobar que los premios ` +
        `pasen del techo. Por debajo del 10 % el motor los cuenta como fracción y formula ` +
        `igual, así que esa pregunta no cambiaría nada y alarga la ficha`)
        .toContain("hayQueDeclararLosPremios(vocab, perfil.premiosNivel)");
    }
  });
});

// ─── Y QUE NINGÚN CAMINO SE QUEDE SIN MANDARLO ───────────────────────────────
//
// ⚠️ ASÍ SE PIERDEN ESTAS COSAS, y en este repo ya ha pasado con `patologias`
// («se olvidó una vez en la edición y una sola edición tiraba el tope») y con
// `modo_de_preparacion`. Son SEIS cuerpos de petición y cada uno se escribe
// aparte: el que se olvide formula la ración como si esos gramos no estuvieran
// en el plato, sin dar ningún error y con el menú en verde.
//
// Se mira el FUENTE y no el recorrido de cada pantalla a propósito: recorrer
// los seis caminos por el navegador cuesta minutos y aun así solo prueba los
// que a uno se le ocurran.
test("los seis cuerpos de petición llevan premios_declarados", () => {
  const app = fs.readFileSync(path.resolve(AQUI, "../src/App.jsx"), "utf-8");
  const formulador = fs.readFileSync(path.resolve(AQUI, "../src/formulador.jsx"), "utf-8");
  const CUERPOS = [
    [app, "llamarRecalculo (/menu/anadir, /menu/quitar, /menu/cambiar)", "const llamarRecalculo"],
    [app, "cuerpoApiDeUnPerro (/menu/varios-perros)", "function cuerpoApiDeUnPerro"],
    [app, "la revisión de menús guardados (/menu/revalidar)", "const cuerpoBase = {\n      der_objetivo: derReal,"],
    [app, "el generador de un menú (/menu/v2)", "`${API_BASE}/menu/v2`"],
    [app, "la semana entera (/menu/semana)", "const cuerpoBase = {\n            modo: \"automatico\","],
    [formulador, "el formulador del veterinario (/formular/*)", "premios_nivel:"],
  ];
  for (const [fuente, quien, marca] of CUERPOS) {
    const i = fuente.indexOf(marca);
    expect(i, `no se encuentra el bloque de ${quien} (buscando ${JSON.stringify(marca)}). ` +
              `Si se ha renombrado hay que actualizar esta prueba — no borrarla`)
      .toBeGreaterThan(-1);
    const cierre = fuente.indexOf("\n        }),", i);
    const bloque = fuente.slice(i, cierre > i ? cierre : i + 6000);
    expect(bloque,
      `el cuerpo de ${quien} no manda premios_declarados. Por ese camino los premios que el ` +
      `dueño ha declarado NO entran en el plato: el motor formula como si no existieran, sin ` +
      `dar ningún error`)
      .toContain("premios_declarados:");
  }
});

// ─── EL TECHO LO PONE EL MOTOR, NO LA APP ────────────────────────────────────
//
// ⚠️ Elena, 19 de septiembre de 2026: «habíamos dicho que si son más del 10 %,
// ¿no? Que si son menos del 10 %, los ignoramos». Eso es exactamente lo que
// hace el motor: solo recorta la escalera y pide que declares cuando
// `kcal_premios / DER > FRACCION_MAXIMA_DE_PREMIOS` y no has declarado nada.
//
// ⚠️ Y EL 10 % NO PUEDE VIVIR EN LA APP. Se siembra un techo INVENTADO (30 %)
// con unos porcentajes inventados: si la pregunta sigue saliendo donde salía,
// es que la app lleva el número escrito dentro y el día que la fuente lo mueva
// la app seguiría preguntando donde no toca.
test("dónde sale la pregunta lo decide el techo que sirve el motor", () => {
  const app = fs.readFileSync(path.resolve(AQUI, "../src/App.jsx"), "utf-8");
  expect(app,
    "el 10 % está escrito a mano en la condición de la pregunta. Tiene que salir de "
    + "`techo_recomendado_pct`, que lo sirve el motor")
    .not.toMatch(/hayQueDeclararLosPremios[\s\S]{0,600}?(pct\s*>\s*10|>\s*0\.1\b)/);
  expect(app,
    "`hayQueDeclararLosPremios` no lee el techo del motor")
    .toMatch(/hayQueDeclararLosPremios[\s\S]{0,600}?techo_recomendado_pct/);
});
