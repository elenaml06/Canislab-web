// ─── BUSCAR SIN PELEARSE CON LAS TILDES ─────────────────────────────────────
//
// ⚠️ CASO REAL ENCONTRADO POR LA USUARIA (29 agosto): "si buscas hígado y no
// pones la tilde, no te sale nada".
//
// Y es lo que hace todo el mundo: en un móvil poner la tilde cuesta una
// pulsación larga. El catálogo está escrito bien -- "Hígado de pollo",
// "Corazón de ternera", "Riñón de cordero", "Plátano" --, así que quien
// escribe "higado" no encuentra nada y concluye que no lo tenemos.
//
// La regla vale para los dos lados: se comparan las dos cosas sin tildes.
// `normalize("NFD")` separa cada letra de su acento y el reemplazo se lleva
// los acentos sueltos.
//
// ⚠️ LA EÑE NO SE TOCA, y por eso hay un rodeo. En NFD, la "ñ" también se
// separa en "n" + virgulilla, así que quitar los acentos a lo bruto
// convertiría "Riñón" en "rinon" y "año" en "ano". Buscar "pina" y encontrar
// "Piña" está bien; que "año" y "ano" sean la misma palabra, no. Se aparta
// antes de normalizar y se devuelve después.
const HUECO_ENE = "\uE000";   // zona de uso privado: no aparece en ningún nombre

export function sinTildes(texto) {
  return String(texto || "")
    .replace(/ñ/g, HUECO_ENE)
    .replace(/Ñ/g, HUECO_ENE)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(HUECO_ENE).join("ñ")
    .toLowerCase();
}

/** La eñe convertida en ene. Solo para BUSCAR, nunca para escribir. */
function tambienSinEne(texto) {
  return sinTildes(texto).replace(/ñ/g, "n");
}

/**
 * ¿`texto` contiene `busqueda`, mirando sin tildes y sin mayúsculas?
 *
 * Se prueban las dos formas, y el orden importa poco: primero respetando la
 * eñe -- para que "riñon" encuentre "Riñón" -- y si no, con la eñe pasada a
 * ene, para que la encuentre también quien escriba "rinon" desde un teclado
 * sin ella. Una caja de búsqueda no es un diccionario: aquí "año" y "ano"
 * pueden ser la misma cosa sin que pase nada, porque lo que se busca son
 * nombres de alimentos y de razas.
 */
export function contiene(texto, busqueda) {
  const q = sinTildes(busqueda).trim();
  if (!q) return false;
  if (sinTildes(texto).includes(q)) return true;
  return tambienSinEne(texto).includes(tambienSinEne(busqueda).trim());
}
