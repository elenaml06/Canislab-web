// ─── La app y el motor tienen que decir lo mismo de cada patología ──────────
//
// POR QUÉ EXISTE (8 de septiembre)
//
// `App.jsx` lleva su propia lista `PATOLOGIAS` con un campo `segura`, y ese
// campo es EL MISMO dato que `formulable` en `patologias.json` del motor: si
// a este perro se le genera menú automático o se le para en seco. Su propio
// comentario lo admite -- «cualquier cambio de `formulable` en
// patologias.json tiene que reflejarse aquí también» -- y hasta hoy no había
// NADA que lo comprobara.
//
// Es exactamente el fallo de la regla 5 del CLAUDE.md del motor: dos listas
// que tienen que coincidir, ninguna prueba que lo mire, y el menú saliendo
// verde igual mientras divergen. Ya pasó con el catálogo de alimentos
// (`catalogo-app-y-motor.spec.js`), y con la tabla de patologías duplicada
// del `POST /menu`, que se borró justo por esto.
//
// Y hay una TERCERA copia: `tests/fake-supabase.js`, el servidor de mentira
// contra el que corren casi todas estas pruebas. Sus filas están puestas a
// mano. Si se separan de la realidad, las pruebas siguen pasando contra una
// ficción -- que es literalmente lo que ya pasó en este repo con
// `dentro_de_rango`: «las pruebas pasaban, porque el Supabase de mentira
// devolvía el nombre equivocado igual que el código».
//
// ⚠️ ESTA PRUEBA NO SE SALTA SOLA SI FALTA EL MOTOR. Falla y dice qué
// clonar. `catalogo-app-y-motor.spec.js` tenía un `test.skip` que la daba
// por buena cuando el repo del motor no estaba al lado, y llevó días en
// verde sin ejecutarse mientras un desajuste estaba en producción. Un
// desajuste que no se puede comprobar no es un desajuste que no existe.

import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const TABLA = path.resolve(AQUI, "../../Canislab-api/patologias.json");

function tablaDelMotor() {
  if (!fs.existsSync(TABLA)) {
    throw new Error(
      "No se encuentra patologias.json del motor en " + TABLA + ".\n" +
      "Los dos repos tienen que estar clonados uno al lado del otro:\n" +
      "  git clone https://github.com/elenaml06/Canislab-api\n" +
      "Esta prueba NO se salta: compara si la app y el motor dicen lo mismo " +
      "sobre a qué perro se le genera menú, y no comprobarlo no es lo mismo " +
      "que que esté bien.");
  }
  return JSON.parse(fs.readFileSync(TABLA, "utf-8")).patologias;
}

// Quién puede marcar cada patología y qué dato hace falta para elegir su
// cifra. No se opina aquí: cada fila de ese fichero sale de la cita de la
// fuente de esa patología, y el BLOQUE 79 del motor lo vigila.
const DERIVACION = path.resolve(AQUI, "../../Canislab-api/quien_formula_cada_patologia.json");

function derivacionDelMotor() {
  if (!fs.existsSync(DERIVACION)) {
    throw new Error(
      "No se encuentra quien_formula_cada_patologia.json del motor en " +
      DERIVACION + ".\nLos dos repos tienen que estar clonados uno al lado " +
      "del otro. Esta prueba NO se salta: comprueba que no se le genera menú " +
      "automático al dueño para una patología cuya cifra depende de una " +
      "analítica que nadie le pregunta.");
  }
  return JSON.parse(fs.readFileSync(DERIVACION, "utf-8")).patologias;
}

// Las patologías que ofrece la app, con su `segura`. Se lee del bloque
// `const PATOLOGIAS = [...]` de App.jsx, sin comentarios: los comentarios de
// ese bloque citan claves y valores, y contarlos daría falsos positivos.
function patologiasQueOfreceLaApp() {
  const app = fs.readFileSync(path.resolve(AQUI, "../src/App.jsx"), "utf-8");
  const ini = app.indexOf("const PATOLOGIAS = [");
  if (ini < 0) throw new Error("no se encuentra `const PATOLOGIAS` en App.jsx");
  const bloque = app.slice(ini, app.indexOf("\n];", ini))
    .split("\n").map((l) => l.replace(/^\s*\/\/.*$/, "")).join("\n");
  const salida = new Map();
  for (const m of bloque.matchAll(/\{\s*key:\s*"([^"]+)"[\s\S]*?segura:\s*(true|false)/g)) {
    salida.set(m[1], m[2] === "true");
  }
  if (salida.size === 0) throw new Error("no se ha leído ninguna patología de App.jsx");
  return salida;
}

test.describe("la app y el motor dicen lo mismo de cada patología", () => {
  test("toda patología que ofrece la app existe en el motor", () => {
    const motor = tablaDelMotor();
    const inventadas = [...patologiasQueOfreceLaApp().keys()].filter((k) => !(k in motor));

    expect(inventadas.sort(),
      "la app ofrece patologías que el motor no conoce: al marcarlas, el " +
      "motor las ignoraría y el menú saldría verde sin tenerlas en cuenta"
    ).toEqual([]);
  });

  // ─── Y LA DIRECCIÓN CONTRARIA, QUE ES LA QUE FALTABA ─────────────────────
  //
  // ⚠️ AÑADIDO EL 10 DE SEPTIEMBRE. La prueba de arriba mira «app → motor»: que
  // la app no ofrezca patologías inventadas. Nadie miraba «motor → app», y ahí
  // había DIEZ: patologías que el motor conoce y para las que **no hay casilla
  // en ninguna pantalla**, ni la del dueño ni la del veterinario. Siete de ellas
  // con `formulable: true`, o sea que el motor les daría menú hoy mismo.
  //
  // Es el mismo hueco que los `avisos_patologia`, que llevaban desde el 29 de
  // agosto llegando con cada menú y se tiraban: trabajo hecho en el motor que
  // no llega a nadie, y nada que lo diga.
  //
  // Y una de las once cambia menús de verdad: la app manda la clave genérica
  // `cardiopatia` (sodio ≤739, que es la cifra del estadio B2) para CUALQUIER
  // cardiópata, mientras el motor tiene los cinco estadios de la escala ACVIM
  // con 739 / 625 / 480 y dos sin restricción. Un perro en estadio C recibe hoy
  // el tope del B2.
  //
  // LA LISTA DE ABAJO SOLO PUEDE ENCOGER. Cada entrada lleva su motivo, y la
  // prueba falla también si una CADUCA -- si la app empieza a ofrecer algo que
  // sigue declarado aquí --, porque una excepción caducada es una alarma
  // apagada. Ver `FRONTEND_VS_MOTOR.md` en el repo del motor.
  const NO_LAS_OFRECE_LA_APP_TODAVIA = {
    cardiopatia_a: "Estadio ACVIM A. Falta decidir si se pregunta el estadio al marcar «Cardiopatía» y a quién (Elena, 10-sep).",
    cardiopatia_b1: "Estadio ACVIM B1. Misma decisión que el A.",
    cardiopatia_b2: "Estadio ACVIM B2. Es la cifra que la app aplica hoy a todos con la clave genérica.",
    cardiopatia_c: "Estadio ACVIM C (sodio 625). Hoy un perro en C recibe 739.",
    cardiopatia_d: "Estadio ACVIM D (sodio 480). Hoy un perro en D recibe 739.",
    raza_predispuesta_cobre: "Igual: solo avisos. Se creó el 7-sep para separarla de la hepatopatía diagnosticada.",
    urolitos_fosfato_calcico: "Aplica cinco topes y el ratio Ca:P. Falta decidir si va en la lista del dueño como el oxalato, o solo en la del veterinario.",
  };

  test("toda patología formulable del motor se puede marcar en la app", () => {
    const motor = tablaDelMotor();
    const enLaApp = patologiasQueOfreceLaApp();

    const sinCasilla = Object.keys(motor)
      .filter((k) => motor[k]?.formulable && !enLaApp.has(k))
      .filter((k) => !(k in NO_LAS_OFRECE_LA_APP_TODAVIA))
      .sort();

    expect(sinCasilla,
      "el motor formula estas patologías y la app no tiene casilla para " +
      "ninguna, así que nadie puede pedirlas: ni el dueño ni el veterinario. " +
      "Es trabajo del motor que no llega a nadie, que es exactamente lo que " +
      "pasó con los avisos de patología. O se ofrecen, o se declaran en " +
      "NO_LAS_OFRECE_LA_APP_TODAVIA con el motivo"
    ).toEqual([]);
  });

  test("no queda ninguna excepción caducada en la lista de las que no se ofrecen", () => {
    const motor = tablaDelMotor();
    const enLaApp = patologiasQueOfreceLaApp();
    const caducadas = Object.keys(NO_LAS_OFRECE_LA_APP_TODAVIA)
      .filter((k) => enLaApp.has(k) || !(k in motor))
      .sort();

    expect(caducadas,
      "estas están declaradas como «la app todavía no las ofrece» y o bien ya " +
      "las ofrece, o bien ya no existen en el motor. Quítalas de la lista: una " +
      "excepción caducada deja de vigilar y no avisa a nadie"
    ).toEqual([]);
  });

  // ─── Y LO QUE FALTA PREGUNTAR ANTES DE APLICAR LA CIFRA ──────────────────
  //
  // ⚠️ AÑADIDO EL 10 DE SEPTIEMBRE, y no es una opinión de producto: Elena lo
  // dijo así -- «si hay algo que necesita análisis o que necesita lo que sea,
  // no lo puede formular a alguien que no sea un veterinario, y las preguntas
  // que hay que hacer son las que sean necesarias para estipular los valores
  // correctos». Las dos cosas SE DEDUCEN de la fuente de cada patología, y esa
  // derivación vive en `quien_formula_cada_patologia.json` del motor, con la
  // cita literal que la condiciona en cada fila. El BLOQUE 79 la vigila allí.
  //
  // Lo que vigila ESTA prueba es el otro extremo: que una patología derivada
  // como `solo_veterinario` no se le ofrezca al dueño CON MENÚ AUTOMÁTICO sin
  // que nadie le pregunte el dato del que depende la cifra. Hoy pasa en las de
  // abajo, y no es teórico: la fuente de la pancreatitis baja la grasa de 37,5
  // a 25 si hay hipertrigliceridemia, y nadie pregunta los triglicéridos, así
  // que un perro que necesita 25 recibe 37,5 y el menú sale verde -- porque el
  // semáforo mide contra FEDIAF, que es el perro sano.
  //
  // ⚠️ ESTA LISTA SOLO PUEDE ENCOGER, igual que la de arriba: se quita una
  // entrada cuando la app pregunta de verdad su dato, y la prueba de después
  // falla si una caduca. Una excepción caducada es una alarma apagada.
  const SIN_LA_PREGUNTA_QUE_DECIDE_LA_CIFRA = {
    cardiopatia: "¿En que estadio ACVIM esta? (A: raza predispuesta sin soplo · B1: soplo sin agrandamiento · B2: agrandamiento sin sintomas · C: insuficiencia cardiaca actual o pasada · D: refractaria). El estadio B2 se separa del B1 por ECOCARDIOGRAFIA o radiografia, asi que no lo puede saber quien no tiene el informe.",
    dcm_taurina_respondedora: "taurina en plasma y en sangre entera",
    diabetes: "Ninguna nueva: se resuelve marcando tambien la otra patologia. Lo que falta es que la pantalla DIGA que marcarla cambia el tope de grasa.",
    epilepsia_idiopatica: "¿Toma bromuro potasico? No cambia ninguna cifra del menu, pero cambiar la dieta le cambia el nivel del farmaco en sangre y hay que remedirlo. Es informacion que hoy solo esta en un aviso que hay que leer.",
    estruvita: "¿De que tipo es el calculo? Hoy la app tiene UNA casilla que manda `estruvita` aunque el perro tenga urato o cistina, y esas dos ni siquiera son formulables. Y ademas: ¿es para PREVENIR que vuelvan o para DISOLVER uno que ya esta? La fuente separa las dos cosas y el motor solo hace la primera.",
    hiperlipidemia: "trigliceridos o colesterol en sangre",
    oxalato: "pH urinario",
    pancreatitis: "¿Tiene los trigliceridos altos? La obesidad ya la sabe la app por el BCS, pero la hipertrigliceridemia solo se sabe con una analitica -- y de ella depende que el tope sea 37,5 o 25.",
    reaccion_adversa_alimento: "DOS preguntas, y las dos cambian lo que hace el motor: (1) ¿la reaccion es por la PIEL o por el INTESTINO? De eso depende si se aplica el techo de proteina o lo contrario. (2) ¿Estais en la fase de DIAGNOSTICO o ya confirmada? En diagnostico, subir el omega-3 puede tapar el resultado de la dieta de eliminacion.",
    renal: "¿En que estadio IRIS esta, o cual fue la ultima creatinina serica? Por debajo del estadio 2 la fuente NO respalda apretar el fosforo, y apretarlo tiene coste.",
    renal_proteinuria: "cociente proteina:creatinina en orina (UPC)",
  };

  test("ninguna patología de solo veterinario se ofrece con menú automático sin su pregunta", () => {
    const derivacion = derivacionDelMotor();
    const enLaApp = patologiasQueOfreceLaApp();

    const sinPreguntar = [...enLaApp.entries()]
      .filter(([clave, segura]) => segura &&
        derivacion[clave]?.quien_puede_marcarla === "solo_veterinario")
      .map(([clave]) => clave)
      .filter((clave) => !(clave in SIN_LA_PREGUNTA_QUE_DECIDE_LA_CIFRA))
      .sort();

    expect(sinPreguntar,
      "la fuente de estas patologías condiciona su cifra a un dato clínico " +
      "que la app no pregunta, y aun así les genera menú automático al dueño. " +
      "El menú sale VERDE igual, porque el semáforo mide contra FEDIAF y eso " +
      "es el perro sano: el tope de la patología se elige mal en silencio. O " +
      "se pregunta el dato, o se declara aquí con la pregunta que falta"
    ).toEqual([]);
  });

  test("no queda ninguna excepción caducada en la lista de las preguntas que faltan", () => {
    const derivacion = derivacionDelMotor();
    const enLaApp = patologiasQueOfreceLaApp();
    const caducadas = Object.keys(SIN_LA_PREGUNTA_QUE_DECIDE_LA_CIFRA)
      .filter((k) => !enLaApp.get(k) ||
        derivacion[k]?.quien_puede_marcarla !== "solo_veterinario")
      .sort();

    expect(caducadas,
      "estas están declaradas como «se ofrece sin preguntar su dato» y ya no " +
      "lo están: o la app dejó de ofrecerlas con menú automático, o la fuente " +
      "ya no las hace de solo veterinario. Quítalas: una excepción caducada " +
      "deja de vigilar y no avisa a nadie"
    ).toEqual([]);
  });

  test("`segura` de la app es `formulable` del motor, patología por patología", () => {
    const motor = tablaDelMotor();
    const desacuerdos = [];
    for (const [clave, segura] of patologiasQueOfreceLaApp()) {
      const formulable = motor[clave]?.formulable;
      if (formulable === undefined) continue;   // lo caza la prueba de arriba
      if (Boolean(formulable) !== segura) {
        desacuerdos.push(
          `${clave}: la app dice segura=${segura} y el motor dice formulable=${formulable}`);
      }
    }

    expect(desacuerdos.sort(),
      "la app y el motor no dicen lo mismo sobre si a este perro se le genera " +
      "menú automático. Con `segura: true` y `formulable: false` la app deja " +
      "pasar a alguien que el servidor va a rechazar al final del generador; " +
      "al revés, asusta con un aviso que ya no aplica. Es una DECISIÓN CLÍNICA " +
      "escrita en la interfaz: el dato vive en patologias.json"
    ).toEqual([]);
  });

  // ─── Y EL SERVIDOR DE MENTIRA NO PUEDE MENTIR EN LO QUE DECIDE ───────────
  //
  // Sus textos SÍ pueden ser de mentira (la pantalla solo los pinta). Lo que
  // no puede inventarse son los campos de los que cuelga una rama del código:
  // si el mock dice `formulable: true` donde el motor dice `false`, la prueba
  // que cubre esa pantalla pasa y la pantalla está mal.
  // Los que el endpoint devuelve como `false` cuando no están en el fichero.
  const BOOLEANOS = new Set([
    "formulable", "formulable_por_profesional", "necesita_bajo_fediaf",
    "solo_en_adulto",
  ]);
  const CAMPOS_QUE_DECIDEN = [
    "formulable", "formulable_por_profesional", "necesita_bajo_fediaf",
    "nutriente_frontera", "objetivo_terapeutico_por_1000kcal",
    "solo_en_adulto", "en_crecimiento",
  ];

  // ─── Y LA VENTANA DEL PROFESIONAL TAMPOCO PUEDE INVENTARSE ───────────────
  //
  // ⚠️ AÑADIDO EL 10 DE SEPTIEMBRE. El bloque `margen_profesional` dice hasta
  // dónde se puede mover cada cifra, y de dónde sale cada extremo: el suelo
  // (bajo el cual hace falta firma) y el techo (que puede ser LEY). Es
  // exactamente la clase de dato del que cuelga una decisión, así que el
  // servidor de mentira no puede llevar uno distinto del que aplica el motor:
  // la prueba de la pantalla pasaría contra una ficción y el veterinario vería
  // un margen que la ley no permite.
  test("el servidor de mentira no se inventa la ventana del profesional", () => {
    const motor = tablaDelMotor();
    const fake = fs.readFileSync(path.resolve(AQUI, "./fake-supabase.js"), "utf-8");
    const ini = fake.indexOf('if (ruta === "/patologias")');
    expect(ini, "el servidor de mentira ya no sirve /patologias").toBeGreaterThan(-1);
    const bloque = fake.slice(ini, fake.indexOf("\n    if (ruta ===", ini + 10));

    // Cada `nutriente: "x", ... margen_profesional: {...}` del mock, con la
    // patología en cuyo bloque cae. Se recorre en orden: la última cabecera
    // `clave: {` vista antes de la fila es su patología.
    const problemas = [];
    let comprobados = 0;
    let patologia = null;
    let ultimoNutriente = null;
    for (const linea of bloque.split("\n")) {
      const cabecera = linea.match(/^ {10}([a-z_0-9]+): \{/);
      if (cabecera) { patologia = cabecera[1]; continue; }
      const nut = linea.match(/nutriente: "([a-z_0-9]+)"/);
      if (nut) ultimoNutriente = nut[1];
      const m = linea.match(/margen_profesional: (\{[^}]*\})/);
      if (!m || !patologia || !ultimoNutriente) continue;
      // Solo se entrecomillan las CLAVES: el patrón exige `{` o `,` delante.
      // Sin ese ancla también entrecomillaba dentro de los valores, que llevan
      // dos puntos a propósito («minimo_fediaf:Fósforo»).
      const enElMock = JSON.parse(m[1].replace(/([{,])\s*([a-z_]+):/g, '$1"$2":'));
      const real = motor[patologia];
      const celda = ["topes_por_1000kcal", "suelos_por_1000kcal",
                     "topes_por_1000kcal_si_ademas"]
        .map((c) => (real && real[c] || {})[ultimoNutriente])
        .filter(Boolean)
        // El condicional va SIEMPRE detrás del tope normal del mismo
        // nutriente, así que si hay dos se distingue por el valor.
        .find((c) => c.margen_profesional &&
          JSON.stringify(c.margen_profesional.suelo) === JSON.stringify(enElMock.suelo) &&
          JSON.stringify(c.margen_profesional.techo) === JSON.stringify(enElMock.techo)) ||
        ((real && real.topes_por_1000kcal || {})[ultimoNutriente]);
      if (!celda || !celda.margen_profesional) {
        problemas.push(`${patologia}/${ultimoNutriente}: el mock sirve una ventana y el motor no tiene esa cifra`);
        continue;
      }
      comprobados += 1;
      for (const campo of ["suelo", "techo", "suelo_de_donde", "techo_de_donde",
                           "bajo_el_suelo_necesita_firma", "sentido_de_la_cifra"]) {
        if (JSON.stringify(enElMock[campo]) !== JSON.stringify(celda.margen_profesional[campo])) {
          problemas.push(
            `${patologia}/${ultimoNutriente}.${campo}: el mock dice ` +
            `${JSON.stringify(enElMock[campo])} y el motor ${JSON.stringify(celda.margen_profesional[campo])}`);
        }
      }
    }

    expect(comprobados,
      "el servidor de mentira no sirve NINGUNA ventana. Entonces las pruebas de " +
      "la pantalla del veterinario no comprueban que se pinte, y esa pantalla es " +
      "la que se lee antes de firmar").toBeGreaterThan(0);
    expect(problemas.sort(),
      "el servidor de mentira lleva una ventana distinta de la que aplica el " +
      "motor. La prueba de la pantalla pasaría contra una ficción, y lo que se " +
      "estaría enseñando es un margen que la fuente no permite"
    ).toEqual([]);
  });

  test("el servidor de mentira no contradice al motor en lo que decide", () => {
    const motor = tablaDelMotor();
    const fake = fs.readFileSync(path.resolve(AQUI, "./fake-supabase.js"), "utf-8");
    const ini = fake.indexOf('if (ruta === "/patologias")');
    expect(ini, "el servidor de mentira ya no sirve /patologias").toBeGreaterThan(-1);
    const bloque = fake.slice(ini, fake.indexOf("\n    if (ruta ===", ini + 10));

    const problemas = [];
    // Cada fila del mock: `clave: { ... },` en el primer nivel de `patologias`
    for (const m of bloque.matchAll(/\n          ([a-z_0-9]+): \{([\s\S]*?)\n          \},/g)) {
      const clave = m[1];
      const cuerpo = m[2];
      const real = motor[clave];
      if (!real) { problemas.push(`${clave}: el mock la sirve y el motor no la tiene`); continue; }

      for (const campo of CAMPOS_QUE_DECIDEN) {
        const hit = cuerpo.match(new RegExp(`\\b${campo}:\\s*("[^"]*"|true|false|null|[0-9.]+)`));
        if (!hit) continue;                      // el mock no lo declara: no miente
        const enElMock = JSON.parse(hit[1]);
        // El mock imita `GET /patologias`, no el JSON en bruto: el endpoint
        // normaliza lo que no está puesto. Un campo booleano ausente sale
        // `false` y el resto sale `null`. Comparar contra el fichero crudo
        // daría catorce falsos positivos de «null vs false» y ni uno real.
        const enElMotor = real[campo] === undefined
          ? (BOOLEANOS.has(campo) ? false : null)
          : real[campo];
        if (JSON.stringify(enElMock) !== JSON.stringify(enElMotor)) {
          problemas.push(`${clave}.${campo}: el mock dice ${JSON.stringify(enElMock)} y el motor ${JSON.stringify(enElMotor)}`);
        }
      }

      // Los topes y los suelos: nutriente y valor, que es lo que se pinta y
      // lo que un veterinario lee como una cifra real.
      for (const [grupo, campoMotor] of [["topes", "topes_por_1000kcal"],
                                         ["suelos", "suelos_por_1000kcal"]]) {
        const trozo = cuerpo.match(new RegExp(`${grupo}: \\[([\\s\\S]*?)\\],\\n`));
        if (!trozo) continue;
        const delMock = [...trozo[1].matchAll(/nutriente:\s*"([^"]+)",\s*unidad:\s*"[^"]*",\s*valor:\s*([0-9.]+)/g)]
          .map((x) => [x[1], Number(x[2])]);
        const delMotor = Object.entries(real[campoMotor] || {}).map(([n, t]) => [n, t.valor]);
        for (const [nutriente, valor] of delMock) {
          const real1 = delMotor.find(([n]) => n === nutriente);
          if (!real1) problemas.push(`${clave}.${grupo}: el mock inventa ${nutriente}`);
          else if (real1[1] !== valor) {
            problemas.push(`${clave}.${grupo}.${nutriente}: el mock dice ${valor} y el motor ${real1[1]}`);
          }
        }
      }
    }

    expect(problemas.sort(),
      "el servidor de mentira contradice al motor en campos de los que cuelga " +
      "una rama del código. Un servidor de mentira solo comprueba lo que ya " +
      "sabes: si miente aquí, las pruebas pasan y la pantalla está mal"
    ).toEqual([]);
  });
});
