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
// La condicion corporal: los NUEVE puntos del BCS, con los cinco del dueño
// marcados. Las palabras, inventadas, por lo mismo de siempre.
const BCS_DEL_DUENO = [1, 3, 5, 7, 9];
const COND_DUENO = {
  1: "Esqueletico-del-motor", 3: "Delgadito-del-motor", 5: "Justo-del-motor",
  7: "Gordito-del-motor", 9: "Bola-del-motor",
};

// Y los seis tamaños. Aqui las CLAVES no se pueden inventar -- son las que
// indexan el catalogo del motor y la app las manda tal cual --, asi que lo que
// se hace distintivo es el RANGO, que es texto suelto y solo se pinta.
const TAMANOS_CLAVES = ["Toy", "Mini", "Pequeño", "Mediano", "Grande", "Gigante"];
const RANGO_INVENTADO = { peso_min: 111, peso_max: 222 };

// Y la pregunta que el motor dice que la app NO hace. Inventada, por lo mismo.
const PREGUNTA_RENAL =
  "PREGUNTA-DEL-MOTOR: ¿en que estadio IRIS esta, o cual fue la ultima creatinina?";

const VOCABULARIO_INVENTADO = {
  preguntas_por_patologia: {
    cuantas_sin_preguntar: 1,
    por_patologia: {
      renal: {
        nombre: "Insuficiencia renal crónica",
        quien_puede_marcarla: "solo_veterinario",
        necesita_dato_clinico: true,
        que_dato: "DATO-DEL-MOTOR: estadio IRIS",
        pregunta_que_falta: PREGUNTA_RENAL,
      },
    },
  },
  razas: {
    cuantas: 2,
    // Dos razas y ninguna de verdad: si la app las pinta, las ha leido de aqui.
    razas: [
      { nombre: "Perro-del-motor", tamano: "Mediano", pesoMin: 10, pesoMax: 20, pesoMedio: 15 },
      { nombre: "Chucho-del-motor", tamano: "Toy", pesoMin: 2, pesoMax: 4, pesoMedio: 3 },
    ],
  },
  tamanos: {
    tamanos: TAMANOS_CLAVES.map((clave) => ({
      clave,
      peso_kg_del_menu_de_muestra: 10,
      rango_observado_kg: { ...RANGO_INVENTADO, peso_medio_min: 120, peso_medio_max: 200,
                            cuantas_razas: 1 },
      dueno: { titulo: clave, detalle: `detalle de ${clave}` },
      veterinario: { titulo: clave, detalle: `clinico de ${clave}` },
    })),
  },
  condicion_corporal: {
    escala: "1 a 9",
    ideal: 5,
    pct_por_punto: 0.1,
    escalones_del_dueno: { 0: 1, 1: 3, 2: 5, 3: 7, 4: 9 },
    puntos: Array.from({ length: 9 }, (_, i) => {
      const bcs = i + 1;
      const delDueno = BCS_DEL_DUENO.includes(bcs);
      return {
        bcs,
        ofrecido_al_dueno: delDueno,
        dueno: delDueno ? { titulo: COND_DUENO[bcs], detalle: `detalle ${bcs}` } : null,
        veterinario: { titulo: `BCS ${bcs}/9 del motor`, detalle: `clinico ${bcs}` },
      };
    }),
  },
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

  // ⚠️ LA CONDICION CORPORAL, que es la otra cosa que la ficha ENUMERA y que
  // decide un numero: de ella sale el peso objetivo, y del peso objetivo las
  // kcal. Los cinco escalones del dueño NO son otra escala: son los BCS 1, 3,
  // 5, 7 y 9, los MISMOS que pone el veterinario. Si cada pantalla tuviera la
  // suya, el mismo perro tendria dos pesos objetivo segun quien abriera la
  // ficha. El perro de prueba tiene `condicion_idx: 2`, o sea el BCS 5.
  test("la condicion corporal se pinta con las palabras del motor", async ({ page, request }) => {
    await configurar(request, {
      perros: [PERRO_DE_PRUEBA], menus: [], premium: true,
      vocabulario: VOCABULARIO_INVENTADO,
    });
    await entrar(page);
    await esperarLaFicha(page);

    const fila = page.getByText(/kg ·/).first();
    await expect(fila).toBeVisible();
    await expect(fila,
      `la fila de peso y condicion no dice «${COND_DUENO[5]}». Si dice «Ideal», la app esta ` +
      `pintando CONDICIONES_RESPALDO y lo servido no se usa -- y en pantalla se ve igual`)
      .toContainText(COND_DUENO[5]);
  });

  // ⚠️ EL RANGO DE PESO DE CADA TAMAÑO. Aqui las claves no se inventan (son las
  // que indexan el catalogo del motor), asi que lo distintivo es el rango. Y no
  // es cosmetico: el que la app tenia escrito a mano llevaba CUATRO de los seis
  // caducados, porque la lista de razas crecio debajo y la tabla no.
  test("el rango de peso de cada tamaño lo calcula el motor", async ({ page, request }) => {
    await configurar(request, {
      perro: { raza: null, tamano: "Mediano" }, menus: [], premium: true,
      vocabulario: VOCABULARIO_INVENTADO,
    });
    await entrar(page);
    await esperarLaFicha(page);

    // A la pantalla de raza y tamaño, que es donde se pintan los rangos.
    await page.getByRole("button", { name: "Editar raza y tamaño" }).click();
    await expect(page.getByText(/¿Qué tamaño tiene o tendrá de adulto\?/)).toBeVisible();
    await expect(page.getByText("111-222kg").first(),
      "la pantalla de tamaño no pinta el rango que sirve el motor (111-222kg). Si pinta " +
      "«14-34kg», esta usando RANGO_PESO_POR_TAMANO_RESPALDO, que ya tenia cuatro de seis " +
      "rangos caducados el dia que se escribio esto")
      .toBeVisible();
  });

  // ⚠️ LAS PREGUNTAS QUE LA APP NO HACE (11 septiembre), que es la tercera cosa
  // que pidio Elena en la misma frase: «preguntas para las patologias de
  // veterinarios».
  //
  // De las 47 patologias, 24 son `solo_veterinario` y en ocho la cifra que
  // aplica el motor DEPENDE de un dato clinico que la app no pregunta: el
  // estadio IRIS decide el techo de fosforo, los trigliceridos bajan la grasa
  // de 37,5 a 25. Mientras nadie pregunte eso, la cifra se elige a ciegas -- y
  // quien firma la pauta es quien tiene el dato.
  test("la ficha del veterinario dice que pregunta le falta a cada patologia",
       async ({ page, request }) => {
    const PACIENTE_RENAL = { ...PERRO_DE_PRUEBA, patologias: ["renal"], patologia_si: "si" };
    await configurar(request, {
      rolProfesional: true, rolVerificado: true,
      perros: [PACIENTE_RENAL],
      accesos: [{ perro_id: PACIENTE_RENAL.id, estado: "activo" }],
      menus: [], vocabulario: VOCABULARIO_INVENTADO,
    });
    await entrar(page);
    await esperarElPaciente(page);

    await expect(page.getByText(PREGUNTA_RENAL),
      "la ficha clinica no pinta la pregunta que el motor dice que falta. Sin ella el " +
      "veterinario firma una pauta cuyo numero se ha elegido a ciegas, y ni siquiera sabe que " +
      "hubo que elegirlo")
      .toBeVisible();
    await expect(page.getByText(/DATO-DEL-MOTOR: estadio IRIS/),
      "no dice de que dato clinico depende la cifra")
      .toBeVisible();
    // Y tiene que decir que la app NO lo pregunta: recoger la respuesta sin que
    // llegue al motor seria pedir un dato inutil.
    await expect(page.getByText(/La app todavía no hace estas preguntas/)).toBeVisible();
  });

  // ⚠️ LAS CASILLAS DE VETERINARIO NO SE LE ENSEÑAN AL DUEÑO (11 septiembre).
  //
  // Elena: «Un dueño, obviamente, no puede marcar casillas de veterinario, ni
  // siquiera le deberían salir».
  //
  // Eran QUINCE de las 37 que se le ofrecían -- renal, pancreatitis,
  // cardiopatia, diabetes, los cuatro tipos de calculo, la hepatopatia... --,
  // todas con la cifra que aplica el motor colgando de un dato clinico que el
  // dueño no tiene. La lista no se opina en la app: sale de la cita de la
  // fuente de cada patologia, en `quien_formula_cada_patologia.json`.
  test("al dueño no le salen las casillas que solo marca un veterinario",
       async ({ page, request }) => {
    await configurar(request, { perros: [PERRO_DE_PRUEBA], menus: [], premium: true });
    await entrar(page);
    await esperarLaFicha(page);
    await page.getByRole("button", { name: "Editar alergias y patologías" }).click();
    await page.getByRole("button", { name: "Sí", exact: true }).last().click();

    for (const label of ["Insuficiencia renal crónica", "Pancreatitis", "Cardiopatía",
                         "Diabetes mellitus", "Cálculos de oxalato cálcico"]) {
      await expect(page.getByRole("button", { name: label, exact: true }),
        `al dueño le sale «${label}», que es de veterinario: su cifra depende de un dato ` +
        `clinico que el no tiene`)
        .toHaveCount(0);
    }
    // Y las suyas siguen estando: esconder de mas seria dejarle sin poder
    // decir lo que su perro SI tiene.
    for (const label of ["Obesidad / adelgazamiento dirigido", "Artrosis / osteoartritis",
                         "Hipotiroidismo"]) {
      await expect(page.getByRole("button", { name: label, exact: true }),
        `ha desaparecido «${label}», que el dueño SI puede marcar`)
        .toHaveCount(1);
    }
  });

  // ⚠️ Y LO QUE YA ESTA PUESTO NO SE ESCONDE. Si el perro trae «renal» y se
  // esconde, el dueño lee «Nada que destacar» de un perro renal -- y a la
  // primera que guarde la ficha la patologia se pierde EN SILENCIO y le cambia
  // el menu. Es la familia de fallos de `guardarPerro` de agosto.
  test("lo que ya lleva puesto se sigue viendo, y no lo puede quitar",
       async ({ page, request }) => {
    await configurar(request, {
      perro: { patologias: ["renal"], patologia_si: "si" }, menus: [], premium: true });
    await entrar(page);
    await esperarLaFicha(page);
    await page.getByRole("button", { name: "Editar alergias y patologías" }).click();
    await expect(page.getByText(/¿Tiene alguna patología diagnosticada\?/)).toBeVisible();

    const casilla = page.getByRole("button", { name: "Insuficiencia renal crónica", exact: true });
    await expect(casilla,
      "el perro lleva «renal» puesto y su casilla no se ve. Escondida, el dueño cree que su " +
      "perro no tiene nada y al guardar la ficha la patologia se pierde sin decir nada")
      .toHaveCount(1);
    await expect(casilla, "puede quitarla, y eso es de su veterinario").toBeDisabled();
    await expect(page.getByText(/quitarlo o cambiarlo es cosa de tu veterinario/)).toBeVisible();
  });

  // El veterinario las ve todas: es el que tiene el dato.
  test("el veterinario sigue viendo las suyas en la ficha clínica",
       async ({ page, request }) => {
    await configurar(request, {
      rolProfesional: true, rolVerificado: true,
      perros: [PERRO_DE_PRUEBA],
      accesos: [{ perro_id: PERRO_DE_PRUEBA.id, estado: "activo" }],
      menus: [] });
    await entrar(page);
    await esperarElPaciente(page);
    await page.getByLabel("Buscar patología").fill("renal");
    await expect(page.getByText("Insuficiencia renal crónica", { exact: true }).first(),
      "al veterinario tambien se le ha escondido: el filtro se ha pasado de sitio")
      .toBeVisible();
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

  // ⚠️ LAS 255 RAZAS, Y LAS QUE ESCRIBEN LAS PROPIAS PRUEBAS (11 septiembre).
  //
  // La lista vivia SOLO aqui, 255 filas dentro de App.jsx, hasta que se movio a
  // `razas.json` del motor. De cada raza salen el peso adulto esperado -- y de
  // ahi las kcal, la etapa y el techo de calcio del cachorro de raza grande --
  // y las dos cifras de energia propias de FEDIAF.
  //
  // Y buscandolo salio otra cosa: **el Supabase de mentira sembraba razas que no
  // existen**. «Pastor alemán» con a minuscula no esta en la lista, asi que
  // `razaDesdeNombre` devolvia `{nombre}` a secas -- sin tamaño y sin peso
  // medio -- y durante meses TODAS las pruebas que usan el perro por defecto
  // corrieron contra un mestizo con nombre de raza. Lo mismo «Bulldog francés»,
  // «Border collie», «Galgo español» y «Teckel», que no es ni un nombre de la
  // lista. Es el fallo que ya tiene escrito `patologias-app-y-motor.spec.js`:
  // una prueba que pasa contra una ficcion.
  test("las razas de la app son las del motor, fila a fila", () => {
    const TABLA_RAZAS = path.resolve(AQUI, "../../Canislab-api/razas.json");
    if (!fs.existsSync(TABLA_RAZAS)) {
      throw new Error("No se encuentra razas.json del motor en " + TABLA_RAZAS);
    }
    const delMotor = JSON.parse(fs.readFileSync(TABLA_RAZAS, "utf-8")).razas;
    const app = fs.readFileSync(path.resolve(AQUI, "../src/App.jsx"), "utf-8");
    const i = app.indexOf("const RAZAS_RESPALDO = [");
    expect(i, "App.jsx ya no tiene la lista RAZAS_RESPALDO").toBeGreaterThan(-1);
    const delaApp = JSON.parse(
      app.slice(i + "const RAZAS_RESPALDO = ".length, app.indexOf("\n];", i) + 2)
        .replace(/,(\s*])/, "$1"));

    expect(delaApp.length,
      `la app ofrece ${delaApp.length} razas y el motor tiene ${delMotor.length}. Con una de mas, ` +
      `alguien elige una raza cuyo peso adulto el motor no sabe; con una de menos, una raza que ` +
      `el motor conoce no se puede elegir`)
      .toBe(delMotor.length);

    const porNombre = new Map(delMotor.map((r) => [r.nombre, r]));
    for (const r of delaApp) {
      const m = porNombre.get(r.nombre);
      expect(m, `«${r.nombre}» esta en la app y no en razas.json del motor`).toBeTruthy();
      expect(m, `«${r.nombre}» dice cosas distintas en la app y en el motor`).toEqual(r);
    }
  });

  // Y las que escriben las PRUEBAS, que es donde se coló la ficción.
  test("ninguna prueba siembra una raza o un tamaño que el motor no conoce", () => {
    const datos = JSON.parse(
      fs.readFileSync(path.resolve(AQUI, "../../Canislab-api/razas.json"), "utf-8"));
    const nombres = new Set(datos.razas.map((r) => r.nombre));
    const tamanos = new Set(datos._meta.tamanos);

    for (const archivo of fs.readdirSync(AQUI).filter((f) => f.endsWith(".js"))) {
      const texto = fs.readFileSync(path.join(AQUI, archivo), "utf-8");
      for (const linea of texto.split("\n")) {
        if (linea.trim().startsWith("//")) continue;      // los comentarios citan los malos
        const raza = linea.match(/\braza:\s*"([^"]+)"/);
        if (raza) {
          expect(nombres.has(raza[1]),
            `${archivo} siembra la raza «${raza[1]}», que no esta en razas.json. La app la ` +
            `tratara como un mestizo sin peso medio y la prueba correra contra una ficcion:\n` +
            `    ${linea.trim()}`)
            .toBe(true);
        }
        const tam = linea.match(/\btamano:\s*"([^"]+)"/);
        if (tam) {
          expect(tamanos.has(tam[1]),
            `${archivo} siembra el tamaño «${tam[1]}», que no es ninguno de los seis del motor ` +
            `(${[...tamanos].join(", ")}). El catalogo indexa con \`{tamano}_{etapa}\`:\n` +
            `    ${linea.trim()}`)
            .toBe(true);
        }
      }
    }
  });

  // Y el respaldo `soloVeterinario` tiene que decir lo mismo que el motor: si
  // se separan, el dia que la API no conteste el dueño ve casillas que no son
  // suyas -- o deja de ver las que si.
  test("el respaldo de quién puede marcar cada patología es el del motor", () => {
    const FICHA = path.resolve(AQUI, "../../Canislab-api/quien_formula_cada_patologia.json");
    if (!fs.existsSync(FICHA)) {
      throw new Error("No se encuentra quien_formula_cada_patologia.json del motor en " + FICHA);
    }
    const delMotor = JSON.parse(fs.readFileSync(FICHA, "utf-8")).patologias;
    const app = fs.readFileSync(path.resolve(AQUI, "../src/App.jsx"), "utf-8");
    const i = app.indexOf("const PATOLOGIAS = [");
    expect(i, "App.jsx ya no tiene PATOLOGIAS").toBeGreaterThan(-1);
    const bloque = app.slice(i, app.indexOf("\n];", i));

    for (const m of bloque.matchAll(/\{ key: "([a-z0-9_]+)",( soloVeterinario: true,)?/g)) {
      const clave = m[1];
      const marcada = Boolean(m[2]);
      const ficha = delMotor[clave];
      expect(ficha, `«${clave}» está en la app y no en quien_formula_cada_patologia.json`)
        .toBeTruthy();
      const esDelVeterinario = ficha.quien_puede_marcarla === "solo_veterinario";
      expect(marcada,
        `«${clave}»: la app dice soloVeterinario=${marcada} y el motor dice ` +
        `quien_puede_marcarla=«${ficha.quien_puede_marcarla}». Ese campo decide si al dueño le ` +
        `sale la casilla cuando la API no contesta`)
        .toBe(esDelVeterinario);
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
