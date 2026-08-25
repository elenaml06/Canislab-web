// ─── Si dentro de una especie solo hay un alimento, se elige al pulsarla ─────
//
// CASO REAL (25 agosto): "veo que hay en ciertas categorías alimentos dentro
// de otra subcategoría cuando solo hay un alimento dentro, por ejemplo en
// verduras seleccionas acelga y se abre otra vez para solo poder seleccionar
// acelga... asegúrate de que esto está bien para cada alimento dentro de
// todas las categorías tanto en el analizador de alimentos como en el
// generador de menús y en cualquier otro sitio que se use esto".
//
// ⚠️ LO IMPORTANTE DE ESTE ARCHIVO NO ES QUE PRUEBE DOS PANTALLAS.
// Esto YA se arregló el 5 de agosto. El comentario de entonces, en el
// código, dice literalmente "este era el peor de los TRES SITIOS con este
// problema". Eran cuatro: el analizador se quedó fuera. Y había un quinto,
// los suplementos comerciales, que no había mirado nadie.
//
// Arreglar copias a mano no arregla nada: deja el fallo listo para la
// siguiente pantalla. Por eso ahora hay UN componente, y la última prueba
// de aquí vigila que nadie vuelva a pintar la lista por su cuenta -- que es
// lo único que impide que esto vuelva dentro de veinte días.

import { readFileSync } from "node:fs";
import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

const configurar = async (request, opciones) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
};

// "Acelga" es su propio ejemplo: en el catálogo tiene un único alimento
// dentro. "Pollo" tiene varios, y ése SÍ tiene que abrir el segundo paso --
// si no, no habría forma de elegir entre sus cortes.
const UNA_SOLA = "Acelga";
const VARIAS = "Pollo";

async function entrar(page) {
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("button", { name: /Hacer el menú de la semana/ }).waitFor();
}

test.describe("una especie con un solo alimento se elige de un toque", () => {
  test.beforeEach(async ({ request }) => {
    await configurar(request, {
      retrasoPerrosMs: 50,
      perros: [{ ...PERRO_DE_PRUEBA, dieta_actual: "barf" }],
      menus: [], olvidarUltimoMenu: true,
    });
  });

  test("en el analizador de la dieta —donde ella lo vio", async ({ page }) => {
    await page.goto("/");
    await entrar(page);
    await page.getByRole("button", { name: "Menú", exact: true }).last().click();
    await page.getByRole("dialog", { name: "Panel lateral" })
              .getByRole("button", { name: "Analizar la dieta actual", exact: true }).click();

    await page.getByRole("button", { name: "Verduras y frutas: añadir alimento" }).click();
    await page.getByRole("button", { name: UNA_SOLA, exact: true }).click();

    // Con el fallo, aquí se abría OTRA lista con "Acelga" dentro y no había
    // nada añadido todavía. La señal de que se añadió es su casilla de
    // gramos: es lo único que aparece al elegir de verdad.
    await expect(page.getByPlaceholder("0").first(),
      `pulsar «${UNA_SOLA}» no lo ha añadido: se ha abierto un paso más para elegir lo mismo`)
      .toBeVisible();
  });

  test("y con varios dentro sí abre el segundo paso", async ({ page }) => {
    // Sin esto, "arreglarlo" quitando siempre el segundo paso pasaría la
    // prueba de arriba y dejaría sin poder elegir entre los cortes.
    await page.goto("/");
    await entrar(page);
    await page.getByRole("button", { name: "Menú", exact: true }).last().click();
    await page.getByRole("dialog", { name: "Panel lateral" })
              .getByRole("button", { name: "Analizar la dieta actual", exact: true }).click();

    await page.getByRole("button", { name: "Carne muscular: añadir alimento" }).click();
    await page.getByRole("button", { name: new RegExp(`^${VARIAS}: ver los \\d+ tipos$`) }).click();
    await expect(page.getByText(VARIAS.toUpperCase(), { exact: true }),
      `«${VARIAS}» tiene varios cortes y tiene que dejar elegir cuál`).toBeVisible();
  });

  test("en el generador, al personalizar", async ({ page }) => {
    await page.goto("/");
    await entrar(page);
    await page.getByRole("button", { name: /Hacer el menú de la semana/ }).click();
    await page.getByRole("button", { name: /^Personalizar/ }).click();
    await page.getByRole("button", { name: /^(Generar|Hacer|Elegir)/ }).click();

    await page.getByRole("button", { name: "Verduras y frutas: elijo yo" }).click();
    await page.getByRole("button", { name: "Verduras y frutas: elegir alimento" }).click();
    await page.getByRole("button", { name: UNA_SOLA, exact: true }).click();

    // Elegido de verdad: aparece como etiqueta en la categoría.
    await expect(page.getByText(UNA_SOLA, { exact: true }).first(),
      `pulsar «${UNA_SOLA}» no lo ha elegido`).toBeVisible();
  });
});

test("nadie pinta la lista de especies por su cuenta", () => {
  // ⚠️ ÉSTA es la prueba que faltaba en agosto. Las de arriba comprueban
  // dos pantallas; ésta comprueba que no puede aparecer una tercera con el
  // fallo otra vez, que es lo que pasó.
  //
  // Las cuatro copias que hubo empezaban todas igual: un .map sobre el mapa
  // de especies. Si alguien vuelve a escribir uno, esto se cae y le dice
  // qué usar en su lugar.
  const fuente = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");
  const aMano = fuente
    .split("\n")
    .map((linea, i) => ({ n: i + 1, linea }))
    // La propia <ListaDeEspecies> sí puede: es LA lista.
    .filter(({ linea }) => /\.map\(\(?\[?(especie|tipo)[,)]/.test(linea)
                           && !linea.includes("porEspecie"));

  expect(aMano.map((x) => `${x.n}: ${x.linea.trim().slice(0, 90)}`),
    "Alguien vuelve a pintar la lista de especies a mano. Usa <ListaDeEspecies>: " +
    "es lo que hace que una especie con un solo alimento se elija de un toque, " +
    "y copiar la lista es exactamente como el analizador se quedó veinte días " +
    "con un clic de más que nadie vio.")
    .toEqual([]);
});
