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

// El panel lateral. Hace falta acotar a él porque desde que el selector de
// perros también se ve EN LA FICHA (las pestañas de la cabecera), un
// "Cairo" suelto encuentra dos botones distintos.
const panel = (page) => page.getByRole("dialog", { name: "Panel lateral" });

async function abrirSelectorDePerros(page) {
  await abrirMenuLateral(page);
  await panel(page).getByRole("button", { name: /\d+ perros/ }).click();
  return panel(page);
}

// Cambiar de perro desde las pestañas de la ficha, que es el camino a la
// vista: el del panel se prueba aparte.
const pestanaDePerro = (page, nombre) =>
  page.getByRole("button", { name: nombre, exact: true }).first();

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

  test("con dos perros, los dos salen en el selector del panel", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);
    const p = await abrirSelectorDePerros(page);

    await expect(p.getByRole("button", { name: PERRO_DE_PRUEBA.nombre, exact: true })).toBeVisible();
    await expect(p.getByRole("button", { name: SEGUNDO_PERRO_DE_PRUEBA.nombre, exact: true })).toBeVisible();
  });

  // ⚠️ Esta prueba existe por un fallo de DISEÑO, no de código: cuando
  // cambiar de perro solo vivía dentro del panel lateral, tener varios
  // perros era una función invisible — si no sabías que estaba ahí, no
  // existía. Se pidió expresamente que se viera al entrar.
  test("con dos perros, se puede cambiar sin abrir ningún panel", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);

    await expect(pestanaDePerro(page, PERRO_DE_PRUEBA.nombre)).toBeVisible();
    await expect(pestanaDePerro(page, SEGUNDO_PERRO_DE_PRUEBA.nombre)).toBeVisible();

    await pestanaDePerro(page, SEGUNDO_PERRO_DE_PRUEBA.nombre).click();
    await expect(page.getByText(`${SEGUNDO_PERRO_DE_PRUEBA.peso_actual}kg`).first()).toBeVisible();
  });

  test("con un solo perro se invita a añadir otro, sin buscarlo", async ({ page, request }) => {
    await configurarBackend(request, { perros: [PERRO_DE_PRUEBA] });
    await page.goto("/");
    await iniciarSesion(page);

    await page.getByRole("button", { name: /¿Tienes más perros\?/ }).click();
    // lleva al asistente, con la ficha en blanco
    await expect(page.getByPlaceholder(/nombre/i).first()).toHaveValue("");
  });

  test("cambiar de perro cambia los datos, no sólo el nombre", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);

    // Arranca con el primero (el más antiguo).
    await expect(page.getByText(`${PERRO_DE_PRUEBA.peso_actual}kg`).first()).toBeVisible();

    await pestanaDePerro(page, SEGUNDO_PERRO_DE_PRUEBA.nombre).click();

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

    // Desde "Mis menús" no hay pestañas de perro (solo están en la ficha),
    // así que aquí se cambia por el panel — que es justo para lo que sigue
    // existiendo el selector de dentro.
    const p2 = await abrirSelectorDePerros(page);
    await p2.getByRole("button", { name: SEGUNDO_PERRO_DE_PRUEBA.nombre, exact: true }).click();

    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /Mis menús/ }).click();
    await expect(page.getByText("Menú de Cairo")).toBeVisible();
    await expect(page.getByText("Menú de Nala")).toHaveCount(0);
  });

  test("se recuerda con qué perro se estaba al volver a entrar", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await pestanaDePerro(page, SEGUNDO_PERRO_DE_PRUEBA.nombre).click();
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

// ─── Los menús de toda la casa ───────────────────────────────────────────────
//
// Pedido expreso: "que el usuario tenga la opción de hacer menús totalmente
// diferentes para cada perro, o generar los menús de todos lo más parecidos
// posibles — si cuadra cambiando solo las cantidades, perfecto, y si no, los
// menos cambios de alimento posibles".
//
// El reparto lo decide el motor (tiene sus propias pruebas en el backend).
// Lo que se vigila aquí es la parte de la app:
//   · que la opción se vea cuando hay más de un perro, y NO cuando hay uno;
//   · que cada menú se guarde en la ficha de SU perro y no en la del que
//     estabas mirando (un menú en el perro equivocado son cantidades
//     equivocadas para un animal de verdad);
//   · que si falla para todos, no te deje sin poder hacer el de uno.
test.describe("los menús de toda la casa", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      retrasoPerrosMs: 100,
      perros: [PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA],
      menus: [], olvidarUltimoMenu: true,
      casaCompraUnica: true, casaFalla: false,
    });
  });

  const irAlGenerador = async (page) => {
    await page.getByRole("button", { name: /Hacer el menú de la semana/ }).click();
  };

  test("con un solo perro no se ofrece nada de la casa", async ({ page, request }) => {
    await configurarBackend(request, { perros: [PERRO_DE_PRUEBA] });
    await page.goto("/");
    await iniciarSesion(page);
    await irAlGenerador(page);

    await expect(page.getByText("¿Para quién?")).toHaveCount(0);
  });

  test("cuando cuadra, dice que la compra es una sola", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await irAlGenerador(page);

    await page.getByRole("button", { name: /lo más parecidos posible/ }).click();
    await page.getByRole("button", { name: /Hacer los menús de los 2/ }).click();

    await expect(page.getByText(/Una sola compra/)).toBeVisible();
    // los dos perros, con sus cantidades distintas
    await expect(page.getByText(PERRO_DE_PRUEBA.nombre).first()).toBeVisible();
    await expect(page.getByText(SEGUNDO_PERRO_DE_PRUEBA.nombre).first()).toBeVisible();
    await expect(page.getByText("La compra de un día, para todos")).toBeVisible();
  });

  test("cuando NO cuadra, dice cuántos alimentos cambian", async ({ page, request }) => {
    await configurarBackend(request, { casaCompraUnica: false });
    await page.goto("/");
    await iniciarSesion(page);
    await irAlGenerador(page);

    await page.getByRole("button", { name: /lo más parecidos posible/ }).click();
    await page.getByRole("button", { name: /Hacer los menús de los 2/ }).click();

    await expect(page.getByText(/1 alimento distinto en total/)).toBeVisible();
    // y se ve DE QUIÉN es lo que no comparten
    await expect(page.getByText("solo suyo").first()).toBeVisible();
  });

  test("cada menú se guarda en la ficha de su perro", async ({ page, request }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await irAlGenerador(page);
    await page.getByRole("button", { name: /lo más parecidos posible/ }).click();
    await page.getByRole("button", { name: /Hacer los menús de los 2/ }).click();
    await page.getByRole("button", { name: "Guardar los menús" }).click();
    await expect(page.getByRole("button", { name: /Guardado/ })).toBeVisible();

    // ⚠️ Lo importante de esta prueba: UN menú para CADA perro. Guardar
    // los dos en el perro que estabas mirando le daría a un perro las
    // cantidades del otro — comida de verdad, mal medida.
    //
    // ⚠️ Y se mira lo que hay GUARDADO, no la lista de la pantalla. La
    // primera versión miraba la pantalla y no servía: esa lista se
    // actualiza en local y no vuelve a preguntar, así que seguía
    // enseñando lo correcto aunque se hubiera guardado todo en el mismo
    // perro. Se comprobó rompiéndolo a propósito: pasaba en verde.
    const estado = await configurarBackend(request, {});
    expect(estado.menus).toBe(2);
    expect(estado.menusPorPerro).toEqual({
      [PERRO_DE_PRUEBA.id]: 1,
      [SEGUNDO_PERRO_DE_PRUEBA.id]: 1,
    });

    // y en la pantalla, cada perro ve el suyo
    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /Mis menús/ }).click();
    await expect(page.getByText(`Menú de casa · ${PERRO_DE_PRUEBA.nombre}`)).toBeVisible();
    await expect(page.getByText(`Menú de casa · ${SEGUNDO_PERRO_DE_PRUEBA.nombre}`)).toHaveCount(0);
  });

  test("si falla para todos, se puede hacer el de uno solo", async ({ page, request }) => {
    await configurarBackend(request, { casaFalla: true });
    await page.goto("/");
    await iniciarSesion(page);
    await irAlGenerador(page);
    await page.getByRole("button", { name: /lo más parecidos posible/ }).click();
    await page.getByRole("button", { name: /Hacer los menús de los 2/ }).click();

    await expect(page.getByText("No hemos podido hacer los menús de todos")).toBeVisible();
    await page.getByRole("button", { name: new RegExp(`Hacer solo el de ${PERRO_DE_PRUEBA.nombre}`) }).click();
    // vuelve al generador de siempre, con sus modos
    await expect(page.getByText(/¿Qué come .* ahora mismo\?/)).toBeVisible();
  });
});
