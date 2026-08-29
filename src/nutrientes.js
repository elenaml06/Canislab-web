// ─── LOS NUTRIENTES, AGRUPADOS COMO SE LEEN EN UNA FICHA CLÍNICA ─────────────
//
// Lógica pura, sin React y sin red, como `bcs.js`, `rol.js` y `modo.js`.
//
// El motor devuelve los 41 nutrientes de FEDIAF en tres listas -- los que
// faltan, los que se pasan y los que están dentro --, y esa es la forma
// correcta para decidir si un menú sale. Pero no es la forma en que se lee
// una ficha: un veterinario no quiere "23 correctos y 4 que faltan", quiere
// ver los MINERALES juntos, las VITAMINAS juntas y los AMINOÁCIDOS juntos, y
// dentro de cada grupo qué tal va cada uno.
//
// Aquí solo se reordena. No se decide nada: el estado de cada nutriente
// (falta / se pasa / dentro) viene del motor, que es donde vive `MAPA`. Si
// esto calculara por su cuenta si algo falta, sería el fallo del DER
// calculado en dos sitios -- la pantalla diciendo una cosa y el motor otra.
//
// ⚠️ SI EL MOTOR AÑADE UN NUTRIENTE Y AQUÍ NO ESTÁ, no desaparece: cae en
// "Otros" y se ve. Se prefiere un grupo feo a un nutriente escondido, que es
// justo lo que pasaría con un filtro por lista blanca.

export const GRUPOS = [
  {
    titulo: "Macronutrientes",
    nutrientes: ["Proteína_total", "Grasa_total"],
  },
  {
    titulo: "Minerales",
    nutrientes: ["Calcio", "Fósforo", "Potasio", "Sodio", "Cloruro", "Magnesio"],
  },
  {
    titulo: "Oligoelementos",
    nutrientes: ["Cobre", "Yodo", "Hierro", "Manganeso", "Selenio", "Zinc"],
  },
  {
    titulo: "Vitaminas liposolubles",
    nutrientes: ["Vitamina_A", "Vitamina_D", "Vitamina_E"],
  },
  {
    titulo: "Vitaminas hidrosolubles",
    nutrientes: ["Tiamina", "Riboflavina", "Acido_pantotenico", "Vitamina_B6",
                 "Vitamina_B12", "Niacina", "Folato", "Colina"],
  },
  {
    titulo: "Ácidos grasos esenciales",
    nutrientes: ["Linoleico", "Linolénico", "Araquidónico", "EPA_DHA_total"],
  },
  {
    titulo: "Aminoácidos esenciales",
    nutrientes: ["Arginina", "Histidina", "Isoleucina", "Leucina", "Lisina",
                 "Metionina", "Metionina_cistina", "Fenilalanina",
                 "Fenilalanina_tirosina", "Treonina", "Triptofano", "Valina"],
  },
];

const GRUPO_DE = (() => {
  const m = new Map();
  for (const g of GRUPOS) for (const n of g.nutrientes) m.set(n, g.titulo);
  return m;
})();

// Cómo se escribe un nutriente en pantalla. Las claves vienen con guiones
// bajos porque son las de la tabla de FEDIAF.
export function nombreLegible(clave) {
  return String(clave || "").replace(/_/g, " ");
}

/**
 * Las tres listas del motor, reordenadas por grupos.
 *
 * Devuelve [{ titulo, filas: [...] }], y cada fila lleva su `estado`
 * ("falta" | "se_pasa" | "dentro") con los números que ya venían del motor.
 * Los grupos vacíos no se devuelven: en una ración a medias, media tabla
 * está vacía y no aporta nada.
 */
export function agruparNutrientes(ficha) {
  if (!ficha) return [];
  const filas = [];
  for (const f of ficha.faltan || []) {
    filas.push({ ...f, estado: "falta" });
  }
  for (const f of ficha.se_pasa || []) {
    filas.push({ ...f, estado: "se_pasa" });
  }
  for (const f of ficha.dentro || []) {
    filas.push({ ...f, estado: "dentro" });
  }
  const porGrupo = new Map();
  for (const fila of filas) {
    const titulo = GRUPO_DE.get(fila.nutriente) || "Otros";
    if (!porGrupo.has(titulo)) porGrupo.set(titulo, []);
    porGrupo.get(titulo).push(fila);
  }
  const orden = [...GRUPOS.map((g) => g.titulo), "Otros"];
  return orden
    .filter((t) => porGrupo.has(t))
    .map((titulo) => ({
      titulo,
      // Dentro del grupo, primero lo que hay que mirar: lo que se pasa,
      // luego lo que falta, y al final lo que está bien.
      filas: porGrupo.get(titulo).sort((a, b) => {
        const peso = { se_pasa: 0, falta: 1, dentro: 2 };
        return peso[a.estado] - peso[b.estado];
      }),
      cuantos: {
        se_pasa: porGrupo.get(titulo).filter((f) => f.estado === "se_pasa").length,
        falta: porGrupo.get(titulo).filter((f) => f.estado === "falta").length,
        dentro: porGrupo.get(titulo).filter((f) => f.estado === "dentro").length,
      },
    }));
}

/** Un resumen de una línea, para la cabecera. */
export function resumenDeLaFicha(ficha) {
  if (!ficha) return { falta: 0, se_pasa: 0, dentro: 0, total: 0 };
  const falta = (ficha.faltan || []).length;
  const se_pasa = (ficha.se_pasa || []).length;
  const dentro = (ficha.dentro || []).length;
  return { falta, se_pasa, dentro, total: falta + se_pasa + dentro };
}
