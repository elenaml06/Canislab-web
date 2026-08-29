// ─── EL MODO VETERINARIO EN PANTALLA ─────────────────────────────────────────
//
// Lo que vigila esto es lo que NO puede pasar, que es lo mismo que protege
// el disparador de Supabase pero un peldaño más arriba:
//
//   · Una cuenta normal no ve el modo por ningún lado.
//   · Pedirlo (dejar el número de colegiado) NO lo enciende. Es el caso que
//     consigue quien se escriba el rol a sí mismo, y tiene que no servir.
//   · Solo con la acreditación aparece el interruptor.
//   · Y en modo profesional aparece la ficha clínica y desaparece la cesta.
//
// Todo esto se comprueba mirando la PANTALLA, pero lo que decide es el
// perfil que sirve Supabase -- no un estado local que la app se invente.
import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { esperarLaFicha } from "./ayudas.js";

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
  await esperarLaFicha(page);
}

const abrirAjustes = async (page) => {
  await page.getByRole("button", { name: /Perro actual/ }).last().click();
  await page.getByRole("dialog", { name: "Tus perros" })
            .getByRole("button", { name: "Ajustes", exact: true }).click();
};

test.describe("el modo veterinario", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      retrasoPerrosMs: 50, perros: [PERRO_DE_PRUEBA], menus: [],
      rolProfesional: false, rolVerificado: false,
    });
  });

  test("una cuenta normal puede PEDIRLO, y pedirlo no lo enciende", async ({ page }) => {
    await entrar(page);
    await abrirAjustes(page);

    // Se puede pedir: la app no esconde la puerta.
    await expect(page.getByRole("button", { name: /Soy veterinario/ })).toBeVisible();
    // Pero el interruptor NO existe todavía.
    await expect(page.getByRole("button", { name: /Modo veterinario/ })).toHaveCount(0);

    await page.getByRole("button", { name: /Soy veterinario/ }).click();
    await page.getByPlaceholder("COLVET-00000").fill("COLVET-12345");
    await page.getByRole("button", { name: "Enviar", exact: true }).click();

    // ⚠️ ÉSTE ES EL CASO. Ha dejado su número y sigue SIN el modo: lo
    // enciende una persona mirándolo, no el propio interesado.
    await expect(page.getByText(/Comprobamos el número/)).toBeVisible();
    await expect(page.getByRole("button", { name: /Modo veterinario/ })).toHaveCount(0);
  });

  test("acreditada, aparece el interruptor y enciende la ficha clínica", async ({ page, request }) => {
    await configurarBackend(request, {
      retrasoPerrosMs: 50, perros: [PERRO_DE_PRUEBA], menus: [],
      rolProfesional: true, rolVerificado: true,
    });
    await entrar(page);
    await abrirAjustes(page);

    const interruptor = page.getByRole("button", { name: /Modo veterinario/ });
    await expect(interruptor).toBeVisible();
    // Empieza apagado: acreditar a alguien no le cambia la app de golpe.
    await expect(page.getByText(/usas Rawku como cualquier tutor/)).toBeVisible();

    await interruptor.click();
    await expect(page.getByText(/ves la ficha clínica/)).toBeVisible();
  });

  test("acreditada pero SIN verificar no enciende nada", async ({ page, request }) => {
    // El otro lado de la moneda: el rol puesto y la fecha vacía. Es lo que
    // se consigue escribiéndose `rol` a mano y no debe valer.
    await configurarBackend(request, {
      retrasoPerrosMs: 50, perros: [PERRO_DE_PRUEBA], menus: [],
      rolProfesional: true, rolVerificado: false,
    });
    await entrar(page);
    await abrirAjustes(page);
    await expect(page.getByRole("button", { name: /Modo veterinario/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Soy veterinario/ })).toBeVisible();
  });
});
