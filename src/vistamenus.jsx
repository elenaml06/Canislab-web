// ─── LA PANTALLA DE LOS MENÚS ──────────────────────────────────────────────
//
// 2.500 líneas que vivían dentro de App.jsx. No cambia nada de lo que hace:
// es el mismo componente, con las mismas props, en un fichero propio.

import FichaClinica from "./fichaclinica";
import PremiumGate from "./premiumgate";
import QueCambiaLaPatologia from "./topespatologia.jsx";
import { guardarPerro } from "./almacen";
import { API_BASE, fetchConTimeout } from "./api.js";
import { ESCALA_BCS, bcsDesdeCondicion, bcsVigente, condicionDesdeBcs, pesoIdealDesdeBcs } from "./bcs";
import { calcularDER, pesoEsperado } from "./der.js";
import { COMO_DAR_ALIMENTO, INSTRUCCIONES_POR_CATEGORIA } from "./instrucciones";
import { capturarError } from "./sentry.js";
import { AlertCircle, Beef, CheckCircle2, ChevronRight, ClipboardList, Dog, Heart, HeartPulse, Info, Lock, MoreVertical, Pencil, Plus, Salad, Trash2, UtensilsCrossed, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { MALVA, PAPEL, ROSA, TINTA, VERDE, VERDE_TEXTO, VIOLETA, fontBody, fontDisplay, fontMono } from "./estilo";
import { PAYWALL_ES_DEMO } from "./paywall";
import { formatearComprimidos, formatearGramos, nombreDeRaza } from "./formato";
import { CATEGORIAS_ALIMENTO, CATEGORIAS_ICONOS, categoriaDeAlimento } from "./catalogoapp";
import { datosPatologia } from "./patologiasapp";
import { CONDICIONES, ETAPA_A_SUFIJO_API, comoVaLaDieta, datosDeUnPerro, objetivoVigente, pesoIdealDesdeCondicion, repartirDiasSemana } from "./perro";
import { BotonMenu, Fuentes, ListaDeEspecies } from "./piezas";

// ⚠️ CONECTADO al motor nuevo (5 agosto): /menu/v2 devuelve UNA respuesta
// con la clave "menu" (no "gramos" como el /menu viejo, y no un array). Se
// adapta aqui para que VistaMenus siga recibiendo el mismo formato de
// siempre (lista de menus con items), sin tocar VistaMenus.
export function respuestaApiAMenu(respuestas, derObjetivo) {
  const lista = Array.isArray(respuestas) ? respuestas : [respuestas];
  // ⚠️ CORREGIDO (5 agosto, madrugada) — FALLO GRAVE ENCONTRADO, caso
  // real reportado: con 2 menús, Math.round(7/2) = Math.round(3.5) = 4
  // se aplicaba a AMBOS por igual -- 4 + 4 = 8 días en una semana de 7.
  // El mismo problema con cualquier N que no divida 7 exacto. Ahora se
  // reparte de verdad: base = 7 dividido entero entre N, y el resto
  // (lo que sobra de la división) se reparte de uno en uno entre los
  // primeros menús -- así la suma da siempre exactamente 7, sea cual
  // sea N. Con N=2: [4, 3]. Con N=3: [3, 2, 2]. Con N=4: [2, 2, 2, 1].
  const diasPorMenuArr = repartirDiasSemana(lista.length);
  return lista.map((data, i) => {
    const gramosPorAlimento = data.menu || data.gramos || {};
    const items = Object.entries(gramosPorAlimento).map(([alimento, gramos]) => {
      const categoria = categoriaDeAlimento(alimento);
      const Icono = (CATEGORIAS_ICONOS.find((c) => c.nombre === categoria) || {}).Icono || Beef;
      return { categoria, Icono, alimento, gramos, porque: null };
    });
    return {
      id: i + 1,
      // ⚠️ EL NOMBRE GUARDADO MANDA (26 agosto). Antes esto era siempre
      // "Menú 1", "Menú 2"... calculado al vuelo, así que renombrar uno no
      // se veía en ninguna parte: el nombre existía en la base de datos y la
      // pantalla lo pisaba con el número cada vez que se abría.
      nombre: data.nombre || `Menú ${i + 1}`,
      dias: diasPorMenuArr[i],
      kcal: Math.round(derObjetivo),
      items,
      // ⚠️ AÑADIDO (5 agosto): antes el "27/27 OK" era texto fijo, sin
      // ningún dato real detrás. Ahora se lleva la ficha de verdad que
      // devuelve /menu/v2 (semáforo, correctos, total) para mostrarla.
      ficha: data.ficha || null,
      // ⚠️ AÑADIDO (5 agosto, madrugada) — AUDITORÍA: el servidor YA
      // calculaba estos avisos de seguridad (tiaminasa, clara de huevo
      // sola, hígado en exceso, patologías...) en cada respuesta, pero
      // nunca se leían aquí -- se perdían sin que nadie los viera.
      problemasSeguridad: data.problemas_seguridad || [],
      // ⚠️ AÑADIDO — mismo caso que problemasSeguridad: el servidor ya
      // mandaba esto y no se leía en ningún sitio. Explica por qué a
      // este menú le falta una categoría entera (típicamente vísceras o
      // hígado, cuando el perro tiene varias alergias y no hay ninguna
      // compatible). El menú cumple los 30 requisitos igual, pero no se
      // parece a los demás -- sin explicación, parece un error.
      avisoComposicion: data.aviso_composicion || null,
    };
  });
}

export const MENUS_EJEMPLO = [
  { id: 1, nombre: "Menú 1", dias: 3, kcal: 1120, items: [
    { categoria: "Carne muscular", Icono: Beef, alimento: "Pechuga de pavo sin piel", gramos: 520, porque: null },
    { categoria: "Hueso carnoso", Icono: Beef, alimento: "Cuello de pavo", gramos: 75, porque: null },
    { categoria: "Vísceras", Icono: HeartPulse, alimento: "Corazón de cordero", gramos: 38, porque: null },
    { categoria: "Hígado", Icono: HeartPulse, alimento: "Hígado de vaca", gramos: 38, porque: "cubre Vitamina B12 y Riboflavina" },
    { categoria: "Verduras y frutas", Icono: Salad, alimento: "Calabaza + Manzana", gramos: 75, porque: null },
  ]},
  { id: 2, nombre: "Menú 2", dias: 2, kcal: 1120, items: [
    { categoria: "Carne muscular", Icono: Beef, alimento: "Ternera con grasa", gramos: 490, porque: null },
    { categoria: "Hueso carnoso", Icono: Beef, alimento: "Costillas de ternera", gramos: 75, porque: null },
    { categoria: "Vísceras", Icono: HeartPulse, alimento: "Riñón de ternera", gramos: 38, porque: null },
    { categoria: "Hígado", Icono: HeartPulse, alimento: "Hígado de pollo", gramos: 45, porque: "cubre Folato" },
    { categoria: "Verduras y frutas", Icono: Salad, alimento: "Brócoli + Pera", gramos: 75, porque: null },
  ]},
  { id: 3, nombre: "Menú 3", dias: 2, kcal: 1120, items: [
    { categoria: "Pescados y mariscos", Icono: Beef, alimento: "Salmón", gramos: 480, porque: null },
    { categoria: "Hueso carnoso", Icono: Beef, alimento: "Alitas de pollo", gramos: 75, porque: null },
    { categoria: "Vísceras", Icono: HeartPulse, alimento: "Pulmón de cordero", gramos: 38, porque: null },
    { categoria: "Hígado", Icono: HeartPulse, alimento: "Hígado de vaca", gramos: 38, porque: "cubre Vitamina A" },
    { categoria: "Verduras y frutas", Icono: Salad, alimento: "Zanahoria + Plátano", gramos: 75, porque: null },
  ]},
];

// ⚠️ AMPLIADO — `soloSeccion` abre VistaMenus directamente en una de sus
// secciones (Evolución, Analizar...) sin pintar la vista de menús que hay
// detrás. Esas secciones no dependen para nada de que haya un menú recién
// generado -- son la ficha de peso y el analizador de dieta -- pero
// estaban programadas aquí dentro, así que desde el perfil no había forma
// de llegar a ellas. Esto es lo que hace de puerta.
export function VistaMenus({ menus, onVolver, soloSeccion = null, modo, alimentosEvitados, patologias, nombrePerro, necesitaTransicion, dietaActual, categoriasDisponibles, perfil, derReal, etapaLabel, etapaCalculada, especiesExcluidas, pesoAdultoEsperado, pesoObjetivoKg = null, edad, set, setFase, avisoNoForzado, diagnosticoPersonalizar, avisoExtraEspecie, premium, onMostrarSuscripcion, onRegenerarConAlimentos, usuario = null, onPerroGuardado = () => {}, onCrearCuenta = () => {}, burbuja = null, burbujaClara = null, onAbrirLaCompra = null, onMenuEditado = null, onAbrirPanel = null,
  // ⚠️ AÑADIDO (26 agosto) — los tres puntos de CADA menú de la semana.
  // Pedido expreso: "se tiene que poder borrar y editar desde dentro y desde
  // fuera; cada menú individual de la semana y el global". Solo llega con
  // valor si el menú está GUARDADO: renombrar uno recién generado que
  // todavía no se ha guardado no tendría dónde escribirse.
  onAccionesDeMenu = null,
  // ⚠️ AÑADIDO (28 agosto) — el modo profesional. Llega como prop y no se
  // calcula aquí a propósito: quién está acreditado lo decide Supabase y lo
  // resuelve `rol.js` en un solo sitio. Por defecto false, así que cualquier
  // camino que se olvide de pasarlo enseña la vista de tutor -- que es el
  // lado seguro del error.
  enModoProfesional = false }) {
  const [tabActiva, setTabActiva] = useState(menus[0].id);
  // ⚠️ AÑADIDO — LAS DOS PESTAÑAS DEL RESULTADO. Pedido expreso: la
  // pantalla del menú era un scroll larguísimo donde el plan de
  // transición y la congelación quedaban enterrados a mitad de
  // camino, y cómo preparar cada alimento estaba escondido detrás
  // del icono de cubiertos de cada fila -- para verlo todo antes de
  // ponerte a cocinar había que ir abriéndolos de uno en uno.
  //
  // "El menú" = qué le doy. "Cómo darlo" = cómo se lo doy.
  //
  // OJO: no confundir con `tabActiva`, que es OTRA cosa -- ésa elige
  // entre Menú 1 / Menú 2 / ... cuando se piden varios.
  const [vistaActiva, setVistaActiva] = useState("menu");
  // ⚠️ AÑADIDO (5 agosto, madrugada): estado LOCAL para poder cerrar
  // este aviso -- se inicializa a partir de la prop, pero una vez
  // cerrado no debe volver a aparecer solo porque el componente se
  // vuelva a renderizar.
  const [avisoNoForzadoVisible, setAvisoNoForzadoVisible] = useState(avisoNoForzado);
  // ⚠️ AÑADIDO (5 agosto, madrugada): mismo patrón que avisoNoForzado --
  // estado local para poder cerrarlo.
  const [avisoExtraEspecieVisible, setAvisoExtraEspecieVisible] = useState(avisoExtraEspecie);
  // ⚠️ QUITADO (5 agosto, madrugada): el selector de mascotas no hacía
  // nada funcional (ni siquiera "Añadir mascota" tenía onClick), y tras
  // quitar el único botón que lo abría (para poner el menú siempre en
  // el mismo sitio), se quedaba sin ninguna forma de acceder -- código
  // muerto. Se retoma el día que exista de verdad la gestión de varias
  // mascotas.
  const [seccionActiva, setSeccionActiva] = useState(soloSeccion);

  // ⚠️ CASO REAL ENCONTRADO (25 agosto): "desde analizar la dieta actual
  // también hay ciertas pantallas a las que no puedo ir". Era esto, y no
  // el panel: `seccionActiva` se estrenaba con `soloSeccion` y ahí se
  // quedaba para siempre. Estando en Analizar y pidiendo Evolución, el
  // padre cambiaba `soloSeccion` -- pero esta vista seguía montada, con la
  // sección de antes puesta. El panel se abría, la entrada se pulsaba, la
  // navegación ocurría... y la pantalla no cambiaba. Ni un error.
  //
  // Solo se sigue a `soloSeccion`. Cerrar la sección desde dentro
  // (`seccionActiva = null`) tiene que poder salir, y por eso el efecto de
  // abajo existe aparte: si éste mirara las dos, se pisarían.
  useEffect(() => {
    if (soloSeccion) setSeccionActiva(soloSeccion);
  }, [soloSeccion]);

  // En modo "sólo una sección" no hay vista de menús detrás a la que
  // volver: cerrar la sección significa salir de aquí del todo. Así los
  // botones de "← Volver" existentes siguen valiendo sin tocarlos uno a uno.
  useEffect(() => {
    if (soloSeccion && seccionActiva === null) onVolver?.();
  }, [soloSeccion, seccionActiva, onVolver]);
  // ⚠️ AÑADIDO (25 agosto) — al pesar hay que volver a mirar al perro.
  // CASO REAL: "cree el primer menú poniendo que pesaba 7 kg y que está
  // rellenita, y luego actualicé el peso a 6.2 pero sigue quedándose en
  // rellenito, entonces sigue metiendo menos kcal... si solo cambia el peso
  // y no cambia eso porque no se acuerda pues es un problema".
  //
  // Se pregunta DESPUÉS de guardar el peso, no antes: el peso ya está a
  // salvo pase lo que pase, y la pregunta no bloquea nada.
  const [preguntarCondicion, setPreguntarCondicion] = useState(false);
  const [objetivoConfirmado, setObjetivoConfirmado] = useState(false);
  const [semanaConfirmada, setSemanaConfirmada] = useState(false);
  const [dietaAnalizar, setDietaAnalizar] = useState([]);
  const [abiertoAnalizar, setAbiertoAnalizar] = useState(null);
  const [resultadoAnalisis, setResultadoAnalisis] = useState(null);
  const [analizando, setAnalizando] = useState(false);
  const [errorAnalisis, setErrorAnalisis] = useState(null);
  // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: algunas dietas
  // comerciales dan el reparto en % ("70% pollo"), no en gramos. Con
  // porcentaje, hace falta el total de gramos/día para poder convertir
  // cada % a gramos reales -- el resto del análisis sigue funcionando
  // en gramos por dentro, solo cambia cómo se introduce.
  // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: no siempre se
  // analiza la dieta DEL perro configurado en la app -- puede ser la
  // de otro perro (el de una prima, por ejemplo), sin querer crear un
  // perfil nuevo permanente solo para eso. Con esto, "otroPerroDatos"
  // guarda un perfil puntual (peso, etapa, edad si es cachorro) que
  // solo vive mientras se hace este análisis -- nunca se guarda como
  // mascota nueva. Si es null, se usa el perro normal de la app.
  const [analizandoParaOtro, setAnalizandoParaOtro] = useState(false);
  const [otroPerroDatos, setOtroPerroDatos] = useState({ peso: "", etapa: "adulto", meses: "", pesoAdulto: "" });
  const [modoEntradaAnalizar, setModoEntradaAnalizar] = useState("gramos");
  const [totalGramosDiaPorcentaje, setTotalGramosDiaPorcentaje] = useState("");
  // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: mostrar cuántas
  // kcal aporta lo que se va metiendo, comparado con lo que el perro
  // necesita, ANTES de pulsar "Analizar" -- no solo después. Para eso
  // hace falta la energía por 100g de cada alimento; se trae del
  // catálogo real (mismo dato que usa el servidor), no se inventa
  // ninguna cifra de "gramos esperados al día" genérica, porque eso
  // depende mucho de qué alimentos se elijan (el pato tiene el doble
  // de kcal/100g que la pechuga de pollo, por ejemplo).
  const [energiaAlimentos, setEnergiaAlimentos] = useState({});
  useEffect(() => {
    if (seccionActiva !== "analizar" || Object.keys(energiaAlimentos).length > 0) return;
    fetchConTimeout(`${API_BASE}/alimentos`)
      .then((res) => res.json())
      .then((data) => {
        const mapa = {};
        for (const lista of Object.values(data)) {
          for (const a of lista) mapa[a.nombre] = a.kcal_100g;
        }
        setEnergiaAlimentos(mapa);
      })
      .catch(() => {}); // si falla, simplemente no se muestra la comparación de kcal
  }, [seccionActiva]);

  // ⚠️ AÑADIDO (5 agosto, madrugada): el DER que se usa para ESTE
  // análisis -- el del perro de la app, o el calculado al vuelo para
  // "otro perro" si se eligió esa opción. Se reutiliza calcularDER,
  // la misma función que usa el resto de la app, con actividad
  // "normal" por defecto (no se pregunta, para mantener el formulario
  // rápido, tal como se pidió).
  const derParaAnalisis = useMemo(() => {
    if (!analizandoParaOtro) return derReal;
    const peso = Number(otroPerroDatos.peso);
    if (!peso || peso <= 0) return null;
    const opciones = { pesoAdultoKg: Number(otroPerroDatos.pesoAdulto) || undefined };
    return calcularDER(peso, otroPerroDatos.etapa, 1, false, opciones);
  }, [analizandoParaOtro, otroPerroDatos, derReal]);

  const analizarDietaActual = async () => {
    // ⚠️ AÑADIDO (5 agosto, madrugada): si se está analizando para
    // "otro perro" y aún no se ha calculado su DER (falta el peso),
    // no tiene sentido seguir -- el servidor necesita ese número.
    if (analizandoParaOtro && !derParaAnalisis) {
      setErrorAnalisis("Dinos al menos el peso del perro para poder calcular lo que necesita.");
      return;
    }
    const conValor = dietaAnalizar.filter((it) => Number(it.gramos) > 0);
    if (conValor.length === 0) {
      setErrorAnalisis(modoEntradaAnalizar === "porcentaje"
        ? "Añade al menos un alimento y dinos qué porcentaje es."
        : "Añade al menos un alimento y dinos cuántos gramos le das.");
      return;
    }
    // ⚠️ AÑADIDO (5 agosto, madrugada): si el modo es porcentaje, hace
    // falta el total de gramos/día para convertir cada % a gramos
    // reales antes de mandar nada al servidor -- el servidor solo
    // entiende gramos, el porcentaje es puramente de entrada.
    if (modoEntradaAnalizar === "porcentaje") {
      const total = Number(totalGramosDiaPorcentaje);
      if (!total || total <= 0) {
        setErrorAnalisis("Dinos cuántos gramos en total le das al día, para poder calcular los porcentajes.");
        return;
      }
      const sumaPct = conValor.reduce((s, it) => s + Number(it.gramos), 0);
      if (Math.round(sumaPct) !== 100) {
        setErrorAnalisis(`Los porcentajes deberían sumar 100 (ahora mismo suman ${Math.round(sumaPct)}).`);
        return;
      }
    }
    setAnalizando(true); setErrorAnalisis(null); setResultadoAnalisis(null);
    const totalParaConvertir = Number(totalGramosDiaPorcentaje) || 0;
    const gramos_por_alimento = {};
    conValor.forEach((it) => {
      const gramosReales = modoEntradaAnalizar === "porcentaje"
        ? (Number(it.gramos) / 100) * totalParaConvertir
        : Number(it.gramos);
      gramos_por_alimento[it.alimento] = (gramos_por_alimento[it.alimento] || 0) + gramosReales;
    });
    try {
      const resp = await fetchConTimeout(`${API_BASE}/analizar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gramos_por_alimento,
          der_objetivo: derParaAnalisis,
          etapa_requisitos: ETAPA_A_SUFIJO_API[analizandoParaOtro ? otroPerroDatos.etapa : etapaCalculada] || "Adulto",
        }),
      });
      const data = await resp.json();
      if (!data.ok) setErrorAnalisis(data.motivo || "No hemos podido analizar la dieta.");
      else setResultadoAnalisis(data);
    } catch (e) {
      setErrorAnalisis("No hemos podido conectar con el servidor. Inténtalo otra vez.");
    }
    setAnalizando(false);
  };
  const [nuevoPeso, setNuevoPeso] = useState("");
  const [avisoPesoActualizado, setAvisoPesoActualizado] = useState(false);
  const [porqueAbierto, setPorqueAbierto] = useState(null);
  const [comoAbierto, setComoAbierto] = useState(null);
  const [mostrarAyuda, setMostrarAyuda] = useState(true);
  const [infoNutrientes, setInfoNutrientes] = useState(false);
  const [supAbierto, setSupAbierto] = useState(false);
  const [supTipoAbierto, setSupTipoAbierto] = useState(null);
  const [recienRecalculado, setRecienRecalculado] = useState(false);
  const [editorAbierto, setEditorAbierto] = useState(null);
  const [recalculandoServidor, setRecalculandoServidor] = useState(false);
  const [gramosRealesPorMenu, setGramosRealesPorMenu] = useState({});
  const [errorRecalculo, setErrorRecalculo] = useState(null);
  // ⚠️ AÑADIDO (5 agosto, madrugada): para el aviso de "tuvimos que
  // cambiar también X" cuando editar un alimento no se pudo hacer
  // manteniendo todo lo demás igual -- distinto de errorRecalculo
  // (que es cuando el cambio pedido no fue posible en absoluto).
  const [avisoRecalculo, setAvisoRecalculo] = useState(null);
  // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: todos los avisos
  // que se quedan siempre visibles en pantalla deben poder cerrarse con
  // una X, para quien le moleste tenerlos ahí. Se reinician a visibles
  // cuando cambian los propios datos del aviso (por ejemplo, al
  // cambiar de pestaña de menú) -- si no, un aviso distinto y nuevo se
  // quedaría oculto para siempre solo porque el usuario cerró OTRO
  // aviso anterior.
  const [problemasSeguridadVisible, setProblemasSeguridadVisible] = useState(true);
  const [avisoComposicionVisible, setAvisoComposicionVisible] = useState(true);
  // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: recordatorio
  // general de congelación/descongelación, visible arriba del todo en
  // la pantalla de menús, no solo enterrado dentro del texto de "cómo
  // dar" de cada categoría (donde antes solo se veía si se pulsaba a
  // ver el detalle del hueso carnoso en concreto).
  const [avisoPatologiaVisible, setAvisoPatologiaVisible] = useState(true);
  const [diagnosticoPersonalizarVisible, setDiagnosticoPersonalizarVisible] = useState(true);
  useEffect(() => { setDiagnosticoPersonalizarVisible(true); }, [JSON.stringify(diagnosticoPersonalizar)]);
  // ⚠️ AÑADIDO (5 agosto, madrugada) — CASO REAL: la usuaria sigue
  // viendo alimentos cambiar al editar solo uno, sin ningún aviso, con
  // el servidor ya confirmado al día. Para poder diagnosticar de
  // verdad (en vez de seguir especulando), esto guarda EXACTAMENTE lo
  // que se mandó al servidor y lo que se recibió en la ÚLTIMA edición
  // -- para compararlo directamente, en vez de fiarse de la memoria.
  const [ultimoDiagnosticoEdicion, setUltimoDiagnosticoEdicion] = useState(null);
  const [fichaPorMenu, setFichaPorMenu] = useState({});
  // ⚠️ AÑADIDO (5 agosto, madrugada) — AUDITORÍA: mismo patrón que
  // fichaPorMenu -- se actualiza tras cada edición, para que los avisos
  // de seguridad reflejen el menú ACTUAL, no el original sin editar.
  const [problemasSeguridadPorMenu, setProblemasSeguridadPorMenu] = useState({});
  const [avisoComposicionPorMenu, setAvisoComposicionPorMenu] = useState({});

  const menu = menus.find((m) => m.id === tabActiva);
  const idxActiva = menus.findIndex((m) => m.id === tabActiva);
  const viendoBloqueado = necesitaTransicion && idxActiva > 0;
  const gramosReales = gramosRealesPorMenu[tabActiva];
  // ⚠️ CORREGIDO (5 agosto, madrugada) — FALLO GRAVE ENCONTRADO, caso
  // real reportado: al editar un alimento en cualquier modo, el
  // servidor recalcula el MENÚ ENTERO desde cero (no solo cambia el
  // alimento tocado) -- así que casi nunca coincide con la lista
  // visual original. Antes, esto recorría `menu.items` (la lista
  // VIEJA, con sus índices fijos) y para cada uno buscaba sus gramos
  // en `gramosReales` (el diccionario NUEVO) -- cualquier alimento
  // viejo que ya no estuviera en el menú nuevo se quedaba sin gramos
  // y el filtro final lo borraba de la pantalla. El resultado: se
  // veía solo la INTERSECCIÓN entre lo viejo y lo nuevo (unos pocos
  // alimentos por casualidad con el mismo nombre), nunca el menú
  // nuevo real y completo que el servidor sí había calculado bien --
  // de ahí los menús "rotos" de 4 alimentos y 60-400g que se
  // reportaron, aunque el servidor respondía correctamente. Ahora, si
  // hay un menú recalculado (gramosReales existe), la vista se
  // construye DIRECTAMENTE desde él -- todos sus alimentos, sean los
  // que sean -- en vez de intentar encajarlo en los huecos de la
  // lista vieja.
  const itemsBase = gramosReales
    ? Object.entries(gramosReales).map(([alimento, gramos]) => {
        const categoria = categoriaDeAlimento(alimento);
        const Icono = (CATEGORIAS_ICONOS.find((x) => x.nombre === categoria) || {}).Icono || Beef;
        return { alimento, categoria, Icono, gramos, porque: null };
      })
    : menu.items.map((it) => ({
        ...it,
        gramos: it.gramos,
      }));
  const ETIQUETA_MODO = {
    automatico: "AUTOMÁTICO",
    personalizar: "PERSONALIZADO",
  };
  const ORDEN_CATEGORIAS = [
    "Carne muscular", "Pescados y mariscos", "Hueso carnoso",
    "Vísceras", "Hígado", "Verduras y frutas", "Extras",
    "Suplementos comerciales", "Multivitamínico", "Yodo", "Calcio",
    "Omega-3", "Vitamina B", "Hierro", "Fibra",
  ];
  // ⚠️ CORREGIDO (5 agosto, madrugada): ya no hace falta concatenar
  // suplementosMenu aparte -- itemsBase (desde gramosReales, cuando
  // existe) ya incluye TODO lo que el servidor calculó, suplementos
  // incluidos. Concatenar una lista separada de "suplementos añadidos
  // a mano" los duplicaba en pantalla.
  const itemsMostrados = itemsBase.slice().sort((a, b) => {
    const ia = ORDEN_CATEGORIAS.indexOf(a.categoria);
    const ib = ORDEN_CATEGORIAS.indexOf(b.categoria);
    if (ia !== ib) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return b.gramos - a.gramos;
  });
  // ⚠️ QUITADO (5 agosto, madrugada) — pedido expreso: "menorGramo" y
  // "diasMinimoNecesario" solo se usaban para el aviso de "Algunos
  // alimentos salen a pocos gramos..." que se ha quitado -- se
  // quitan también, ya no los usa nada.
  // ⚠️ REHECHO (25 agosto) — CASO REAL ENCONTRADO: "cuando te genera varios
  // menús y te pones a cambiar las cantidades según si es para toda la
  // semana o para un solo día, y cambias de menú, no se refresca
  // automáticamente la pantalla del siguiente menú: tienes que darle a
  // algún botón para que se refresquen las cantidades".
  //
  // Aquí había un número de días suelto, COMPARTIDO por todas las pestañas.
  // Y cada menú cubre los suyos: el 1 puede durar 4 días y el 2 durar 3.
  // Estando en el menú 1 con "toda la semana" (4), al pasar al menú 2 el
  // número se quedaba en 4 -- así que se veían las cantidades de CUATRO
  // días de un menú que se da TRES. Ningún botón salía marcado, porque el 4
  // no era ninguna de sus opciones, y hasta que no tocabas uno las cifras
  // eran de otro menú. Eso no es un refresco que falta: es cocinar de más.
  //
  // Ahora no se guarda el número, se guarda la INTENCIÓN: "de un día" o "la
  // tanda entera". Los días salen del menú que estés mirando, así que no
  // pueden ser los de otro ni aunque se quiera.
  // ⚠️ Se pregunta antes de quitar, y no es por prudencia genérica: un
  // alimento quitado NO se puede volver a poner. "Añadir" solo existe para
  // suplementos comerciales, así que si quitas el pollo no hay forma de
  // devolverlo sin rehacer el menú entero.
  const [alimentoAQuitar, setAlimentoAQuitar] = useState(null);
  const [verLaTanda, setVerLaTanda] = useState(false);
  const diasSeleccionados = verLaTanda && menu.dias > 1 ? menu.dias : 1;
  const multiplicador = diasSeleccionados;


  const totalGramos = Math.round(itemsMostrados.reduce((s, it) => s + it.gramos, 0) * multiplicador * 10) / 10;
  // ⚠️ AÑADIDO (5 agosto): se sube aquí para que tanto el badge de arriba
  // como la nota informativa de abajo usen el MISMO dato real, en vez de
  // que cada uno lo calculara (o no) por su cuenta.
  const ficha = fichaPorMenu[tabActiva] || menu.ficha;
  // ⚠️ AÑADIDO (5 agosto, madrugada) — AUDITORÍA: el servidor ya
  // calculaba estos avisos (tiaminasa, clara de huevo sola, hígado en
  // exceso, límites por patología...) en cada respuesta, y nunca se
  // mostraban en ningún sitio -- se perdían en silencio.
  const problemasSeguridad = problemasSeguridadPorMenu[tabActiva] || menu.problemasSeguridad || [];
  // El aviso de composición va por menú igual que los de seguridad: en
  // una rotación, un menú puede llevar vísceras y otro no.
  // Se usa `??` y no `||` a propósito: tras editar, el servidor manda
  // null para decir "ya no falta nada", y con `||` ese null caería al
  // valor de la generación y el aviso se quedaría pegado para siempre.
  const avisoComposicion = tabActiva in avisoComposicionPorMenu
    ? avisoComposicionPorMenu[tabActiva]
    : (menu.avisoComposicion || null);
  useEffect(() => { setProblemasSeguridadVisible(true); }, [JSON.stringify(problemasSeguridad)]);
  useEffect(() => { setAvisoComposicionVisible(true); }, [avisoComposicion]);
  useEffect(() => { setAvisoPatologiaVisible(true); }, [JSON.stringify(patologias)]);

  // ⚠️ CORREGIDO (5 agosto, madrugada): mismo motivo que itemsBase --
  // si ya hay un menú recalculado, hay que decirle al servidor lo que
  // REALMENTE hay ahora (los alimentos nuevos que él mismo calculó),
  // no la lista original con sobreescrituras por índice. Si no, una
  // segunda edición seguida partía de datos ya desactualizados.
  const nombresActualesDelMenu = () =>
    gramosReales ? Object.keys(gramosReales) : menu.items.map((it) => it.alimento);
  const etapaSufijoApi = ETAPA_A_SUFIJO_API[etapaCalculada] || "Adulto";

  // ⚠️ CORREGIDO (5 agosto): antes esta función solo avisaba de un fallo
  // con un banner que era fácil no ver, y quien la llamaba (cambiarAlimento,
  // anadirSuplemento...) YA había cambiado el nombre/lista en pantalla ANTES
  // de saber si el cambio era válido -- así que si fallaba, el usuario veía
  // el nombre nuevo con los gramos viejos congelados, como si "no hiciera
  // nada". Ahora devuelve si funcionó o no, para que el cambio visual solo
  // se aplique DESPUÉS de confirmar que hay una combinación válida.
  const llamarRecalculo = async (endpoint, cuerpoExtra) => {
    setRecalculandoServidor(true);
    setErrorRecalculo(null);
    // ⚠️ AÑADIDO (5 agosto, madrugada): lo que HABÍA antes de mandar
    // esta petición, capturado ANTES de que nada cambie -- para poder
    // comparar contra lo que venga después.
    const antesDeVerdad = nombresActualesDelMenu();
    try {
      const res = await fetchConTimeout(`${API_BASE}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          der_objetivo: menu.kcal,
          etapa_requisitos: etapaSufijoApi,
          especies_excluidas: Array.from(especiesExcluidas || []),
          nombres_excluidos: Array.from(alimentosEvitados || []),
          peso_perro_kg: perfil?.pesoActual ? Number(perfil.pesoActual) : null,
          // ⚠️ AÑADIDO (5 agosto, noche): sin esto, el tope de calcio de
          // razas grandes/gigantes en crecimiento se perdía al editar un
          // alimento -- solo se respetaba al generar el menú por primera vez.
          peso_adulto_esperado_kg: pesoAdultoEsperado || null,
      peso_objetivo_kg: pesoObjetivoKg || null,
          ...cuerpoExtra,
        }),
      });
      const data = await res.json();
      if (data.factible) {
        // ⚠️ AÑADIDO (5 agosto, madrugada): comparación real,
        // nombre por nombre, entre lo que había y lo que llegó --
        // no gramos, solo si el ALIMENTO en sí sigue estando o no.
        const despuesDeVerdad = Object.keys(data.gramos);
        const desaparecidos = antesDeVerdad.filter((n) => !despuesDeVerdad.includes(n));
        const nuevos = despuesDeVerdad.filter((n) => !antesDeVerdad.includes(n));
        setUltimoDiagnosticoEdicion({
          endpoint,
          // ⚠️ AÑADIDO (5 agosto, madrugada) — CASO REAL, pedido
          // expreso: este diagnóstico es una variable de estado
          // ÚNICA compartida por toda la vista, sin ninguna
          // información de a qué menú pertenece -- así que al editar
          // el Menú 2 y luego cambiar a la pestaña del Menú 1, el
          // mismo aviso seguía apareciendo ahí también, aunque no
          // tuviera nada que ver con ese menú. Se guarda de qué
          // pestaña viene, y más abajo solo se muestra si coincide
          // con la pestaña que se está viendo ahora mismo.
          deTab: tabActiva,
          mandado: { menu_actual: cuerpoExtra?.menu_actual || antesDeVerdad, ...cuerpoExtra },
          antes: antesDeVerdad,
          despues: despuesDeVerdad,
          desaparecidos,
          nuevos,
          avisoDelServidor: data.aviso || null,
        });
        setGramosRealesPorMenu((prev) => ({ ...prev, [tabActiva]: data.gramos }));
        // ⚠️ AÑADIDO (24 agosto) — AVISAR HACIA FUERA DE QUE EL MENÚ CAMBIÓ.
        //
        // Al editar un alimento, el servidor recalcula el menú ENTERO y el
        // resultado se guardaba SOLO aquí dentro (`gramosRealesPorMenu`).
        // Fuera, `menuReal` seguía con el menú de antes -- y de `menuReal`
        // sale la lista de la compra. O sea: editabas, la pantalla te
        // enseñaba lo nuevo, y la compra te mandaba a comprar lo viejo. Sin
        // ningún error y sin nada que lo delatara.
        onMenuEditado?.(tabActiva, data.gramos);
        setFichaPorMenu((prev) => ({ ...prev, [tabActiva]: data.ficha }));
        // ⚠️ AÑADIDO (5 agosto, madrugada) — AUDITORÍA: al editar un
        // alimento, los avisos de seguridad pueden cambiar (un cambio
        // puede resolver un problema, o crear uno nuevo) -- había que
        // refrescarlos igual que se refresca la ficha.
        setProblemasSeguridadPorMenu((prev) => ({ ...prev, [tabActiva]: data.problemas_seguridad || [] }));
        // ⚠️ Mismo motivo: al editar, la composición puede cambiar. Si el
        // cambio hace que vuelvan a entrar las vísceras, el aviso tiene
        // que desaparecer -- por eso se guarda también cuando viene null,
        // en vez de dejar el de antes.
        setAvisoComposicionPorMenu((prev) => ({ ...prev, [tabActiva]: data.aviso_composicion || null }));
        // ⚠️ AÑADIDO (5 agosto, madrugada): si el servidor tuvo que
        // cambiar otros alimentos además del pedido para que el cambio
        // fuera viable, lo dice aquí -- se muestra como aviso, no como
        // error (el cambio SÍ se aplicó).
        //
        // ⚠️ CORREGIDO (5 agosto, madrugada) — CASO REAL, pedido
        // expreso: mismo problema que ultimoDiagnosticoEdicion, este
        // aviso era una variable global sin saber de qué menú venía,
        // así que seguía apareciendo al cambiar de pestaña. Se guarda
        // junto con la pestaña de origen, para poder filtrar al
        // mostrarlo.
        setAvisoRecalculo(data.aviso ? { texto: data.aviso, deTab: tabActiva } : null);
        return true;
      } else {
        // ⚠️ CORREGIDO (5 agosto, madrugada) — mismo problema que
        // avisoRecalculo/ultimoDiagnosticoEdicion: se guarda de qué
        // pestaña viene, para no seguir mostrándolo al cambiar de menú.
        setErrorRecalculo({ texto: data.motivo || "No se pudo recalcular con esta combinación.", deTab: tabActiva });
        return false;
      }
    } catch (err) {
      setErrorRecalculo({ texto: "No se ha podido conectar con el servidor para recalcular.", deTab: tabActiva });
      return false;
    } finally {
      setRecalculandoServidor(false);
    }
  };

  // ⚠️ CORREGIDO (5 agosto, madrugada): ya no hace falta guardar el
  // suplemento añadido aparte -- llamarRecalculo ya actualiza
  // gramosReales con el menú completo (el producto añadido incluido),
  // así que guardarlo también en suplementosPorMenu lo duplicaba en
  // pantalla.
  const anadirSuplemento = async (tipo, producto) => {
    setSupAbierto(false);
    setSupTipoAbierto(null);
    const ok = await llamarRecalculo("/menu/anadir", { menu_actual: nombresActualesDelMenu(), alimento: producto });
    if (!ok) return;
    setRecienRecalculado(true);
    setTimeout(() => setRecienRecalculado(false), 2500);
  };

  // ⚠️ CORREGIDO (5 agosto, madrugada): recibe el NOMBRE del producto
  // directamente, no un índice sobre una lista que ya no existe.
  // ⚠️ AÑADIDO (25 agosto) — PEDIDO EXPRESO: "me gustaría también que
  // existiese un botón de cruz o papelera para eliminar un alimento de una
  // dieta cuando se edita la dieta".
  //
  // El servidor ya sabía hacerlo (/menu/quitar, que excluye el alimento y
  // RESUELVE EL MENÚ ENTERO otra vez con el motor real, no le resta los
  // gramos y ya). Lo que faltaba era el botón: esta función existía desde
  // agosto para los suplementos y no la llamaba nadie.
  //
  // Importante que recalcule de verdad: quitar el hígado no es tener el
  // mismo menú con menos hígado, es otro menú que tiene que volver a
  // cumplir los 30 requisitos. Si con ese alimento fuera no hay menú
  // posible, el servidor lo dice y no se cambia nada.
  const quitarAlimento = async (alimento) => {
    setEditorAbierto(null);
    setAlimentoAQuitar(null);
    const ok = await llamarRecalculo("/menu/quitar", { menu_actual: nombresActualesDelMenu(), alimento });
    if (!ok) return;
    setRecienRecalculado(true);
    setTimeout(() => setRecienRecalculado(false), 2500);
  };

  // ⚠️ CORREGIDO (5 agosto, madrugada): recibe el NOMBRE del alimento
  // viejo directamente (ya no un índice que había que buscar en una
  // lista que podía no corresponder). "sobreescritosPorMenu" ya no
  // hace falta: itemsBase se construye directamente desde gramosReales
  // en cuanto existe, así que guardar overrides por índice aparte era
  // redundante -- y era, además, la fuente del fallo de fondo.
  const cambiarAlimento = async (alimentoViejo, alimentoNuevo) => {
    setEditorAbierto(null);
    await llamarRecalculo("/menu/cambiar", { menu_actual: nombresActualesDelMenu(), alimento_viejo: alimentoViejo, alimento_nuevo: alimentoNuevo });
  };

  return (
    <div className="cnl-pantalla-completa w-full flex flex-col" style={{ background: PAPEL }}>
      <Fuentes />
      {!soloSeccion && (<>
      <div style={{ background: VIOLETA }} className="w-full px-6 pt-8 pb-6">
        {/* ⚠️ CORREGIDO (5 agosto, madrugada) — pedido expreso: esta era
            la ÚNICA pantalla de toda la app con el menú a la IZQUIERDA
            -- en cualquier otro sitio está a la derecha. Esa
            inconsistencia era el problema real, no que faltara en
            ningún sitio. El menú va SIEMPRE a la izquierda -- y se
            quita de aquí la burbuja de mascota, que no hace nada
            funcional todavía (era solo una maqueta). */}
        <div className="flex items-center justify-between mb-4">
          <BotonMenu onClick={() => onAbrirPanel?.()} color="#FFFFFF" className="p-1" />
          {burbuja || <p className="text-sm" style={{ color: "#FFFFFF", fontFamily: fontDisplay }}>Rawku</p>}
        </div>
        {/* ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: una vez
            entrado en "tus menús" no había forma de volver a la
            verificación de datos del perro para corregir algo. Este
            mismo botón ya existía en las pantallas de antes de
            generar -- solo faltaba aquí, la pantalla final. */}
        <button onClick={() => setFase("onboarding")} className="text-xs mb-2" style={{ color: MALVA, fontFamily: fontBody }}>
          Editar perfil (alergias, exclusiones...)
        </button>
        <button onClick={onVolver} className="text-xs mb-2" style={{ color: MALVA, fontFamily: fontBody }}>
          ← Cambiar modo
        </button>
        <p className="text-[11px] tracking-[0.18em] uppercase mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>
          Semana de {nombrePerro}
        </p>
        {/* ─── EL PACIENTE, SIEMPRE A LA VISTA (7 septiembre) ─────────────
            En Nutrimenta, VetMenu o MyVetDiet los datos del caso no se
            esconden detrás de una pestaña: acompañan a la formulación en
            todo momento, porque es contra ellos contra lo que se decide si
            un número está bien. Aquí pasaba lo contrario -- el peso, la
            etapa, las kcal y la patología vivían cada uno en su pantalla, y
            el veterinario tenía que recordarlos mientras miraba los gramos.
            Una línea, en la cabecera, y solo en su modo: un tutor ya sabe
            que su perro pesa 24 kilos. */}
        {enModoProfesional && (
          <p className="text-[11px] leading-snug mb-3" style={{ color: "#D8CFEC", fontFamily: fontBody }}>
            {[
              nombrePerro,
              perfil?.raza ? nombreDeRaza(perfil.raza) : null,
              pesoObjetivoKg ? `${pesoObjetivoKg} kg objetivo` : (perfil?.pesoActual ? `${perfil.pesoActual} kg` : null),
              bcsVigente(perfil) ? `BCS ${bcsVigente(perfil)}` : null,
              etapaLabel,
              derReal ? `${Math.round(derReal)} kcal/día` : null,
            ].filter(Boolean).join(" · ")}
            {(patologias || []).length > 0 && (
              <span style={{ color: ROSA }}>
                {" · "}
                {patologias.map((k) => datosPatologia(k)?.label || k).join(" · ")}
              </span>
            )}
          </p>
        )}
        {/* ⚠️ AQUÍ, Y NO EN LA LISTA DE DENTRO (26 agosto). Los puse primero
            en la sección "Mis menús" que VistaMenus tiene dentro, y esa
            sección NO SE PUEDE ABRIR: solo aparece si el padre pasa
            `soloSeccion="menus"`, y nadie lo pasa -- el "Mis menús" del panel
            va a la pantalla de FUERA. Es código muerto desde hace tiempo. El
            botón se habría visto perfecto en el código y no lo habría
            encontrado nadie.
            Aquí está donde se está mirando el menú de verdad, al lado de su
            nombre. Solo con el menú GUARDADO: renombrar uno recién generado
            que aún no se ha guardado no tendría dónde escribirse. */}
        <div className="flex items-start justify-between gap-3 mb-5">
          <h1 className="text-3xl leading-tight min-w-0" style={{ color: "#FFFFFF", fontFamily: fontDisplay, fontWeight: 500 }}>
            {menus.length === 1 ? "Tu menú" : `Tus ${menus.length} menús`}
          </h1>
          {onAccionesDeMenu && (() => {
            const i = menus.findIndex((m) => m.id === tabActiva);
            if (i < 0) return null;
            return (
              <button
                onClick={() => onAccionesDeMenu(i)}
                aria-label={`Opciones de ${menus[i].nombre}`}
                className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center mt-1"
                style={{ background: "rgba(255,255,255,0.14)", border: "none" }}
              >
                <MoreVertical size={16} style={{ color: "#FFFFFF" }} />
              </button>
            );
          })()}
        </div>
        {menus.length > 1 && (
          <div className="flex gap-2">
            {menus.map((m, idx) => {
              const activo = m.id === tabActiva;
              const bloqueado = necesitaTransicion && idx > 0;
              return (
                <button
                  key={m.id}
                  onClick={() => { setTabActiva(m.id); setPorqueAbierto(null); }}
                  className="flex-1 py-2.5 rounded-xl text-center"
                  style={{
                    background: bloqueado ? (activo ? "rgba(255,111,145,0.28)" : "rgba(255,255,255,0.06)") : activo ? ROSA : "rgba(255,255,255,0.1)",
                    color: bloqueado ? (activo ? "#FFFFFF" : "rgba(255,255,255,0.5)") : activo ? "#FFFFFF" : "#D8CFEC",
                    fontFamily: fontDisplay,
                    fontSize: 14,
                  }}
                >
                  {bloqueado ? (
                    <>
                      <div className="flex items-center justify-center gap-1">
                        <Lock size={11} />
                        <span>{m.nombre}</span>
                      </div>
                      {/* ⚠️ CORREGIDO (5 agosto, madrugada) — CASO REAL:
                          esto decía "semana {idx+1}" mientras el menú
                          NO bloqueado, al lado, decía "{m.dias} días" --
                          dos formatos distintos para el mismo tipo de
                          dato, inconsistente. El candado ya deja claro
                          que está bloqueado; el subtexto debe decir lo
                          mismo en los dos casos. */}
                      <span className="block text-[10px] mt-0.5" style={{ fontFamily: "monospace" }}>{m.dias} {m.dias === 1 ? "día" : "días"}</span>
                    </>
                  ) : (
                    <>
                      {m.nombre}
                      <span className="block text-[10px] mt-0.5" style={{ fontFamily: "monospace", opacity: 0.85 }}>{m.dias} {m.dias === 1 ? "día" : "días"}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* ⚠️ AÑADIDO — LAS DOS PESTAÑAS. Van FUERA de la cabecera morada
          y pegadas a ella, para que se lean como parte de la pantalla
          del menú y no como otra navegación más. Sin scroll horizontal:
          son dos y caben siempre. */}
      <div className="flex" style={{ background: "#FFFFFF", borderBottom: "1.5px solid #E3DAF0" }}>
        {[
          { key: "menu", label: "El menú" },
          { key: "comoDarlo", label: "Cómo darlo" },
          // La tercera solo existe en modo profesional. Un tutor no la ve:
          // no es que se le esconda nada -- ve el menú entero y su semáforo
          // --, es que la tabla de márgenes no le dice nada y le quita sitio.
          ...(enModoProfesional ? [{ key: "fichaClinica", label: "Ficha clínica" }] : []),
        ].map((v) => {
          const activo = vistaActiva === v.key;
          return (
            <button
              key={v.key}
              onClick={() => setVistaActiva(v.key)}
              aria-current={activo ? "page" : undefined}
              className="flex-1 text-center py-3.5"
              style={{
                background: "transparent",
                border: "none",
                borderBottom: activo ? `2.5px solid ${VIOLETA}` : "2.5px solid transparent",
                color: activo ? VIOLETA : MALVA,
                fontFamily: fontBody,
                fontSize: 13,
                fontWeight: activo ? 700 : 400,
              }}
            >
              {v.label}
            </button>
          );
        })}
      </div>

      <div className="flex-1 px-6 pt-6 pb-6 flex flex-col">
        {/* ⚠️ PESTAÑA "CÓMO DARLO". Lo que hay aquí no es nuevo: estaba
            todo en esta misma pantalla, pero repartido -- la transición
            arriba del todo pegada a las tarjetas, la congelación en
            medio de la pila de avisos (y con una X para cerrarla, o sea
            que se podía perder de vista para siempre), y la preparación
            de cada alimento detrás de su icono. */}
        {vistaActiva === "fichaClinica" && enModoProfesional && (
          <FichaClinica ficha={ficha} />
        )}

        {/* ⚠️ EN MODO PROFESIONAL, LAS NOTAS DE SEGURIDAD VIVEN EN «CÓMO
            DARLO» (8 septiembre, segunda pasada).
            El 7 las bajé al final de la pestaña del menú; sigue sin ser su
            sitio. CASO REAL: «tampoco cosas de seguridad, vale, el
            veterinario sabe perfectamente eso; como mucho viene en cómo
            darlo, cosas que él puede editar».
            Tiene razón en las dos mitades. Una: no son un aviso para él,
            que ya sabe lo que es la tiaminasa -- el límite duro lo aplica
            el motor dentro del cálculo, esto es criterio por encima. Y
            dos: si algo hay que decir, se dice donde se dice cómo se da
            la comida, que es el texto que él corrige y que acaba impreso
            en la pauta que se lleva el tutor. */}
        {vistaActiva === "comoDarlo" && enModoProfesional && problemasSeguridad.length > 0 && (
          <div className="rounded-xl p-3 mb-3" style={{ background: "#FFFFFF", border: "1px solid #E3DAF0" }}>
            <p className="text-[11px] tracking-[0.1em] uppercase mb-1.5"
               style={{ color: MALVA, fontFamily: "monospace" }}>
              {problemasSeguridad.length === 1 ? "Nota de manejo" : `${problemasSeguridad.length} notas de manejo`}
            </p>
            <div className="flex flex-col gap-1.5">
              {problemasSeguridad.map((p, i) => (
                <p key={i} className="text-xs leading-snug" style={{ color: TINTA, fontFamily: fontBody }}>{p}</p>
              ))}
            </div>
            <p className="text-[11px] mt-2 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
              Los límites duros —vitamina D, yodo, selenio, mercurio y tiaminasa— ya están
              dentro del cálculo. Esto es criterio por encima de ellos: si no te encaja,
              cambia el alimento o los gramos.
            </p>
          </div>
        )}

        {vistaActiva === "comoDarlo" && (
          <div className="flex flex-col gap-3 mb-4">
          {necesitaTransicion && (
            <div className="rounded-xl p-3" style={{ background: "#F0ECF7" }}>
              <p className="text-sm mb-2" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 600 }}>
                Plan de transición ({dietaActual === "pienso" ? "pienso" : "comida cocinada"} → BARF)
              </p>
              <div className="flex flex-col gap-1">
                {[
                  { dias: "Días 1-3", barf: 25 },
                  { dias: "Días 4-6", barf: 50 },
                  { dias: "Días 7-9", barf: 75 },
                  { dias: "Día 10 en adelante", barf: 100 },
                ].map((tramo, i) => (
                  <div key={i} className="flex items-center justify-between text-xs" style={{ fontFamily: fontBody, color: TINTA }}>
                    <span>{tramo.dias}</span>
                    <span style={{ fontFamily: "monospace", color: VIOLETA, fontWeight: 700 }}>
                      {tramo.barf}% BARF / {100 - tramo.barf}% {dietaActual === "pienso" ? "pienso" : "cocinado"}
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-xs mt-2" style={{ color: MALVA, fontFamily: fontBody }}>
                Dáselo en tomas separadas, no mezclado en el mismo plato — se digieren a ritmos distintos.
              </p>
            </div>
          )}
          {necesitaTransicion && menus.length > 1 && (
            <div className="rounded-xl p-3 mb-4 flex gap-2 items-start" style={{ background: "#F0ECF7" }}>
              <Lock size={14} style={{ color: VIOLETA, flexShrink: 0, marginTop: 2 }} />
              <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>
                Empiezas solo con el Menú 1 toda la semana. La semana que viene se cambia por completo al Menú 2
                (no se mezclan), y así con cada uno — hasta que {nombrePerro} haya probado todos por separado.
                Solo entonces empiezan a rotar de verdad entre ellos.
              </p>
            </div>
          )}
            <div className="rounded-xl p-3 mb-4" style={{ background: "#F0ECF7", border: "1px solid #D9CDEE" }}>
              <div className="flex items-center gap-1.5 mb-1">
                <AlertCircle size={14} style={{ color: VIOLETA }} />
                <p className="text-[11px] tracking-[0.1em] uppercase" style={{ color: VIOLETA, fontFamily: "monospace" }}>
                  Congelación
                </p>
              </div>
              <p className="text-xs leading-snug" style={{ color: TINTA, fontFamily: fontBody }}>
                {/* ⚠️ CASO REAL (23 agosto): salía "al menos 1 semanacongelados".
                    En JSX, la línea que TERMINA en etiqueta se pega a la
                    siguiente sin espacio -- y lo mismo la que EMPIEZA con una.
                    El espacio de dentro de la línea sí se respeta, así que
                    cada <b> va pegado a sus palabras en su propia línea. */}
                Si preparas este menú con antelación: carne, vísceras, hígado y hueso, <b>al menos 1 semana</b> congelados
                a -18/-20°C antes de dar; pescado, <b>al menos 2 semanas</b> — el anisakis aguanta más. Los suplementos,
                aceites, huevo y semillas se añaden CRUDOS al final, sobre la comida ya descongelada — nunca se congelan
                junto con el resto.
                <br /><br />
                Una vez descongelado, dáselo <b>dentro de 3 días</b> guardándolo en la nevera; pasado ese
                tiempo, mejor no. El pescado se estropea antes que la carne: si huele mal, descártalo aunque
                no hayan pasado los tres días.
              </p>
            </div>
          {/* ⚠️ AÑADIDO — CÓMO PREPARAR CADA ALIMENTO, TODO JUNTO.
              Esto mismo sigue estando detrás del icono de cubiertos de
              cada fila, y no es un descuido: ahí sirve para mirar UN
              alimento mientras lees la lista, y aquí para leerlo todo
              seguido antes de ponerte a cocinar. Son dos momentos
              distintos.

              Se agrupa por categoría, no por alimento: la instrucción
              larga (crudo, troceado, congelado...) es de la categoría,
              y repetirla en cada fila llenaría la pantalla de lo
              mismo. Debajo de cada una van solo los alimentos de este
              menú que tienen algo propio que decir. */}
          {(() => {
            const porCategoria = [];
            for (const item of itemsMostrados) {
              if (!INSTRUCCIONES_POR_CATEGORIA[item.categoria]) continue;
              let grupo = porCategoria.find((g) => g.categoria === item.categoria);
              if (!grupo) { grupo = { categoria: item.categoria, items: [] }; porCategoria.push(grupo); }
              grupo.items.push(item);
            }
            if (porCategoria.length === 0) return null;
            return (
              <>
                <p className="text-[11px] tracking-[0.1em] uppercase mt-2" style={{ color: MALVA, fontFamily: "monospace" }}>
                  Alimento por alimento
                </p>
                {porCategoria.map((grupo) => (
                  <div key={grupo.categoria} className="rounded-xl p-3" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
                    <div className="flex gap-2 items-start">
                      <UtensilsCrossed size={14} style={{ color: VIOLETA, flexShrink: 0, marginTop: 2 }} />
                      <div className="flex-1">
                        <p className="text-sm mb-1" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 600 }}>
                          {grupo.categoria}
                        </p>
                        <p className="text-xs leading-snug" style={{ color: TINTA, fontFamily: fontBody }}>
                          {INSTRUCCIONES_POR_CATEGORIA[grupo.categoria]}
                        </p>
                      </div>
                    </div>
                    {grupo.items.filter((it) => COMO_DAR_ALIMENTO[it.alimento]).map((it) => (
                      <div key={it.alimento} className="mt-2.5 p-2.5 rounded-xl" style={{ background: PAPEL }}>
                        <div className="flex items-baseline justify-between gap-2 mb-1">
                          <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 600 }}>{it.alimento}</p>
                          <span className="text-xs shrink-0" style={{ color: VIOLETA, fontFamily: fontDisplay }}>
                            {formatearGramos(it.gramos * multiplicador)}
                          </span>
                        </div>
                        <p className="text-xs leading-snug" style={{ color: TINTA, fontFamily: fontBody }}>
                          {COMO_DAR_ALIMENTO[it.alimento].como}
                        </p>
                        {/* Sin `pieza` no hay referencia que dar -- si se
                            pinta igual sale "Como referencia, undefined".
                            Mismo motivo que en el panel de los cubiertos. */}
                        {COMO_DAR_ALIMENTO[it.alimento].pieza && (
                          <p className="text-xs mt-1" style={{ color: MALVA, fontFamily: fontBody }}>
                            Como referencia, {COMO_DAR_ALIMENTO[it.alimento].pieza}.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </>
            );
          })()}
          </div>
        )}
        {vistaActiva === "menu" && (<>
        {/* ⚠️ REORGANIZADO (5 agosto, madrugada) — pedido expreso: en
            pantallas anchas, el plan de transición y las tres tarjetas
            (ración/kcal/semáforo) van lado a lado, aprovechando el
            espacio -- en móvil siguen apiladas como antes, no hay sitio
            para ponerlas al lado. Si no hay transición, las tres
            tarjetas ocupan el ancho entero, como siempre hicieron. */}
        <div className="flex-1">
          <div className="flex gap-3 mb-3">
            <div className="flex-1 rounded-2xl p-4 text-center" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
              <p style={{ color: VIOLETA, fontFamily: fontDisplay, fontSize: 22 }}>{totalGramos}g</p>
              <p className="text-[10px] tracking-[0.1em] uppercase mt-0.5" style={{ color: MALVA, fontFamily: "monospace" }}>ración total</p>
            </div>
            <div className="flex-1 rounded-2xl p-4 text-center" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
              <p style={{ color: VIOLETA, fontFamily: fontDisplay, fontSize: 22 }}>{menu.kcal}</p>
              <p className="text-[10px] tracking-[0.1em] uppercase mt-0.5" style={{ color: MALVA, fontFamily: "monospace" }}>kcal / día</p>
            </div>
            {(() => {
              const COLORES = {
                verde: { fondo: VERDE, texto: VERDE_TEXTO },
                ambar: { fondo: "#FFF7E8", texto: "#B8860B" },
                rojo: { fondo: "#FFE8EC", texto: ROSA },
              };
              const col = COLORES[ficha?.semaforo] || COLORES.verde;
              return (
                <div className="flex-1 rounded-2xl p-4 text-center flex flex-col items-center justify-center" style={{ background: col.fondo }}>
                  <div className="flex items-center gap-1">
                    <CheckCircle2 size={18} style={{ color: col.texto }} />
                    {/* Sin nombre, este botón era ilegible para un lector de
                        pantalla y no había forma de pulsarlo desde una
                        prueba: un icono suelto no dice qué hace. */}
                    <button onClick={() => setInfoNutrientes(!infoNutrientes)}
                            aria-label={infoNutrientes ? "Ocultar qué se ha verificado" : "Qué se ha verificado"}
                            aria-expanded={infoNutrientes}>
                      <Info size={13} style={{ color: col.texto, opacity: 0.6 }} />
                    </button>
                  </div>
                  <p className="text-[10px] tracking-[0.1em] uppercase mt-1" style={{ color: col.texto, fontFamily: "monospace" }}>
                    {ficha ? `${ficha.correctos}/${ficha.total} OK` : "sin verificar"}
                  </p>
                </div>
              );
            })()}
          </div>
        </div>
        {viendoBloqueado && (
          <div className="rounded-xl p-3 mb-4 flex gap-2 items-start" style={{ background: "#FFF7E8" }}>
            <Info size={14} style={{ color: "#B8860B", flexShrink: 0, marginTop: 2 }} />
            <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>
              Vista previa — {nombrePerro} todavía no come esto. Se activará en la semana {idxActiva + 1}.
            </p>
          </div>
        )}
        {/* ⚠️ CORREGIDO (5 agosto, noche): antes era un banner pequeño
            arriba del todo, que quedaba fuera de la vista si estabas
            haciendo scroll más abajo (justo donde se toca el lápiz de
            un alimento) -- fácil de no verlo nunca. Ahora es un aviso
            fijo, centrado, que se superpone a toda la pantalla mientras
            dura el recálculo -- imposible de perder de vista. */}
        {recalculandoServidor && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center px-6" style={{ background: "rgba(35,21,57,0.55)" }}>
            <div className="flex flex-col items-center gap-3 px-8 py-7 rounded-2xl" style={{ background: "#FFFFFF" }}>
              <Dog size={28} style={{ color: VIOLETA }} />
              <p className="text-sm text-center" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 600 }}>
                Recalculando el menú...
              </p>
              <p className="text-xs text-center" style={{ color: MALVA, fontFamily: fontBody }}>
                Un momento, esto puede tardar unos segundos
              </p>
            </div>
          </div>
        )}
        {errorRecalculo && errorRecalculo.deTab === tabActiva && !recalculandoServidor && (
          // ⚠️ CORREGIDO (5 agosto, noche): antes esto era un banner fijo en
          // el flujo de la página, arriba del todo -- si estabas editando
          // un alimento más abajo en la lista, quedaba fuera de la vista y
          // era fácil no verlo nunca. Ahora es un aviso superpuesto,
          // centrado, igual de visible que el de "recalculando" -- con un
          // botón para cerrarlo, porque a diferencia de "recalculando"
          // este se queda abierto hasta que el usuario lo lea.
          <div className="fixed inset-0 z-[70] flex items-center justify-center px-6" style={{ background: "rgba(35,21,57,0.55)" }}>
            <div className="flex flex-col items-center gap-2 px-6 py-6 rounded-2xl max-w-sm" style={{ background: "#FFFFFF" }}>
              <AlertCircle size={28} style={{ color: ROSA, flexShrink: 0 }} />
              <p className="text-sm text-center" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 700 }}>
                No se ha podido hacer ese cambio
              </p>
              <p className="text-xs text-center" style={{ color: TINTA, fontFamily: fontBody }}>{errorRecalculo?.texto}</p>
              <p className="text-xs text-center mb-2" style={{ color: MALVA, fontFamily: fontBody }}>
                El menú sigue tal como estaba — no se ha aplicado nada.
              </p>
              <button
                onClick={() => setErrorRecalculo(null)}
                className="px-6 py-2.5 rounded-xl text-sm w-full"
                style={{ background: VIOLETA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}
              >
                Entendido
              </button>
            </div>
          </div>
        )}
        {avisoRecalculo && avisoRecalculo.deTab === tabActiva && !recalculandoServidor && (
          // ⚠️ AÑADIDO (5 agosto, madrugada): aviso de "también tuvimos
          // que cambiar X" -- distinto del de error: el cambio SÍ se
          // aplicó, esto es información, no un fallo.
          <div className="fixed inset-0 z-[70] flex items-center justify-center px-6" style={{ background: "rgba(35,21,57,0.55)" }}>
            <div className="flex flex-col items-center gap-2 px-6 py-6 rounded-2xl max-w-sm" style={{ background: "#FFFFFF" }}>
              <Info size={28} style={{ color: VIOLETA, flexShrink: 0 }} />
              <p className="text-sm text-center" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 700 }}>
                Cambio aplicado, con un ajuste más
              </p>
              <p className="text-xs text-center mb-2" style={{ color: TINTA, fontFamily: fontBody }}>{avisoRecalculo?.texto}</p>
              <button
                onClick={() => setAvisoRecalculo(null)}
                className="px-6 py-2.5 rounded-xl text-sm w-full"
                style={{ background: VIOLETA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}
              >
                Entendido
              </button>
            </div>
          </div>
        )}

        {/* ⚠️ AÑADIDO (5 agosto, madrugada) — CASO REAL SIN RESOLVER:
            panel de diagnóstico de la ÚLTIMA edición -- muestra
            exactamente qué se mandó al servidor y qué llegó de vuelta,
            comparado alimento por alimento. Se queda visible (no se
            cierra solo) para poder hacer una captura y compararlo.
            Rojo si algo desapareció SIN que el servidor avisara --
            eso sería el bug real que se está buscando. */}
        {ultimoDiagnosticoEdicion && ultimoDiagnosticoEdicion.deTab === tabActiva && (
          <div className="rounded-xl p-3 mb-4" style={{
            background: ultimoDiagnosticoEdicion.desaparecidos.length > 0 && !ultimoDiagnosticoEdicion.avisoDelServidor ? "#FFE8EC" : "#F0ECF7",
            border: ultimoDiagnosticoEdicion.desaparecidos.length > 0 && !ultimoDiagnosticoEdicion.avisoDelServidor ? `1.5px solid ${ROSA}` : "1px solid #E3DAF0",
          }}>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] tracking-[0.1em] uppercase" style={{ color: VIOLETA, fontFamily: "monospace" }}>
                Diagnóstico: última edición ({ultimoDiagnosticoEdicion.endpoint})
              </p>
              <button onClick={() => setUltimoDiagnosticoEdicion(null)} className="text-xs" style={{ color: MALVA }}>✕</button>
            </div>
            <p className="text-xs mb-1" style={{ color: TINTA, fontFamily: fontBody }}>
              <b>Había antes ({ultimoDiagnosticoEdicion.antes.length}):</b> {ultimoDiagnosticoEdicion.antes.join(", ")}
            </p>
            <p className="text-xs mb-1" style={{ color: TINTA, fontFamily: fontBody }}>
              <b>Llegó después ({ultimoDiagnosticoEdicion.despues.length}):</b> {ultimoDiagnosticoEdicion.despues.join(", ")}
            </p>
            {ultimoDiagnosticoEdicion.desaparecidos.length > 0 && (
              <p className="text-xs mb-1" style={{ color: ROSA, fontFamily: fontBody, fontWeight: 700 }}>
                Desaparecieron: {ultimoDiagnosticoEdicion.desaparecidos.join(", ")}
              </p>
            )}
            {ultimoDiagnosticoEdicion.nuevos.length > 0 && (
              <p className="text-xs mb-1" style={{ color: "#B8860B", fontFamily: fontBody, fontWeight: 700 }}>
                Aparecieron nuevos: {ultimoDiagnosticoEdicion.nuevos.join(", ")}
              </p>
            )}
            <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>
              Aviso del servidor: {ultimoDiagnosticoEdicion.avisoDelServidor || "(ninguno)"}
            </p>
          </div>
        )}

        {/* ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: mismo
            diagnóstico que arriba, pero para Personalizar -- compara
            lo que se eligió a mano contra lo que salió de verdad en el
            menú final. Solo aparece si este menú vino de Personalizar
            (en automático no hay nada elegido a mano con qué comparar). */}
        {modo === "personalizar" && diagnosticoPersonalizar && diagnosticoPersonalizarVisible && (
          <div className="rounded-xl p-3 mb-4" style={{
            background: diagnosticoPersonalizar.noSalieron.length > 0 ? "#FFE8EC" : "#F0ECF7",
            border: diagnosticoPersonalizar.noSalieron.length > 0 ? `1.5px solid ${ROSA}` : "1px solid #E3DAF0",
          }}>
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-[11px] tracking-[0.1em] uppercase" style={{ color: VIOLETA, fontFamily: "monospace" }}>
                Diagnóstico: lo elegido a mano en Personalizar
              </p>
              <button onClick={() => setDiagnosticoPersonalizarVisible(false)} aria-label="Cerrar">
                <X size={14} style={{ color: VIOLETA }} />
              </button>
            </div>
            <p className="text-xs mb-1" style={{ color: TINTA, fontFamily: fontBody }}>
              <b>Elegiste ({diagnosticoPersonalizar.elegido.length}):</b> {diagnosticoPersonalizar.elegido.join(", ") || "(nada a mano)"}
            </p>
            <p className="text-xs mb-1" style={{ color: TINTA, fontFamily: fontBody }}>
              <b>Salió en el menú ({diagnosticoPersonalizar.salio.length}):</b> {diagnosticoPersonalizar.salio.join(", ")}
            </p>
            {diagnosticoPersonalizar.noSalieron.length > 0 ? (
              <p className="text-xs" style={{ color: ROSA, fontFamily: fontBody, fontWeight: 700 }}>
                No salieron: {diagnosticoPersonalizar.noSalieron.join(", ")}
              </p>
            ) : (
              <p className="text-xs" style={{ color: "#5A9367", fontFamily: fontBody }}>
                Todo lo que elegiste a mano está en el menú final.
              </p>
            )}
          </div>
        )}
        {avisoNoForzadoVisible && (
          // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: cuando en
          // Personalizar no fue viable un menú con TODO lo elegido a
          // mano, el servidor ya lo decía (no_se_pudo_forzar) -- solo
          // faltaba mostrarlo. Mismo patrón visual que el aviso de
          // arriba, para que sea consistente.
          <div className="fixed inset-0 z-[70] flex items-center justify-center px-6" style={{ background: "rgba(35,21,57,0.55)" }}>
            <div className="flex flex-col items-center gap-2 px-6 py-6 rounded-2xl max-w-sm" style={{ background: "#FFFFFF" }}>
              <Info size={28} style={{ color: VIOLETA, flexShrink: 0 }} />
              <p className="text-sm text-center" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 700 }}>
                No se pudo con todo lo elegido
              </p>
              <p className="text-xs text-center mb-2" style={{ color: TINTA, fontFamily: fontBody }}>
                Con lo que elegiste a mano no había una combinación viable, así que este menú se ha calculado libremente para que sí cumpla los 30 requisitos. Puedes revisarlo y cambiar lo que quieras.
              </p>
              <button
                onClick={() => setAvisoNoForzadoVisible(false)}
                className="px-6 py-2.5 rounded-xl text-sm w-full"
                style={{ background: VIOLETA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}
              >
                Entendido
              </button>
            </div>
          </div>
        )}

        {avisoExtraEspecieVisible && (
          // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: distinto
          // del aviso de arriba (que es "nada de lo elegido se pudo
          // mantener") -- esto es "casi todo se mantuvo, pero hizo
          // falta añadir una especie más en carne/pescado/hueso".
          <div className="fixed inset-0 z-[70] flex items-center justify-center px-6" style={{ background: "rgba(35,21,57,0.55)" }}>
            <div className="flex flex-col items-center gap-2 px-6 py-6 rounded-2xl max-w-sm" style={{ background: "#FFFFFF" }}>
              <Info size={28} style={{ color: VIOLETA, flexShrink: 0 }} />
              <p className="text-sm text-center" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 700 }}>
                Hizo falta añadir algo más
              </p>
              <p className="text-xs text-center mb-2" style={{ color: TINTA, fontFamily: fontBody }}>{avisoExtraEspecieVisible}</p>
              <button
                onClick={() => setAvisoExtraEspecieVisible(false)}
                className="px-6 py-2.5 rounded-xl text-sm w-full"
                style={{ background: VIOLETA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}
              >
                Entendido
              </button>
            </div>
          </div>
        )}

        {/* ⚠️ AÑADIDO (5 agosto, madrugada) — AUDITORÍA: avisos de
            seguridad reales (tiaminasa, clara de huevo sola, hígado en
            exceso, límites por patología...) -- el servidor los
            calculaba desde hace tiempo, y nunca se mostraban en ningún
            sitio. A diferencia del semáforo (que dice si faltan
            nutrientes), esto avisa de si HAY DEMASIADO de algo
            concreto -- son cosas distintas, y las dos importan. */}
        {avisoComposicion && avisoComposicionVisible && (
          // ⚠️ AÑADIDO — por qué este menú no se parece a los demás.
          //
          // Va en su PROPIO panel y no dentro de "avisos de seguridad", y
          // no es un descuido: que a un menú le falten las vísceras no es
          // un riesgo, es una consecuencia de las alergias del perro. El
          // menú cumple los 30 requisitos igual. Meterlo bajo el rótulo
          // de seguridad, en ámbar, diría que hay algo peligroso cuando
          // no lo hay -- y a base de teñir de ámbar cosas que no lo son,
          // los avisos que SÍ importan dejan de leerse.
          //
          // Va ENCIMA del de seguridad y en violeta (el color de la app
          // para informar, el mismo de los otros avisos informativos),
          // manteniendo la forma del panel para que se lea como parte
          // del mismo sistema.
          <div className="rounded-xl p-3 mb-3" style={{ background: "#F4F0FB", border: "1px solid #DCD2F0" }}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <Info size={14} style={{ color: VIOLETA }} />
                <p className="text-[11px] tracking-[0.1em] uppercase" style={{ color: VIOLETA, fontFamily: "monospace" }}>
                  Sobre la composición
                </p>
              </div>
              <button onClick={() => setAvisoComposicionVisible(false)}
                      aria-label="Cerrar el aviso sobre la composición">
                <X size={14} style={{ color: VIOLETA }} />
              </button>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: TINTA, fontFamily: fontBody }}>
              {avisoComposicion}
            </p>
          </div>
        )}

        {/* ⚠️ EN MODO PROFESIONAL ESTO NO VA AQUÍ (7 septiembre). CASO
            REAL: «en el modo veterinario deberían desaparecer los avisos de
            seguridad -- por ejemplo, costillas de cordero, le pones
            seguridad y te salta el aviso. Eso tiene que estar abajo,
            acomodado, que él puede editar».
            El aviso está bien calculado y no se quita: lo que está mal es
            dónde. A un tutor hay que pararle antes de que dé de comer algo;
            un veterinario ya sabe lo que es la tiaminasa y lo que quiere es
            formular primero y revisar las notas después. Así que en su modo
            baja al final de la pantalla, junto al menú que puede editar.
            Ver el bloque «NOTAS DE SEGURIDAD» más abajo. */}
        {!enModoProfesional && problemasSeguridad.length > 0 && problemasSeguridadVisible && (
          <div className="rounded-xl p-3 mb-4" style={{ background: "#FFF7E8", border: "1px solid #F5DFA8" }}>
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-1.5">
                <AlertCircle size={14} style={{ color: "#B8860B" }} />
                <p className="text-[11px] tracking-[0.1em] uppercase" style={{ color: "#B8860B", fontFamily: "monospace" }}>
                  {problemasSeguridad.length === 1 ? "Un aviso de seguridad" : `${problemasSeguridad.length} avisos de seguridad`}
                </p>
              </div>
              <button onClick={() => setProblemasSeguridadVisible(false)} aria-label="Cerrar">
                <X size={14} style={{ color: "#B8860B" }} />
              </button>
            </div>
            <div className="flex flex-col gap-1.5">
              {problemasSeguridad.map((p, i) => (
                <p key={i} className="text-xs leading-snug" style={{ color: TINTA, fontFamily: fontBody }}>{p}</p>
              ))}
            </div>
          </div>
        )}

        {/* ⚠️ QUITADO (5 agosto, madrugada) — pedido expreso: el panel
            de avisos a nivel de toda la semana (frecuencia de
            tiaminasa/mercurio/vitD/yodo/selenio) se elimina -- el
            límite duro (restricción matemática en el motor) ya impide
            que se supere de verdad, así que el usuario no necesita ver
            este aviso informativo aparte. El límite en sí no se toca,
            sigue aplicándose siempre, se genere como se genere el menú. */}

        {infoNutrientes && (() => {
          // ⚠️ CORREGIDO (5 agosto): antes decía "FEDIAF exige revisar 27
          // nutrientes" y "los cumple todos" SIEMPRE, aunque el menú
          // estuviera en ámbar o rojo -- eso sería falso en esos casos.
          // Además, decir "FEDIAF exige 30" habría sido inexacto: la tabla
          // real de FEDIAF tiene más de 40 (incluye aminoácidos
          // individuales que no trackeamos, agrupados en la proteína
          // total). Se habla de "nutrientes clave" en vez de dar un
          // número que invite a preguntar "¿y los demás?".
          const COLORES = {
            verde: { fondo: VERDE, texto: VERDE_TEXTO },
            ambar: { fondo: "#FFF7E8", texto: "#B8860B" },
            rojo: { fondo: "#FFE8EC", texto: ROSA },
          };
          const col = COLORES[ficha?.semaforo] || COLORES.verde;
          // ⚠️ DOS REGISTROS, NO DOS VERDADES (7 septiembre). CASO REAL:
          // «cuando me meto dentro de mis menús de algún menú de algún
          // paciente en veterinario se ve igual que lo ve un usuario y no
          // debería ser así».
          //
          // El texto del tutor explica QUÉ es FEDIAF, porque él no lo sabe.
          // A quien va a firmar la pauta con su número de colegiado eso le
          // sobra, y encima le esconde el único dato que le sirve: cuántos
          // requisitos cumple de cuántos, también cuando van bien. Es el
          // mismo semáforo y los mismos números; cambia a quién se le habla.
          const TEXTOS_TUTOR = {
            verde: `Comprobamos los nutrientes clave para que ${nombrePerro} crezca y se mantenga sano: minerales, vitaminas y grasas esenciales, siguiendo las tablas de FEDIAF. Este menú los cumple todos.`,
            ambar: `Comprobamos los nutrientes clave para que ${nombrePerro} crezca y se mantenga sano. Este menú cumple ${ficha?.correctos ?? "?"} de ${ficha?.total ?? "?"} — el resto están cerca del mínimo, pero no llegan del todo. Conviene revisarlo.`,
            rojo: `Comprobamos los nutrientes clave para que ${nombrePerro} crezca y se mantenga sano. Este menú se queda corto en varios. No deberías usarlo tal cual — vuelve a generarlo o edítalo.`,
          };
          const TEXTOS_PROFESIONAL = {
            verde: `Verificado contra FEDIAF: cumple ${ficha?.correctos ?? "?"} de ${ficha?.total ?? "?"} requisitos, más el ratio Ca:P y los topes de seguridad crónica. El detalle por nutriente, con mínimo, máximo y margen, está en la ficha clínica.`,
            ambar: `Verificado contra FEDIAF: cumple ${ficha?.correctos ?? "?"} de ${ficha?.total ?? "?"}. El resto se queda cerca del mínimo sin alcanzarlo — cuáles y por cuánto, en la ficha clínica.`,
            rojo: `Verificado contra FEDIAF: no cumple ${ficha?.total && ficha?.correctos !== undefined ? ficha.total - ficha.correctos : "varios"} requisitos. Sin corregirlos no es una ración completa; cuáles y por cuánto, en la ficha clínica.`,
          };
          const TEXTOS = enModoProfesional ? TEXTOS_PROFESIONAL : TEXTOS_TUTOR;
          return (
            <div className="rounded-xl p-3 mb-4 flex gap-2 items-start" style={{ background: col.fondo }}>
              <Info size={14} style={{ color: col.texto, flexShrink: 0, marginTop: 2 }} />
              <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>
                {TEXTOS[ficha?.semaforo] || TEXTOS.verde}
              </p>
            </div>
          );
        })()}

        <div className="flex flex-col gap-2 mb-3">
        {/* ⚠️ ESTE AVISO NO ES PARA EL VETERINARIO (7 septiembre). CASO
            REAL: «se ve igual que lo ve un usuario... además te pone esto,
            debería ser revisado por un veterinario. Mal».
            Tiene razón y no es un matiz de tono: decirle «enséñaselo a tu
            veterinario» a la persona que ES el veterinario, y que va a
            firmar esto con su número de colegiado, es decirle que lo que
            tiene delante no cuenta. En su lugar va lo que sí le sirve: los
            topes que la patología le ha metido al motor, con su fuente y
            su margen. Ver `topespatologia.jsx`. */}
        {enModoProfesional && (patologias || []).length > 0 && (
          <QueCambiaLaPatologia claves={patologias}
                                titulo="Lo que esta patología le ha impuesto al menú" />
        )}
        {!enModoProfesional && (patologias || []).length > 0 && avisoPatologiaVisible && (
          <div className="rounded-xl p-3 mb-3 flex gap-2 items-start"
               style={{ background: "#FFF4F6", border: `1.5px solid ${ROSA}` }}>
            <AlertCircle size={15} style={{ color: ROSA, flexShrink: 0, marginTop: 2 }} />
            <div className="flex-1">
              <div className="flex items-start justify-between gap-2">
                <p className="text-sm mb-1" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 700 }}>
                  Este menú TIENE que aprobarlo tu veterinario
                </p>
                <button onClick={() => setAvisoPatologiaVisible(false)} aria-label="Cerrar" className="shrink-0">
                  <X size={14} style={{ color: ROSA }} />
                </button>
              </div>
              <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>
                {/* ⚠️ CAMBIADO (5 agosto, madrugada) — pedido expreso: el texto
                    anterior decía "la cantidad exacta depende del estadio y de sus
                    analíticas" -- "estadio" es jerga clínica que el usuario normal
                    no entiende, y el texto era idéntico para cualquier patología.
                    Ahora usa el nombre real de lo que tiene el perro y habla claro. */}
                {(() => {
                  const labels = patologias
                    .map((k) => datosPatologia(k)?.label)
                    .filter(Boolean);
                  const condicion = labels.length === 1
                    ? labels[0]
                    : labels.length === 2
                      ? `${labels[0]} y ${labels[1]}`
                      : `${labels.slice(0, -1).join(", ")} y ${labels[labels.length - 1]}`;
                  return `El menú de ${nombrePerro} está ajustado teniendo en cuenta ${condicion}. Son ajustes orientativos en la buena dirección, pero su veterinario es quien mejor puede valorar si encaja con su caso concreto — enséñale este menú antes de empezar.`;
                })()}
              </p>
            </div>
          </div>
        )}
        <div className="rounded-xl p-3 mb-3" style={{ background: "#F0ECF7" }}>
          <p className="text-sm mb-2.5" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 600 }}>
            Preparar de golpe para
          </p>
          <div className="flex gap-2">
            {[
              { dias: 1, label: "1 día" },
              // ⚠️ CAMBIADO (5 agosto, madrugada) — CASO REAL, pedido
              // expreso: esto siempre decía "1 semana" (7 días fijos),
              // aunque este menú concreto solo cubra 2-6 días de la
              // rotación real -- preparar de golpe para 7 días cuando
              // el menú solo se va a dar 3 no tiene sentido. Ahora usa
              // los días reales de ESTE menú (menu.dias, ya calculado
              // correctamente más arriba con el reparto de la semana).
              // Si este menú solo cubre 1 día de la semana, la segunda
              // opción sería idéntica a la primera -- se omite, para no
              // mostrar dos botones redundantes.
              ...(menu.dias > 1
                ? [{ dias: menu.dias, label: menu.dias === 7 ? "1 semana" : `Toda la semana (${menu.dias} días)` }]
                : []),
            ].map((op) => {
              const activo = diasSeleccionados === op.dias;
              return (
                <button
                  key={op.dias}
                  onClick={() => setVerLaTanda(op.dias > 1)}
                  className="flex-1 py-2 rounded-lg text-xs"
                  style={{ background: activo ? VIOLETA : "transparent",
                           color: activo ? "#FFFFFF" : VIOLETA,
                           border: `1.5px solid ${VIOLETA}`, fontFamily: fontBody, fontWeight: 600 }}
                >
                  {op.label}
                </button>
              );
            })}
          </div>
          {diasSeleccionados > 1 && (
            <p className="text-xs mt-2.5" style={{ color: MALVA, fontFamily: fontBody }}>
              Estos son los gramos totales para {diasSeleccionados} días de cada alimento — prepara
              la mezcla de golpe, guárdala en la nevera (o congelador si es para más de 2-3 días),
              y dale {Math.round(100 / diasSeleccionados)}% de esto cada día.
            </p>
          )}
        </div>

        {/* ⚠️ MOVIDO (5 agosto, madrugada) — pedido expreso: estaba
            arriba del todo, lejos del listado al que se refiere. Ahora
            va justo encima de los alimentos, debajo de "Preparar de
            golpe para". */}
        {mostrarAyuda && (
          <div className="rounded-xl p-3 mb-4" style={{ background: PAPEL, border: "1px solid #EDE6F5" }}>
            <div className="flex items-center gap-3 text-xs" style={{ color: MALVA, fontFamily: fontBody }}>
              <span className="flex items-center gap-1"><Pencil size={13} style={{ color: "#B6ABC9" }} /> cambiar un alimento</span>
              <span className="flex items-center gap-1"><UtensilsCrossed size={13} style={{ color: "#B6ABC9" }} /> cómo darlo</span>
            </div>
          </div>
        )}

        {itemsMostrados.map((item, i) => {
            const Icono = item.Icono;
            return (
              <div key={i} className="rounded-2xl p-4" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
                <div className="flex items-center gap-3">
                  <div className="shrink-0 w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: PAPEL }}>
                    <Icono size={18} strokeWidth={1.6} style={{ color: VIOLETA }} />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] tracking-[0.1em] uppercase" style={{ color: MALVA, fontFamily: "monospace" }}>{item.categoria}</p>
                    <p style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 16 }}>{item.alimento}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span style={{ color: VIOLETA, fontFamily: fontDisplay, fontSize: 17 }}>
                      {COMO_DAR_ALIMENTO[item.alimento]?.esComprimido
                        ? formatearComprimidos(item.gramos * multiplicador, COMO_DAR_ALIMENTO[item.alimento].pesoComprimido)
                        : formatearGramos(item.gramos * multiplicador)}
                    </span>
                    {item.porque && (
                      <button onClick={() => { setPorqueAbierto(porqueAbierto === i ? null : i); setEditorAbierto(null); setComoAbierto(null); }}>
                        <Info size={16} style={{ color: porqueAbierto === i ? ROSA : "#C9BEDD" }} />
                      </button>
                    )}
                    {/* ⚠️ CORREGIDO (5 agosto, madrugada): esta condición
                        distinguía "alimentos base" de "suplementos
                        añadidos a mano" cuando itemsMostrados los
                        concatenaba por separado -- ya no hace falta,
                        itemsMostrados es solo itemsBase, todo editable. */}
                    {(
                      <button
                        // ⚠️ AÑADIDO (24 agosto) — sin nombre accesible, este
                        // botón no se podía tocar desde una prueba: el lápiz
                        // solo es un icono. Y editar es justo donde apareció
                        // el fallo de que la compra se quedaba con el menú de
                        // antes.
                        aria-label={`Cambiar ${item.alimento}`}
                        onClick={() => {
                          // ⚠️ CORREGIDO (5 agosto): antes se abría ya con la
                          // categoría del alimento actual fijada, así que solo
                          // se podía cambiar dentro de la misma categoría (pez
                          // por pez, nunca pez por carne). Ahora se abre igual
                          // que "Añadir alimento": eligiendo categoría primero,
                          // libre entre las seis.
                          //
                          // ⚠️ CORREGIDO (5 agosto, madrugada) — FALLO GRAVE
                          // ENCONTRADO: esto usaba el índice "i" de la lista
                          // ORDENADA en pantalla (por categoría y gramos) para
                          // buscar luego en la lista SIN ordenar del servidor
                          // -- como el orden cambia constantemente, el índice
                          // nunca correspondía de forma fiable al mismo
                          // alimento. Ahora se identifica por su NOMBRE, que sí
                          // es estable (no puede haber dos alimentos iguales a
                          // la vez en el menú).
                          setEditorAbierto(editorAbierto && editorAbierto.alimentoViejo === item.alimento ? null : { alimentoViejo: item.alimento, categoria: null, especie: null });
                          setPorqueAbierto(null);
                          setComoAbierto(null);
                        }}>
                        <Pencil size={15} style={{ color: editorAbierto && editorAbierto.alimentoViejo === item.alimento ? ROSA : "#C9BEDD" }} />
                      </button>
                    )}
                    <button
                      aria-label={`Quitar ${item.alimento}`}
                      onClick={() => {
                        setAlimentoAQuitar(alimentoAQuitar === item.alimento ? null : item.alimento);
                        setEditorAbierto(null); setPorqueAbierto(null); setComoAbierto(null);
                      }}>
                      <Trash2 size={15} style={{ color: alimentoAQuitar === item.alimento ? ROSA : "#C9BEDD" }} />
                    </button>
                    {INSTRUCCIONES_POR_CATEGORIA[item.categoria] && (
                      <button
                        aria-label={`Cómo preparar ${item.alimento}`}
                        onClick={() => { setComoAbierto(comoAbierto === i ? null : i); setPorqueAbierto(null); setEditorAbierto(null); }}>
                        <UtensilsCrossed size={15} style={{ color: comoAbierto === i ? ROSA : "#C9BEDD" }} />
                      </button>
                    )}
                  </div>
                </div>
                {alimentoAQuitar === item.alimento && (
                  <div className="mt-3 pt-3" style={{ borderTop: "1px solid #F0ECF7" }}>
                    <p className="text-xs mb-2 leading-snug" style={{ color: TINTA, fontFamily: fontBody }}>
                      ¿Quitar <b>{item.alimento}</b>? Se rehace el menú entero sin él, y{" "}
                      <b>no se puede volver a poner</b> sin generar otro.
                    </p>
                    <div className="flex gap-2">
                      <button
                        aria-label={`Confirmar quitar ${item.alimento}`}
                        onClick={() => quitarAlimento(item.alimento)}
                        className="px-3 py-1.5 rounded-lg text-xs"
                        style={{ background: ROSA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}>
                        Quitar
                      </button>
                      <button
                        onClick={() => setAlimentoAQuitar(null)}
                        className="px-3 py-1.5 rounded-lg text-xs"
                        style={{ background: PAPEL, color: MALVA, fontFamily: fontBody }}>
                        Dejarlo
                      </button>
                    </div>
                  </div>
                )}
                {editorAbierto && editorAbierto.alimentoViejo === item.alimento && !editorAbierto.categoria && (
                  <div className="mt-3 pt-3" style={{ borderTop: "1px solid #F0ECF7" }}>
                    <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>CAMBIAR A QUÉ CATEGORÍA</p>
                    <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                      {Object.keys(categoriasDisponibles || CATEGORIAS_ALIMENTO).map((cat) => (
                        <button key={cat} onClick={() => setEditorAbierto({ ...editorAbierto, categoria: cat })}
                          className="text-left px-3 py-2 rounded-lg text-sm" style={{ color: TINTA, fontFamily: fontBody, background: PAPEL }}>
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {editorAbierto && editorAbierto.alimentoViejo === item.alimento && editorAbierto.categoria && !editorAbierto.especie && (
                  <div className="mt-3 pt-3" style={{ borderTop: "1px solid #F0ECF7" }}>
                    <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>{editorAbierto.categoria.toUpperCase()}</p>
                    <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                      <ListaDeEspecies
                        porEspecie={(categoriasDisponibles || CATEGORIAS_ALIMENTO)[editorAbierto.categoria]}
                        onElegir={(alimento) => cambiarAlimento(editorAbierto.alimentoViejo, alimento)}
                        onAbrir={(especie) => setEditorAbierto({ ...editorAbierto, especie })}
                        fondo={PAPEL}
                      />
                    </div>
                    <button onClick={() => setEditorAbierto({ ...editorAbierto, categoria: null })} className="text-xs mt-2" style={{ color: MALVA, fontFamily: fontBody }}>← Otra categoría</button>
                  </div>
                )}
                {editorAbierto && editorAbierto.alimentoViejo === item.alimento && editorAbierto.especie && (
                  <div className="mt-3 pt-3" style={{ borderTop: "1px solid #F0ECF7" }}>
                    <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>{editorAbierto.especie.toUpperCase()}</p>
                    <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                      {/* ⚠️ AÑADIDO (5 agosto, madrugada): "Todo el/la X"
                          recuperado aquí -- se había quitado del todo antes,
                          pero solo debía quitarse cuando la especie tiene 1
                          única opción (ahí es redundante). Con más de una,
                          hace falta para poder decir "cualquiera de estos
                          cortes vale" en vez de fijar uno exacto. */}
                      {(categoriasDisponibles || CATEGORIAS_ALIMENTO)[editorAbierto.categoria][editorAbierto.especie].length > 1 && (
                        <button onClick={() => cambiarAlimento(editorAbierto.alimentoViejo, `Todo: ${editorAbierto.especie}`)}
                          className="text-left px-3 py-2 rounded-lg text-sm" style={{ color: VIOLETA, fontFamily: fontBody, fontWeight: 700, background: "#F0ECF7" }}>
                          Todo el/la {editorAbierto.especie}
                        </button>
                      )}
                      {(categoriasDisponibles || CATEGORIAS_ALIMENTO)[editorAbierto.categoria][editorAbierto.especie].map((alimento) => (
                        <button key={alimento} onClick={() => cambiarAlimento(editorAbierto.alimentoViejo, alimento)}
                          className="text-left px-3 py-2 rounded-lg text-sm" style={{ color: TINTA, fontFamily: fontBody, background: PAPEL }}>
                          {alimento}
                        </button>
                      ))}
                    </div>
                    <button onClick={() => setEditorAbierto({ ...editorAbierto, especie: null })} className="text-xs mt-2" style={{ color: MALVA, fontFamily: fontBody }}>← Otra especie</button>
                  </div>
                )}
                {item.porque && porqueAbierto === i && (
                  <div className="mt-3 pt-3 flex gap-2 items-start" style={{ borderTop: "1px solid #F0ECF7" }}>
                    <Info size={14} style={{ color: ROSA, flexShrink: 0, marginTop: 2 }} />
                    <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>Hoy toca más de esto porque {item.porque}.</p>
                  </div>
                )}
                {comoAbierto === i && (
                  <div className="mt-3 pt-3" style={{ borderTop: "1px solid #F0ECF7" }}>
                    <div className="flex gap-2 items-start">
                      <UtensilsCrossed size={14} style={{ color: VIOLETA, flexShrink: 0, marginTop: 2 }} />
                      <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>{INSTRUCCIONES_POR_CATEGORIA[item.categoria]}</p>
                    </div>
                    {COMO_DAR_ALIMENTO[item.alimento] && (
                      <div className="mt-2.5 p-2.5 rounded-xl" style={{ background: PAPEL }}>
                        <p className="text-[10px] tracking-[0.1em] uppercase mb-1" style={{ color: MALVA, fontFamily: "monospace" }}>
                          Este alimento en concreto
                        </p>
                        <p className="text-xs mb-1" style={{ color: TINTA, fontFamily: fontBody }}>
                          {COMO_DAR_ALIMENTO[item.alimento].como}
                        </p>
                        {/* ⚠️ CORREGIDO (22 agosto) — CASO REAL: en la
                            zanahoria ponía "Como referencia, undefined —
                            con los 15g de hoy...". 34 de las 77 entradas
                            de COMO_DAR_ALIMENTO (todas las verduras y
                            frutas) tienen instrucción pero NO tienen
                            `pieza`, y la plantilla lo pintaba tal cual.
                            Sin `pieza` no hay referencia que dar, así que
                            no se pinta la línea. Los pesos de referencia
                            que faltan son un dato, no código: se añaden a
                            mano cuando los haya, y entonces aparecen
                            solas.

                            ⚠️ Y el número tampoco cuadraba: la fila de
                            arriba enseña el total para los días que se
                            preparan de golpe (item.gramos x multiplicador)
                            y esto enseñaba la ración de UN día. Los dos
                            eran correctos, pero juntos parecían
                            contradecirse: 105 g arriba y "los 15g de hoy"
                            debajo. Ahora se dicen las dos cosas y de dónde
                            sale cada una. */}
                        {COMO_DAR_ALIMENTO[item.alimento].pieza && (
                          <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>
                            {COMO_DAR_ALIMENTO[item.alimento].esComprimido
                              ? `${COMO_DAR_ALIMENTO[item.alimento].pieza} — se puede partir para dosis más pequeñas.`
                              : multiplicador > 1
                                ? `Como referencia, ${COMO_DAR_ALIMENTO[item.alimento].pieza} — los ${formatearGramos(item.gramos * multiplicador)} de arriba son para ${diasSeleccionados} días: ${formatearGramos(item.gramos)} al día.`
                                : `Como referencia, ${COMO_DAR_ALIMENTO[item.alimento].pieza} — con los ${formatearGramos(item.gramos)} de hoy te haces una idea de cuánto es.`}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {recienRecalculado && (
          <div className="rounded-xl p-3 mb-4 flex gap-2 items-center" style={{ background: VERDE }}>
            <CheckCircle2 size={14} style={{ color: VERDE_TEXTO, flexShrink: 0 }} />
            <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>
              Hemos recalculado los gramos y los nutrientes de todo el menú para que siga cuadrando.
            </p>
          </div>
        )}

        {!supAbierto && (
          <button
            onClick={() => setSupAbierto(true)}
            className="flex items-center gap-1.5 px-4 py-3 rounded-xl text-sm mb-6"
            style={{ background: "#FFFFFF", border: "1.5px dashed #C9BEDD", color: VIOLETA, fontFamily: fontBody }}
          >
            <Plus size={15} /> Añadir suplemento
          </button>
        )}

        {supAbierto && !supTipoAbierto && (
          <div className="rounded-xl p-3 mb-6" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
            <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>TIPO DE SUPLEMENTO</p>
            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
              <ListaDeEspecies
                porEspecie={CATEGORIAS_ALIMENTO["Suplementos comerciales"]}
                onElegir={(producto, tipo) => anadirSuplemento(tipo, producto)}
                onAbrir={(tipo) => setSupTipoAbierto(tipo)}
                fondo={PAPEL}
              />
            </div>
            <button onClick={() => setSupAbierto(false)} className="text-xs mt-2" style={{ color: MALVA, fontFamily: fontBody }}>Cancelar</button>
          </div>
        )}

        {supAbierto && supTipoAbierto && (
          <div className="rounded-xl p-3 mb-6" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
            <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>{supTipoAbierto.toUpperCase()}</p>
            <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
              {CATEGORIAS_ALIMENTO["Suplementos comerciales"][supTipoAbierto].map((producto) => (
                <button key={producto} onClick={() => anadirSuplemento(supTipoAbierto, producto)}
                  className="text-left px-3 py-2 rounded-lg text-sm" style={{ color: TINTA, fontFamily: fontBody, background: PAPEL }}>
                  {producto}
                </button>
              ))}
            </div>
            <button onClick={() => setSupTipoAbierto(null)} className="text-xs mt-2" style={{ color: MALVA, fontFamily: fontBody }}>← Otra categoría</button>
          </div>
        )}

        </>)}

        <div className="flex-1" />

        {/* ⚠️ MOVIDO (5 agosto, madrugada) — pedido expreso: este texto
            estaba arriba del todo, compitiendo en importancia visual
            con avisos de verdad relevantes (nutrientes, seguridad). Va
            aquí abajo, en pequeño -- solo cuando no hay patología
            diagnosticada, porque en ese caso el aviso rojo de arriba ya
            cubre este mismo mensaje con más fuerza.
            ⚠️ Y NUNCA EN MODO PROFESIONAL (7 septiembre): «enséñaselo a tu
            veterinario» no se le dice al veterinario. */}
        {!enModoProfesional && !((patologias || []).length > 0) && (
          <p className="text-[11px] text-center mb-3 px-2" style={{ color: MALVA, fontFamily: fontBody }}>
            Este menú es una propuesta calculada sobre los requisitos FEDIAF, no una
            prescripción. Antes de cambiarle la alimentación a {nombrePerro}, enséñaselo a tu
            veterinario — y consúltale también si notas cualquier cambio en su digestión, su
            peso o su ánimo.
          </p>
        )}
        {/* ⚠️ AÑADIDO — LA INVITACIÓN A CREAR LA CUENTA.
            Aquí y no antes: éste es el primer momento en que existe algo
            que perder. Pedir la cuenta en la primera pantalla es pedirla
            a cambio de nada, y por eso echa para atrás.
            Se puede ignorar -- no tapa el botón de abajo ni bloquea nada. */}
        {usuario?.local && (
          <div className="rounded-2xl p-4 mb-3" style={{ background: "#F0ECF7", border: `1.5px solid ${VIOLETA}` }}>
            <p className="text-sm mb-1" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 700 }}>
              Este menú sólo está en este móvil
            </p>
            <p className="text-xs leading-snug mb-3" style={{ color: TINTA, fontFamily: fontBody }}>
              Estás usando Rawku sin cuenta. Si creas una, {nombrePerro} y sus menús
              suben solos y los tendrás desde cualquier sitio. No hace falta ahora.
            </p>
            <button
              onClick={onCrearCuenta}
              className="w-full py-3 rounded-xl"
              style={{ background: VIOLETA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700, border: "none", cursor: "pointer" }}
            >
              Crear cuenta y guardarlo
            </button>
          </div>
        )}
        <button
          onClick={() => setSemanaConfirmada(true)}
          className="w-full py-4 rounded-2xl text-base"
          style={{ background: ROSA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}
        >
          Confirmar semana
        </button>
      </div>


      </>)}

      {seccionActiva === "perfil" && (
        <div className="fixed inset-0 z-50 flex flex-col px-6 pt-10 pb-8 overflow-y-auto cnl-pantalla-scroll" style={{ background: PAPEL }}>
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3 min-w-0">
            <BotonMenu onClick={() => onAbrirPanel?.()} color={VIOLETA} className="p-1" />
            </div>
            {/* ⚠️ CORREGIDO (24 agosto) — CASO REAL: "se ve raro lo del
                engranaje y el perfil en varias pantallas, se ve como arriba
                centrado, debería estar siempre en el mismo sitio".
                Cierto. En toda la app la regla es hamburguesa IZQUIERDA y
                burbuja DERECHA, con `justify-between` entre las dos. Al
                meter aquí el "← Volver" como TERCER hijo, el reparto dejaba
                la burbuja en medio. Ahora el volver va agrupado con la
                hamburguesa a la izquierda y la burbuja vuelve a su esquina,
                igual que en las demás pantallas. */}
            {burbujaClara}
          </div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-14 h-14 rounded-full flex items-center justify-center" style={{ background: VIOLETA }}>
              <Dog size={26} style={{ color: ROSA }} />
            </div>
            <div>
              <p className="text-2xl" style={{ color: TINTA, fontFamily: fontDisplay }}>{nombrePerro}</p>
              <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>{perfil?.raza?.nombre || "Raza no especificada"}</p>
            </div>
          </div>
          {[
            { label: "Peso actual", valor: `${perfil?.pesoActual || "-"}kg` },
            { label: "Etapa actual", valor: etapaLabel },
            { label: "Actividad", valor: ["Sedentario", "Normal", "Activo", "Muy activo", "Trabajo"][perfil?.actividadIdx] || "Normal" },
            { label: "Esterilizado", valor: perfil?.esterilizado === "si" ? "Sí" : "No" },
            { label: "Alergias", valor: (perfil?.alergias || []).map((a) => a.alimento.replace("Todo: ", "")).join(", ") || "Ninguna" },
            // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: aquí solo
            // salían las alergias, nunca las exclusiones (cosas que se
            // evitan sin ser alergia) ni las patologías -- ambas SÍ
            // afectan al menú generado, tenían que estar visibles igual.
            { label: "Exclusiones", valor: (perfil?.otrosEvitar || []).map((a) => a.alimento.replace("Todo: ", "")).join(", ") || "Ninguna" },
            { label: "Patologías", valor: (perfil?.patologias || []).map((k) => datosPatologia(k)?.label || k).join(", ") || "Ninguna" },
          ].map((campo) => (
            <div key={campo.label} className="flex items-center justify-between py-3" style={{ borderBottom: "1px solid #F0ECF7" }}>
              <span className="text-sm" style={{ color: MALVA, fontFamily: fontBody }}>{campo.label}</span>
              <span style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 15 }}>{campo.valor}</span>
            </div>
          ))}
          {/* ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: no había
              ninguna forma de editar el perfil desde aquí. */}
          <button
            onClick={() => setFase("onboarding")}
            className="w-full py-3 rounded-xl text-sm mt-6"
            style={{ background: VIOLETA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}
          >
            Editar perfil
          </button>
        </div>
      )}

      {seccionActiva === "evolucion" && (
        <div className="fixed inset-0 z-50 flex flex-col px-6 pt-10 pb-8 overflow-y-auto cnl-pantalla-scroll" style={{ background: PAPEL }}>
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3 min-w-0">
            <BotonMenu onClick={() => onAbrirPanel?.()} color={VIOLETA} className="p-1" />
            </div>
            {/* ⚠️ CORREGIDO (24 agosto) — CASO REAL: "se ve raro lo del
                engranaje y el perfil en varias pantallas, se ve como arriba
                centrado, debería estar siempre en el mismo sitio".
                Cierto. En toda la app la regla es hamburguesa IZQUIERDA y
                burbuja DERECHA, con `justify-between` entre las dos. Al
                meter aquí el "← Volver" como TERCER hijo, el reparto dejaba
                la burbuja en medio. Ahora el volver va agrupado con la
                hamburguesa a la izquierda y la burbuja vuelve a su esquina,
                igual que en las demás pantallas. */}
            {burbujaClara}
          </div>
          <p className="text-2xl mb-1" style={{ color: TINTA, fontFamily: fontDisplay }}>Evolución de {nombrePerro}</p>
          <p className="text-xs mb-6" style={{ color: MALVA, fontFamily: fontBody }}>Peso esperado vs. peso real registrado</p>
          <PremiumGate
            premium={premium}
            onSuscribir={() => { setSeccionActiva(null); onMostrarSuscripcion(); }}
            onCerrar={() => setSeccionActiva(null)}
            esDemo={PAYWALL_ES_DEMO}
            titulo="Evolución y crecimiento"
            descripcion="Sigue el peso real de tu perro y compáralo con la curva de crecimiento esperada."
          >
          <div className="rounded-2xl p-4 mb-5" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={Array.from({ length: 12 }, (_, i) => ({
                mes: i + 1,
                esperado: pesoEsperado(i + 1, pesoAdultoEsperado),
                real: i + 1 === (edad?.totalMeses || 0) ? Number(perfil?.pesoActual) : null,
              }))}>
                <CartesianGrid stroke="#F0ECF7" />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: MALVA }} />
                <YAxis tick={{ fontSize: 11, fill: MALVA }} unit="kg" />
                <Tooltip />
                <Line type="monotone" dataKey="esperado" stroke="#D8CFEC" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="real" stroke={ROSA} strokeWidth={2} dot={{ r: 4, fill: ROSA }} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="rounded-2xl p-4 mb-5" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
            <p style={{ color: VIOLETA, fontFamily: fontDisplay, fontSize: 28 }}>{perfil?.pesoActual}kg</p>
            <p className="text-xs mt-1" style={{ color: MALVA, fontFamily: fontBody }}>Necesidad calculada con este peso: <b style={{ color: TINTA }}>{derReal}kcal/día</b></p>
            <p className="text-xs mt-2 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
              Es un <b style={{ color: TINTA }}>punto de partida</b>. Dos perros iguales
              pueden necesitar hasta un 38% más o menos. Pésalo cada 2-3 semanas y ajusta
              la cantidad según cómo lo veas.
            </p>

            {/* ⚠️ AÑADIDO (25 agosto) — EL PESO OBJETIVO, A LA VISTA. Estaba
                calculado por dentro y no se enseñaba en ninguna parte, así
                que nadie podía notar que se movía. Y se movía: bajaba con el
                perro, un 20% por debajo de donde estuviera, y por eso la
                dieta no terminaba nunca. Un número que decide las kcal no
                puede estar escondido. */}
            {(() => {
              const obj = objetivoVigente(perfil, etapaCalculada);
              if (!(obj.kg > 0)) return null;   // en crecimiento no hay objetivo
              const dieta = comoVaLaDieta(perfil, etapaCalculada);
              const hayQueConfirmar = obj.esCalculadoAlVuelo && !objetivoConfirmado;
              return (
                <div className="mt-3 pt-3" style={{ borderTop: "1px solid #F0ECF7" }}>
                  <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>
                    Peso objetivo:{" "}
                    <b style={{ color: TINTA }}>{String(obj.kg).replace(".", ",")} kg</b>
                    {dieta?.enBajada && <span style={{ color: ROSA }}> · ración de bajada</span>}
                  </p>

                  {/* Fichas de antes de que el objetivo se guardara, y las
                      que traían uno que ya no se parece al perro. Se enseña
                      el número y se pide confirmarlo en vez de aplicarlo a
                      la callada: de él salen las kcal. */}
                  {hayQueConfirmar && (
                    <div className="mt-2">
                      <p className="text-[11px] leading-snug mb-2" style={{ color: MALVA, fontFamily: fontBody }}>
                        {obj.esViejo
                          ? `El objetivo que había guardado ya no cuadra con lo que pesa hoy, así que está recalculado con «${CONDICIONES[perfil?.condicionIdx ?? 2].label}».`
                          : `Sale de su peso de hoy y de «${CONDICIONES[perfil?.condicionIdx ?? 2].label}». Confírmalo y dejará de moverse cada vez que lo peses.`}
                      </p>
                      <button
                        aria-label="Confirmar el peso objetivo"
                        onClick={() => {
                          set("pesoObjetivoKg", obj.kg);
                          setObjetivoConfirmado(true);
                          if (usuario && perfil?._id) {
                            const ficha = { ...perfil, pesoObjetivoKg: obj.kg, id: perfil._id };
                            const d = datosDeUnPerro(ficha);
                            guardarPerro(usuario.id, ficha,
                              { etapa: d.etapaCalculada, pesoAdultoEsperado: d.pesoAdultoEsperado })
                              .then((g) => { if (g?.id) onPerroGuardado(g); })
                              .catch((err) => capturarError(err, { donde: "confirmarObjetivo" }));
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs"
                        style={{ background: VIOLETA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}>
                        Confirmar {String(obj.kg).replace(".", ",")} kg
                      </button>
                    </div>
                  )}

                  {/* ⚠️ EL AVISO DE QUE SE ACERCA. Al cruzar el objetivo la
                      ración pega un salto grande -- de dieta de bajada a
                      mantenimiento -- y lo que toca en ese momento no es que
                      le cambie la comida sin más, es volver a mirar al perro.
                      Por eso se avisa ANTES de cruzarlo, no después. */}
                  {dieta?.cerca && !hayQueConfirmar && (
                    <p className="text-[11px] mt-2 leading-snug px-2 py-2 rounded-lg"
                       style={{ background: "#FFF7E8", border: "1px solid #F5DFA8", color: "#7A5C00", fontFamily: fontBody }}>
                      {nombrePerro} está cerca de su peso objetivo. Cuando llegue, mira otra vez
                      cómo lo ves: la ración pasa de bajada a mantenimiento y sube bastante de golpe.
                    </p>
                  )}
                </div>
              );
            })()}
          </div>
          <div className="flex gap-2 mb-2">
            <input type="number" inputMode="decimal" value={nuevoPeso} onChange={(e) => setNuevoPeso(e.target.value)} placeholder="ej. 18.5"
              className="flex-1 text-lg py-3 px-4 rounded-xl outline-none" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0", color: TINTA, fontFamily: fontDisplay }} />
            <button onClick={() => {
              if (Number(nuevoPeso) > 0) {
                set("pesoActual", nuevoPeso);
                setNuevoPeso("");
                setAvisoPesoActualizado(true);
                setPreguntarCondicion(true);
                // ⚠️ CORREGIDO — CASO REAL: pesar al perro aquí decía
                // "✅ Peso actualizado" pero NO lo guardaba nunca. Este
                // `usuario` no existía en esta pantalla: VistaMenus no lo
                // recibía. Al pulsar Guardar, las tres líneas de antes ya
                // habían corrido (por eso salía el ✅ y cambiaba el peso
                // en pantalla) y justo aquí reventaba con un
                // ReferenceError — el peso se perdía al recargar y el
                // error se lo comía React. Ahora `usuario` llega como
                // prop desde arriba.
                if (usuario && perfil._id) {
                  // ⚠️ etapa y peso adulto se recalculan con el peso NUEVO:
                  // guardar el peso nuevo con la etapa vieja dejaría la
                  // ficha contradiciéndose a sí misma.
                  guardarPerro(usuario.id, { ...perfil, pesoActual: nuevoPeso, id: perfil._id },
                    (() => { const d = datosDeUnPerro({ ...perfil, pesoActual: nuevoPeso });
                             return { etapa: d.etapaCalculada, pesoAdultoEsperado: d.pesoAdultoEsperado }; })())
                    .then((perroGuardado) => { if (perroGuardado?.id) onPerroGuardado(perroGuardado); })
                    .catch(console.error);
                }
              }
            }}
              className="px-5 rounded-xl" style={{ background: ROSA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}>Guardar</button>
          </div>
          {/* ⚠️ LA PREGUNTA DEL 25 DE AGOSTO. De la condición salen las kcal:
              con «Rellenito» se calcula una dieta de bajada. Si el peso
              cambia y la condición no, seguimos dándole de comer como al
              perro de hace tres meses. Por eso al pesar se vuelve a
              preguntar, con la respuesta anterior ya marcada.

              Cualquier respuesta REHACE el peso objetivo con el peso que
              se acaba de meter -- también si eliges la misma de antes,
              porque "sigue rellenita, ahora con 6,2 kg" es información
              nueva, no una repetición. Lo que no se puede es que el
              objetivo se mueva sin que nadie haya mirado al perro: eso era
              el fallo. */}
          {preguntarCondicion && (
            <div className="rounded-xl p-3 mb-2" style={{ background: "#FFFFFF", border: "1.5px solid #D8CFEC" }}>
              <p className="text-xs mb-1" style={{ color: TINTA, fontFamily: fontBody, fontWeight: 700 }}>
                ¿Cómo ves a {nombrePerro} ahora?
              </p>
              <p className="text-[11px] mb-2 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
                De esto salen las kcal, no solo del peso. Si ya no le sobra, hay que decirlo
                aquí o le seguiremos dando una ración de bajada.
              </p>
              {/* ⚠️ EN MODO VETERINARIO, LA MISMA PREGUNTA EN BCS (29 agosto).
                  Pedido expreso: sus pantallas no van en el idioma de
                  "Rellenito". Y no es solo tono: si aquí se contestara con
                  los cinco escalones, un paciente con BCS 6 apuntado en
                  consulta se quedaría con un 7 al pesarlo, sin que nadie
                  hubiera cambiado de opinión sobre el perro. */}
              {enModoProfesional && (
                <div className="grid grid-cols-9 gap-1">
                  {ESCALA_BCS.map((b) => {
                    const puesta = bcsVigente(perfil) === b.n;
                    return (
                      <button key={b.n}
                        aria-label={`Ahora está: BCS ${b.n}`}
                        title={`${b.n} · ${b.titulo}`}
                        onClick={() => {
                          const peso = Number(perfil?.pesoActual);
                          const objetivo = pesoIdealDesdeBcs(peso, b.n);
                          set("bcs", b.n);
                          set("condicionIdx", condicionDesdeBcs(b.n));
                          set("condicionTocado", true);
                          set("pesoObjetivoKg", objetivo);
                          setPreguntarCondicion(false);
                          setObjetivoConfirmado(true);
                          if (usuario && perfil?._id) {
                            const ficha = { ...perfil, bcs: b.n, condicionIdx: condicionDesdeBcs(b.n),
                                            pesoObjetivoKg: objetivo, id: perfil._id };
                            const d = datosDeUnPerro(ficha);
                            guardarPerro(usuario.id, ficha,
                              { etapa: d.etapaCalculada, pesoAdultoEsperado: d.pesoAdultoEsperado })
                              .then((g) => { if (g?.id) onPerroGuardado(g); })
                              .catch((err) => capturarError(err, { donde: "bcsAlPesar" }));
                          }
                        }}
                        className="py-2 rounded-lg text-center text-sm"
                        style={{ background: puesta ? VIOLETA : PAPEL,
                                 border: `1.5px solid ${puesta ? VIOLETA : "#E3DAF0"}`,
                                 color: puesta ? "#FFFFFF" : TINTA, fontFamily: fontBody,
                                 cursor: "pointer" }}>
                        {b.n}
                      </button>
                    );
                  })}
                </div>
              )}
              <div className="flex flex-col gap-1.5" hidden={enModoProfesional}>
                {CONDICIONES.map((c, idx) => {
                  const puesta = idx === perfil?.condicionIdx;
                  return (
                    <button key={c.label}
                      aria-label={`Ahora está: ${c.label}`}
                      onClick={() => {
                        const peso = Number(perfil?.pesoActual);
                        const objetivo = pesoIdealDesdeCondicion(peso, idx);
                        set("condicionIdx", idx);
                        // El BCS equivalente, por lo mismo que en la ficha:
                        // dos campos que dicen la condición y solo uno
                        // actualizado es una ficha que se contradice.
                        set("bcs", bcsDesdeCondicion(idx));
                        set("condicionTocado", true);
                        set("pesoObjetivoKg", objetivo);
                        setPreguntarCondicion(false);
                        setObjetivoConfirmado(true);
                        if (usuario && perfil?._id) {
                          const ficha = { ...perfil, condicionIdx: idx, bcs: bcsDesdeCondicion(idx),
                                          pesoObjetivoKg: objetivo, id: perfil._id };
                          const d = datosDeUnPerro(ficha);
                          guardarPerro(usuario.id, ficha,
                            { etapa: d.etapaCalculada, pesoAdultoEsperado: d.pesoAdultoEsperado })
                            .then((g) => { if (g?.id) onPerroGuardado(g); })
                            .catch((err) => capturarError(err, { donde: "condicionAlPesar" }));
                        }
                      }}
                      className="text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between"
                      style={{
                        background: puesta ? "#F0EBF8" : PAPEL,
                        border: `1.5px solid ${puesta ? VIOLETA : "transparent"}`,
                        color: TINTA, fontFamily: fontBody,
                      }}>
                      <span>{c.label}</span>
                      <span className="text-[10px] text-right ml-2" style={{ color: MALVA, fontFamily: fontBody }}>
                        {c.detalle}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {avisoPesoActualizado ? (
            <div className="rounded-xl p-3 mb-2" style={{ background: "#F0EBF8", border: "1.5px solid #D8CFEC" }}>
              <p className="text-xs mb-2" style={{ color: TINTA, fontFamily: fontBody }}>
                ✅ Peso actualizado. Para que el menú refleje este cambio, regenera con los mismos ingredientes.
              </p>
              <button
                onClick={() => {
                  // ⚠️ CASO REAL ENCONTRADO (25 agosto, por Sentry):
                  // "ReferenceError: setMenuReal is not defined", sin
                  // manejar. Aquí había un `setMenuReal(null)` -- pero
                  // `menuReal` vive en el componente de fuera, no en éste.
                  // Pesabas al perro, salía el ✅, pulsabas "Regenerar
                  // menú adaptado al nuevo peso" y reventaba: el menú no
                  // se regeneraba nunca y en pantalla no pasaba nada.
                  //
                  // Es EL MISMO fallo que el de `usuario` doce líneas más
                  // arriba, en esta misma pantalla: JavaScript no avisa de
                  // un nombre que no existe hasta que se ejecuta esa línea,
                  // y esa línea solo se ejecuta pulsando ese botón.
                  //
                  // Vaciar el menú es cosa de quien lo tiene: lo hace
                  // `onRegenerarConAlimentos` en el componente de fuera.
                  // ⚠️ LOS ALIMENTOS NO SE SACAN DE AQUÍ (25 agosto). Se
                  // intentó (`menus.map(...)`) y estaba mal: abriendo
                  // Evolución desde el panel, esta vista recibe
                  // MENUS_EJEMPLO de relleno, así que se habrían mandado
                  // los alimentos del EJEMPLO como si fueran los del
                  // perro. Los menús de verdad los tiene el componente de
                  // fuera; que los lea de ahí.
                  setAvisoPesoActualizado(false);
                  setSeccionActiva(null);
                  onRegenerarConAlimentos();
                }}
                className="w-full py-2 rounded-lg text-sm"
                style={{ background: VIOLETA, color: "#FFFFFF", fontFamily: fontBody, fontWeight: 700 }}
              >
                Regenerar menú adaptado al nuevo peso →
              </button>
            </div>
          ) : (
            <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>Al guardar, este pasa a ser el peso actual.</p>
          )}
          </PremiumGate>
        </div>
      )}

      {seccionActiva === "menus" && (
        <div className="fixed inset-0 z-50 flex flex-col px-6 pt-10 pb-8" style={{ background: PAPEL }}>
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3 min-w-0">
            <BotonMenu onClick={() => onAbrirPanel?.()} color={VIOLETA} className="p-1" />
            </div>
            {/* ⚠️ CORREGIDO (24 agosto) — CASO REAL: "se ve raro lo del
                engranaje y el perfil en varias pantallas, se ve como arriba
                centrado, debería estar siempre en el mismo sitio".
                Cierto. En toda la app la regla es hamburguesa IZQUIERDA y
                burbuja DERECHA, con `justify-between` entre las dos. Al
                meter aquí el "← Volver" como TERCER hijo, el reparto dejaba
                la burbuja en medio. Ahora el volver va agrupado con la
                hamburguesa a la izquierda y la burbuja vuelve a su esquina,
                igual que en las demás pantallas. */}
            {burbujaClara}
          </div>
          <p className="text-2xl mb-4" style={{ color: TINTA, fontFamily: fontDisplay }}>Mis menús</p>
          <div className="flex flex-col gap-2">
            {menus.map((m, i) => (
              /* ⚠️ REHECHO (26 agosto) — TRES PUNTOS EN CADA MENÚ DE LA
                 SEMANA. Pedido expreso: "se tiene que poder borrar y editar
                 desde dentro y desde fuera; cada menú individual de la
                 semana y el global".
                 Era un solo <button> con toda la fila dentro, así que no
                 cabía otro botón: un botón dentro de otro no es HTML válido
                 y el navegador lo desmonta. Ahora la fila es un div con dos
                 botones hermanos, igual que en la lista de "Mis menús" de
                 fuera. */
              <div key={m.id} className="flex items-center gap-2 p-4 rounded-2xl"
                   style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
                <button onClick={() => { setTabActiva(m.id); setSeccionActiva(null); }}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: VIOLETA }}>
                    <ClipboardList size={16} style={{ color: ROSA }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="truncate" style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 16 }}>{m.nombre} · {m.kcal}kcal</p>
                    <p className="text-[10px] tracking-[0.1em] uppercase mt-0.5" style={{ color: MALVA, fontFamily: "monospace" }}>
                      {ETIQUETA_MODO[modo] || "AUTOMÁTICO"}
                    </p>
                  </div>
                  <ChevronRight size={16} style={{ color: "#C9BEDD" }} />
                </button>
                {/* Solo si el menú está GUARDADO: renombrar uno que todavía
                    no se ha guardado no tendría dónde escribirse. */}
                {onAccionesDeMenu && (
                  <button onClick={() => onAccionesDeMenu(i)}
                          aria-label={`Opciones de ${m.nombre}`}
                          className="shrink-0 w-9 h-9 rounded-full flex items-center justify-center"
                          style={{ background: PAPEL, border: "none" }}>
                    <MoreVertical size={16} style={{ color: MALVA }} />
                  </button>
                )}
              </div>
            ))}
            <button
              onClick={() => { setSeccionActiva(null); onVolver(); }}
              className="flex items-center gap-3 p-4 rounded-2xl text-left mt-1"
              style={{ background: "transparent", border: "1.5px dashed #C9BEDD" }}
            >
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: PAPEL }}>
                <Plus size={17} style={{ color: VIOLETA }} />
              </div>
              <div className="flex-1 min-w-0">
                <p style={{ color: VIOLETA, fontFamily: fontDisplay, fontSize: 16 }}>Crear otro menú</p>
                <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>Automático o personalizado</p>
              </div>
              <ChevronRight size={16} style={{ color: "#C9BEDD" }} />
            </button>
          </div>
        </div>
      )}

      {seccionActiva === "porque" && (
        <div className="fixed inset-0 z-50 flex flex-col px-6 pt-10 pb-8 overflow-y-auto cnl-pantalla-scroll" style={{ background: PAPEL }}>
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3 min-w-0">
            <BotonMenu onClick={() => onAbrirPanel?.()} color={VIOLETA} className="p-1" />
            </div>
            {/* ⚠️ CORREGIDO (24 agosto) — CASO REAL: "se ve raro lo del
                engranaje y el perfil en varias pantallas, se ve como arriba
                centrado, debería estar siempre en el mismo sitio".
                Cierto. En toda la app la regla es hamburguesa IZQUIERDA y
                burbuja DERECHA, con `justify-between` entre las dos. Al
                meter aquí el "← Volver" como TERCER hijo, el reparto dejaba
                la burbuja en medio. Ahora el volver va agrupado con la
                hamburguesa a la izquierda y la burbuja vuelve a su esquina,
                igual que en las demás pantallas. */}
            {burbujaClara}
          </div>
          <p className="text-2xl mb-5" style={{ color: TINTA, fontFamily: fontDisplay }}>Por qué Rawku</p>
          <p className="text-sm leading-relaxed mb-4" style={{ color: TINTA, fontFamily: fontBody }}>
            Cuando decidí alimentar a mi perro con BARF, mi mayor preocupación era hacerlo bien. Quería ofrecerle
            una alimentación natural, pero también tener la seguridad de que estaba recibiendo todos los nutrientes
            que necesitaba.
          </p>
          <p className="text-sm leading-relaxed mb-4" style={{ color: TINTA, fontFamily: fontBody }}>
            Al investigar descubrí que la mayoría de recomendaciones se basaban en un porcentaje del peso del perro
            según su edad o etapa de crecimiento. Pero surgió una duda: si cada menú tiene una composición y un
            aporte energético diferente, ¿por qué todos iban a necesitar la misma cantidad?
          </p>
          <p className="text-sm leading-relaxed" style={{ color: TINTA, fontFamily: fontBody }}>
            Así nació Rawku: una herramienta creada para calcular la ración de forma más precisa, teniendo en
            cuenta las necesidades reales de cada perro y la composición de cada menú. Porque alimentar de forma
            natural también debería ser alimentar con conocimiento.
          </p>
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl mt-4" style={{ background: "#F0ECF7" }}>
            <Heart size={14} style={{ color: VIOLETA, flexShrink: 0 }} />
            <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>Basado en las tablas de FEDIAF, la autoridad europea de nutrición canina.</p>
          </div>
        </div>
      )}

      {seccionActiva === "analizar" && (
        <div className="fixed inset-0 z-50 flex flex-col px-6 pt-10 pb-8 overflow-y-auto cnl-pantalla-scroll" style={{ background: PAPEL }}>
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3 min-w-0">
              <BotonMenu onClick={() => onAbrirPanel?.()} color={VIOLETA} className="p-1" />
            </div>
            {burbujaClara}
          </div>
          <PremiumGate
            premium={premium}
            onSuscribir={() => { setSeccionActiva(null); onMostrarSuscripcion(); }}
            onCerrar={() => setSeccionActiva(null)}
            esDemo={PAYWALL_ES_DEMO}
            titulo="Analizador nutricional"
            descripcion="Analiza en detalle los nutrientes de la dieta actual de tu perro."
          >
          {/* ⚠️ CORREGIDO — aquí había un ternario a medio deshacer: un
              bloque suelto con el título repetido y un `) : (` sin su
              `{condicion ? (` delante. JSX no se queja de eso: lo trata
              como texto, así que en la pantalla salía literalmente
              ") : (" debajo del título, y el título dos veces. */}
          <div>
          <p className="text-2xl mb-2" style={{ color: TINTA, fontFamily: fontDisplay }}>Analizar la dieta actual</p>
          <p className="text-sm leading-relaxed mb-5" style={{ color: MALVA, fontFamily: fontBody }}>
            Dinos qué le estás dando ahora mismo y cuántos gramos de cada cosa.
            Lo comparamos con lo que necesita y te decimos qué está bien y qué no.
          </p>

          {/* ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: no
              siempre se analiza la dieta del perro configurado en la
              app -- puede ser la de otro perro, sin querer crear un
              perfil nuevo permanente solo para este análisis puntual. */}
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => setAnalizandoParaOtro(false)}
              className="flex-1 py-2 rounded-lg text-sm"
              style={{ background: !analizandoParaOtro ? VIOLETA : "#FFFFFF", color: !analizandoParaOtro ? "#FFFFFF" : MALVA, fontFamily: fontBody, fontWeight: 600, border: "1.5px solid #E3DAF0" }}
            >
              {nombrePerro}
            </button>
            <button
              onClick={() => setAnalizandoParaOtro(true)}
              className="flex-1 py-2 rounded-lg text-sm"
              style={{ background: analizandoParaOtro ? VIOLETA : "#FFFFFF", color: analizandoParaOtro ? "#FFFFFF" : MALVA, fontFamily: fontBody, fontWeight: 600, border: "1.5px solid #E3DAF0" }}
            >
              Otro perro
            </button>
          </div>

          {!analizandoParaOtro && (
            <div className="px-4 py-3 rounded-xl mb-5" style={{ background: "#F0ECF7" }}>
              <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>
                Usamos el perfil de {nombrePerro}: {etapaLabel}, {derParaAnalisis} kcal al día.
              </p>
            </div>
          )}
          {analizandoParaOtro && (
            <div className="px-4 py-3 rounded-xl mb-5 flex flex-col gap-2.5" style={{ background: "#F0ECF7" }}>
              <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>
                Solo para este análisis -- no se guarda como una mascota nueva.
              </p>
              <div className="flex gap-2">
                <div className="flex-1">
                  <p className="text-[11px] mb-1" style={{ color: MALVA, fontFamily: fontBody }}>Peso (kg)</p>
                  <input
                    type="number" inputMode="decimal" min="0" placeholder="18"
                    value={otroPerroDatos.peso}
                    onChange={(e) => setOtroPerroDatos((p) => ({ ...p, peso: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ border: "1.5px solid #E3DAF0", color: TINTA, fontFamily: fontMono }}
                  />
                </div>
                <div className="flex-1">
                  <p className="text-[11px] mb-1" style={{ color: MALVA, fontFamily: fontBody }}>Etapa</p>
                  <select
                    value={otroPerroDatos.etapa}
                    onChange={(e) => setOtroPerroDatos((p) => ({ ...p, etapa: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg text-sm"
                    style={{ border: "1.5px solid #E3DAF0", color: TINTA, fontFamily: fontBody }}
                  >
                    <option value="cachorro_joven">Cachorro (hasta 2 meses)</option>
                    <option value="cachorro_crecimiento">Cachorro (en crecimiento)</option>
                    <option value="adulto">Adulto</option>
                    <option value="senior">Senior</option>
                  </select>
                </div>
              </div>
              {(otroPerroDatos.etapa === "cachorro_joven" || otroPerroDatos.etapa === "cachorro_crecimiento") && (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <p className="text-[11px] mb-1" style={{ color: MALVA, fontFamily: fontBody }}>Peso adulto esperado (kg)</p>
                    <input
                      type="number" inputMode="decimal" min="0" placeholder="30"
                      value={otroPerroDatos.pesoAdulto}
                      onChange={(e) => setOtroPerroDatos((p) => ({ ...p, pesoAdulto: e.target.value }))}
                      className="w-full px-3 py-2 rounded-lg text-sm"
                      style={{ border: "1.5px solid #E3DAF0", color: TINTA, fontFamily: fontMono }}
                    />
                  </div>
                </div>
              )}
              {derParaAnalisis ? (
                <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>
                  Necesita, aproximadamente, <b>{derParaAnalisis} kcal al día</b>.
                </p>
              ) : (
                <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>
                  Dinos al menos el peso para poder calcular lo que necesita.
                </p>
              )}
            </div>
          )}

          {/* ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: algunas
              dietas comerciales dan el reparto en % ("70% pollo"), no en
              gramos exactos. Con este toggle se puede introducir de
              cualquiera de las dos formas. */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={() => setModoEntradaAnalizar("gramos")}
              className="flex-1 py-2 rounded-lg text-sm"
              style={{ background: modoEntradaAnalizar === "gramos" ? VIOLETA : "#FFFFFF", color: modoEntradaAnalizar === "gramos" ? "#FFFFFF" : MALVA, fontFamily: fontBody, fontWeight: 600, border: "1.5px solid #E3DAF0" }}
            >
              En gramos
            </button>
            <button
              onClick={() => setModoEntradaAnalizar("porcentaje")}
              className="flex-1 py-2 rounded-lg text-sm"
              style={{ background: modoEntradaAnalizar === "porcentaje" ? VIOLETA : "#FFFFFF", color: modoEntradaAnalizar === "porcentaje" ? "#FFFFFF" : MALVA, fontFamily: fontBody, fontWeight: 600, border: "1.5px solid #E3DAF0" }}
            >
              En porcentaje
            </button>
          </div>
          {modoEntradaAnalizar === "porcentaje" && (
            <div className="mb-5">
              <p className="text-xs mb-1.5" style={{ color: MALVA, fontFamily: fontBody }}>¿Cuántos gramos en total le das al día?</p>
              <input
                type="number" inputMode="numeric" min="0" placeholder="600"
                value={totalGramosDiaPorcentaje}
                onChange={(e) => setTotalGramosDiaPorcentaje(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg text-sm"
                style={{ border: "1.5px solid #E3DAF0", color: TINTA, fontFamily: fontMono }}
              />
            </div>
          )}

          {/* ⚠️ REDISEÑADO (5 agosto, noche): antes era una sola lista
              plana -- añadir un alimento de cada categoría significaba
              volver a abrir el selector entero cada vez, eligiendo
              categoría otra vez desde cero. Ahora, igual que en
              Personalizar, cada categoría es su propia tarjeta siempre
              visible, con su botón de añadir dentro -- se puede ir
              completando categoría a categoría sin perder el sitio. */}
          {CATEGORIAS_ICONOS.map((cat) => {
            const Icono = cat.Icono;
            const itemsDeEstaCategoria = dietaAnalizar
              .map((it, idxReal) => ({ ...it, idxReal }))
              .filter((it) => it.categoria === cat.nombre);
            const abierto = abiertoAnalizar && abiertoAnalizar.categoria === cat.nombre ? abiertoAnalizar : null;
            const catsParaEsta = { [cat.nombre]: (categoriasDisponibles || CATEGORIAS_ALIMENTO)[cat.nombre] };
            return (
              <div key={cat.nombre} className="rounded-2xl p-4 mb-3" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
                <div className="flex items-center gap-3 mb-1">
                  <div className="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: PAPEL }}>
                    <Icono size={16} strokeWidth={1.6} style={{ color: VIOLETA }} />
                  </div>
                  <p className="flex-1" style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 16 }}>{cat.nombre}</p>
                </div>
                {itemsDeEstaCategoria.length > 0 && (
                  <div className="mt-3 pl-12 flex flex-col gap-2">
                    {itemsDeEstaCategoria.map((it) => (
                      <div key={it.idxReal} className="flex items-center gap-2">
                        <span className="flex-1 text-sm" style={{ color: TINTA, fontFamily: fontBody }}>{it.alimento}</span>
                        <input
                          type="number" inputMode="numeric" min="0" placeholder="0"
                          value={it.gramos}
                          onChange={(e) => setDietaAnalizar((prev) => prev.map((x, i) => i === it.idxReal ? { ...x, gramos: e.target.value } : x))}
                          className="w-16 text-right text-sm px-2 py-1.5 rounded-lg"
                          style={{ border: "1.5px solid #E3DAF0", color: VIOLETA, fontFamily: fontMono }}
                        />
                        <span className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>{modoEntradaAnalizar === "porcentaje" ? "%" : "g"}</span>
                        <button onClick={() => setDietaAnalizar((prev) => prev.filter((_, i) => i !== it.idxReal))}>
                          <X size={14} style={{ color: ROSA }} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="mt-3 pl-12">
                  {!abierto && (
                    <button onClick={() => setAbiertoAnalizar({ categoria: cat.nombre, especie: null })}
                      aria-label={`${cat.nombre}: añadir alimento`}
                      className="px-3 py-2 rounded-lg text-sm" style={{ background: PAPEL, color: MALVA, fontFamily: fontBody, border: "1.5px dashed #C9BEDD" }}>
                      {itemsDeEstaCategoria.length > 0 ? "+ Añadir otro" : "+ Añadir alimento"}
                    </button>
                  )}
                  {abierto && !abierto.especie && (
                    <div className="rounded-xl p-3" style={{ background: PAPEL }}>
                      <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>ESPECIE</p>
                      <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                        <ListaDeEspecies
                          porEspecie={catsParaEsta[cat.nombre]}
                          onElegir={(alimento) => {
                            setDietaAnalizar((prev) => [...prev, { categoria: cat.nombre, alimento, gramos: "" }]);
                            setAbiertoAnalizar(null);
                          }}
                          onAbrir={(especie) => setAbiertoAnalizar({ categoria: cat.nombre, especie })}
                        />
                      </div>
                      <button onClick={() => setAbiertoAnalizar(null)} className="text-xs mt-2" style={{ color: MALVA, fontFamily: fontBody }}>Cancelar</button>
                    </div>
                  )}
                  {abierto && abierto.especie && (
                    <div className="rounded-xl p-3" style={{ background: PAPEL }}>
                      <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>{abierto.especie.toUpperCase()}</p>
                      <div className="flex flex-col gap-1.5 max-h-48 overflow-y-auto">
                        {(catsParaEsta[cat.nombre]?.[abierto.especie] || []).map((alimento) => (
                          <button key={alimento} onClick={() => {
                              setDietaAnalizar((prev) => [...prev, { categoria: cat.nombre, alimento, gramos: "" }]);
                              setAbiertoAnalizar(null);
                            }}
                            className="text-left px-3 py-2 rounded-lg text-sm" style={{ color: TINTA, fontFamily: fontBody, background: "#FFFFFF" }}>
                            {alimento}
                          </button>
                        ))}
                      </div>
                      <button onClick={() => setAbiertoAnalizar({ categoria: cat.nombre, especie: null })} className="text-xs mt-2" style={{ color: MALVA, fontFamily: fontBody }}>← Otra especie</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {dietaAnalizar.length > 0 && (() => {
            const esPct = modoEntradaAnalizar === "porcentaje";
            const totalPctMetido = dietaAnalizar.reduce((s, i) => s + (Number(i.gramos) || 0), 0);
            const totalGramosDia = esPct ? Number(totalGramosDiaPorcentaje) || 0 : null;
            const totalGramosMetidos = esPct
              ? (totalPctMetido / 100) * totalGramosDia
              : dietaAnalizar.reduce((s, i) => s + (Number(i.gramos) || 0), 0);
            const kcalMetidas = dietaAnalizar.reduce((s, i) => {
              const gramosReales = esPct ? (Number(i.gramos) || 0) / 100 * totalGramosDia : (Number(i.gramos) || 0);
              return s + gramosReales * (energiaAlimentos[i.alimento] || 0) / 100;
            }, 0);
            const hayDatosEnergia = Object.keys(energiaAlimentos).length > 0;
            return (
              <div className="mb-5">
                <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>
                  {esPct
                    ? `Total: ${Math.round(totalPctMetido)}% ${totalGramosDia ? `(≈ ${Math.round(totalGramosMetidos)} g al día)` : ""}`
                    : `Total: ${totalGramosMetidos} g al día`}
                </p>
                {hayDatosEnergia && derParaAnalisis && (!esPct || totalGramosDia > 0) && (
                  <p className="text-xs mt-1" style={{ color: Math.abs(kcalMetidas - derParaAnalisis) / derParaAnalisis > 0.1 ? ROSA : "#5A9367", fontFamily: fontBody }}>
                    Eso son {Math.round(kcalMetidas)} kcal · {analizandoParaOtro ? "este perro" : nombrePerro} necesita {derParaAnalisis} kcal al día
                  </p>
                )}
              </div>
            );
          })()}

          <button
            onClick={analizarDietaActual}
            disabled={analizando}
            className="w-full py-3.5 rounded-xl text-sm mb-4"
            style={{ background: analizando ? MALVA : ROSA, color: "#FFFFFF", fontFamily: fontBody }}
          >
            {analizando ? "Analizando…" : "Analizar esta dieta"}
          </button>

          {errorAnalisis && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl mb-4" style={{ background: "#FFF0F3" }}>
              <AlertCircle size={15} style={{ color: ROSA, flexShrink: 0, marginTop: 1 }} />
              <p className="text-xs" style={{ color: TINTA, fontFamily: fontBody }}>{errorAnalisis}</p>
            </div>
          )}

          {resultadoAnalisis && (
            <div className="mb-4">
              <div className="px-4 py-4 rounded-2xl mb-4" style={{ background: VIOLETA }}>
                <p className="text-base leading-snug" style={{ color: "#FFFFFF", fontFamily: fontDisplay }}>
                  {resultadoAnalisis.veredicto}
                </p>
              </div>

              <div className="px-4 py-3.5 rounded-xl mb-3" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
                <p className="text-xs mb-1" style={{ color: MALVA, fontFamily: fontMono, letterSpacing: "0.08em" }}>ENERGÍA</p>
                <p className="text-sm leading-relaxed" style={{ color: TINTA, fontFamily: fontBody }}>
                  {resultadoAnalisis.energia.texto}
                </p>
                <p className="text-xs mt-1.5" style={{ color: MALVA, fontFamily: fontBody }}>
                  Aporta {resultadoAnalisis.energia.aporta_kcal} kcal · necesita {resultadoAnalisis.energia.necesita_kcal} kcal
                </p>
              </div>

              {resultadoAnalisis.sobran.length > 0 && (
                <div className="px-4 py-3.5 rounded-xl mb-3" style={{ background: "#FFF0F3", border: "1.5px solid #FFD5DE" }}>
                  <p className="text-xs mb-2" style={{ color: ROSA, fontFamily: fontMono, letterSpacing: "0.08em" }}>SE PASA DE LO RECOMENDADO</p>
                  {resultadoAnalisis.sobran.map((s) => (
                    <div key={s.nutriente} className="mb-2.5">
                      <p className="text-sm" style={{ color: TINTA, fontFamily: fontBody }}>
                        {s.nutriente}: {s.del_maximo_pct}% del máximo
                      </p>
                      {s.por_que_importa && (
                        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "#7A6A88", fontFamily: fontBody }}>{s.por_que_importa}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {resultadoAnalisis.faltan.length > 0 && (
                <div className="px-4 py-3.5 rounded-xl mb-3" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
                  <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: fontMono, letterSpacing: "0.08em" }}>LE FALTA ({resultadoAnalisis.faltan.length})</p>
                  {resultadoAnalisis.faltan.map((f) => (
                    <div key={f.nutriente} className="mb-2.5">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full" style={{ background: "#EDE7F3" }}>
                          <div className="h-full rounded-full" style={{ width: `${Math.min(100, f.cubre_pct)}%`, background: ROSA }} />
                        </div>
                        <span className="text-xs w-10 text-right" style={{ color: ROSA, fontFamily: fontMono }}>{f.cubre_pct}%</span>
                      </div>
                      <p className="text-sm mt-1" style={{ color: TINTA, fontFamily: fontBody }}>{f.nutriente}</p>
                      {f.de_donde && (
                        <p className="text-xs leading-relaxed" style={{ color: "#7A6A88", fontFamily: fontBody }}>Suele venir de {f.de_donde}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              <div className="px-4 py-3.5 rounded-xl mb-3" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
                <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: fontMono, letterSpacing: "0.08em" }}>CÓMO REPARTE LOS GRAMOS</p>
                {resultadoAnalisis.reparto.map((r) => (
                  <div key={r.categoria} className="flex items-center justify-between mb-1">
                    <span className="text-sm" style={{ color: TINTA, fontFamily: fontBody }}>{r.categoria}</span>
                    <span className="text-xs" style={{ color: MALVA, fontFamily: fontMono }}>{r.gramos} g · {r.pct}%</span>
                  </div>
                ))}
                {resultadoAnalisis.calcio_fosforo.ratio && (
                  <p className="text-xs mt-2.5" style={{ color: resultadoAnalisis.calcio_fosforo.correcto ? "#5A9367" : ROSA, fontFamily: fontBody }}>
                    Calcio:fósforo {resultadoAnalisis.calcio_fosforo.ratio}:1 — {resultadoAnalisis.calcio_fosforo.correcto ? "dentro de lo recomendado" : "fuera de lo recomendado"} ({resultadoAnalisis.calcio_fosforo.referencia})
                  </p>
                )}
              </div>

              <p className="text-xs mb-3" style={{ color: MALVA, fontFamily: fontBody }}>
                {resultadoAnalisis.correctos} de {resultadoAnalisis.total_comprobados} nutrientes están correctos.
              </p>

              <div className="flex items-start gap-2 px-4 py-3 rounded-xl" style={{ background: "#F0ECF7" }}>
                <Info size={14} style={{ color: VIOLETA, flexShrink: 0, marginTop: 1 }} />
                <p className="text-xs leading-relaxed" style={{ color: TINTA, fontFamily: fontBody }}>{resultadoAnalisis.aviso}</p>
              </div>
            </div>
          )}
          </div>
          </PremiumGate>
        </div>
      )}

      {semanaConfirmada && (
        <div className="fixed inset-0 z-50 flex flex-col px-6 pt-10 pb-8 overflow-y-auto cnl-pantalla-scroll" style={{ background: PAPEL }}>
          {/* ⚠️ REDISEÑADO (5 agosto, madrugada) — pedido expreso: antes
              esto era solo un "¡Todo listo!" genérico con tres botones
              de navegación -- ahora es un resumen real de lo que se
              acaba de guardar: una tarjeta por cada menú, con el total
              de gramos y los ingredientes (sin gramos por ingrediente,
              solo los nombres, tal como se pidió). El menú lateral
              queda accesible directamente desde aquí, a la izquierda,
              en vez de tener que pasar por un botón de "volver". */}
          <div className="flex items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3 min-w-0">
              <BotonMenu onClick={() => onAbrirPanel?.()} color={VIOLETA} className="p-1" />
              <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>
                Guardado
              </p>
            </div>
            {burbujaClara}
          </div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={{ background: VIOLETA }}>
              <Dog size={20} strokeWidth={1.4} style={{ color: ROSA }} />
            </div>
            <div>
              <p className="text-xl leading-tight" style={{ color: VIOLETA, fontFamily: fontDisplay, fontWeight: 600 }}>
                Menú{menus.length > 1 ? "s" : ""} de {nombrePerro}
              </p>
              <p className="text-xs" style={{ color: MALVA, fontFamily: fontBody }}>
                Puedes seguir cambiando lo que quieras cuando quieras.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 mb-6">
            {menus.map((m, i) => {
              // ⚠️ los gramos EDITADOS (si los hay) son los que de
              // verdad valen -- menu.items es solo el original, antes
              // de cualquier cambio hecho a mano después de generarlo.
              const gramosDeVerdad = gramosRealesPorMenu[m.id];
              const items = gramosDeVerdad
                ? Object.entries(gramosDeVerdad).map(([alimento, gramos]) => ({ alimento, gramos }))
                : m.items;
              const totalGramos = Math.round(items.reduce((s, it) => s + (Number(it.gramos) || 0), 0));
              return (
                <button
                  key={m.id}
                  onClick={() => { setSemanaConfirmada(false); setTabActiva(m.id); }}
                  className="text-left p-4 rounded-2xl"
                  style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span style={{ color: TINTA, fontFamily: fontDisplay, fontSize: 16, fontWeight: 600 }}>
                      {/* ⚠️ EL NOMBRE, no el número (26 agosto). Pedido
                          expreso: "donde aparezcan los nombres de los menús
                          que pone menú uno o menú tres días, ahí tiene que
                          aparecer el nombre de cada menú si lo tiene".
                          `m.nombre` ya cae al número cuando no hay nombre
                          guardado (ver `respuestaApiAMenu`), así que esto
                          sigue diciendo "Menú 2" en los que no se han
                          renombrado. */}
                      {menus.length > 1 ? m.nombre : (m.nombre || "Menú")}
                    </span>
                    <span className="text-xs" style={{ color: MALVA, fontFamily: "monospace" }}>
                      {totalGramos} g
                    </span>
                  </div>
                  {/* ⚠️ AÑADIDO (5 agosto, madrugada): esto es lo que
                      antes salía roto ("2 días", "semana 2"...) -- el
                      dato ya existía (m.dias), solo faltaba mostrarlo
                      con sentido. */}
                  <p className="text-xs mb-1.5" style={{ color: VIOLETA, fontFamily: fontBody, fontWeight: 600 }}>
                    {m.dias} {m.dias === 1 ? "día" : "días"} a la semana
                  </p>
                  <p className="text-xs leading-relaxed" style={{ color: MALVA, fontFamily: fontBody }}>
                    {items.map((it) => it.alimento).join(" · ")}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="flex-1" />
        </div>
      )}
    </div>
  );
}
