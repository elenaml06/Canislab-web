// ─── El peso adulto esperado viaja en TODAS las peticiones de menú ──────────
//
// POR QUÉ EXISTE (28 de agosto)
//
// FEDIAF pide para un cachorro de raza grande o gigante en crecimiento un
// MÍNIMO de calcio más alto que para uno pequeño: 2500 mg por cada 1000 kcal
// en vez de 2000. Es la fila `Calcio_LateGrowth_RazaGrande` de la tabla, y no
// es un capricho — un cachorro de raza grande forma hueso a una velocidad
// que no le deja margen para quedarse corto.
//
// El servidor solo puede aplicarlo si sabe QUÉ RAZA es el perro, y eso lo
// sabe por un único campo: `peso_adulto_esperado_kg`. Sin él, el motor mide
// contra el mínimo del cachorro genérico y el menú sale VERDE con 2100 mg.
//
// Y ese es justo el fallo que no se ve: no da error, no cambia la pantalla,
// no cambia el semáforo. La petición sale "bien", el menú sale "bien", y lo
// único que ha pasado es que un requisito de FEDIAF ha dejado de aplicarse.
// Es la misma familia que `guardarPerro` leyendo siete campos con nombres
// que no existían: todo funciona, y está mal.
//
// Aquí se mira lo QUE SE PIDE AL SERVIDOR, no lo que se ve en pantalla. Con
// el campo perdido la pantalla se ve exactamente igual.
//
// El 28 de agosto el backend cerró su mitad: `_garantizar_verificado()`
// comprueba el mínimo reforzado por su cuenta, así que si el campo no llega
// el menú se rechaza en vez de salir mal. Esta prueba es la otra mitad: que
// el campo llegue, para que no haya que rechazar nada.

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

// Un cachorro de raza grande DE VERDAD: pastor alemán de unos seis meses.
// La etapa y el peso adulto los calcula la app sola desde la fecha de
// nacimiento y la curva de crecimiento, así que basta con nacerlo hoy - 6m.
function cachorroDeRazaGrande() {
  const nacimiento = new Date();
  nacimiento.setMonth(nacimiento.getMonth() - 6);
  return {
    ...PERRO_DE_PRUEBA,
    nombre: "Nala",
    peso_actual: 18.0,
    peso_adulto_esperado: null,     // a propósito: la app lo estima, no lo copia
    etapa: "cachorro",
    tamano: "grande",
    raza: "Pastor alemán",
    fecha_nacimiento: nacimiento.toISOString().slice(0, 10),
    dieta_actual: "barf",
  };
}

test.describe("el peso adulto esperado llega al servidor", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      retrasoPerrosMs: 50,
      perros: [cachorroDeRazaGrande()],
      menus: [],
      premium: true,
    });
  });

  test("al generar el menú de un cachorro de raza grande", async ({ page, request }) => {
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

    for (const [i, p] of peticionesMenu.entries()) {
      expect(typeof p.peso_adulto_esperado_kg,
        `la petición ${i + 1} va sin peso_adulto_esperado_kg: el servidor no puede saber ` +
        `que es un cachorro de raza grande y le aplicará el mínimo de calcio del ` +
        `cachorro genérico (2000 en vez de 2500), sin dar ningún error`)
        .toBe("number");
      // Y con el valor de VERDAD, no un 1 cualquiera: el umbral de "raza
      // grande o gigante" del motor son 25 kg de peso adulto, así que un
      // valor que se quede por debajo desactiva el mínimo reforzado igual
      // que si no se mandara nada.
      expect(p.peso_adulto_esperado_kg,
        `la petición ${i + 1} manda ${p.peso_adulto_esperado_kg} kg de peso adulto para un ` +
        `pastor alemán. Por debajo de 25 kg el motor no lo trata como raza grande`)
        .toBeGreaterThanOrEqual(25);
      // Y la etapa tiene que ser de crecimiento: el mínimo reforzado solo
      // existe ahí. Si la etapa saliera "Adulto" el campo llegaría bien y
      // daría igual -- que es el fallo del perro de diez años que volvía
      // como cachorro, del revés.
      expect(p.etapa_requisitos,
        `la etapa que se pide es '${p.etapa_requisitos}' para un perro de seis meses. ` +
        `El mínimo reforzado de calcio solo aplica en crecimiento`)
        .toMatch(/^Cachorro/);
    }
  });
});

// ─── Y en los OTROS SEIS caminos, sin abrir el navegador seis veces ──────────
//
// La app llama al motor desde siete sitios (/menu/v2, /menu/semana,
// /menu/varios-perros, /menu/anadir, /menu/quitar, /menu/cambiar y
// /menu/revalidar). Montar el recorrido de cada uno costaría siete pruebas
// lentas, y lo que hay que vigilar no es el recorrido: es que el cuerpo de
// la petición lleve el campo.
//
// En el backend pasó exactamente esto: de las cuatro llamadas al motor,
// tres pasaban `peso_adulto_esperado_kg` y una no. Ninguna prueba lo vio,
// porque cada una miraba el resultado y el resultado salía verde.
test.describe("ningún camino se queda sin mandarlo", () => {
  const RUTAS = ["/menu/v2", "/menu/semana", "/menu/varios-perros",
                 "/menu/anadir", "/menu/quitar", "/menu/cambiar", "/menu/revalidar"];

  test("los siete cuerpos de petición llevan peso_adulto_esperado_kg", () => {
    const app = fs.readFileSync(path.resolve(AQUI, "../src/App.jsx"), "utf-8");

    // Los tres de edición comparten `llamarRecalculo`, y los de varios
    // perros comparten `cuerpoApiDeUnPerro`. Así que lo que hay que
    // comprobar son los CUERPOS que se construyen, no las siete rutas.
    const CUERPOS = [
      // nombre para el mensaje de error   | dónde empieza el bloque
      ["llamarRecalculo (/menu/anadir, /menu/quitar, /menu/cambiar)", "const llamarRecalculo"],
      ["cuerpoApiDeUnPerro (/menu/varios-perros)", "function cuerpoApiDeUnPerro"],
      ["la revisión de menús guardados (/menu/revalidar)", "const cuerpoBase = {\n      der_objetivo: derReal,"],
      ["el generador de un menú (/menu/v2)", "`${API_BASE}/menu/v2`"],
      ["la semana entera (/menu/semana)", "const cuerpoBase = {\n            modo: \"automatico\","],
    ];

    for (const [quien, marca] of CUERPOS) {
      const i = app.indexOf(marca);
      expect(i, `no se encuentra en App.jsx el bloque de ${quien} ` +
                `(buscando ${JSON.stringify(marca)}). Si se ha renombrado, hay que ` +
                `actualizar esta prueba -- no borrarla`).toBeGreaterThan(-1);
      // El cuerpo cabe de sobra en 3000 caracteres desde su marca; se corta
      // para no encontrar el campo de OTRO cuerpo más abajo y darlo por
      // bueno, que es como esta prueba dejaría de servir sin avisar.
      const bloque = app.slice(i, i + 3000);
      expect(bloque,
        `el cuerpo de ${quien} no manda peso_adulto_esperado_kg. Sin él, un cachorro de ` +
        `raza grande pierde su mínimo de calcio reforzado por ese camino, y no da ningún ` +
        `error: el menú sale verde igual porque el semáforo de FEDIAF mide contra el ` +
        `mínimo del cachorro genérico`)
        .toContain("peso_adulto_esperado_kg");
    }

    // Y que no haya aparecido un OCTAVO camino sin que nadie lo mire.
    for (const ruta of RUTAS) {
      expect(app, `la app ya no llama a ${ruta}. Si el camino se ha quitado, quítalo ` +
                  `también de esta lista; si se ha renombrado, hay que comprobar que el ` +
                  `nuevo manda el peso adulto`).toContain(ruta);
    }
    const llamadasAMenu = [...app.matchAll(/\$\{API_BASE\}\/menu\/([a-z0-9-]+)/g)]
      .map((m) => `/menu/${m[1]}`);
    const desconocidas = [...new Set(llamadasAMenu)].filter((r) => !RUTAS.includes(r));
    expect(desconocidas,
      `la app llama a estos endpoints de menú que esta prueba no conoce: ` +
      `${desconocidas.join(", ")}. Hay que comprobar a mano si su cuerpo manda ` +
      `peso_adulto_esperado_kg y añadirlo aquí`).toEqual([]);
  });
});
