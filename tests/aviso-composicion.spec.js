// ─── Por qué a este menú le faltan las vísceras ───────────────────────────────
//
// El backend puede devolver un menú que cumple los 30 requisitos pero al
// que le falta una categoría entera: pasa cuando el perro tiene varias
// alergias y no queda ninguna víscera compatible. En ese caso manda
// "aviso_composicion" explicándolo.
//
// La web NO lo leía en ningún sitio (0 referencias). Así que un perro
// alérgico recibía un menú raro y sin explicación: parece un error.
//
// El segundo test es el importante, y prueba un fallo sutil: al editar un
// alimento la composición puede cambiar. Si vuelven a entrar las vísceras,
// el aviso tiene que DESAPARECER. Leyéndolo con `||` en vez de `??`, el
// null que manda el servidor caería al valor de la generación y el aviso
// se quedaría pegado para siempre, mintiendo.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA } from "./fake-supabase.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";
const AVISO = "Con las restricciones de este perro no había forma de incluir vísceras " +
              "sin incumplir algo. El menú cumple igualmente los 30 requisitos y todos " +
              "los límites de seguridad.";

async function configurarBackend(request, opciones) {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function iniciarSesion(page) {
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

async function generarMenu(page) {
  await page.goto("/");
  await iniciarSesion(page);
  await page.getByRole("button", { name: /Hacer el menú de la semana/ }).click();
  await page.getByRole("button", { name: "Pienso" }).click();
  await page.getByRole("button", { name: /Automático/ }).click();
  await page.getByRole("button", { name: /Generar/i }).first().click();
  await expect(page.getByText(/SEMANA DE/i)).toBeVisible({ timeout: 30_000 });
}

test.describe("aviso de composición", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      sinPerro: false, retrasoPerrosMs: 150, menus: [],
      colgarGenerador: false, perro: {},
      avisoComposicion: null, avisoComposicionAlEditar: null,
    });
  });

  test("si al menú le falta una categoría, se explica por qué", async ({ page, request }) => {
    await configurarBackend(request, { avisoComposicion: AVISO });
    await generarMenu(page);

    await expect(page.getByText("Sobre la composición")).toBeVisible();
    await expect(page.getByText(/no había forma de incluir vísceras/i)).toBeVisible();
  });

  test("si no falta nada, no se enseña ningún aviso", async ({ page, request }) => {
    // Un aviso que sale siempre no se lee nunca.
    await configurarBackend(request, { avisoComposicion: null });
    await generarMenu(page);

    await expect(page.getByText("Sobre la composición")).toHaveCount(0);
  });

  test("el aviso se puede cerrar", async ({ page, request }) => {
    await configurarBackend(request, { avisoComposicion: AVISO });
    await generarMenu(page);

    await expect(page.getByText("Sobre la composición")).toBeVisible();
    await page.getByRole("button", { name: "Cerrar el aviso sobre la composición" }).click();
    await expect(page.getByText("Sobre la composición")).toHaveCount(0);
  });
});
