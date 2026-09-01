// ─── BUSCAR SIN TILDES ──────────────────────────────────────────────────────
//
// ⚠️ CASO REAL DE LA USUARIA (29 agosto): "si buscas hígado y no pones la
// tilde, no te sale nada". Es lo que hace todo el mundo en un móvil, y el
// catálogo está lleno de tildes: Hígado, Corazón, Riñón, Plátano, Espinazo
// de conejo. Sin esto, media lista es inencontrable.
import { test, expect } from "@playwright/test";
import { sinTildes, contiene } from "../src/texto.js";

test("se encuentra escribiendo sin tildes", () => {
  expect(contiene("Hígado de pollo", "higado")).toBe(true);
  expect(contiene("Corazón de ternera", "corazon")).toBe(true);
  expect(contiene("Plátano", "platano")).toBe(true);
  expect(contiene("Espinazo de conejo", "espinazo")).toBe(true);
});

test("y escribiéndolas también, que es lo que hace quien las pone", () => {
  expect(contiene("Hígado de pollo", "hígado")).toBe(true);
  expect(contiene("Riñón de cordero", "riñón")).toBe(true);
});

test("la eñe se encuentra de las dos maneras", () => {
  // Con eñe, que es lo normal en un teclado español...
  expect(contiene("Riñón de cordero", "riñon")).toBe(true);
  // ...y sin ella, para quien escriba desde uno que no la tenga.
  expect(contiene("Riñón de cordero", "rinon")).toBe(true);
});

test("pero la eñe NO se pierde al escribir", () => {
  // `sinTildes` es lo que se usaría para pintar o comparar texto: ahí la
  // eñe se queda, porque "año" y "ano" no son la misma palabra. Lo que se
  // relaja es la BÚSQUEDA, no el idioma.
  expect(sinTildes("Riñón")).toBe("riñon");
  expect(sinTildes("Año")).toBe("año");
});

test("mayúsculas y espacios de más no molestan", () => {
  expect(contiene("Hígado de pollo", "  HIGADO ")).toBe(true);
  expect(contiene("Hígado de pollo", "DE POLLO")).toBe(true);
});

test("una búsqueda vacía no encuentra todo", () => {
  // Si devolviera true, el selector enseñaría el catálogo entero al abrirlo.
  expect(contiene("Hígado de pollo", "")).toBe(false);
  expect(contiene("Hígado de pollo", "   ")).toBe(false);
});

test("lo que no está sigue sin estar", () => {
  expect(contiene("Hígado de pollo", "ternera")).toBe(false);
});
