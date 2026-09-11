// ─── Los premios viajan en TODAS las peticiones de menú ──────────────────────
//
// POR QUÉ EXISTE (11 de septiembre de 2026)
//
// Elena, al leer lo que dicen las fuentes: «pues habrá que preguntar por los
// premios y tenerlo en cuenta».
//
// CUATRO fuentes piden lo mismo y una trae el mecanismo:
//
//     «Los alimentos y premios desequilibrados no se deben proporcionar en más
//      de un 10 % de la ingesta calórica diaria total. Cuando se agregan
//      alimentos desequilibrados a una dieta completa y equilibrada, SE PRODUCE
//      UNA DILUCIÓN DE NUTRIENTES, y los nutrientes esenciales pueden quedar
//      POR DEBAJO DE LOS REQUERIMIENTOS MÍNIMOS.»
//                                              (Ettinger 8ª ed., cap. 192)
//
// Lo repiten el cap. 175 del mismo libro y Fascetti & Delaney 2ª ed. cap. 7.
//
// QUÉ SE PIERDE POR NO MANDARLO, que es lo que hace que esto sea un fallo y no
// una omisión inofensiva. El motor formula la ración con las kcal QUE QUEDAN y
// le sigue exigiendo el día entero de nutrientes -- pero solo si sabe cuántas
// son. Sin este campo, al perro al que su dueño da 220 kcal de premios se le
// calcula la ración con el día entero de calorías y esas 220 se le suman POR
// ENCIMA: come de más, y su ración está diluida respecto a lo que debería.
//
// Y no da error, no cambia la pantalla y no cambia el semáforo. Parece hecho y
// no lo está. Es la misma familia que `actividad-en-cada-peticion.spec.js`,
// `peso-objetivo-en-cada-peticion.spec.js` y `peso-adulto-en-cada-peticion.spec.js`.

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { irAlGenerador } from "./ayudas.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SUPABASE_FALSO = "http://127.0.0.1:54321";

async function configurarBackend(request, opciones) {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

// Un perro al que le dan MUCHOS premios, que es donde el campo cambia algo.
// Con «ninguno» esta prueba pasaría aunque no se mandara nada: `null` y
// «ninguno» valen lo mismo para el motor, así que no distinguen el fallo. Es la
// misma lección que la actividad «baja» de la prueba hermana.
function perroConPremios() {
  return {
    ...PERRO_DE_PRUEBA,
    nombre: "Duna",
    peso_actual: 25.0,
    premios_nivel: "mas_del_maximo",
    etapa: "adulto",
    tamano: "Grande",
    raza: "Border Collie",
    fecha_nacimiento: "2021-03-02",
    dieta_actual: "barf",
  };
}

test.describe("el nivel de premios llega al servidor", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      retrasoPerrosMs: 50,
      perros: [perroConPremios()],
      menus: [],
      premium: true,
    });
  });

  test("al generar el menú de un perro al que le dan premios", async ({ page, request }) => {
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

    const VALIDAS = ["ninguno", "alguno", "hasta_el_maximo", "mas_del_maximo"];
    for (const [i, p] of peticionesMenu.entries()) {
      expect(VALIDAS,
        `la petición ${i + 1} va con premios_nivel=${JSON.stringify(p.premios_nivel)}. Un valor ` +
        `que el motor no conozca lo rechaza con un 422, y sin el campo la ración se calcula con ` +
        `el día entero de calorías`)
        .toContain(p.premios_nivel);
      // Y tiene que ser EL SUYO: si mandara siempre «ninguno», el campo estaría
      // ahí sin servir para nada, que es el mismo fallo con otra cara.
      expect(p.premios_nivel,
        `la petición ${i + 1} manda «${p.premios_nivel}» y a este perro le dan muchos premios. ` +
        `Si va siempre el mismo valor, el campo no está leyendo la ficha`)
        .toBe("mas_del_maximo");
    }
  });
});

// ─── Y en los otros caminos, leyendo el código ───────────────────────────────
//
// Mismo motivo que en las pruebas hermanas: lo que hay que vigilar no es el
// recorrido de cada pantalla, es que el CUERPO de la petición lleve el campo.
// En el backend pasó justo eso con el peso adulto -- tres llamadas de cuatro lo
// pasaban y una no, y ninguna prueba lo vio.
test.describe("ningún camino se queda sin mandarlo", () => {
  test("los cinco cuerpos de petición llevan premios_nivel", () => {
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
      expect(i, `no se encuentra en App.jsx el bloque de ${quien} ` +
                `(buscando ${JSON.stringify(marca)}). Si se ha renombrado, hay que actualizar ` +
                `esta prueba -- no borrarla`).toBeGreaterThan(-1);
      const cierre = app.indexOf("\n        }),", i);
      const bloque = app.slice(i, cierre > i ? cierre : i + 6000);
      expect(bloque,
        `el cuerpo de ${quien} no manda premios_nivel. Por ese camino la ración se calcula con ` +
        `el día entero de calorías y los premios se suman por encima: el perro come de más y su ` +
        `ración queda diluida. No hay error: el menú sale verde igual`)
        .toContain("premios_nivel:");
    }
  });

  // Y el respaldo tiene que seguir usando las mismas cuatro claves que el
  // motor. Si se renombra una de las dos listas y la otra no, la app manda un
  // valor que el motor no reconoce -- y ahí sí da error, un 422 que deja al
  // usuario sin menú.
  test("las cuatro claves son las que entiende el motor", () => {
    const app = fs.readFileSync(path.resolve(AQUI, "../src/App.jsx"), "utf-8");
    const i = app.indexOf("const PREMIOS_RESPALDO = [");
    expect(i, "App.jsx ya no tiene PREMIOS_RESPALDO. Si se ha renombrado hay que actualizar " +
              "esta prueba, no borrarla").toBeGreaterThan(-1);
    const bloque = app.slice(i, app.indexOf("];", i));
    for (const clave of ["ninguno", "alguno", "hasta_el_maximo", "mas_del_maximo"]) {
      expect(bloque,
        `PREMIOS_RESPALDO ya no tiene «${clave}». Son las claves que sirve GET /vocabulario y ` +
        `las únicas que el motor sabe recibir: con otra devuelve un 422 y el usuario se queda ` +
        `sin menú`)
        .toContain(clave);
    }
  });
});
