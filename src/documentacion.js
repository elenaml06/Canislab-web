import { alLlegarAlimentos } from './vocabulario.js';

// ─── LO QUE SE LE CUENTA AL DUEÑO ─────────────────────────────────────────────
//
// Qué es el BARF, qué es la comida cocinada, y para qué es bueno cada alimento.
//
// ⚠️ POR QUÉ EXISTE (18 de septiembre de 2026). Elena: «deberíamos tener una
// parte en la aplicación que sea información sobre los beneficios del BARF y qué
// es el BARF, los beneficios de la comida cocinada y qué es la comida cocinada,
// y luego la información de los alimentos, rollo: esto es la hostia para el
// pelo, esto es la hostia para el hígado. Esto no es para el veterinario, es
// solo para el usuario».
//
// ⚠️ Y NADA DE ESTO SE ESCRIBE AQUÍ, que es la regla 6 en el sitio donde más
// tienta saltársela: son textos, y un texto parece inofensivo de copiar. No lo
// es. «De qué es rico» cada alimento lo DERIVA el motor del catálogo vivo, así
// que una copia en la app seguiría diciendo «el hígado es la hostia para la
// sangre» el día que esa ficha cambie — y se vería perfecta.
//
// Los respaldos de aquí abajo son para cuando Render duerme, y por eso llevan
// SOLO los dos modos: son lo único que se lee antes de que llegue nada del
// motor (la pantalla de generar). Lo de cada alimento no lleva respaldo a
// propósito: sin catálogo no hay alimentos que enseñar.

export const DOCUMENTACION_MODOS_RESPALDO = {
  crudo: {
    titulo: "Qué es el BARF",
    que_es: "Dar de comer comida de verdad, cruda y en crudo: carne, hueso carnoso, víscera, "
      + "hígado, pescado y verdura, en las cantidades que hacen falta para que el día entero "
      + "cuadre.",
    por_que: [],
    a_tener_en_cuenta: [],
  },
  cocinado: {
    titulo: "Qué es la comida cocinada",
    que_es: "La misma idea, pero cocinada en casa: hervida o al vapor, sin sal y sin aceite. No "
      + "lleva hueso, porque cocido se astilla, y los gramos del menú son de comida YA "
      + "cocinada.",
    por_que: [],
    a_tener_en_cuenta: [],
  },
};

// Para qué es bueno cada nutriente. Sin respaldo con contenido: si no ha llegado
// del motor, no se enseña nada — inventarse aquí «el zinc es para la piel»
// sería exactamente la frase que el día de mañana no se puede comprobar.
export const PARA_QUE_ES_BUENO_RESPALDO = {};

export let DOCUMENTACION_MODOS = DOCUMENTACION_MODOS_RESPALDO;
export let PARA_QUE_ES_BUENO = PARA_QUE_ES_BUENO_RESPALDO;

// {alimento: [{nutriente, dueno, veterinario}, ...]} — lo sirve `GET /alimentos`
// dentro de cada alimento, que es donde no se puede desincronizar.
let RICO_EN = {};

alLlegarAlimentos((datos) => {
  const doc = datos?.documentacion;
  if (doc?.modos && Object.keys(doc.modos).length) DOCUMENTACION_MODOS = doc.modos;
  if (doc?.para_que_es_bueno && Object.keys(doc.para_que_es_bueno).length) {
    PARA_QUE_ES_BUENO = doc.para_que_es_bueno;
  }
  const rico = {};
  for (const p of datos?.pantallas || []) {
    for (const lista of Object.values(p.grupos || {})) {
      for (const a of lista) {
        if (Array.isArray(a.rico_en) && a.rico_en.length) rico[a.nombre] = a.rico_en;
      }
    }
  }
  if (Object.keys(rico).length) RICO_EN = rico;
});

/** Qué contar de este modo de preparación. */
export function documentacionDelModo(modo) {
  return DOCUMENTACION_MODOS[String(modo || "crudo").toLowerCase()] || null;
}

/**
 * De qué es rico este alimento, ya en cristiano.
 *
 * Devuelve [] cuando no destaca en nada, y eso es una respuesta: de 232
 * alimentos, 113 no tienen nada que decir. Enseñar algo de todos sería no
 * informar de nada.
 */
export function deQueEsRico(nombre) {
  return RICO_EN[nombre] || [];
}
