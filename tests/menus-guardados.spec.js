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
import { esperarLaFicha, irAlGenerador } from "./ayudas.js";

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
  await esperarLaFicha(page);
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

    await irAlGenerador(page);
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

  // ─── LOS TRES PUNTOS ──────────────────────────────────────────────────────
  //
  // Pedido expreso (26 agosto): "en vez de la papelera debería haber tres
  // puntitos para poder renombrar y borrar; y tienes que tener en cuenta si
  // es un menú que tiene varios menús dentro -- cada menú individual de la
  // semana y el global, desde dentro y desde fuera".
  //
  // Son DOS niveles guardados en la MISMA fila:
  //   · el conjunto -> la columna `nombre`
  //   · cada menú   -> `menus_data[i].nombre`
  // Y lo que hay que vigilar no es que el botón esté, sino que lo que se
  // escriba llegue a la base de datos y siga ahí al recargar: renombrar y
  // que solo cambie la pantalla es exactamente el fallo de la ficha que se
  // guardaba vacía en silencio.

  test("los tres puntos renombran el menú guardado, y se queda guardado", async ({ page, request }) => {
    await configurarBackend(request, { menus: [menuDeEjemplo({ id: "m1", nombre: "Semana de agosto" })] });
    await page.goto("/");
    await iniciarSesion(page);
    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /Mis menús/ }).click();

    // Ya no hay papelera suelta: hay tres puntos, y dentro las dos cosas.
    await expect(page.getByRole("button", { name: /^Borrar el menú del/ })).toHaveCount(0);
    await page.getByRole("button", { name: /^Opciones del menú/ }).click();
    const hoja = page.getByRole("dialog", { name: /^Opciones de/ });
    await expect(hoja.getByRole("button", { name: "Renombrar" })).toBeVisible();
    await expect(hoja.getByRole("button", { name: /^Eliminar/ })).toBeVisible();

    await hoja.getByRole("button", { name: "Renombrar" }).click();
    await page.getByLabel("Nombre del menú").fill("El de la playa");
    await page.getByRole("button", { name: "Guardar" }).click();

    await expect(page.getByText("El de la playa")).toBeVisible();

    // ⚠️ LO QUE DE VERDAD IMPORTA: que haya llegado a la base de datos. Mirar
    // solo la pantalla aprobaría un renombrado que se pierde al recargar,
    // que es la familia de fallos de "la ficha se guardaba vacía".
    const estado = await configurarBackend(request, {});
    const fila = estado.menusGuardados.find((m) => m.id === "m1");
    expect(fila, "el menú ha desaparecido de la base de datos").toBeTruthy();
    expect(fila.nombre).toBe("El de la playa");
    // Y no se ha duplicado: renombrar es un PATCH, no un alta.
    expect(estado.menusGuardados.filter((m) => m.id === "m1")).toHaveLength(1);
  });

  test("dentro de un guardado con varios, se renombra UN menú de la semana", async ({ page, request }) => {
    // El caso que el pedido señala: "tienes que tener en cuenta si es un menú
    // que tiene varios menús dentro". Renombrar el segundo no puede tocar al
    // primero, y tiene que escribirse en `menus_data[1]`, no en la columna
    // `nombre` del conjunto.
    await configurarBackend(request, { menus: [menuDeEjemplo({
      id: "m1", nombre: "Semana de agosto", num_menus: 2,
      menus_data: [
        { menu: { "Carne muscular de pollo": 420, "Hueso carnoso de pollo": 150 } },
        { menu: { "Carne muscular de ternera": 400, "Hueso carnoso de pollo": 140 } },
      ],
    })] });
    await page.goto("/");
    await iniciarSesion(page);
    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /Mis menús/ }).click();
    await page.getByText("Semana de agosto").click();
    await expect(page.getByText(/SEMANA DE/i)).toBeVisible();

    // ⚠️ LOS TRES PUNTOS DE LA CABECERA, sobre el menú que se está viendo.
    // La primera versión de esta prueba iba a la lista de "Mis menús" de
    // dentro de VistaMenus, y ahí es donde saltó que esa sección NO SE PUEDE
    // ABRIR: solo aparece con `soloSeccion="menus"` y nadie lo pasa -- el
    // "Mis menús" del panel va a la pantalla de FUERA. Los botones estaban
    // puestos en código muerto: se veían perfectos y no los alcanzaba nadie.
    await page.getByRole("button", { name: "Menú 2" }).click();
    await page.getByRole("button", { name: "Opciones de Menú 2" }).click();
    await page.getByRole("dialog", { name: "Opciones de Menú 2" })
              .getByRole("button", { name: "Renombrar" }).click();
    await page.getByLabel("Nombre del menú").fill("El de pescado");
    await page.getByRole("button", { name: "Guardar" }).click();

    const estado = await configurarBackend(request, {});
    const fila = estado.menusGuardados.find((m) => m.id === "m1");
    expect(fila.menus_data[1].nombre).toBe("El de pescado");
    // El primero, intacto. Y el nombre del CONJUNTO, intacto: son dos sitios
    // distintos y escribir en el que no toca sería invisible hasta que
    // alguien abriera la lista de fuera.
    expect(fila.menus_data[0].nombre ?? null).toBeNull();
    expect(fila.nombre).toBe("Semana de agosto");
  });

  test("borrar UN menú de dentro deja el resto, y no borra el guardado", async ({ page, request }) => {
    await configurarBackend(request, { menus: [menuDeEjemplo({
      id: "m1", nombre: "Semana de agosto", num_menus: 2,
      menus_data: [
        { menu: { "Carne muscular de pollo": 420 }, nombre: "El de pollo" },
        { menu: { "Carne muscular de ternera": 400 }, nombre: "El de ternera" },
      ],
    })] });
    await page.goto("/");
    await iniciarSesion(page);
    await abrirMenuLateral(page);
    await page.getByRole("button", { name: /Mis menús/ }).click();
    await page.getByText("Semana de agosto").click();
    await expect(page.getByText(/SEMANA DE/i)).toBeVisible();

    await page.getByRole("button", { name: "El de ternera" }).click();
    await page.getByRole("button", { name: "Opciones de El de ternera" }).click();
    await page.getByRole("dialog", { name: "Opciones de El de ternera" })
              .getByRole("button", { name: /^Eliminar/ }).click();
    // Dice qué queda antes de borrar: enterarse después no vale.
    await expect(page.getByText(/Se quedan 1 menú en este guardado/)).toBeVisible();
    await page.getByRole("button", { name: "Borrar", exact: true }).click();

    const estado = await configurarBackend(request, {});
    const fila = estado.menusGuardados.find((m) => m.id === "m1");
    expect(fila, "se ha borrado el guardado entero, y solo se pedía uno de dentro").toBeTruthy();
    expect(fila.menus_data).toHaveLength(1);
    expect(fila.menus_data[0].nombre).toBe("El de pollo");
    // ⚠️ Y `num_menus` BAJA con él. Si se queda en 2, la lista de fuera dice
    // "2 menús" de algo que ya solo lleva uno -- y no da error, solo miente.
    expect(fila.num_menus).toBe(1);
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
