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
import { AlertCircle, Check, ChevronDown, Menu, Plus, Printer, Search, Sparkles, Trash2, X } from "lucide-react";
import { API_BASE, fetchConTimeout } from "./api.js";
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

export default function Formulador({
  perfil, derObjetivo, etapaRequisitos, pesoPerroKg, pesoAdultoEsperadoKg,
  pesoObjetivoKg, patologias = [], especiesExcluidas = [], nombresExcluidos = [],
  categoriasExcluidas = [], gramosIniciales = null, onGuardar = null, onVolver = () => {},
  firmante = null, onFirmar = null, onAbrirPanel = null, dietaActual = null,
  // La miga de pan «‹ Pacientes» y la rueda de ajustes, que van en TODAS las
  // pantallas. Las pinta el padre porque son suyas (saben a qué paciente
  // vuelven y qué ajustes abren); aquí solo se colocan en la cabecera.
  burbuja = null,
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
    etapa_requisitos: etapaRequisitos,
    peso_perro_kg: pesoPerroKg ?? null,
    peso_adulto_esperado_kg: pesoAdultoEsperadoKg ?? null,
    peso_objetivo_kg: pesoObjetivoKg ?? null,
    patologias: patologias || [],
    especies_excluidas: especiesExcluidas || [],
    nombres_excluidos: nombresExcluidos || [],
    categorias_excluidas: categoriasExcluidas || [],
    // El peldaño viaja en TODAS las llamadas y no solo en autocompletar:
    // `/formular/estado` lo ignora (solo mide lo que hay puesto), pero
    // mandarlo desde un solo sitio es lo que impide que autocompletar
    // formule en un peldaño y la pantalla enseñe otro.
    peldano,
  }), [derObjetivo, etapaRequisitos, pesoPerroKg, pesoAdultoEsperadoKg, pesoObjetivoKg,
      patologias, especiesExcluidas, nombresExcluidos, categoriasExcluidas, peldano]);

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
    const fuera = new Set(categoriasExcluidas || []);
    const salida = [];
    for (const [cat, lista] of Object.entries(catalogo)) {
      if (fuera.has(cat)) continue;
      for (const a of lista) {
        if (a.nombre.toLowerCase().includes(q) && !(a.nombre in gramos)) {
          salida.push({ ...a, categoria: cat });
        }
      }
    }
    return salida.slice(0, 12);
  }, [catalogo, busqueda, gramos, categoriasExcluidas]);

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
          <div className="flex items-center gap-2 shrink-0">
            {burbuja}
            {onAbrirPanel && (
              <button onClick={onAbrirPanel} aria-label="Menú"
                      style={{ background: "transparent", border: "none", cursor: "pointer" }}>
                <Menu size={20} style={{ color: "#FFFFFF" }} />
              </button>
            )}
          </div>
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
              {resultados.map((a) => (
                <button key={a.nombre}
                  onClick={() => { ponerGramos(a.nombre, "100"); setBusqueda(""); setBuscando(false); }}
                  className="w-full text-left px-3 py-2 rounded-lg flex items-center justify-between mb-1"
                  style={{ background: PAPEL, border: "1.5px solid #E3DAF0", cursor: "pointer" }}>
                  <span style={{ color: TINTA, fontFamily: fontBody, fontSize: 14 }}>{a.nombre}</span>
                  <span className="text-[11px]" style={{ color: MALVA, fontFamily: "monospace" }}>
                    {a.categoria} · {Math.round(a.kcal_100g)} kcal/100 g
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <button onClick={() => setBuscando(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl mt-2"
              style={{ background: PAPEL, border: "1.5px dashed #C9BEDD", color: VIOLETA,
                       fontFamily: fontBody, fontSize: 14, cursor: "pointer" }}>
              <Plus size={15} /> Añadir alimento
            </button>
          )}

          <button onClick={autocompletar} disabled={autocompletando}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl mt-3"
            style={{ background: VIOLETA, color: "#FFFFFF", border: "none",
                     fontFamily: fontDisplay, fontSize: 15,
                     opacity: autocompletando ? 0.6 : 1, cursor: "pointer" }}>
            <Sparkles size={16} /> {autocompletando ? "Completando…" : "Autocompletar lo que falta"}
          </button>
          <p className="text-[11px] mt-2 leading-snug" style={{ color: MALVA, fontFamily: fontBody }}>
            Tus cantidades no se tocan: el motor completa alrededor, y lo que rellena se puede
            seguir editando.
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
              await onGuardar(soloPositivos(gramos), estado, indicaciones);
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
