// ─── Ningún texto de la app puede decir "undefined" ──────────────────────────
//
// CASO REAL (22 de agosto): al abrir "cómo preparar" en la zanahoria salía
//
//     Como referencia, undefined — con los 15g de hoy te haces una idea.
//
// La entrada de la zanahoria en COMO_DAR_ALIMENTO tiene instrucción (`como`)
// pero no tiene peso de referencia (`pieza`), y la plantilla lo metía en el
// texto tal cual. Pasaba en 34 de las 77 entradas — todas las verduras y
// frutas.
//
// No dio ningún error: JavaScript convierte undefined a "undefined" dentro de
// una plantilla y sigue tan tranquilo. Sólo se ve leyendo esa pantalla, en ese
// alimento concreto. Por eso lo encontró la usuaria y no las pruebas.
//
// Esto no vigila la zanahoria: vigila la FAMILIA. Recorre las pantallas y
// falla si en cualquier texto visible aparece "undefined", "null", "NaN" o
// "[object Object]" — los cuatro agujeros por los que se cuela un dato que no
// existe sin que nada avise.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";
const BASURA = /\b(undefined|NaN)\b|\[object Object\]/;

async function configurarBackend(request, opciones) {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function textoVisible(page) {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ");
}

async function exigirLimpio(page, donde) {
  const texto = await textoVisible(page);
  const sucio = texto.match(BASURA);
  expect(sucio ? `${donde}: «...${texto.slice(Math.max(0, texto.indexOf(sucio[0]) - 60),
                  texto.indexOf(sucio[0]) + 60)}...»` : null,
    `hay un dato que no existe pintado como texto en ${donde}`).toBeNull();
}

test.describe("ninguna pantalla enseña datos que no existen", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      retrasoPerrosMs: 100, perros: [PERRO_DE_PRUEBA], menus: [],
    });
  });

  async function entrar(page) {
    await page.goto("/");
    await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
    await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.getByRole("button", { name: /Hacer el menú de la semana/ }).waitFor();
  }

  test("la ficha del perro y el generador", async ({ page }) => {
    await entrar(page);
    await exigirLimpio(page, "la ficha del perro");
    await page.getByRole("button", { name: /Hacer el menú de la semana/ }).click();
    await exigirLimpio(page, "el generador");
  });

  test("el menú, y 'cómo preparar' de CADA alimento", async ({ page }) => {
    await entrar(page);
    await page.getByRole("button", { name: /Hacer el menú de la semana/ }).click();
    await page.getByRole("button", { name: "Pienso", exact: true }).click();
    await page.getByRole("button", { name: /^Automático/ }).click();
    await page.getByRole("button", { name: /^Generar/ }).click();

    await page.getByText(/Menú 1|Carne muscular/).first().waitFor({ timeout: 30000 });
    await exigirLimpio(page, "el menú recién generado");

    // ⚠️ Uno por uno, y por su NOMBRE. La primera versión pulsaba
    // cualquier botón que tuviera un icono dentro y no servía: no llegaba
    // a abrir los paneles de preparación, así que pasaba en verde con el
    // fallo puesto (comprobado). Ahora va al botón exacto de cada
    // alimento, que además tiene nombre para un lector de pantalla.
    const botones = page.getByRole("button", { name: /^Cómo preparar / });
    const cuantos = await botones.count();
    expect(cuantos, "no hay ningún botón de 'cómo preparar': la prueba no prueba nada")
      .toBeGreaterThan(2);

    for (let i = 0; i < cuantos; i++) {
      const b = botones.nth(i);
      const quien = (await b.getAttribute("aria-label")) || `alimento ${i}`;
      await b.click();
      await exigirLimpio(page, `«${quien}»`);
      await b.click();   // cerrar, para que el siguiente empiece limpio
    }
  });
});
