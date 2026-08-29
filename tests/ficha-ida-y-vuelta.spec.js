// ─── La ficha del perro, campo por campo, sobrevive a guardar y volver ───────
//
// POR QUÉ EXISTE ESTE ARCHIVO
// El 21 de agosto la usuaria encontró que la ficha de su perro no se guardaba
// entera: la fecha de nacimiento, la esterilización, la actividad y el tamaño
// se escribían vacíos porque `guardarPerro` leía siete nombres de campo que en
// la app no existen (`perfil.fechaNacimiento` cuando la app lo llama
// `dia`/`mesIdx`/`anio`, y así seis más). Sin error, sin aviso, en silencio.
//
// Y era GRAVE: de la fecha de nacimiento sale la etapa, y de la etapa los 30
// requisitos de FEDIAF. Un perro de diez años volvía como cachorro y comía
// como un cachorro.
//
// Lo encontró ella usando la app. Eso no puede volver a pasar, así que esto no
// prueba "el fallo de aquel día": prueba LA FAMILIA ENTERA. Recorre TODOS los
// campos de la ficha que afectan a lo que come el perro y exige que cada uno
// siga valiendo lo mismo después de guardar y volver a cargar.
//
// SI AÑADES UN CAMPO A LA FICHA, AÑÁDELO AQUÍ. Es barato y es lo único que
// impide que el siguiente campo se pierda igual de callado.
//
// Se mira lo GUARDADO, no lo que enseña la pantalla: la ficha se pinta desde
// el estado local, así que puede verse perfecta y estar guardada vacía. Ése era
// exactamente el fallo, y una prueba que mirase la pantalla lo habría aprobado.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { irAlGenerador } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

async function configurarBackend(request, opciones) {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

// Un perro con un valor DISTINTIVO en cada campo: nada que pueda coincidir por
// casualidad con un valor por defecto. Si un campo se pierde, el que vuelve es
// el defecto y se nota.
const FICHA_COMPLETA = {
  ...PERRO_DE_PRUEBA,
  nombre: "Ruffo",
  peso_actual: 17.4,
  fecha_nacimiento: "2015-03-10",     // ni el 15 de febrero de este año
  castrado: true,                      // el defecto es false
  actividad: "baja",                   // el defecto es "media"
  condicion_idx: 3,                    // el defecto es 2
  bcs: 6,                              // el defecto es null, y 6 no es ninguno
                                       // de los cinco escalones del dueño
  sexo: "macho",
  raza: null,                          // mestizo: manda el tamaño manual
  tamano: "Pequeño",                   // el defecto acaba siendo 25 kg de adulto
  dieta_actual: "pienso",              // de aquí sale si necesita transición
  alergia_si: true,
  alergias: ["pollo"],
  otros_evitar_si: true,
  otros_evitar: ["cerdo"],
  categorias_excluidas_si: true,
  categorias_excluidas: ["Hueso carnoso"],
  patologia_si: false,
  patologias: [],
};

// Qué tiene que volver EXACTAMENTE igual, y por qué importa. El porqué no es
// adorno: si algún día uno de estos falla, dice de una lo que se rompe.
const CAMPOS = [
  ["nombre",                  "es su nombre"],
  ["peso_actual",             "de aquí salen sus kcal"],
  ["fecha_nacimiento",        "de aquí sale la ETAPA, y de la etapa los 30 requisitos de FEDIAF"],
  ["castrado",                "cambia las kcal que necesita"],
  ["actividad",               "cambia las kcal que necesita"],
  ["condicion_idx",           "de aquí sale su peso ideal, y de ahí las kcal"],
  ["bcs",                     "el BCS exacto del veterinario: redondearlo mueve el peso objetivo un 10 %"],
  ["sexo",                    "un macho entero necesita más kcal"],
  ["tamano",                  "en un mestizo, de aquí sale su peso adulto esperado"],
  ["dieta_actual",            "de aquí sale si necesita transición desde el pienso"],
  ["alergia_si",              "una alergia puede ser médica"],
  ["alergias",                "una alergia puede ser médica"],
  ["otros_evitar_si",         "lo que la dueña no quiere darle"],
  ["otros_evitar",            "lo que la dueña no quiere darle"],
  ["categorias_excluidas_si", "un perro sin dientes no puede masticar hueso"],
  ["categorias_excluidas",    "un perro sin dientes no puede masticar hueso"],
  ["patologia_si",            "cambia los límites de seguridad"],
  ["patologias",              "cambia los límites de seguridad"],
];

test.describe("la ficha del perro sobrevive a guardar y volver", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      retrasoPerrosMs: 100, perros: [FICHA_COMPLETA], menus: [],
    });
  });

  test("ningún campo se pierde al guardar", async ({ page, request }) => {
    await page.goto("/");
    await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
    await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
    await page.getByRole("button", { name: "Entrar" }).click();

    // Entrar al generador es lo que dispara el guardado de la ficha. Es
    // justo lo que hizo la usuaria cuando se le borró la fecha de Ruffo.
    await irAlGenerador(page);
    await expect(page.getByText(/¿Qué come .* ahora mismo\?/)).toBeVisible();

    await expect.poll(async () => {
      const { perrosGuardados } = await configurarBackend(request, {});
      return perrosGuardados[0]?.nombre;
    }).toBe("Ruffo");

    const { perrosGuardados } = await configurarBackend(request, {});
    const guardado = perrosGuardados[0];

    const perdidos = CAMPOS
      .filter(([campo]) => JSON.stringify(guardado[campo]) !== JSON.stringify(FICHA_COMPLETA[campo]))
      .map(([campo, porQue]) =>
        `${campo}: guardó ${JSON.stringify(guardado[campo])} en vez de ` +
        `${JSON.stringify(FICHA_COMPLETA[campo])} — ${porQue}`);

    expect(perdidos, "campos de la ficha que se pierden al guardar").toEqual([]);
  });

  test("la etapa guardada es la que le toca por su edad, no una por defecto", async ({ page, request }) => {
    await page.goto("/");
    await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
    await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await irAlGenerador(page);

    // etapa y peso adulto NO se conservan: se RECALCULAN, y tienen que
    // salir bien. Un perro nacido en 2015 es senior.
    await expect.poll(async () => {
      const { perrosGuardados } = await configurarBackend(request, {});
      return perrosGuardados[0]?.etapa;
    }).toBe("senior");
  });

  test("no vuelve a preguntar qué come si ya lo sabe", async ({ page }) => {
    await page.goto("/");
    await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
    await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await irAlGenerador(page);

    // "Pienso" ya viene marcado, porque está guardado. Antes se preguntaba
    // en cada visita y la respuesta anterior se tiraba.
    const pienso = page.getByRole("button", { name: "Pienso", exact: true });
    await expect(pienso).toBeVisible();
    await expect(pienso).toHaveCSS("font-weight", "600");
    // y se puede pasar directo a elegir modo, sin volver a contestar
    await expect(page.getByText(/Elige primero qué come/)).toHaveCount(0);
  });
});
