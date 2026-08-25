// ─── Menús guardados ─────────────────────────────────────────────────────────
//
// Cubre tres cosas que estaban rotas o directamente no existían:
//
//   1. Los menús se guardaban con `perro_id` vacío. La llamada era
//      `guardarMenu(usuario.id, null, {...})`, y ese `null` era el perro.
//      Como `getMenus(perroId)` filtra por esa columna, ningún menú
//      guardado se podía encontrar jamás.
//
//   2. `getMenus` no se llamaba desde ningún sitio: estaba escrita en
//      supabase.js y nunca se usaba. Los menús entraban en la base de
//      datos y no volvían a salir.
//
//   3. No había ninguna pantalla para verlos.
//
// El Supabase de mentira filtra DE VERDAD por perro_id (ver
// fake-supabase.js), así que si se volviera a guardar un perro_id vacío,
// estos tests lo notarían en vez de pasar por casualidad.

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

const abrirMenuLateral = (page) => page.getByRole("button", { name: "Menú", exact: true }).click();

// Un menú tal y como lo devuelve la API y lo guarda la app.
const menuDeEjemplo = (extra = {}) => ({
  id: "menu-sembrado-1",
  user_id: CUENTA_DE_PRUEBA.userId,
  perro_id: PERRO_DE_PRUEBA.id,
  modo: "automatico",
  der_real: 1211,
  etapa_label: "Adulto",
  num_menus: 1,
  nombre: null,
  created_at: "2026-08-01T10:00:00.000Z",
  menus_data: [{ menu: { "Carne muscular de pollo": 420, "Hueso carnoso de pollo": 150 } }],
  ...extra,
});

test.describe("menús guardados", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, { sinPerro: false, retrasoPerrosMs: 150, menus: [], olvidarUltimoMenu: true });
  });

  test("un menú generado se guarda con el perro_id de su perro", async ({ page, request }) => {
    // Ésta es LA prueba del arreglo: antes aquí llegaba null y el menú
    // quedaba huérfano para siempre.
    await page.goto("/");
    await iniciarSesion(page);

    await page.getByRole("button", { name: /Hacer el menú de la semana/ }).click();
    await page.getByRole("button", { name: "Pienso" }).click();
    await page.getByRole("button", { name: /Automático/ }).click();
    await page.getByRole("button", { name: /Generar/i }).first().click();

    await expect(page.getByText(/SEMANA DE/i)).toBeVisible({ timeout: 30_000 });

    const estado = await configurarBackend(request, {});
    expect(estado.ultimoMenuGuardado, "no llegó ningún menú a Supabase").toBeTruthy();
    expect(estado.ultimoMenuGuardado.perro_id).toBe(PERRO_DE_PRUEBA.id);
    expect(estado.ultimoMenuGuardado.user_id).toBe(CUENTA_DE_PRUEBA.userId);
  });

  test("los menús guardados se leen y aparecen en Mis menús", async ({ page, request }) => {
    await configurarBackend(request, {
      menus: [
        menuDeEjemplo({ id: "m1", nombre: "Semana de agosto" }),
        menuDeEjemplo({ id: "m2", nombre: "Semana de julio", created_at: "2026-07-01T10:00:00.000Z" }),
      ],
    });

    await page.goto("/");
    await iniciarSesion(page);

    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /Mis menús/ }).click();

    await expect(page.getByText("Semana de agosto")).toBeVisible();
    await expect(page.getByText("Semana de julio")).toBeVisible();
  });

  test("se puede abrir un menú guardado y ver su contenido", async ({ page, request }) => {
    await configurarBackend(request, { menus: [menuDeEjemplo({ nombre: "Semana de agosto" })] });

    await page.goto("/");
    await iniciarSesion(page);
    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /Mis menús/ }).click();
    await page.getByText("Semana de agosto").click();

    // Se ve el menú, con el alimento que tenía guardado.
    await expect(page.getByText(/SEMANA DE/i)).toBeVisible();
    await expect(page.getByText(/Carne muscular de pollo/).first()).toBeVisible();
  });

  test("abrir un menú guardado NO lo regenera por detrás", async ({ page, request }) => {
    // La pantalla de resultado tiene un useEffect que genera un menú cada
    // vez que se entra en ella. Si un menú guardado se abriera ahí, se
    // machacaría justo el que se quería ver. Por eso usa pantalla propia.
    await configurarBackend(request, { menus: [menuDeEjemplo({ nombre: "Semana de agosto" })] });

    const llamadasAlGenerador = [];
    page.on("request", (req) => {
      if (/\/menu\/(v2|semana)/.test(req.url())) llamadasAlGenerador.push(req.url());
    });

    await page.goto("/");
    await iniciarSesion(page);
    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /Mis menús/ }).click();
    await page.getByText("Semana de agosto").click();
    await expect(page.getByText(/SEMANA DE/i)).toBeVisible();
    await page.waitForTimeout(1500);

    expect(llamadasAlGenerador, `se llamó al generador: ${llamadasAlGenerador.join(", ")}`).toEqual([]);
  });

  test("sin menús guardados, Mis menús se abre y dice que no hay ninguno", async ({ page, request }) => {
    // ⚠️ CAMBIADO (24 agosto). Antes esta entrada salía en gris, sin poder
    // abrirse. Ahora el panel es EL MISMO siempre -- pedido expreso -- así
    // que la entrada está y la pantalla explica que aún no hay nada.
    //
    // Lo que vigila esta prueba no ha cambiado: que no te lleve a una
    // pantalla en blanco donde no se entienda qué pasa.
    await configurarBackend(request, { menus: [] });

    await page.goto("/");
    await iniciarSesion(page);
    await abrirMenuLateral(page);
    await page.getByRole("button", { name: "Mis menús", exact: true }).click();

    await expect(page.getByText(/Todavía no hay ningún menú guardado/)).toBeVisible();
  });
});

test("desde Mis menús se puede hacer otro menú", async ({ page, request }) => {
  // ⚠️ PEDIDO EXPRESO (25 agosto): "cuando entras en mis menús, tiene que
  // haber un botón para generar otro nuevo menú". Es la pantalla donde ves
  // los que ya tienes, o sea justo donde te das cuenta de que te hace falta
  // otro. Antes había que salir a la ficha del perro, que es el último
  // sitio donde alguien lo va a buscar.
  await configurarBackend(request, { menus: [], olvidarUltimoMenu: true });
  await page.goto("/");
  await iniciarSesion(page);

  await abrirMenuLateral(page);
  await page.getByRole("button", { name: /Mis menús/ }).click();
  await expect(page.getByText(/Los menús de/)).toBeVisible();

  await page.getByRole("button", { name: /Hacer otro menú/ }).click();

  // Y lleva al generador de verdad, no a una pantalla en blanco: la
  // primera pregunta es cómo quieres el menú.
  await expect(page.getByRole("button", { name: /^Automático/ }),
    "el botón no lleva al generador").toBeVisible();
});
