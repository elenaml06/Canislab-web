// ─── A quien YA PAGA no se le dice que el pago ha fallado ──────────────────
//
// POR QUÉ EXISTE (18 de septiembre de 2026)
//
// `/stripe/checkout` comprueba, ANTES de crear nada, si esa persona ya tiene
// una suscripción viva, y si la tiene contesta:
//
//     {ya_suscrito: true, url: null, motivo: "Ya tienes una suscripción activa…"}
//
// La pantalla de suscripción solo miraba `data.url`, así que caía al `else` y
// pintaba **«No se pudo iniciar el pago. Inténtalo de nuevo.»** — o sea que al
// ÚNICO al que no hay que cobrar se le estaba invitando a reintentar. Lo que
// el endpoint existe para impedir, la app lo pedía por pantalla.
//
// Y la otra mitad: gestionar la suscripción va por `/stripe/portal` **con el
// token de sesión**, no con el id de cliente. Un identificador no es una
// credencial: mandando el de otra persona se abría SU facturación, y eso se
// tapó en el motor el 11 de septiembre. Desde entonces `/stripe/checkout` ya
// no devuelve la URL del portal, así que este es el único camino.
//
// ⚠️ PARADO, COMO LAS DEMÁS PRUEBAS DEL MURO. El muro está apagado
// (`VITE_PAYWALL="off"`), así que la pantalla de suscripción no se alcanza y
// esto no puede correr tal cual. NO se borra: el día que se encienda, esto
// tiene que correr ANTES de desplegarlo, porque el fallo que vigila es cobrar
// dos veces. Está apuntado en `PENDIENTE_DINERO_Y_SALUD.md`.
//
// Lo que YA se puede dar por hecho sin encender nada: el servidor de mentira
// sirve las dos rutas (`/stripe/checkout` y `/stripe/portal`) con la misma
// forma que el de verdad, incluido el 401 sin token.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { irAlGenerador } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

async function configurarBackend(request, opciones) {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function loQueHaRecibido(request) {
  const res = await request.get(`${SUPABASE_FALSO}/__control`);
  return res.json();
}

test.describe("a quien ya paga no se le dice que el pago ha fallado", () => {
  test.skip(true, "el muro está apagado (VITE_PAYWALL=off): reactivar junto con él");

  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      perros: [PERRO_DE_PRUEBA], menus: [], yaSuscrito: true,
    });
  });

  async function abrirSuscripcion(page) {
    await page.goto("/");
    await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
    await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await irAlGenerador(page);
    await page.getByRole("button", { name: /Hazte Premium|Suscri/i }).first().click();
  }

  test("se le dice que ya la tiene, y NO «inténtalo de nuevo»", async ({ page }) => {
    await abrirSuscripcion(page);
    await page.getByRole("button", { name: /Empezar|Suscribirme|Continuar/i }).first().click();

    await expect(page.getByText(/Ya tienes una suscripción activa/)).toBeVisible();
    // Y lo que NO puede salir, que es lo que salía: el mensaje de error que
    // invita a volver a pagar.
    await expect(page.getByText("No se pudo iniciar el pago. Inténtalo de nuevo.")).toHaveCount(0);
  });

  test("y se le ofrece gestionarla, con el TOKEN y no con el id de cliente", async ({ page, request }) => {
    await abrirSuscripcion(page);
    await page.getByRole("button", { name: /Empezar|Suscribirme|Continuar/i }).first().click();
    await page.getByRole("button", { name: "Gestionar mi suscripción" }).click();

    const { peticionesPortal } = await loQueHaRecibido(request);
    expect(peticionesPortal.length).toBeGreaterThan(0);
    const p = peticionesPortal[peticionesPortal.length - 1];
    // El token es lo que prueba quién eres. El id de cliente NO viaja: con él
    // se abría la facturación de cualquiera.
    expect(p.token_usuario, "el portal se abre con el token de sesión").toBeTruthy();
    expect(p.stripe_customer_id, "el id de cliente no puede decidir de quién es el portal")
      .toBeUndefined();
  });
});
