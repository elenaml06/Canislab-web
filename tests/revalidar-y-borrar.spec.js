// ─── Revalidación del menú y borrado de menús guardados ──────────────────────
//
// REVALIDAR: un menú calculado para un cachorro deja de cumplir cuando ese
// perro es adulto (los requisitos FEDIAF cambian por etapa; no basta con
// escalar las calorías). El backend tiene /menu/revalidar para eso, pero la
// web no lo llamaba desde ningún sitio.
//
// Regla de producto que estos tests fijan: la app AVISA, no cambia el menú
// por su cuenta. Quien decide es la usuaria.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

async function configurarBackend(request, opciones) {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function iniciarSesion(page) {
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("button", { name: /Hacer el menú de la semana/ }).waitFor();
}

const menuGuardado = (extra = {}) => ({
  id: "menu-1",
  user_id: CUENTA_DE_PRUEBA.userId,
  perro_id: PERRO_DE_PRUEBA.id,
  modo: "automatico",
  der_real: 1211,
  etapa_label: "Adulto",
  num_menus: 1,
  nombre: "Semana de agosto",
  created_at: "2026-08-01T10:00:00.000Z",
  menus_data: [{ menu: { "Carne muscular de pollo": 420, "Hueso carnoso de pollo": 150 } }],
  ...extra,
});

test.describe("revalidación del menú", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      sinPerro: false, retrasoPerrosMs: 100, colgarGenerador: false, perro: {},
      menus: [menuGuardado()], revalidar: "vale",
    });
  });

  test("si el menú sigue valiendo, no se molesta a la usuaria", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await page.waitForTimeout(1500);

    await expect(page.getByText(/se le ha quedado corto/)).toHaveCount(0);
  });

  test("si ya no cumple, avisa y ofrece el menú corregido — sin cambiarlo solo", async ({ page, request }) => {
    await configurarBackend(request, { revalidar: "corregido" });

    await page.goto("/");
    await iniciarSesion(page);

    await expect(page.getByText(/se le ha quedado corto/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/manganeso se queda en el 68%/)).toBeVisible();
    // Dice qué cambia, para que se pueda decidir con la información delante.
    await expect(page.getByText(/Mejillón de Nueva Zelanda/)).toBeVisible();

    // Y NO ha navegado sola a ningún sitio: seguimos en el perfil.
    await expect(page.getByRole("button", { name: /Hacer el menú de la semana/ })).toBeVisible();
  });

  test("el botón del aviso enseña el menú corregido", async ({ page, request }) => {
    await configurarBackend(request, { revalidar: "corregido" });

    const llamadasAlGenerador = [];
    page.on("request", (req) => {
      if (/\/menu\/(v2|semana)/.test(req.url())) llamadasAlGenerador.push(req.url());
    });

    await page.goto("/");
    await iniciarSesion(page);
    await page.getByRole("button", { name: /Ver el menú corregido/ }).click();

    await expect(page.getByText(/SEMANA DE/i)).toBeVisible();
    await expect(page.getByText(/Mejillón de Nueva Zelanda/).first()).toBeVisible();

    // El menú ya venía hecho de /menu/revalidar conservando lo que se podía:
    // no hay que volver a generar nada desde cero.
    expect(llamadasAlGenerador).toEqual([]);
  });

  test("si no hay arreglo posible, lo dice y manda a hacer uno nuevo", async ({ page, request }) => {
    await configurarBackend(request, { revalidar: "sin_arreglo" });

    await page.goto("/");
    await iniciarSesion(page);

    await expect(page.getByText(/se le ha quedado corto/)).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText(/no hemos encontrado forma de arreglarlo/i)).toBeVisible();
    await page.getByRole("button", { name: /Hacer un menú nuevo/ }).click();
    await expect(page.getByText("Menú semanal")).toBeVisible();
  });
});

test.describe("borrar menús guardados", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      sinPerro: false, retrasoPerrosMs: 100, colgarGenerador: false, perro: {},
      menus: [menuGuardado()], revalidar: "vale",
    });
  });

  test("se puede borrar un menú, pero pregunta antes", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await page.getByRole("button", { name: "Menú", exact: true }).click();
    await page.getByRole("button", { name: /Mis menús/ }).click();
    await expect(page.getByText("Semana de agosto")).toBeVisible();

    await page.getByRole("button", { name: /Borrar el menú/ }).click();
    await expect(page.getByText(/¿Borrar este menú\?/)).toBeVisible();

    // Cancelar no borra nada.
    await page.getByRole("button", { name: "Cancelar" }).click();
    await expect(page.getByText("Semana de agosto")).toBeVisible();

    // Confirmar sí.
    await page.getByRole("button", { name: /Borrar el menú/ }).click();
    await page.getByRole("button", { name: "Borrar", exact: true }).click();
    await expect(page.getByText("Semana de agosto")).toHaveCount(0);
    await expect(page.getByText(/Todavía no hay ningún menú guardado/)).toBeVisible();
  });

  test("el borrado va de verdad a Supabase, no sólo a la pantalla", async ({ page, request }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await page.getByRole("button", { name: "Menú", exact: true }).click();
    await page.getByRole("button", { name: /Mis menús/ }).click();
    await page.getByRole("button", { name: /Borrar el menú/ }).click();
    await page.getByRole("button", { name: "Borrar", exact: true }).click();
    await expect(page.getByText(/Todavía no hay ningún menú guardado/)).toBeVisible();

    const estado = await configurarBackend(request, {});
    expect(estado.menus, "el menú sigue en la base de datos").toBe(0);
  });
});

// ─── La semana entera, no sólo un menú ───────────────────────────────────────
//
// Si alguien come 3 menús distintos a la semana, hay que revisar los 3: los
// requisitos de etapa son los mismos, pero los ALIMENTOS no, así que uno
// puede seguir cumpliendo y otro no.

const rotacionDeTres = () => ({
  id: "menu-rotacion",
  user_id: CUENTA_DE_PRUEBA.userId,
  perro_id: PERRO_DE_PRUEBA.id,
  modo: "automatico",
  der_real: 1211,
  etapa_label: "Adulto",
  num_menus: 3,
  nombre: "Semana de 3 menús",
  created_at: "2026-08-01T10:00:00.000Z",
  menus_data: [
    { menu: { "Carne muscular de pollo": 420, "Hueso carnoso de pollo": 150 } },
    // Éste es el que se ha quedado viejo: lleva el multi de cachorro.
    { menu: { "Carne muscular de ternera": 400, "V-INTEGRA Cachorro": 8 } },
    { menu: { "Carne muscular de pavo": 410, "Hueso carnoso de pavo": 140 } },
  ],
});

test.describe("la semana entera", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      sinPerro: false, retrasoPerrosMs: 100, colgarGenerador: false, perro: {},
      menus: [rotacionDeTres()], revalidar: "por_contenido",
    });
  });

  test("se revisan TODOS los menús de la rotación, no sólo el primero", async ({ page }) => {
    const revalidaciones = [];
    page.on("request", (req) => {
      if (req.url().includes("/menu/revalidar")) revalidaciones.push(req.url());
    });

    await page.goto("/");
    await iniciarSesion(page);
    await expect(page.getByText(/se le han quedado cortos/)).toBeVisible({ timeout: 20_000 });

    expect(revalidaciones.length, "una llamada por menú de la semana").toBe(3);
    // Y el aviso dice cuántos fallan de cuántos.
    await expect(page.getByText(/1 de los 3 menús/)).toBeVisible();
  });

  test("la semana corregida conserva intactos los menús que sí valían", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await page.getByRole("button", { name: /Ver la semana corregida/ }).click();

    await expect(page.getByText(/SEMANA DE/i)).toBeVisible();

    // Los menús se ven de uno en uno, por pestañas. El 1 seguía valiendo:
    // tiene que estar intacto.
    await expect(page.getByText(/Carne muscular de pollo/).first()).toBeVisible();

    // El 2 es el que se ha corregido.
    await page.getByRole("button", { name: /Menú 2/ }).first().click();
    await expect(page.getByText(/Mejillón de Nueva Zelanda/).first()).toBeVisible();
    await expect(page.getByText(/V-INTEGRA Cachorro/)).toHaveCount(0);

    // Y el 3 tampoco se ha tocado.
    await page.getByRole("button", { name: /Menú 3/ }).first().click();
    await expect(page.getByText(/Carne muscular de pavo/).first()).toBeVisible();
  });
});
