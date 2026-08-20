// ─── Evolución y Analizar, alcanzables desde el perfil ───────────────────────
//
// Las dos secciones ya existían, pero estaban programadas DENTRO de
// VistaMenus, que sólo existe cuando acabas de generar un menú. Desde el
// perfil salían en gris con "aún no". Ninguna de las dos necesita un menú:
// una es la ficha de peso y la otra el analizador de dieta.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA } from "./fake-supabase.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

async function configurarBackend(request, opciones) {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
}

async function iniciarSesion(page) {
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("button", { name: /Hacer el menú de la semana/ }).waitFor();
}

const abrirMenuLateral = (page) => page.getByRole("button", { name: "Menú", exact: true }).click();

test.describe("secciones desde el perfil", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      sinPerro: false, retrasoPerrosMs: 100, menus: [],
      colgarGenerador: false, perro: {}, revalidar: "vale",
    });
  });

  test("Evolución se abre desde el perfil, sin haber generado ningún menú", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await abrirMenuLateral(page);

    await page.getByRole("button", { name: /Evolución y crecimiento/ }).click();
    await expect(page.getByText(/Evolución de/)).toBeVisible();
  });

  test("Analizar se abre desde el perfil", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await abrirMenuLateral(page);

    await page.getByRole("button", { name: /Analizar la dieta actual/ }).click();
    await expect(page.getByText(/Dinos qué le estás dando ahora mismo/)).toBeVisible();
  });

  test("no se pinta el ')  : (' de un ternario roto en pantalla", async ({ page }) => {
    // Había un ternario a medio deshacer que JSX trataba como texto: en la
    // pantalla salía literalmente ") : (" y el título dos veces.
    await page.goto("/");
    await iniciarSesion(page);
    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /Analizar la dieta actual/ }).click();
    await expect(page.getByText(/Dinos qué le estás dando/)).toBeVisible();

    const texto = await page.evaluate(() => document.body.innerText);
    expect(texto).not.toContain(") : (");
    // Y el título aparece una vez, no dos.
    expect(texto.split("Analizar la dieta actual").length - 1).toBe(1);
  });

  test("desde una sección se vuelve al perfil, no a unos menús que no existen", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);

    // Primero Premium (modo prueba, sin pago), para ver la sección de
    // verdad y no el candado.
    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /Ver Rawku Premium/ }).click();
    await page.getByRole("button", { name: /Activar Premium \(sin pago\)/ }).click();
    await expect(page.getByRole("button", { name: /Hacer el menú de la semana/ })).toBeVisible();

    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /Analizar la dieta actual/ }).click();
    await expect(page.getByText(/Dinos qué le estás dando/)).toBeVisible();
    await expect(page.getByText("🔒")).toHaveCount(0);

    // El botón dice "volver al perfil", no "volver a los menús": aquí no
    // hay ninguna vista de menús detrás.
    await page.getByRole("button", { name: /Volver/ }).first().click();
    await expect(page.getByRole("button", { name: /Hacer el menú de la semana/ })).toBeVisible();
  });
});

test.describe("el muro de pago nunca encierra", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      sinPerro: false, retrasoPerrosMs: 100, menus: [],
      colgarGenerador: false, perro: {}, revalidar: "vale",
    });
  });

  test("con el candado puesto se puede salir sin pagar", async ({ page }) => {
    // CASO REAL: el overlay de PremiumGate es `fixed inset-0` con z-index
    // 100, así que tapaba la pantalla entera INCLUIDO el botón de volver.
    // Quien entraba sin ser Premium se quedaba encerrado: o pagaba o
    // recargaba la página. Un muro puede bloquear el contenido, nunca la
    // salida.
    await page.goto("/");
    await iniciarSesion(page);
    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /Evolución y crecimiento/ }).click();

    // Sale el candado (el muro está en modo prueba, y aún no es Premium).
    await expect(page.getByText("🔒")).toBeVisible();

    // Y hay salida.
    await page.getByRole("button", { name: /Ahora no, volver/ }).click();
    await expect(page.getByRole("button", { name: /Hacer el menú de la semana/ })).toBeVisible();
  });
});
