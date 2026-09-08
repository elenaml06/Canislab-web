// ─── DÓNDE ATERRIZA UN VETERINARIO, Y LA RUEDA QUE FALTABA ──────────────────
//
// ⚠️ LOS DOS FALLOS DE ESTE ARCHIVO SE ENCONTRARON ABRIENDO rawku.app
// DESPLEGADO (8 de septiembre), no leyendo el código y no contra el servidor
// de mentira: con un veterinario de tres pacientes, Chromium de verdad y el
// motor de Render detrás. Ninguna de las pruebas que ya había los veía,
// porque todas empezaban dando por hecho que se estaba dentro de una ficha.
//
//   1. La app abría la FICHA del último paciente mirado. Con tres pacientes
//      ya desconcierta; con cincuenta -- el número que se puso encima de la
//      mesa -- es la pantalla equivocada: nadie abre su motor para seguir con
//      el caso de ayer, lo abre para buscar el de hoy.
//
//   2. El formulador no tenía la rueda de ajustes. Es la pantalla donde un
//      veterinario pasa el rato, y desde ella no había forma de llegar a su
//      cuenta, ni al interruptor de modo, ni de volver a la lista: solo
//      «← Volver». La regla («la rueda va en TODAS las pantallas») ya estaba
//      escrita y puesta en las demás; esta se quedó fuera porque tiene
//      cabecera propia, que es justo por lo que nadie la miró.
import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { laFichaHaCargado, laFichaClinicaHaCargado } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

// Tres pacientes, no uno: con uno solo «la lista» y «la ficha» se confunden a
// simple vista y la prueba dejaría de distinguir lo que vino a distinguir.
const paciente = (id, nombre, tutor, extra = {}) => ({
  ...PERRO_DE_PRUEBA, id, nombre, tutor_nombre: tutor, ...extra,
});
const PACIENTES = [
  paciente("11111111-1111-4111-8111-111111111111", "Nala", "María López"),
  paciente("22222222-2222-4222-8222-222222222222", "Cairo", "Javier Ruiz",
    { patologias: ["renal"] }),
  paciente("33333333-3333-4333-8333-333333333333", "Kira", "Ana Serrano"),
];

const configurar = async (request, opciones) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`,
    { data: { sinTablaAccesos: false, ...opciones } });
  expect(res.ok()).toBeTruthy();
};

const entrar = async (page, request, opciones) => {
  await configurar(request, opciones);
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
};

const entrarComoVeterinario = (page, request, extra = {}) => entrar(page, request, {
  rolProfesional: true, rolVerificado: true,
  perros: PACIENTES,
  accesos: PACIENTES.map((p) => ({ perro_id: p.id, estado: "activo" })),
  menus: [], ...extra,
});

const laLista = (page) => page.getByRole("button", { name: /Dar de alta un paciente/ });


test("con pacientes, la app arranca en la LISTA y no en la ficha de ninguno", async ({ page, request }) => {
  await entrarComoVeterinario(page, request);

  await expect(laLista(page)).toBeVisible();
  await expect(page.getByRole("button", { name: "Paciente Nala" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Paciente Cairo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Paciente Kira" })).toBeVisible();
  await expect(page.getByPlaceholder(/Buscar por paciente/)).toBeVisible();

  // Y NO se ha abierto la ficha de nadie por el camino.
  await expect(laFichaClinicaHaCargado(page)).toHaveCount(0);
});

test("abrir un paciente lleva a SU ficha, y no rebota a la lista", async ({ page, request }) => {
  // ⚠️ La otra mitad del arreglo, y la que puede romperlo: abrir un paciente
  // REMONTA la app entera. Si la pantalla de entrada se decidiera mirando
  // «¿hay un paciente montado?» en vez de «¿es el arranque?», este clic
  // volvería a la lista una y otra vez, sin error ninguno.
  await entrarComoVeterinario(page, request);
  await page.getByRole("button", { name: "Paciente Cairo" }).click();

  await expect(laFichaClinicaHaCargado(page)).toBeVisible();
  await expect(page.getByRole("button", { name: /formular la raci/i })).toBeVisible();
  await expect(laLista(page)).toHaveCount(0);
});

test("sin ningún paciente todavía, se entra a dar de alta al primero", async ({ page, request }) => {
  // El veterinario recién acreditado no tiene lista que mirar: la pantalla de
  // entrada no puede ser una lista vacía.
  await entrarComoVeterinario(page, request, { perros: [], accesos: [] });
  await expect(page.getByRole("button", { name: /Dar de alta (un paciente|al primero)/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Paciente / })).toHaveCount(0);
});

test("la rueda de Ajustes está también en el formulador", async ({ page, request }) => {
  await entrarComoVeterinario(page, request);
  await page.getByRole("button", { name: "Paciente Nala" }).click();
  await laFichaClinicaHaCargado(page).waitFor();

  await page.getByRole("button", { name: /formular la raci/i }).click();
  await expect(page.getByText("Formular la ración")).toBeVisible();

  // Las dos cosas de la burbuja, que van juntas: los ajustes y la vuelta.
  await expect(page.getByRole("button", { name: "Ajustes" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Ver todos los pacientes/ })).toBeVisible();
});

test("y desde el formulador la rueda abre de verdad los ajustes", async ({ page, request }) => {
  // Que el botón esté no basta: en esta misma pantalla ya hubo un botón que
  // cambiaba el estado y no movía nada porque otro `if` ganaba antes.
  await entrarComoVeterinario(page, request);
  await page.getByRole("button", { name: "Paciente Nala" }).click();
  await laFichaClinicaHaCargado(page).waitFor();
  await page.getByRole("button", { name: /formular la raci/i }).click();

  await page.getByRole("button", { name: "Ajustes" }).click();
  await expect(page.getByText(/Modo profesional|Tu clínica|Cerrar sesión/).first()).toBeVisible();
});

test("y la miga de pan del formulador devuelve a la lista de pacientes", async ({ page, request }) => {
  await entrarComoVeterinario(page, request);
  await page.getByRole("button", { name: "Paciente Kira" }).click();
  await laFichaClinicaHaCargado(page).waitFor();
  await page.getByRole("button", { name: /formular la raci/i }).click();

  await page.getByRole("button", { name: /Ver todos los pacientes/ }).click();
  await expect(laLista(page)).toBeVisible();
});

test("a un tutor no le cambia la pantalla de entrada", async ({ page, request }) => {
  // El otro lado del cambio. Su perro sigue abriéndose solo: él no tiene un
  // fichero que consultar, tiene UN perro.
  await entrar(page, request, {
    rolProfesional: false, rolVerificado: false,
    perros: [PACIENTES[0]], accesos: [], menus: [],
  });
  await laFichaHaCargado(page).waitFor();
  await expect(laLista(page)).toHaveCount(0);
});
