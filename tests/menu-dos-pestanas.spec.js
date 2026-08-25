// ─── La pantalla del menú tiene dos pestañas, y cada cosa está en la suya ────
//
// POR QUÉ EXISTE ESTE ARCHIVO
// La pantalla del menú era un scroll larguísimo: el plan de transición arriba
// pegado a las tarjetas, la congelación en medio de la pila de avisos, y cómo
// preparar cada alimento escondido detrás del icono de cubiertos de su fila.
// Pedido expreso: "me gusta más el menú, luego cómo darlo, y ya está".
//
// Lo que vigila esto no es que las pestañas existan — eso se ve de un vistazo.
// Vigila que al partir la pantalla no se haya PERDIDO nada por el camino, que
// es lo que puede pasar sin que nadie se entere: un bloque que se queda dentro
// de un condicional que ya no se cumple desaparece sin dar ningún error.
//
// Por eso cada cosa se busca por su TEXTO y se exige que esté en su pestaña y
// NO en la otra. Comprobado que falla si se rompe: dejando la congelación en
// la pestaña del menú, el test la caza.
//
// Y la congelación se mira aparte, con sus números: 1 semana la carne, 2 el
// pescado. No es decoración — es lo que mata los parásitos de la carne cruda,
// y si alguien cambia esos números tiene que costarle una prueba en rojo.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { INSTRUCCIONES_POR_CATEGORIA, COMO_DAR_ALIMENTO } from "../src/instrucciones.js";
import { irAlGenerador } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

async function configurarBackend(request, opciones) {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

// Viene de pienso: así hay plan de transición que comprobar. Con un perro que
// ya come BARF ese bloque no se pinta y la prueba no probaría nada.
const PERRO_DE_PIENSO = { ...PERRO_DE_PRUEBA, dieta_actual: "pienso" };

test.describe("el resultado se lee en dos pestañas", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      retrasoPerrosMs: 100, perros: [PERRO_DE_PIENSO], menus: [],
    });
  });

  async function generarMenu(page) {
    await page.goto("/");
    await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
    await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await irAlGenerador(page);
    await page.getByRole("button", { name: "Pienso", exact: true }).click();
    await page.getByRole("button", { name: /^Automático/ }).click();
    await page.getByRole("button", { name: /^Generar/ }).click();
    await page.getByText(/Menú 1|Carne muscular/).first().waitFor({ timeout: 30000 });
  }

  test("«El menú» enseña los alimentos y NO el cómo darlo", async ({ page }) => {
    await generarMenu(page);

    // Arranca en la pestaña del menú, sin tocar nada.
    await expect(page.getByRole("button", { name: "El menú" })).toHaveAttribute("aria-current", "page");

    // Los alimentos, con su lápiz para cambiarlos: eso NO se ha ido a
    // ninguna parte.
    await expect(page.getByRole("button", { name: /^Cómo preparar / }).first()).toBeVisible();

    // Y lo de cómo darlo no está aquí estorbando.
    await expect(page.getByText(/Plan de transición/)).toHaveCount(0);
    await expect(page.getByText(/Congelación/)).toHaveCount(0);
  });

  test("«Cómo darlo» tiene la transición, la congelación y cómo se prepara cada cosa", async ({ page }) => {
    await generarMenu(page);
    await page.getByRole("button", { name: "Cómo darlo" }).click();

    // 1 · la transición, con sus cuatro escalones
    await expect(page.getByText(/Plan de transición/)).toBeVisible();
    for (const tramo of ["Días 1-3", "Días 4-6", "Días 7-9", "Día 10 en adelante"]) {
      await expect(page.getByText(tramo, { exact: true })).toBeVisible();
    }

    // 2 · la congelación, con los tiempos que dice ESCCAP. Estos dos números
    //     no se tocan sin querer: son los que matan los parásitos.
    const congelacion = page.getByText(/Si preparas este menú con antelación/);
    await expect(congelacion).toBeVisible();
    await expect(congelacion).toContainText("al menos 1 semana");
    await expect(congelacion).toContainText("al menos 2 semanas");

    // 3 · cómo se prepara cada cosa, sin tener que abrir nada. Antes esto
    //     sólo existía detrás del icono de cubiertos de cada fila.
    await expect(page.getByText(/Alimento por alimento/)).toBeVisible();

    // y los alimentos del menú ya no se pintan aquí: para eso está la otra
    await expect(page.getByRole("button", { name: /^Cómo preparar / })).toHaveCount(0);
  });

  test("el botón de confirmar se ve en las dos", async ({ page }) => {
    await generarMenu(page);
    await expect(page.getByRole("button", { name: "Confirmar semana" })).toBeVisible();
    await page.getByRole("button", { name: "Cómo darlo" }).click();
    await expect(page.getByRole("button", { name: "Confirmar semana" })).toBeVisible();
  });

  test("sin transición que hacer, la pestaña sigue teniendo la congelación", async ({ page, request }) => {
    // Un perro que ya come BARF no necesita transición. La pestaña no se
    // puede quedar vacía por eso: la congelación y la preparación valen igual.
    await configurarBackend(request, {
      retrasoPerrosMs: 100, perros: [{ ...PERRO_DE_PRUEBA, dieta_actual: "barf" }], menus: [],
    });
    await page.goto("/");
    await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
    await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await irAlGenerador(page);
    await page.getByRole("button", { name: /^Automático/ }).click();
    await page.getByRole("button", { name: /^Generar/ }).click();
    await page.getByText(/Menú 1|Carne muscular/).first().waitFor({ timeout: 30000 });

    await page.getByRole("button", { name: "Cómo darlo" }).click();
    await expect(page.getByText(/Plan de transición/)).toHaveCount(0);
    await expect(page.getByText(/Si preparas este menú con antelación/)).toBeVisible();
    await expect(page.getByText(/Alimento por alimento/)).toBeVisible();
  });

  test("no se queda ningún alimento del menú sin instrucción", async ({ page }) => {
    // El invariante de verdad: si un alimento está en el menú, cómo se
    // prepara tiene que seguir estando en «Cómo darlo». Al agrupar por
    // categoría es fácil que una se quede fuera sin que nada falle.
    //
    // No se compara contra una lista fija de categorías escrita aquí: eso
    // duplicaría el dato y se quedaría vieja. Se abre el panel de cada
    // alimento en «El menú», se mira QUÉ TEXTO aparece al abrirlo (que es
    // justo su instrucción), y se exige que ese mismo texto esté en la otra
    // pestaña. Así vale con cualquier menú que devuelva el motor.
    await generarMenu(page);

    const cuerpo = async () => (await page.locator("body").innerText()).replace(/\s+/g, " ");

    const botones = page.getByRole("button", { name: /^Cómo preparar / });
    const cuantos = await botones.count();
    expect(cuantos, "el menú no tiene alimentos con instrucción: la prueba no prueba nada")
      .toBeGreaterThan(0);

    const instrucciones = [];
    for (let i = 0; i < cuantos; i++) {
      const b = botones.nth(i);
      const quien = (await b.getAttribute("aria-label")) || `alimento ${i}`;
      const antes = await cuerpo();
      await b.click();
      const despues = await cuerpo();
      // Lo que ha aparecido al abrir el panel. Se coge un trozo largo y
      // distintivo, no la frase entera: sobra para identificarla y no se
      // rompe si cambia una coma al final.
      const desde = diferencia(antes, despues);
      const aparecido = despues.slice(desde, desde + 70).trim();
      expect(aparecido.length, `al abrir «${quien}» no aparece ninguna instrucción`).toBeGreaterThan(20);
      instrucciones.push({ quien, texto: aparecido });
      await b.click();   // cerrar
    }

    await page.getByRole("button", { name: "Cómo darlo" }).click();
    const enComoDarlo = await cuerpo();

    const perdidas = instrucciones
      .filter(({ texto }) => !enComoDarlo.includes(texto))
      .map(({ quien, texto }) => `${quien} — falta «${texto.slice(0, 50)}...»`);

    expect(perdidas, "alimentos del menú cuya preparación no está en «Cómo darlo»").toEqual([]);
  });

  test("los tiempos de congelación se dicen en UN solo sitio", async ({ page }) => {
    // Pedido expreso: "ya tenemos una parte que te dice cuándo congelar
    // las cosas y cuánto tiempo, no necesitamos que en cada alimento esté
    // ahí". Cada categoría lo repetía con sus propias palabras: ocho
    // sitios donde equivocarse y ocho donde contradecirse.
    //
    // ⚠️ La primera versión de esta prueba NO servía: abría el panel de
    // cada alimento EN PANTALLA, que sólo alcanza a los que traiga ese
    // menú. Comprobado — volviendo a meter la congelación a mano en
    // "Carne muscular" pasaba en verde, porque el menú de prueba no lleva
    // carne. Por eso los textos se sacaron a src/instrucciones.js: aquí
    // se recorren TODOS, las 8 categorías y los 77 alimentos, sin
    // depender de lo que devuelva el motor ese día.
    const PLAZOS = /al menos \d+ semanas?|-1[89]\/-20\s*°?C|dentro de \d+ días/i;

    const repiten = [];
    for (const [categoria, texto] of Object.entries(INSTRUCCIONES_POR_CATEGORIA)) {
      const m = texto.match(PLAZOS);
      if (m) repiten.push(`categoría «${categoria}»: «${m[0]}»`);
    }
    for (const [alimento, info] of Object.entries(COMO_DAR_ALIMENTO)) {
      const m = Object.values(info).join(" ").match(PLAZOS);
      if (m) repiten.push(`alimento «${alimento}»: «${m[0]}»`);
    }
    expect(repiten,
      "los tiempos de congelación van sólo en el panel de «Congelación», no repetidos aquí")
      .toEqual([]);

    // Y comprobado que no se han perdido por el camino: el panel los tiene
    // los tres, incluido el plazo tras descongelar, que antes SÓLO existía
    // dentro de los textos que se acaban de limpiar.
    await generarMenu(page);
    await page.getByRole("button", { name: "Cómo darlo" }).click();
    const congelacion = page.getByText(/Si preparas este menú con antelación/);
    // ⚠️ CASO REAL ENCONTRADO POR LA USUARIA (23 agosto): decía
    // "al menos 1 semanacongelados", sin espacio. En JSX, una línea que
    // termina en etiqueta se pega a la siguiente. Por eso no se comprueba
    // "al menos 1 semana" a secas -- eso pasaba EN VERDE con el fallo
    // puesto -- sino la frase entera con la palabra de después.
    await expect(congelacion).toContainText("al menos 1 semana congelados");
    await expect(congelacion).toContainText("al menos 2 semanas —");
    await expect(congelacion).toContainText("dentro de 3 días guardándolo");
  });

  test("lo que SÍ es de cada alimento sigue estando", async () => {
    // El riesgo de limpiar textos es pasarse. Estas tres frases no son de
    // congelación: son de ese alimento, y quitarlas sería quitar
    // seguridad, no repetición.
    expect(INSTRUCCIONES_POR_CATEGORIA["Hueso carnoso"],
      "el hueso cocinado se astilla: eso no se puede perder").toMatch(/nunca cocinado/i);
    expect(INSTRUCCIONES_POR_CATEGORIA["Pescados y mariscos"],
      "crudo sólo si se ha congelado antes: eso es de este alimento").toMatch(/congelado/i);
    expect(COMO_DAR_ALIMENTO["Cuello de pollo"].como,
      "dárselo semicongelado a un tragón es una técnica, no un plazo").toMatch(/semicongelado/i);
  });

  // Primer índice en que dos textos dejan de coincidir. Sirve para saber
  // qué se ha añadido al abrir un panel, sin tener que escribir aquí las
  // instrucciones (que viven en App.jsx y cambiarían por su cuenta).
  function diferencia(a, b) {
    let i = 0;
    while (i < a.length && a[i] === b[i]) i += 1;
    return i;
  }
});
