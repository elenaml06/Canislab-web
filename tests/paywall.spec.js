// ─── El muro de pago está apagado ────────────────────────────────────────────
//
// Decisión de producto: ahora mismo no se bloquea nada ni se ofrece
// suscripción. El interruptor es PAYWALL_ACTIVO en App.jsx, que se enciende
// poniendo VITE_PAYWALL=on en Vercel (sin tocar código).
//
// Estos tests fijan ese estado, para que no vuelva solo sin querer.

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

test.describe("muro de pago apagado", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      sinPerro: false, retrasoPerrosMs: 100, menus: [], colgarGenerador: false, perro: {},
    });
  });

  test("no se ofrece hacerse Premium por ningún lado", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);

    await expect(page.getByText(/Hazte Premium/)).toHaveCount(0);
    await expect(page.getByText(/Prueba gratis|prueba gratis/)).toHaveCount(0);

    await page.getByRole("button", { name: "Menú", exact: true }).click();
    await expect(page.getByText(/Hazte Premium/)).toHaveCount(0);
  });

  test("nada aparece bloqueado con el candado", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await page.getByRole("button", { name: "Menú", exact: true }).click();

    // El candado de PremiumGate y el aviso de sección bloqueada.
    await expect(page.getByText("🔒")).toHaveCount(0);
  });

  test("se puede pedir más de un menú en rotación", async ({ page }) => {
    // Con el muro encendido, pedir varios menús estaba limitado.
    await page.goto("/");
    await iniciarSesion(page);
    await page.getByRole("button", { name: /Hacer el menú de la semana/ }).click();
    await page.getByRole("button", { name: "Pienso" }).click();
    await page.getByRole("button", { name: /Automático/ }).click();

    // Subir a 3 menús no debe sacar ningún muro de pago.
    await page.getByRole("button", { name: "+" }).click();
    await page.getByRole("button", { name: "+" }).click();
    await expect(page.getByText(/Hazte Premium|Prueba gratis/)).toHaveCount(0);
    await expect(page.getByText("🔒")).toHaveCount(0);
    // Y se puede generar de verdad, no queda un botón muerto detrás del muro.
    await expect(page.getByRole("button", { name: /Generar/i }).first()).toBeEnabled();
  });
});
