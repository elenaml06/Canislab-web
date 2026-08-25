// ─── Regenerar tras cambiar el peso conserva los alimentos ───────────────────
//
// CASO REAL (25 agosto): "he lanzado el regenerar menús cambiando el peso
// del perro desde evolución, pero me los ha cambiado BASTANTE, el primero
// lo ha respetado un poco más pero el segundo... prácticamente nada".
//
// El botón dice "regenera con los mismos ingredientes". No lo hacía, y por
// dos motivos a la vez:
//
//   · La app metía los alimentos en `nombres_alimentos`, que el servidor
//     SOLO mira en los modos "personalizar" y "aprovechar". Esa pantalla
//     manda "automatico", que los ignora los dos. La petición salía
//     perfecta y el servidor la tiraba entera.
//   · Y la lista salía de `menus[0]`, así que el menú 2 recibía los
//     alimentos del 1 -- de ahí "el segundo prácticamente nada".
//
// Medido en el motor con dos menús de 6 alimentos: el 1 conservaba 3 de 6
// y el 2 solo 2 de 6. Con el arreglo, 6 de 6 los dos.
//
// LO QUE VIGILA ESTA PRUEBA es que salga de la app lo que tiene que salir:
// que llegue `preferir_por_menu` y que cada menú lleve LO SUYO. Que el
// motor lo respete lo mide el BLOQUE 17 de pruebas_completas.py, que sí
// puede contar alimentos de verdad.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

const configurar = async (request, opciones) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
};

test("al regenerar por el peso, cada menú conserva SUS alimentos", async ({ page, request }) => {
  await configurar(request, {
    retrasoPerrosMs: 50,
    premium: true,
    menusDistintos: true,     // así cada menú lleva un alimento propio
    perros: [{ ...PERRO_DE_PRUEBA, dieta_actual: "barf" }],
    menus: [], olvidarUltimoMenu: true,
  });
  // El muro está en modo demo: el premium sale de un interruptor del
  // navegador, no de Supabase, y se lee al cargar.
  await page.addInitScript(() => window.localStorage.setItem("rawku_premium_demo", "si"));
  await page.goto("/");

  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("button", { name: /Hacer el menú de la semana/ }).click();
  await page.getByRole("button", { name: /^Automático/ }).click();
  // Dos menús: con uno solo el fallo del "segundo" no puede aparecer.
  await page.getByRole("button", { name: "+", exact: true }).click();
  await page.getByRole("button", { name: /^(Generar|Hacer)/ }).click();
  await expect(page.getByText(/Semana de Nala/)).toBeVisible({ timeout: 20000 });

  // Pesar al perro en Evolución y pedir el menú adaptado.
  await page.getByRole("button", { name: "Menú", exact: true }).last().click();
  await page.getByRole("dialog", { name: "Panel lateral" })
            .getByRole("button", { name: "Evolución y crecimiento", exact: true }).click();
  await page.getByPlaceholder("ej. 18.5").fill("22");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await page.getByRole("button", { name: /Regenerar menú adaptado al nuevo peso/ }).click();
  await expect(page.getByText(/Semana de Nala/)).toBeVisible({ timeout: 20000 });

  // ⚠️ `olvidarPeticionesMenu: false`: llamar al control con {} BORRA los
  // contadores antes de devolverlos, así que leerlos así daba 0 siempre --
  // y un 0 no se distingue de "no se mandó nada". Costó un rato.
  const { peticionesSemana } = await configurar(request, { olvidarPeticionesMenu: false });
  expect(peticionesSemana.length, "no se ha vuelto a pedir la semana").toBeGreaterThan(1);

  const alRegenerar = peticionesSemana[peticionesSemana.length - 1];
  const porMenu = alRegenerar.preferir_por_menu;

  expect(porMenu,
    "al regenerar no se manda `preferir_por_menu`: el servidor no tiene forma " +
    "de saber qué alimentos conservar y hace la semana de cero")
    .toBeTruthy();
  expect(porMenu.length, "no llega una lista por cada menú").toBe(2);

  // ⚠️ LO IMPORTANTE: que NO sean la misma lista. Mandando los alimentos
  // del menú 1 para los dos, todo lo de arriba pasaría igual -- y ése era
  // el fallo. Cada marcador solo existe en su menú.
  expect(porMenu[0], "el menú 1 no manda sus propios alimentos")
    .toContain("Marcador de prueba 1");
  expect(porMenu[1],
    "el menú 2 manda los alimentos del menú 1, no los suyos: es exactamente " +
    "el fallo de «el segundo prácticamente nada»")
    .toContain("Marcador de prueba 2");
  expect(porMenu[1]).not.toContain("Marcador de prueba 1");
});
