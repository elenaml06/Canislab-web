// ─── TODOS LOS TIPOS DE PERRO, EN LA APP DE VERDAD Y CONTRA EL MOTOR DE VERDAD ─
//
// POR QUÉ EXISTE (13 de septiembre de 2026). Lo pidió Elena el día que
// producción estuvo rota:
//
//     «a partir de ahora cuando hagas PR y fusiones tienes que hacer pruebas
//      para todo tipo de etapas y todo tipo de perros con todo tipo de
//      patologías en la app real con las cuentas de prueba, en veterinario y
//      usuario, para ver si falla algo»
//
// ⚠️ Y EL MOTIVO ESTÁ MEDIDO, no es una precaución: ese día había **101 bloques
// del motor en verde y 550 pruebas de esta app en verde, y la app no daba UN
// SOLO MENÚ**. Cairo, su cachorro de raza grande, se quedaba sin comer en
// cuanto se declaraban premios -- y ninguna de las dos baterías podía verlo.
//
// POR QUÉ NINGUNA DE LAS DOS LO VE, y es estructural:
//
//   · `pruebas_completas.py` prueba el motor por dentro y por sus endpoints,
//     con las peticiones que ESCRIBE ELLA. Nunca ve la que manda la app.
//   · Las otras pruebas de esta carpeta hablan con `servidor-fake.js`, que
//     siempre devuelve menú. Nunca ven al motor decir que no.
//
// Entre las dos queda un hueco del tamaño exacto del fallo: **una petición que
// la app manda bien y el motor contesta «no hay menú» por un motivo real.**
//
// QUÉ COMPRUEBA, Y QUÉ NO. No comprueba que el menú cumpla -- de eso se encarga
// la batería del otro repo, y `_garantizar_verificado()` no deja salir uno que
// no cumpla. Comprueba que **el perro que se puede escribir en la ficha
// obtiene menú**: que ninguna combinación normal de etapa, tamaño, premios y
// patología deje al dueño mirando «no hemos encontrado un menú que cumpla».
//
//     npx playwright test --config playwright.real.config.js
//
// ⚠️ LA MITAD DE LA CUENTA SIGUE SIENDO DE MENTIRA, y va dicho: el Supabase real
// necesita una credencial que no vive en el repo. Lo que se prueba de verdad
// aquí es la costura app↔motor, que es donde estaba el fallo de Cairo.
//
// PARA COMPROBAR QUE ESTA PRUEBA SIRVE (hazlo si la tocas): quítale al motor el
// factor de premios de `recomendaciones.suelo_que_de_verdad_se_aplica`. Los
// casos de cachorro de raza grande con premios tienen que ponerse rojos.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { irAlGenerador } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54322";

const configurar = async (request, opciones) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
};

// ─── LA MATRIZ ───────────────────────────────────────────────────────────────
//
// No es el producto cartesiano de todo: eso serían miles de menús y cada uno
// tarda segundos en el MILP de verdad, así que la batería no se correría nunca
// -- y una batería que no se corre no vigila nada. Se eligen los cruces donde
// la ventana entre mínimos y máximos es MÁS ESTRECHA, que es donde el motor
// deja de dar menú:
//
//   · las siete etapas, porque cada una tiene su columna de requisitos
//   · los extremos de tamaño (toy y gigante), donde el escalado aprieta
//   · el cachorro de RAZA GRANDE, que es el caso de Cairo: tiene a la vez el
//     suelo reforzado de la nota b y el techo apretado de SACN5
//   · con y sin premios, porque los premios suben los suelos y no los techos
//   · las patologías que más aprietan, una por aparato
const PERROS = [
  // nombre                       etapa                  peso  raza                      tamano     nacimiento     premios
  ["adulto mediano",              "adulto",              24.5, "Pastor Alemán",          "Grande",  "2021-05-14",  null],
  ["adulto toy",                  "adulto",               1.8, "Chihuahua",              "Toy",     "2021-05-14",  null],
  ["adulto gigante",              "adulto",              62.0, "Mastín Español",         "Gigante", "2021-05-14",  null],
  ["senior",                      "adulto",              24.5, "Pastor Alemán",          "Grande",  "2015-05-14",  null],
  ["cachorro joven",              "cachorro_joven",       4.0, "Pastor Alemán",          "Grande",  null,          null],
  ["cachorro crecimiento",        "cachorro_crecimiento", 12.0, "Pastor Alemán",         "Grande",  null,          null],
  ["gestante",                    "gestante_tardia",     22.0, "Pastor Alemán",          "Grande",  "2021-05-14",  null],
  ["lactante",                    "lactante",            22.0, "Pastor Alemán",          "Grande",  "2021-05-14",  null],
  // EL CASO DE CAIRO, con los cuatro niveles de premios
  ["Cairo sin premios",           "cachorro_crecimiento", 20.0, "American Staffordshire Terrier", "Mediano", null, "ninguno"],
  ["Cairo pocos premios",         "cachorro_crecimiento", 20.0, "American Staffordshire Terrier", "Mediano", null, "alguno"],
  ["Cairo premios al máximo",     "cachorro_crecimiento", 20.0, "American Staffordshire Terrier", "Mediano", null, "hasta_el_maximo"],
  ["Cairo más del máximo",        "cachorro_crecimiento", 20.0, "American Staffordshire Terrier", "Mediano", null, "mas_del_maximo"],
  // y el adulto con premios, que es la otra mitad de la regla 3-bis
  ["adulto con premios",          "adulto",              24.5, "Pastor Alemán",          "Grande",  "2021-05-14",  "mas_del_maximo"],
  ["toy con premios",             "adulto",               1.8, "Chihuahua",              "Toy",     "2021-05-14",  "hastaـel_maximo".replace("ـ", "_")],
];

// ⚠️ QUÉ PATOLOGÍAS ENTRAN EN CADA ROL, Y **NO SE ESCRIBE AQUÍ** (13 de
// septiembre). Elena, al ver la primera versión de esta prueba:
//
//     «ten en cuenta que solo pueden entrar las patologías que puede generar un
//      usuario sin preguntas y sin supervisión veterinaria»
//
// Tiene razón y además la lista ya existe: cada patología lleva su
// `quien_puede_marcarla` en `quien_formula_cada_patologia.json`, derivado de la
// CITA de su propia fuente -- si su tabla condiciona la cifra a un dato clínico
// (el estadio IRIS, los triglicéridos, la taurina en sangre), no la puede
// marcar quien no tiene ese dato. Son 5 `dueno`, 18 `dueno_con_diagnostico` y
// 24 `solo_veterinario`.
//
// Y se LEE del motor, no se copia: es la regla 6 del CLAUDE.md. Una lista
// copiada a mano aquí se quedaría parada el día que una patología cambie de
// mano, y la prueba seguiría en verde probando un reparto que ya no existe --
// que es exactamente el fallo que esta prueba entera existe para cazar.
const API_REAL_PAT = "http://127.0.0.1:8012";

async function patologiasPorQuienLaMarca(request) {
  const res = await request.get(`${API_REAL_PAT}/vocabulario`);
  expect(res.ok(), "el motor de verdad no contesta a /vocabulario").toBeTruthy();
  const lista = (await res.json())?.patologias?.lista || [];
  expect(lista.length,
    "`/vocabulario` no trae patologías. Sin ellas esta prueba no vigila nada, " +
    "así que no se salta: falla").toBeGreaterThan(0);
  const por = { dueno: [], dueno_con_diagnostico: [], solo_veterinario: [] };
  for (const p of lista) {
    if (!p.formulable) continue;
    if (por[p.quien_puede_marcarla]) por[p.quien_puede_marcarla].push(p.clave);
  }
  return por;
}

// Cuánto se le da a cada menú. El MILP de verdad tarda, y en el peor caso la
// app recorre la escalera entera: seis peldaños. Con menos, lo que se mide es
// el reloj y no la nutrición -- que es el fallo que ya costó dos rondas en el
// BLOQUE 43 y en el 75 del otro repo.
const RELOJ_POR_MENU = 180_000;

function fichaDe([nombre, etapa, peso, raza, tamano, nacimiento, premios], patologias = []) {
  return {
    ...PERRO_DE_PRUEBA,
    nombre,
    peso_actual: peso,
    etapa,
    tamano,
    raza,
    // Sin fecha, la app calcula la etapa desde `etapa`. Con ella, desde la edad
    // -- que es lo que hace la app de verdad, así que se manda cuando la hay.
    fecha_nacimiento: nacimiento,
    premios_nivel: premios,
    patologia_si: patologias.length ? "si" : "no",
    patologias,
    dieta_actual: "barf",
  };
}

async function entrarYGenerar(page, request, ficha) {
  await configurar(request, {
    retrasoPerrosMs: 50, perros: [ficha], menus: [], premium: true,
  });
  // ⚠️ SE SALE DE LA SESION ANTES DE CADA PERRO. Sin esto, el segundo caso de
  // una prueba que recorre varios se encuentra la app YA ABIERTA con el perro
  // anterior en memoria: no hay campo «Email» que rellenar, y la prueba se
  // queda esperando hasta el timeout -- que es lo que le paso a la de
  // patologias la primera vez que se ejecuto. Y lo peor no es colgarse: es
  // que, sin limpiar, el caso 2 probaria el perro del caso 1 y saldria verde.
  await page.context().clearCookies();
  await page.goto("/");
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await irAlGenerador(page);
  await page.getByRole("button", { name: /^Automático/ }).click();
  await page.getByRole("button", { name: /^(Generar|Hacer)/ }).click();

  // O sale la semana, o sale el error. Se espera a CUALQUIERA de los dos y se
  // mira cuál: esperar solo al bueno daría un «timeout» sin decir por qué, que
  // es justo lo que le pasó a Elena mirando la app desde el móvil.
  const bien = page.getByText(/Semana de/);
  const mal = page.getByText(/No hemos encontrado un menú que cumpla|Esto lo tiene que pautar|ha tardado demasiado/);
  await expect(bien.or(mal)).toBeVisible({ timeout: RELOJ_POR_MENU });
  if (await mal.isVisible()) {
    // Se recoge lo que dijo el motor, para que el fallo diga POR QUÉ y no
    // «no salió». El desplegable «Qué dijo el motor» lo pinta la app.
    let detalle = "";
    try {
      await page.getByText("Qué dijo el motor").click({ timeout: 2000 });
      detalle = (await page.locator("details").innerText()).slice(0, 600);
    } catch { /* puede no estar: no es el objeto de la prueba */ }
    return { ok: false, motivo: (await mal.innerText()) + " — " + detalle };
  }
  return { ok: true };
}

test.describe("todos los tipos de perro obtienen menú, con el motor de verdad", () => {
  for (const perro of PERROS) {
    test(`dueño · ${perro[0]}`, async ({ page, request }) => {
      test.setTimeout(RELOJ_POR_MENU + 60_000);
      const r = await entrarYGenerar(page, request, fichaDe(perro));
      expect(r.ok,
        `«${perro[0]}» no obtiene menú en la app con el motor de verdad. ` +
        `Esto es lo que le pasó a Cairo el 13 de septiembre: el motor y la app ` +
        `estaban los dos en verde y el perro se quedaba sin comer. ${r.motivo || ""}`)
        .toBe(true);
    });
  }

  // ─── LAS QUE PUEDE MARCAR EL DUEÑO ÉL SOLO ────────────────────────────────
  //
  // Las cinco `dueno`: las que no piden ningún dato clínico que el dueño no
  // tenga. Son las únicas que se prueban en el rol de usuario, porque son las
  // únicas que un usuario puede llegar a marcar sin veterinario detrás.
  test("dueño · las patologías que puede marcar él solo", async ({ page, request }) => {
    test.setTimeout(RELOJ_POR_MENU * 6);
    const por = await patologiasPorQuienLaMarca(request);
    expect(por.dueno.length,
      "el motor no declara ninguna patología que el dueño pueda marcar solo").toBeGreaterThan(0);
    const sinMenu = [];
    for (const pat of por.dueno) {
      const r = await entrarYGenerar(
        page, request,
        fichaDe(["adulto con " + pat, "adulto", 24.5, "Pastor Alemán", "Grande", "2021-05-14", null],
                [pat]));
      if (!r.ok) sinMenu.push(`${pat}: ${r.motivo}`);
    }
    expect(sinMenu,
      "hay patologías que el dueño puede marcar él solo y que le dejan sin menú. " +
      "Las 39 formulables las recorre el BLOQUE 61 del motor, así que si allí " +
      "salen y aquí no, lo que falla es lo que la app MANDA")
      .toEqual([]);
  });

  // ─── Y LAS DEMÁS, QUE SON DEL VETERINARIO ─────────────────────────────────
  //
  // Las 18 `dueno_con_diagnostico` y las 24 `solo_veterinario` no las prueba
  // aquí el rol de usuario A PROPÓSITO: un usuario no puede marcarlas sin un
  // diagnóstico detrás. Se prueban con el rol profesional, que es quien las
  // formula de verdad, y con la muestra que cabe en el reloj -- las 39
  // formulables enteras ya las recorre el BLOQUE 61 del motor; lo que falta
  // aquí es que la APP se las mande bien.
  //
  // Se coge una por aparato para que la muestra no sea todo del mismo sitio.
  test("veterinario · una patología de cada aparato", async ({ page, request }) => {
    test.setTimeout(RELOJ_POR_MENU * 10);
    const res = await request.get(`${API_REAL_PAT}/vocabulario`);
    const lista = ((await res.json())?.patologias?.lista || []).filter((p) => p.formulable);
    const unaPorAparato = [];
    const vistos = new Set();
    for (const p of lista) {
      if (p.quien_puede_marcarla === "dueno") continue;   // esas ya van arriba
      if (vistos.has(p.aparato)) continue;
      vistos.add(p.aparato);
      unaPorAparato.push(p.clave);
    }
    expect(unaPorAparato.length,
      "el motor no agrupa las patologías por aparato, o no hay ninguna de "
      + "veterinario. Sin eso esta prueba no vigila nada").toBeGreaterThan(2);
    const sinMenu = [];
    for (const pat of unaPorAparato) {
      const r = await entrarYGenerar(
        page, request,
        fichaDe(["paciente con " + pat, "adulto", 24.5, "Pastor Alemán", "Grande", "2021-05-14", null],
                [pat]));
      if (!r.ok) sinMenu.push(`${pat}: ${r.motivo}`);
    }
    expect(sinMenu, "hay patologías de veterinario que no obtienen menú por la app")
      .toEqual([]);
  });
});
