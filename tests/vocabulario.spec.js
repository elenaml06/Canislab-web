// ─── El vocabulario lo sirve el motor, y la app lo pinta ─────────────────────
//
// POR QUÉ EXISTE (11 de septiembre)
//
// Elena, ese día: «no hay que hacer que el motor coincida con lo de la app. hay
// que hacer que la app coincida con lo del motor, es decir, cuántos niveles de
// actividad tenemos según fediaf o nrc o lo que sea. pues la app tiene que
// ofrecer esos niveles de actividad y tiene que estar emparejado con lo que
// tenemos nosotros en el motor [...] si el motor dice que hay dieciocho niveles
// de actividad, la app tiene que tener 18 niveles de actividad porque si no no
// sirve de nada, y así con todo».
//
// Y en la misma conversación, la otra mitad: «el vocabulario que usa la app en
// modo usuario tiene que ser entendible para el usuario y el que se usa en modo
// veterinario tiene que ser más técnico».
//
// La cadena es FUENTE → MOTOR → APP, nunca al revés. Hasta hoy había TRES
// copias de los niveles de actividad sin nadie que las comparara: `NIVELES` y
// `NIVELES_CLINICOS` en App.jsx, y `BASE_ACTIVIDAD` en `der.py`. Es la misma
// forma que `CATEGORIAS_QUE_ELIGE_EL_USUARIO` (tres semanas respetando tres de
// seis categorías, 15 de cada 36 menús metiendo comida que nadie pidió) y que
// la tabla de patologías duplicada del `POST /menu`.
//
// ⚠️ LO QUE ESTA PRUEBA TIENE QUE PODER DISTINGUIR, y es lo difícil: «la app ha
// leído el vocabulario del motor» y «la app está pintando su lista de respaldo»
// SE VEN EXACTAMENTE IGUAL en pantalla, porque el respaldo dice lo mismo. Una
// prueba que sembrara el vocabulario de verdad pasaría en verde con la petición
// entera comentada. Por eso lo que se siembra son palabras INVENTADAS, que el
// respaldo no puede decir por casualidad.
//
// Y la otra mitad, la que no se puede mirar en pantalla: que el respaldo siga
// teniendo tantas casillas como claves acepta el motor. El índice de la lista
// es lo único que viaja (`ACTIVIDAD_API[idx]`), así que una casilla de más o de
// menos manda una clave equivocada y el servidor la tira sin decir nada — o
// peor, aplica el nivel de al lado.

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { esperarLaFicha, esperarElPaciente } from "./ayudas.js";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const SUPABASE_FALSO = "http://127.0.0.1:54321";

// ⚠️ PALABRAS QUE NO PUEDE DECIR NADIE MÁS. Si alguna de estas sale en
// pantalla, ha salido de `GET /vocabulario` -- no hay otro sitio de donde
// pueda venir. Ese es todo el truco de este archivo.
const DUENO = [
  "Tumbado-del-motor", "Andarín-del-motor", "Saltarín-del-motor",
  "Incansable-del-motor", "Currante-del-motor",
];
const VET = [
  "VET-actividad-baja", "VET-moderada-bajo-impacto", "VET-moderada-alto-impacto",
  "VET-alta-extremo-bajo", "VET-alta-extremo-alto",
];
const KCAL = [95, 110, 125, 150, 175];
const CLAVES = ["sedentario", "normal", "activo", "muy_activo", "trabajo"];

// Con la forma exacta que sirve `GET /vocabulario` de la API, y solo el trozo
// que esta prueba mira. Lo que NO va aquí es una copia de las palabras de
// verdad: eso sería la cuarta copia de la lista.
const VOCABULARIO_INVENTADO = {
  niveles_de_actividad: {
    de_donde: "inventado por tests/vocabulario.spec.js",
    cuantos: CLAVES.length,
    niveles: CLAVES.map((clave, i) => ({
      clave,
      kcal_kg075: KCAL[i],
      dueno: { titulo: DUENO[i], detalle: `detalle de dueño ${i}` },
      veterinario: { titulo: VET[i], detalle: `detalle clínico ${i}` },
    })),
  },
};

const configurar = async (request, opciones) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
};

const entrar = async (page) => {
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
};

// El perro de prueba está guardado con `actividad: "media"`, que `perfilDesde
// Supabase` convierte en el índice 1. O sea que su casilla es la segunda.
const INDICE_DEL_PERRO = 1;

test.describe("las palabras que se ven salen del motor", () => {
  test("en modo dueño, la ficha pinta el registro del dueño", async ({ page, request }) => {
    await configurar(request, {
      perros: [PERRO_DE_PRUEBA], menus: [], premium: true,
      vocabulario: VOCABULARIO_INVENTADO,
    });
    await entrar(page);
    await esperarLaFicha(page);

    // La fila «Actividad y esterilización» de la ficha. Se mira POR SU TEXTO y
    // no por un `data-testid`: es exactamente lo que lee quien usa la app.
    const fila = page.getByText(/· Esterilizado:/).first();
    await expect(fila).toBeVisible();
    await expect(fila,
      `la fila de actividad no dice «${DUENO[INDICE_DEL_PERRO]}», que es lo que el motor ha ` +
      `servido para este perro. Si dice «Normal», la app está pintando NIVELES_RESPALDO y la ` +
      `petición a /vocabulario no se está usando -- que en pantalla se ve idéntico`)
      .toContainText(DUENO[INDICE_DEL_PERRO]);

    // Y NO puede colarse el registro del veterinario: son dos registros a
    // propósito, y el del dueño no lleva ni horas ni número de tabla.
    for (const tecnica of VET) {
      await expect(page.getByText(tecnica),
        `«${tecnica}» es del registro del veterinario y está saliendo en la app del dueño`)
        .toHaveCount(0);
    }
  });

  test("en modo veterinario, la ficha clínica pinta el registro técnico", async ({ page, request }) => {
    await configurar(request, {
      rolProfesional: true, rolVerificado: true,
      perros: [PERRO_DE_PRUEBA],
      accesos: [{ perro_id: PERRO_DE_PRUEBA.id, estado: "activo" }],
      menus: [], vocabulario: VOCABULARIO_INVENTADO,
    });
    await entrar(page);
    await esperarElPaciente(page);

    // Las CINCO casillas, no solo la del perro: la ficha clínica las ofrece
    // todas para poder cambiarla.
    for (const [i, titulo] of VET.entries()) {
      await expect(page.getByText(titulo),
        `falta la casilla «${titulo}» (nivel ${i}) en la ficha del paciente. Si no está ninguna, ` +
        `la app sigue con NIVELES_CLINICOS_RESPALDO; si faltan solo algunas, el motor y la app ` +
        `ofrecen distinto número de niveles y el índice deja de corresponder`)
        .toHaveCount(1);
    }

    // Y el registro del dueño no entra aquí: quien firma una pauta no puede
    // citar «no para» en un informe.
    for (const llano of DUENO) {
      await expect(page.getByText(llano),
        `«${llano}» es del registro del dueño y está saliendo en la ficha del veterinario`)
        .toHaveCount(0);
    }
  });

  // ⚠️ Y SI EL MOTOR NO CONTESTA, LA APP NO SE QUEDA EN BLANCO. La API de
  // Render duerme tras 15 minutos sin tráfico: la primera petición del día
  // puede tardar o fallar, y la pantalla de actividad tiene que pintarse
  // igual. Aquí no se siembra vocabulario, así que el servidor de mentira
  // contesta 404 -- que es el caso peor.
  test("sin vocabulario servido, se pinta el respaldo y no un hueco", async ({ page, request }) => {
    await configurar(request, { perros: [PERRO_DE_PRUEBA], menus: [], premium: true });
    await entrar(page);
    await esperarLaFicha(page);

    const fila = page.getByText(/· Esterilizado:/).first();
    await expect(fila).toBeVisible();
    await expect(fila,
      "sin /vocabulario la fila de actividad tiene que caer en NIVELES_RESPALDO. Si sale vacía " +
      "o con «undefined», el respaldo no está funcionando y una API dormida deja la ficha rota")
      .toContainText("Normal");
  });
});

// ─── Y el respaldo tiene que seguir teniendo las casillas del motor ──────────
//
// Esto NO se puede ver en pantalla, que es justo por lo que necesita su propia
// prueba. Lo que viaja al servidor es `ACTIVIDAD_API[perfil.actividadIdx]`: el
// ÍNDICE de la lista. Si el motor añade un nivel y el respaldo se queda con
// cinco casillas, el día que la API no conteste la app ofrece una lista corta y
// manda la clave de al lado -- sin error y con el menú saliendo verde igual.
test.describe("la app y el motor cuentan los mismos niveles", () => {
  const DER = path.resolve(AQUI, "../../Canislab-api/der.py");
  const TABLA = path.resolve(AQUI, "../../Canislab-api/niveles_de_actividad.json");

  function clavesDelMotor() {
    if (!fs.existsSync(DER)) {
      throw new Error(
        "No se encuentra der.py del motor en " + DER + ".\n" +
        "Los dos repos tienen que estar clonados uno al lado del otro:\n" +
        "  git clone https://github.com/elenaml06/Canislab-api\n" +
        "Esta prueba NO se salta: compara cuántos niveles de actividad acepta el motor " +
        "con cuántos ofrece la app, y no poder comprobarlo no es lo mismo que que esté bien.");
    }
    const py = fs.readFileSync(DER, "utf-8");
    const i = py.indexOf("BASE_ACTIVIDAD = {");
    expect(i, "der.py ya no tiene BASE_ACTIVIDAD. Si se ha renombrado hay que actualizar esta " +
              "prueba, no borrarla").toBeGreaterThan(-1);
    const bloque = py.slice(i, py.indexOf("\n}", i));
    return [...bloque.matchAll(/"([a-z_]+)":\s*\d+/g)].map((m) => m[1]);
  }

  function listaDeApp(nombre) {
    const app = fs.readFileSync(path.resolve(AQUI, "../src/App.jsx"), "utf-8");
    const i = app.indexOf(`const ${nombre} = [`);
    expect(i, `App.jsx ya no tiene ${nombre}. Si se ha renombrado hay que actualizar esta prueba`)
      .toBeGreaterThan(-1);
    const bloque = app.slice(i, app.indexOf("\n];", i));
    return [...bloque.matchAll(/label:\s*"([^"]+)"/g)].map((m) => m[1]);
  }

  test("los dos respaldos tienen tantas casillas como claves el motor", () => {
    const claves = clavesDelMotor();
    expect(claves.length, "der.py declara menos de dos niveles: algo se ha roto al leerlo")
      .toBeGreaterThan(1);

    for (const nombre of ["NIVELES_RESPALDO", "NIVELES_CLINICOS_RESPALDO"]) {
      expect(listaDeApp(nombre).length,
        `${nombre} tiene otro número de casillas que BASE_ACTIVIDAD de der.py ` +
        `(${claves.join(", ")}). Lo que viaja al servidor es el ÍNDICE de esta lista, así que ` +
        `una casilla de más o de menos manda la clave del nivel de al lado, sin error`)
        .toBe(claves.length);
    }

    // Y el conversor de índice a clave, que es el que hace el viaje.
    const app = fs.readFileSync(path.resolve(AQUI, "../src/App.jsx"), "utf-8");
    const i = app.indexOf("const ACTIVIDAD_API = [");
    expect(i, "falta ACTIVIDAD_API en App.jsx").toBeGreaterThan(-1);
    const claveApp = [...app.slice(i, app.indexOf("]", i)).matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    expect(claveApp,
      "ACTIVIDAD_API ya no dice las mismas claves que BASE_ACTIVIDAD, o no en el mismo orden. " +
      "El motor tira una clave que no reconoce sin decir nada")
      .toEqual(claves);
  });

  // ⚠️ Y QUE NO HAYA UNA QUINTA COPIA (11 septiembre).
  //
  // Escribiendo este archivo salió la CUARTA: la sección «perfil» de
  // `VistaMenus` llevaba la lista escrita a mano dentro del propio JSX,
  //
  //     valor: [«Sedentario», «Normal», «Activo», «Muy activo», «Trabajo»][idx]
  //
  // y encima enseñaba el registro del dueño a un veterinario, teniendo
  // `enModoProfesional` a mano en la misma función. No la encontró ninguna
  // prueba: la encontró un `grep` por casualidad, buscando otra cosa.
  //
  // Así que se pone un guardián. Las etiquetas de nivel solo pueden vivir en
  // las DOS listas de respaldo; en cualquier otro sitio son una copia nueva
  // que nadie va a comparar con el motor.
  test("las etiquetas de nivel solo viven en las dos listas de respaldo", () => {
    const app = fs.readFileSync(path.resolve(AQUI, "../src/App.jsx"), "utf-8");
    const lineas = app.split("\n");

    // Dónde empieza y acaba cada lista de respaldo, para poder perdonarlas.
    const tramos = ["NIVELES_RESPALDO", "NIVELES_CLINICOS_RESPALDO"].map((nombre) => {
      const i = app.indexOf(`const ${nombre} = [`);
      expect(i, `App.jsx ya no tiene ${nombre}`).toBeGreaterThan(-1);
      const antes = app.slice(0, i).split("\n").length - 1;
      const largo = app.slice(i, app.indexOf("\n];", i)).split("\n").length;
      return [antes, antes + largo];
    });
    const dentroDeUnRespaldo = (n) => tramos.some(([a, b]) => n >= a && n <= b);

    // Una por lista, y de las que no se confunden con otra cosa: «Sedentario»
    // y «Muy activo» no son palabras que la app use para nada más, y «Reposo /
    // restricción» es la primera del registro clínico.
    for (const etiqueta of ['"Sedentario"', '"Muy activo"', '"Reposo / restricción"']) {
      lineas.forEach((linea, n) => {
        if (!linea.includes(etiqueta)) return;
        expect(dentroDeUnRespaldo(n),
          `App.jsx:${n + 1} escribe ${etiqueta} fuera de NIVELES_RESPALDO y de ` +
          `NIVELES_CLINICOS_RESPALDO:\n    ${linea.trim()}\n` +
          `Eso es una copia más de los niveles de actividad, y nadie la va a comparar con el ` +
          `motor. Píntala con nivelesDeActividad(vocab, modo), que además sabe si quien mira es ` +
          `el dueño o el veterinario`)
          .toBe(true);
      });
    }
  });

  // El inventario de la Tabla VII-7, fila por fila. Lo que la app ofrece tiene
  // que ser lo que ese fichero declara ofrecible -- ni más ni menos.
  test("la app ofrece las filas que el inventario declara ofrecibles", () => {
    if (!fs.existsSync(TABLA)) {
      throw new Error("No se encuentra niveles_de_actividad.json del motor en " + TABLA);
    }
    const filas = JSON.parse(fs.readFileSync(TABLA, "utf-8")).filas;
    const ofrecidas = listaDeApp("NIVELES_RESPALDO");

    for (const fila of filas) {
      if (fila.estado === "fuera_a_proposito" || fila.estado === "HUECO") continue;
      if (!fila.app || fila.app.startsWith("se deduce")) continue;   // las dos razas
      for (const etiqueta of fila.app.split(" + ")) {
        expect(ofrecidas,
          `el inventario de la Tabla VII-7 dice que la app ofrece «${etiqueta}» para la fila ` +
          `«${fila.fuente}», y NIVELES_RESPALDO no la tiene. O el inventario miente o la app ha ` +
          `perdido un nivel de FEDIAF`)
          .toContain(etiqueta);
      }
    }
  });
});
