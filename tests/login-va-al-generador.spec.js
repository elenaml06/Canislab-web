// ─── Test de regresión: login → generador ────────────────────────────────────
//
// Cubre el bug real que se arregló:
//
//   "El perfil se carga desde Supabase (los datos SÍ llegan) pero la app
//    no navega al generador, se queda en el onboarding."
//
// Causa: RawkuOnboardingInterna decide qué pintar mirando PRIMERO `paso`
// y sólo después `fase`. `fase` sí se inicializaba con el perro cargado,
// pero `paso` se quedaba siempre en 1, así que ganaba el `if (paso === 1)`
// y se pintaba el asistente desde cero. La pantalla del generador era
// inalcanzable aunque el perro estuviera perfectamente cargado.
//
// Estos tests corren contra un Supabase de mentira en local
// (tests/fake-supabase.js): nunca tocan la base de datos real de
// rawku.app ni crean cuentas de verdad.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

/** Ajusta el escenario del Supabase de mentira antes de cada prueba. */
async function configurarBackend(request, opciones) {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok(), "el Supabase de mentira debe responder al mando a distancia").toBeTruthy();
}

async function iniciarSesion(page) {
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
}

// Marcas de cada pantalla, tal y como las ve una usuaria.
const generador = (page) => page.getByText("Menú semanal");
const asistentePaso1 = (page) => page.getByText("Perfil nuevo");
// Pantalla de inicio: el perfil del perro (sus datos y sus kcal/día).
const perfilDelPerro = (page) => page.getByRole("button", { name: /Hacer el menú de la semana/ });

test.describe("login → generador", () => {
  test.beforeEach(async ({ request }) => {
    // Escenario por defecto: cuenta que YA tiene un perro guardado, y
    // Supabase tardando lo suyo en devolverlo.
    await configurarBackend(request, { sinPerro: false, retrasoPerrosMs: 400 });
  });

  test("una cuenta con perro guardado entra en el perfil del perro", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);

    // Lo que se espera: el perfil, con el nombre del perro y sus datos.
    await expect(page.getByText(PERRO_DE_PRUEBA.nombre).first()).toBeVisible();
    await expect(perfilDelPerro(page)).toBeVisible();

    // Y lo que NO puede pasar (el bug original): quedarse en el asistente
    // de perfil nuevo, pidiendo otra vez unos datos que ya están guardados.
    await expect(asistentePaso1(page)).toHaveCount(0);
  });

  test("desde el perfil se llega al generador en un toque", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);

    await perfilDelPerro(page).click();

    await expect(generador(page)).toBeVisible();
    // ⚠️ ESTA LÍNEA CAZÓ UN FALLO (23 agosto): al quitar la opción "Solo
    // para X" de la pantalla de varios perros, con UN solo perro el título
    // pasó a decir "los menús de la casa". Miraba la opción elegida en vez
    // de cuántos perros hay, y con uno esa opción ni se ve.
    await expect(
      page.getByRole("heading", { name: new RegExp(PERRO_DE_PRUEBA.nombre) })
    ).toBeVisible();
    await expect(page.getByText(/de la casa/)).toHaveCount(0);
  });

  test("el perfil tiene menú lateral para ir a otro sitio", async ({ page }) => {
    // Esta pantalla era la única sin botón de menú. Siendo ahora la
    // pantalla de inicio, sin él te quedarías sin navegación.
    await page.goto("/");
    await iniciarSesion(page);

    await page.getByRole("button", { name: "Menú", exact: true }).click();
    // ⚠️ Se llamaba "Editar perfil de X" hasta el 24 de agosto. Ahora
    // "Perfil de X": el panel tiene una sola lista y ella dio los nombres.
    await expect(page.getByText(/Perfil de/)).toBeVisible();
  });

  test("sigue funcionando aunque Supabase tarde mucho en devolver el perro", async ({ page, request }) => {
    // El bug original era de ORDEN DE CARGA: la app decidía pantalla
    // antes de tener el perro. Con un retraso grande, cualquier
    // regresión de ese tipo salta aquí seguro.
    await configurarBackend(request, { sinPerro: false, retrasoPerrosMs: 2000 });

    await page.goto("/");
    await iniciarSesion(page);

    // Mientras tanto se ve el "Cargando..." y NO el asistente.
    await expect(page.getByText("Cargando...")).toBeVisible();
    await expect(asistentePaso1(page)).toHaveCount(0);

    await expect(perfilDelPerro(page)).toBeVisible({ timeout: 20_000 });
    await expect(asistentePaso1(page)).toHaveCount(0);
  });

  test("al recargar con la sesión abierta se sigue en el perfil, no en el asistente", async ({ page }) => {
    await page.goto("/");
    await iniciarSesion(page);
    await expect(perfilDelPerro(page)).toBeVisible();

    await page.reload();

    await expect(perfilDelPerro(page)).toBeVisible();
    await expect(asistentePaso1(page)).toHaveCount(0);
  });

  test("el perro sólo se pide UNA vez por login (sin peticiones duplicadas)", async ({ page }) => {
    // Antes había dos caminos cargando el perro a la vez (el listener de
    // onAuthChange y el callback onAutenticado) pisándose el estado el
    // uno al otro. Esa duplicidad era la que abría la rendija de tiempo.
    const peticionesPerros = [];
    page.on("request", (req) => {
      if (req.url().includes("/rest/v1/perros")) peticionesPerros.push(req.url());
    });

    await page.goto("/");
    await iniciarSesion(page);
    await expect(perfilDelPerro(page)).toBeVisible();

    expect(peticionesPerros.length, `peticiones a /perros: ${peticionesPerros.length}`).toBe(1);
  });

  test("una cuenta nueva sin perro sí empieza por el asistente", async ({ page, request }) => {
    // Contrapeso del test principal: al arreglar el salto al generador
    // no podemos habernos cargado el onboarding de quien entra por
    // primera vez.
    await configurarBackend(request, { sinPerro: true, retrasoPerrosMs: 200 });

    await page.goto("/");
    await iniciarSesion(page);

    await expect(asistentePaso1(page)).toBeVisible();
    await expect(page.getByText("1 / 6")).toBeVisible();
    await expect(generador(page)).toHaveCount(0);
    await expect(perfilDelPerro(page)).toHaveCount(0);
  });

  test("el login no deja errores de JavaScript en consola", async ({ page }) => {
    // Red de seguridad barata: cualquier excepción durante el login
    // (justo lo que ahora recoge Sentry en producción) tumba el test.
    const errores = [];
    page.on("pageerror", (e) => errores.push(e.message));

    await page.goto("/");
    await iniciarSesion(page);
    await expect(perfilDelPerro(page)).toBeVisible();

    expect(errores).toEqual([]);
  });
});
