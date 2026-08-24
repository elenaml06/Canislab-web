// ─── La burbuja está en TODAS las pantallas ──────────────────────────────────
//
// CASO REAL (24 agosto): "la burbuja de perfiles de perro y configuración
// tiene que existir en todas las pantallas, y en todas las pantallas del
// menú lateral no aparecen. Tiene que estar en todas."
//
// Cierto: la burbuja se puso en las pantallas principales, pero las que se
// abren DESDE el panel lateral (Perfil, Evolución, Mis menús, Analizar, Por
// qué Rawku) tienen su propia cabecera y se quedaron sin ella. Entrabas en
// Evolución y ya no sabías de qué perro estabas viendo la evolución, ni
// podías cambiar sin volver atrás.
//
// POR QUÉ ESTA PRUEBA RECORRE LA LISTA EN VEZ DE MIRAR UNA PANTALLA
// Porque el fallo no es de una pantalla: es de que son SEIS cabeceras
// distintas copiadas, y el día que se añada la séptima nadie se acordará.
// Esto lee las entradas del panel y las abre TODAS, sean las que sean. Una
// pantalla nueva sin burbuja rompe esta prueba el primer día.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA } from "./fake-supabase.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

const configurar = async (request, opciones) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
};

async function entrarYGenerar(page) {
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("button", { name: /Hacer el menú de la semana/ }).click();
  await page.getByRole("button", { name: /^Automático/ }).click();
  await page.getByRole("button", { name: /^(Generar|Hacer)/ }).click();
  // Ya en la pantalla del menú.
  await page.getByRole("button", { name: /Perro actual/ }).waitFor();
}

const laBurbuja = (page) => page.getByRole("button", { name: /Perro actual/ });
const elEngranaje = (page) => page.getByRole("button", { name: "Ajustes" });

// Las pantallas que abre el panel del menú. Va escrita a mano Y contrastada
// con lo que el panel tiene de verdad (última prueba): si alguien añade una
// entrada nueva y no la mete aquí, la prueba se cae y le obliga a mirar si
// su pantalla tiene burbuja. Escribirla sola no valía: el bucle se enredaba
// con las pantallas que se abren encima.
const PANTALLAS_DEL_PANEL = [
  "Perfil de Nala",
  "Evolución y crecimiento",
  "Mis menús",
  "Analizar la dieta actual",
  "Por qué Rawku",
];

test.describe("la burbuja y el engranaje, en todas", () => {
  test("en todas las pantallas que abre el panel lateral", async ({ page, request }) => {
    // Un solo perro: con dos, llegar al menú pide contestar antes qué come
    // cada uno, y eso no es lo que se está probando aquí.
    await configurar(request, {
      retrasoPerrosMs: 50,
      perros: [{ ...PERRO_DE_PRUEBA, dieta_actual: "barf" }],
      menus: [], olvidarUltimoMenu: true,
    });
    await page.goto("/");
    await entrarYGenerar(page);

    for (const etiqueta of PANTALLAS_DEL_PANEL) {
      await page.getByRole("button", { name: "Menú", exact: true }).click();
      await page.getByRole("dialog", { name: "Panel lateral" })
                .getByRole("button", { name: etiqueta, exact: true }).click();

      // ⚠️ NO vale con mirar que EXISTA una burbuja. La pantalla de debajo
      // sigue en el DOM detrás de la sección, con la suya, y Playwright la
      // encuentra igual: quitando la burbuja de las seis cabeceras, esta
      // prueba seguía pasando. Comprobado.
      //
      // Así que se comprueba que FUNCIONA: se toca y tiene que abrirse la
      // hoja de perros. Si la única burbuja está detrás de la sección, el
      // toque no llega y esto se cae, que es lo que tiene que pasar.
      await laBurbuja(page).last().click({ timeout: 5000 });
      await expect(page.getByRole("dialog", { name: "Tus perros" }),
                   `la burbuja de «${etiqueta}» no abre nada`).toBeVisible();
      await page.getByRole("dialog", { name: "Tus perros" })
                .getByRole("button", { name: "Cerrar" }).click()
                .catch(() => page.keyboard.press("Escape"));
      await expect(page.getByRole("dialog", { name: "Tus perros" })).toHaveCount(0);

      await expect(elEngranaje(page).last(), `sin engranaje en «${etiqueta}»`).toBeVisible();

      await page.getByRole("button", { name: /^← Volver/ }).first().click();
    }
  });

  test("y el panel no tiene ninguna pantalla que esta prueba no mire", async ({ page, request }) => {
    // El fallo no fue de una pantalla: fue de que son SEIS cabeceras
    // copiadas y nadie se acordó de la séptima. Esto obliga a acordarse.
    await configurar(request, {
      retrasoPerrosMs: 50,
      perros: [{ ...PERRO_DE_PRUEBA, dieta_actual: "barf" }],
      menus: [], olvidarUltimoMenu: true,
    });
    await page.goto("/");
    await entrarYGenerar(page);

    await page.getByRole("button", { name: "Menú", exact: true }).click();
    const etiquetas = (await page.getByRole("dialog", { name: "Panel lateral" })
                                 .getByRole("button").allInnerTexts())
      .map((t) => t.trim().split("\n")[0].trim())
      .filter(Boolean);

    // "La compra" se comprueba en compra-en-el-panel.spec.js: abre una
    // pantalla propia, no una sección de ésta.
    const sinCubrir = etiquetas.filter(
      (t) => !PANTALLAS_DEL_PANEL.includes(t) && t !== "La compra" && t !== "Cerrar sesión");

    expect(sinCubrir,
      `El panel tiene entradas que la prueba de la burbuja no mira: ${JSON.stringify(sinCubrir)}. ` +
      `Si has añadido una pantalla, añádela a PANTALLAS_DEL_PANEL y comprueba que lleva burbuja.`)
      .toEqual([]);
  });

  test("y desde ahí se puede cambiar de perro sin volver atrás", async ({ page, request }) => {
    // Que se VEA no basta: la burbuja está para poder cambiar. Si estuviera
    // pintada pero muerta, la prueba de arriba pasaría igual.
    //
    // Va por el OTRO camino a propósito: Evolución abierta desde el perfil,
    // que es una llamada distinta a VistaMenus y también se había quedado
    // sin burbuja.
    await configurar(request, {
      retrasoPerrosMs: 50,
      perros: [{ ...PERRO_DE_PRUEBA, dieta_actual: "barf" }, SEGUNDO_PERRO_DE_PRUEBA],
      menus: [], olvidarUltimoMenu: true,
    });
    await page.goto("/");
    await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
    await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.getByRole("button", { name: /Hacer el menú de la semana/ }).waitFor();

    await page.getByRole("button", { name: "Menú", exact: true }).click();
    await page.getByRole("button", { name: "Evolución y crecimiento", exact: true }).click();

    await expect(laBurbuja(page).first()).toBeVisible();
    await laBurbuja(page).first().click();
    const hoja = page.getByRole("dialog", { name: "Tus perros" });
    await expect(hoja.getByRole("button", { name: SEGUNDO_PERRO_DE_PRUEBA.nombre, exact: true }))
      .toBeVisible();
  });
});
