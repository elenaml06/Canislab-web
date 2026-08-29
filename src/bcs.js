// ─── LA CONDICIÓN CORPORAL, EN LOS DOS IDIOMAS ───────────────────────────────
//
// Lógica pura, sin React y sin red, como `rol.js`, `modo.js` y `der.js`.
//
// La misma cosa se pregunta de dos maneras según quién mire la pantalla:
//
//   · Al dueño, con cinco escalones y nombres cariñosos ("Rellenito").
//     Nadie que quiera a su perro va a decir en frío que su perro es un 7.
//   · Al veterinario, con el BCS de 9 puntos, que es la escala que usa y la
//     que aparece en la historia clínica. Pedido expreso: "para un
//     veterinario es mejor poner el BCS... no tiene que ser rollo te lo hago
//     divertido".
//
// Pero por dentro es UN SOLO NÚMERO y UNA SOLA FÓRMULA. Los cinco escalones
// del dueño son cinco valores del BCS (2, 4, 5, 7 y 9) y nada más: si cada
// pantalla calculara su peso objetivo por su cuenta, el mismo perro tendría
// dos objetivos y dos DER según quién abriera la ficha.
//
// ⚠️ POR QUÉ EL BCS SE GUARDA APARTE Y NO BASTA `condicion_idx`: son cinco
// escalones, así que un BCS 6 -- "por encima del ideal", el caso más común
// en consulta -- solo se puede guardar redondeándolo a 5 o a 7. Redondear la
// condición corporal cambia el peso objetivo un 10 %, y de ahí salen las
// kcal. En una ficha clínica eso no vale.

export const BCS_NEUTRO = 5;          // el ideal: ni sobra ni falta
export const BCS_MINIMO = 1;
export const BCS_MAXIMO = 9;
// Cada punto por encima del ideal es aproximadamente un 10 % de peso de
// más. Es el mismo número que usa el motor en `verificar.peso_objetivo_
// desde_bcs`, y el mismo que ya usaba la app para los cinco escalones.
export const PCT_POR_PUNTO_BCS = 0.10;
// Un perro por debajo del ideal no se "sube" sin freno: el tope existe
// desde antes del BCS y se conserva tal cual para no cambiar en silencio el
// objetivo de las fichas que ya están guardadas.
export const TOPE_SUBIDA = 1.20;

// Los descriptores son los de la escala de 9 puntos (WSAVA/Laflamme), en
// palabras de consulta: lo que se palpa, lo que se ve desde arriba y lo que
// se ve de perfil. Sin adjetivos cariñosos: esta pantalla la lee un
// profesional.
export const ESCALA_BCS = [
  { n: 1, titulo: "Caquéctico",
    detalle: "Costillas, lumbares y pelvis visibles a distancia. Sin grasa palpable. Pérdida evidente de masa muscular." },
  { n: 2, titulo: "Muy delgado",
    detalle: "Costillas visibles sin grasa palpable. Prominencias óseas marcadas. Pérdida leve de masa muscular." },
  { n: 3, titulo: "Delgado",
    detalle: "Costillas palpables y visibles sin grasa que las cubra. Lumbares visibles. Cintura muy marcada." },
  { n: 4, titulo: "Por debajo del ideal",
    detalle: "Costillas palpables con mínima grasa. Cintura evidente desde arriba y retracción abdominal marcada." },
  { n: 5, titulo: "Ideal",
    detalle: "Costillas palpables sin exceso de grasa. Cintura visible desde arriba. Abdomen retraído de perfil." },
  { n: 6, titulo: "Por encima del ideal",
    detalle: "Costillas palpables con ligero exceso de grasa. Cintura apreciable pero no marcada." },
  { n: 7, titulo: "Sobrepeso",
    detalle: "Costillas difíciles de palpar, cubiertas de grasa. Depósitos en lumbares y base de la cola. Cintura ausente o apenas visible." },
  { n: 8, titulo: "Obeso",
    detalle: "Costillas no palpables salvo con presión firme. Depósitos marcados en lumbares y base de la cola. Distensión abdominal." },
  { n: 9, titulo: "Obeso mórbido",
    detalle: "Depósitos masivos en tórax, columna y base de la cola. Sin cintura. Distensión abdominal evidente." },
];

// Los cinco escalones del dueño, en BCS. No es una tabla nueva: es la que
// ya vivía en App.jsx, traída aquí para que la conversión exista una sola
// vez en los dos sentidos.
export const BCS_DESDE_CONDICION = { 0: 2, 1: 4, 2: 5, 3: 7, 4: 9 };

// Y de vuelta: al BCS que ponga el veterinario le corresponde un escalón,
// para que la ficha siga entendiéndose desde el lado del dueño (una ficha
// clínica y una ficha de casa son la misma fila de la base). Se redondea al
// escalón más cercano A PROPÓSITO y sin perder nada: el BCS exacto se
// guarda aparte, y es el que manda para calcular.
export function condicionDesdeBcs(bcs) {
  const b = Number(bcs);
  if (!Number.isFinite(b)) return null;
  if (b <= 2) return 0;
  if (b <= 4) return 1;
  if (b === 5) return 2;
  if (b <= 7) return 3;
  return 4;
}

export function bcsDesdeCondicion(condicionIdx) {
  const v = BCS_DESDE_CONDICION[condicionIdx];
  return v === undefined ? null : v;
}

// EL PESO OBJETIVO, y es LA fórmula: la usan los dos idiomas.
//
// Se DIVIDE, no se resta: el exceso está medido sobre el peso ideal, no
// sobre el actual. Un perro de 30 kg con BCS 7 tiene un 20 % de más sobre su
// ideal, así que su ideal son 30/1,2 = 25, no 30 - 20 % = 24.
export function pesoIdealDesdeBcs(pesoActualKg, bcs) {
  const peso = Number(pesoActualKg);
  // ⚠️ `bcs == null` ANTES DE convertir, y no es purismo: `Number(null)` es
  // 0, que es un número perfectamente finito, así que "no hay BCS" pasaba
  // por "BCS 0" y devolvía un objetivo -- un 66 % por encima del peso de
  // hoy, topado en +20 %. Un perro sin condición apuntada habría salido
  // como si estuviera esquelético. Lo cazó la prueba de bcs.spec.js.
  if (bcs === null || bcs === undefined || bcs === "") return null;
  const b = Number(bcs);
  if (!peso || peso <= 0 || !Number.isFinite(b)) return null;
  const desvio = (b - BCS_NEUTRO) * PCT_POR_PUNTO_BCS;
  let ideal = peso / (1 + desvio);
  if (ideal > peso * TOPE_SUBIDA) ideal = peso * TOPE_SUBIDA;
  return Math.round(ideal * 100) / 100;
}

// El BCS que vale para calcular: el que puso el veterinario si lo hay, y si
// no el que sale de los cinco escalones del dueño. Nunca los dos a la vez, y
// nunca uno inventado.
export function bcsVigente(perfil) {
  if (!perfil) return null;
  const b = Number(perfil.bcs);
  if (Number.isFinite(b) && b >= BCS_MINIMO && b <= BCS_MAXIMO) return b;
  return bcsDesdeCondicion(perfil.condicionIdx);
}
