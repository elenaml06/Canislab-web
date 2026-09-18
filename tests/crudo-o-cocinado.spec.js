// ─── Cruda o cocinada: la pregunta sale del motor y el modo viaja ────────────
//
// POR QUÉ EXISTE (17 de septiembre de 2026)
//
// Elena: «cuando va a seleccionar el número de días y todo eso, también puedo
// seleccionar qué le quiere dar de comer, barf o comida cocinada. Entonces si
// le quiere dar comida cocinada solo se tienen que poder generar el menú con lo
// de la comida cocinada y si se le quiere dar barf solo se tiene que poder
// generar el menú con lo de BARF más los suplementos más los extras».
//
// QUÉ SE PIERDE SI ESTO NO VIAJA, que es lo que lo convierte en un fallo y no
// en una omisión inofensiva: el modo decide el CATÁLOGO. En cocinado el hueso
// carnoso no es candidato porque el hueso COCIDO ASTILLA (SACN5 5ª ed., cap.
// 50: 46 de 60 cuerpos extraños esofágicos retirados a perros eran hueso), y
// las fichas animales son las cocidas. Un menú pedido sin el campo se resuelve
// CRUDO, sale verde, cumple los 43 requisitos — y lleva hueso crudo dentro de
// un plato que quien lo lea va a cocer. No hay error y la pantalla se ve
// perfecta: la familia de fallos de `actividad-en-cada-peticion.spec.js`.
//
// ⚠️ Y LO QUE ESTA PRUEBA TIENE QUE PODER DISTINGUIR es lo de siempre: «la app
// ha leído los modos del motor» y «la app está pintando MODOS_DE_PREPARACION_
// RESPALDO» se ven EXACTAMENTE IGUAL en pantalla, porque el respaldo dice lo
// mismo. Con las palabras de verdad, esta prueba pasaría en verde con la
// petición a `/vocabulario` entera comentada. Por eso se siembran palabras
// INVENTADAS, que el respaldo no puede decir por casualidad.

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { irAlGenerador } from "./ayudas.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SUPABASE_FALSO = "http://127.0.0.1:54321";

// ⚠️ Las CLAVES no se pueden inventar: son las que viajan al motor tal cual, y
// con otra el modo se resuelve como crudo. Así que lo distintivo son los
// TÍTULOS y el aviso — que es texto suelto y solo se pinta.
const CRUDO_TITULO = "A-la-brava-del-motor";
const COCINADO_TITULO = "Al-puchero-del-motor";
const CRUDO_EJEMPLO = "Fistrillo crudo del motor";
const COCINADO_EJEMPLO = "Zarangollo hervido del motor";
const OJO = "OJO-DEL-MOTOR: pesa el zarangollo despues de cocerlo";
const VET_CRUDO = "VET-racion-cruda-del-motor";
const VET_COCINADO = "VET-racion-cocinada-del-motor";

function vocabularioConModos(porOmision) {
  return {
    modo_de_preparacion: {
      por_omision: porOmision,
      ojo: OJO,
      modos: [
        { clave: "crudo",
          dueno: { titulo: CRUDO_TITULO, ejemplo: CRUDO_EJEMPLO },
          veterinario: { titulo: VET_CRUDO, detalle: "clinico crudo" } },
        { clave: "cocinado",
          dueno: { titulo: COCINADO_TITULO, ejemplo: COCINADO_EJEMPLO },
          veterinario: { titulo: VET_COCINADO, detalle: "clinico cocinado" } },
      ],
    },
  };
}

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
  await irAlGenerador(page);
}

const PERRO = { ...PERRO_DE_PRUEBA, dieta_actual: "barf" };

test.describe("la pregunta de cruda o cocinada sale del motor", () => {
  test("los dos modos se pintan con las palabras que sirve el motor",
    async ({ page, request }) => {
      await configurarBackend(request, {
        retrasoPerrosMs: 50, perros: [PERRO], menus: [], premium: true,
        vocabulario: vocabularioConModos("crudo"),
      });
      await entrar(page);

      for (const palabra of [CRUDO_TITULO, COCINADO_TITULO, CRUDO_EJEMPLO, COCINADO_EJEMPLO]) {
        await expect(page.getByText(palabra),
          `no sale «${palabra}», que es lo que ha servido el motor. Si en su lugar pone ` +
          `«Cruda (BARF)» o «Cocinada», la app está pintando MODOS_DE_PREPARACION_RESPALDO y ` +
          `la petición a /vocabulario no se está usando — que en pantalla se ve idéntico`)
          .toHaveCount(1);
      }

      // Y el registro del veterinario no entra en la pantalla del dueño: son
      // dos registros a propósito.
      for (const tecnica of [VET_CRUDO, VET_COCINADO]) {
        await expect(page.getByText(tecnica),
          `«${tecnica}» es del registro del veterinario y sale en la pantalla del dueño`)
          .toHaveCount(0);
      }
    });

  // ⚠️ LA MITAD QUE MÁS VALE. El modo por omisión lo dice el motor
  // (`por_omision`) y no una constante en la app. Se siembra «cocinado» —al
  // revés de lo que el motor dice de verdad hoy— y se genera SIN TOCAR NADA: si
  // la petición sale con «crudo», es que la app lo lleva escrito dentro, y el
  // día que el motor cambie de omisión la app seguiría generando lo de antes.
  test("el modo por omisión es el que dice el motor, no uno escrito en la app",
    async ({ page, request }) => {
      await configurarBackend(request, {
        retrasoPerrosMs: 50, perros: [PERRO], menus: [], premium: true,
        vocabulario: vocabularioConModos("cocinado"),
      });
      await entrar(page);
      await page.getByRole("button", { name: /^Automático/ }).click();
      await page.getByRole("button", { name: /^(Generar|Hacer)/ }).click();
      await expect(page.getByText(/Semana de/)).toBeVisible({ timeout: 30000 });

      const { peticionesMenu } = await configurarBackend(request, { olvidarPeticionesMenu: false });
      expect(peticionesMenu.length, "no ha salido ninguna petición de menú").toBeGreaterThan(0);
      for (const [i, p] of peticionesMenu.entries()) {
        expect(p.modo_de_preparacion,
          `la petición ${i + 1} va con modo_de_preparacion=${JSON.stringify(p.modo_de_preparacion)} ` +
          `y el motor ha dicho que su omisión es «cocinado». Si dice «crudo», la app tiene el ` +
          `valor escrito dentro`)
          .toBe("cocinado");
      }
    });

  test("al elegir cocinada, la clave viaja tal cual en cada petición",
    async ({ page, request }) => {
      await configurarBackend(request, {
        retrasoPerrosMs: 50, perros: [PERRO], menus: [], premium: true,
        vocabulario: vocabularioConModos("crudo"),
      });
      await entrar(page);

      await page.getByText(COCINADO_TITULO).click();
      // El «ojo» del motor: quien decide cocinar tiene que saber ANTES que los
      // gramos son de comida ya cocinada. Sale sin la señal de aviso, que es
      // nuestra y no de la fuente.
      await expect(page.getByText(OJO.replace(/^\S+\s/, ""), { exact: false }),
        "al elegir cocinada no sale el aviso de cómo se pesa, que es lo único que " +
        "distingue unos gramos de otros en la báscula").toBeVisible();

      await page.getByRole("button", { name: /^Automático/ }).click();
      await page.getByRole("button", { name: /^(Generar|Hacer)/ }).click();
      await expect(page.getByText(/Semana de/)).toBeVisible({ timeout: 30000 });

      const { peticionesMenu } = await configurarBackend(request, { olvidarPeticionesMenu: false });
      expect(peticionesMenu.length).toBeGreaterThan(0);
      for (const [i, p] of peticionesMenu.entries()) {
        expect(p.modo_de_preparacion,
          `la petición ${i + 1} no manda «cocinado». Sin el campo el motor resuelve CRUDO: el ` +
          `menú sale verde y con hueso carnoso dentro de un plato que se va a cocer`)
          .toBe("cocinado");
      }
    });
});

// ─── Y que ningún camino se quede sin mandarlo ───────────────────────────────
//
// Mismo motivo que en las pruebas hermanas: lo que hay que vigilar no es el
// recorrido de cada pantalla, es que el CUERPO de cada petición lleve el campo.
// En el motor pasó justo eso con `patologias` — «se olvidó una vez en la
// edición y una sola edición tiraba el tope».
test.describe("ningún camino se queda sin el modo", () => {
  test("los cinco cuerpos de petición llevan modo_de_preparacion", () => {
    const app = fs.readFileSync(path.resolve(AQUI, "../src/App.jsx"), "utf-8");
    const CUERPOS = [
      ["llamarRecalculo (/menu/anadir, /menu/quitar, /menu/cambiar)", "const llamarRecalculo"],
      ["cuerpoApiDeUnPerro (/menu/varios-perros)", "function cuerpoApiDeUnPerro"],
      ["la revisión de menús guardados (/menu/revalidar)", "const cuerpoBase = {\n      der_objetivo: derReal,"],
      ["el generador de un menú (/menu/v2)", "`${API_BASE}/menu/v2`"],
      ["la semana entera (/menu/semana)", "const cuerpoBase = {\n            modo: \"automatico\","],
    ];
    for (const [quien, marca] of CUERPOS) {
      const i = app.indexOf(marca);
      expect(i, `no se encuentra en App.jsx el bloque de ${quien} (buscando ` +
                `${JSON.stringify(marca)}). Si se ha renombrado hay que actualizar esta ` +
                `prueba — no borrarla`).toBeGreaterThan(-1);
      const cierre = app.indexOf("\n        }),", i);
      const bloque = app.slice(i, cierre > i ? cierre : i + 6000);
      expect(bloque,
        `el cuerpo de ${quien} no manda modo_de_preparacion. Por ese camino el motor resuelve ` +
        `CRUDO: en un menú cocinado eso mete hueso carnoso, y cocido astilla`)
        .toContain("modo_de_preparacion:");
    }
  });

  // ⚠️ Y LA OTRA MITAD, que no se ve en pantalla: al EDITAR o al REVALIDAR, el
  // modo es el DEL MENÚ, no el del botón. Lo dice el propio motor: «uno
  // generado crudo y editado en cocinado metería hueso crudo en un plato que se
  // va a cocer». Si estos dos caminos mandaran `modoPreparacionElegido`, las
  // pruebas de arriba seguirían verdes — mandan el campo — y el fallo sería
  // justo el que el campo existe para evitar.
  test("editar y revalidar mandan el modo del MENÚ, no el del botón", () => {
    const app = fs.readFileSync(path.resolve(AQUI, "../src/App.jsx"), "utf-8");
    const PARES = [
      ["llamarRecalculo (editar)", "const llamarRecalculo", "menu?.modoPreparacion"],
      ["la revisión de menús guardados", "const cuerpoBase = {\n      der_objetivo: derReal,",
       "menuParaRevisar?.modo_de_preparacion"],
    ];
    for (const [quien, marca, esperado] of PARES) {
      const i = app.indexOf(marca);
      expect(i, `no se encuentra el bloque de ${quien}`).toBeGreaterThan(-1);
      const bloque = app.slice(i, i + 6000);
      expect(bloque,
        `${quien} no lee el modo del menú (${esperado}): si manda el del botón de generar, un ` +
        `menú cocinado editado después de cambiar el botón vuelve con hueso crudo`)
        .toContain(esperado);
      expect(bloque,
        `${quien} manda «modoPreparacionElegido», que es el botón de la pantalla de generar y ` +
        `no el modo con el que se hizo ESTE menú`)
        .not.toContain("modo_de_preparacion: modoPreparacionElegido");
    }
  });

  // Y el respaldo tiene que seguir usando las claves que entiende el motor.
  //
  // ⚠️ VIVE EN `vocabulario.js` DESDE EL 18 DE SEPTIEMBRE DE 2026, no en
  // App.jsx: se mudó cuando el formulador del veterinario tuvo que elegir modo
  // también, y esa pantalla no puede importar de App.jsx sin hacer un ciclo. Es
  // la misma mudanza que ya hicieron `claveDeActividad` y los premios, y por el
  // mismo motivo — las dos veces anteriores el veterinario acabó formulando sin
  // un dato que la ficha SÍ tenía.
  test("las dos claves del respaldo son las que entiende el motor", () => {
    const app = fs.readFileSync(path.resolve(AQUI, "../src/vocabulario.js"), "utf-8");
    const i = app.indexOf("MODOS_DE_PREPARACION_RESPALDO = [");
    expect(i, "`vocabulario.js` ya no tiene MODOS_DE_PREPARACION_RESPALDO. Si se ha renombrado o " +
              "se ha vuelto a mudar hay que actualizar esta prueba, no borrarla").toBeGreaterThan(-1);
    const bloque = app.slice(i, app.indexOf("];", i));
    for (const clave of ["crudo", "cocinado"]) {
      expect(bloque,
        `MODOS_DE_PREPARACION_RESPALDO ya no tiene «${clave}». Son las claves que sirve ` +
        `GET /vocabulario y las únicas que el motor sabe recibir: con otra se resuelve como ` +
        `crudo, sin error y con el menú en verde`)
        .toContain(clave);
    }
  });
});
