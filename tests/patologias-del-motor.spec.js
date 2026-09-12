// ─── Las patologías las enumera el MOTOR, no la app ──────────────────────────
//
// POR QUÉ EXISTE (12 de septiembre de 2026). Elena:
//
//     «COMPRUEBA TODO PARA QUE NINGUN DATO LO MANDE LA APP, TODO TIENE QUE
//      VENIR DEL MOTOR»
//
// Hasta ese día las 47 patologías, sus etiquetas y sus nueve grupos por aparato
// estaban escritos a mano dentro de `src/App.jsx`. Es la copia de siempre, y ya
// costó tres veces: las seis categorías de Personalizar (tres semanas
// respetando tres de seis, con el menú saliendo verde igual), los cinco niveles
// de actividad contra los tres de la base de datos, y las diez patologías que
// el motor tenía y la app no ofrecía a nadie.
//
// ⚠️ SE SIEMBRAN ETIQUETAS INVENTADAS, y no las de verdad, por el mismo motivo
// que `vocabulario.spec.js`, `bcs-del-motor.spec.js` y
// `suplementos-agrupados.spec.js`: con las palabras buenas, «la app lo ha leído
// del motor» y «la app está pintando su respaldo» se ven exactamente igual, y
// una prueba así pasaría en verde con la petición entera comentada.
import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { esperarLaFicha, esperarElPaciente } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

// Cuatro patologías, ninguna con su nombre de verdad. Los `formulable` van al
// revés de como los tiene la app en su respaldo -- la artrosis se sirve como NO
// formulable -- para que se vea de dónde sale `segura`.
const VOCABULARIO = {
  patologias: {
    lista: [
      { clave: "renal",
        dueno: { titulo: "PROBLEMA DE FILTRO INVENTADO" },
        veterinario: { titulo: "NEFROPATIA INVENTADA" },
        aparato: "inventado_uno", formulable: true,
        quien_puede_marcarla: "solo_veterinario", aviso: null,
        dentro_de_la_pregunta_de: null },
      { clave: "renal_avanzada",
        dueno: { titulo: "ESTA NO LLEVA CASILLA" },
        veterinario: { titulo: "ESTA NO LLEVA CASILLA" },
        aparato: "inventado_uno", formulable: false,
        quien_puede_marcarla: "solo_veterinario", aviso: "AVISO DE LA QUE NO LLEVA CASILLA",
        // Se elige dentro de la pregunta de «renal», así que no es una casilla
        // suelta: ponerla sería la misma patología dos veces en la pantalla.
        dentro_de_la_pregunta_de: "renal" },
      { clave: "artrosis",
        dueno: { titulo: "HUESOS INVENTADOS" },
        veterinario: { titulo: "ARTROPATIA INVENTADA" },
        aparato: "inventado_dos", formulable: false,
        quien_puede_marcarla: "dueno", aviso: "AVISO INVENTADO DE LA ARTROSIS",
        dentro_de_la_pregunta_de: null },
      { clave: "otra",
        dueno: { titulo: "OTRA COSA INVENTADA" },
        veterinario: { titulo: "OTRA INVENTADA" },
        aparato: "inventado_dos", formulable: true,
        quien_puede_marcarla: "dueno", aviso: null,
        dentro_de_la_pregunta_de: null },
    ],
    por_aparato: [
      { clave: "inventado_uno",
        dueno: { titulo: "APARATO UNO DEL DUEÑO" },
        veterinario: { titulo: "APARATO UNO CLINICO" },
        patologias: ["renal", "renal_avanzada"] },
      { clave: "inventado_dos",
        dueno: { titulo: "APARATO DOS DEL DUEÑO" },
        veterinario: { titulo: "APARATO DOS CLINICO" },
        patologias: ["artrosis", "otra"] },
    ],
  },
};

const configurar = async (request, opciones) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`,
                                 { data: { sinTablaAccesos: false, ...opciones } });
  expect(res.ok()).toBeTruthy();
};

const entrar = async (page) => {
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
};

test.describe("las patologías vienen del motor", () => {
  test("el veterinario ve los grupos y los nombres que sirve el motor",
       async ({ page, request }) => {
    await configurar(request, {
      rolProfesional: true, rolVerificado: true,
      perros: [PERRO_DE_PRUEBA],
      accesos: [{ perro_id: PERRO_DE_PRUEBA.id, estado: "activo" }],
      menus: [], vocabulario: VOCABULARIO,
    });
    await entrar(page);
    await esperarElPaciente(page);

    // El grupo, con el título del registro CLÍNICO: quien firma una pauta lee
    // la palabra de la fuente, no la de andar por casa.
    const grupo = page.getByRole("button", { name: /APARATO UNO CLINICO/ });
    await expect(grupo, "los aparatos siguen saliendo de la lista escrita en la app")
      .toBeVisible();
    await expect(page.getByRole("button", { name: /APARATO UNO DEL DUEÑO/ }),
      "al veterinario se le está pintando el registro del dueño").toHaveCount(0);
    await grupo.click();

    await expect(page.getByRole("button", { name: "NEFROPATIA INVENTADA", exact: true }))
      .toBeVisible();
    // Y la de verdad ya no: si siguiera, la pantalla estaría leyendo su copia.
    await expect(page.getByRole("button", { name: "Insuficiencia renal crónica", exact: true }),
      "la app pinta su respaldo aunque el motor haya contestado").toHaveCount(0);

    // La que se elige DENTRO de la pregunta de otra no lleva casilla propia.
    await expect(page.getByRole("button", { name: "ESTA NO LLEVA CASILLA", exact: true }),
      "sale como casilla suelta una patología que ya es una respuesta de otra: " +
      "la misma cosa dos veces en la misma pantalla").toHaveCount(0);
  });

  test("y el buscador encuentra por los DOS registros", async ({ page, request }) => {
    await configurar(request, {
      rolProfesional: true, rolVerificado: true,
      perros: [PERRO_DE_PRUEBA],
      accesos: [{ perro_id: PERRO_DE_PRUEBA.id, estado: "activo" }],
      menus: [], vocabulario: VOCABULARIO,
    });
    await entrar(page);
    await esperarElPaciente(page);

    // Se escribe la palabra del DUEÑO y tiene que salir la ficha clínica: quien
    // busca «corazón» y quien busca «ACVIM» buscan lo mismo.
    await page.getByLabel("Buscar patología").fill("PROBLEMA DE FILTRO");
    await expect(page.getByRole("button", { name: "NEFROPATIA INVENTADA", exact: true }))
      .toBeVisible();

    await page.getByLabel("Buscar patología").fill("ARTROPATIA");
    await expect(page.getByRole("button", { name: "ARTROPATIA INVENTADA", exact: true }))
      .toBeVisible();
  });

  test("al dueño se le pinta su registro, y solo lo que puede marcar",
       async ({ page, request }) => {
    await configurar(request, {
      rolProfesional: false, rolVerificado: false,
      perros: [PERRO_DE_PRUEBA], accesos: [], menus: [], premium: true,
      vocabulario: VOCABULARIO,
    });
    await entrar(page);
    await esperarLaFicha(page);
    await page.getByRole("button", { name: "Editar alergias y patologías" }).click();
    await page.getByRole("button", { name: "Sí", exact: true }).last().click();

    await expect(page.getByRole("button", { name: "HUESOS INVENTADOS", exact: true }),
      "al dueño no le llega la etiqueta que el motor escribió para él").toBeVisible();
    // La de veterinario no le sale, y eso lo dice el motor en
    // `quien_puede_marcarla`, no una tabla de la app.
    for (const nombre of ["PROBLEMA DE FILTRO INVENTADO", "NEFROPATIA INVENTADA"]) {
      await expect(page.getByRole("button", { name: nombre, exact: true }),
        `al dueño le sale «${nombre}», que el motor marca como solo_veterinario`)
        .toHaveCount(0);
    }
  });

  test("y si el motor dice que no se puede formular, salta el muro",
       async ({ page, request }) => {
    // ⚠️ ESTE ES EL QUE MÁS PESA. `segura` era una columna escrita en la app --
    // el comentario de `PATOLOGIAS` llevaba desde agosto avisando de que un día
    // se desincronizaría del `formulable` del motor. Aquí se sirve la artrosis
    // como NO formulable, que es al revés de como la tiene el respaldo: si el
    // muro no salta, `segura` sigue saliendo de la app.
    await configurar(request, {
      rolProfesional: false, rolVerificado: false,
      perros: [PERRO_DE_PRUEBA], accesos: [], menus: [], premium: true,
      vocabulario: VOCABULARIO,
    });
    await entrar(page);
    await esperarLaFicha(page);
    await page.getByRole("button", { name: "Editar alergias y patologías" }).click();
    await page.getByRole("button", { name: "Sí", exact: true }).last().click();
    await page.getByRole("button", { name: "HUESOS INVENTADOS", exact: true }).click();

    await expect(page.getByText(/depende de analíticas que la app no puede ver/),
      "el motor dice que esta patología no es formulable y la app la da por buena")
      .toBeVisible();
  });
});
