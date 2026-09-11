// ─── La actividad viaja en TODAS las peticiones de menú ──────────────────────
//
// POR QUÉ EXISTE (11 de septiembre)
//
// Elena, ese día: «ten en cuenta que TODOS LOS DATOS QUE RECOJA LA APP TIENEN
// QUE LLEGAR DE ALGUNA MANERA AL MOTOR, SI NO SON DATOS INUTILES Y CUANDO SE
// PIDEN ES SIEMPRE POR ALGO».
//
// Y la actividad era el caso que lo motivó. La ficha la pregunta desde siempre,
// y esta app la usaba SOLO para calcular el DER. Al motor le llegaban las kcal
// ya hechas: veía 1955 y no sabía si era un galgo de sofá o un perro de trineo.
//
// QUÉ SE PIERDE POR NO MANDARLA, que es lo que hace que esto sea un fallo y no
// una omisión inofensiva. El motor hace dos cosas distintas con ese dato:
//
//   · Aprieta los topes de seguridad crónica por peso metabólico (yodo,
//     selenio, mercurio, tiaminasa y vitamina D). Es aritmética: un tope por
//     1000 kcal deja pasar el DOBLE a quien come el doble, y esos cinco no son
//     requisitos que escalen con el gasto, son tóxicos que se acumulan. NRC
//     2006 cap.11: «Safe upper limits expressed relative to body weight will
//     remain the same».
//   · Pone en el menú la nota de que su techo de fósforo sale de la tabla del
//     perro en MANTENIMIENTO (SACN5 Tabla 13-3, 2000 mg/1000 kcal) y de que su
//     propia fuente le pide un 50 % más (Fascetti Tabla 4.2, 3000).
//
// EL SERVIDOR TIENE SU MITAD: si el campo no llega, deduce la actividad del
// cociente DER/peso^0,75. Funciona, pero confunde al Gran Danés, que come 200
// kcal/kg^0,75 POR RAZA y no por actividad (FEDIAF §7.2.3.4: la cifra de raza
// va EN VEZ del nivel de actividad). O sea que sin este campo, un Gran Danés
// tumbado recibe el trato de un perro de trineo.
//
// Es la misma familia que `peso-objetivo-en-cada-peticion.spec.js` y
// `peso-adulto-en-cada-peticion.spec.js`: un campo que falta no da error, no
// cambia la pantalla y no cambia el semáforo. Parece hecho y no lo está.

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

// Un perro DE TRABAJO, que es donde el campo cambia algo. Con uno normal esta
// prueba pasaría aunque se mandara el nivel equivocado.
function perroDeTrabajo() {
  return {
    ...PERRO_DE_PRUEBA,
    nombre: "Duna",
    peso_actual: 25.0,
    // La fila de Supabase guarda el TEXTO, no el índice: es lo que escribe
    // `ACTIVIDAD_POR_INDICE` y lo que lee `perfilDesdeSupabase`. Poner aquí un 4
    // daba «normal» y parecía que el fallo seguía -- lo que fallaba era la
    // fixture.
    actividad: "trabajo",      // el índice 4 de NIVELES, tal y como se guarda
    etapa: "adulto",
    tamano: "Grande",
    raza: "Border Collie",
    fecha_nacimiento: "2021-03-02",
    dieta_actual: "barf",
  };
}

test.describe("la actividad llega al servidor", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      retrasoPerrosMs: 50,
      perros: [perroDeTrabajo()],
      menus: [],
      premium: true,
    });
  });

  // ⚠️ ESTA PRUEBA ESTUVO EN `test.fail` DURANTE UNA HORA, el 11 de septiembre,
  // y conviene que quede escrito por qué. Al escribirla salió un fallo de
  // producción que no buscaba nadie:
  //
  //     src/supabase.js:  const ACTIVIDAD_POR_INDICE = ['baja', 'media', 'alta']
  //
  // La app ofrece CINCO niveles y la base de datos sabía guardar TRES. «Muy
  // activo» (índice 3) y «Trabajo» (índice 4) caían en `undefined`, el
  // `?? 'media'` los convertía en «media», y al recargar la ficha volvían como
  // **Normal**. En silencio. Y eso cambia la comida: Trabajo son 175
  // kcal/kg^0,75 y Normal 110, o sea que un perro de trabajo recibía un **37 %
  // menos** del que le toca cada vez que se recargaba su ficha.
  //
  // Arreglado en los DOS lados el mismo día -- `ACTIVIDAD_POR_INDICE` al
  // guardar y `perfilDesdeSupabase` al leer --, así que la marca se ha quitado.
  // Si vuelve a aparecer, el fallo ha vuelto.
  test("al generar el menú de un perro de trabajo", async ({ page, request }) => {
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

    const VALIDAS = ["sedentario", "normal", "activo", "muy_activo", "trabajo"];
    for (const [i, p] of peticionesMenu.entries()) {
      expect(VALIDAS,
        `la petición ${i + 1} va con actividad=${JSON.stringify(p.actividad)}. Sin ese campo el ` +
        `servidor la deduce del cociente DER/peso^0,75, que confunde al Gran Danés; y con un ` +
        `valor que no reconoce, la tira`)
        .toContain(p.actividad);
      // Y tiene que ser LA SUYA: si mandara siempre "normal", el campo estaría
      // ahí sin servir para nada, que es el mismo fallo con otra cara.
      expect(p.actividad,
        `la petición ${i + 1} manda «${p.actividad}» y este perro es de trabajo. Si va siempre ` +
        `el mismo valor, el campo no está leyendo la ficha`)
        .toBe("trabajo");
    }
  });
});

// ─── Y en los otros caminos, leyendo el código ───────────────────────────────
//
// Mismo motivo que en las otras dos pruebas de esta familia: lo que hay que
// vigilar no es el recorrido de cada pantalla, es que el cuerpo de la petición
// lleve el campo. En el backend pasó justo eso con el peso adulto — tres
// llamadas de cuatro lo pasaban y una no, y ninguna prueba lo vio.
test.describe("ningún camino se queda sin mandarla", () => {
  test("los cinco cuerpos de petición llevan actividad", () => {
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
        `el cuerpo de ${quien} no manda la actividad. Por ese camino el servidor tendrá que ` +
        `deducirla del cociente DER/peso^0,75, y a un Gran Danés tumbado lo tratará como a un ` +
        `perro de trineo. No hay error: el menú sale verde igual`)
        .toContain("actividad:");
    }
  });

  // Y el conversor tiene que seguir usando las mismas cinco claves que el
  // motor. Si se renombra una de las dos listas y la otra no, el servidor
  // recibe un valor que no reconoce y lo tira EN SILENCIO.
  test("las cinco claves son las que entiende el motor", () => {
    const app = fs.readFileSync(path.resolve(AQUI, "../src/App.jsx"), "utf-8");
    expect(app, "falta la constante ACTIVIDAD_API en App.jsx")
      .toContain('const ACTIVIDAD_API = ["sedentario", "normal", "activo", "muy_activo", "trabajo"]');
    // El orden importa: el índice de la lista es el que se usa para indexar.
    //
    // ⚠️ RENOMBRADA A `NIVELES_RESPALDO` (11 septiembre). Desde ese día las
    // palabras las sirve el motor por `GET /vocabulario` y esta lista es solo
    // el respaldo de cuando la API no contesta -- pero sigue siendo la que
    // decide el ÍNDICE, así que se vigila igual. Que el respaldo tenga las
    // mismas casillas que el motor lo comprueba `vocabulario.spec.js`.
    const iNiveles = app.indexOf("const NIVELES_RESPALDO = [");
    expect(iNiveles, "App.jsx ya no tiene NIVELES_RESPALDO. Si se ha vuelto a renombrar hay que " +
                     "actualizar esta prueba, no borrarla").toBeGreaterThan(-1);
    const bloqueNiveles = app.slice(iNiveles, app.indexOf("];", iNiveles));
    for (const etiqueta of ["Sedentario", "Normal", "Activo", "Muy activo", "Trabajo"]) {
      expect(bloqueNiveles,
        `NIVELES_RESPALDO ya no tiene «${etiqueta}». ACTIVIDAD_API se indexa con la posición de ` +
        `esta lista: si cambia el orden o desaparece un nivel, la app manda una clave que no ` +
        `corresponde y el motor la tira sin decir nada`)
        .toContain(etiqueta);
    }
  });
});
