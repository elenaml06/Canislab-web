// ─── El peso objetivo no se mueve cuando el perro adelgaza ───────────────────
//
// CASO REAL (25 agosto): "creé el primer menú poniendo que pesaba 7 kg y que
// está rellenita, y luego actualicé el peso a 6.2 pero sigue quedándose en
// rellenito, entonces sigue metiendo menos kcal... si ya no está rellenita
// se le darían menos kcal de las que necesita el perro".
//
// El fallo era peor que el olvido de cambiar la condición. El objetivo se
// calculaba dividiendo el peso de HOY (rellenito = peso ÷ 1,20), así que
// bajaba con el perro y el ratio quedaba clavado en 1,20 pesara lo que
// pesara. Medido con Lola:
//
//     7,0 kg -> 263 kcal   6,5 -> 249   6,2 -> 240   5,9 -> 231
//
// Adelgazaba y le dábamos menos comida. Para siempre: la dieta no podía
// terminar nunca. Y al revés igual, un perro «Flaquito» está clavado en
// 0,90 y engorde lo que engorde sigue en régimen de subida.
//
// NINGUNA DE ESTAS PRUEBAS MIRA UN TEXTO DE AVISO. Todas miran las KCAL o
// el objetivo en kilos, que es lo que decide cuánta comida se le pone
// delante al perro.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

const configurar = async (request, opciones) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
};

// Lola: 7 kg, «Rellenito» (condicion_idx 3), objetivo ya fijado en 5,83.
// 70 × 5,83^0,75 = 263 kcal.
const LOLA = {
  ...PERRO_DE_PRUEBA,
  nombre: "Lola",
  peso_actual: 7,
  condicion_idx: 3,
  peso_objetivo_kg: 5.83,
  dieta_actual: "barf",
};

async function entrar(page) {
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByRole("button", { name: /Hacer el menú de la semana/ }).waitFor();
}

const irAEvolucion = async (page) => {
  await page.getByRole("button", { name: "Menú", exact: true }).last().click();
  await page.getByRole("dialog", { name: "Panel lateral" })
            .getByRole("button", { name: "Evolución y crecimiento", exact: true }).click();
  await expect(page.getByText(/Evolución de/)).toBeVisible();
};

const pesar = async (page, kg) => {
  await page.getByPlaceholder("ej. 18.5").fill(kg);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
};

test.describe("el peso objetivo se queda quieto", () => {
  test("adelgazar NO baja las kcal por su cuenta", async ({ page, request }) => {
    // El corazón del fallo. Con el objetivo fijo en 5,83, pesar 6,5 no
    // cambia nada: sigue siendo el mismo objetivo y la misma ración.
    // Recalculándolo (lo de antes) el objetivo pasaría a 5,42 y las kcal
    // a 249, que es exactamente lo que ella vio en su pantalla.
    await configurar(request, {
      retrasoPerrosMs: 50, perros: [LOLA], menus: [], olvidarUltimoMenu: true,
    });
    await page.goto("/");
    await entrar(page);
    await irAEvolucion(page);

    await expect(page.getByText(/263kcal\/día/),
      "no arranca con la ración del objetivo 5,83").toBeVisible();
    await expect(page.getByText(/Peso objetivo:\s*5,83 kg/)).toBeVisible();

    await pesar(page, "6.5");

    await expect(page.getByText(/Peso objetivo:\s*5,83 kg/),
      "el objetivo se ha movido al pesar: vuelve a bajar con el perro y la " +
      "dieta no podrá terminar nunca").toBeVisible();
    await expect(page.getByText(/263kcal\/día/),
      "ha adelgazado y le hemos bajado la ración sola, de 263 a menos").toBeVisible();
  });

  test("al pesar se pregunta cómo lo ves ahora", async ({ page, request }) => {
    // "Si solo cambia el peso y no cambia eso porque no se acuerda, pues es
    // un problema". Se pregunta después de guardar, así que el peso ya está
    // a salvo aunque no conteste.
    await configurar(request, {
      retrasoPerrosMs: 50, perros: [LOLA], menus: [], olvidarUltimoMenu: true,
    });
    await page.goto("/");
    await entrar(page);
    await irAEvolucion(page);
    await pesar(page, "6.5");

    await expect(page.getByText("¿Cómo ves a Lola ahora?"),
      "pesar no vuelve a preguntar por la condición").toBeVisible();
    await expect(page.getByRole("button", { name: "Ahora está: Ideal" })).toBeVisible();
  });

  test("y contestar rehace el objetivo con el peso nuevo", async ({ page, request }) => {
    // Contestar «Ideal» a 6,5 kg pone el objetivo en 6,5: se acabó la dieta
    // y la ración pasa a mantenimiento, que es justo lo que ella temía que
    // NO pasara ("si ya no está rellenita se le darían menos kcal de las
    // que necesita").
    await configurar(request, {
      retrasoPerrosMs: 50, perros: [LOLA], menus: [], olvidarUltimoMenu: true,
    });
    await page.goto("/");
    await entrar(page);
    await irAEvolucion(page);
    await pesar(page, "6.5");
    await page.getByRole("button", { name: "Ahora está: Ideal" }).click();

    await expect(page.getByText(/Peso objetivo:\s*6,5 kg/),
      "decir que ya está ideal no ha rehecho el objetivo").toBeVisible();
    await expect(page.getByText(/263kcal\/día/),
      "sigue con la ración de bajada aunque ya no le sobre peso").toHaveCount(0);
  });

  test("un objetivo de cachorro no mata de hambre al perro adulto", async ({ page, request }) => {
    // ⚠️ LA TRAMPA de guardar el objetivo en kilos. Un labrador marcado a
    // los 5 kg guardaría objetivo 5. De adulto con 30, el ratio sería 6 y
    // le pondríamos una ración de 5 kg de por vida. Un objetivo viejo es
    // MÁS peligroso que no tener ninguno, así que fuera de una banda
    // creíble se descarta y se recalcula.
    await configurar(request, {
      retrasoPerrosMs: 50,
      perros: [{ ...PERRO_DE_PRUEBA, nombre: "Toby", peso_actual: 30,
                 condicion_idx: 2, peso_objetivo_kg: 5, dieta_actual: "barf" }],
      menus: [], olvidarUltimoMenu: true,
    });
    await page.goto("/");
    await entrar(page);
    await irAEvolucion(page);

    // 70 × 5^0,75 = 234 kcal: la ración de un perro de 5 kg a dieta.
    await expect(page.getByText(/234kcal\/día/),
      "se está usando un objetivo de 5 kg en un perro de 30: eso es matarlo de hambre")
      .toHaveCount(0);
    await expect(page.getByText(/Peso objetivo:\s*30 kg/),
      "el objetivo viejo no se ha descartado").toBeVisible();
  });

  test("las fichas de antes piden confirmar su objetivo", async ({ page, request }) => {
    // Los perros guardados antes del 25 de agosto no tienen objetivo. Se
    // calcula, se enseña y se pide confirmarlo -- no se aplica a la callada,
    // que de ese número salen las kcal.
    await configurar(request, {
      retrasoPerrosMs: 50,
      perros: [{ ...LOLA, peso_objetivo_kg: null }],
      menus: [], olvidarUltimoMenu: true,
    });
    await page.goto("/");
    await entrar(page);
    await irAEvolucion(page);

    await expect(page.getByRole("button", { name: "Confirmar el peso objetivo" }),
      "una ficha sin objetivo no ofrece fijarlo").toBeVisible();
  });
});
