// ─── Pesar al perro y regenerar el menú con el peso nuevo ────────────────────
//
// POR QUÉ EXISTE ESTE ARCHIVO
// El 25 de agosto llegó a Sentry, de una usuaria de verdad y sin manejar:
//
//     ReferenceError: setMenuReal is not defined
//
// Es el botón de esta pantalla. Pesas al perro en Evolución, sale el
// "✅ Peso actualizado", pulsas "Regenerar menú adaptado al nuevo peso" y
// revienta: esa línea llamaba a un `setMenuReal` que vive en el componente
// de FUERA. El menú no se regeneraba nunca y en pantalla no pasaba nada.
//
// Y por el OTRO camino -- Evolución abierta desde el panel lateral -- no
// reventaba siquiera: el manejador era un `() => {}`. No hacía nada, en
// silencio, que es peor todavía.
//
// Es la SEGUNDA vez que pasa en esta misma pantalla: unas líneas más arriba
// hay otro caso igual con `usuario`, que hacía que el peso se perdiera al
// recargar. La familia entera es la misma -- un nombre que no existe no da
// guerra hasta que se ejecuta esa línea, y esa línea solo se ejecuta
// pulsando ese botón concreto.
//
// Contra eso hay dos cosas y las dos hacen falta:
//   · `npm run lint` (no-undef), que va dentro de `npm run build` y caza
//     todos los nombres inexistentes leyendo, sin ejecutar nada.
//   · Esta prueba, que PULSA el botón por los dos caminos y además vigila
//     que la página no lance NINGÚN error sin manejar. Eso es lo que
//     convierte "no pasó nada" en una prueba roja.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";
import { esperarLaFicha, irAlGenerador } from "./ayudas.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

const configurar = async (request, opciones) => {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
};

// Todo lo que la página lance y nadie recoja. Es exactamente lo que Sentry
// vio: `handled: no`.
const vigilarErrores = (page) => {
  const sueltos = [];
  page.on("pageerror", (e) => sueltos.push(String(e)));
  return sueltos;
};

async function entrar(page) {
  await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
  await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await esperarLaFicha(page);
}

async function generar(page) {
  await irAlGenerador(page);
  await page.getByRole("button", { name: /^Automático/ }).click();
  await page.getByRole("button", { name: /^(Generar|Hacer)/ }).click();
  await page.getByRole("button", { name: /Perro actual/ }).waitFor();
}

const irAEvolucion = async (page) => {
  await page.getByRole("button", { name: "Menú", exact: true }).last().click();
  await page.getByRole("dialog", { name: "Panel lateral" })
            .getByRole("button", { name: "Evolución y crecimiento", exact: true }).click();
  await expect(page.getByText(/Evolución de Nala/)).toBeVisible();
};

// Pesa, guarda y pulsa el botón de regenerar.
const pesarYRegenerar = async (page, kg) => {
  await page.getByPlaceholder("ej. 18.5").fill(kg);
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  const regenerar = page.getByRole("button", { name: /Regenerar menú adaptado al nuevo peso/ });
  await expect(regenerar, "pesar no ofrece regenerar el menú").toBeVisible();
  await regenerar.click();
};

test.describe("pesar al perro y regenerar con el peso nuevo", () => {
  test.beforeEach(async ({ request }) => {
    await configurar(request, {
      retrasoPerrosMs: 50,
      premium: true,            // la pantalla de Evolución está tras el muro
      perros: [{ ...PERRO_DE_PRUEBA, dieta_actual: "barf" }],
      menus: [], olvidarUltimoMenu: true,
    });
  });

  test("desde el menú: regenerar de verdad lleva al menú nuevo", async ({ page }) => {
    const sueltos = vigilarErrores(page);
    await page.goto("/");
    await entrar(page);
    await generar(page);

    await irAEvolucion(page);
    await pesarYRegenerar(page, "22");

    // Lo que tiene que pasar: salir de Evolución y volver a calcular. Si el
    // botón revienta, te quedas mirando Evolución y esto se cae.
    await expect(page.getByText(/Evolución de Nala/),
      "se ha pulsado regenerar y sigues en Evolución").toHaveCount(0);
    // ⚠️ NO vale mirar la burbuja ni "salir de Evolución": la burbuja está
    // en TODAS las pantallas, y salir de la sección te devuelve al perfil
    // aunque regenerar no haga nada. Con esas dos señales, la prueba pasaba
    // con el no-op puesto. Comprobado. "Semana de Nala" solo existe en la
    // pantalla del menú.
    await expect(page.getByText(/Semana de Nala/),
      "no se ha llegado a ningún menú nuevo: regenerar no ha regenerado nada")
      .toBeVisible({ timeout: 20000 });

    expect(sueltos, `la página ha lanzado un error sin manejar: ${sueltos[0]}`).toEqual([]);
  });

  test("desde el panel lateral hace lo MISMO, no un no-op", async ({ page }) => {
    // Este camino no reventaba: no hacía nada. Un `() => {}` no deja rastro
    // en Sentry ni en la pantalla, así que sin esto no lo sabría nadie.
    const sueltos = vigilarErrores(page);
    await page.goto("/");
    await entrar(page);

    // Sin generar menú: Evolución abierta directamente desde el perfil, que
    // es el otro sitio donde se monta esta misma pantalla.
    await irAEvolucion(page);
    await pesarYRegenerar(page, "23");

    await expect(page.getByText(/Evolución de Nala/),
      "por este camino regenerar no hace nada: sigues en Evolución").toHaveCount(0);
    // ⚠️ NO vale mirar la burbuja ni "salir de Evolución": la burbuja está
    // en TODAS las pantallas, y salir de la sección te devuelve al perfil
    // aunque regenerar no haga nada. Con esas dos señales, la prueba pasaba
    // con el no-op puesto. Comprobado. "Semana de Nala" solo existe en la
    // pantalla del menú.
    await expect(page.getByText(/Semana de Nala/),
      "no se ha llegado a ningún menú nuevo: regenerar no ha regenerado nada")
      .toBeVisible({ timeout: 20000 });

    expect(sueltos, `la página ha lanzado un error sin manejar: ${sueltos[0]}`).toEqual([]);
  });
});
