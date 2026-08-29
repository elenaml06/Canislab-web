// ─── LA PUERTA: REGISTRARSE COMO VETERINARIO ─────────────────────────────────
//
// POR QUÉ EXISTE. El modo profesional estaba solo en Ajustes, o sea escondido
// detrás de saber que existe. Un veterinario que entra como un dueño más no
// descubre nunca que la app también es para él.
//
// Y lo que hay que vigilar es lo de siempre, un peldaño más arriba:
// registrarse como veterinario DECLARA, no acredita. El número viaja con la
// cuenta para que una persona lo mire; hasta que lo mire, la app es la de
// cualquier tutor.
import { test, expect } from "@playwright/test";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

test.describe("registrarse como veterinario", () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.post(`${SUPABASE_FALSO}/__control`, {
      data: { retrasoPerrosMs: 50, menus: [], rolProfesional: false, rolVerificado: false },
    });
    expect(res.ok()).toBeTruthy();
  });

  test("la puerta ofrece las dos cuentas, y por defecto la de tutor", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Créala gratis/ }).click();

    await expect(page.getByRole("button", { name: "Para mi perro" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Soy veterinario/a" })).toBeVisible();

    // Por defecto, tutor: la mayoría de quien entra no es veterinario, y
    // pedirle un número de colegiado de entrada sería un muro.
    await expect(page.getByRole("button", { name: "Para mi perro" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByPlaceholder("Número de colegiado")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Crear cuenta", exact: true })).toBeVisible();
  });

  test("al elegir veterinario aparece el número, y es obligatorio", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: /Créala gratis/ }).click();
    await page.getByRole("button", { name: "Soy veterinario/a" }).click();

    await expect(page.getByPlaceholder("Número de colegiado")).toBeVisible();
    await expect(page.getByRole("button", { name: "Crear cuenta profesional" })).toBeVisible();

    // Y se dice ANTES de crear la cuenta que esto no enciende nada: que
    // nadie crea que por marcarlo ya tiene el modo.
    await expect(page.getByText(/Lo comprobamos a mano/)).toBeVisible();
  });

  test("a un veterinario no se le ofrece entrar sin cuenta", async ({ page }) => {
    // ⚠️ Sin cuenta no hay perfil, y sin perfil no hay a quién acreditar ni
    // de quién son los pacientes. Ofrecerle ese botón sería mandarle por la
    // única puerta donde NO está lo que ha venido a buscar: se iría
    // pensando que la app no lo tiene.
    await page.goto("/");
    await page.getByRole("button", { name: /Créala gratis/ }).click();
    await expect(page.getByRole("button", { name: /sin crear cuenta|Seguir sin cuenta/ })).toBeVisible();

    await page.getByRole("button", { name: "Soy veterinario/a" }).click();
    await expect(page.getByRole("button", { name: /sin crear cuenta|Seguir sin cuenta/ })).toHaveCount(0);
    // Y se explica por qué, en vez de desaparecer sin más.
    await expect(page.getByText(/El modo veterinario necesita cuenta/)).toBeVisible();

    // Al volver a tutor, vuelve.
    await page.getByRole("button", { name: "Para mi perro" }).click();
    await expect(page.getByRole("button", { name: /sin crear cuenta|Seguir sin cuenta/ })).toBeVisible();
  });

  test("volver a 'para mi perro' quita el número", async ({ page }) => {
    // Si se quedara puesto, alguien que probó el botón por curiosidad
    // acabaría mandando un número que no es suyo.
    await page.goto("/");
    await page.getByRole("button", { name: /Créala gratis/ }).click();
    await page.getByRole("button", { name: "Soy veterinario/a" }).click();
    await expect(page.getByPlaceholder("Número de colegiado")).toBeVisible();

    await page.getByRole("button", { name: "Para mi perro" }).click();
    await expect(page.getByPlaceholder("Número de colegiado")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Crear cuenta", exact: true })).toBeVisible();
  });
});
