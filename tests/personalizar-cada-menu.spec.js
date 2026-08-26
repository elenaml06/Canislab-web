// ─── En Personalizar, cada menú lleva LO QUE ELEGISTE PARA ÉL ────────────────
//
// CASO REAL (23 de agosto), encontrado por la usuaria:
//
//     "he puesto en el 1 carne de conejo, hueso carnoso de conejo e hígado de
//      conejo, y en el 2 todo de pollo, y me los ha dado los dos de pollo"
//
// O sea: lo elegido para el menú 2 se aplicó también al 1. Personalizar con
// varios menús deja de servir para nada -- si los dos salen iguales, no hay
// rotación, y la rotación no es un capricho: es lo que evita que el perro coma
// la misma proteína siete días seguidos.
//
// POR QUÉ NO LO PILLABA NINGUNA PRUEBA
// La que había ("Personalizar existe, y lo elegido llega al servidor") sólo
// comprobaba que el camino existiera, con TODO en automático. Y el servidor de
// mentira sólo guardaba la ÚLTIMA petición, así que aunque se hubiera mirado,
// guardar sólo la última no distingue "los dos con lo mismo" de "cada uno con
// lo suyo". Ahora el fake guarda TODAS, en orden.
//
// Esto mira lo que SE PIDE AL SERVIDOR, no lo que se ve en pantalla: la
// pantalla pinta lo que devuelve el servidor, así que con los dos menús mal
// pedidos se vería igual de convincente.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { irAlGenerador, pedirLosDeLaCasa } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

async function configurarBackend(request, opciones) {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

// Pone una categoría en Manual y elige dentro la especie que se le diga.
// Pone la categoría en "elijo yo" y elige DENTRO un alimento concreto.
//
// Los ocho pares Auto/Manual de la pantalla son idénticos, así que se va
// por el nombre accesible. Y hay que llegar hasta el alimento: pulsar sólo
// la especie abre el submenú de cortes y no elige nada -- la primera
// versión de esta prueba se quedaba ahí, con el submenú abierto y sin
// haber forzado nada, y por eso fallaba en el menú 2.
async function elegirEnCategoria(page, categoria, especie, alimento) {
  await page.getByRole("button", { name: `${categoria}: elijo yo` }).click();
  await page.getByRole("button", { name: `${categoria}: elegir alimento` }).click();
  // La fila de la especie lleva "N tipos" pegado, así que no vale exact.
  await page.getByRole("button", { name: new RegExp(`^${especie}`) }).first().click();
  await page.getByRole("button", { name: alimento, exact: true }).click();
  // Queda puesto como etiqueta, no sólo abierto en un desplegable.
  await expect(page.getByText(alimento, { exact: true }).first()).toBeVisible();
}

test.describe("personalizar con varios menús", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      retrasoPerrosMs: 50,
      perros: [{ ...PERRO_DE_PRUEBA, dieta_actual: "barf" }],
      menus: [],
      premium: true,
    });
  });

  test("el menú 1 no se lleva lo elegido para el menú 2", async ({ page, request }) => {
    await page.goto("/");
    await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
    await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await irAlGenerador(page);

    await page.getByRole("button", { name: /^Personalizar/ }).click();
    // dos menús para la semana (el selector es un +/-)
    await page.getByRole("button", { name: "+", exact: true }).click();
    await page.getByRole("button", { name: /^(Elegir los ingredientes|Personalizar los)/ }).click();

    // Menú 1 → conejo
    await expect(page.getByText(/Menú 1 · personalizar/)).toBeVisible();
    await elegirEnCategoria(page, "Carne muscular", "Conejo", "Conejo");

    await page.getByRole("button", { name: /Siguiente: Menú 2/ }).click();

    // Menú 2 → pollo
    await expect(page.getByText(/Menú 2 · personalizar/)).toBeVisible();
    await elegirEnCategoria(page, "Carne muscular", "Pollo", "Pollo muslo con piel");

    await page.getByRole("button", { name: /Generar los menús/ }).click();
    await page.getByText(/Menú 1|Carne muscular/).first().waitFor({ timeout: 30000 });

    const { peticionesMenu } = await configurarBackend(request, { olvidarPeticionesMenu: false });
    expect(peticionesMenu.length, "tienen que ser dos llamadas, una por menú").toBe(2);

    const forzados = peticionesMenu.map((p) => (p.forzar_presencia || []).join(" · "));

    // Lo que pasaba: los dos pedían pollo.
    expect(forzados[0], "el menú 1 tiene que pedir lo que se eligió PARA EL MENÚ 1").toMatch(/onejo/);
    expect(forzados[1], "el menú 2 tiene que pedir lo que se eligió PARA EL MENÚ 2").toMatch(/ollo/);
    expect(forzados[0]).not.toEqual(forzados[1]);
  });
});

test.describe("personalizar con varios menús Y varios perros", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      retrasoPerrosMs: 50,
      perros: [{ ...PERRO_DE_PRUEBA, dieta_actual: "barf" },
               { ...SEGUNDO_PERRO_DE_PRUEBA, dieta_actual: "barf" }],
      menus: [], premium: true,
    });
  });

  test("con dos perros, el menú 1 tampoco se lleva lo del menú 2", async ({ page, request }) => {
    // ⚠️ ÉSTE ES EL CASO QUE FALLABA. Con un solo perro la app ya mandaba
    // el config de cada menú por separado; con varios va por otro camino
    // (/menu/varios-perros) que recibía UNA sola configuración -- la del
    // menú que estabas editando al pulsar Generar -- y la aplicaba a
    // todos. De ahí "los dos de pollo".
    await page.goto("/");
    await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
    await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await irAlGenerador(page);

    await pedirLosDeLaCasa(page);
    for (const nombre of [PERRO_DE_PRUEBA.nombre, SEGUNDO_PERRO_DE_PRUEBA.nombre]) {
      await page.getByRole("group", { name: `Qué come ${nombre}` })
                .getByRole("button", { name: "BARF", exact: true }).click();
    }
    await page.getByRole("button", { name: /^Personalizar/ }).click();
    await page.getByRole("button", { name: "+", exact: true }).click();
    await page.getByRole("button", { name: /^(Elegir los ingredientes|Personalizar los)/ }).click();

    await elegirEnCategoria(page, "Carne muscular", "Conejo", "Conejo");
    await page.getByRole("button", { name: /Siguiente: Menú 2/ }).click();
    await elegirEnCategoria(page, "Carne muscular", "Pollo", "Pollo muslo con piel");
    await page.getByRole("button", { name: /Generar los menús/ }).click();

    await page.getByText(/Menú 1|La compra/).first().waitFor({ timeout: 40000 });

    const { peticionesCasa } = await configurarBackend(request, { olvidarPeticionesMenu: false });
    expect(peticionesCasa.length, "sigue siendo UNA llamada").toBe(1);

    // Y dentro, la configuración de cada menú por separado. Va en la misma
    // petición a propósito: partirla en una llamada por menú le daría a
    // cada una el presupuesto semanal entero de vitamina D, yodo, selenio
    // y mercurio, cubriendo sólo 3 o 4 días -- la semana sumada se pasaría
    // de los límites de seguridad crónica sin que nada avisara.
    const porMenu = peticionesCasa[0].personalizacion_por_menu;
    expect(porMenu, "no se manda la personalización de cada menú").toBeTruthy();
    expect(porMenu.length, "una entrada por menú").toBe(2);

    const forzados = porMenu.map((m) => (m.forzar_presencia || []).join(" · "));
    expect(forzados[0], "el menú 1 tiene que pedir lo del menú 1").toMatch(/onejo/);
    expect(forzados[1], "el menú 2 tiene que pedir lo del menú 2").toMatch(/ollo/);
    expect(forzados[0]).not.toEqual(forzados[1]);
  });
});
