// ─── Ningún texto de la app puede decir "undefined" ──────────────────────────
//
// CASO REAL (22 de agosto): al abrir "cómo preparar" en la zanahoria salía
//
//     Como referencia, undefined — con los 15g de hoy te haces una idea.
//
// La entrada de la zanahoria en COMO_DAR_ALIMENTO tiene instrucción (`como`)
// pero no tiene peso de referencia (`pieza`), y la plantilla lo metía en el
// texto tal cual. Pasaba en 34 de las 77 entradas — todas las verduras y
// frutas.
//
// No dio ningún error: JavaScript convierte undefined a "undefined" dentro de
// una plantilla y sigue tan tranquilo. Sólo se ve leyendo esa pantalla, en ese
// alimento concreto. Por eso lo encontró la usuaria y no las pruebas.
//
// Esto no vigila la zanahoria: vigila la FAMILIA. Recorre las pantallas y
// falla si en cualquier texto visible aparece "undefined", "null", "NaN" o
// "[object Object]" — los cuatro agujeros por los que se cuela un dato que no
// existe sin que nada avise.

import { test, expect } from "@playwright/test";
import { CUENTA_DE_PRUEBA, PERRO_DE_PRUEBA } from "./fake-supabase.js";

const SUPABASE_FALSO = "http://127.0.0.1:54321";
const BASURA = /\b(undefined|NaN)\b|\[object Object\]/;

async function configurarBackend(request, opciones) {
  const res = await request.post(`${SUPABASE_FALSO}/__control`, { data: opciones });
  expect(res.ok()).toBeTruthy();
  return res.json();
}

async function textoVisible(page) {
  return (await page.locator("body").innerText()).replace(/\s+/g, " ");
}

async function exigirLimpio(page, donde) {
  const texto = await textoVisible(page);
  const sucio = texto.match(BASURA);
  expect(sucio ? `${donde}: «...${texto.slice(Math.max(0, texto.indexOf(sucio[0]) - 60),
                  texto.indexOf(sucio[0]) + 60)}...»` : null,
    `hay un dato que no existe pintado como texto en ${donde}`).toBeNull();
}

test.describe("ninguna pantalla enseña datos que no existen", () => {
  test.beforeEach(async ({ request }) => {
    await configurarBackend(request, {
      retrasoPerrosMs: 100, perros: [PERRO_DE_PRUEBA], menus: [],
    });
  });

  async function entrar(page) {
    await page.goto("/");
    await page.getByPlaceholder("Email").fill(CUENTA_DE_PRUEBA.email);
    await page.getByPlaceholder("Contraseña").fill(CUENTA_DE_PRUEBA.password);
    await page.getByRole("button", { name: "Entrar" }).click();
    await page.getByRole("button", { name: /Hacer el menú de la semana/ }).waitFor();
  }

  test("la ficha del perro y el generador", async ({ page }) => {
    await entrar(page);
    await exigirLimpio(page, "la ficha del perro");
    await page.getByRole("button", { name: /Hacer el menú de la semana/ }).click();
    await exigirLimpio(page, "el generador");
  });

  test("el menú, y 'cómo preparar' de CADA alimento", async ({ page }) => {
    await entrar(page);
    await page.getByRole("button", { name: /Hacer el menú de la semana/ }).click();
    await page.getByRole("button", { name: "Pienso", exact: true }).click();
    await page.getByRole("button", { name: /^Automático/ }).click();
    await page.getByRole("button", { name: /^Generar/ }).click();

    await page.getByText(/Menú 1|Carne muscular/).first().waitFor({ timeout: 30000 });
    await exigirLimpio(page, "el menú recién generado");

    // ⚠️ Uno por uno, y por su NOMBRE. La primera versión pulsaba
    // cualquier botón que tuviera un icono dentro y no servía: no llegaba
    // a abrir los paneles de preparación, así que pasaba en verde con el
    // fallo puesto (comprobado). Ahora va al botón exacto de cada
    // alimento, que además tiene nombre para un lector de pantalla.
    const botones = page.getByRole("button", { name: /^Cómo preparar / });
    const cuantos = await botones.count();
    expect(cuantos, "no hay ningún botón de 'cómo preparar': la prueba no prueba nada")
      .toBeGreaterThan(2);

    for (let i = 0; i < cuantos; i++) {
      const b = botones.nth(i);
      const quien = (await b.getAttribute("aria-label")) || `alimento ${i}`;
      await b.click();
      await exigirLimpio(page, `«${quien}»`);
      await b.click();   // cerrar, para que el siguiente empiece limpio
    }
  });
});

// ─── Y ninguna palabra pegada a la siguiente ─────────────────────────────────
//
// CASO REAL (23 de agosto), encontrado otra vez por la usuaria:
//
//     "carne, vísceras, hígado y hueso al menos 1 semanacongelados a -18/-20°C"
//
// En JSX, cuando una línea TERMINA en una etiqueta y la siguiente empieza con
// texto, el salto de línea NO se convierte en espacio: se come. Y al revés
// igual. El espacio de dentro de una misma línea sí se respeta, así que el
// mismo texto está bien o mal según por dónde se haya partido — y partirlo es
// lo primero que hace cualquiera al editarlo.
//
// No da error, compila igual, y sólo se ve leyendo esa frase concreta en esa
// pantalla concreta. Misma familia que el "undefined" de arriba.
//
// Esto no se puede vigilar mirando la pantalla: haría falta que el menú de
// pruebas pasara por todos los textos de la app. Se vigila en el CÓDIGO, que
// sí está entero aquí.

import fs from "node:fs";
import path from "node:path";

test("ningún texto pega dos palabras al partir la línea", () => {
  const ETIQUETA_FIN = /<\/(b|i|em|strong|span|a)>\s*$/;
  const ETIQUETA_INI = /^\s*<(b|i|em|strong|span|a)[\s>]/;
  const LETRA_INI = /^\s*[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9¿¡]/;
  const LETRA_FIN = /[A-Za-zÁÉÍÓÚÜÑáéíóúüñ0-9,;:.]\s*$/;

  const dir = path.join(process.cwd(), "src");
  const archivos = fs.readdirSync(dir).filter((f) => f.endsWith(".jsx") || f.endsWith(".js"));

  const pegados = [];
  for (const archivo of archivos) {
    const lineas = fs.readFileSync(path.join(dir, archivo), "utf8").split("\n");
    for (let i = 0; i < lineas.length - 1; i++) {
      const a = lineas[i];
      const b = lineas[i + 1];
      const cierra = ETIQUETA_FIN.test(a) && LETRA_INI.test(b);
      // En la forma b) se descarta la etiqueta que abre con atributos: ésa
      // no es texto en línea, es un elemento con su propio hueco.
      const abre = LETRA_FIN.test(a) && ETIQUETA_INI.test(b) && !b.split(">")[0].slice(2).includes("=");
      if (cierra || abre) {
        pegados.push(`${archivo}:${i + 1} → «...${a.trim().slice(-40)}» + «${b.trim().slice(0, 34)}...»`);
      }
    }
  }

  expect(pegados,
    "aquí el salto de línea se come el espacio y las dos palabras salen pegadas en pantalla")
    .toEqual([]);
});
