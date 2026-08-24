// ─── Entrar con Google ───────────────────────────────────────────────────────
//
// POR QUÉ
// Pedir un correo y una contraseña nuevos para ver si la app sirve es el
// paso donde más gente se va. Con Google es un toque.
//
// QUÉ PRUEBA ESTO Y QUÉ NO
// No prueba que Google funcione: eso depende de unas credenciales que hay
// que crear en Google Cloud y pegar en el panel de Supabase, y no viven en
// el código. Prueba lo que SÍ es nuestro:
//
//   · que el botón está donde tiene que estar (y no donde no),
//   · que manda al sitio correcto, con el proveedor correcto y volviendo a
//     nuestra app -- si el `redirect_to` estuviera mal, Google devolvería a
//     otro sitio y la sesión se perdería sin dar ningún error,
//   · y que si vuelves con un error, se LEE.
//
// Ese último es el importante. Mientras el proveedor no esté configurado,
// Supabase te devuelve a la app con el motivo en la URL. Si no lo pintamos,
// vuelves a la pantalla de entrar igual que estaba y parece que el botón no
// hace nada: un fallo invisible, que es la familia que peor se arregla.

import { test, expect } from "@playwright/test";

const EL_BOTON = /Continuar con Google/;

test.describe("entrar con Google", () => {
  test("el botón está al entrar y al crear cuenta, pero no en recuperar", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("button", { name: EL_BOTON })).toBeVisible();

    await page.getByRole("button", { name: /Créala gratis/ }).click();
    await expect(page.getByRole("button", { name: EL_BOTON })).toBeVisible();

    await page.getByRole("button", { name: /Volver al inicio de sesión/ }).click();
    await page.getByRole("button", { name: /Olvidé mi contraseña/ }).click();
    // Aquí no pega: no estás entrando, estás pidiendo un enlace.
    await expect(page.getByRole("button", { name: EL_BOTON })).toHaveCount(0);
  });

  test("manda a Google, con el proveedor y la vuelta correctos", async ({ page }) => {
    await page.goto("/");
    const origen = new URL(page.url()).origin;

    // El botón se va de la página. Se corta la navegación para poder mirar
    // A DÓNDE iba, que es lo que hay que comprobar.
    let destino = null;
    await page.route("**/auth/v1/authorize*", async (route) => {
      destino = route.request().url();
      await route.abort();
    });

    await page.getByRole("button", { name: EL_BOTON }).click();
    await expect.poll(() => destino, { timeout: 10000 }).not.toBeNull();

    const url = new URL(destino);
    expect(url.searchParams.get("provider")).toBe("google");
    // Y que vuelva A NUESTRA app: con esto mal, la sesión se pierde y no
    // hay ningún error que lo delate.
    expect(url.searchParams.get("redirect_to")).toBe(`${origen}/`);
  });

  test("si vuelves de Google con un error, se lee", async ({ page }) => {
    // Es lo que pasa mientras el proveedor no esté activado en Supabase.
    await page.goto("/?error=server_error&error_description=Unsupported%20provider");

    await expect(page.getByText(/No se ha podido entrar con Google/)).toBeVisible();
    await expect(page.getByText(/Unsupported provider/)).toBeVisible();
  });

  test("el error también se lee si viene en el hash", async ({ page }) => {
    // Según el flujo, el motivo llega en la query o detrás de la almohadilla.
    // Mirar solo uno de los dos deja la mitad de los casos en silencio.
    await page.goto("/#error=access_denied&error_description=Cuenta%20no%20autorizada");

    await expect(page.getByText(/Cuenta no autorizada/)).toBeVisible();
  });

  test("y no se queda pegado al recargar", async ({ page }) => {
    // Si la URL conservara el error, recargar lo repetiría para siempre.
    await page.goto("/?error=server_error&error_description=Unsupported%20provider");
    await expect(page.getByText(/Unsupported provider/)).toBeVisible();

    await page.reload();
    await expect(page.getByText(/Unsupported provider/)).toHaveCount(0);
  });
});
