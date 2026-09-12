// ─── Lo que FEDIAF dice, aplicado y COMPROBADO DENTRO DE LA APP ──────────────
//
// POR QUÉ EXISTE (11 de septiembre de 2026)
//
// Elena, después de que se aplicaran dos cosas de FEDIAF en el motor y en
// `der.js`: «comprueba con las cuentas de prueba que está funcionando de verdad
// en la app».
//
// Y no era retórico. Al hacerlo salió que `App.jsx` tenía SU PROPIA copia de la
// curva de crecimiento -- la tabla WALTHAM, copiada «letra por letra» de la que
// había en `der.py` -- y que era la que de verdad corría: App.jsx calcula
// `pesoAdultoEsperado` con ella ANTES de llamar a `calcularDER` y se lo pasa ya
// hecho. O sea que aplicar la Tabla VII-8a de FEDIAF en el motor y en `der.js`
// no habría movido NI UNA KCAL en la app, y las dos baterías habrían salido
// verdes. Código que parece aplicado y no lo está: la familia de fallos que
// `CLAUDE.md` llama «los que no puede encontrar la usuaria».
//
// Así que estas pruebas no miran el código: entran con la cuenta de prueba,
// siembran un perro, generan el menú y leen LO QUE SALE POR LA RED.
//
// LAS DOS COSAS QUE VIGILA:
//
//   1. El ideal de FEDIAF es una BANDA, 4 a 5 (§7.1.3 y §7.2.4.1, las dos
//      sobre Kealy 2002). A un perro en BCS 4 no se le sube el peso objetivo.
//   2. La curva de crecimiento es la Tabla VII-8a, y se le aplica también al
//      cachorro MESTIZO, que es el único que llega sin peso adulto de su raza.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { irAlGenerador } from "./ayudas.js";
import { pctPesoAdultoFediaf } from "../src/der.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

async function configurarBackend(request, opciones) {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function entrarYGenerar(page) {
  await page.goto("/");
  // Si ya hay sesión (segunda vuelta dentro del mismo test) no hay formulario.
  if (await page.getByPlaceholder("Email").count()) {
    await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
    await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
    await page.getByRole("button", { name: "Entrar" }).click();
  }
  await irAlGenerador(page);
  await page.getByRole("button", { name: /^Automático/ }).click();
  await page.getByRole("button", { name: /^(Generar|Hacer)/ }).click();
  await expect(page.getByText(/Semana de/)).toBeVisible({ timeout: 30000 });
}

// Una fecha de nacimiento que deje al perro con los meses que se le pidan.
function naceHaceMeses(meses) {
  const d = new Date();
  d.setMonth(d.getMonth() - Math.round(meses));
  return d.toISOString().slice(0, 10);
}

test.describe("el ideal de FEDIAF es una banda, 4 a 5, también en la app", () => {
  test("un perro en BCS 4 sale con su peso real, sin engordarlo", async ({ page, request }) => {
    const PESO = 24.5;
    await configurarBackend(request, {
      perros: [{ ...PERRO_DE_PRUEBA, peso_actual: PESO, bcs: 4, condicion_idx: 1,
                 dieta_actual: "barf" }],
      menus: [], premium: true,
    });
    await entrarYGenerar(page);

    const { peticionesMenu } = await configurarBackend(request, { olvidarPeticionesMenu: false });
    expect(peticionesMenu.length, "no ha salido ninguna petición de menú").toBeGreaterThan(0);

    for (const [i, p] of peticionesMenu.entries()) {
      // ⚠️ `/menu/v2` NO manda el `bcs`: la app resuelve el peso objetivo por su
      // cuenta y manda el resultado. Así que lo que hay que mirar es ESTE campo,
      // que es por donde la decisión del BCS llega al motor.
      // ⚠️ CON EL FALLO PUESTO (tomar el 5 como único ideal) esto sale 27,22 kg:
      // un 11 % más de peso objetivo y con él más kcal, para un perro que
      // FEDIAF dice que YA está donde tiene que estar.
      expect(p.peso_objetivo_kg,
        `la petición ${i + 1} manda ${p.peso_objetivo_kg} kg de objetivo para un perro de ` +
        `${PESO} kg en BCS 4. FEDIAF dice dos veces que el ideal es la banda 4 a 5 (§7.1.3 y ` +
        `§7.2.4.1, las dos sobre Kealy 2002, catorce años de labradores), así que aquí no hay ` +
        `nada que corregir`).toBeCloseTo(PESO, 2);
    }
  });

  test("y uno en BCS 3 apunta al 4, no al 5", async ({ page, request }) => {
    const PESO = 20;
    await configurarBackend(request, {
      perros: [{ ...PERRO_DE_PRUEBA, peso_actual: PESO, bcs: 3, condicion_idx: 1,
                 dieta_actual: "barf" }],
      menus: [], premium: true,
    });
    await entrarYGenerar(page);

    const { peticionesMenu } = await configurarBackend(request, { olvidarPeticionesMenu: false });
    expect(peticionesMenu.length).toBeGreaterThan(0);
    for (const p of peticionesMenu) {
      // 20/0,8 = 25 kg en BCS 5, y de ahí al borde de la banda (BCS 4): 22,5.
      // Apuntar al BCS 5 daría 25 y el tope del 20 % lo dejaría en 24.
      expect(p.peso_objetivo_kg,
        "un perro en BCS 3 apunta al borde de la banda ideal, que es el BCS 4"
      ).toBeCloseTo(22.5, 1);
      expect(p.peso_objetivo_kg).toBeLessThan(PESO * 1.20);
    }
  });
});

test.describe("la curva de crecimiento de FEDIAF llega al cachorro MESTIZO", () => {
  // ⚠️ EL PERRO TIENE QUE SER MESTIZO (raza: null). Con raza, la app coge el
  // peso adulto de la tabla de razas y la curva no decide nada -- la prueba
  // pasaría sin comprobar lo que dice comprobar.
  const MESES = 6, PESO = 30;

  test("el peso adulto se despeja con la Tabla VII-8a, no con la tabla vieja", async ({ page, request }) => {
    await configurarBackend(request, {
      perros: [{
        ...PERRO_DE_PRUEBA, nombre: "Mestizo", raza: null, tamano: "Grande",
        peso_actual: PESO, peso_adulto_esperado: null, condicion_idx: 2, bcs: null,
        etapa: "cachorro", fecha_nacimiento: naceHaceMeses(MESES), dieta_actual: "barf",
      }],
      menus: [], premium: true,
    });
    await entrarYGenerar(page);

    const { peticionesMenu } = await configurarBackend(request, { olvidarPeticionesMenu: false });
    expect(peticionesMenu.length).toBeGreaterThan(0);

    // Lo que dice FEDIAF para este perro, rehecho aquí desde la ecuación. La
    // banda que sale autoconsistente es la de >27,5-47,5 kg: 30/0,6437 = 46,6,
    // que cae dentro de ella. Ver `pesoAdultoDesdeCurvaFediaf`.
    const pct = pctPesoAdultoFediaf(MESES, 47.5);
    const adultoFediaf = PESO / pct;               // ~46,6 kg
    const klein = Math.max((1.063 - 0.565 * (PESO / adultoFediaf)) * 239, 98);
    const derFediaf = Math.round(klein * Math.pow(PESO, 0.75));

    for (const [i, p] of peticionesMenu.entries()) {
      expect(p.peso_adulto_esperado_kg,
        `la petición ${i + 1} manda ${p.peso_adulto_esperado_kg} kg de peso adulto. Con la ` +
        `Tabla VII-8a de FEDIAF salen ~46,6; con la tabla WALTHAM que había en App.jsx salían ` +
        `66,7, y de esa diferencia salen ~336 kcal al día de más`).toBeCloseTo(adultoFediaf, 0);
      expect(p.der_objetivo,
        `la petición ${i + 1} pide ${p.der_objetivo} kcal y FEDIAF da ${derFediaf}`
      ).toBeCloseTo(derFediaf, -1);
      // Y con el fallo puesto (la tabla WALTHAM de App.jsx) serían ~2478.
      expect(p.der_objetivo, "sigue saliendo el número de la tabla divulgativa vieja"
      ).toBeLessThan(2400);
    }
  });

  test("el mestizo ya no recibe mucho menos que el mismo cachorro con raza", async ({ page, request }) => {
    // El arreglo de verdad: hasta hoy el de raza iba por la ecuación de Klein y
    // el mestizo por un escalón plano de 2 x RER, y el mismo perro recibía
    // 1125 o 787 kcal según si su raza estaba en la lista.
    const pedir = async (raza, pesoAdulto) => {
      await configurarBackend(request, {
        perros: [{
          ...PERRO_DE_PRUEBA, raza, tamano: "Mediano",
          peso_actual: 10, peso_adulto_esperado: pesoAdulto, condicion_idx: 2, bcs: null,
          etapa: "cachorro", fecha_nacimiento: naceHaceMeses(4), dieta_actual: "barf",
        }],
        menus: [], premium: true, olvidarPeticionesMenu: true,
      });
      await entrarYGenerar(page);
      const { peticionesMenu } = await configurarBackend(request, { olvidarPeticionesMenu: false });
      expect(peticionesMenu.length).toBeGreaterThan(0);
      return peticionesMenu[0].der_objetivo;
    };

    const conRaza = await pedir("Pastor Alemán", 25);
    const mestizo = await pedir(null, null);
    expect(Math.abs(mestizo - conRaza) / conRaza,
      `el mestizo pide ${mestizo} kcal y el mismo cachorro con raza ${conRaza}. Antes del ` +
      `11 de septiembre la diferencia era de un tercio, porque el mestizo caía a un escalón ` +
      `plano de 2 x RER en vez de a la ecuación de crecimiento`).toBeLessThan(0.20);
  });
});
