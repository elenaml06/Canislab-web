// ─── Cómo se llega a los sitios, escrito UNA vez ─────────────────────────────
//
// POR QUÉ EXISTE ESTE ARCHIVO (25 de agosto)
// Pedido expreso: "cuando terminas de generar por primera vez el perfil del
// perro sí que tienes que tener ese botón, pero cuando entras a editar el
// perfil del perro desde el menú lateral ahí es donde no tiene que estar".
//
// Quitar ese botón tocaba 46 sitios repartidos por 22 archivos de pruebas,
// porque todos usaban "Hacer el menú de la semana" para dos cosas distintas:
// como señal de que la app había cargado, y como camino al generador. Cada
// archivo con su copia.
//
// Copiar el camino 22 veces es lo que hace que el siguiente cambio de
// navegación vuelva a costar un día. Es el mismo error que ya salió con las
// cinco listas de especies y con los dos paneles laterales. Aquí se escribe
// una vez y se importa.
//
// Si mañana el generador se abre desde otro sitio, se cambia AQUÍ.

import { expect } from "@playwright/test";

// La ficha del perro ha cargado. Se mira una FILA de la ficha y no un botón
// de acción: las filas están mientras exista la ficha, y los botones van y
// vienen según por dónde hayas entrado -- que es justo lo que cambió hoy.
export const laFichaHaCargado = (page) => page.getByText("Nombre y sexo");

export const esperarLaFicha = (page, opciones = {}) =>
  laFichaHaCargado(page).waitFor(opciones);

// Ir al generador desde donde sea. Desde el 25 de agosto se entra por "Mis
// menús": la ficha del perro ya no ofrece hacer menús cuando vas a editarla.
export async function irAlGenerador(page) {
  await page.getByRole("button", { name: "Menú", exact: true }).last().click();
  await page.getByRole("dialog", { name: "Panel lateral" })
            .getByRole("button", { name: "Mis menús", exact: true }).click();
  await page.getByRole("button", { name: /Hacer otro menú/ }).click();
  // Que haya llegado de verdad: la primera pregunta del generador.
  await expect(page.getByRole("button", { name: /^Automático/ })).toBeVisible();
}
