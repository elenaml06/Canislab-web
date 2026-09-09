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
  // El 9 no sale de la recta: FEDIAF dice «>45 %» (Tabla VII-2) y el 10 % por
  // punto daría 40, o sea 21,43. Ver el test de la tabla, más abajo.
  expect(pesoIdealDesdeBcs(30, 9)).toBe(20.69);
});

test("la tabla VII-2 de FEDIAF, fila a fila", () => {
  // ⚠️ ESTO ES LO QUE CONVIERTE EL 10 % POR PUNTO EN UN NÚMERO CON FUENTE.
  // La columna «% BW below or above BCS 5» del Anexo 7.1 de FEDIAF da un RANGO
  // por punto, y el 10 % lineal es exactamente el extremo BAJO de cada uno --
  // el más conservador, el que menos corrige-- en ocho puntos de nueve. El 9 es
  // el único que no cuadra: FEDIAF dice «>45 %» y la recta da 40.
  //
  // Es el mismo test que el BLOQUE 63 de la batería de la API, y está aquí
  // porque esta es la copia que MANDA: el DER que se envía en `der_objetivo`
  // sale de aquí, no de `der.py`.
  const TABLA = [
    [1, -0.40, "-≥40 %",     "1. Emaciated -- se aplica el 40, donde empieza el «≥»"],
    [2, -0.30, "-30 a 40 %", "2. Very Thin -- extremo bajo del rango"],
    [3, -0.20, "-20 a 30 %", "3. Thin -- extremo bajo"],
    [4, -0.10, "-10 a 15 %", "4. Slightly underweight -- extremo bajo"],
    [5,  0.00, "0 %",        "5. Ideal"],
    [6, +0.10, "+10 a 15 %", "6. Slightly overweight -- extremo bajo"],
    [7, +0.20, "+20 a 30 %", "7. Overweight -- extremo bajo"],
    [8, +0.30, "+30 a 45 %", "8. Obese -- extremo bajo"],
    [9, +0.45, ">45 %",      "9. Grossly Obese -- LA RECTA SE QUEDA CORTA: daría 40"],
  ];
  const PESO = 20;
  for (const [bcs, desvio, rango, cita] of TABLA) {
    // Hacia arriba la corrección va topada al 20 %, que es criterio nuestro y
    // no de FEDIAF: un perro muy delgado suele estarlo por una enfermedad.
    let esperado = PESO / (1 + desvio);
    if (esperado > PESO * 1.20) esperado = PESO * 1.20;
    expect(pesoIdealDesdeBcs(PESO, bcs),
           `BCS ${bcs} (FEDIAF Tabla VII-2: «${rango}», ${cita})`)
      .toBeCloseTo(esperado, 2);
  }
});

test("y si el BCS 9 volviera a la recta, se vería", () => {
  // Con el fallo puesto: 20/1,40 = 14,29 contra 20/1,45 = 13,79. Medio kilo
  // más de peso objetivo, o sea más kcal justo para el perro que peor lo lleva.
  expect(pesoIdealDesdeBcs(20, 9)).not.toBeCloseTo(20 / 1.40, 2);
  expect(pesoIdealDesdeBcs(20, 9)).toBeCloseTo(20 / 1.45, 2);
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
  // ⚠️ CUATRO DE LOS CINCO. El quinto -- «Obeso», que es un BCS 9 -- SÍ cambió
  // el 9 de septiembre de 2026, y con motivo: el 40 % de la recta no estaba en
  // ninguna fuente y el 45 % es la fila «9. Grossly Obese» de la Tabla VII-2 de
  // FEDIAF. Se cambió en las tres copias el mismo día. El aviso de arriba sigue
  // valiendo para todo lo demás: no se toca esta escala sin una fuente.
  for (const peso of [1.5, 6, 17.4, 25, 40, 62.3]) {
    for (const idx of [0, 1, 2, 3]) {
      expect(pesoIdealDesdeBcs(peso, bcsDesdeCondicion(idx)),
             `peso ${peso}, escalón ${idx}`).toBe(VIEJA(peso, idx));
    }
    // Y el quinto, con el número nuevo y explicado.
    const conFuente = Math.round((peso / 1.45) * 100) / 100;
    expect(pesoIdealDesdeBcs(peso, bcsDesdeCondicion(4)),
           `peso ${peso}, escalón «Obeso»`).toBe(conFuente);
    expect(pesoIdealDesdeBcs(peso, 9)).toBeLessThan(VIEJA(peso, 4) + 1e-9);
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
