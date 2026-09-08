// ─── Las patologías, como las presenta la app ──────────────────────────────
//
// ⚠️ Aquí NO hay ni un tope ni una cifra clínica: los números salen de
// `GET /patologias` (ver `topespatologia.jsx`). Esto es solo cómo se
// agrupan, cómo se llaman en pantalla y qué subtipos ofrece cada familia.

import { MALVA, VIOLETA, fontBody } from "./estilo";

// ⚠️ SINCRONIZADO (7 septiembre) contra `patologias.json` del repo de la
// API, que a esa fecha tiene 40 patologías verificadas contra SACN5 5ª ed.
// + NRC 2006 + FEDIAF (ver VETERINARIOS.md §12-bis y §12-quinquies allí).
// `segura` es el `formulable` del backend -- si un día se desincronizan,
// esta pantalla deja pasar algo que el servidor va a rechazar (o al
// revés, asusta con un aviso que ya no aplica), así que cualquier cambio
// de `formulable` en patologias.json tiene que reflejarse aquí también.
//
// No hay una entrada por cada estadio/subtipo (cardiopatia_b2, renal_
// avanzada, raza_predispuesta_cobre, encefalopatia_hepatica...): esas
// siguen un patrón de FAMILIA (ver `FAMILIAS_PATOLOGIA` más abajo) --
// una sola casilla con una pregunta de subtipo debajo, no una casilla
// por cada variante, que sería ilegible.
export const PATOLOGIAS = [
  { key: "renal", label: "Insuficiencia renal crónica", segura: true },
  { key: "renal_proteinuria", label: "Proteinuria renal (UPC > 0,5)", segura: true },
  { key: "pancreatitis", label: "Pancreatitis", segura: true },
  { key: "oxalato", label: "Cálculos de oxalato cálcico", segura: true },
  // ⚠️ CORREGIDO (7 septiembre) — CONFLACIÓN ENCONTRADA: esta única casilla
  // mandaba SIEMPRE la clave "estruvita" al backend, aunque el perro
  // tuviera cistina o urato -- las tres bloquean igual para el tutor, así
  // que nadie lo notaba, pero un veterinario que formulara para "urato"
  // (restricción de purinas) veía el aviso.profesional de "estruvita"
  // (pH urinario), que es el equivocado. Ahora es la cabeza de una
  // familia con subtipo -- ver `FAMILIAS_PATOLOGIA`.
  { key: "estruvita", label: "Cálculos urinarios (estruvita / oxalato de calcio ya cubierto arriba / urato / cistina)", segura: false,
    aviso: "Estos cálculos dependen del pH de la orina y de analíticas que la app no puede ver. Una dieta mal ajustada aquí puede empeorarlos, así que no generamos menú automático: necesitas una dieta pautada por tu veterinario." },
  { key: "urato", label: "Urolitos de urato", segura: false,
    aviso: "La carga de purinas de una ración cruda está muy por encima de cualquier objetivo seguro para esta condición, y no solo por las vísceras. No generamos menú automático: necesitas una dieta pautada por tu veterinario, a menudo con pienso terapéutico específico." },
  { key: "cistina", label: "Urolitos de cistina", segura: false,
    aviso: "Depende del pH de la orina y de analíticas que la app no puede ver, igual que estruvita -- y el objetivo terapéutico de metionina+cistina está además por debajo del mínimo nutricional de cualquier perro sano. No generamos menú automático: necesitas una dieta pautada por tu veterinario." },
  // ⚠️ CAMBIADO A `segura: false` (25 agosto), con la revisión clínica.
  // La restricción de cobre que hace falta en una hepatopatía por acúmulo
  // (1,2 mg/1000 kcal, Today's Veterinary Practice 2023) está POR DEBAJO
  // del mínimo de cobre que FEDIAF exige a cualquier perro (2,08). O sea
  // que la dieta que trata está por debajo de la que alimenta: no es que
  // el catálogo se quede corto, es que no se puede hacer con comida sin
  // suplementación dirigida.
  //
  // Va aquí y no solo en el servidor porque el aviso tiene que saltar al
  // ELEGIR la patología, no después de recorrer todo el generador para
  // que al final no salga menú. Mismo patrón que estruvita.
  { key: "hepatopatia", label: "Hepatopatía / predisposición al cobre", segura: false,
    aviso: "La restricción de cobre que hace falta en una hepatopatía por acúmulo está POR DEBAJO del mínimo de cobre que necesita cualquier perro para estar sano. No es algo que se pueda resolver eligiendo mejor los alimentos: hace falta supervisión veterinaria con suplementación dirigida, así que no generamos menú automático." },
  { key: "shunt_sin_encefalopatia", label: "Shunt portosistémico hepático", segura: false,
    aviso: "El shunt hace que la sangre porta-hepática se salte el hígado, así que el amoniaco de catabolizar proteína no se depura: la proteína hay que bajarla por debajo del mínimo saludable de FEDIAF, y eso necesita una dieta pautada por tu veterinario." },
  { key: "cardiopatia", label: "Cardiopatía", segura: true },
  { key: "dcm_taurina_respondedora", label: "Miocardiopatía dilatada respondedora a taurina", segura: true },
  { key: "dcm_asociada_a_dieta", label: "Miocardiopatía dilatada asociada a dieta (\"grain-free\")", segura: true },
  { key: "diabetes", label: "Diabetes mellitus", segura: true },
  { key: "hipotiroidismo", label: "Hipotiroidismo", segura: true },
  { key: "hiperlipidemia", label: "Hiperlipidemia (triglicéridos o colesterol altos)", segura: true },
  { key: "obesidad", label: "Obesidad / adelgazamiento dirigido", segura: true },
  { key: "ple_linfangiectasia", label: "Enteropatía pierde-proteínas / linfangiectasia intestinal", segura: true },
  { key: "insuficiencia_pancreatica_exocrina", label: "Insuficiencia pancreática exocrina (EPI)", segura: true },
  { key: "fracaso_renal_agudo", label: "Fracaso renal agudo (no crónico)", segura: true },
  { key: "enteropatia_cronica", label: "Enteropatía crónica / colitis", segura: true },
  { key: "artrosis", label: "Artrosis / osteoartritis", segura: true },
  { key: "riesgo_gdv", label: "Riesgo de torsión gástrica (razas de tórax profundo)", segura: true },
  { key: "disfuncion_cognitiva", label: "Disfunción cognitiva canina", segura: true },
  { key: "dermatosis_zinc", label: "Dermatosis zinc-sensible (razas nórdicas)", segura: true },
  { key: "dermatitis_atopica", label: "Dermatitis atópica", segura: true },
  { key: "epilepsia_idiopatica", label: "Epilepsia idiopática", segura: true },
  { key: "mielopatia_degenerativa", label: "Mielopatía degenerativa", segura: true },
  { key: "cushing", label: "Hiperadrenocorticismo (Cushing)", segura: true },
  { key: "addison", label: "Hipoadrenocorticismo (Addison)", segura: true },
  { key: "cancer_soporte", label: "Soporte nutricional oncológico", segura: true },
  { key: "inmunosupresion", label: "Inmunosupresión (quimioterapia, corticoides, enf. inmunomediada)", segura: true },
  // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: si el perro tiene
  // una patología que no está en esta lista, antes no había ninguna
  // opción -- la persona podía quedarse con la duda de si su caso
  // necesitaba también adaptar la dieta, sin ninguna forma de decirlo.
  // Se trata igual que "estruvita" (segura: false): NO genera una
  // dieta automática fingiendo haberla ajustado (el motor no tiene
  // ninguna regla real para una patología que no conoce) -- en vez de
  // eso, dispara el mismo aviso de "esto lo tiene que valorar tu
  // veterinario", para que el caso se estudie de verdad, en vez de
  // dar una falsa sensación de que ya está cubierto.
  { key: "otra", label: "Otra patología / no está en esta lista", segura: false,
    aviso: "Esta condición no está entre las que este sistema sabe ajustar automáticamente todavía, así que no generamos un menú que podría no estar realmente adaptado a lo que necesita: mejor que un veterinario valore su caso en concreto y paute la dieta." },
];

// ─── LAS PATOLOGÍAS, POR APARATO ────────────────────────────────────────────
//
// ⚠️ PEDIDO EXPRESO (8 de septiembre): «la lista de patologías me parece un
// peñazo, es enorme; habría que hacer un desplegable o poner por categorías.
// No me gusta que más de la mitad de la página sea una lista de patologías
// hacia abajo».
//
// Y es literal: son 27 casillas seguidas en medio de la ficha, así que para
// llegar a «Dieta actual» y a «Tutor» hay que pasarlas todas. Un veterinario
// tampoco las lee: sabe lo que busca y quiere llegar a ello.
//
// Se agrupan por APARATO y no por «frecuencia» o por orden alfabético porque
// es como está ordenada la cabeza de quien las busca: el paciente viene con
// un problema renal, o digestivo, o de piel. Cada grupo se abre solo si
// tiene algo marcado, y hay un buscador encima para quien ya sabe el nombre.
//
// ⚠️ LA LISTA DE CLAVES NO SE DUPLICA: los grupos se construyen a partir de
// `PATOLOGIAS`, y lo que no esté en ningún grupo cae en «Otras». Escribir
// aquí las 27 otra vez sería la segunda copia, y el día que se añadiera una
// patología nueva desaparecería de la pantalla sin que saltara nada -- que
// es exactamente lo que pasó con las seis categorías de Personalizar.
export const APARATOS = [
  { titulo: "Renal y urinario",
    claves: ["renal", "renal_proteinuria", "fracaso_renal_agudo", "oxalato",
             "estruvita", "urato", "cistina"] },
  { titulo: "Digestivo y páncreas",
    claves: ["pancreatitis", "enteropatia_cronica", "ple_linfangiectasia",
             "insuficiencia_pancreatica_exocrina"] },
  // ⚠️ "Hepático" y no "Hígado": en esta misma ficha hay una categoría de
  // ALIMENTO que se llama «Hígado» (la que se puede excluir), y dos botones
  // con el mismo nombre en la misma pantalla se confunden -- lo vio primero
  // una prueba, que no supo cuál de los dos pulsar, pero le pasaría igual a
  // quien la use con un lector de pantalla.
  { titulo: "Hepático y biliar",
    claves: ["hepatopatia", "shunt_sin_encefalopatia"] },
  { titulo: "Corazón",
    claves: ["cardiopatia", "dcm_taurina_respondedora", "dcm_asociada_a_dieta"] },
  { titulo: "Endocrino y metabólico",
    claves: ["diabetes", "hipotiroidismo", "hiperlipidemia", "obesidad",
             "cushing", "addison"] },
  { titulo: "Piel",
    claves: ["dermatitis_atopica", "dermatosis_zinc"] },
  { titulo: "Locomotor y neurológico",
    claves: ["artrosis", "mielopatia_degenerativa", "epilepsia_idiopatica",
             "disfuncion_cognitiva"] },
  { titulo: "Oncología e inmunidad",
    claves: ["cancer_soporte", "inmunosupresion"] },
  { titulo: "Otras",
    claves: ["riesgo_gdv", "otra"] },
];

// Los grupos ya resueltos contra PATOLOGIAS, con las que no estén en ningún
// aparato metidas en «Otras». Se calcula una vez, al cargar el módulo.
export const PATOLOGIAS_POR_APARATO = (() => {
  const puestas = new Set(APARATOS.flatMap((g) => g.claves));
  const huerfanas = PATOLOGIAS.filter((p) => !puestas.has(p.key));
  return APARATOS.map((g) => ({
    titulo: g.titulo,
    patologias: [
      ...g.claves.map((k) => PATOLOGIAS.find((p) => p.key === k)).filter(Boolean),
      ...(g.titulo === "Otras" ? huerfanas : []),
    ],
  })).filter((g) => g.patologias.length > 0);
})();

// ─── LAS PATOLOGÍAS QUE EN REALIDAD SON UNA FAMILIA ─────────────────────────
//
// Ver VETERINARIOS.md §12-quinquies (repo de la API), "Grupo 2": son
// preguntas que decide el TUTOR con lo que ya le dijo su veterinario -- no
// hace falta acreditación profesional para responderlas --, pero sin la
// pregunta la app no sabe qué clave concreta mandar y se queda siempre en
// la más genérica. Cada familia tiene una clave CABECERA (la que aparece
// en `PATOLOGIAS` de arriba) y una lista de opciones, cada una con su
// propia clave real de `patologias.json`. La opción elegida SUSTITUYE a
// la cabecera (y a cualquier otra hermana) en `perfil.patologias` -- el
// array que ve el backend nunca lleva dos claves de la misma familia a
// la vez.
export const FAMILIAS_PATOLOGIA = {
  cardiopatia: {
    pregunta: "¿Sabes el estadio ACVIM?",
    opciones: [
      { key: "cardiopatia", label: "No lo sé / sin estadiar" },
      { key: "cardiopatia_a", label: "A — predispuesta, sin enfermedad todavía", segura: true },
      { key: "cardiopatia_b1", label: "B1 — soplo, sin remodelado", segura: true },
      { key: "cardiopatia_b2", label: "B2 — remodelado, sin síntomas", segura: true },
      { key: "cardiopatia_c", label: "C — insuficiencia cardíaca, actual o pasada", segura: true },
      { key: "cardiopatia_d", label: "D — insuficiencia cardíaca refractaria", segura: true },
    ],
  },
  renal: {
    pregunta: "¿Tu veterinario ha dicho si es leve-moderada o moderada-grave?",
    opciones: [
      { key: "renal", label: "No lo sé / leve-moderada" },
      { key: "renal_avanzada", label: "Moderada-grave (creatinina/SDMA claramente altos)", segura: false,
        aviso: "En insuficiencia renal moderada-grave, la restricción real de proteína va por debajo de lo que un perro sano necesita -- eso no se puede resolver eligiendo mejor los alimentos, hace falta una dieta renal terapéutica pautada por tu veterinario." },
    ],
  },
  hepatopatia: {
    pregunta: "¿Está confirmado con biopsia o analítica de cobre, o es solo predisposición de raza?",
    opciones: [
      { key: "hepatopatia", label: "Confirmado" },
      { key: "raza_predispuesta_cobre", label: "Solo predisposición de raza (sin diagnóstico)", segura: true },
    ],
  },
  shunt_sin_encefalopatia: {
    pregunta: "¿Hay signos neurológicos activos ahora mismo?",
    opciones: [
      { key: "shunt_sin_encefalopatia", label: "No", segura: false,
        aviso: "El shunt hace que la sangre porta-hepática se salte el hígado, así que el amoniaco de catabolizar proteína no se depura: la proteína hay que bajarla por debajo del mínimo saludable de FEDIAF, y eso necesita una dieta pautada por tu veterinario." },
      { key: "encefalopatia_hepatica", label: "Sí, hay signos neurológicos ahora", segura: false,
        aviso: "Con signos neurológicos activos por acumulación de amoniaco, la proteína hay que bajarla más que en cualquier otra hepatopatía -- muy por debajo de lo saludable. Es una urgencia relativa: necesita manejo veterinario directo, no un menú ajustado desde una app." },
    ],
  },
  estruvita: {
    pregunta: "¿Qué tipo de cálculo, si se sabe?",
    opciones: [
      { key: "estruvita", label: "Estruvita (o no lo sé)" },
      { key: "urato", label: "Urato (dálmata, shunt hepático)" },
      { key: "cistina", label: "Cistina" },
    ],
  },
};

// Clave real -> familia a la que pertenece, para poder quitar a las
// hermanas del array al elegir una nueva.
export const FAMILIA_DE_CLAVE = Object.fromEntries(
  Object.entries(FAMILIAS_PATOLOGIA).flatMap(([cabecera, { opciones }]) =>
    opciones.map((o) => [o.key, cabecera]))
);

// Toda opción de toda familia, indexada por su propia clave -- para poder
// resolver "urato" o "renal_avanzada" aunque no tengan su propia entrada
// en `PATOLOGIAS` (algunas sí la tienen también, p.ej. "urato"; la
// entrada de `PATOLOGIAS` manda si existen las dos, por eso se comprueba
// primero en `datosPatologia`).
export const OPCIONES_DE_FAMILIA_POR_CLAVE = Object.fromEntries(
  Object.values(FAMILIAS_PATOLOGIA).flatMap(({ opciones }) =>
    opciones.map((o) => [o.key, o]))
);

// La ÚNICA función que hay que llamar para saber si una clave de patología
// (venga de una casilla simple o de una opción de familia) es segura y qué
// aviso lleva -- `bloqueantes` en las dos pantallas la usa, para no volver
// a mirar solo `PATOLOGIAS` y perderse las claves que solo existen dentro
// de una familia (ver el fallo real que esto arregló: "renal_avanzada" y
// "encefalopatia_hepatica" no aparecían nunca como bloqueantes porque
// `PATOLOGIAS.find` no las encontraba).
export function datosPatologia(key) {
  return PATOLOGIAS.find((p) => p.key === key) || OPCIONES_DE_FAMILIA_POR_CLAVE[key] || null;
}

// ¿Está esta familia activa? -- no basta con mirar si `patologias` incluye
// la clave cabecera: puede estar activa con una hermana (p.ej. "renal_
// avanzada" en vez de "renal").
export function familiaPatologiaActiva(cabecera, patologias) {
  return patologias.some((k) => FAMILIA_DE_CLAVE[k] === cabecera);
}

// La pregunta de subtipo, si esta cabecera tiene familia y está activa.
// `onCambiar` recibe el array de patologías YA actualizado.
export function SelectorSubtipoPatologia({ cabecera, patologias, onCambiar }) {
  const familia = FAMILIAS_PATOLOGIA[cabecera];
  if (!familia || !familiaPatologiaActiva(cabecera, patologias)) return null;
  const actual = patologias.find((k) => FAMILIA_DE_CLAVE[k] === cabecera) || cabecera;
  return (
    <div className="ml-3 mt-1 mb-1.5 pl-3 flex flex-col gap-1" style={{ borderLeft: `2px solid #E3DAF0` }}>
      <p className="text-[11px] leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
        {familia.pregunta}
      </p>
      {familia.opciones.map((o) => {
        const elegido = actual === o.key;
        return (
          <button key={o.key} type="button" onClick={() => {
            const sinHermanas = patologias.filter((k) => FAMILIA_DE_CLAVE[k] !== cabecera);
            onCambiar([...sinHermanas, o.key]);
          }}
            className="text-left px-2.5 py-1.5 rounded-lg text-xs"
            style={{ background: elegido ? "#F0EBF8" : "transparent",
                     border: `1px solid ${elegido ? VIOLETA : "#E3DAF0"}`,
                     color: elegido ? VIOLETA : MALVA, fontFamily: fontBody }}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
