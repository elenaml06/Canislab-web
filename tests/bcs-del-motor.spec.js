// ─── Las cifras del BCS las manda el MOTOR, no las sabe la app ───────────────
//
// POR QUÉ EXISTE (12 de septiembre de 2026)
//
// Elena, al ver que la app y el motor daban dos pesos objetivo distintos para
// el mismo perro:
//
//     «te dije que la app no puede tener datos sueltos, todo le tiene que
//      llegar del motor»
//
// Las seis cifras que deciden el peso objetivo —la banda ideal, el % por punto,
// dónde se satura la escala, el exceso del BCS 9 y el tope al alza— estaban
// escritas en `src/bcs.js` Y en el motor. Y las dos copias YA se habían
// separado: para un perro de 30 kg con BCS 9 la app calculaba 21,43 kg (la
// recta del 10 % por punto, 30/1,40) y el motor devolvía 20,69, que es el
// «>45 %» de la Tabla VII-2 de FEDIAF (30/1,45). El motor tenía razón.
//
// Ahora `bcs.js` las lee de `GET /vocabulario` y sus valores escritos son solo
// RESPALDO, para cuando Render duerme.
//
// ⚠️ Y POR ESO ESTA PRUEBA SIEMBRA CIFRAS INVENTADAS, no las de verdad. Con las
// buenas, «la app lo ha leído del motor» y «la app está pintando su respaldo»
// dan el mismo número y se ven exactamente igual: la prueba pasaría en verde
// con la petición entera comentada. Es la misma razón por la que
// `vocabulario.spec.js` siembra palabras inventadas y `formulador.spec.js`
// nombres de nutriente inventados.
import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { irAlGenerador } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

async function configurarBackend(request, opciones) {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

// El escalón «Obeso» del dueño ES un BCS 9, que es justo donde la escala deja
// de ser una recta y donde las dos copias se habían separado.
const PESO = 30.0;
const PERRO_OBESO = {
  ...PERRO_DE_PRUEBA,
  nombre: "Nala",
  peso_actual: PESO,
  condicion_idx: 4,          // «Obeso» -> BCS 9
  etapa: "adulto",
  tamano: "Grande",
  raza: "Pastor Alemán",
  fecha_nacimiento: "2021-05-14",
  dieta_actual: "barf",
};

// Un exceso que NO es el de FEDIAF ni el de la recta: si la app lo usa, solo
// puede haberlo sacado de aquí.
const EXCESO_INVENTADO = 0.8;
const OBJETIVO_ESPERADO = Math.round((PESO / (1 + EXCESO_INVENTADO)) * 100) / 100;  // 16,67

const VOCABULARIO_SEMBRADO = {
  condicion_corporal: {
    de_donde: "sembrado por bcs-del-motor.spec.js",
    escala: "1 a 9",
    ideal: 5,
    ideal_min: 4,
    pct_por_punto: 0.1,
    escala_saturada: 9,
    exceso_en_escala_saturada: EXCESO_INVENTADO,
    tope_correccion_al_alza: 1.2,
    escalones_del_dueno: { 0: 1, 1: 3, 2: 5, 3: 7, 4: 9 },
    puntos: [],
  },
};

test.describe("el peso objetivo se calcula con las cifras que manda el motor", () => {
  test("un exceso inventado en /vocabulario cambia el peso que viaja al servidor", async ({ page, request }) => {
    await configurarBackend(request, {
      retrasoPerrosMs: 50,
      perros: [PERRO_OBESO],
      menus: [],
      premium: true,
      vocabulario: VOCABULARIO_SEMBRADO,
    });

    await page.goto("/");
    await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
    await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await irAlGenerador(page);
    await page.getByRole("button", { name: /^Automático/ }).click();
    await page.getByRole("button", { name: /^(Generar|Hacer)/ }).click();
    await expect(page.getByText(/Semana de/)).toBeVisible({ timeout: 30000 });

    const { peticionesMenu } = await configurarBackend(request, { olvidarPeticionesMenu: false });
    expect(peticionesMenu.length, "no ha salido ninguna petición de menú").toBeGreaterThan(0);

    const objetivo = peticionesMenu[0].peso_objetivo_kg;
    expect(objetivo,
      `la app ha mandado ${objetivo} kg de objetivo. Con el exceso sembrado ` +
      `(${EXCESO_INVENTADO}) tienen que ser ${OBJETIVO_ESPERADO}. Si ha mandado 20.69 está ` +
      `usando su RESPALDO (el 0,45 de FEDIAF) en vez de lo que dice el motor, y entonces el ` +
      `día que el motor cambie esa cifra la app se queda con la vieja — que es exactamente ` +
      `lo que había pasado con el BCS 9`)
      .toBeCloseTo(OBJETIVO_ESPERADO, 1);
  });
});
