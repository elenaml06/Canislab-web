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

    // ⚠️ Antes hacía falta activar Premium de prueba para ver la sección
    // en vez del candado. Con el muro apagado (VITE_PAYWALL="off" por
    // defecto desde el 22 de agosto) no hay candado que esquivar.
    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /Analizar la dieta actual/ }).click();
    await expect(page.getByText(/Dinos qué le estás dando/)).toBeVisible();
    await expect(page.getByText("🔒")).toHaveCount(0);

    // ⚠️ CAMBIADO (24 agosto) — pedido expreso: "lo de volver y volver al
    // menú en las pantallas que se eligen desde el menú lateral, FUERA.
    // Para algo hay una pestaña de menú para elegir a dónde te quieres
    // mover". Ya no hay botón de volver aquí: se sale por el panel.
    //
    // Lo que esta prueba vigila NO ha cambiado, y es lo importante: que la
    // salida lleve a un sitio que EXISTE. Antes el botón decía "volver a
    // los menús" y detrás no había ninguna vista de menús. Ahora el panel,
    // en este modo, ofrece "Hacer el menú de la semana" -- que es
    // justamente lo que hay: no un menú hecho, sino el generador.
    await expect(page.getByRole("button", { name: /^← Volver/ })).toHaveCount(0);

    // ⚠️ El panel es UNO solo desde el 24 de agosto, con cinco entradas
    // fijas. Aquí no hay ningún menú hecho, así que la salida a un sitio
    // que EXISTE -- que es lo que esta prueba vigila desde el principio --
    // es el perfil del perro.
    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /^Perfil de/ }).click();
    await expect(page.getByRole("button", { name: /Hacer el menú de la semana/ })).toBeVisible();
  });
});

// ⚠️ PARADO (22 agosto) — este bloque prueba el CANDADO, y el muro está
// apagado por defecto (VITE_PAYWALL="off"): no hay candado que probar, así
// que estas pruebas no pueden pasar tal cual.
//
// NO se borran: lo que vigilan es un fallo real y grave -- el overlay del
// muro tapaba la pantalla entera y dejaba a la usuaria encerrada sin poder
// salir sin pagar. El día que el muro se vuelva a encender, esto tiene que
// volver a correr ANTES de desplegarlo. Está apuntado en PENDIENTE.
test.describe("el muro de pago nunca encierra", () => {
  test.skip(true, "el muro está apagado (VITE_PAYWALL=off): reactivar junto con él");
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
