// ─── Los avisos de patología tienen que LLEGAR A LA PANTALLA ────────────────
//
// POR QUÉ EXISTE (10 de septiembre de 2026)
//
// La API manda `avisos_patologia` con CADA menú desde el 29 de agosto. Los
// monta el motor (`avisos_de_patologias`), y desde el 8 de septiembre incluyen
// los `avisos_extra`: hoy son veinte, en doce patologías. **La app no los leía
// en ningún sitio.** `respuestaApiAMenu` recoge campo por campo lo que le
// interesa de la respuesta, y ese no estaba en la lista, así que se perdían
// ahí mismo — dos líneas por debajo de un comentario que cuenta que eso ya
// había pasado antes con `problemas_seguridad`.
//
// Y no son avisos de relleno. Dicen justo lo que el motor NO puede hacer solo:
//
//   · que a un perro con BROMURO POTÁSICO hay que medirle el bromo en sangre
//     DESPUÉS de cambiarle la dieta — y el cambio de dieta lo hace esta app;
//   · que el MITOTANO se absorbe treinta veces mejor con comida que en ayunas,
//     y que un perro «resistente» puede ser un perro al que le dan la pastilla
//     en ayunas;
//   · que el zinc oral NO se da con la comida, que es justo lo contrario de lo
//     que hace todo el mundo;
//   · contra qué número se lee una analítica de taurina.
//
// Dos de ellos describen algo que pasa POR CULPA del cambio de dieta que hace
// esta app. Un aviso que el servidor manda y la pantalla no pinta no existe.
//
// Comprobado que falla si se rompe: quitando `avisosPatologia` de
// `respuestaApiAMenu`, esta prueba se pone en rojo.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { irAlGenerador } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

async function configurarBackend(request, opciones) {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

// Textos cortos y reconocibles, del mismo estilo que los de verdad. No se usan
// los reales para que la prueba no se caiga cada vez que se afina una palabra:
// lo que vigila es el CAMINO, no la redacción.
const AVISO_FARMACO =
  "Si tu perro toma bromuro potásico, este cambio de dieta es motivo para que le midan el bromo en sangre.";
const AVISO_MANEJO =
  "El zinc oral no se da con la comida: darlo con comida es lo que impide que se absorba.";

// Con patología, que es cuando la API los manda y cuando sale el panel.
// Viene de pienso, como en `menu-dos-pestanas.spec.js`: sin ese dato el paso de
// la dieta actual no se contesta solo y el botón de Automático sigue apagado.
const PERRO_CON_PATOLOGIA = { ...PERRO_DE_PRUEBA, dieta_actual: "pienso", patologias: ["epilepsia_idiopatica"] };

test.describe("los avisos de patología llegan a la pantalla", () => {
  test("el menú pinta lo que el motor no puede hacer solo", async ({ page, request }) => {
    await configurarBackend(request, {
      retrasoPerrosMs: 100,
      perros: [PERRO_CON_PATOLOGIA],
      menus: [],
      avisosPatologia: [AVISO_FARMACO, AVISO_MANEJO],
    });

    await page.goto("/");
    await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
    await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await irAlGenerador(page);
    await page.getByRole("button", { name: "Pienso", exact: true }).click();
    await page.getByRole("button", { name: /^Automático/ }).click();
    await page.getByRole("button", { name: /^Generar/ }).click();
    await page.getByText(/Menú 1|Carne muscular/).first().waitFor({ timeout: 30000 });

    // Los dos, enteros. Si `respuestaApiAMenu` deja de recogerlos o el panel
    // deja de pintarlos, aquí no hay nada que encontrar.
    await expect(page.getByText(AVISO_FARMACO)).toBeVisible();
    await expect(page.getByText(AVISO_MANEJO)).toBeVisible();
  });

  test("sin avisos que dar, no se inventa ninguno", async ({ page, request }) => {
    await configurarBackend(request, {
      retrasoPerrosMs: 100,
      perros: [PERRO_CON_PATOLOGIA],
      menus: [],
      avisosPatologia: [],
    });

    await page.goto("/");
    await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
    await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await irAlGenerador(page);
    await page.getByRole("button", { name: "Pienso", exact: true }).click();
    await page.getByRole("button", { name: /^Automático/ }).click();
    await page.getByRole("button", { name: /^Generar/ }).click();
    await page.getByText(/Menú 1|Carne muscular/).first().waitFor({ timeout: 30000 });

    // El panel de la patología sigue saliendo -- es el que dice que lo tiene
    // que aprobar el veterinario -- pero sin viñetas colgando de él.
    await expect(page.getByText("Este menú TIENE que aprobarlo tu veterinario")).toBeVisible();
    await expect(page.getByText(AVISO_FARMACO)).toHaveCount(0);
  });
});
