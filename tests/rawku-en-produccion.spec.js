// ─── LA MISMA MATRIZ, PERO CONTRA rawku.app DESPLEGADO ───────────────────────
//
// POR QUÉ EXISTE. Lo pidió Elena, dos veces:
//
//     «cuando fusiones y mandes todo esto a la app tienes que hacer pruebas
//      desde el dominio de vercel para ver realmente si todo funciona, vale?
//      Todo tipo de perros, etapas, comida cocinada y barf, con todo tipo de
//      cantidades de premios, TODO.»
//
// ⚠️ QUÉ AÑADE SOBRE `todos-los-perros-contra-el-motor-real.spec.js`, que ya
// habla con el motor de verdad: aquélla levanta la app **desde este disco**, o
// sea el código que hay aquí ahora. Ésta abre **lo que Vercel está sirviendo**.
// Entre las dos cosas hay un despliegue, y un despliegue puede no haber pasado,
// haber fallado, o haber salido con otras variables de entorno -- y la app se
// ve exactamente igual.
//
// El caso que lo justifica es de este mismo mes: `/verificar` existe en el
// motor precisamente porque «Render servía versiones viejas sin avisar y no
// había forma de saberlo desde el móvil». Lo mismo vale para Vercel.
//
// ⚠️ NO SE INICIA SESIÓN, Y NO SE PUEDE. La cuenta de prueba vive en el
// Supabase de mentira de este repo, no en el de producción, y crear cuentas de
// verdad desde una batería sería ensuciar la base de datos de Elena. Se entra
// por «Probar sin crear cuenta», que es un camino REAL de la app y no necesita
// ninguna credencial: la ficha se siembra en el `localStorage` del navegador,
// igual que hace `sin-cuenta.spec.js`.
//
// ⚠️ Y POR ESO ESTA PRUEBA NO CORRE EN LA BATERÍA NORMAL. Depende de una web y
// de una API desplegadas: si Render duerme o Vercel está desplegando, sale roja
// sin que nadie haya roto nada, y una batería que da rojos que no son de nadie
// se deja de mirar. Se lanza a mano al fusionar:
//
//     RAWKU_EN_PRODUCCION=1 npx playwright test tests/rawku-en-produccion.spec.js
import { test, expect } from "@playwright/test";
import { PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { PERROS, fichaDe } from "./perros-de-la-matriz.js";
import { irAlGenerador } from "./ayudas.js";

const SITIO = process.env.RAWKU_URL || "https://rawku.app";

// ⚠️ EL RELOJ ES EL DE RENDER, NO EL DE AQUÍ. El motor se da 90 s para un menú
// suelto y Render va entre 5 y 7 veces más lento que este equipo, así que un
// tope corto aquí mediría la máquina y no el producto -- que es la lección que
// este repo tiene escrita cuatro veces. Y se le suma lo que tarda Render en
// DESPERTAR, que es cerca de un minuto en la primera petición del día.
const RELOJ_POR_MENU = 210_000;

// ⚠️ EL NAVEGADOR DE ESTA MÁQUINA CORTA A LOS 30 s, Y ESO NO ES LA APP.
//
// Medido: un `fetch` CRUDO desde la página, sin pasar por ningún reloj de la
// app, falla con `Failed to fetch` a los 30,6 s -- y la MISMA petición hecha
// desde Node contra la misma API contesta en 33,6 · 24,9 · 37,0 s con menú. O
// sea que lo que corta es el túnel por el que sale este contenedor, no Render
// ni la app (el paquete desplegado lleva 45 s de tope, comprobado dentro del
// bundle).
//
// Si esta prueba diera por «la app no da menú» todo lo que pasa de 30 s,
// estaría acusando al producto de un límite de la máquina que lo prueba -- que
// es la lección que el repo del motor tiene escrita cuatro veces: «un rojo que
// solo sale en la CI no es un rojo de la CI, es una prueba que estaba midiendo
// el reloj sin querer».
//
// Así que cuando no sale menú se le pregunta A LA API, desde Node, que no pasa
// por ese corte. Con eso el veredicto separa las tres cosas:
//
//   · la API tampoco da menú .......... es el producto: rojo
//   · la API lo da en menos de 30 s ... es la app o el despliegue: rojo
//   · la API lo da pero tarda más ..... es LENTO, y se dice con la cifra
//
// La tercera no es un aprobado: Elena puso el listón en «no te puedes tirar más
// de 20 o 30 segundos esperando a ver un menú en la pantalla». Se cuenta aparte
// y se resume al final, porque con el túnel de por medio no se puede distinguir
// de un corte de la máquina.
const API = process.env.RAWKU_API || "https://canislab-api.onrender.com";
const lentos = [];

// ⚠️ NO EN MODO `serial`, y la primera versión sí lo estaba: en serie,
// Playwright SALTA el resto del grupo en cuanto uno falla -- así que la primera
// ejecución midió DOS perros de veintiocho y se paró. Una matriz existe para
// medirlos todos; lo que se quiere al fusionar es la lista entera, no el primer
// rojo. Se corre con `--workers=1` para no castigar a Render, que es otra cosa.
test.skip(!process.env.RAWKU_EN_PRODUCCION,
          "solo a mano al fusionar: depende de rawku.app y de Render desplegados");

async function sembrarYAbrir(page, ficha) {
  const perro = { ...PERRO_DE_PRUEBA, ...ficha, id: "local-matriz", user_id: "local" };
  await page.addInitScript((p) => {
    try {
      window.localStorage.clear();
      window.localStorage.setItem("rawku.local.sinCuenta", "true");
      window.localStorage.setItem("rawku.local.perros", JSON.stringify([p]));
      window.localStorage.setItem("rawku.local.menus", "[]");
    } catch { /* en privado puede fallar: la app tiene que aguantarlo igual */ }
  }, perro);
  await page.context().clearCookies();
  await page.goto(SITIO, { waitUntil: "domcontentloaded", timeout: 120_000 });
}

async function generar(page, modo) {
  // Por el mismo camino que la matriz local, que es el que hace una persona:
  // Menú -> Mis menús -> Hacer otro menú. Reutilizado a propósito -- si la app
  // cambia esa navegación, las dos pruebas se enteran a la vez.
  await irAlGenerador(page);
  if (modo === "cocinado") {
    await page.getByText(/^Cocinada$/).click({ timeout: 30_000 });
  }
  await page.getByRole("button", { name: /^Automático/ }).click({ timeout: 30_000 });
  await page.getByRole("button", { name: /^(Generar|Hacer)/ }).first().click();

  const bien = page.getByText(/Semana de/i);
  const mal = page.getByText(
    /No hemos encontrado un menú que cumpla|Esto lo tiene que pautar|ha tardado demasiado|tardando más de lo normal/);
  await expect(bien.or(mal)).toBeVisible({ timeout: RELOJ_POR_MENU });
  if (await mal.isVisible()) return { ok: false, motivo: (await mal.innerText()).slice(0, 300) };
  return { ok: true };
}

// ⚠️ LOS DOS MODOS, porque el cocinado es la mitad nueva del producto (18 de
// septiembre) y su catálogo es OTRO: 71 fichas, sin hueso carnoso, con el
// calcio saliendo de la cáscara de huevo o del bote. Un perro que tiene menú
// en crudo puede no tenerlo cocinado, y al revés.
for (const modo of ["crudo", "cocinado"]) {
  test.describe(`rawku.app desplegado · ración ${modo}`, () => {
    for (const perro of PERROS) {
      test(`${perro[0]}`, async ({ page, request }) => {
        test.setTimeout(RELOJ_POR_MENU + 180_000);
        const errores = [];
        page.on("console", (m) => {
          if (m.type() === "error") errores.push(m.text().slice(0, 200));
        });
        await sembrarYAbrir(page, fichaDe(perro));
        const t0 = Date.now();
        const r = await generar(page, modo);
        const tardo = ((Date.now() - t0) / 1000).toFixed(1);
        // ⚠️ SE DICE CUÁNTO TARDA SIEMPRE, salga o no salga. Elena: «no te
        // puedes tirar más de 20 o 30 segundos esperando a ver un menú en la
        // pantalla», y sin la cifra apuntada no hay forma de saber si eso se
        // cumple hoy ni de ver el día que empeore.
        console.log(`    ${modo} · ${perro[0]}: ${r.ok ? "menú" : "SIN MENÚ"} en ${tardo}s`);
        if (r.ok) return;

        // No ha salido. Antes de acusar a nadie, se le pregunta a la API desde
        // Node -- ver el comentario de `RELOJ_POR_MENU`.
        const t1 = Date.now();
        const res = await request.post(`${API}/menu/v2`, {
          data: cuerpoDeMenu(perro, modo), timeout: 200_000,
        });
        const j = await res.json().catch(() => ({}));
        const tardoApi = ((Date.now() - t1) / 1000).toFixed(1);
        expect(j.factible,
          `«${perro[0]}» (${modo}) no obtiene menú, y el MOTOR tampoco se lo da ` +
          `(${tardoApi}s): ${JSON.stringify(j.motivo || j.mensaje || "").slice(0, 250)}. ` +
          `Esto es del producto, no del despliegue`).toBe(true);
        expect(Number(tardoApi),
          `«${perro[0]}» (${modo}) no sale en la app y el motor SÍ lo da en ${tardoApi}s, ` +
          `por debajo del corte de 30 s de esta máquina. O sea que el motor contesta a ` +
          `tiempo y la app no lo enseña: eso es de la app o del despliegue`)
          .toBeGreaterThan(30);
        lentos.push(`${modo} · ${perro[0]}: el motor tarda ${tardoApi}s`);
        console.log(`    ⚠️ ${modo} · ${perro[0]}: el motor SÍ da menú, en ${tardoApi}s ` +
                    `-- por encima de los 30 s que aguanta el navegador de esta máquina`);
      });
    }
  });
}

// ⚠️ EL RESUMEN NO ES DECORACIÓN: es lo único que convierte «este perro tardó
// mucho» en una lista que se puede mirar de un vistazo al fusionar. Sin él, lo
// lento se queda repartido por la salida y no se lee.
test.afterAll(() => {
  if (!lentos.length) return;
  console.log("\n⚠️ MENÚS QUE EL MOTOR DA PERO TARDANDO MÁS DE 30 s:");
  for (const l of lentos) console.log("   · " + l);
  console.log("   El listón lo puso Elena: «no te puedes tirar más de 20 o 30 segundos\n" +
              "   esperando a ver un menú en la pantalla».\n");
});

// El cuerpo que manda la app, para poder preguntarle a la API lo mismo que le
// pidió el navegador. No es una copia de la ficha: son los pocos campos que
// deciden si hay menú.
function cuerpoDeMenu(perro, modo) {
  const [, etapa, peso, , tamano, , premios] = perro;
  const ETAPAS = {
    adulto: "Adulto", cachorro_joven: "CachorroJoven",
    cachorro_crecimiento: "CachorroCrecimiento", gestante_tardia: "Gestante",
    lactante: "Lactante", senior: "Adulto",
  };
  return {
    modo: "automatico", nombres_alimentos: [], forzar_presencia: [],
    der_objetivo: Math.round(110 * Math.pow(peso, 0.75)),
    actividad: "normal", etapa_requisitos: ETAPAS[etapa] || "Adulto",
    especies_excluidas: [], nombres_excluidos: [], peso_perro_kg: peso,
    patologias: [], categorias_excluidas: [], tamano,
    premios_nivel: premios || null, modo_de_preparacion: modo,
  };
}
