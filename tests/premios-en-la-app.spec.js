// ─── Los premios, PROBADOS EN LA APP ─────────────────────────────────────────
//
// ⚠️ POR QUÉ EXISTE, y es una corrección (11 de septiembre de 2026)
//
// Elena, después de probarlo ella en la vista previa: «he probado lo de los
// premios y ponga muchos o ninguno me da las mismas kcal..... por eso te dije
// que todo lo tienes que probar dentro de la app con los usuarios que tienes
// para comprobar que funciona».
//
// Tenía razón y el fallo era de verdad. El motor sí contaba los premios — el
// BLOQUE 95 de la batería lo mide con el fallo puesto —, y `premios-en-cada-
// peticion.spec.js` comprobaba que el campo VIAJA. Entre esas dos cosas quedaba
// el hueco por el que se coló:
//
//   1. La app pintaba en la tarjeta de «kcal / día» el `derObjetivo` que MANDA,
//      no las kcal que el servidor DEVUELVE. Con premios la ración se calcula
//      con las calorías que quedan, así que el servidor contestaba 880 y la
//      pantalla seguía diciendo 1100.
//   2. Y el servidor de mentira de estas pruebas devolvía SIEMPRE el mismo menú
//      con las mismas kcal, dijera lo que dijera la petición — así que ninguna
//      prueba de esta carpeta podía ver el punto 1.
//
// Las dos cosas arregladas, y esto es lo que lo vigila: no que el campo viaje,
// sino que LO QUE SE VE EN PANTALLA cambie cuando cambia la respuesta.
//
// Es la lección que el CLAUDE.md del motor tiene escrita para otra cosa —
// «comprobar siempre lo GUARDADO, no lo que enseña la pantalla» — leída por el
// otro lado: aquí lo que había que comprobar era justamente la pantalla,
// porque el dato viajaba bien y llegaba bien.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { irAlGenerador } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

async function configurar(request, opciones) {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

// El mismo perro que usa `premios-en-cada-peticion.spec.js`: con la etapa, el
// tamaño, la raza y la dieta actual puestas. Sin eso la pantalla del generador
// deja el botón de «Automático» DESHABILITADO -- la ficha no está completa --,
// y la prueba se queda esperando a un botón que nunca se enciende.
const perroCon = (nivel) => ({
  ...PERRO_DE_PRUEBA,
  nombre: "Duna",
  peso_actual: 25.0,
  premios_nivel: nivel,
  etapa: "adulto",
  tamano: "Grande",
  raza: "Border Collie",
  fecha_nacimiento: "2021-03-02",
  dieta_actual: "barf",
});

const entrar = async (page) => {
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
};

// Las kcal de la tarjeta, leídas como las lee una persona.
async function kcalQueSeVen(page) {
  const tarjeta = page.getByText("kcal / día", { exact: true }).first();
  await expect(tarjeta).toBeVisible({ timeout: 30000 });
  const texto = await tarjeta.locator("xpath=preceding-sibling::p[1]").innerText();
  return Number(texto.replace(/[^\d]/g, ""));
}

async function gramosQueSeVen(page) {
  const tarjeta = page.getByText("ración total", { exact: true }).first();
  await expect(tarjeta).toBeVisible({ timeout: 30000 });
  const texto = await tarjeta.locator("xpath=preceding-sibling::p[1]").innerText();
  return Number(texto.replace(/[^\d]/g, ""));
}

async function generar(page) {
  await irAlGenerador(page);
  await page.getByRole("button", { name: /^Automático/ }).click();
  await page.getByRole("button", { name: /^(Generar|Hacer)/ }).click();
  await expect(page.getByText(/Semana de/)).toBeVisible({ timeout: 30000 });
}

test.describe("los premios cambian lo que se ve en pantalla", () => {
  // El mismo perro, la misma DER, lo único que cambia es la respuesta de los
  // premios. Si la pantalla enseñara lo que la app MANDA en vez de lo que el
  // servidor DEVUELVE, estos dos números serían iguales -- que es exactamente
  // lo que pasaba.
  for (const [nivel, fraccion] of [["ninguno", 0], ["alguno", 0.05],
                                   ["hasta_el_maximo", 0.10], ["mas_del_maximo", 0.20]]) {
    test(`con premios «${nivel}» la ración se ve con las kcal que quedan`,
      async ({ page, request }) => {
        await configurar(request, {
          retrasoPerrosMs: 50, perros: [perroCon(nivel)], menus: [], premium: true,
        });
        await entrar(page);
        await generar(page);

        const { peticionesMenu } = await configurar(request, { olvidarPeticionesMenu: false });
        const der = Number(peticionesMenu[0].der_objetivo);
        expect(peticionesMenu[0].premios_nivel,
          "la petición no lleva el nivel de premios de la ficha").toBe(nivel);

        const esperadas = Math.round(der * (1 - fraccion));
        const vistas = await kcalQueSeVen(page);
        expect(vistas,
          `la tarjeta enseña ${vistas} kcal y la ración que ha devuelto el servidor tiene ` +
          `${esperadas}. Si enseña el DER que se mandó (${Math.round(der)}) en vez de lo que ` +
          `contestó el servidor, un perro al que le dan premios ve las calorías del día entero ` +
          `donde debería ver las de su ración`)
          .toBe(esperadas);
      });
  }

  // Y la comprobación que de verdad contesta a lo que ella vio: DOS perros
  // iguales salvo por la respuesta de los premios tienen que dar números
  // DISTINTOS en pantalla. Una prueba que mire un solo caso pasa aunque el
  // número esté clavado.
  test("«muchos» y «ninguno» NO pueden dar lo mismo", async ({ page, request }) => {
    await configurar(request, {
      retrasoPerrosMs: 50, perros: [perroCon("ninguno")], menus: [], premium: true,
    });
    await entrar(page);
    await generar(page);
    const kcalSinPremios = await kcalQueSeVen(page);
    const gramosSinPremios = await gramosQueSeVen(page);

    await configurar(request, {
      retrasoPerrosMs: 50, perros: [perroCon("mas_del_maximo")], menus: [], premium: true,
    });
    await page.goto("/");
    await generar(page);
    const kcalConPremios = await kcalQueSeVen(page);
    const gramosConPremios = await gramosQueSeVen(page);

    expect(kcalConPremios,
      `con «muchos» se ven ${kcalConPremios} kcal y sin premios ${kcalSinPremios}. Son el mismo ` +
      `número, así que la pantalla no está enseñando la ración que ha devuelto el servidor. Es ` +
      `exactamente lo que reportó Elena el 11 de septiembre`)
      .toBeLessThan(kcalSinPremios);
    expect(gramosConPremios,
      `con «muchos» la ración pesa ${gramosConPremios} g y sin premios ${gramosSinPremios}. Menos ` +
      `calorías son menos comida: si el peso no baja, lo que se está pintando no es este menú`)
      .toBeLessThan(gramosSinPremios);
  });

  // Y que el aviso llegue hasta la pantalla. El servidor lo manda en
  // `problemas_seguridad`, que la app ya pinta -- pero eso hay que verlo, no
  // suponerlo: el 5 de agosto esos avisos se calculaban y se tiraban.
  test("el aviso de los premios se ve", async ({ page, request }) => {
    await configurar(request, {
      retrasoPerrosMs: 50, perros: [perroCon("mas_del_maximo")], menus: [], premium: true,
    });
    await entrar(page);
    await generar(page);
    await expect(page.getByText(/PREMIOS: este menú está calculado contando/).first(),
      "el menú viene con el aviso de los premios y la app no lo pinta en ninguna parte")
      .toBeVisible({ timeout: 15000 });
  });
});
