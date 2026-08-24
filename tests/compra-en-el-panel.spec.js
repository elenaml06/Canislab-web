// ─── La compra, desde el panel lateral ───────────────────────────────────────
//
// POR QUÉ ESTÁ AQUÍ Y NO SOLO AL FINAL DEL MENÚ
// La lista de la compra no se mira al generar el menú: se mira EN LA TIENDA,
// dos días después. Estando solo dentro del menú había que volver a entrar
// en el menú para verla, y desde el perfil o desde Mis menús no se llegaba.
//
// LO QUE PUEDE ROMPERSE EN SILENCIO, que es lo que vigilan estas pruebas:
//
//   · Que sume solo el perro que tengas abierto. La app ya tiene cargados
//     los menús del perro actual (`menusGuardados`) y era lo cómodo de
//     usar; con dos perros eso da media compra, y media compra no se
//     distingue de una compra a simple vista.
//   · Que un menú guardado SIN los días de cada tanda cuente como un día.
//     Los primeros menús que se guardaron no llevaban `dias`. Sin ellos la
//     compra sale corta, y corta parece correcta.
//
// Ninguna de las dos da error. Por eso las dos miran NÚMEROS.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA } from "./fake-supabase.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

const configurar = async (request, opciones) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
};

const menuGuardado = (perroId, menusData, extra = {}) => ({
  id: `menu-${perroId}-${(extra.created_at || "").slice(0, 10) || "x"}`,
  user_id: CUENTA_DE_PRUEBA.userId,
  perro_id: perroId,
  modo: "automatico",
  der_real: 1211,
  etapa_label: "Adulto",
  num_menus: menusData.length,
  nombre: null,
  created_at: "2026-08-01T10:00:00.000Z",
  menus_data: menusData,
  ...extra,
});

async function entrar(page) {
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("button", { name: /Hacer el menú de la semana/ }).waitFor();
}

const abrirLaCompra = async (page) => {
  await page.getByRole("button", { name: "Menú", exact: true }).click();
  await page.getByRole("button", { name: "La compra", exact: true }).click();
};

test.describe("la compra desde el panel", () => {
  test("no se ofrece si no hay ningún menú guardado", async ({ page, request }) => {
    // Sin nada que sumar, el botón sería una promesa vacía.
    await configurar(request, {
      retrasoPerrosMs: 50, perros: [PERRO_DE_PRUEBA], menus: [], olvidarUltimoMenu: true,
    });
    await page.goto("/");
    await entrar(page);
    await page.getByRole("button", { name: "Menú", exact: true }).click();

    await expect(page.getByRole("button", { name: "La compra", exact: true })).toHaveCount(0);
  });

  test("suma el último menú de TODOS los perros, no solo el abierto", async ({ page, request }) => {
    // Éste es el fallo fácil de cometer: tirar de `menusGuardados`, que
    // solo tiene los del perro actual. Con dos perros daría media compra.
    await configurar(request, {
      retrasoPerrosMs: 50,
      perros: [PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA],
      menus: [
        menuGuardado(PERRO_DE_PRUEBA.id, [{ menu: { Conejo: 100 }, dias: 7 }]),
        menuGuardado(SEGUNDO_PERRO_DE_PRUEBA.id, [{ menu: { Conejo: 50 }, dias: 7 }]),
      ],
      olvidarUltimoMenu: true,
    });
    await page.goto("/");
    await entrar(page);
    await abrirLaCompra(page);

    // (100 + 50) x 7 = 1050 g. Con un solo perro serían 700 g.
    await expect(page.getByText("1,1 kg")).toBeVisible();
  });

  test("se puede ver la de un perro solo", async ({ page, request }) => {
    await configurar(request, {
      retrasoPerrosMs: 50,
      perros: [PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA],
      menus: [
        menuGuardado(PERRO_DE_PRUEBA.id, [{ menu: { Conejo: 100 }, dias: 7 }]),
        menuGuardado(SEGUNDO_PERRO_DE_PRUEBA.id, [{ menu: { Conejo: 50 }, dias: 7 }]),
      ],
      olvidarUltimoMenu: true,
    });
    await page.goto("/");
    await entrar(page);
    await abrirLaCompra(page);

    await page.getByRole("button", { name: SEGUNDO_PERRO_DE_PRUEBA.nombre, exact: true }).click();
    // Solo Cairo: 50 x 7 = 350 g.
    await expect(page.getByText("350 g")).toBeVisible();
  });

  test("tiene hamburguesa y burbuja, como todas las demás", async ({ page, request }) => {
    // ⚠️ CASO REAL: "en la pantalla de la compra no aparece la hamburguesa
    // del menú lateral ni lo del perfil". Se quedó fuera porque no es una
    // sección del menú: es una pantalla propia, con su propia cabecera.
    await configurar(request, {
      retrasoPerrosMs: 50, perros: [PERRO_DE_PRUEBA],
      menus: [menuGuardado(PERRO_DE_PRUEBA.id, [{ menu: { Conejo: 100 }, dias: 7 }])],
      olvidarUltimoMenu: true,
    });
    await page.goto("/");
    await entrar(page);
    await abrirLaCompra(page);

    await expect(page.getByRole("button", { name: /Perro actual/ }).last()).toBeVisible();
    await expect(page.getByRole("button", { name: "Ajustes" }).last()).toBeVisible();

    // Y la hamburguesa abre el panel de verdad, no es un dibujo.
    await page.getByRole("button", { name: "Menú", exact: true }).last().click();
    await expect(page.getByRole("dialog", { name: "Panel lateral" })).toBeVisible();
  });

  test("con un perro no se pregunta de quién: sobra", async ({ page, request }) => {
    await configurar(request, {
      retrasoPerrosMs: 50, perros: [PERRO_DE_PRUEBA],
      menus: [menuGuardado(PERRO_DE_PRUEBA.id, [{ menu: { Conejo: 100 }, dias: 7 }])],
      olvidarUltimoMenu: true,
    });
    await page.goto("/");
    await entrar(page);
    await abrirLaCompra(page);

    await expect(page.getByText("700 g")).toBeVisible();
    await expect(page.getByRole("button", { name: "Toda la casa" })).toHaveCount(0);
  });

  test("un menú guardado SIN días cuenta la semana, no un día", async ({ page, request }) => {
    // Los primeros menús que se guardaron no llevaban `dias`. Si se dan por
    // un día, la compra sale corta -- y corta parece correcta.
    await configurar(request, {
      retrasoPerrosMs: 50, perros: [PERRO_DE_PRUEBA],
      menus: [menuGuardado(PERRO_DE_PRUEBA.id, [
        { menu: { Conejo: 100 } },          // sin dias
        { menu: { Conejo: 100 } },          // sin dias
      ])],
      olvidarUltimoMenu: true,
    });
    await page.goto("/");
    await entrar(page);
    await abrirLaCompra(page);

    // Dos menús se reparten la semana: 4 + 3 días. 100 x 7 = 700 g.
    // Contándolos por un día darían 200 g.
    await expect(page.getByText("700 g")).toBeVisible();
  });
});

test.describe("para cuántos días", () => {
  // PEDIDO EXPRESO: "y para cuántos días". Nadie compra siempre para siete:
  // se preparan tandas de tres días para la nevera o de dos semanas para
  // congelar. La cesta sale de una SEMANA, así que lo demás se escala en
  // proporción -- y eso es aritmética, o sea que se comprueba con números.
  test.beforeEach(async ({ request }) => {
    await configurar(request, {
      retrasoPerrosMs: 50, perros: [PERRO_DE_PRUEBA],
      menus: [menuGuardado(PERRO_DE_PRUEBA.id, [{ menu: { Conejo: 100 }, dias: 7 }])],
      olvidarUltimoMenu: true,
    });
  });

  test("por defecto, la semana", async ({ page }) => {
    await page.goto("/");
    await entrar(page);
    await abrirLaCompra(page);
    await expect(page.getByText("700 g")).toBeVisible();
  });

  test("dos semanas es el doble", async ({ page }) => {
    await page.goto("/");
    await entrar(page);
    await abrirLaCompra(page);
    await page.getByRole("button", { name: "2 semanas" }).click();
    await expect(page.getByText("1,4 kg")).toBeVisible();
  });

  test("tres días es menos, no lo mismo", async ({ page }) => {
    // Que el selector se pinte no basta: si no multiplicara, el número
    // seguiría siendo 700 g y la pantalla se vería idéntica de correcta.
    await page.goto("/");
    await entrar(page);
    await abrirLaCompra(page);
    await page.getByRole("button", { name: "3 días" }).click();
    await expect(page.getByText("300 g")).toBeVisible();
    await expect(page.getByText("700 g")).toHaveCount(0);
  });
});
