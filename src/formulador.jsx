// ─── EL FORMULADOR DEL VETERINARIO ──────────────────────────────────────────
//
// PEDIDO EXPRESO: "ellos no tienen que tener automático personalizar, ellos
// tienen su propio modo de crear el menú... van poniendo los alimentos y los
// gramos, y van viendo todos los nutrientes por categorías, en tiempo real,
// cuando vayan cambiando gramos... y lo del botón de autocompletar, que
// pueda pulsarlo y que se complete solo con lo que falta, y que luego
// también pueda modificar cosas de lo que le ha rellenado automáticamente".
//
// Es otro trabajo, no otra decoración. "Automático" y "Personalizar" son
// para quien quiere que le resuelvan la ración; un veterinario formula: pone
// las cantidades porque las ha decidido, y lo que necesita del motor es que
// le enseñe lo que va saliendo y que le cierre lo que falta cuando él lo
// pida.
//
// ⚠️ NADA SE CALCULA AQUÍ. Los nutrientes, el semáforo, la seguridad crónica
// y los topes por patología los da la API (`/formular/estado`), que es donde
// vive la tabla de FEDIAF. Traerse esos números al navegador sería el fallo
// que el CLAUDE.md describe con el DER calculado en dos sitios: la pantalla
// diría una cosa y el motor comprobaría otra, y no saltaría ningún error.
// Esta pantalla solo pinta y ordena.
import { useState, useEffect, useRef, useMemo } from "react";
import { AlertCircle, Ban, Check, ChevronDown, Menu, Plus, Printer, Search, Sparkles, Trash2, X } from "lucide-react";
import { API_BASE, fetchConTimeout } from "./api.js";
// La clave de actividad que entiende el motor. Vive en `vocabulario.js` y no en
// `App.jsx` porque esta pantalla la necesita y no puede importar de allí sin
// hacer un ciclo -- que es justo por lo que este formulador no la mandaba.
import { claveDeActividad, useVocabulario } from "./vocabulario.js";
import { agruparNutrientes, resumenDeLaFicha, nombreLegible } from "./nutrientes.js";
import { INSTRUCCIONES_POR_CATEGORIA, COMO_DAR_ALIMENTO } from "./instrucciones";

const VIOLETA = "#5A4088";
const ROSA = "#FF6F91";
const PAPEL = "#FBF7FC";
const TINTA = "#231539";
const MALVA = "#9A8CB8";
const VERDE = "#2E7D5B";
// La raza llega a veces como objeto o como JSON en texto (viene del
// buscador de razas). Aquí solo hace falta el nombre, y que no salga
// "[object Object]" impreso en una pauta firmada.
function nombreDeRazaCorto(valor) {
  if (!valor) return "";
  if (typeof valor === "object") return String(valor.nombre || "");
  const t = String(valor).trim();
  if (!t || t === "[object Object]") return "";
  if (t.startsWith("{")) {
    try { return String(JSON.parse(t)?.nombre || ""); } catch { return ""; }
  }
  return t;
}

const fontDisplay = "Georgia, 'Times New Roman', serif";
const fontBody = "'DM Sans', system-ui, sans-serif";

// Cuánto se espera desde la última tecla antes de preguntarle al motor. Ni
// tan poco que se dispare una petición por dígito -- escribir "250" son tres
// -- ni tanto que deje de parecer en vivo.
const ESPERA_MS = 450;

const COLOR_ESTADO = { se_pasa: ROSA, falta: "#C77700", dentro: VERDE };
const ETIQUETA_ESTADO = { se_pasa: "Se pasa", falta: "Falta", dentro: "Dentro" };

// ⚠️ LOS NUTRIENTES QUE SE OFRECEN PARA FIJAR (11 de septiembre de 2026).
//
// Elena: «el veterinario debe poder decidir en qué porcentaje quiere dejar la
// grasa, la proteína, LO QUE SEA».
//
// LA LISTA LA SIRVE EL MOTOR, no este archivo. Aquí había OCHO nutrientes
// escritos a mano, elegidos porque son los que tocan las fuentes de patología.
// El motor acepta los CUARENTA Y SEIS -- la clave viaja tal cual y
// `_objetivos_dentro_de_fediaf` la busca en `verificar.MAPA` --, así que los
// otros 38 no faltaban por una limitación del motor: faltaban porque esta
// pantalla decidía la lista. Es exactamente el fallo que persigue
// `GET /vocabulario`, y la cadena es FUENTE manda, MOTOR la implementa, APP la
// ofrece. Iba al revés.
//
// Los ocho se quedan como RESPALDO y solo como respaldo: si la API no contesta
// -- Render duerme a los 15 minutos --, la pantalla sigue sirviendo para lo que
// más se usa en vez de quedarse sin panel. Que el respaldo no se esté pintando
// cuando la API SÍ contesta lo comprueba `tests/formulador.spec.js` sembrando
// nombres inventados: con las palabras de verdad, «lo ha leído del motor» y
// «está pintando su respaldo» se ven exactamente igual.
//
// La clave es la del MOTOR (`verificar.MAPA`), no la del texto. Escribirla mal
// haría que el objetivo se mandara y el motor lo ignorara diciendo «no es un
// requisito», que es mejor que aplicarlo al nutriente equivocado pero sigue
// siendo un objetivo que no hace nada.
const OBJETIVOS_DE_RESPALDO = [
  { clave: "proteina", label: "Proteína (g/1000 kcal)" },
  { clave: "grasa", label: "Grasa (g/1000 kcal)" },
  { clave: "fosforo", label: "Fósforo (mg/1000 kcal)" },
  { clave: "calcio", label: "Calcio (mg/1000 kcal)" },
  { clave: "sodio", label: "Sodio (mg/1000 kcal)" },
  { clave: "potasio", label: "Potasio (mg/1000 kcal)" },
  { clave: "cobre", label: "Cobre (mg/1000 kcal)" },
  { clave: "fibra", label: "Fibra (g/1000 kcal)" },
];

// De lo que sirve `/vocabulario` a lo que pinta la fila. Se usa el registro de
// VETERINARIO a propósito: esta pantalla la firma un profesional y ya trae la
// unidad dentro del título, que es lo que evita que alguien escriba 2 creyendo
// que son gramos cuando son miligramos.
function objetivosDelVocabulario(vocab) {
  const lista = vocab?.objetivos_del_profesional?.nutrientes;
  if (!Array.isArray(lista) || lista.length === 0) return null;
  return lista
    .filter((n) => n && n.clave)
    .map((n) => ({
      clave: n.clave,
      label: n.veterinario?.titulo || n.nombre_del_requisito || n.clave,
      deFediaf: n.de_la_tabla_III_3b !== false,
    }));
}

// Una fila de alimento dentro del árbol: ponerlo, o dejarlo fuera de la
// prueba. Las dos cosas a un toque, que es lo que se pidió -- salir de la
// pantalla para excluir algo y volver a entrar era el coñazo.
function BotonAlimento({ a, puesto, onPoner, onFuera }) {
  return (
    <div className="flex items-center gap-1">
      <button onClick={onPoner} disabled={puesto}
        className="flex-1 text-left px-3 py-2 rounded-lg flex items-center justify-between"
        style={{ background: puesto ? "#F3EDFB" : PAPEL, border: "1.5px solid #E3DAF0",
                 opacity: puesto ? 0.6 : 1, cursor: puesto ? "default" : "pointer" }}>
        <span style={{ color: TINTA, fontFamily: fontBody, fontSize: 13 }}>{a.nombre}</span>
        <span className="text-[11px]" style={{ color: MALVA, fontFamily: "monospace" }}>
          {puesto ? "ya está" : `${Math.round(a.kcal_100g)} kcal/100 g`}
        </span>
      </button>
      <button onClick={onFuera} aria-label={`Dejar fuera ${a.nombre}`}
        title="Dejar fuera de esta prueba"
        className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
        style={{ background: PAPEL, border: "1.5px solid #E3DAF0", cursor: "pointer" }}>
        <Ban size={13} style={{ color: MALVA }} />
      </button>
    </div>
  );
}

export default function Formulador({
  perfil, derObjetivo, etapaRequisitos, pesoPerroKg, pesoAdultoEsperadoKg,
  pesoObjetivoKg, patologias = [], especiesExcluidas = [], nombresExcluidos = [],
  categoriasExcluidas = [], gramosIniciales = null, onGuardar = null, onVolver = () => {},
  firmante = null, onFirmar = null, onAbrirPanel = null, dietaActual = null,
  // ─── LA SEMANA DEL PACIENTE ───────────────────────────────────────────
  //
  // ⚠️ PEDIDO EXPRESO (11 septiembre): «puede haber mas de un menu semanal,
  // cosa que, por cierto, un veterinario no puede hacer: solo puede generar un
  // menu para la semana y tendria que poder elegir tambien si quiere generar
  // mas de uno».
  //
  // Y lo que de verdad importaba de eso no era poder hacer varios: era que el
  // PRESUPUESTO SEMANAL de seguridad crónica se repartiera entre ellos. El
  // generador del tutor lo hace desde el 25 de agosto -- `/menu/semana` genera
  // la semana entera en UNA llamada para que el servidor pueda ir restando y
  // pasarlo al solver como restricción DURA -- y aquí no: cada ración se
  // formulaba como si fuera la semana entera, así que quien firma tenía MENOS
  // protección que el tutor justo en los cinco topes que son crónicos.
  //
  // Cada entrada es `{ nombre, gramos, dias }`. La cuenta la hace el SERVIDOR,
  // no esta pantalla: dejarla aquí sería volver al aviso que se puede ignorar.
  racionesDeLaSemana = [],
  onGuardarEnLaSemana = null,
  // Abre la vista de impresión de la pauta que se acaba de firmar. La pinta
  // el padre (`pautaimprimible.jsx`), que es quien tiene los datos de la
  // clínica: no son parte del documento firmado a propósito -- ver su
  // cabecera.
  onImprimir = null,
}) {
  const [gramos, setGramos] = useState(() => ({ ...(gramosIniciales || {}) }));
  const [catalogo, setCatalogo] = useState(null);
  const [buscando, setBuscando] = useState(false);
  const [busqueda, setBusqueda] = useState("");
  const [estado, setEstado] = useState(null);
  const [calculando, setCalculando] = useState(false);
  const [autocompletando, setAutocompletando] = useState(false);
  const [avisoAuto, setAvisoAuto] = useState(null);
  const [alternativa, setAlternativa] = useState(null);
  const [error, setError] = useState(null);
  // ─── DEJAR FUERA COSAS SIN SALIR DE AQUÍ ──────────────────────────────
  //
  // ⚠️ PEDIDO EXPRESO (11 septiembre): «lo de excluir un alimento o un grupo
  // de alimentos se tiene que poder hacer desde el mismo generador de menú,
  // porque igual quiere hacer pruebas y tener que salir y volver a entrar es
  // un coñazo».
  //
  // ⚠️ Y SON APARTE DE LAS DE LA FICHA, A PROPÓSITO. Las de la ficha
  // (`especiesExcluidas`, `nombresExcluidos`, `categoriasExcluidas`) llegan
  // como props y NO se tocan desde aquí: la regla 4 del proyecto es explícita
  // -- «las alergias y las categorías excluidas a mano no se tocan jamás,
  // pueden ser médicas». Quitar desde un generador la alergia que alguien
  // anotó en la ficha es exactamente el fallo que esa regla previene.
  //
  // Lo de aquí SUMA: es para probar. Se ve siempre, se quita de una en una, y
  // no se guarda en la ficha del paciente.
  const [fueraDeLaPrueba, setFueraDeLaPrueba] = useState({ nombres: [], categorias: [] });
  // ─── LOS OBJETIVOS QUE PONE ÉL ────────────────────────────────────────
  //
  // ⚠️ PEDIDO EXPRESO (11 septiembre): «el veterinario debe poder decidir en
  // qué porcentaje quiere dejar la grasa, la proteína, lo que sea... y no solo
  // para patologías, igual en un menú normal el veterinario quiere tener
  // control sobre eso».
  //
  // Van en la MISMA unidad que todo lo demás de esta pantalla y que
  // `GET /patologias` -- g o mg por 1000 kcal --, no en porcentaje: dos
  // unidades en la pantalla de quien firma es cómo se lee un número por otro.
  //
  // ⚠️ Y SOLO PUEDEN APRETAR. Lo recorta el motor contra FEDIAF y lo DICE en
  // `objetivos_ajustados`; aquí se pinta lo que haya dicho. Elena: «los
  // requisitos se respetan SIEMPRE, eso no se negocia».
  const [objetivos, setObjetivos] = useState({});
  const [objetivosAbiertos, setObjetivosAbiertos] = useState(false);
  // 46 filas de dos casillas no se recorren a ojo: se busca. El filtro es de
  // PINTADO, no de datos -- lo que ya esté fijado sigue viajando al motor
  // aunque el buscador lo esconda, que es lo contrario de lo que haría un
  // filtro que tocara `objetivos`.
  const [buscaObjetivo, setBuscaObjetivo] = useState("");
  const vocab = useVocabulario();
  const objetivosQueSeOfrecen = useMemo(
    () => objetivosDelVocabulario(vocab) || OBJETIVOS_DE_RESPALDO, [vocab]);
  const objetivosVisibles = useMemo(() => {
    const q = buscaObjetivo.trim().toLowerCase();
    if (!q) return objetivosQueSeOfrecen;
    return objetivosQueSeOfrecen.filter(
      (o) => o.label.toLowerCase().includes(q) || o.clave.toLowerCase().includes(q));
  }, [objetivosQueSeOfrecen, buscaObjetivo]);
  const [ajustes, setAjustes] = useState([]);
  const ponerObjetivo = (clave, lado, valor) =>
    setObjetivos((o) => {
      const n = { ...(o[clave] || {}) };
      if (valor === "" || valor == null) delete n[lado];
      else n[lado] = Number(valor);
      const fuera = { ...o };
      if (Object.keys(n).length === 0) delete fuera[clave];
      else fuera[clave] = n;
      return fuera;
    });

  // Cuántos días de la semana cubre la ración que se está montando ahora.
  // Por defecto 1: quien no toque nada recibe exactamente lo de antes.
  const [diasDeEstaRacion, setDiasDeEstaRacion] = useState(1);
  const diasYaPuestos = (racionesDeLaSemana || [])
    .reduce((n, r) => n + Math.max(1, Number(r?.dias) || 1), 0);
  const diasQueQuedan = Math.max(0, 7 - diasYaPuestos);

  const [categoriaAbierta, setCategoriaAbierta] = useState(null);
  const [especieAbierta, setEspecieAbierta] = useState(null);
  const dejarFuera = (que, cual) =>
    setFueraDeLaPrueba((f) => (f[que].includes(cual) ? f
      : { ...f, [que]: [...f[que], cual] }));
  const volverAMeter = (que, cual) =>
    setFueraDeLaPrueba((f) => ({ ...f, [que]: f[que].filter((x) => x !== cual) }));
  // ─── FIRMAR ES UN ACTO: HAY QUE PULSAR ────────────────────────────────
  // El modo profesional NO firma solo. Si firmara por el hecho de estar
  // encendido, el veterinario acabaría con veinte pautas firmadas de las
  // que hizo probando. Hasta que se pulsa "Firmar la pauta" esto es un
  // borrador, y se ve que lo es.
  const [firmando, setFirmando] = useState(false);       // el panel de firma
  const [enviandoFirma, setEnviandoFirma] = useState(false);
  const [nombreFirmante, setNombreFirmante] = useState(firmante?.nombre || "");
  const [pautaFirmada, setPautaFirmada] = useState(null);
  const [errorFirma, setErrorFirma] = useState(null);
  const [huecosAbiertos, setHuecosAbiertos] = useState(false);
  const [guardada, setGuardada] = useState(false);
  // ⚠️ EL "CÓMO DARLO" LO ESCRIBE ÉL (29 agosto). Pedido expreso: "tiene que
  // haber una sección de cómo darlo que proponga Rawku, pero que él pueda
  // modificar todo lo que quiera". Rawku propone -- las indicaciones de cada
  // categoría y del alimento concreto, que ya existen y son las mismas que ve
  // un dueño -- y a partir de ahí el texto es suyo: lo que firma un colegiado
  // no puede ser un texto que él no haya podido tocar.
  //
  // `tocado` distingue "no lo ha mirado" de "lo ha dejado así": mientras no
  // lo toque, la propuesta se rehace sola al cambiar la ración; en cuanto
  // escribe una letra, deja de moverse debajo de sus manos.
  const [indicaciones, setIndicaciones] = useState("");
  const [indicacionesTocadas, setIndicacionesTocadas] = useState(false);

  // ─── EL PELDAÑO DE LA ESCALERA, ELEGIDO ───────────────────────────────
  //
  // ⚠️ PEDIDO EXPRESO, y estaba escrito en la fase 1 de VETERINARIOS.md
  // desde el 28 de agosto: «qué peldaño de la escalera de relajación se usó,
  // Y PODER ELEGIRLO. Hoy se baja solo y se avisa; un profesional quiere
  // decidir si prefiere otro reparto antes que soltar la proporción de
  // hueso».
  //
  // Y aquí importaba el doble, porque autocompletar NO recorría la escalera
  // nunca: formulaba con las proporciones completas y, si no salía, decía
  // que no. O sea que un veterinario tenía MENOS margen que un tutor, al que
  // el motor sí le baja de peldaño solo.
  //
  // Lo que un peldaño mueve son las proporciones de BARF y cuántos
  // suplementos caben — criterio nuestro, no de FEDIAF. Los 43 requisitos,
  // el ratio Ca:P y los topes de seguridad y de patología son idénticos en
  // todos, y la ración sigue pasando por la misma verificación.
  const [peldanos, setPeldanos] = useState(null);   // null = sin cargar
  const [peldano, setPeldano] = useState("estricto");
  const [peldanosAbiertos, setPeldanosAbiertos] = useState(false);
  const peticion = useRef(0);

  // La escalera se pide una vez. Si la API no la sirve todavía (versión
  // anterior desplegada), no se pinta el selector y todo sigue como antes:
  // sin `peldano` el motor formula en el primero, que es lo de siempre.
  useEffect(() => {
    let vivo = true;
    fetchConTimeout(`${API_BASE}/relajacion`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo && d?.peldanos?.length) setPeldanos(d.peldanos); })
      .catch(() => {});
    return () => { vivo = false; };
  }, []);

  const cuerpoBase = useMemo(() => ({
    der_objetivo: derObjetivo,
    // ⚠️ LOS DOS CAMPOS QUE LA FICHA YA RECOGE Y QUE ESTA PANTALLA NO MANDABA
    // (11 de septiembre de 2026).
    //
    // Elena, el mismo día: «por eso te dije que todo lo tienes que probar
    // dentro de la app con los usuarios que tienes para comprobar que funciona,
    // y no lo has hecho en nada, ni con todo lo que hemos aplicado para el
    // perfil de veterinario hoy ni para el de usuarios». Tenía razón: el
    // generador del tutor mandaba los dos desde App.jsx y este formulador, que
    // es la pantalla del VETERINARIO, no mandaba ninguno.
    //
    // Y no fue un descuido de escribir dos líneas: `claveDeActividad` vivía
    // dentro de `App.jsx`, y esta pantalla no puede importar de allí sin hacer
    // un ciclo. O sea que el dato estaba y el camino no existía. Ahora vive en
    // `vocabulario.js`, que es de donde tiran los dos.
    //
    // QUÉ SE PERDÍA, que es lo que lo hace un fallo y no una omisión:
    //   · `premios_nivel` — el motor formula la ración con las kcal QUE QUEDAN
    //     y le sigue exigiendo el día entero de nutrientes. Sin él, al paciente
    //     al que su dueño da un 20 % de las calorías en premios se le formula
    //     como si no tomara ninguno, y esas calorías se suman POR ENCIMA de la
    //     ración que el veterinario FIRMA.
    //   · `actividad` — decide si se le aprietan los topes crónicos por peso
    //     metabólico y si el menú lleva la nota del perro de trabajo. Sin él el
    //     motor la deduce del cociente DER/peso^0,75, que confunde al Gran
    //     Danés: su cifra de energía es POR RAZA, no por actividad.
    //
    // Lo vigila `tests/formulador.spec.js`, comprobado con el fallo puesto.
    premios_nivel: perfil?.premiosNivel || null,
    actividad: claveDeActividad(perfil),
    etapa_requisitos: etapaRequisitos,
    peso_perro_kg: pesoPerroKg ?? null,
    peso_adulto_esperado_kg: pesoAdultoEsperadoKg ?? null,
    peso_objetivo_kg: pesoObjetivoKg ?? null,
    patologias: patologias || [],
    especies_excluidas: especiesExcluidas || [],
    // Las de la ficha MÁS las de esta prueba. Se suman y no se sustituyen:
    // lo de la ficha puede ser médico y no se toca desde aquí.
    nombres_excluidos: [...(nombresExcluidos || []), ...fueraDeLaPrueba.nombres],
    categorias_excluidas: [...(categoriasExcluidas || []), ...fueraDeLaPrueba.categorias],
    // Los objetivos que ha puesto él. `/formular/estado` los ignora (solo mide
    // lo que hay), pero van desde el mismo sitio por lo mismo que el peldaño.
    objetivos_del_profesional: Object.keys(objetivos).length ? objetivos : undefined,
    // El peldaño viaja en TODAS las llamadas y no solo en autocompletar:
    // `/formular/estado` lo ignora (solo mide lo que hay puesto), pero
    // mandarlo desde un solo sitio es lo que impide que autocompletar
    // formule en un peldaño y la pantalla enseñe otro.
    peldano,
    // ⚠️ LA SEMANA, Y LA RESTA LA HACE EL SERVIDOR. Se le mandan las raciones
    // que el profesional YA ha decidido, con sus días, y él va restando del
    // presupuesto semanal de seguridad crónica antes de llamar al solver. Sin
    // esto, la protección está construida en el motor y no se está usando.
    dias_de_esta_racion: diasDeEstaRacion,
    raciones_ya_puestas: (racionesDeLaSemana || []).length
      ? racionesDeLaSemana.map((r) => ({ gramos: r.gramos || {}, dias: Math.max(1, Number(r.dias) || 1) }))
      : undefined,
  }), [perfil, derObjetivo, etapaRequisitos, pesoPerroKg, pesoAdultoEsperadoKg, pesoObjetivoKg,
      patologias, especiesExcluidas, nombresExcluidos, categoriasExcluidas, peldano,
      fueraDeLaPrueba, objetivos, diasDeEstaRacion, racionesDeLaSemana]);

  // El catálogo, una vez. Es la misma lista que usa el analizador.
  useEffect(() => {
    let vivo = true;
    fetchConTimeout(`${API_BASE}/alimentos`)
      .then((r) => r.json())
      .then((d) => { if (vivo) setCatalogo(d); })
      .catch(() => { if (vivo) setCatalogo({}); });
    return () => { vivo = false; };
  }, []);

  // EN VIVO: cada cambio de gramos vuelve a preguntar. Con contador de
  // peticiones porque las respuestas pueden llegar desordenadas -- y una
  // respuesta vieja pintando encima de una nueva sería peor que no pintar
  // nada: enseñaría nutrientes que no son los de lo que hay en pantalla.
  useEffect(() => {
    const hayAlgo = Object.values(gramos).some((g) => Number(g) > 0);
    if (!hayAlgo) { setEstado(null); return; }
    const mio = ++peticion.current;
    setCalculando(true);
    const t = setTimeout(() => {
      fetchConTimeout(`${API_BASE}/formular/estado`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...cuerpoBase, gramos_por_alimento: soloPositivos(gramos) }),
      })
        .then((r) => r.json())
        .then((d) => {
          if (peticion.current !== mio) return;   // ha llegado tarde
          setEstado(d);
          setError(d?.detail ? String(d.detail) : null);
        })
        .catch((err) => {
          if (peticion.current !== mio) return;
          setError(err?.message || "No se ha podido calcular.");
        })
        .finally(() => { if (peticion.current === mio) setCalculando(false); });
    }, ESPERA_MS);
    return () => clearTimeout(t);
  }, [gramos, cuerpoBase]);

  // La propuesta de Rawku, hecha con las MISMAS instrucciones que ve un
  // dueño (`instrucciones.js`): las de cada categoría presente en la ración y
  // las del alimento concreto cuando la tiene. No se escribe aquí una
  // segunda versión "para profesionales" -- serían dos textos que se separan,
  // y el que se quedaría viejo sería justo el que se firma.
  const propuesta = useMemo(() => {
    const nombres = Object.keys(soloPositivos(gramos));
    if (!nombres.length || !catalogo) return "";
    const categoriaDe = {};
    for (const [cat, lista] of Object.entries(catalogo)) {
      for (const a of lista) categoriaDe[a.nombre] = cat;
    }
    const cats = [...new Set(nombres.map((n) => categoriaDe[n]).filter(Boolean))];
    const trozos = [];
    for (const cat of cats) {
      const txt = INSTRUCCIONES_POR_CATEGORIA[cat];
      if (txt) trozos.push(`${cat}: ${txt}`);
    }
    for (const n of nombres) {
      const propio = COMO_DAR_ALIMENTO[n];
      if (propio?.como) trozos.push(`${n}: ${propio.como}`);
    }
    if (dietaActual && dietaActual !== "barf_otra") {
      trozos.unshift(
        "Transición: cambio gradual desde " +
        (dietaActual === "pienso" ? "pienso" : "comida cocinada") +
        " a lo largo de 7-10 días, subiendo la proporción de la ración nueva cada 2-3 días. " +
        "Si aparece diarrea o vómitos, se vuelve al reparto anterior y se alarga.");
    }
    return trozos.join("\n\n");
  }, [gramos, catalogo, dietaActual]);

  useEffect(() => {
    if (!indicacionesTocadas) setIndicaciones(propuesta);
  }, [propuesta, indicacionesTocadas]);

  const ponerGramos = (nombre, valor) => {
    setGramos((g) => ({ ...g, [nombre]: valor }));
    setAvisoAuto(null);
    setAlternativa(null);
    // Si cambia la ración, lo guardado ya no es esto: el cartel de "guardada"
    // se quita solo para no decir algo que ha dejado de ser verdad.
    setGuardada(false);
  };
  const quitar = (nombre) => {
    setGramos((g) => { const n = { ...g }; delete n[nombre]; return n; });
    setAvisoAuto(null);
    setAlternativa(null);
  };

  // AJUSTAR EL TOTAL. Pedido expreso: que pueda fijar los gramos totales de
  // la ración. Se reparte proporcionalmente, que es lo que significa
  // "quiero la misma fórmula en 800 g": la proporción entre alimentos no
  // cambia, cambian las cantidades. Las kcal cambian con ella, y el desvío
  // de arriba lo dice en el acto.
  const ajustarTotal = (totalDeseado) => {
    const total = sumaDe(gramos);
    if (!(total > 0) || !(totalDeseado > 0)) return;
    const factor = totalDeseado / total;
    setGramos((g) => {
      const n = {};
      for (const [k, v] of Object.entries(g)) n[k] = redondea(Number(v) * factor);
      return n;
    });
  };

  const autocompletar = async () => {
    setAutocompletando(true);
    setAvisoAuto(null);
    setAlternativa(null);
    try {
      const r = await fetchConTimeout(`${API_BASE}/formular/autocompletar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...cuerpoBase, gramos_por_alimento: soloPositivos(gramos) }),
      });
      const d = await r.json();
      if (d?.factible && d.menu) {
        // ⚠️ LO QUE RELLENA SIGUE SIENDO EDITABLE, que es la mitad de lo que
        // se pidió: entra en el mismo estado que lo que escribe él, no en
        // una caja aparte de "resultado".
        setGramos(Object.fromEntries(
          Object.entries(d.menu).map(([k, v]) => [k, redondea(v)])));
        if (d.estado) setEstado(d.estado);
        setAjustes(d.objetivos_ajustados || []);
        // ⚠️ Y SI HA HABIDO QUE BAJAR DE PELDAÑO, SE DICE (11 septiembre).
        // Desde hoy autocompletar recorre la escalera, así que puede salir
        // con proporciones más sueltas que las que el veterinario tenía
        // delante. Callarlo sería cambiarle la forma de la ración en
        // silencio, que es la regla 3 al revés — y quien firma tiene que
        // poder decir con qué proporciones salió.
        if (d.se_bajo_de_peldano && d.peldano) {
          const cual = (peldanos || []).find((p) => p.clave === d.peldano);
          setPeldano(d.peldano);
          setAvisoAuto(
            `Con las proporciones que tenías puestas no salía, así que se ha completado con ` +
            `«${cual ? cual.titulo : d.peldano}». Solo cambia la forma de la ración: los 43 ` +
            `requisitos, el ratio Ca:P y los topes de seguridad y de patología son los mismos.`);
          setPeldanosAbiertos(true);
        }
      } else {
        // ⚠️ «NO SALE» TIENE QUE DECIR EN QUÉ PELDAÑO NO SALE (8 septiembre).
        // Sin eso, un no se lee como «no existe» cuando muchas veces es «no
        // existe con ESTAS proporciones» -- y queda escalera por debajo. Es
        // la diferencia entre cerrar la pantalla y probar lo siguiente.
        const usado = (peldanos || []).find((p) => p.clave === (d?.peldano || peldano));
        const quedan = peldanos && usado ? peldanos.filter((p) => p.orden > usado.orden) : [];
        const cola = usado && usado.orden === 0 && quedan.length
          ? " Es con las proporciones BARF completas: en Proporciones puedes soltarlas."
          : usado && quedan.length
            ? ` Es con «${usado.titulo}»: quedan ${quedan.length} ${quedan.length === 1 ? "peldaño" : "peldaños"} por debajo.`
            : usado
              ? ` Es con «${usado.titulo}», el último peldaño: no queda forma que soltar.`
              : "";
        setAvisoAuto((d?.motivo || "No se ha podido completar la ración.") + cola);
        setAjustes(d?.objetivos_ajustados || []);
        // La alternativa se OFRECE, no se aplica: cambiarle las cantidades
        // sin decírselo sería justo lo que el endpoint promete no hacer.
        if (d?.alternativa) setAlternativa(d.alternativa);
        // Y se abre el selector: si la salida está ahí, que se vea sin
        // tener que descubrir un desplegable plegado.
        if (quedan.length) setPeldanosAbiertos(true);
      }
    } catch (err) {
      setAvisoAuto(err?.message || "No se ha podido completar la ración.");
    } finally {
      setAutocompletando(false);
    }
  };

  const firmar = async () => {
    setEnviandoFirma(true);
    setErrorFirma(null);
    try {
      // ⚠️ EL DOCUMENTO LO CONSTRUYE Y LO SELLA LA API, sobre lo que acaba
      // de verificar ella misma. Aquí NO se arma nada: si esta pantalla
      // montara el documento con lo que tiene pintado, habría dos ideas de
      // "lo firmado" y el día que se separen el sello seguiría cuadrando
      // consigo mismo sin decir nada.
      const r = await fetchConTimeout(`${API_BASE}/pauta/firmar`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...cuerpoBase,
          gramos_por_alimento: soloPositivos(gramos),
          firmante: { nombre: nombreFirmante.trim(),
                      num_colegiado: firmante?.num_colegiado || "" },
          // Lo que él ha escrito para el tutor va DENTRO de lo que firma:
          // una pauta son los gramos y qué hacer con ellos.
          indicaciones,
          // ⚠️ LO QUE VA IMPRESO SE CONGELA AQUÍ (8 septiembre). La raza y
          // el sexo no cambian el cálculo, así que hasta hoy no viajaban --
          // pero salen en el papel que se lleva el tutor, y un documento
          // firmado no puede ir a buscarlos a la ficha del perro un año
          // después: para entonces la ficha es otra, o el perro ya no está.
          paciente: {
            nombre: perfil?.nombre || "",
            raza: nombreDeRazaCorto(perfil?.raza),
            sexo: perfil?.sexo || "",
            peso_kg: perfil?.pesoActual ? Number(perfil.pesoActual) : null,
            bcs: perfil?.bcs ?? null,
            tutor_nombre: perfil?.tutorNombre || "",
            tutor_contacto: perfil?.tutorContacto || "",
          },
        }),
      });
      const d = await r.json();
      if (!d?.factible || !d.documento) {
        setErrorFirma(d?.motivo || "No se ha podido firmar esta ración.");
        return;
      }
      if (onFirmar) await onFirmar(d.documento);
      setPautaFirmada(d.documento);
      setFirmando(false);
    } catch (err) {
      setErrorFirma(err?.message || "No se ha podido firmar esta ración.");
    } finally {
      setEnviandoFirma(false);
    }
  };


  const total = sumaDe(gramos);
  const desvio = estado?.desvio_kcal_pct;
  const ficha = estado?.ficha || null;
  const grupos = useMemo(() => agruparNutrientes(ficha), [ficha]);
  const resumen = resumenDeLaFicha(ficha);
  const topesRotos = estado?.topes_de_patologia_rotos || [];
  const problemas = estado?.problemas_seguridad || [];
  const puedeGuardar = Boolean(
    ficha && ficha.semaforo === "verde" && topesRotos.length === 0 && onGuardar);

  const resultados = useMemo(() => {
    if (!catalogo || !busqueda.trim()) return [];
    const q = busqueda.trim().toLowerCase();
    const fuera = new Set([...(categoriasExcluidas || []), ...fueraDeLaPrueba.categorias]);
    const fueraNombres = new Set([...(nombresExcluidos || []), ...fueraDeLaPrueba.nombres]);
    const salida = [];
    for (const [cat, lista] of Object.entries(catalogo)) {
      if (fuera.has(cat)) continue;
      for (const a of lista) {
        if (a.nombre.toLowerCase().includes(q) && !(a.nombre in gramos)
            && !fueraNombres.has(a.nombre)) {
          salida.push({ ...a, categoria: cat });
        }
      }
    }
    return salida.slice(0, 12);
  }, [catalogo, busqueda, gramos, categoriasExcluidas, nombresExcluidos, fueraDeLaPrueba]);

  // ─── EL ÁRBOL: CATEGORÍA → ESPECIE → ALIMENTO ─────────────────────────
  //
  // ⚠️ PEDIDO EXPRESO (11 septiembre): «la lista de ingredientes a seleccionar
  // no está dividida por categorías /carne muscular /verduras /vísceras... y
  // debería, para que no aparezca una lista infinita, y dentro de eso pues que
  // aparezca por ejemplo pollo, se entre dentro de pollo y aparezca todo lo
  // que sea de pollo de esa categoría».
  //
  // Hasta hoy este selector era SOLO un buscador: sin escribir no se veía
  // nada, así que para encontrar algo había que saber ya cómo se llama. Son
  // 163 alimentos en 14 categorías.
  //
  // ⚠️ La especie NO se adivina del nombre: la sirve el motor en `/alimentos`
  // (`especie`), que la saca de `especies.py`. Deducirla aquí partiendo el
  // nombre sería inventarse la taxonomía en la pantalla, y además fallaría en
  // los mismos sitios donde falla excluir por nombre -- «pollo» y «gallina»
  // son la misma especie y no se parecen.
  const arbol = useMemo(() => {
    if (!catalogo) return [];
    const fuera = new Set([...(categoriasExcluidas || []), ...fueraDeLaPrueba.categorias]);
    const fueraNombres = new Set([...(nombresExcluidos || []), ...fueraDeLaPrueba.nombres]);
    return Object.entries(catalogo).map(([cat, lista]) => {
      const porEspecie = new Map();
      for (const a of lista) {
        if (fueraNombres.has(a.nombre)) continue;
        // Sin especie (los suplementos, la verdura) van juntos bajo la
        // categoría, sin un nivel de más que no dice nada.
        const clave = a.especie || null;
        if (!porEspecie.has(clave)) porEspecie.set(clave, []);
        porEspecie.get(clave).push(a);
      }
      return {
        categoria: cat,
        excluida: fuera.has(cat),
        deLaFicha: (categoriasExcluidas || []).includes(cat),
        cuantos: [...porEspecie.values()].reduce((n, v) => n + v.length, 0),
        especies: [...porEspecie.entries()]
          .sort((a, b) => (a[0] || "").localeCompare(b[0] || ""))
          .map(([especie, items]) => ({ especie, items })),
      };
    });
  }, [catalogo, categoriasExcluidas, nombresExcluidos, fueraDeLaPrueba]);

  return (
    <div className="cnl-pantalla-completa w-full flex flex-col" style={{ background: PAPEL }}>
      <div className="px-5 pt-5 pb-3" style={{ background: VIOLETA }}>
        {/* ⚠️ EL PANEL, TAMBIÉN DESDE AQUÍ (29 agosto). Esta pantalla se
            escribió sin él y era una vía muerta: desde el formulador no se
            podía ir a la ficha, ni a los menús, ni a las pautas firmadas --
            solo volver. Lo cazó la prueba del historial, que después de
            firmar no encontraba cómo llegar a mirarlo. */}
        <div className="flex items-center justify-between mb-2">
          <button onClick={onVolver} className="text-xs"
                  style={{ color: "#D8CFEC", fontFamily: fontBody, background: "transparent",
                           border: "none", cursor: "pointer" }}>
            ← Volver
          </button>
          {onAbrirPanel && (
            <button onClick={onAbrirPanel} aria-label="Menú"
                    style={{ background: "transparent", border: "none", cursor: "pointer" }}>
              <Menu size={20} style={{ color: "#FFFFFF" }} />
            </button>
          )}
        </div>
        <h1 className="text-2xl leading-tight" style={{ color: "#FFFFFF", fontFamily: fontDisplay }}>
          Formular la ración
        </h1>
        <p className="text-xs mt-1" style={{ color: "#D8CFEC", fontFamily: fontBody }}>
          {perfil?.nombre || "Paciente"} · {Math.round(derObjetivo)} kcal/día
          {patologias?.length > 0 && ` · ${patologias.join(", ")}`}
        </p>
      </div>

      {/* LA BARRA DE TOTALES: lo primero que mira quien formula. */}
      <div className="px-5 py-3 flex items-center gap-4 flex-wrap"
           style={{ background: "#FFFFFF", borderBottom: "1.5px solid #E3DAF0" }}>
        <div>
          <p className="text-[10px] tracking-[0.12em] uppercase" style={{ color: MALVA, fontFamily: "monospace" }}>
            Total
          </p>
          <div className="flex items-baseline gap-1">
            <input
              type="number" inputMode="decimal" value={total ? redondea(total) : ""}
              onChange={(e) => ajustarTotal(Number(e.target.value))}
              aria-label="Gramos totales"
              placeholder="0"
              className="text-xl outline-none bg-transparent w-20"
              style={{ color: TINTA, fontFamily: fontDisplay, borderBottom: `1.5px solid #E3DAF0` }} />
            <span className="text-sm" style={{ color: MALVA, fontFamily: fontBody }}>g</span>
          </div>
        </div>
        <div>
          <p className="text-[10px] tracking-[0.12em] uppercase" style={{ color: MALVA, fontFamily: "monospace" }}>
            Energía
          </p>
          <p className="text-xl" style={{ color: TINTA, fontFamily: fontDisplay }}>
            {estado ? Math.round(estado.kcal) : "—"}
            <span className="text-sm" style={{ color: MALVA, fontFamily: fontBody }}> kcal</span>
          </p>
        </div>
        {desvio !== null && desvio !== undefined && (
          <div>
            <p className="text-[10px] tracking-[0.12em] uppercase" style={{ color: MALVA, fontFamily: "monospace" }}>
              Desvío
            </p>
            {/* Más de un 3 % arriba o abajo es lo que el propio motor no se
                permite al generar. Se dice en rojo, no se corrige solo: la
                cifra es suya. */}
            <p className="text-xl" style={{ color: Math.abs(desvio) > 3 ? ROSA : VERDE,
                                            fontFamily: fontDisplay }}>
              {desvio > 0 ? "+" : ""}{desvio}%
            </p>
          </div>
        )}
        {ficha && (
          <div>
            <p className="text-[10px] tracking-[0.12em] uppercase" style={{ color: MALVA, fontFamily: "monospace" }}>
              FEDIAF
            </p>
            <p className="text-sm" style={{ fontFamily: fontBody, color: TINTA }}>
              <span style={{ color: VERDE, fontWeight: 700 }}>{resumen.dentro}</span> dentro ·{" "}
              <span style={{ color: "#C77700", fontWeight: 700 }}>{resumen.falta}</span> faltan ·{" "}
              <span style={{ color: ROSA, fontWeight: 700 }}>{resumen.se_pasa}</span> se pasan
            </p>
          </div>
        )}
        {calculando && (
          <span className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>calculando…</span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {/* LO QUE HAY EN LA RACIÓN */}
        <div className="rounded-2xl px-4 py-4 mb-3"
             style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
          <p className="text-[11px] tracking-[0.14em] uppercase mb-3"
             style={{ color: MALVA, fontFamily: "monospace" }}>
            Ingredientes y cantidades
          </p>
          {Object.keys(gramos).length === 0 && (
            <p className="text-sm mb-3" style={{ color: MALVA, fontFamily: fontBody }}>
              Añade los alimentos y escribe los gramos. Puedes dejar la ración a medias y pulsar
              Autocompletar: el motor cierra lo que falte sin tocar tus cantidades.
            </p>
          )}
          {Object.entries(gramos).map(([nombre, valor]) => (
            <div key={nombre} className="flex items-center gap-2 mb-2">
              <span className="flex-1 text-sm" style={{ color: TINTA, fontFamily: fontBody }}>
                {nombre}
              </span>
              <input
                type="number" inputMode="decimal" value={valor}
                onChange={(e) => ponerGramos(nombre, e.target.value)}
                aria-label={`Gramos de ${nombre}`}
                className="w-20 py-1.5 px-2 rounded-lg outline-none text-right"
                style={{ background: PAPEL, border: "1.5px solid #E3DAF0",
                         color: TINTA, fontFamily: fontBody }} />
              <span className="text-xs w-4" style={{ color: MALVA, fontFamily: fontBody }}>g</span>
              <button onClick={() => quitar(nombre)} aria-label={`Quitar ${nombre}`}
                      style={{ background: "transparent", border: "none", cursor: "pointer" }}>
                <Trash2 size={15} style={{ color: MALVA }} />
              </button>
              {/* Quitar lo saca de ESTA ración; dejarlo fuera impide además que
                  autocompletar lo vuelva a meter. Son dos cosas distintas y
                  antes solo estaba la primera: se quitaba el salmón, se pulsaba
                  autocompletar y volvía. */}
              <button onClick={() => { quitar(nombre); dejarFuera("nombres", nombre); }}
                      aria-label={`Dejar fuera ${nombre}`}
                      title="Dejar fuera de esta prueba"
                      style={{ background: "transparent", border: "none", cursor: "pointer" }}>
                <Ban size={15} style={{ color: MALVA }} />
              </button>
            </div>
          ))}

          {buscando ? (
            <div className="mt-3">
              <div className="relative mb-2">
                <Search size={16} style={{ position: "absolute", left: 12, top: 12, color: MALVA }} />
                <input
                  autoFocus value={busqueda} onChange={(e) => setBusqueda(e.target.value)}
                  placeholder="Buscar alimento"
                  aria-label="Buscar alimento"
                  className="w-full py-2.5 pl-9 pr-9 rounded-xl outline-none"
                  style={{ background: PAPEL, border: "1.5px solid #E3DAF0",
                           color: TINTA, fontFamily: fontBody }} />
                <button onClick={() => { setBuscando(false); setBusqueda(""); }}
                        aria-label="Cerrar búsqueda"
                        style={{ position: "absolute", right: 10, top: 10, background: "transparent",
                                 border: "none", cursor: "pointer" }}>
                  <X size={16} style={{ color: MALVA }} />
                </button>
              </div>
              {busqueda.trim() ? resultados.map((a) => (
                <button key={a.nombre}
                  onClick={() => { ponerGramos(a.nombre, "100"); setBusqueda(""); setBuscando(false); }}
                  className="w-full text-left px-3 py-2 rounded-lg flex items-center justify-between mb-1"
                  style={{ background: PAPEL, border: "1.5px solid #E3DAF0", cursor: "pointer" }}>
                  <span style={{ color: TINTA, fontFamily: fontBody, fontSize: 14 }}>{a.nombre}</span>
                  <span className="text-[11px]" style={{ color: MALVA, fontFamily: "monospace" }}>
                    {a.categoria} · {Math.round(a.kcal_100g)} kcal/100 g
                  </span>
                </button>
              )) : (
                /* Sin escribir nada, el árbol. Antes aquí no había nada: para
                   encontrar un alimento había que saber ya cómo se llama. */
                <div className="flex flex-col gap-1">
                  {arbol.map((c) => {
                    const abierta = categoriaAbierta === c.categoria;
                    return (
                      <div key={c.categoria}>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => { setCategoriaAbierta(abierta ? null : c.categoria);
                                             setEspecieAbierta(null); }}
                            aria-expanded={abierta}
                            disabled={c.excluida}
                            className="flex-1 flex items-center justify-between px-3 py-2 rounded-lg text-left"
                            style={{ background: c.excluida ? "#FBF7FC" : PAPEL,
                                     border: "1.5px solid #E3DAF0",
                                     opacity: c.excluida ? 0.55 : 1,
                                     cursor: c.excluida ? "default" : "pointer" }}>
                            <span style={{ color: TINTA, fontFamily: fontBody, fontSize: 14 }}>
                              {c.categoria}
                              <span className="text-[11px] ml-2" style={{ color: MALVA, fontFamily: "monospace" }}>
                                {c.excluida
                                  ? (c.deLaFicha ? "fuera por su ficha" : "fuera de esta prueba")
                                  : c.cuantos}
                              </span>
                            </span>
                            {!c.excluida && (
                              <ChevronDown size={15} style={{ color: MALVA,
                                transform: abierta ? "rotate(180deg)" : "none" }} />
                            )}
                          </button>
                          {/* Dejar fuera la categoría entera. Las que vienen de
                              la ficha no se tocan desde aquí: regla 4. */}
                          {!c.deLaFicha && (
                            <button
                              onClick={() => (c.excluida
                                ? volverAMeter("categorias", c.categoria)
                                : dejarFuera("categorias", c.categoria))}
                              aria-label={c.excluida
                                ? `Volver a meter ${c.categoria}`
                                : `Dejar fuera ${c.categoria}`}
                              className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center"
                              style={{ background: PAPEL, border: "1.5px solid #E3DAF0",
                                       cursor: "pointer" }}>
                              {c.excluida ? <Plus size={14} style={{ color: MALVA }} />
                                          : <Ban size={14} style={{ color: MALVA }} />}
                            </button>
                          )}
                        </div>

                        {abierta && !c.excluida && (
                          <div className="pl-3 mt-1 flex flex-col gap-1">
                            {c.especies.map(({ especie, items }) => {
                              // Sin especie (verdura, suplementos) no se mete un
                              // nivel de más: se listan directamente.
                              if (!especie) {
                                return items.map((a) => (
                                  <BotonAlimento key={a.nombre} a={a}
                                    puesto={a.nombre in gramos}
                                    onPoner={() => { ponerGramos(a.nombre, "100");
                                                     setBuscando(false); }}
                                    onFuera={() => dejarFuera("nombres", a.nombre)} />
                                ));
                              }
                              const ab = especieAbierta === `${c.categoria}/${especie}`;
                              return (
                                <div key={especie}>
                                  <button
                                    onClick={() => setEspecieAbierta(
                                      ab ? null : `${c.categoria}/${especie}`)}
                                    aria-expanded={ab}
                                    className="w-full flex items-center justify-between px-3 py-1.5 rounded-lg text-left"
                                    style={{ background: "#FFFFFF", border: "1px solid #E3DAF0",
                                             cursor: "pointer" }}>
                                    <span style={{ color: TINTA, fontFamily: fontBody, fontSize: 13 }}>
                                      {especie}
                                      <span className="text-[11px] ml-2"
                                            style={{ color: MALVA, fontFamily: "monospace" }}>
                                        {items.length}
                                      </span>
                                    </span>
                                    <ChevronDown size={14} style={{ color: MALVA,
                                      transform: ab ? "rotate(180deg)" : "none" }} />
                                  </button>
                                  {ab && (
                                    <div className="pl-3 mt-1 flex flex-col gap-1">
                                      {items.map((a) => (
                                        <BotonAlimento key={a.nombre} a={a}
                                          puesto={a.nombre in gramos}
                                          onPoner={() => { ponerGramos(a.nombre, "100");
                                                           setBuscando(false); }}
                                          onFuera={() => dejarFuera("nombres", a.nombre)} />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <button onClick={() => setBuscando(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl mt-2"
              style={{ background: PAPEL, border: "1.5px dashed #C9BEDD", color: VIOLETA,
                       fontFamily: fontBody, fontSize: 14, cursor: "pointer" }}>
              <Plus size={15} /> Añadir alimento
            </button>
          )}

          {/* ─── LA SEMANA DE ESTE PACIENTE ───────────────────────────────
              ⚠️ NO ES UN CONTADOR BONITO: es lo que hace que el presupuesto
              semanal de seguridad crónica llegue al solver. Mientras esta
              pantalla no dijera cuántos días cubre cada ración, el motor
              formulaba cada una como si fuera la semana entera, y quien firma
              tenía MENOS protección que el tutor justo en los cinco topes que
              son crónicos (vitamina D, yodo, selenio, mercurio, tiaminasa).
              La resta la hace el SERVIDOR; aquí solo se declara. */}
          <div className="mt-3 rounded-xl" style={{ background: PAPEL, border: "1px solid #E3DAF0" }}>
            <div className="px-3 py-2.5">
              <span className="block text-[10px] tracking-[0.1em] uppercase"
                    style={{ color: MALVA, fontFamily: "monospace" }}>
                La semana
              </span>
              <div className="flex items-center gap-2 mt-1.5">
                <span style={{ color: TINTA, fontFamily: fontBody, fontSize: 13 }}>
                  Esta ración cubre
                </span>
                <input type="number" min={1} max={7} value={diasDeEstaRacion}
                  aria-label="Días que cubre esta ración"
                  onChange={(e) => setDiasDeEstaRacion(
                    Math.min(7, Math.max(1, Number(e.target.value) || 1)))}
                  className="w-14 px-2 py-1 rounded-lg text-center"
                  style={{ border: "1.5px solid #E3DAF0", fontFamily: "monospace",
                           fontSize: 13, color: TINTA }} />
                <span style={{ color: TINTA, fontFamily: fontBody, fontSize: 13 }}>
                  {diasDeEstaRacion === 1 ? "día" : "días"}
                </span>
              </div>
              <p className="text-[11px] leading-snug mt-2" style={{ color: MALVA, fontFamily: fontBody }}>
                {diasYaPuestos > 0 ? (
                  <>
                    Ya hay <b>{diasYaPuestos}</b> {diasYaPuestos === 1 ? "día puesto" : "días puestos"} en
                    esta semana{diasQueQuedan > 0 ? <>, quedan <b>{diasQueQuedan}</b></> : null}. Lo que
                    esas raciones ya se han llevado del <b>presupuesto semanal de seguridad crónica</b>
                    {" "}se resta en el servidor antes de formular esta, así que puede salir más
                    apretada que si fuera sola. Si no sale, es que la semana ya está gastada.
                  </>
                ) : (
                  <>
                    Puedes hacer <b>varias raciones distintas</b> para la misma semana. Di cuántos días
                    cubre cada una y el servidor irá restando del presupuesto semanal de seguridad
                    crónica, igual que en el generador del tutor. Con una sola ración de un día no
                    cambia nada.
                  </>
                )}
              </p>
            </div>
          </div>

          {/* ─── LOS OBJETIVOS QUE PONE ÉL ────────────────────────────────
              En la misma unidad que el resto de la pantalla: g o mg por 1000
              kcal. Plegado por defecto, como las proporciones -- en la mayoría
              de las raciones no hay nada que fijar. */}
          <div className="mt-3 rounded-xl" style={{ background: PAPEL, border: "1px solid #E3DAF0" }}>
            <button onClick={() => setObjetivosAbiertos((v) => !v)}
              aria-expanded={objetivosAbiertos}
              className="w-full flex items-center justify-between px-3 py-2.5 text-left"
              style={{ background: "none", border: "none", cursor: "pointer" }}>
              <span>
                <span className="block text-[10px] tracking-[0.1em] uppercase"
                      style={{ color: MALVA, fontFamily: "monospace" }}>
                  Tus objetivos
                </span>
                <span className="block" style={{ color: TINTA, fontFamily: fontBody, fontSize: 13 }}>
                  {Object.keys(objetivos).length
                    ? `${Object.keys(objetivos).length} fijado${Object.keys(objetivos).length === 1 ? "" : "s"}`
                    : "Ninguno: manda lo de FEDIAF y la patología"}
                </span>
              </span>
              <ChevronDown size={16}
                style={{ color: MALVA, transform: objetivosAbiertos ? "rotate(180deg)" : "none" }} />
            </button>
            {objetivosAbiertos && (
              <div className="px-3 pb-3">
                <p className="text-[11px] leading-snug mb-2" style={{ color: MALVA, fontFamily: fontBody }}>
                  En <b>g o mg por 1000 kcal</b>, la misma unidad que los topes de patología. Solo
                  pueden <b>apretar</b>: un techo tuyo por encima del máximo de FEDIAF no hace
                  nada, y un suelo por debajo del mínimo se sube al de FEDIAF. Los requisitos no se
                  negocian.
                </p>
                <input type="search" value={buscaObjetivo}
                  onChange={(e) => setBuscaObjetivo(e.target.value)}
                  aria-label="Buscar nutriente" placeholder="Buscar nutriente…"
                  className="w-full py-1.5 px-2 mb-2 rounded-lg outline-none"
                  style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0",
                           color: TINTA, fontFamily: fontBody, fontSize: 13 }} />
                <div className="flex flex-col gap-1.5">
                  {objetivosVisibles.length === 0 && (
                    <p className="text-[11px]" style={{ color: MALVA, fontFamily: fontBody }}>
                      Ninguno de los {objetivosQueSeOfrecen.length} se llama así.
                    </p>
                  )}
                  {objetivosVisibles.map(({ clave, label }) => (
                    <div key={clave} className="flex items-center gap-2">
                      <span className="flex-1" style={{ color: TINTA, fontFamily: fontBody, fontSize: 13 }}>
                        {label}
                      </span>
                      <input type="number" inputMode="decimal"
                        value={objetivos[clave]?.min ?? ""}
                        onChange={(e) => ponerObjetivo(clave, "min", e.target.value)}
                        aria-label={`Mínimo de ${label}`} placeholder="mín"
                        className="w-20 py-1.5 px-2 rounded-lg outline-none text-right"
                        style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0",
                                 color: TINTA, fontFamily: fontBody, fontSize: 13 }} />
                      <input type="number" inputMode="decimal"
                        value={objetivos[clave]?.max ?? ""}
                        onChange={(e) => ponerObjetivo(clave, "max", e.target.value)}
                        aria-label={`Máximo de ${label}`} placeholder="máx"
                        className="w-20 py-1.5 px-2 rounded-lg outline-none text-right"
                        style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0",
                                 color: TINTA, fontFamily: fontBody, fontSize: 13 }} />
                    </div>
                  ))}
                </div>
                <p className="text-[10px] mt-2" style={{ color: MALVA, fontFamily: "monospace" }}>
                  {objetivosQueSeOfrecen.length} nutrientes · los que verifica el motor
                </p>
              </div>
            )}
          </div>

          {/* ⚠️ LO QUE EL MOTOR HA RECORTADO, SIEMPRE VISIBLE. Aplicar el
              número de FEDIAF en lugar del suyo sin decirlo le dejaría firmando
              algo que no es lo que escribió. */}
          {ajustes.length > 0 && (
            <div className="mt-2 rounded-xl px-3 py-2.5"
                 style={{ background: "#FFF7E8", border: "1px solid #F5DFA8" }}>
              <p className="text-[10px] tracking-[0.1em] uppercase mb-1"
                 style={{ color: "#B37A00", fontFamily: "monospace" }}>
                Lo que no se ha podido aplicar tal cual
              </p>
              {ajustes.map((a) => (
                <p key={`${a.nutriente}-${a.que_ha_pasado}`}
                   className="text-[11px] leading-snug mb-1 last:mb-0"
                   style={{ color: TINTA, fontFamily: fontBody }}>
                  <b>{nombreLegible(a.nutriente)}</b>: {a.explicacion}
                </p>
              ))}
            </div>
          )}

          {/* ─── LO QUE ESTÁ FUERA DE ESTA PRUEBA ─────────────────────────
              Se ve siempre que haya algo, y se quita de uno en uno. Un filtro
              que no se ve es un filtro que explica por qué no sale el menú sin
              que nadie pueda saberlo. */}
          {(fueraDeLaPrueba.nombres.length > 0 || fueraDeLaPrueba.categorias.length > 0) && (
            <div className="mt-3 rounded-xl px-3 py-2.5"
                 style={{ background: "#FFF4F6", border: "1px solid #F3D7DE" }}>
              <p className="text-[10px] tracking-[0.1em] uppercase mb-1.5"
                 style={{ color: ROSA, fontFamily: "monospace" }}>Fuera de esta prueba</p>
              <div className="flex flex-wrap gap-1.5">
                {fueraDeLaPrueba.categorias.map((c) => (
                  <button key={`c-${c}`} onClick={() => volverAMeter("categorias", c)}
                    aria-label={`Volver a meter ${c}`}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg"
                    style={{ background: "#FFFFFF", border: "1px solid #F3D7DE", color: TINTA,
                             fontFamily: fontBody, fontSize: 12, cursor: "pointer" }}>
                    {c} <X size={12} style={{ color: MALVA }} />
                  </button>
                ))}
                {fueraDeLaPrueba.nombres.map((n) => (
                  <button key={`n-${n}`} onClick={() => volverAMeter("nombres", n)}
                    aria-label={`Volver a meter ${n}`}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg"
                    style={{ background: "#FFFFFF", border: "1px solid #F3D7DE", color: TINTA,
                             fontFamily: fontBody, fontSize: 12, cursor: "pointer" }}>
                    {n} <X size={12} style={{ color: MALVA }} />
                  </button>
                ))}
              </div>
              <p className="text-[11px] leading-snug mt-1.5" style={{ color: MALVA, fontFamily: fontBody }}>
                Solo para esta formulación: no se guarda en la ficha del paciente. Las alergias y
                exclusiones de su ficha siguen puestas y no se quitan desde aquí.
              </p>
            </div>
          )}

          <button onClick={autocompletar} disabled={autocompletando}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl mt-3"
            style={{ background: VIOLETA, color: "#FFFFFF", border: "none",
                     fontFamily: fontDisplay, fontSize: 15,
                     opacity: autocompletando ? 0.6 : 1, cursor: "pointer" }}>
            <Sparkles size={16} /> {autocompletando ? "Completando…" : "Autocompletar lo que falta"}
          </button>
          {/* ⚠️ ESTO PROMETÍA UN RESULTADO Y NO PODÍA CUMPLIRLO (11 septiembre).
              Ponía «el motor completa alrededor» a secas, en indicativo. Elena:
              «hay un aviso que dice que se autocompleta el menú con los gramos
              que ya ha puesto y en la mayoría de casos no pasa; pon que se
              intentará y que saldrá un aviso si no es posible».
              Y era verdad y medible: con seis entradas realistas de un adulto de
              22 kg, CERO salían -- el endpoint probaba UN peldaño y se rendía,
              mientras el generador del dueño recorría la escalera entera. Eso ya
              está arreglado en el motor (4 de 6 ahora), pero el texto tampoco
              puede volver a prometer: lo que se promete es que sus cifras NO SE
              TOCAN, que eso sí se cumple siempre. */}
          <p className="text-[11px] mt-2 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
            Se intenta completar la ración alrededor de tus cantidades, <b>sin tocarlas</b>. Si no
            existe ninguna que cumpla con esas cifras, se dice — no se cambian por detrás. Lo que
            rellene se puede seguir editando.
          </p>

          {/* ─── LAS PROPORCIONES CON LAS QUE COMPLETA ─────────────────────
              Ver el comentario de `peldano`, arriba. Va aquí y no en un
              panel de ajustes porque es una decisión de ESTA ración: se
              cambia cuando autocompletar dice que no, no una vez y para
              siempre. Plegado por defecto — con las proporciones completas
              no hay nada que decidir. */}
          {peldanos && (
            <div className="mt-3 rounded-xl" style={{ background: PAPEL, border: "1px solid #E3DAF0" }}>
              <button onClick={() => setPeldanosAbiertos((v) => !v)}
                aria-expanded={peldanosAbiertos}
                className="w-full flex items-center justify-between px-3 py-2.5 text-left"
                style={{ background: "none", border: "none", cursor: "pointer" }}>
                <span>
                  <span className="block text-[10px] tracking-[0.1em] uppercase"
                        style={{ color: MALVA, fontFamily: "monospace" }}>
                    Proporciones
                  </span>
                  <span className="block" style={{ color: TINTA, fontFamily: fontBody, fontSize: 13 }}>
                    {(peldanos.find((p) => p.clave === peldano) || peldanos[0]).titulo}
                  </span>
                </span>
                <ChevronDown size={16}
                  style={{ color: MALVA, transform: peldanosAbiertos ? "rotate(180deg)" : "none" }} />
              </button>
              {peldanosAbiertos && (
                <div className="px-3 pb-3">
                  <p className="text-[11px] leading-snug mb-2" style={{ color: MALVA, fontFamily: fontBody }}>
                    Solo mueven la forma de la ración. Los 43 requisitos de FEDIAF, el ratio
                    Ca:P y los topes de seguridad y de patología son idénticos en todos, y la
                    ración se verifica igual.
                  </p>
                  <div className="flex flex-col gap-1.5">
                    {peldanos.map((p) => {
                      const puesto = p.clave === peldano;
                      return (
                        <button key={p.clave}
                          onClick={() => setPeldano(p.clave)}
                          aria-label={p.titulo}
                          className="text-left px-3 py-2 rounded-lg"
                          style={{ background: puesto ? "#F3EDFB" : "#FFFFFF",
                                   border: `1.5px solid ${puesto ? VIOLETA : "#E3DAF0"}`,
                                   cursor: "pointer" }}>
                          <span className="block" style={{ color: TINTA, fontFamily: fontBody,
                                                           fontSize: 13, fontWeight: puesto ? 700 : 400 }}>
                            {p.titulo}
                          </span>
                          <span className="block text-[11px] leading-snug mt-0.5"
                                style={{ color: MALVA, fontFamily: fontBody }}>
                            {p.que_se_suelta}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {avisoAuto && (
          <div className="rounded-2xl px-4 py-3 mb-3" style={{ background: "#FFF0F3" }}>
            <div className="flex gap-2 items-start">
              <AlertCircle size={16} style={{ color: ROSA, flexShrink: 0, marginTop: 2 }} />
              <p className="text-sm leading-snug" style={{ color: TINTA, fontFamily: fontBody }}>
                {avisoAuto}
              </p>
            </div>
            {alternativa && (
              <button
                onClick={() => {
                  setGramos(Object.fromEntries(
                    Object.entries(alternativa).map(([k, v]) => [k, redondea(v)])));
                  setAvisoAuto(null);
                  setAlternativa(null);
                }}
                className="mt-2 px-4 py-2 rounded-xl text-sm"
                style={{ background: VIOLETA, color: "#FFFFFF", border: "none",
                         fontFamily: fontBody, cursor: "pointer" }}>
                Ver la ración que sí cuadra con estos alimentos
              </button>
            )}
          </div>
        )}

        {topesRotos.length > 0 && (
          <div className="rounded-2xl px-4 py-3 mb-3" style={{ background: "#FFF0F3" }}>
            <p className="text-[11px] tracking-[0.14em] uppercase mb-1"
               style={{ color: ROSA, fontFamily: "monospace" }}>
              Topes por patología
            </p>
            {topesRotos.map((t) => (
              <p key={t} className="text-sm" style={{ color: TINTA, fontFamily: fontBody }}>{t}</p>
            ))}
            <p className="text-[11px] mt-1 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
              El semáforo de FEDIAF no los ve: son los requisitos de un perro sano.
            </p>
          </div>
        )}

        {problemas.length > 0 && (
          <div className="rounded-2xl px-4 py-3 mb-3"
               style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
            <p className="text-[11px] tracking-[0.14em] uppercase mb-1"
               style={{ color: MALVA, fontFamily: "monospace" }}>
              Seguridad
            </p>
            {problemas.map((p, i) => (
              <p key={i} className="text-sm mb-1" style={{ color: TINTA, fontFamily: fontBody }}>
                {typeof p === "string" ? p : (p?.texto || p?.mensaje || JSON.stringify(p))}
              </p>
            ))}
          </div>
        )}

        {/* LOS NUTRIENTES, POR CATEGORÍAS Y EN VIVO */}
        {grupos.map((g) => (
          <div key={g.titulo} className="rounded-2xl px-4 py-3 mb-3"
               style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[11px] tracking-[0.14em] uppercase"
                 style={{ color: MALVA, fontFamily: "monospace" }}>
                {g.titulo}
              </p>
              <p className="text-[11px]" style={{ color: MALVA, fontFamily: "monospace" }}>
                {g.cuantos.dentro}/{g.filas.length}
              </p>
            </div>
            {g.filas.map((f) => (
              <div key={f.nutriente} className="flex items-baseline justify-between py-1"
                   style={{ borderTop: "1px solid #F0EBF8" }}>
                <span className="text-sm" style={{ color: TINTA, fontFamily: fontBody }}>
                  {nombreLegible(f.nutriente)}
                </span>
                <span className="text-xs text-right ml-2" style={{ fontFamily: "monospace",
                                                                   color: COLOR_ESTADO[f.estado] }}>
                  {f.estado === "falta" && `${f.tiene} de ${f.necesita} (${f.cubre_pct}%)`}
                  {f.estado === "se_pasa" && `${f.tiene} · máx ${f.maximo} (×${f.veces})`}
                  {f.estado === "dentro" && (
                    f.sin_referencia
                      ? `${f.tiene} · FEDIAF no da referencia en esta etapa`
                      : `${f.tiene}${f.minimo !== null ? ` · mín ${f.minimo}` : ""}` +
                        `${f.maximo !== null ? ` · máx ${f.maximo}` : ""}`
                  )}
                </span>
              </div>
            ))}
          </div>
        ))}

        {error && (
          <p className="text-sm mb-3" style={{ color: ROSA, fontFamily: fontBody }}>{error}</p>
        )}

        {/* ─── FIRMAR ─────────────────────────────────────────────────
            Una pauta firmada es la forma más difícil de retirar que tiene
            un menú de salir de aquí, así que no se firma a ciegas: antes
            de pulsar se enseña con qué nombre y número va a salir, y los
            huecos del catálogo con los que se ha calculado. Los huecos van
            además DENTRO del documento -- es incómodo y es exactamente por
            eso: lo contrario es firmar sobre datos incompletos sin que
            conste en ninguna parte. */}
        {pautaFirmada ? (
          <div className="rounded-2xl px-4 py-4 mb-6"
               style={{ background: "#FFFFFF", border: `1.5px solid ${VERDE}` }}>
            <div className="flex items-center gap-2 mb-1">
              <Check size={17} style={{ color: VERDE }} />
              <p style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 16 }}>
                Pauta firmada
              </p>
            </div>
            <p className="text-sm leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
              {pautaFirmada.firmante?.nombre} · nº {pautaFirmada.firmante?.num_colegiado}
            </p>
            <p className="text-xs mt-2" style={{ color: MALVA, fontFamily: "monospace" }}>
              sello {pautaFirmada.sello}
            </p>
            <p className="text-[11px] mt-2 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
              Queda guardada tal cual, con la ficha con la que se comprobó. No se edita: si
              hay que cambiar algo, se firma otra y ésta se queda en el historial.
            </p>
            {/* ⚠️ AQUÍ MISMO (8 septiembre). Firmar y no poder entregar el
                papel en el mismo sitio obligaba a salir a «Pautas firmadas»
                a buscar la que se acaba de hacer. El final del trabajo es
                lo que se lleva el tutor. */}
            {onImprimir && (
              <button onClick={() => onImprimir(pautaFirmada)}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl mt-3"
                style={{ background: VIOLETA, color: "#FFFFFF", border: "none",
                         fontFamily: fontDisplay, fontSize: 15, cursor: "pointer" }}>
                <Printer size={16} /> Imprimir o guardar en PDF
              </button>
            )}
          </div>
        ) : firmando ? (
          <div className="rounded-2xl px-4 py-4 mb-6"
               style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
            <p className="text-[11px] tracking-[0.14em] uppercase mb-2"
               style={{ color: MALVA, fontFamily: "monospace" }}>
              Firmar la pauta
            </p>
            <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: fontBody }}>
              Sale con tu nombre y tu número de colegiado, y se guarda entera: el menú, la
              ficha con la que se comprobó y los datos con los que se calculó.
            </p>
            <input
              type="text" value={nombreFirmante}
              onChange={(e) => setNombreFirmante(e.target.value)}
              placeholder="Nombre y apellidos"
              aria-label="Nombre del firmante"
              className="w-full py-2.5 px-3 rounded-xl outline-none mb-2"
              style={{ background: PAPEL, border: "1.5px solid #E3DAF0",
                       color: TINTA, fontFamily: fontBody }} />
            <p className="text-xs mb-3" style={{ color: MALVA, fontFamily: fontBody }}>
              Nº de colegiado:{" "}
              <span style={{ color: TINTA, fontWeight: 700 }}>
                {firmante?.num_colegiado || "—"}
              </span>
            </p>
            {/* ⚠️ REESCRITO (29 agosto) — CASO REAL DE LA USUARIA mirando esta
                pantalla: "esto que sale aquí asusta y no se entiende bien", y
                debajo `calcio, araquidonico, dha, epa, ..., vitA`:
                veinticuatro claves en crudo, sin una frase, justo encima del
                botón de firmar.
                Un hueco NO es un fallo del menú, y la pantalla tiene que
                poder decirlo: es que de algún ALIMENTO de la ración no está
                publicado ese dato. Ahora se dice qué es, qué consecuencia
                tiene, y a qué alimento le falta -- que es lo único
                accionable: se puede cambiar ese alimento por otro. */}
            {(estado?.huecos || []).length > 0 && (
              <div className="rounded-xl px-3 py-2 mb-3" style={{ background: PAPEL }}>
                <p className="text-xs mb-1" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 700 }}>
                  Datos que faltan en el catálogo
                </p>
                <p className="text-xs leading-snug mb-1" style={{ color: MALVA, fontFamily: fontBody }}>
                  De {contarAlimentosConHueco(estado)} de los alimentos de esta ración no está
                  publicado el valor de {estado.huecos.length}{" "}
                  {estado.huecos.length === 1 ? "nutriente" : "nutrientes"}. Se cuentan como
                  cero, así que la ración aporta eso o más, nunca menos. Queda escrito en la
                  pauta.
                </p>
                <button onClick={() => setHuecosAbiertos((v) => !v)}
                        className="text-xs"
                        style={{ background: "transparent", border: "none", color: VIOLETA,
                                 fontFamily: fontBody, cursor: "pointer", padding: 0 }}>
                  {huecosAbiertos ? "Ocultar el detalle" : "Ver cuáles"}
                </button>
                {huecosAbiertos && (
                  <div className="mt-1">
                    {estado.huecos.map((h) => (
                      <p key={h.clave + h.tipo} className="text-[11px] leading-snug"
                         style={{ color: MALVA, fontFamily: fontBody }}>
                        <span style={{ color: TINTA }}>{h.nombre}</span>
                        {h.tipo === "dato_dudoso" && " (valor de etiqueta que no cuadra)"}
                        {" — "}{h.alimentos.join(", ")}
                      </p>
                    ))}
                  </div>
                )}
              </div>
            )}
            {errorFirma && (
              <p className="text-sm mb-2" style={{ color: ROSA, fontFamily: fontBody }}>{errorFirma}</p>
            )}
            <div className="flex gap-2">
              <button onClick={firmar}
                disabled={enviandoFirma || !nombreFirmante.trim() || !firmante?.num_colegiado}
                className="flex-1 py-3 rounded-xl"
                style={{ background: (nombreFirmante.trim() && firmante?.num_colegiado)
                                       ? VIOLETA : "#E3DAF0",
                         color: (nombreFirmante.trim() && firmante?.num_colegiado)
                                  ? "#FFFFFF" : MALVA,
                         border: "none", fontFamily: fontDisplay, fontSize: 15,
                         cursor: "pointer" }}>
                {enviandoFirma ? "Firmando…" : "Firmar"}
              </button>
              <button onClick={() => { setFirmando(false); setErrorFirma(null); }}
                className="px-4 py-3 rounded-xl"
                style={{ background: PAPEL, border: "1.5px solid #E3DAF0", color: MALVA,
                         fontFamily: fontBody, cursor: "pointer" }}>
                Cancelar
              </button>
            </div>
            {!firmante?.num_colegiado && (
              <p className="text-xs mt-2 leading-snug" style={{ color: ROSA, fontFamily: fontBody }}>
                Tu ficha no tiene número de colegiado. Una pauta sin número no identifica a
                nadie, así que no se puede firmar hasta que esté.
              </p>
            )}
          </div>
        ) : onFirmar ? (
          <button onClick={() => { setFirmando(true); setErrorFirma(null); }}
            disabled={!puedeGuardar}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl mb-3"
            style={{ background: puedeGuardar ? VIOLETA : "#E3DAF0",
                     color: puedeGuardar ? "#FFFFFF" : MALVA, border: "none",
                     fontFamily: fontDisplay, fontSize: 15,
                     cursor: puedeGuardar ? "pointer" : "default" }}>
            <Check size={16} /> Firmar la pauta
          </button>
        ) : null}

        {/* ── CÓMO DARLO ──────────────────────────────────────────────
            Lo propone Rawku y lo escribe él. Va con la pauta: sin esto, lo
            que se firma son unos gramos y el tutor se queda sin saber qué
            hacer con ellos. */}
        {Object.keys(soloPositivos(gramos)).length > 0 && (
          <div className="rounded-2xl px-4 py-3 mb-3"
               style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
            <div className="flex items-center justify-between mb-1">
              <p className="text-[11px] tracking-[0.14em] uppercase"
                 style={{ color: MALVA, fontFamily: "monospace" }}>
                Cómo darlo
              </p>
              {indicacionesTocadas && (
                <button onClick={() => { setIndicacionesTocadas(false); setIndicaciones(propuesta); }}
                        className="text-[11px]"
                        style={{ background: "transparent", border: "none", color: VIOLETA,
                                 fontFamily: fontBody, cursor: "pointer", padding: 0 }}>
                  Volver a la propuesta
                </button>
              )}
            </div>
            <p className="text-[11px] mb-2 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
              Propuesto por Rawku con las indicaciones de cada alimento. Es un borrador: cámbialo,
              quita lo que no aplique y añade lo tuyo. Va dentro de la pauta.
            </p>
            <textarea
              value={indicaciones}
              onChange={(e) => { setIndicacionesTocadas(true); setIndicaciones(e.target.value); }}
              aria-label="Cómo darlo"
              rows={8}
              className="w-full py-2 px-3 rounded-xl outline-none"
              style={{ background: PAPEL, border: "1.5px solid #E3DAF0", color: TINTA,
                       fontFamily: fontBody, fontSize: 13, lineHeight: 1.5, resize: "vertical" }} />
          </div>
        )}

        {onGuardar && !pautaFirmada && (
          <button onClick={async () => {
              // ⚠️ LOS DÍAS VIAJAN CON LA RACIÓN AL GUARDARLA (11 septiembre).
              // Sin esto, «esta ración cubre N días» servía para ESTA llamada y
              // se perdía: la siguiente ración de la semana no tenía forma de
              // saber cuánto presupuesto semanal se habían llevado las
              // anteriores, así que la protección estaba construida en el motor
              // (BLOQUE 92) y no se estaba usando en la app.
              await onGuardar(soloPositivos(gramos), estado, indicaciones, diasDeEstaRacion);
              setGuardada(true);
            }}
            disabled={!puedeGuardar}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl mb-6"
            style={{ background: puedeGuardar ? VIOLETA : "#E3DAF0",
                     color: puedeGuardar ? "#FFFFFF" : MALVA, border: "none",
                     fontFamily: fontDisplay, fontSize: 15,
                     cursor: puedeGuardar ? "pointer" : "default" }}>
            <Check size={16} /> {guardada ? "Guardada" : "Guardar la pauta"}
          </button>
        )}
        {guardada && !pautaFirmada && (
          <div className="rounded-2xl px-4 py-3 mb-6" style={{ background: "#EAF5EF" }}>
            <p className="text-sm" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 700 }}>
              Guardada en los menús de {perfil?.nombre || "este paciente"}
            </p>
            <p className="text-xs mt-1 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
              Sigue aquí por si quieres seguir ajustándola. Para verla o volver a ella, entra por
              el menú lateral.
            </p>
          </div>
        )}
        {!puedeGuardar && ficha && (
          <p className="text-xs mb-6 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
            La pauta se puede guardar cuando la ración cumple los requisitos y no rompe ningún
            tope. Lo que falta está arriba, nutriente a nutriente.
          </p>
        )}
      </div>
    </div>
  );
}

// A cuántos ALIMENTOS de la ración les falta algún dato. Es el número que
// hace entendible el otro: "23 nutrientes" asusta y no dice nada; "de 3 de
// los alimentos no está publicado el valor de 23 nutrientes" se entiende, y
// además apunta a lo único que se puede hacer -- cambiar ese alimento.
function contarAlimentosConHueco(estado) {
  const con = new Set();
  for (const h of estado?.huecos || []) for (const a of h.alimentos || []) con.add(a);
  return con.size;
}

function soloPositivos(gramos) {
  const salida = {};
  for (const [k, v] of Object.entries(gramos || {})) {
    const n = Number(v);
    if (n > 0) salida[k] = n;
  }
  return salida;
}

function sumaDe(gramos) {
  return Object.values(gramos || {}).reduce((a, v) => a + (Number(v) || 0), 0);
}

function redondea(v) {
  return Math.round(Number(v) * 10) / 10;
}
