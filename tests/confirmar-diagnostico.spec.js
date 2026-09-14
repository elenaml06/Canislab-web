// ─── Marcar una patología pide DIAGNÓSTICO, no una corazonada ────────────────
//
// POR QUÉ EXISTE (14 de septiembre de 2026). Elena:
//
//     «solo deberíamos dejar marcar patologías si están prescritas por un
//      veterinario, o sea, si un veterinario eso lo ha dicho, porque si yo
//      digo, ay, es que creo que mi perro tiene colon irritable, y no lo sé,
//      no podría generar un menú, ¿entiendes?»
//
// Y funcionaba tal cual: la pantalla del dueño enseñaba 23 de las 47 casillas y
// no preguntaba en ningún momento si había diagnóstico. Marcar «colitis» por
// una sospecha movía la fibra y la grasa de la ración de un perro que quizá no
// tiene nada.
//
// ⚠️ TODO LO QUE SE SIEMBRA AQUÍ ESTÁ INVENTADO -- la pregunta, las dos
// respuestas y el texto del «no» --, por el mismo motivo que
// `patologias-del-motor.spec.js` y `vocabulario.spec.js`: con las palabras de
// verdad, «la app lo ha leído del motor» y «la app está pintando su respaldo»
// se ven exactamente igual, y esta prueba pasaría en verde con la petición
// entera comentada.
//
// ⚠️ Y `pide_confirmacion_de_diagnostico` va AL REVÉS de como lo tiene el motor
// de verdad: aquí la artrosis NO la pide y el sobrepeso SÍ. Si la app estuviera
// decidiendo por su cuenta quién la pide, esto se cae.
import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { esperarLaFicha } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

const PREGUNTA = "¿PREGUNTA INVENTADA DE DIAGNOSTICO?";
const SI = "SI INVENTADO";
const NO = "NO INVENTADO";
const CONSECUENCIA = "CONSECUENCIA INVENTADA DE CONTESTAR QUE NO";
const SALIDA_PREGUNTA = "¿PREGUNTA INVENTADA DE LA SALIDA?";
const SALIDA_RESPUESTA = "RESPUESTA INVENTADA DE LA SALIDA";
const SALIDA_QUE_PASA = "LO QUE PASA INVENTADO SI NO ESTA EN LA LISTA";

const VOCABULARIO = {
  patologias: {
    lista: [
      { clave: "artrosis",
        dueno: { titulo: "HUESOS INVENTADOS" },
        veterinario: { titulo: "ARTROPATIA INVENTADA" },
        aparato: "inventado", formulable: true,
        quien_puede_marcarla: "dueno_con_diagnostico", aviso: null,
        dentro_de_la_pregunta_de: null },
      { clave: "obesidad",
        dueno: { titulo: "PESO INVENTADO" },
        veterinario: { titulo: "OBESIDAD INVENTADA" },
        aparato: "inventado", formulable: true,
        quien_puede_marcarla: "dueno", aviso: null,
        dentro_de_la_pregunta_de: null },
      // La salida: va en la lista pero SIN casilla, porque `es_la_salida`.
      // Si la app la pintara como una más, quien la marca no tendría forma de
      // saber que se queda sin menú.
      { clave: "otra",
        dueno: { titulo: "ESTA NO LLEVA CASILLA, ES LA SALIDA" },
        veterinario: { titulo: "ESTA NO LLEVA CASILLA, ES LA SALIDA" },
        aparato: "inventado", formulable: false,
        quien_puede_marcarla: "dueno", aviso: null,
        dentro_de_la_pregunta_de: null, es_la_salida: true },
    ],
    por_aparato: [
      { clave: "inventado",
        dueno: { titulo: "APARATO INVENTADO DEL DUEÑO" },
        veterinario: { titulo: "APARATO INVENTADO CLINICO" },
        patologias: ["artrosis", "obesidad"] },
    ],
    // ⚠️ «Otra cosa» NO va en ningún aparato: no es una condición, es la
    // salida. Va aquí, con su texto, también inventado.
    salida: {
      clave: "otra",
      dueno: { pregunta: SALIDA_PREGUNTA, respuesta: SALIDA_RESPUESTA,
               que_pasa: SALIDA_QUE_PASA },
    },
  },
  preguntas_por_patologia: {
    confirmacion_de_diagnostico: {
      dueno: {
        pregunta: PREGUNTA,
        respuestas: [
          { clave: "si", texto: SI, se_marca: true },
          { clave: "no", texto: NO, se_marca: false },
        ],
        si_dice_que_no: CONSECUENCIA,
      },
    },
    // ⚠️ AL REVÉS de como lo tiene el motor de verdad, a propósito.
    por_patologia: {
      artrosis: { quien_puede_marcarla: "dueno_con_diagnostico",
                  pide_confirmacion_de_diagnostico: false },
      obesidad: { quien_puede_marcarla: "dueno",
                  pide_confirmacion_de_diagnostico: true },
    },
  },
};

const configurar = async (request, opciones) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`,
                                 { data: { sinTablaAccesos: false, ...opciones } });
  expect(res.ok()).toBeTruthy();
};

const abrirLasPatologias = async (page) => {
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await esperarLaFicha(page);
  await page.getByRole("button", { name: "Editar alergias y patologías" }).click();
  await page.getByRole("button", { name: "Sí", exact: true }).last().click();
  await page.getByRole("button", { name: /APARATO INVENTADO DEL DUEÑO/ }).click();
};

const SEMBRADO = {
  rolProfesional: false, rolVerificado: false,
  perros: [PERRO_DE_PRUEBA], accesos: [], menus: [], premium: true,
  vocabulario: VOCABULARIO,
};

test.describe("una patología se marca con diagnóstico", () => {
  test("la que lo pide no se marca hasta contestar que sí", async ({ page, request }) => {
    await configurar(request, SEMBRADO);
    await abrirLasPatologias(page);

    const casilla = page.getByRole("button", { name: "PESO INVENTADO", exact: true });
    await casilla.click();

    // NO se ha marcado: se ha abierto la pregunta, y con LAS PALABRAS DEL
    // MOTOR. Si saliera la pregunta de verdad, la app estaría pintando su
    // respaldo con la petición hecha.
    const panel = page.getByTestId("confirmar-diagnostico");
    await expect(panel, "no sale la pregunta: la casilla se marca con una sospecha")
      .toBeVisible();
    await expect(panel).toContainText(PREGUNTA);
    await expect(page.getByText("¿Se lo ha diagnosticado un veterinario?"),
      "sale la pregunta del respaldo aunque el motor haya contestado").toHaveCount(0);

    // Contestar que NO deja la casilla sin marcar Y dice qué pasa. Sin eso
    // esto sería un «acepto» con dos botones, y un «acepto» se pulsa sin leer.
    await page.getByRole("button", { name: NO, exact: true }).click();
    await expect(page.getByTestId("sin-diagnostico"),
      "el «no» no dice qué pasa, así que el botón no significa nada").toContainText(CONSECUENCIA);
    await expect(panel, "la pregunta sigue abierta, hay que poder leer el porqué").toBeVisible();

    // Y ahora que sí: se marca.
    await page.getByRole("button", { name: SI, exact: true }).click();
    await expect(page.getByTestId("confirmar-diagnostico")).toHaveCount(0);
    // Marcada de verdad: la casilla enseña su check. (El botón existe aunque no
    // esté marcada, así que mirar el botón no probaría nada.)
    await expect(casilla.locator("svg"),
      "se ha contestado que sí y la patología no se ha marcado").toBeVisible();
  });

  test("la que NO la pide se marca de una, y eso lo dice el motor",
       async ({ page, request }) => {
    await configurar(request, SEMBRADO);
    await abrirLasPatologias(page);

    // En el motor de verdad la artrosis SÍ pide diagnóstico. Aquí se sirve que
    // no, así que si la app tuviera su propia lista pondría la pregunta igual.
    await page.getByRole("button", { name: "HUESOS INVENTADOS", exact: true }).click();
    await expect(page.getByTestId("confirmar-diagnostico"),
      "la app decide por su cuenta quién pide diagnóstico en vez de leerlo del motor")
      .toHaveCount(0);
  });

  test("«otra cosa» no es una casilla más: es la salida, y va al final",
       async ({ page, request }) => {
    await configurar(request, SEMBRADO);
    await abrirLasPatologias(page);

    // No está entre las casillas del aparato, ni con su etiqueta ni buscando.
    await expect(page.getByRole("button", { name: "ESTA NO LLEVA CASILLA, ES LA SALIDA",
                                            exact: true }),
      "«otra» se pinta como una patología más, entre enfermedades de verdad, y quien la marca "
      + "no tiene forma de saber que se queda sin menú").toHaveCount(0);

    // Está al final, con SU pregunta y SU respuesta, las del motor.
    const salida = page.getByTestId("salida-patologias");
    await expect(salida).toBeVisible();
    await expect(salida).toContainText(SALIDA_PREGUNTA);
    await expect(page.getByText("¿Tiene algo que no está en esta lista?"),
      "sale la pregunta del respaldo aunque el motor haya contestado").toHaveCount(0);

    // Y al marcarla dice qué pasa: sin eso es un botón que deja sin menú
    // en silencio.
    await expect(page.getByTestId("salida-que-pasa")).toHaveCount(0);
    await page.getByRole("button", { name: SALIDA_RESPUESTA, exact: true }).click();
    await expect(page.getByTestId("salida-que-pasa"),
      "se marca «otra cosa» y no se dice que eso quita el menú automático")
      .toContainText(SALIDA_QUE_PASA);
  });

  test("desmarcar no pide permiso", async ({ page, request }) => {
    await configurar(request, SEMBRADO);
    await abrirLasPatologias(page);

    const casilla = page.getByRole("button", { name: "PESO INVENTADO", exact: true });
    await casilla.click();
    await page.getByRole("button", { name: SI, exact: true }).click();
    await expect(page.getByTestId("confirmar-diagnostico")).toHaveCount(0);

    // Quitar algo que se puso por error no puede costar una pregunta: el muro
    // es para marcar, no para corregirse.
    await casilla.click();
    await expect(page.getByTestId("confirmar-diagnostico"),
      "quitar una patología pide confirmación, y eso es un muro para corregirse")
      .toHaveCount(0);
  });
});
