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
    // ⚠️ 11-sep-2026: EL DESVÍO DE LA TABLA SIGUE MIDIÉNDOSE CONTRA EL BCS 5
    // --lo dice su propia cabecera, «% BW below or above BCS 5»-- pero el
    // DESTINO ya no es siempre el 5. FEDIAF dice dos veces que el ideal es una
    // BANDA, 4 a 5 (§7.1.3 y §7.2.4.1, las dos sobre Kealy 2002), así que:
    //   · dentro de la banda no se corrige nada,
    //   · y por debajo el objetivo es el borde más cercano, que es el BCS 4.
    let esperado;
    if (bcs >= 4 && bcs <= 5) {
      esperado = PESO;                       // ya está en la banda ideal
    } else {
      const pesoEnBcs5 = PESO / (1 + desvio);
      esperado = pesoEnBcs5 * (bcs < 4 ? 0.90 : 1.0);
      // Hacia arriba la corrección va topada al 20 %, que es criterio nuestro y
      // no de FEDIAF: un perro muy delgado suele estarlo por una enfermedad.
      if (esperado > PESO * 1.20) esperado = PESO * 1.20;
    }
    expect(pesoIdealDesdeBcs(PESO, bcs),
           `BCS ${bcs} (FEDIAF Tabla VII-2: «${rango}», ${cita})`)
      .toBeCloseTo(esperado, 2);
  }
});

test("el ideal de FEDIAF es una BANDA, 4 a 5, y no un punto", () => {
  // ⚠️ CASO REAL: hasta el 11 de septiembre de 2026 el 5 era el único ideal, así
  // que a un perro en BCS 4 se le SUBÍA el peso objetivo un 11 % y con él las
  // kcal. FEDIAF lo dice dos veces y en dos sitios distintos de la guía:
  //   §7.1.3   «The ideal BCS should therefore be between 4/9 and 5/9.»
  //   §7.2.4.1 «dogs should be fed to maintain a body condition score (BCS)
  //             between 4 and 5 on the 9-point BCS.»
  // Las dos sobre Kealy RD et al. (2002), catorce años de labradores en los que
  // la restricción alargó la vida, con los perros restringidos en 4/9 a 5/9.
  for (const peso of [1.5, 6, 17.4, 25, 40, 62.3]) {
    expect(pesoIdealDesdeBcs(peso, 4),
      "un perro en BCS 4 ya está en la banda ideal: no se le engorda"
    ).toBe(Math.round(peso * 100) / 100);
    expect(pesoIdealDesdeBcs(peso, 5)).toBe(Math.round(peso * 100) / 100);
    // Y por debajo, el objetivo es el BCS 4, no el 5: es el borde de la banda
    // que le queda más cerca y es el lado prudente.
    expect(pesoIdealDesdeBcs(peso, 3),
      "un perro en BCS 3 apunta al BCS 4 (x1,125), no al BCS 5 (x1,25)"
    ).toBeCloseTo(peso * 1.125, 2);
  }
  // Con el fallo puesto (volver a tomar el 5 como único ideal) el BCS 4 daría
  // un 11 % más y el BCS 3 se iría al tope del 20 %.
  expect(pesoIdealDesdeBcs(20, 4)).not.toBeCloseTo(20 / 0.9, 2);
  expect(pesoIdealDesdeBcs(20, 3)).not.toBeCloseTo(20 * 1.20, 2);
});

test("y si el BCS 9 volviera a la recta, se vería", () => {
  // Con el fallo puesto: 20/1,40 = 14,29 contra 20/1,45 = 13,79. Medio kilo
  // más de peso objetivo, o sea más kcal justo para el perro que peor lo lleva.
  expect(pesoIdealDesdeBcs(20, 9)).not.toBeCloseTo(20 / 1.40, 2);
  expect(pesoIdealDesdeBcs(20, 9)).toBeCloseTo(20 / 1.45, 2);
});

test("la escala del dueño es la correspondencia que publica FEDIAF, y solo movió un escalón", () => {
  // ⚠️ ESTA ES LA IMPORTANTE, y su motivo no ha cambiado: hay fichas guardadas
  // con la escala del dueño, y si esa escala cambia lo que da, cambian de ración
  // perros a los que nadie ha tocado la ficha. Así que cada vez que se mueva hay
  // que decir CUÁNTO se mueve y por qué.
  //
  // El 9 de septiembre de 2026 se movió, y con fuente: las Tablas VII-1 y VII-2
  // de FEDIAF traen una columna 2 de CINCO PUNTOS al lado de la de nueve, y su
  // correspondencia es 1-3-5-7-9. La nuestra era 2-4-5-7-9, criterio propio.
  //
  // MEDIDO, y es menos de lo que parece, porque nuestro tope de subida del 20 %
  // absorbe casi todo:
  //   escalón 0: BCS 2 (−30 % → x1,43) y BCS 1 (−40 % → x1,67) se topan LOS DOS
  //              en x1,20. No cambia nada.
  //   escalón 1: BCS 4 daba x1,111 y BCS 3 da x1,25, que se topa en x1,20.
  //              Es el único que se mueve: +8 % de ración para un perro delgado.
  //   escalones 2, 3 y 4: la correspondencia ya coincidía.
  //
  // ⚠️ Y EL 11 DE SEPTIEMBRE SE MOVIÓ OTRA VEZ, EL MISMO ESCALÓN Y HACIA ABAJO.
  // El ideal de FEDIAF es una BANDA (4 a 5), así que un perro por debajo apunta
  // al BCS 4 y no al 5. El escalón «Delgado» es un BCS 3: pasa de x1,25 topado
  // en x1,20 a x1,125, que ya no toca el tope. MEDIDO: −6,25 % de peso objetivo,
  // y con él menos kcal, que es el lado prudente y el que dice Kealy 2002.
  // Los otros cuatro escalones NO se mueven: el 0 (BCS 1) sigue topado en x1,20,
  // y el 2, el 3 y el 4 (BCS 5, 7 y 9) están dentro o por encima de la banda.
  const VIEJA_BCS = { 0: 2, 1: 4, 2: 5, 3: 7, 4: 9 };
  const objetivo = (peso, bcs) => {
    const desvio = bcs >= 9 ? 0.45 : (bcs - 5) * 0.10;
    let ideal = peso / (1 + desvio);
    if (ideal > peso * 1.20) ideal = peso * 1.20;
    return Math.round(ideal * 100) / 100;
  };
  for (const peso of [1.5, 6, 17.4, 25, 40, 62.3]) {
    // Los cuatro que NO se movieron dan exactamente lo mismo que antes.
    for (const idx of [0, 2, 3, 4]) {
      expect(pesoIdealDesdeBcs(peso, bcsDesdeCondicion(idx)),
             `peso ${peso}, escalón ${idx}: no debería haberse movido`)
        .toBe(objetivo(peso, VIEJA_BCS[idx]));
    }
    // Y el que sí, con su cuenta de hoy: BCS 3 apuntando al BCS 4 es x1,125.
    expect(pesoIdealDesdeBcs(peso, bcsDesdeCondicion(1)),
           `peso ${peso}, escalón «delgado»`).toBeCloseTo(peso * 1.125, 2);
    // Y que se haya movido HACIA ABAJO respecto al x1,20 del 9 de septiembre,
    // que es lo que hay que poder afirmar: el cambio da menos kcal, no más.
    expect(pesoIdealDesdeBcs(peso, bcsDesdeCondicion(1)))
      .toBeLessThan(Math.round(peso * 1.20 * 100) / 100);
  }
});

test("la correspondencia de 5 a 9 puntos es la de FEDIAF, no una nuestra", () => {
  // Tablas VII-1 y VII-2, columna 2. Si alguien la devuelve a 2-4-5-7-9, esto
  // se cae: era criterio propio y menos severo en los dos escalones de perro
  // delgado.
  expect(bcsDesdeCondicion(0)).toBe(1);
  expect(bcsDesdeCondicion(1)).toBe(3);
  expect(bcsDesdeCondicion(2)).toBe(5);
  expect(bcsDesdeCondicion(3)).toBe(7);
  expect(bcsDesdeCondicion(4)).toBe(9);
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
  expect(bcsVigente({ condicionIdx: 0 })).toBe(1);   // FEDIAF: el escalón 0 es un BCS 1
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

// ⚠️ LA SALVEDAD DEL EXTREMO BAJO, QUE ES DE FEDIAF (9 de septiembre de 2026).
//
// El BCS 9 llevaba desde siempre su salvedad ("la escala se satura"). La del
// extremo bajo no existía, y FEDIAF la escribe en su §7.1.3: «scores at the
// lower end of the BCS are confounded by muscle atrophy». Es el mismo tipo de
// aviso y faltaba la mitad.
//
// Se prueba a través de `salvedadDelBcs` y no del texto pintado a propósito: el
// motivo de que esa función exista es que la salvedad se escribía a mano en las
// DOS pantallas que pintan el peso objetivo, y dos copias de un texto acaban
// diciendo cosas distintas.
test('la parte baja de la escala avisa de que el BCS se confunde con la atrofia muscular', async () => {
  const { salvedadDelBcs, BCS_CONFUNDIDO_POR_ATROFIA_HASTA } = await import('../src/bcs.js');
  for (let b = 1; b <= BCS_CONFUNDIDO_POR_ATROFIA_HASTA; b++) {
    const s = salvedadDelBcs(b);
    expect(s, `BCS ${b} tiene que llevar salvedad`).toBeTruthy();
    expect(s).toContain('músculo');
  }
  // Y en el medio de la escala no sobra ningún aviso: un BCS 4-5 es el ideal
  // que recomienda FEDIAF, y avisar ahí sería ruido.
  for (const b of [4, 5, 6, 7, 8]) {
    expect(salvedadDelBcs(b), `BCS ${b} no tiene que llevar salvedad`).toBeNull();
  }
  // El 9 conserva la suya, que es otra y dice otra cosa.
  expect(salvedadDelBcs(9)).toContain('satura');
  // Sin BCS no hay salvedad que dar.
  expect(salvedadDelBcs(null)).toBeNull();
  expect(salvedadDelBcs(undefined)).toBeNull();
});
