// ─── Muro de pago en modo "prueba" ───────────────────────────────────────────
//
// Decisión de producto: el cobro de verdad todavía no está montado
// (/stripe/checkout no responde), pero Premium no se quita de la app. Modo
// "demo": se ve, se puede encender y apagar al momento, y no se cobra nada.
//
// El interruptor es VITE_PAYWALL en Vercel: "demo" (por defecto), "off"
// (nada bloqueado, Premium oculto) y "on" (el de verdad, con Stripe).

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

test.describe("muro de pago en modo prueba", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      sinPerro: false, retrasoPerrosMs: 100, menus: [], colgarGenerador: false, perro: {},
    });
  });

  test("se puede activar Premium sin pagar, y se queda activado", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);

    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /Ver Rawku Premium/ }).click();

    // Queda claro que no se cobra nada.
    await expect(page.getByText(/el pago todavía no está activo/)).toBeVisible();
    await page.getByRole("button", { name: /Activar Premium \(sin pago\)/ }).click();

    // Ya es Premium: la oferta desaparece y aparece el interruptor.
    await abrirMenuLateral(page);
    await expect(page.getByText(/Premium de prueba activo/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Ver Rawku Premium/ })).toHaveCount(0);
  });

  test("Premium de prueba sobrevive a recargar la página", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /Ver Rawku Premium/ }).click();
    await page.getByRole("button", { name: /Activar Premium \(sin pago\)/ }).click();

    await page.reload();
    await page.getByRole("button", { name: /Hacer el menú de la semana/ }).waitFor();
    await abrirMenuLateral(page);
    await expect(page.getByText(/Premium de prueba activo/)).toBeVisible();
  });

  test("se puede volver a apagar, para ver la app como quien no es Premium", async ({ page }) => {
    // Sin esto, en cuanto lo enciendes una vez ya no hay forma de
    // comprobar cómo se ve la app sin Premium.
    await page.goto("/");
    await iniciarSesion(page);
    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /Ver Rawku Premium/ }).click();
    await page.getByRole("button", { name: /Activar Premium \(sin pago\)/ }).click();

    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /Premium de prueba activo/ }).click();

    await abrirMenuLateral(page);
    await expect(page.getByRole("button", { name: /Ver Rawku Premium/ })).toBeVisible();
    await expect(page.getByText(/Premium de prueba activo/)).toHaveCount(0);
  });

  test("activar Premium de prueba NO llama a Stripe ni toca la cuenta", async ({ page }) => {
    // El modo prueba se guarda sólo en este navegador: si escribiera el
    // plan en Supabase, dejaría cuentas de verdad marcadas como premium
    // que luego habría que limpiar a mano.
    const llamadas = [];
    page.on("request", (req) => {
      const u = req.url();
      if (u.includes("stripe") || (u.includes("/rest/v1/profiles") && req.method() !== "GET")) {
        llamadas.push(`${req.method()} ${u}`);
      }
    });

    await page.goto("/");
    await iniciarSesion(page);
    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /Ver Rawku Premium/ }).click();
    await page.getByRole("button", { name: /Activar Premium \(sin pago\)/ }).click();
    await page.waitForTimeout(1000);

    expect(llamadas, `no debería haber llamado a: ${llamadas.join(", ")}`).toEqual([]);
  });
});
