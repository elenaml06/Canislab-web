// ─── Los suplementos, dentro de UNA categoría y no sueltos ───────────────────
//
// POR QUÉ EXISTE (12 de septiembre de 2026). Elena, mirando la lista de
// alimentos del formulador:
//
//     «en la lista de alimentos de los veterinarios todos los suplementos estan
//      sueltos, tienen que estar dentro de la categoria suplementos y luego
//      dentro de subcategorias, ya tenemos una lista de eso solo tienes que
//      reusarla»
//
// La lista existía —`constructor.CAT_SUPLEMENTO` en el motor, las siete que
// trata como producto comercial con dosis de etiqueta— y a la app llegaban EN
// PLANO, siete entradas de catorce al mismo nivel que «Carne muscular».
//
// ⚠️ Y LA AGRUPACIÓN LA MANDA EL MOTOR: viene en `categorias_del_catalogo.grupos`
// de `GET /vocabulario`. Por eso esta prueba SIEMBRA el grupo en vez de dar por
// hecho cuáles son: si la pantalla se supiera las siete de memoria, esta prueba
// pasaría igual y el día que el motor añada una octava la app se quedaría con
// las siete viejas. Es lo mismo que hacen `vocabulario.spec.js` y
// `bcs-del-motor.spec.js`.
import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { esperarElPaciente } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

// Un catálogo pequeño: dos categorías de comida y tres de suplemento.
const CATALOGO = {
  "Carne muscular": [{ nombre: "Pollo", kcal_100g: 110, especie: "Pollo" }],
  "Verduras y frutas": [{ nombre: "Zanahoria", kcal_100g: 35, especie: null }],
  "Multivitamínico": [{ nombre: "V-INTEGRA Perro Adulto", kcal_100g: 300, especie: null }],
  "Omega-3": [{ nombre: "Aceite de Salmón", kcal_100g: 900, especie: null }],
  "Calcio": [{ nombre: "Cáscara de huevo", kcal_100g: 0, especie: null }],
};
// El grupo, tal y como lo sirve el motor.
const VOCABULARIO = {
  categorias_del_catalogo: {
    categorias: Object.keys(CATALOGO),
    grupos: [
      { clave: "comida",
        dueno: { titulo: "Comida" },
        veterinario: { titulo: "Ingredientes" },
        categorias: ["Carne muscular", "Verduras y frutas"] },
      { clave: "suplementos",
        dueno: { titulo: "Suplementos" },
        veterinario: { titulo: "Suplementos comerciales" },
        categorias: ["Multivitamínico", "Omega-3", "Calcio"] },
    ],
  },
};

async function irAlFormulador(page) {
  await page.getByRole("button", { name: "Menú", exact: true }).last().click();
  await page.getByRole("dialog", { name: "Panel lateral" })
            .getByRole("button", { name: "Menús", exact: true }).click();
  await page.getByRole("button", { name: /Hacer otro menú/ }).click();
  await expect(page.getByText("Formular la ración")).toBeVisible();
}

async function comoVeterinario(page, request, extra = {}) {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: {
    rolProfesional: true, rolVerificado: true,
    perros: [PERRO_DE_PRUEBA],
    accesos: [{ perro_id: PERRO_DE_PRUEBA.id, estado: "activo" }],
    menus: [], catalogo: CATALOGO, ...extra,
  } });
  expect(res.ok()).toBeTruthy();
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await esperarElPaciente(page);
  await irAlFormulador(page);
  await page.getByRole("button", { name: /Añadir alimento/ }).click();
}

test("los suplementos están dentro de UNA entrada, no sueltos entre la comida", async ({ page, request }) => {
  await comoVeterinario(page, request, { vocabulario: VOCABULARIO });

  // La comida sigue donde estaba.
  await expect(page.getByRole("button", { name: /^Carne muscular/ })).toBeVisible();

  // Y las tres de suplemento NO están al primer nivel.
  for (const suelta of ["Multivitamínico", "Omega-3", "Calcio"]) {
    await expect(page.getByRole("button", { name: new RegExp(`^${suelta}`) }),
      `«${suelta}» sigue suelta al mismo nivel que «Carne muscular». Tiene que estar dentro ` +
      `de la entrada de suplementos, que es lo que se pidió`)
      .toHaveCount(0);
  }

  // Están dentro, y como subcategorías.
  const grupo = page.getByRole("button", { name: /^Suplementos comerciales/ });
  await expect(grupo, "no hay ninguna entrada que agrupe los suplementos").toBeVisible();
  await grupo.click();
  for (const dentro of ["Multivitamínico", "Omega-3", "Calcio"]) {
    await expect(page.getByRole("button", { name: new RegExp(`^${dentro}`) }),
      `dentro del grupo falta la subcategoría «${dentro}»`).toBeVisible();
  }

  // Y una subcategoría abre sus alimentos.
  await page.getByRole("button", { name: /^Omega-3/ }).click();
  await expect(page.getByRole("button", { name: /Aceite de Salmón/ }).first()).toBeVisible();
});

test("sin el grupo del motor se pinta plano, que es peor pero es cierto", async ({ page, request }) => {
  // Render dormido: `/vocabulario` no contesta. La pantalla NO puede inventarse
  // cuáles son suplementos — eso sería la copia que este arreglo quita.
  await comoVeterinario(page, request, { vocabulario: null });
  await expect(page.getByRole("button", { name: /^Multivitamínico/ }),
    "sin grupos del motor la pantalla tiene que pintar las categorías tal cual llegan").toBeVisible();
});
