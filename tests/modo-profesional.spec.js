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
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA } from "./fake-supabase.js";
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

  test("acreditada, ENTRA YA en su modo sin tener que buscar nada", async ({ page, request }) => {
    // ⚠️ CAMBIADO (28 agosto). Antes empezaba apagado, y eso dejaba a quien
    // acabábamos de acreditar viendo la app de un dueño: lo suyo seguía
    // escondido detrás de saber que existe un interruptor en Ajustes. Es el
    // mismo fallo que tenía la pantalla de registro, un paso más adentro.
    await configurarBackend(request, {
      retrasoPerrosMs: 50, perros: [PERRO_DE_PRUEBA], menus: [],
      rolProfesional: true, rolVerificado: true,
      // ⚠️ CON UN PACIENTE (29 agosto). Lo que se prueba aquí es el
      // interruptor de Ajustes, y para llegar a Ajustes hay que estar
      // DENTRO de una ficha. Desde que existe la puerta del veterinario, un
      // acreditado sin ningún paciente entra por su lista vacía y no por
      // una ficha -- que es justo lo que se quería --, así que sin este
      // acceso este test fallaría por el motivo equivocado.
      accesos: [{ perro_id: PERRO_DE_PRUEBA.id, estado: "activo" }],
    });
    await entrar(page);
    await abrirAjustes(page);

    await expect(page.getByRole("button", { name: /Modo veterinario/ })).toBeVisible();
    await expect(page.getByText(/ves la ficha clínica/)).toBeVisible();
  });

  test("y puede apagarlo, y se le respeta", async ({ page, request }) => {
    // Lo que se guarda es la ELECCIÓN, no el estado: un veterinario con
    // perro propio puede quedarse en modo tutor y no se le vuelve a mover.
    await configurarBackend(request, {
      retrasoPerrosMs: 50, menus: [],
      rolProfesional: true, rolVerificado: true,
      // ⚠️ LOS DOS PERROS, y aquí sí hacen falta los dos: este test apaga el
      // modo y RECARGA. Con solo el paciente, al apagarlo se queda sin
      // perros (sus pacientes no son suyos) y cae en el asistente, así que
      // fallaría por el motivo equivocado. Un veterinario con perro propio
      // es justo el caso que describe el interruptor.
      perros: [PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA],
      accesos: [{ perro_id: PERRO_DE_PRUEBA.id, estado: "activo" }],
    });
    await entrar(page);
    await abrirAjustes(page);
    await page.getByRole("button", { name: /Modo veterinario/ }).click();
    await expect(page.getByText(/usas Rawku como cualquier tutor/)).toBeVisible();

    // Y sigue apagado después de recargar: si volviera a encenderse solo,
    // el interruptor no serviría de nada.
    await page.reload();
    await esperarLaFicha(page);
    await abrirAjustes(page);
    await expect(page.getByText(/usas Rawku como cualquier tutor/)).toBeVisible();
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

// ─── LOS PACIENTES NO SE MEZCLAN CON EL PERRO PROPIO ─────────────────────────
//
// ⚠️ Un veterinario tiene en su cuenta las dos cosas, y las dos filas llevan
// `user_id` = él. Lo que las distingue es tener fila en `accesos`. Si esto
// se rompe no da ningún error: le sale su perro entre los pacientes, o sus
// pacientes entre sus perros, y solo se ve si te fijas.
test.describe("los pacientes y el perro propio", () => {
  const NALA = PERRO_DE_PRUEBA;                 // el paciente
  const CAIRO = SEGUNDO_PERRO_DE_PRUEBA;        // el perro del veterinario

  const montar = (request, extra) => configurarBackend(request, {
    retrasoPerrosMs: 50, menus: [],
    perros: [NALA, CAIRO],
    // Nala tiene acceso => es paciente. Cairo no => es su perro.
    accesos: [{ perro_id: NALA.id, estado: "activo", origen: "creado_por_el_profesional" }],
    rolProfesional: true, rolVerificado: true,
    ...extra,
  });

  test("en modo veterinario se ven los pacientes, no sus perros", async ({ page, request }) => {
    await montar(request);
    await entrar(page);
    await page.getByRole("button", { name: /Perro actual/ }).last().click();

    const hoja = page.getByRole("dialog", { name: "Tus perros" });
    await expect(hoja.getByText("Tus pacientes")).toBeVisible();
    await expect(hoja.getByText("Nala")).toBeVisible();
    // Y su propio perro NO está en la lista de pacientes.
    await expect(hoja.getByText("Cairo")).toHaveCount(0);
  });

  test("y en modo tutor, sus perros y no sus pacientes", async ({ page, request }) => {
    await montar(request);
    await entrar(page);
    // Apagar el modo desde Ajustes.
    await page.getByRole("button", { name: /Perro actual/ }).last().click();
    await page.getByRole("dialog", { name: "Tus perros" })
              .getByRole("button", { name: "Ajustes", exact: true }).click();
    await page.getByRole("button", { name: /Modo veterinario/ }).click();
    await expect(page.getByText(/usas Rawku como cualquier tutor/)).toBeVisible();
    await page.getByRole("button", { name: "Volver" }).first().click();
    await esperarLaFicha(page);

    await page.getByRole("button", { name: /Perro actual/ }).last().click();
    const hoja = page.getByRole("dialog", { name: "Tus perros" });
    await expect(hoja.getByText("Tus perros")).toBeVisible();
    await expect(hoja.getByText("Cairo")).toBeVisible();
    await expect(hoja.getByText("Nala")).toHaveCount(0);
  });

  test("si no se pueden leer los accesos, se ven TODOS los perros", async ({ page, request }) => {
    // ⚠️ EL LADO SEGURO DEL ERROR, y hubo que medirlo: tratando "no se ha
    // podido leer" igual que "no hay ninguno", un veterinario en su modo se
    // quedaba SIN NINGÚN PERRO en pantalla en cuanto faltara la migración.
    // `sinTablaAccesos` hace que el servidor conteste con un error, que es
    // lo que pasa de verdad cuando la tabla no existe.
    await montar(request, { sinTablaAccesos: true });
    await entrar(page);
    await page.getByRole("button", { name: /Perro actual/ }).last().click();
    const hoja = page.getByRole("dialog", { name: "Tus perros" });
    await expect(hoja.getByText("Nala")).toBeVisible();
    await expect(hoja.getByText("Cairo")).toBeVisible();
  });
});
