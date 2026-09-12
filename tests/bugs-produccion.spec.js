// ─── Tres bugs encontrados probando en producción ────────────────────────────
//
// 1. "Calculando el menú de Cairo..." infinito, sin error nunca.
// 2. La raza salía como texto ilegible.
// 3. El año de nacimiento por defecto era 2024, no el año actual.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA } from "./fake-supabase.js";
import { irAlGenerador, laFichaHaCargado } from "./ayudas.js";

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
}

test.describe("bugs de producción", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      sinPerro: false, retrasoPerrosMs: 100, menus: [],
      colgarGenerador: false, perro: {},
    });
  });

  // ⚠️ 4. UNA FILA CON `true` DEJABA LA PREGUNTA EN BLANCO Y LA LISTA
  //       ESCONDIDA — Y «NO» BORRA LAS PATOLOGÍAS (11 septiembre).
  //
  // Salió escribiendo otra prueba. La pantalla de alergias y patologías
  // compara contra las CADENAS "si" y "no" (`perfil.patologiaSi === "si"`), y
  // `perfilDesdeSupabase` metía la columna tal cual. Con un booleano en la
  // fila, `SiNoToggle` no marcaba ninguno de los dos botones y la lista no se
  // pintaba: un perro con «renal» puesto se veía como un perro sin nada.
  //
  // Y lo que lo hace peligroso no es que no se vea. Es que la pregunta parece
  // SIN CONTESTAR, así que lo natural es pulsar «No» — y «No» hace
  // `set("patologias", [])`. Las patologías de un perro renal se borran de un
  // toque, sin un aviso, y el menú siguiente ya es otro. Misma familia que el
  // `guardarPerro` de agosto: no da error, no se ve, y sale en la comida.
  //
  // Los cuatro campos son iguales (alergias, exclusiones, categorías y
  // patologías), así que se comprueban los cuatro.
  test("una fila con true/false abre la pantalla contestada, no en blanco", async ({ page, request }) => {
    await configurarBackend(request, {
      perro: {
        // Las tres primeras a `false` y la de patologías a `true`: lo que se
        // mira es que un BOOLEANO se lea como contestado, en los dos sentidos.
        alergia_si: false, alergias: [],
        otros_evitar_si: false, otros_evitar: [],
        categorias_excluidas_si: false, categorias_excluidas: [],
        patologia_si: true, patologias: ["renal"],
      },
    });
    await page.goto("/");
    await iniciarSesion(page);
    await laFichaHaCargado(page).waitFor();
    await page.getByRole("button", { name: "Editar alergias y patologías" }).click();

    // Si la pregunta se lee como contestada, la lista está pintada y la
    // patología del perro se ve. Si vuelve el fallo, aquí no hay nada.
    await expect(page.getByRole("button", { name: "Insuficiencia renal crónica", exact: true }),
      "con `patologia_si: true` la pantalla se abre con la pregunta sin contestar y la lista " +
      "escondida. El dueño ve un perro renal como un perro sin nada, y si pulsa «No» -- que es " +
      "lo natural con una pregunta en blanco -- sus patologías se borran sin avisar")
      .toHaveCount(1);
    // Y las otras tres, leídas como «no» y no como «sin contestar»: con la
    // pregunta en blanco el botón de seguir no se enciende, así que la ficha
    // de un perro guardado se vuelve imposible de cerrar.
    await expect(page.getByRole("button", { name: /^(Continuar|Terminar|Guardar)/ }),
      "con los cuatro «sí/no» leídos como booleanos, ninguno cuenta como contestado y no se " +
      "puede pasar de esta pantalla")
      .toBeEnabled();
  });

  test("si la API no responde, la app avisa en vez de quedarse colgada", async ({ page, request }) => {
    // El bug: ningún fetch tenía timeout. Con la API dormida (Render apaga
    // el plan gratuito), la pantalla se quedaba en "Calculando..." para
    // siempre — reproducido 2 minutos sin un solo cambio. Y el reintento
    // de "Despertando el servidor" no saltaba nunca, porque sólo salta
    // cuando el fetch LANZA error, y un servidor mudo no lanza nada.
    await configurarBackend(request, { colgarGenerador: true });

    await page.goto("/");
    await iniciarSesion(page);
    await irAlGenerador(page);
    await page.getByRole("button", { name: "Pienso" }).click();
    await page.getByRole("button", { name: /Automático/ }).click();
    await page.getByRole("button", { name: /Generar/i }).first().click();

    await expect(page.getByText(/Calculando el menú/)).toBeVisible();

    // Con el timeout puesto, la petición se aborta y el reintento arranca:
    // la pantalla CAMBIA. Antes esto no ocurría jamás.
    await expect(page.getByText(/Despertando el servidor/)).toBeVisible({ timeout: 25_000 });
  });

  test("la raza se lee bien aunque esté guardada como el objeto entero", async ({ page, request }) => {
    // Filas viejas: se guardaba {nombre, tamano, pesoMin, pesoMax,
    // pesoMedio} en una columna que sólo debía llevar el nombre.
    await configurarBackend(request, {
      perro: { raza: '{"nombre":"Pastor Alemán","tamano":"Grande","pesoMin":30,"pesoMax":40,"pesoMedio":35}' },
    });

    await page.goto("/");
    await iniciarSesion(page);
    await expect(laFichaHaCargado(page)).toBeVisible();

    await expect(page.getByText("Pastor Alemán").first()).toBeVisible();
    // Y nada de llaves, comillas ni nombres de campo sueltos por la ficha.
    await expect(page.getByText(/pesoMedio|\{"nombre"|\[object Object\]/)).toHaveCount(0);
  });

  test("la raza normal (sólo el nombre) también se lee bien", async ({ page, request }) => {
    // Contrapeso: al arreglar las filas viejas no podemos romper las nuevas.
    await configurarBackend(request, { perro: { raza: "Pastor Alemán" } });

    await page.goto("/");
    await iniciarSesion(page);
    await expect(page.getByText("Pastor Alemán").first()).toBeVisible();
  });

  test("sin fecha de nacimiento guardada, el año por defecto es el actual", async ({ page, request }) => {
    // El bug: había un 2024 en duro, así que un perro sin fecha aparecía
    // nacido en 2024 dijera lo que dijera el calendario.
    await configurarBackend(request, { perro: { fecha_nacimiento: null } });

    await page.goto("/");
    await iniciarSesion(page);
    await expect(laFichaHaCargado(page)).toBeVisible();

    // Nacido este año ⇒ menos de un año de edad.
    await expect(page.getByText(/0 años/)).toBeVisible();
  });
});
