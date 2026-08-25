// ─── Cambiar de menú refresca las cantidades ─────────────────────────────────
//
// CASO REAL (25 agosto): "cuando te genera varios menús y te pones a cambiar
// las cantidades que le tienes que dar según si es para toda la semana o
// para un solo día, y cambias de menú, no se refresca automáticamente la
// pantalla del siguiente menú, como que tienes que darle a algún botón de un
// día o para toda la semana para que se refresquen las cantidades... y esto
// puede ser un problema".
//
// Lo era, y más de lo que parecía. El número de días era UNO SOLO para todas
// las pestañas, pero cada menú cubre los suyos: con dos menús, el primero
// dura 4 días y el segundo 3. Estando en el menú 1 con "toda la semana" (4),
// al pasar al 2 el número seguía siendo 4 -- así que se veían las cantidades
// de CUATRO días de un menú que se da TRES. No es un refresco que falta: es
// cocinar de más.
//
// La prueba mira el NÚMERO DE DÍAS que dice la pantalla, no si hay un botón
// marcado: lo que hace daño es el gramaje, no el resalte.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

const configurar = async (request, opciones) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
};

test("al cambiar de menú, las cantidades son las de ESE menú", async ({ page, request }) => {
  await configurar(request, {
    retrasoPerrosMs: 50, premium: true,
    perros: [{ ...PERRO_DE_PRUEBA, dieta_actual: "barf" }],
    menus: [], olvidarUltimoMenu: true,
  });
  await page.addInitScript(() => window.localStorage.setItem("rawku_premium_demo", "si"));
  await page.goto("/");

  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("button", { name: /Hacer el menú de la semana/ }).click();
  await page.getByRole("button", { name: /^Automático/ }).click();
  // Dos menús: la semana se reparte 4 y 3 días. Con uno solo, el fallo no
  // puede existir -- hace falta que los dos duren distinto.
  await page.getByRole("button", { name: "+", exact: true }).click();
  await page.getByRole("button", { name: /^(Generar|Hacer)/ }).click();
  await expect(page.getByText(/Semana de Nala/)).toBeVisible({ timeout: 20000 });

  // Menú 1: pedir la tanda entera, 4 días.
  await page.getByRole("button", { name: /Toda la semana \(4 días\)/ }).click();
  await expect(page.getByText(/gramos totales para 4 días/)).toBeVisible();

  // Y ahora al menú 2, que dura 3. Sin tocar nada más.
  await page.getByRole("button", { name: /^Menú 2/ }).click();

  await expect(page.getByText(/gramos totales para 3 días/),
    "el menú 2 dura 3 días y se están enseñando las cantidades de otro número " +
    "de días: eso es preparar de más o de menos").toBeVisible();
  await expect(page.getByText(/gramos totales para 4 días/),
    "han quedado los 4 días del menú anterior").toHaveCount(0);
});
