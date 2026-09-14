// ─── El teclado del móvil no se queda abierto donde no hay nada que escribir ──
//
// CASO REAL, 14 de septiembre de 2026, contado por Elena: «cuando se selecciona
// en el perfil del perro lo de la actividad, el estado corporal del perro y eso
// SE ABRE EL TECLADO DEL MÓVIL y no debería».
//
// Los dos controles que nombra son `<input type="range">`, y un deslizador NO
// abre ningún teclado. Lo que pasa es lo contrario: el teclado NO SE CIERRA.
// En el paso 4 hay un `<input type="number">` -- el peso actual -- justo encima
// del deslizador de condición corporal, y en Safari del iPhone tocar el
// deslizador NO le quita el foco, porque allí pulsar no mueve el foco. Así que
// el teclado se queda tapando media pantalla justo encima de la silueta que hay
// que mirar.
//
// ⚠️ AL CAMBIAR DE PASO NO HACÍA FALTA, y la prueba es la que lo dijo: el campo
// del peso se DESMONTA, y desmontar lo que tiene el foco ya lo suelta. La
// primera versión de este arreglo también lo hacía ahí, y con el arreglo
// quitado esa prueba seguía verde -- o sea, código que parecía arreglar algo
// sin arreglar nada. Se quitó. Lo que queda de aquel caso es la segunda prueba
// de abajo, que es lo único cierto que había: en el paso 5 no hay NI UN campo
// de escribir, así que un teclado ahí no tendría ninguna explicación.
//
// ⚠️ ESTO SE MIRA POR EL FOCO Y NO POR EL TECLADO, y no es un apaño: en un
// navegador de escritorio no hay teclado que ver, pero el teclado del móvil lo
// levanta EXACTAMENTE una cosa -- que el elemento con el foco sea un campo de
// escribir --, así que el foco es el hecho y el teclado es su consecuencia.
//
// ⚠️ Y HAY QUE SIMULAR UNA COSA DE SAFARI, PORQUE SI NO LA PRUEBA PASA CON EL
// FALLO PUESTO -- que es lo mismo que no tenerla. Chromium, al pulsar, MUEVE EL
// FOCO al elemento pulsado (deslizador o botón), así que el campo de texto se
// queda sin foco él solo y el teclado se cerraría aunque no hiciéramos nada.
// Safari en el iPhone NO lo hace: pulsar un botón o un deslizador no le quita
// el foco a lo que lo tenga, y por eso el teclado se queda ahí. Eso se
// reproduce impidiendo ese movimiento de foco -- `preventDefault` en el
// `pointerdown` --, que es literalmente lo que hace Safari.
//
// Medido: con esa simulación puesta y `quitarElTeclado` quitado de `App.jsx`,
// las dos pruebas se ponen ROJAS; con la función, verdes. Sin la simulación,
// las dos pasan rotas.
import { test, expect } from "@playwright/test";

const SUPABASE_FALSO = "http://127.0.0.1:54321";

async function configurarBackend(request, opciones) {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

// Safari en el iPhone: pulsar no mueve el foco. Se instala una vez por página.
const comoSafari = (page) => page.evaluate(() => {
  document.addEventListener("pointerdown", (e) => e.preventDefault(), true);
});

// Qué tiene el foco AHORA MISMO, en la forma en que le importa a un móvil:
// si es un campo de escribir, hay teclado.
const loQueTieneElFoco = (page) => page.evaluate(() => {
  const a = document.activeElement;
  if (!a || a === document.body) return "nada";
  const tipo = (a.getAttribute("type") || "").toLowerCase();
  if (a.tagName === "TEXTAREA") return "escribir";
  if (a.tagName !== "INPUT") return a.tagName.toLowerCase();
  return ["text", "number", "email", "password", "search", "tel", "url", ""]
    .includes(tipo) ? "escribir" : tipo;
});

async function llegarAlPaso4(page) {
  await page.addInitScript(() => {
    window.localStorage.setItem("rawku.local.sinCuenta", "true");
    window.localStorage.setItem("rawku.local.perros", "[]");
    window.localStorage.setItem("rawku.local.menus", "[]");
  });
  // Con `sinCuenta` sembrado y sin ningún perro, la app entra directa al
  // asistente: no hay muro que saltar.
  await page.goto("/");
  await page.getByText("1 / 6").waitFor();
  await page.getByPlaceholder("Nombre de tu perro").fill("Lola");
  await page.getByRole("button", { name: "Hembra", exact: true }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByText("2 / 6").waitFor();
  await page.getByRole("button", { name: /Es mestizo/ }).click();
  await page.getByRole("button", { name: /^Mediano/ }).click();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByText("3 / 6").waitFor();
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByText("4 / 6").waitFor();
}

test.describe("el teclado no se queda abierto en los deslizadores", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, { retrasoPerrosMs: 50, sinPerro: true, menus: [] });
  });

  test("tocar la condición corporal cierra el teclado del peso", async ({ page }) => {
    await llegarAlPaso4(page);

    // Escribir el peso: aquí el teclado TIENE que estar, y esa mitad también
    // se comprueba -- si no, la prueba pasaría con el campo roto.
    const peso = page.getByPlaceholder("0");
    await peso.click();
    await peso.fill("20");
    expect(await loQueTieneElFoco(page)).toBe("escribir");
    await comoSafari(page);

    // Y ahora el deslizador de condición corporal, con un dedo.
    const deslizador = page.locator('input[type="range"]').first();
    const caja = await deslizador.boundingBox();
    await page.mouse.move(caja.x + caja.width * 0.75, caja.y + caja.height / 2);
    await page.mouse.down();
    await page.mouse.up();

    expect(await loQueTieneElFoco(page)).not.toBe("escribir");
  });

  // ⚠️ ESTA NO PRUEBA EL ARREGLO: prueba que el paso 5 no tenga dónde escribir.
  // Es un guardia de FORMA y va aquí porque es lo que sostiene la frase «un
  // teclado en el paso 5 no tiene ninguna explicación». El día que alguien
  // meta ahí un campo de texto, esto se pone rojo y hay que volver a pensar
  // si el teclado estorba.
  test("en el paso 5 no hay ni un campo de escribir", async ({ page }) => {
    await llegarAlPaso4(page);
    await page.getByPlaceholder("0").fill("20");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByText("5 / 6").waitFor();

    await expect(page.locator('input:not([type="range"]), textarea')).toHaveCount(0);
    expect(await loQueTieneElFoco(page)).not.toBe("escribir");
  });
});
