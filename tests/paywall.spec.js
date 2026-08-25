// ─── Muro de pago APAGADO: nada bloqueado ────────────────────────────────────
//
// PEDIDO EXPRESO (22 de agosto): "necesito hacer pruebas de todo y si hay
// cosas a las que no puedo acceder, jodido". Tenía sentido: el muro tapaba
// funciones (varios menús en la semana, evolución, analizar) mientras se está
// probando la app entera, y ahora mismo no protege ningún ingreso — Stripe
// está en modo prueba con precios de sandbox, así que nadie puede pagar.
//
// El interruptor sigue siendo VITE_PAYWALL en Vercel, pero el valor POR
// DEFECTO ha pasado de "demo" a "off". Nada de Stripe se ha tocado: el
// checkout, el webhook y la pantalla de suscripción siguen enteros (el
// BLOQUE 10 del backend los prueba). Lo único que cambia es que no se ofrece
// ni se bloquea nada.
//
// Lo que vigila este archivo es que NO QUEDE NINGÚN CANDADO SUELTO. Un muro
// se quita en un sitio y se olvida en otro con mucha facilidad: basta una
// pantalla que siga mirando `premium` por su cuenta.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA } from "./fake-supabase.js";
import { esperarLaFicha, irAlGenerador } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

async function configurarBackend(request, opciones) {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
}

async function iniciarSesion(page) {
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await esperarLaFicha(page);
}

const abrirMenuLateral = (page) => page.getByRole("button", { name: "Menú", exact: true }).click();

test.describe("con el muro apagado no hay nada bloqueado", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      sinPerro: false, retrasoPerrosMs: 100, menus: [], colgarGenerador: false,
      perro: {}, premium: false,   // cuenta SIN premium: es el caso que importa
    });
  });

  test("no se ofrece Premium por ningún lado", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await abrirMenuLateral(page);

    await expect(page.getByRole("button", { name: /Premium/ })).toHaveCount(0);
    await expect(page.getByText(/Hazte Premium|Ver Rawku Premium/)).toHaveCount(0);
  });

  test("Evolución y Analizar se abren enteras, sin difuminar", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);

    for (const seccion of [/Evolución y crecimiento/, /Analizar la dieta actual/]) {
      await abrirMenuLateral(page);
      await page.getByRole("button", { name: seccion }).click();
      // el candado del PremiumGate: si estuviera, saldría esta llamada a pagar
      await expect(page.getByText(/Esto es de Rawku Premium|Hazte Premium/)).toHaveCount(0);
      await expect(page.locator("[style*='blur']")).toHaveCount(0);
    }
  });

  test("se pueden pedir varios menús para la semana sin pagar", async ({ page }) => {
    // Esto era lo más molesto de probar: el "+" abría el muro en cuanto
    // pasabas de un menú.
    await page.goto("/");
    await iniciarSesion(page);
    await irAlGenerador(page);
    await page.getByRole("button", { name: "Pienso", exact: true }).click();
    await page.getByRole("button", { name: /^Automático/ }).click();

    await page.getByRole("button", { name: "+", exact: true }).click();
    await page.getByRole("button", { name: "+", exact: true }).click();

    // Que el contador vaya por 3 se comprueba en el botón, que lo dice
    // con todas las letras: buscar el texto "3" a secas encuentra
    // cualquier 3 de la pantalla (gramos, días...) y no prueba nada.
    await expect(page.getByRole("button", { name: /^Generar los 3 menús/ })).toBeVisible();
    await expect(page.getByText(/Premium/)).toHaveCount(0);
  });

  test("nada llama a Stripe", async ({ page }) => {
    const llamadas = [];
    page.on("request", (req) => {
      if (req.url().includes("stripe")) llamadas.push(`${req.method()} ${req.url()}`);
    });

    await page.goto("/");
    await iniciarSesion(page);
    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /Evolución y crecimiento/ }).click();
    await page.waitForTimeout(800);

    expect(llamadas, `no debería haber llamado a: ${llamadas.join(", ")}`).toEqual([]);
  });
});
