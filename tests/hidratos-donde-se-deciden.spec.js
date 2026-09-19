// ─── LA PREGUNTA DE LOS HIDRATOS: DÓNDE SALE Y A QUIÉN ───────────────────────
//
// ⚠️ POR QUÉ EXISTE (19 de septiembre de 2026). Dos frases de Elena, el mismo
// día y sobre la misma pregunta:
//
//   1. «cuando el usuario marca que quiere meter hidratos [...] ¿debería ir un
//      poco más adelante? O sea, después de preguntar lo de BARF o cocinada, o
//      en la misma pantalla»
//   2. «y lo mismo para patologías, si tiene que llevar hidratos pues que no se
//      pregunte»
//
// La primera es de ORDEN: la pregunta estaba en la ficha, que se rellena una
// vez, y se contestaba ANTES de decir si la ración es cruda o cocinada -- que es
// lo que decide el catálogo entero.
//
// La segunda es de HONESTIDAD: a quien su enfermedad le obliga a llevarlos no se
// le ofrece elegir, se le cuenta. Una pregunta cuya respuesta no cambia nada le
// hace creer que decide algo.
//
// ⚠️ Y LA LISTA DE QUIÉN LOS PIDE NO ESTÁ AQUÍ NI EN LA APP: la sirve el motor
// derivada de `patologias.json`. Por eso esta prueba la SIEMBRA INVENTADA -- con
// las de verdad, «la app lo ha leído del motor» y «la app tiene su propia copia»
// se ven exactamente igual.
import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { irAlGenerador } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";
const configurar = async (request, opciones) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
};

// Palabras que no puede decir nadie más. Si salen en pantalla, vienen del motor.
const PREGUNTA = "PREGUNTA-DEL-MOTOR: ¿le pones Zzyrax al plato?";
const SI = "Zzyrax-que-si";
const NO = "Zzyrax-que-no";
const TEXTO_PATOLOGIA = "TEXTO-DEL-MOTOR: este menú lleva Zzyrax porque su enfermedad lo pide";
// Una patología de verdad (la app la tiene que poder marcar) que el motor
// declara como «los pide». Se siembra la DECLARACIÓN, no la patología.
const LA_QUE_LOS_PIDE = "pancreatitis";

const VOCAB = {
  hidratos: {
    pregunta_dueno: PREGUNTA,
    patologias_que_los_piden: [LA_QUE_LOS_PIDE],
    texto_si_los_pide_la_patologia: { dueno: TEXTO_PATOLOGIA, veterinario: "vet" },
    estados: [
      { clave: null, valor: null, dueno: { titulo: "sin contestar", ejemplo: "" } },
      { clave: "si", valor: true, dueno: { titulo: SI, ejemplo: "" } },
      { clave: "no", valor: false, dueno: { titulo: NO, ejemplo: "" } },
    ],
  },
};

async function entrar(page, request, perro, vocabulario) {
  await configurar(request, { premium: true, retrasoPerrosMs: 50, menus: [],
                              perros: [perro], vocabulario });
  await page.context().clearCookies();
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await irAlGenerador(page);
}

test.describe("la pregunta de los hidratos", () => {
  test("sale donde se elige cruda o cocinada, y no en la ficha", async ({ page, request }) => {
    await entrar(page, request, { ...PERRO_DE_PRUEBA, patologia_si: "no", patologias: [] }, VOCAB);
    // Es la MISMA pantalla que la de cruda/cocinada: las dos visibles a la vez.
    await expect(page.getByText(/^Cocinada$/)).toBeVisible();
    await expect(page.getByText(PREGUNTA),
      "la pregunta de los hidratos no sale en la pantalla donde se elige cruda o cocinada. " +
      "Preguntarla antes de saber de qué clase es la ración es contestarla a ciegas")
      .toBeVisible();
    await expect(page.getByRole("button", { name: SI })).toBeVisible();
    await expect(page.getByRole("button", { name: NO })).toBeVisible();
  });

  test("al perro cuya patología los PIDE no se le pregunta: se le cuenta",
    async ({ page, request }) => {
      await entrar(page, request,
                   { ...PERRO_DE_PRUEBA, patologia_si: "si", patologias: [LA_QUE_LOS_PIDE] },
                   VOCAB);
      await expect(page.getByText(TEXTO_PATOLOGIA),
        "a un perro cuya enfermedad OBLIGA a llevar hidratos no se le explica que los lleva")
        .toBeVisible();
      await expect(page.getByText(PREGUNTA),
        "se le sigue preguntando por los hidratos a un perro cuya enfermedad los exige. La " +
        "respuesta no cambiaría nada y le hace creer que decide algo")
        .toHaveCount(0);
    });

  // ⚠️ Y LA OTRA DIRECCIÓN, que es la que impide esconderla de más: con una
  // patología que NO está en la lista del motor, la pregunta sigue saliendo.
  test("con una patología que NO los pide, se pregunta igual", async ({ page, request }) => {
    await entrar(page, request,
                 { ...PERRO_DE_PRUEBA, patologia_si: "si", patologias: ["artrosis"] }, VOCAB);
    await expect(page.getByText(PREGUNTA),
      "la pregunta ha desaparecido con una patología que el motor NO declara como «los pide». " +
      "Esconder la pregunta de más le quita al dueño una decisión que sí es suya")
      .toBeVisible();
  });
});
