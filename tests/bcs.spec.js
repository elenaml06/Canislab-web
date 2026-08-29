// ─── LA CONDICIÓN CORPORAL: UNA FÓRMULA, DOS IDIOMAS ─────────────────────────
//
// Lo que vigila esto no es "que la cuenta salga bien": es que el mismo perro
// no acabe con DOS pesos objetivo según quién abra su ficha. De ese peso
// salen las kcal, así que dos objetivos son dos raciones distintas para el
// mismo animal, sin que nada dé un error.
//
// Y hay una segunda cosa, más callada: la escala de 5 escalones del dueño
// existía antes que el BCS, y hay fichas guardadas con ella. Si al meter el
// BCS cambiara aunque fuera un decimal de lo que da la escala vieja, todos
// esos perros cambiarían de ración sin que nadie tocara nada.
import { test, expect } from "@playwright/test";
import {
  ESCALA_BCS, BCS_NEUTRO, pesoIdealDesdeBcs, bcsDesdeCondicion,
  condicionDesdeBcs, bcsVigente,
} from "../src/bcs.js";

test("la escala es la de 9 puntos, entera y en orden", () => {
  expect(ESCALA_BCS.map((b) => b.n)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  // Cada punto con su descripción: un número suelto no se puede observar.
  for (const fila of ESCALA_BCS) {
    expect(fila.titulo.length).toBeGreaterThan(0);
    expect(fila.detalle.length).toBeGreaterThan(20);
  }
  expect(ESCALA_BCS[BCS_NEUTRO - 1].titulo).toBe("Ideal");
});

test("el peso objetivo se DIVIDE, no se resta", () => {
  // Un perro de 30 kg con BCS 7 tiene un 20 % de más SOBRE SU IDEAL, así que
  // su ideal son 30/1,2 = 25 kg. Restarle el 20 % daría 24, y ese error del
  // 4 % se arrastra hasta las kcal de todos los días.
  expect(pesoIdealDesdeBcs(30, 7)).toBe(25);
  expect(pesoIdealDesdeBcs(30, 5)).toBe(30);
  expect(pesoIdealDesdeBcs(30, 9)).toBe(21.43);
});

test("y es EXACTAMENTE el mismo número que daban los cinco escalones", () => {
  // ⚠️ ESTA ES LA IMPORTANTE. Hay fichas guardadas con la escala del dueño.
  // Si el BCS cambiara lo que da esa escala, cambiarían de ración perros a
  // los que nadie ha tocado la ficha. La escala vieja ES la nueva en cinco
  // puntos: 2, 4, 5, 7 y 9.
  const VIEJA = (peso, idx) => {
    const bcs = { 0: 2, 1: 4, 2: 5, 3: 7, 4: 9 }[idx];
    const desvio = (bcs - 5) * 0.10;
    let ideal = peso / (1 + desvio);
    if (ideal > peso * 1.20) ideal = peso * 1.20;
    return Math.round(ideal * 100) / 100;
  };
  for (const peso of [1.5, 6, 17.4, 25, 40, 62.3]) {
    for (const idx of [0, 1, 2, 3, 4]) {
      expect(pesoIdealDesdeBcs(peso, bcsDesdeCondicion(idx)),
             `peso ${peso}, escalón ${idx}`).toBe(VIEJA(peso, idx));
    }
  }
});

test("un BCS 6 no cabe en los cinco escalones, y por eso se guarda aparte", () => {
  // El redondeo se hace igualmente para que la ficha se entienda desde el
  // lado del dueño, pero NO es lo que se usa para calcular.
  expect(condicionDesdeBcs(6)).toBe(3);              // "Rellenito"
  expect(bcsDesdeCondicion(3)).toBe(7);              // y ese escalón es un 7
  // O sea que redondear cuesta esto, en un perro de 30 kg:
  expect(pesoIdealDesdeBcs(30, 6)).toBe(27.27);
  expect(pesoIdealDesdeBcs(30, 7)).toBe(25);         // 2,3 kg de diferencia
});

test("manda el BCS cuando lo hay, y el escalón cuando no", () => {
  expect(bcsVigente({ bcs: 6, condicionIdx: 2 })).toBe(6);
  expect(bcsVigente({ bcs: null, condicionIdx: 3 })).toBe(7);
  expect(bcsVigente({ condicionIdx: 0 })).toBe(2);
  // Y nunca uno inventado: un valor imposible se ignora y manda el escalón.
  expect(bcsVigente({ bcs: 0, condicionIdx: 2 })).toBe(5);
  expect(bcsVigente({ bcs: 12, condicionIdx: 2 })).toBe(5);
  expect(bcsVigente({ bcs: "seis", condicionIdx: 2 })).toBe(5);
  expect(bcsVigente(null)).toBe(null);
});

test("sin peso no hay objetivo que estimar", () => {
  expect(pesoIdealDesdeBcs(0, 7)).toBe(null);
  expect(pesoIdealDesdeBcs(null, 7)).toBe(null);
  expect(pesoIdealDesdeBcs(20, null)).toBe(null);
});
