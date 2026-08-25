// ─── La papelera: quitar un alimento del menú ────────────────────────────────
//
// PEDIDO EXPRESO (25 agosto): "me gustaría también que existiese un botón de
// cruz o papelera para eliminar un alimento de una dieta cuando se edita la
// dieta, ¿se podría hacer?".
//
// El servidor ya sabía hacerlo desde agosto (/menu/quitar) y la app tenía
// hasta la función escrita -- sin que la llamara nadie. Lo que faltaba era
// el botón.
//
// LO QUE VIGILAN ESTAS PRUEBAS, y por qué cada una:
//
//   · Que NO quite al primer toque. Un alimento quitado no se puede volver
//     a poner: "añadir" solo existe para suplementos comerciales. Un toque
//     sin querer en una lista con siete filas te deja sin el pollo.
//   · Que mande el alimento QUE ES. Mirando la pantalla no se distingue
//     quitar el pollo de quitar el hígado, porque el menú se rehace entero
//     en los dos casos. Por eso se mira la petición.
//   · Que el menú se rehaga de verdad. Quitar el hígado no es el mismo menú
//     con menos hígado: es otro menú que tiene que volver a cumplir los 30
//     requisitos.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { irAlGenerador } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

// ⚠️ `menusDistintos` es NO PERSISTENTE a propósito (se puso así en agosto
// para que no se colara entre pruebas), así que cada llamada al control lo
// apaga si no se vuelve a mandar. Leer los contadores a media prueba lo
// apagaba, y el menú rehecho dejaba de ser reconocible -- la prueba fallaba
// por la prueba, no por la app. Se manda siempre al leer.
const leerControl = (request) =>
  configurar(request, { olvidarPeticionesMenu: false, menusDistintos: true });

const configurar = async (request, opciones) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
};

const EL_QUE_SE_QUITA = "Hígado de ternera";

async function haciaUnMenu(page) {
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await irAlGenerador(page);
  await page.getByRole("button", { name: /^Automático/ }).click();
  await page.getByRole("button", { name: /^(Generar|Hacer)/ }).click();
  await expect(page.getByText(/Semana de/)).toBeVisible({ timeout: 20000 });
}

test.describe("quitar un alimento del menú", () => {
  test.beforeEach(async ({ request }) => {
    await configurar(request, {
      retrasoPerrosMs: 50,
      menusDistintos: true,          // así el menú rehecho se reconoce
      perros: [{ ...PERRO_DE_PRUEBA, dieta_actual: "barf" }],
      menus: [], olvidarUltimoMenu: true,
    });
  });

  test("pide confirmación, y solo entonces lo quita", async ({ page, request }) => {
    await page.goto("/");
    await haciaUnMenu(page);

    await page.getByRole("button", { name: `Quitar ${EL_QUE_SE_QUITA}` }).click();
    await expect(page.getByRole("button", { name: `Confirmar quitar ${EL_QUE_SE_QUITA}` }),
      "la papelera no pregunta nada").toBeVisible();

    // Todavía NO se ha tocado el menú.
    const antes = await leerControl(request);
    expect(antes.peticionesEdicion.filter((p) => p.ruta === "/menu/quitar"),
      "ha quitado el alimento con el primer toque, sin preguntar").toEqual([]);

    await page.getByRole("button", { name: `Confirmar quitar ${EL_QUE_SE_QUITA}` }).click();

    // Y ahora sí: la petición sale, con ESE alimento.
    await expect.poll(async () => {
      const { peticionesEdicion } = await leerControl(request);
      return peticionesEdicion.filter((p) => p.ruta === "/menu/quitar").map((p) => p.alimento);
    }, { message: "no ha llegado ninguna petición de quitar, o llegó con otro alimento" })
      .toEqual([EL_QUE_SE_QUITA]);

    // Y el menú se ha rehecho de verdad, no solo desaparecido una fila.
    await expect(page.getByText("Marcador tras editar").first(),
      "el menú no se ha vuelto a calcular al quitar el alimento").toBeVisible();
  });

  test("se puede echar atrás sin tocar el menú", async ({ page, request }) => {
    await page.goto("/");
    await haciaUnMenu(page);

    await page.getByRole("button", { name: `Quitar ${EL_QUE_SE_QUITA}` }).click();
    await page.getByRole("button", { name: "Dejarlo" }).click();

    await expect(page.getByRole("button", { name: `Confirmar quitar ${EL_QUE_SE_QUITA}` }),
      "la confirmación sigue abierta después de decir que no").toHaveCount(0);

    const { peticionesEdicion } = await leerControl(request);
    expect(peticionesEdicion.filter((p) => p.ruta === "/menu/quitar"),
      "ha quitado el alimento aunque se dijo que no").toEqual([]);
  });
});
