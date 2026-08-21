// ─── Varios perros por cuenta ────────────────────────────────────────────────
//
// QUÉ ESTABA ROTO
// La base de datos siempre ha admitido varios perros por cuenta (la tabla
// `perros` va por user_id, y los menús llevan su `perro_id`), pero la app
// cogía el primero y tiraba el resto:
//
//     const perro = perros && perros.length > 0 ? perros[0] : null;
//
// Quien tuviera dos perros sólo podía usar uno, y no había forma de crear
// el segundo ni de borrar uno creado por error.
//
// POR QUÉ ESTAS PRUEBAS Y NO OTRAS
// Cambiar de perro no es enseñar otro nombre: RawkuOnboardingInterna
// calcula perfil, menús, kcal y hasta la pantalla de arranque UNA SOLA VEZ,
// al montarse. Si el cambio no lo remonta, se queda mezclando datos de los
// dos perros -- que es justo el fallo que sería invisible mirando sólo la
// cabecera. Por eso las pruebas miran el PESO y los MENÚS, que son lo que
// se quedaría del perro anterior.
//
// El Supabase de mentira guarda los perros por id de verdad (antes POST y
// PATCH machacaban la lista entera): sin eso, "crear el segundo perro"
// habría pasado en verde borrando el primero.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA } from "./fake-supabase.js";

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

async function abrirSelectorDePerros(page) {
  await abrirMenuLateral(page);
  await page.getByRole("button", { name: /\d+ perros/ }).click();
}

const menuDeEjemplo = (perroId, extra = {}) => ({
  id: `menu-de-${perroId}`,
  user_id: CUENTA_DE_PRUEBA.userId,
  perro_id: perroId,
  modo: "automatico",
  der_real: 1211,
  etapa_label: "Adulto",
  num_menus: 1,
  nombre: null,
  created_at: "2026-08-01T10:00:00.000Z",
  menus_data: [{ menu: { "Carne muscular de pollo": 420, "Hueso carnoso de pollo": 150 } }],
  ...extra,
});

test.describe("varios perros por cuenta", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      retrasoPerrosMs: 100,
      perros: [PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA],
      menus: [],
      olvidarUltimoMenu: true,
    });
  });

  test("con dos perros, los dos salen en el selector", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await abrirSelectorDePerros(page);

    await expect(page.getByRole("button", { name: PERRO_DE_PRUEBA.nombre, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: SEGUNDO_PERRO_DE_PRUEBA.nombre, exact: true })).toBeVisible();
  });

  test("cambiar de perro cambia los datos, no sólo el nombre", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);

    // Arranca con el primero (el más antiguo).
    await expect(page.getByText(`${PERRO_DE_PRUEBA.peso_actual}kg`).first()).toBeVisible();

    await abrirSelectorDePerros(page);
    await page.getByRole("button", { name: SEGUNDO_PERRO_DE_PRUEBA.nombre, exact: true }).click();

    // Si el componente no se remontara, aquí seguiría el peso del primero
    // con el nombre del segundo -- exactamente el fallo que se busca.
    await expect(page.getByText(`${SEGUNDO_PERRO_DE_PRUEBA.peso_actual}kg`).first()).toBeVisible();
    await expect(page.getByText(`${PERRO_DE_PRUEBA.peso_actual}kg`)).toHaveCount(0);
  });

  test("cada perro ve sus menús, no los del otro", async ({ page, request }) => {
    await configurarBackend(request, {
      menus: [
        menuDeEjemplo(PERRO_DE_PRUEBA.id, { id: "menu-de-nala", nombre: "Menú de Nala" }),
        menuDeEjemplo(SEGUNDO_PERRO_DE_PRUEBA.id, { id: "menu-de-cairo", nombre: "Menú de Cairo" }),
      ],
    });
    await page.goto("/");
    await iniciarSesion(page);

    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /Mis menús/ }).click();
    await expect(page.getByText("Menú de Nala")).toBeVisible();
    await expect(page.getByText("Menú de Cairo")).toHaveCount(0);

    await abrirSelectorDePerros(page);
    await page.getByRole("button", { name: SEGUNDO_PERRO_DE_PRUEBA.nombre, exact: true }).click();

    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /Mis menús/ }).click();
    await expect(page.getByText("Menú de Cairo")).toBeVisible();
    await expect(page.getByText("Menú de Nala")).toHaveCount(0);
  });

  test("se recuerda con qué perro se estaba al volver a entrar", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await abrirSelectorDePerros(page);
    await page.getByRole("button", { name: SEGUNDO_PERRO_DE_PRUEBA.nombre, exact: true }).click();
    await expect(page.getByText(`${SEGUNDO_PERRO_DE_PRUEBA.peso_actual}kg`).first()).toBeVisible();

    await page.reload();

    // Sin esto, cada recarga te devolvía al primer perro de la lista:
    // desconcertante cuando el que usas a diario es el segundo.
    await expect(page.getByText(`${SEGUNDO_PERRO_DE_PRUEBA.peso_actual}kg`).first()).toBeVisible();
  });

  test("añadir otro perro no borra el que ya había", async ({ page, request }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await abrirSelectorDePerros(page);
    await page.getByRole("button", { name: /Añadir otro perro/ }).click();

    // Empieza el asistente desde cero, con la ficha en blanco.
    await expect(page.getByPlaceholder(/nombre/i).first()).toBeVisible();
    await expect(page.getByPlaceholder(/nombre/i).first()).toHaveValue("");

    // Los dos de antes siguen en la base de datos: crear el tercero no
    // puede pasar por encima de ellos (que es lo que hacía el Supabase
    // de mentira antes de arreglarlo, y lo que haría un PATCH sin id).
    const estado = await configurarBackend(request, {});
    expect(estado.perros).toBe(2);
    expect(estado.nombresDePerros).toEqual([PERRO_DE_PRUEBA.nombre, SEGUNDO_PERRO_DE_PRUEBA.nombre]);
  });

  test("borrar un perro se lleva sus menús y deja los del otro", async ({ page, request }) => {
    await configurarBackend(request, {
      menus: [
        menuDeEjemplo(PERRO_DE_PRUEBA.id, { id: "menu-de-nala" }),
        menuDeEjemplo(SEGUNDO_PERRO_DE_PRUEBA.id, { id: "menu-de-cairo" }),
      ],
    });
    await page.goto("/");
    await iniciarSesion(page);

    await page.getByRole("button", { name: new RegExp(`Borrar a ${PERRO_DE_PRUEBA.nombre}`) }).click();
    await page.getByRole("button", { name: "Sí, borrar" }).click();

    // Queda el otro perro, y la app se planta en él en vez de quedarse
    // mirando a un perro que ya no existe.
    await expect(page.getByText(`${SEGUNDO_PERRO_DE_PRUEBA.peso_actual}kg`).first()).toBeVisible();

    const estado = await configurarBackend(request, {});
    expect(estado.perros).toBe(1);
    expect(estado.nombresDePerros).toEqual([SEGUNDO_PERRO_DE_PRUEBA.nombre]);
    // ⚠️ Los menús del perro borrado tienen que irse con él: la tabla
    // `menus` no borra en cascada, así que si no los borra la app se
    // quedan huérfanos para siempre (lo documenta la migración
    // supabase/migracion-menus-perro-id.sql).
    expect(estado.menus).toBe(1);
  });

  test("borrar el último perro devuelve al asistente, no a una pantalla vacía", async ({ page, request }) => {
    await configurarBackend(request, { perros: [PERRO_DE_PRUEBA] });
    await page.goto("/");
    await iniciarSesion(page);

    await page.getByRole("button", { name: new RegExp(`Borrar a ${PERRO_DE_PRUEBA.nombre}`) }).click();
    await page.getByRole("button", { name: "Sí, borrar" }).click();

    await expect(page.getByPlaceholder(/nombre/i).first()).toBeVisible();
  });

  test("con un solo perro no aparece ningún selector, sólo 'añadir otro'", async ({ page, request }) => {
    await configurarBackend(request, { perros: [PERRO_DE_PRUEBA] });
    await page.goto("/");
    await iniciarSesion(page);
    await abrirMenuLateral(page);

    // A quien tenga un perro la app no le cambia de sitio.
    await expect(page.getByRole("button", { name: /\d+ perros/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Añadir otro perro/ })).toBeVisible();
  });
});
