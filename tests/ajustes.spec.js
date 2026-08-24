// ─── El engranaje: la cuenta y los perros en un solo sitio ───────────────────
//
// Pedido expreso: "que cambiar de perro esté metido en una pestaña del panel
// es esconderlo. Va como burbuja de perfil bien visible, y de ahí cuelga una
// rueda de engranaje con la configuración de la cuenta y de las mascotas".
//
// Lo que vigila esto es que el engranaje LLEVE A ALGO y que ese algo tenga las
// dos mitades. Antes no existía ninguna pantalla de ajustes: cambiar la
// contraseña estando dentro de la app era imposible — había que cerrar sesión,
// pedir el enlace de "olvidé mi contraseña" y abrir el correo.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA } from "./fake-supabase.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

async function configurarBackend(request, opciones) {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function entrar(page) {
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("button", { name: /Hacer el menú de la semana/ }).waitFor();
}

const abrirAjustes = (page) => page.getByRole("button", { name: "Ajustes" }).click();

test.describe("el engranaje", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      retrasoPerrosMs: 50, perros: [PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA], menus: [],
    });
  });

  test("está a la vista y lleva a los ajustes", async ({ page }) => {
    await entrar(page);
    await expect(page.getByRole("button", { name: "Ajustes" })).toBeVisible();
    await abrirAjustes(page);
    await expect(page.getByRole("heading", { name: /Tu cuenta/ })).toBeVisible();
  });

  test("tiene las dos mitades: los perros y la cuenta", async ({ page }) => {
    await entrar(page);
    await abrirAjustes(page);

    // Los perros, los dos, con qué hacer con cada uno.
    for (const nombre of [PERRO_DE_PRUEBA.nombre, SEGUNDO_PERRO_DE_PRUEBA.nombre]) {
      await expect(page.getByText(nombre).first()).toBeVisible();
    }
    await expect(page.getByRole("button", { name: /Editar ficha/ })).toBeVisible();
    await expect(page.getByRole("button", { name: new RegExp(`Ir a ${SEGUNDO_PERRO_DE_PRUEBA.nombre}`) })).toBeVisible();
    await expect(page.getByRole("button", { name: /Añadir otro perro/ })).toBeVisible();
    // "Borrar a X" también existe en la ficha de detrás, así que se
    // busca el de los ajustes por su subtítulo, que es solo de aquí.
    await expect(page.getByRole("button", { name: /Se van también sus menús/ })).toBeVisible();

    // Y la cuenta: el correo, la contraseña y cerrar sesión.
    await expect(page.getByText(CUENTA_DE_PRUEBA.email)).toBeVisible();
    await expect(page.getByRole("button", { name: /Cambiar la contraseña/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Cerrar sesión/ })).toBeVisible();
  });

  test("la contraseña no se cambia si las dos no coinciden", async ({ page }) => {
    // Sin esto, un dedazo al repetirla te deja fuera de tu propia cuenta y
    // sin saber por qué: la contraseña sería la que escribiste MAL.
    await entrar(page);
    await abrirAjustes(page);
    await page.getByRole("button", { name: /Cambiar la contraseña/ }).click();

    await page.getByPlaceholder(/Al menos 6/).fill("secreta123");
    await page.getByPlaceholder("Repítela").fill("secreta124");
    await page.getByRole("button", { name: "Guardar" }).click();

    await expect(page.getByText(/no son iguales/)).toBeVisible();
    // y sigue en el formulario, sin haber guardado nada
    await expect(page.getByPlaceholder("Repítela")).toBeVisible();
  });

  test("ni si es demasiado corta", async ({ page }) => {
    await entrar(page);
    await abrirAjustes(page);
    await page.getByRole("button", { name: /Cambiar la contraseña/ }).click();

    await page.getByPlaceholder(/Al menos 6/).fill("abc");
    await page.getByPlaceholder("Repítela").fill("abc");
    await page.getByRole("button", { name: "Guardar" }).click();

    await expect(page.getByText(/al menos 6 caracteres/i)).toBeVisible();
  });

  test("al cambiar el correo se dice que hay que confirmarlo", async ({ page, request }) => {
    // Supabase manda un enlace al correo NUEVO y hasta que se abre, la
    // cuenta sigue con el viejo. Si no se dice, parece que no ha ido.
    await entrar(page);
    await abrirAjustes(page);
    await page.getByRole("button", { name: /^Correo/ }).click();
    await page.getByPlaceholder("tu@correo.com").fill("nuevo@correo.com");
    await page.getByRole("button", { name: "Guardar" }).click();

    await expect(page.getByText(/sigue con el correo de antes/)).toBeVisible();
    // Y que se pidió de verdad, no solo que salga el mensaje.
    const { ultimoCambioDeCuenta } = await configurarBackend(request, {});
    expect(ultimoCambioDeCuenta?.email).toBe("nuevo@correo.com");
  });
});

test.describe("el engranaje sin cuenta", () => {
  test("ofrece crear la cuenta, no cerrar sesión", async ({ page, request }) => {
    await configurarBackend(request, { retrasoPerrosMs: 50, sinPerro: true, menus: [] });
    await page.addInitScript(() => {
      window.localStorage.setItem("rawku.local.sinCuenta", "true");
      window.localStorage.setItem("rawku.local.perros", JSON.stringify([{
        id: "local-1", user_id: "local", nombre: "Ruffo", peso_actual: 12,
        fecha_nacimiento: "2019-03-10", sexo: "macho", castrado: true,
        actividad: "media", condicion_idx: 2, tamano: "Mediano",
        created_at: "2026-08-20T10:00:00.000Z",
      }]));
      window.localStorage.setItem("rawku.local.menus", "[]");
    });
    await page.goto("/");
    await page.getByRole("button", { name: "Ajustes" }).click();

    await expect(page.getByRole("button", { name: /Crear una cuenta/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /Cerrar sesión/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Cambiar la contraseña/ })).toHaveCount(0);
  });
});
