// ─── Todo lo que se deduce de la ficha del perro ───────────────────────────
//
// Etapa, edad, tamaño, peso adulto por curva de crecimiento, peso objetivo
// por condición corporal, y cómo va la dieta. Son las cuentas de las que
// salen los 43 requisitos, así que conviene poder leerlas juntas y no
// repartidas por once sitios de App.jsx.

import { bcsDesdeCondicion, bcsVigente, pesoIdealDesdeBcs } from "./bcs";
import { calcularDER, determinarEtapa } from "./der.js";

// ⚠️ CORREGIDO (5 agosto, madrugada) — CASO REAL MUY GRAVE ENCONTRADO,
// pedido expreso ("hay que comparar según lo que necesita ese perro en
// esa etapa"): "senior" se convertía SIEMPRE en "Adulto" antes de
// mandarlo al servidor, en TODO el sistema (generación de menús Y
// analizador). El backend YA tenía lógica correcta y lista para
// "Senior" en los dos sitios que importan -- el multivitamínico
// específico "V-INTEGRA Senior" en vez del de adulto normal, y la
// proteína mínima más alta que FEDIAF recomienda para perros mayores
// (45 g/1000kcal en vez de 40) -- pero NUNCA se activaba, porque el
// valor "Senior" nunca llegaba de verdad: se perdía aquí mismo, en
// esta conversión. Ningún perro senior de la app había recibido el
// multivitamínico correcto hasta ahora. Ahora se manda "Senior" tal
// cual, dejando que el backend decida -- que es justo para lo que ya
// estaba preparado.
export const ETAPA_A_SUFIJO_API = {
  cachorro_joven: "CachorroJoven",
  cachorro_crecimiento: "CachorroCrecimiento",
  adulto: "Adulto",
  senior: "Senior",
};

export const CONDICIONES = [
  // ⚠️ CAMBIADO (5 agosto, madrugada) — pedido expreso, tras varias
  // rondas descartando alternativas (rellenito de amor, entrado en
  // carnes): nombres cariñosos, simétricos con el patrón "muy X / X"
  // que ya usan los dos primeros niveles.
  { label: "Muy flaquito", detalle: "Costillas muy marcadas, sin nada de grasa" },
  { label: "Flaquito", detalle: "Costillas se notan fácil al tacto" },
  { label: "Ideal", detalle: "Costillas se palpan, cintura visible desde arriba" },
  { label: "Rellenito", detalle: "Cuesta notar las costillas, poca cintura" },
  { label: "Muy gordete", detalle: "No se notan las costillas, sin cintura" },
];

export function especiesExcluidasDePerfil(perfil) {
  const especies = new Set();
  [...(perfil.alergias || []), ...(perfil.otrosEvitar || [])].forEach((item) => {
    if (item.alimento && item.alimento.startsWith("Todo: ")) {
      especies.add(item.alimento.replace("Todo: ", ""));
    }
  });
  return especies;
}

export function alimentosEvitadosDePerfil(perfil) {
  const nombres = new Set();
  [...(perfil?.alergias || []), ...(perfil?.otrosEvitar || [])].forEach((item) => {
    if (item.alimento && !item.alimento.startsWith("Todo: ")) nombres.add(item.alimento);
  });
  return nombres;
}

// ⚠️ AÑADIDO (5 agosto, madrugada): extraído de respuestaApiAMenu para
// poder reutilizar el MISMO reparto de días en el aviso semanal de
// tiaminasa -- una sola fuente de verdad, no dos copias que puedan
// desincronizarse.
export function repartirDiasSemana(n) {
  const base = Math.floor(7 / n);
  const resto = 7 % n;
  return Array.from({ length: n }, (_, i) => base + (i < resto ? 1 : 0));
}

export function calcularEdad(dia, mesIdx, anio) {
  const nacimiento = new Date(anio, mesIdx, dia);
  const hoy = new Date();
  if (nacimiento > hoy) return null;
  let meses = (hoy.getFullYear() - nacimiento.getFullYear()) * 12 + (hoy.getMonth() - nacimiento.getMonth());
  let dias = hoy.getDate() - nacimiento.getDate();
  if (dias < 0) {
    meses -= 1;
    const mesAnterior = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
    dias += mesAnterior.getDate();
  }
  return { anios: Math.floor(meses / 12), meses: meses % 12, dias, totalMeses: Math.floor(meses / 12) * 12 + (meses % 12) };
}

export const PESO_ADULTO_POR_TAMANO = { Toy: 3, Mini: 6, "Pequeño": 12, Mediano: 22, Grande: 32, Gigante: 55 };

// ⚠️ AÑADIDO (5 agosto, noche) — FALLO GRAVE ENCONTRADO: el peso adulto
// esperado de un cachorro se calculaba SIEMPRE con la media fija de su
// raza (perfil.raza?.pesoMedio), nunca con la curva de crecimiento real
// del propio cachorro (edad + peso actual) -- aunque esa lógica YA
// estaba implementada, correcta, en el servidor (der.py), nunca se
// replicó aquí ni se llamaba al servidor para usarla. Caso real: Cairo
// con 5 meses y 18kg apunta a 34kg de adulto según su propia curva, no
// a los 26kg de la media de su raza -- 192 kcal/día de diferencia,
// confirmado. Esto es la MISMA tabla y misma lógica que CURVA_CRECIMIENTO
// y peso_adulto_desde_curva() en der.py, letra por letra.
export const CURVA_CRECIMIENTO = {
  2: [0.35, 0.30, 0.25, 0.20, 0.15],
  3: [0.50, 0.45, 0.40, 0.32, 0.25],
  4: [0.65, 0.58, 0.52, 0.44, 0.35],
  5: [0.75, 0.68, 0.60, 0.50, 0.40],
  6: [0.80, 0.75, 0.65, 0.55, 0.45],
  7: [0.85, 0.80, 0.72, 0.62, 0.52],
  8: [0.90, 0.85, 0.78, 0.68, 0.58],
  9: [0.94, 0.90, 0.84, 0.74, 0.64],
  10: [0.97, 0.93, 0.88, 0.80, 0.70],
  11: [0.99, 0.96, 0.92, 0.85, 0.75],
  12: [1.00, 0.98, 0.95, 0.89, 0.80],
  15: [1.00, 1.00, 0.99, 0.95, 0.88],
  18: [1.00, 1.00, 1.00, 0.99, 0.94],
  24: [1.00, 1.00, 1.00, 1.00, 1.00],
};

export function columnaTamano(pesoAdultoEstimado) {
  if (pesoAdultoEstimado < 5) return 0;
  if (pesoAdultoEstimado < 10) return 1;
  if (pesoAdultoEstimado < 25) return 2;
  if (pesoAdultoEstimado < 45) return 3;
  return 4;
}

export function pesoAdultoDesdeCurva(pesoActualKg, meses, pesoMedioRaza, pesoMinRaza, pesoMaxRaza) {
  if (!pesoActualKg || pesoActualKg <= 0 || !meses) return pesoMedioRaza;
  if (meses >= 24) return pesoActualKg; // ya es adulto

  const edades = Object.keys(CURVA_CRECIMIENTO).map(Number).sort((a, b) => a - b);
  let estimado = pesoMedioRaza || pesoActualKg * 2;

  for (let i = 0; i < 4; i++) {
    const col = columnaTamano(estimado);
    const antes = Math.max(...edades.filter((e) => e <= meses), edades[0]);
    const despues = Math.min(...edades.filter((e) => e >= meses), edades[edades.length - 1]);
    const p1 = CURVA_CRECIMIENTO[antes][col];
    const p2 = CURVA_CRECIMIENTO[despues][col];
    const pct = despues === antes ? p1 : p1 + (p2 - p1) * (meses - antes) / (despues - antes);
    if (pct <= 0) return estimado;
    const nuevo = pesoActualKg / pct;
    if (Math.abs(nuevo - estimado) < 0.2) { estimado = nuevo; break; }
    estimado = nuevo;
  }
  if (pesoMinRaza) estimado = Math.max(estimado, pesoMinRaza);
  if (pesoMaxRaza) estimado = Math.min(estimado, pesoMaxRaza);
  return Math.round(estimado * 10) / 10;
}

// ⚠️ LA FÓRMULA SE FUE A `bcs.js` (29 agosto), entera y sin cambiarla. Los
// cinco escalones del dueño y el BCS de 9 puntos del veterinario son la
// misma cosa preguntada de dos maneras, y si cada pantalla calculara su peso
// objetivo por su cuenta, el mismo perro tendría dos objetivos -- y de ahí
// salen las kcal. Aquí solo queda la puerta de los cinco escalones.
export function pesoIdealDesdeCondicion(pesoActualKg, condicionIdx) {
  return pesoIdealDesdeBcs(pesoActualKg, bcsDesdeCondicion(condicionIdx));
}

// ─── QUÉ PESO OBJETIVO SE USA HOY ────────────────────────────────────────────
//
// ⚠️ CASO REAL ENCONTRADO (25 agosto): "cree el primer menú poniendo que
// pesaba 7 kg y que está rellenita, y luego actualicé el peso a 6.2 pero
// sigue quedándose en rellenito, entonces sigue metiendo menos kcal".
//
// Tenía razón, y el fallo era peor que el olvido de actualizar la
// condición. `pesoIdealDesdeCondicion` divide el peso de HOY, así que el
// objetivo bajaba con el perro y el ratio quedaba clavado en 1,20 pesara lo
// que pesara. Medido con Lola: 7,0 kg -> 263 kcal, 6,5 -> 249 (la cifra que
// ella vio en pantalla), 6,2 -> 240, 5,9 -> 231. Adelgazaba y le dábamos
// menos comida, para siempre: la dieta no podía terminar nunca. Y al revés
// igual -- un perro «Flaquito» está siempre exactamente en 0,90, así que
// engorde lo que engorde sigue en régimen de subida.
//
// Ahora el objetivo se fija EN KILOS cuando se marca la condición, y deja
// de moverse. Pero un objetivo guardado puede quedarse viejo, y uno viejo
// es más peligroso que no tener ninguno:
//
//   · UN CACHORRO. Un labrador marcado a los 5 kg guardaría objetivo 5. De
//     adulto con 30 kg, el ratio sería 6 y le pondríamos una dieta de
//     hambre de por vida. Por eso en crecimiento NO se usa objetivo
//     ninguno, igual que hace calcularDER, y se estrena al llegar a
//     adulto.
//   · UNO ABANDONADO. Una ficha que lleva un año sin tocarse puede tener
//     un objetivo que ya no se parece en nada al perro. Si el ratio se sale
//     de una banda razonable, se descarta y se recalcula -- y la pantalla
//     de Evolución pide confirmarlo.
//
// Devuelve { kg, esViejo, esCalculadoAlVuelo } para que la pantalla pueda
// decir de dónde sale el número en vez de enseñarlo a secas.
export const RATIO_MINIMO_CREIBLE = 0.55;

export const RATIO_MAXIMO_CREIBLE = 1.60;

export function objetivoVigente(perfil, etapa) {
  const peso = Number(perfil?.pesoActual);
  if (!(peso > 0)) return { kg: null, esViejo: false, esCalculadoAlVuelo: false };

  // En crecimiento el peso cambia por definición: no hay objetivo que fijar.
  if (etapa === "cachorro_joven" || etapa === "cachorro_crecimiento") {
    return { kg: null, esViejo: false, esCalculadoAlVuelo: false };
  }

  const guardado = Number(perfil?.pesoObjetivoKg);
  if (guardado > 0) {
    const ratio = peso / guardado;
    if (ratio >= RATIO_MINIMO_CREIBLE && ratio <= RATIO_MAXIMO_CREIBLE) {
      return { kg: guardado, esViejo: false, esCalculadoAlVuelo: false };
    }
    // Se sale de la banda: el objetivo es de otra época del perro.
    return {
      kg: pesoIdealDesdeBcs(peso, bcsVigente(perfil)),
      esViejo: true,
      esCalculadoAlVuelo: true,
    };
  }

  // Nunca se ha fijado (fichas de antes del 25 de agosto).
  return {
    kg: pesoIdealDesdeBcs(peso, bcsVigente(perfil)),
    esViejo: false,
    esCalculadoAlVuelo: true,
  };
}

// Cuánto le falta para llegar, y si conviene avisar. El aviso salta ANTES
// de cruzar el umbral de 1,10, no después: al cruzarlo la ración pega un
// salto grande (de dieta de bajada a mantenimiento), y lo que toca en ese
// momento es volver a mirar al perro, no que le cambie la comida sin más.
export const UMBRAL_FIN_DE_DIETA = 1.10;

export const UMBRAL_AVISO_CERCA = 1.15;

export function comoVaLaDieta(perfil, etapa) {
  const { kg } = objetivoVigente(perfil, etapa);
  const peso = Number(perfil?.pesoActual);
  if (!(kg > 0) || !(peso > 0)) return null;
  const ratio = peso / kg;
  return {
    objetivoKg: kg,
    ratio,
    enBajada: ratio >= UMBRAL_FIN_DE_DIETA,
    cerca: ratio >= UMBRAL_FIN_DE_DIETA && ratio < UMBRAL_AVISO_CERCA,
  };
}

export const ETAPA_LABEL = {
  cachorro_joven: "Cachorro muy joven",
  cachorro_crecimiento: "Cachorro en crecimiento",
  adulto: "Adulto",
  senior: "Senior",
};

export function datosDeUnPerro(perfil) {
  const edad = calcularEdad(perfil.dia, perfil.mesIdx, perfil.anio);
  const especiesExcluidas = especiesExcluidasDePerfil(perfil);
  const alimentosEvitados = alimentosEvitadosDePerfil(perfil);

  // ⚠️ CORREGIDO (5 agosto, noche): antes esto era directamente la media
  // de la raza, sin ajustar nunca por la curva de crecimiento real del
  // cachorro. Ahora, si hay edad y peso actual, se usa su propia
  // trayectoria (igual que ya hacía der.py en el servidor) -- la media
  // de la raza queda solo como último recurso, cuando faltan datos.
  const pesoAdultoMedioRaza = perfil.raza?.pesoMedio || PESO_ADULTO_POR_TAMANO[perfil.tamanoManual] || 25;
  const pesoAdultoEsperado = pesoAdultoDesdeCurva(
    Number(perfil.pesoActual), edad?.totalMeses, pesoAdultoMedioRaza,
    perfil.raza?.pesoMin, perfil.raza?.pesoMax
  ) || pesoAdultoMedioRaza;
  const etapaCalculada = determinarEtapa(edad, pesoAdultoEsperado);
  // ⚠️ `objetivoVigente` y no `pesoIdealDesdeCondicion` (25 agosto): el
  // objetivo se fija en kilos al marcar la condición y deja de moverse. Ver
  // el comentario largo de esa función -- antes bajaba con el perro y la
  // dieta no podía terminar nunca. Este es el ÚNICO sitio donde se calcula
  // el DER de un perro, así que con cambiarlo aquí cambia en toda la app.
  const objetivo = objetivoVigente(perfil, etapaCalculada);
  const derReal = calcularDER(Number(perfil.pesoActual), etapaCalculada, perfil.actividadIdx,
      perfil.esterilizado, {
        pesoAdultoKg: pesoAdultoEsperado,
        pesoIdealKg: objetivo.kg,
        raza: perfil.raza?.nombre,
        machoEntero: perfil.sexo === "macho" && perfil.esterilizado !== "si",
      });

  return {
    edad, especiesExcluidas, alimentosEvitados, pesoAdultoEsperado,
    etapaCalculada, etapaLabel: ETAPA_LABEL[etapaCalculada] || "Adulto", derReal,
    objetivo, dieta: comoVaLaDieta(perfil, etapaCalculada),
  };
}
