// ─── Cambiar de perro dos veces seguidas ─────────────────────────────────────
//
// CASO REAL (25 agosto): "cuando cambio de perro la primera vez se cambia sin
// problema pero si quiero cambiarlo otra vez de perro sin cambiar de pantalla
// primero no me deja".
//
// POR QUÉ NO SE VEÍA EN LAS PRUEBAS QUE YA HABÍA: porque el backend de
// mentira contesta al instante. El fallo es una CARRERA -- guardas un perro,
// cambias de perro antes de que la respuesta vuelva, y esa respuesta llega
// cuando ya estás en otro. Entonces el componente de fuera apunta al perro de
// ANTES mientras en pantalla hay otro, y pedir el de antes no hace nada:
// botón muerto, sin error y sin aviso.
//
// En local no pasa nunca. En un móvil con mala cobertura, a diario. Por eso
// el backend de mentira ahora sabe tardar en guardar: `retrasoGuardarPerroMs`.

import { test, expect } from "@playwright/test";
import { irAlGenerador } from "./ayudas.js";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA } from "./fake-supabase.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

const configurar = async (request, opciones) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
};

const laBurbuja = (page) => page.getByRole("button", { name: /Perro actual/ });
const laHoja = (page) => page.getByRole("dialog", { name: "Tus perros" });

const elPerroDeAhora = async (page) =>
  (await laBurbuja(page).first().getAttribute("aria-label")) || "";

const cambiarA = async (page, nombre) => {
  await laBurbuja(page).last().click();
  await expect(laHoja(page)).toBeVisible();
  await laHoja(page).getByRole("button", { name: nombre }).click();
  await expect.poll(() => elPerroDeAhora(page),
    { message: `no se ha cambiado a ${nombre}` }).toContain(nombre);
};

test("se puede cambiar de perro dos veces seguidas, aunque el guardado tarde", async ({ page, request }) => {
  await configurar(request, {
    retrasoPerrosMs: 50,
    // ⏱ 2,5 segundos guardando: la respuesta llega cuando ya has cambiado.
    retrasoGuardarPerroMs: 2500,
    perros: [PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA],
    menus: [], olvidarUltimoMenu: true,
  });
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByText("Nombre y sexo").waitFor();

  // Ir al generador guarda la ficha -- y con el retraso puesto, ese guardado
  // sigue en el aire cuando se cambia de perro. Ésa es la carrera.
  await irAlGenerador(page);

  await cambiarA(page, "Cairo");

  // Se deja llegar la respuesta tardía del guardado de Nala. Aquí es donde
  // el puntero se iba al perro de antes.
  await page.waitForTimeout(3000);
  expect(await elPerroDeAhora(page),
    "la respuesta tardía del guardado ha cambiado el perro de la pantalla")
    .toContain("Cairo");

  // Y el segundo cambio, sin moverse de pantalla. Esto era lo que no hacía
  // nada.
  await cambiarA(page, "Nala");
});

test("un guardado que llega tarde no cambia de perro a tus espaldas", async ({ page, request }) => {
  // La otra mitad del mismo fallo, y la que se ve al día siguiente. El
  // puntero del perro que se está mirando también se APUNTA para la próxima
  // vez que abras la app. Si una respuesta que llega tarde lo mueve al perro
  // de antes, en pantalla no se nota nada... y al volver a entrar te
  // encuentras al otro perro, sin saber por qué.
  await configurar(request, {
    retrasoPerrosMs: 50, retrasoGuardarPerroMs: 2500,
    perros: [PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA],
    menus: [], olvidarUltimoMenu: true,
  });
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByText("Nombre y sexo").waitFor();

  await irAlGenerador(page);          // guardado lento de Nala en marcha
  await cambiarA(page, "Cairo");
  await page.waitForTimeout(3000);    // llega tarde

  // Y ahora se cierra y se vuelve a abrir la app.
  await page.reload();
  await page.getByRole("button", { name: /Perro actual/ }).first().waitFor({ timeout: 20000 });

  expect(await elPerroDeAhora(page),
    "al volver a abrir la app aparece el perro de antes: la respuesta tardía " +
    "del guardado se llevó el puntero sin que se notara")
    .toContain("Cairo");
});

test("y sin retrasos también, ida y vuelta", async ({ page, request }) => {
  // El mismo recorrido con todo instantáneo: si un día se arregla la carrera
  // rompiendo el camino normal, esto lo caza.
  await configurar(request, {
    retrasoPerrosMs: 50,
    perros: [PERRO_DE_PRUEBA, SEGUNDO_PERRO_DE_PRUEBA],
    menus: [], olvidarUltimoMenu: true,
  });
  await page.goto("/");
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.getByText("Nombre y sexo").waitFor();

  await cambiarA(page, "Cairo");
  await cambiarA(page, "Nala");
  await cambiarA(page, "Cairo");
});
