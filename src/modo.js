// ─── EN QUÉ MODO ESTÁ LA APP, EN UN SOLO SITIO ───────────────────────────────
//
// Lógica pura, sin React y sin red, como `rol.js` y `der.js`.
//
// Existe porque la regla estaba escrita DENTRO de la pantalla grande, y en
// cuanto hizo falta en un segundo sitio -- decidir con qué perro se abre la
// app -- había que copiarla. Y una regla copiada es una regla que se separa:
// es exactamente lo que cuenta el CLAUDE.md del DER, calculado en dos sitios
// y sin nada que vigile que siguen diciendo lo mismo.
//
// Son DOS cosas distintas y no hay que confundirlas:
//
//   acreditado  — lo que dice Supabase. No se cambia desde la app: lo
//                 enciende una persona mirando el número de colegiado.
//   elección    — lo que ha dicho ESTE navegador. `null` = no ha dicho nada
//                 todavía, y entonces manda la acreditación: un veterinario
//                 recién acreditado entra en su modo sin tener que descubrir
//                 que existe un interruptor en Ajustes.
//
// El modo se guarda en el navegador a propósito y no en Supabase: es de este
// móvil y de este rato, como la cesta de la compra.

export const CLAVE_MODO = "rawku_modo_profesional";

export function leerEleccionModo() {
  try {
    const v = localStorage.getItem(CLAVE_MODO);
    return v === null ? null : v === "1";
  } catch {
    return null;   // navegador sin almacenamiento: como si no hubiera dicho nada
  }
}

export function guardarEleccionModo(valor) {
  try {
    localStorage.setItem(CLAVE_MODO, valor ? "1" : "0");
  } catch { /* navegador sin almacenamiento */ }
}

// Si la acreditación se retira, el modo se apaga solo: si no, alguien que
// dejó de estar acreditado seguiría viendo la vista profesional hasta que se
// le ocurriera apagarla.
export function enModoProfesional(acreditado, eleccion) {
  if (!acreditado) return false;
  return eleccion === null || eleccion === undefined ? true : Boolean(eleccion);
}
