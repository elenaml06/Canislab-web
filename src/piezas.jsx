// ─── Las piezas sueltas de la interfaz ─────────────────────────────────────
//
// Botones, cabeceras, la rueda de elegir, el selector de alimentos, la
// silueta del perro. Componentes pequeños, sin estado propio de negocio,
// que usan tanto App.jsx como VistaMenus.

import { ChevronLeft, ChevronRight, Menu, Plus, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MALVA, PAPEL, ROSA, TINTA, VIOLETA, fontBody, fontDisplay } from "./estilo";
import { CATEGORIAS_ALIMENTO } from "./catalogoapp";

export const TOTAL_PASOS = 6;

// ─── ELEGIR ALIMENTO: LA LISTA DE ESPECIES, UNA SOLA VEZ ─────────────────────
//
// ⚠️ CASO REAL ENCONTRADO (25 agosto): "veo que hay en ciertas categorías
// alimentos dentro de otra subcategoría cuando solo hay un alimento dentro,
// por ejemplo en verduras seleccionas acelga y se abre otra vez para solo
// poder seleccionar acelga... eso tiene que ser solo si hay más de un
// alimento dentro".
//
// POR QUÉ ESTO ES UN COMPONENTE Y NO CUATRO COPIAS
// Porque esto YA SE ARREGLÓ el 5 de agosto. El comentario de entonces dice
// literalmente "este era el peor de los TRES SITIOS con este problema".
// Eran cuatro: el analizador de dietas se quedó fuera, con el clic de más,
// y ahí es donde ella lo encontró veinte días después. Y había un quinto
// (los suplementos comerciales) que nadie había mirado nunca.
//
// Arreglar cuatro copias a mano no es arreglarlo: es dejarlo listo para que
// vuelva a pasar en la quinta pantalla. Ahora hay UNA lista, y la pantalla
// que venga la usa y ya está bien sin que nadie se acuerde de esto.
//
// La regla, en una línea: si dentro de una especie solo hay un alimento,
// pulsarla LO ELIGE. Si hay varios, se ve cuántos son y que esto abre otro
// paso -- sin ese indicador los dos botones se veían iguales y no se sabía
// si ya habías elegido o te faltaba un clic.
// `ocultar`: especies que no se enseñan (en alergias, las que ya excluiste).
export function ListaDeEspecies({ porEspecie, onElegir, onAbrir, fondo = "#FFFFFF", ocultar = null }) {
  return (
    <>
      {Object.entries(porEspecie || {}).map(([especie, alimentos]) => {
        if (ocultar && ocultar(especie)) return null;
        const lista = alimentos || [];
        const unico = lista.length === 1;
        return (
          <button
            key={especie}
            onClick={() => (unico ? onElegir(lista[0], especie) : onAbrir(especie))}
            aria-label={unico ? lista[0] : `${especie}: ver los ${lista.length} tipos`}
            className="text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between"
            style={{ color: TINTA, fontFamily: fontBody, background: fondo }}
          >
            <span>{unico ? lista[0] : especie}</span>
            {!unico && (
              <span className="flex items-center gap-1 shrink-0" style={{ color: VIOLETA }}>
                <span className="text-[11px] font-semibold" style={{ fontFamily: "monospace" }}>{lista.length} tipos</span>
                <ChevronRight size={14} />
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}

export function SiluetaDesdeArriba({ tuck, color }) {
  const pellizco = 30 - tuck * 16;
  return (
    <svg width="150" height="70" viewBox="0 0 150 70" fill="none">
      <path d="M8,35 C 2,32 1,26 5,22" stroke={color} strokeWidth="7" strokeLinecap="round" fill="none" />
      <path
        d={`M18,35 C 18,20 30,14 45,14 C 55,14 60,${pellizco} 75,${pellizco} C 90,${pellizco} 95,14 105,14 C 120,14 132,20 132,35 C 132,50 120,56 105,56 C 95,56 90,${70 - pellizco} 75,${70 - pellizco} C 60,${70 - pellizco} 55,56 45,56 C 30,56 18,50 18,35 Z`}
        fill={color}
      />
      <ellipse cx="128" cy="16" rx="7" ry="10" fill={color} transform="rotate(-25 128 16)" />
      <ellipse cx="128" cy="54" rx="7" ry="10" fill={color} transform="rotate(25 128 54)" />
      <circle cx="132" cy="35" r="15" fill={color} />
      <ellipse cx="148" cy="35" rx="7" ry="6" fill={color} />
    </svg>
  );
}

export function Cabecera({ paso, titulo, onAbrirMenu }) {
  return (
    <div style={{ background: VIOLETA }} className="w-full px-6 pt-8 pb-7">
      <div className="flex items-center justify-between mb-5">
        {/* ⚠️ CORREGIDO (5 agosto, madrugada) — pedido expreso: el menú
            va SIEMPRE a la izquierda ahora, sin excepción en ninguna
            pantalla -- antes estaba a la derecha aquí. */}
        <div className="flex items-center gap-3">
          {onAbrirMenu && <BotonMenu onClick={onAbrirMenu} color="#FFFFFF" className="p-0.5" />}
          <span className="text-[11px] tracking-[0.18em] uppercase" style={{ color: MALVA, fontFamily: "monospace" }}>
            Perfil nuevo
          </span>
        </div>
        <span className="text-[11px] tracking-[0.18em] uppercase" style={{ color: MALVA, fontFamily: "monospace" }}>
          {paso} / {TOTAL_PASOS}
        </span>
      </div>
      <div className="flex gap-1.5 mb-7">
        {Array.from({ length: TOTAL_PASOS }).map((_, i) => (
          <div key={i} className="h-[3px] flex-1 rounded-full" style={{ background: i <= paso - 1 ? ROSA : "rgba(255,255,255,0.16)" }} />
        ))}
      </div>
      <h1 className="text-3xl leading-tight" style={{ color: "#FFFFFF", fontFamily: fontDisplay, fontWeight: 500 }}>
        {titulo}
      </h1>
    </div>
  );
}

export function BotonContinuar({ activo, onClick, texto = "Continuar" }) {
  return (
    <button
      onClick={onClick}
      disabled={!activo}
      className="w-full py-4 rounded-2xl text-base transition-all"
      style={{
        background: activo ? ROSA : "#EDE6F5",
        color: activo ? "#FFFFFF" : "#B6ABC9",
        fontFamily: fontBody,
        fontWeight: 700,
      }}
    >
      {texto}
    </button>
  );
}

export function BotonAtras({ onClick, texto = "Atrás" }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 text-sm mb-4" style={{ color: MALVA, fontFamily: fontBody }}>
      <ChevronLeft size={16} /> {texto}
    </button>
  );
}

export function BotonPrincipal({ activo, onClick, texto }) {
  return (
    <button
      onClick={onClick}
      disabled={!activo}
      className="w-full py-4 rounded-2xl text-base transition-all"
      style={{ background: activo ? ROSA : "#EDE6F5", color: activo ? "#FFFFFF" : "#B6ABC9", fontFamily: fontBody, fontWeight: 700 }}
    >
      {texto}
    </button>
  );
}

// ─── LAS DOS PIEZAS DE LA FICHA CLÍNICA, FUERA DE LA PANTALLA ───────────────
//
// ⚠️ CASO REAL ENCONTRADO POR LA USUARIA EN EL MÓVIL (29 agosto): "cuando
// pide el nombre del paciente, cada vez que selecciono una letra se quita el
// teclado".
//
// Estaban definidas DENTRO del componente grande. Eso las convierte en un
// tipo de componente NUEVO en cada render: React no puede saber que
// `<Bloque>` de esta vuelta es el mismo `<Bloque>` de la anterior, así que
// desmonta todo lo que hay dentro y lo vuelve a montar. El `<input>` deja de
// ser el mismo nodo del DOM, pierde el foco, y en un móvil eso significa que
// el teclado se cierra -- a cada letra.
//
// En un ordenador casi no se nota (el cursor parpadea y sigues escribiendo);
// en un teléfono hace la pantalla inservible. Es la razón por la que una
// función que devuelve JSX no puede vivir dentro de otro componente si algo
// de dentro guarda estado -- y un campo de texto con el foco lo guarda.
export function BloqueFicha({ titulo, children }) {
  return (
    <div className="rounded-2xl px-4 py-4 mb-3" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
      <p className="text-[11px] tracking-[0.14em] uppercase mb-3" style={{ color: MALVA, fontFamily: "monospace" }}>
        {titulo}
      </p>
      {children}
    </div>
  );
}

export function OpcionesFicha({ opciones, valor, onElegir, columnas = 2 }) {
  return (
    <div className={`grid gap-2 grid-cols-${columnas}`}>
      {opciones.map((op) => {
        const activo = valor === op.key;
        return (
          <button key={op.key} onClick={() => onElegir(op.key)}
            className="py-2.5 rounded-xl text-center"
            style={{ background: activo ? VIOLETA : PAPEL,
                     border: `1.5px solid ${activo ? VIOLETA : "#E3DAF0"}`,
                     color: activo ? "#FFFFFF" : TINTA, fontFamily: fontBody,
                     fontSize: 14, cursor: "pointer" }}>
            {op.label}
          </button>
        );
      })}
    </div>
  );
}

export function Fuentes() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap');
      /* ⚠️ AÑADIDO (5 agosto, madrugada) — CASO REAL, patrón muy
         reconocible: "el primer toque no hace nada, el segundo sí, y
         luego todo funciona normal" -- esto es un problema conocido de
         navegadores móviles con pantallas que hacen scroll (fixed +
         overflow-y-auto): el navegador espera un instante en el primer
         toque para decidir si es un tap o el inicio de un deslizamiento
         de scroll, y ese primer toque se pierde sin llegar a disparar
         el clic. "touch-action: manipulation" le dice al navegador que
         no espere -- soluciona exactamente este patrón, no es un
         problema del código en sí sino de cómo el navegador interpreta
         el gesto. Se aplica a los botones (donde importa de verdad) y
         a las pantallas de pantalla completa con scroll.
      */
      button, a, [role="button"] {
        touch-action: manipulation;
      }
      .cnl-pantalla-scroll {
        touch-action: pan-y;
      }
      /* ⚠️ AÑADIDO (5 agosto, madrugada) — CASO REAL: "el botón
         Continuar queda más abajo de lo necesario en móvil, aunque
         haya hueco visible, obligando a deslizar sin hacer falta". La
         causa es conocida: cnl-pantalla-completa de Tailwind usa 100vh, y en
         navegadores móviles 100vh NO tiene en cuenta la barra de
         direcciones dinámica (que aparece/desaparece al hacer scroll)
         -- calcula una altura MAYOR que la realmente visible en cada
         momento, dejando un hueco "fantasma" que empuja el contenido
         (y el botón) fuera de la pantalla real. 100dvh (dynamic
         viewport height) sí se ajusta en tiempo real a la altura
         visible de verdad -- con 100vh como respaldo para navegadores
         que aún no lo soporten. */
      .cnl-pantalla-completa {
        min-height: 100vh;
        min-height: 100dvh;
      }
      input[type=range].cnl-slider {
        -webkit-appearance: none; width: 100%; height: 4px;
        background: #E3DAF0; border-radius: 4px; outline: none;
      }
      input[type=range].cnl-slider::-webkit-slider-thumb {
        -webkit-appearance: none; width: 28px; height: 28px; border-radius: 50%;
        background: ${ROSA}; border: 3px solid #FFFFFF; box-shadow: 0 2px 6px rgba(90,64,136,0.35); cursor: pointer;
      }
      input[type=range].cnl-slider::-moz-range-thumb {
        width: 28px; height: 28px; border-radius: 50%;
        background: ${ROSA}; border: 3px solid #FFFFFF; box-shadow: 0 2px 6px rgba(90,64,136,0.35); cursor: pointer;
      }
    `}</style>
  );
}

// ⚠️ AÑADIDO (5 agosto, madrugada) — CASO REAL: "la gente a la que le
// paso la app nunca abre el menú desplegable". Causa real encontrada:
// en TODA la app, el botón era solo un icono de tres líneas sin
// ninguna palabra al lado -- pequeño, de bajo contraste, sin ningún
// indicio visual de que fuera interactivo. Un icono "hamburguesa" sin
// etiqueta es un problema de descubribilidad muy conocido: quien no
// sabe de antemano que ahí hay un menú, no tiene forma de adivinarlo.
// Componente único y reutilizable para los 12 sitios de la app donde
// aparecía este botón, con la palabra "Menú" siempre visible junto al
// icono -- así deja de ser un icono ambiguo y pasa a ser un botón
// claro, con el mismo aspecto en todos sitios.
export function BotonMenu({ onClick, color = VIOLETA, className = "" }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 ${className}`}>
      <Menu size={20} style={{ color }} />
      <span className="text-xs font-semibold" style={{ color, fontFamily: fontBody }}>Menú</span>
    </button>
  );
}

export function Etiqueta({ children }) {
  return (
    <label className="block text-[11px] tracking-[0.14em] uppercase mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>
      {children}
    </label>
  );
}

export function Puntitos({ total, activo, tocado }) {
  return (
    <div className="flex justify-between px-0.5 mb-4">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ background: i === activo && tocado ? ROSA : "#D8CFEC" }} />
      ))}
    </div>
  );
}

export function SiNoToggle({ valor, onChange }) {
  return (
    <div className="grid grid-cols-2 gap-3 mb-3">
      {[{ key: "no", label: "No" }, { key: "si", label: "Sí" }].map((op) => {
        const activo = valor === op.key;
        return (
          <button
            key={op.key}
            onClick={() => onChange(op.key)}
            className="py-3 rounded-xl text-center transition-all"
            style={{
              background: activo ? VIOLETA : "#FFFFFF",
              border: `1.5px solid ${activo ? VIOLETA : "#E3DAF0"}`,
              color: activo ? "#FFFFFF" : TINTA,
              fontFamily: fontDisplay,
            }}
          >
            {op.label}
          </button>
        );
      })}
    </div>
  );
}

export function SelectorAlimentos({ lista, onAnadir, onQuitar, idGrupo, estadoAbierto, setEstadoAbierto, categorias }) {
  const CATS = categorias || CATEGORIAS_ALIMENTO;
  const abierto = estadoAbierto && estadoAbierto.grupo === idGrupo ? estadoAbierto : null;
  const especiesYaExcluidas = new Set(
    lista.filter((it) => it.alimento.startsWith("Todo: ")).map((it) => it.alimento.replace("Todo: ", ""))
  );

  const elegirEspecie = (categoria, especie) => {
    setEstadoAbierto({ grupo: idGrupo, categoria, especie });
  };

  return (
    <div className="mb-2">
      {lista.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {lista.map((item, idx) => (
            <div key={idx} className="flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full" style={{ background: VIOLETA }}>
              <span className="text-xs" style={{ color: "#FFFFFF", fontFamily: fontBody }}>{item.alimento}</span>
              <button onClick={() => onQuitar(idx)}>
                <X size={13} style={{ color: ROSA }} />
              </button>
            </div>
          ))}
        </div>
      )}

      {!abierto && (
        <button
          onClick={() => setEstadoAbierto({ grupo: idGrupo, categoria: null, especie: null })}
          className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm"
          style={{ background: "#FFFFFF", border: "1.5px dashed #C9BEDD", color: VIOLETA, fontFamily: fontBody }}
        >
          <Plus size={15} /> Añadir alimento
        </button>
      )}

      {abierto && !abierto.categoria && (
        <div className="rounded-xl p-3" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
          <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>ELIGE UNA CATEGORÍA</p>
          <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
            {Object.keys(CATS).map((cat) => (
              <button
                key={cat}
                onClick={() => setEstadoAbierto({ grupo: idGrupo, categoria: cat, especie: null })}
                className="text-left px-3 py-2 rounded-lg text-sm"
                style={{ color: TINTA, fontFamily: fontBody, background: PAPEL }}
              >
                {cat}
              </button>
            ))}
          </div>
          <button onClick={() => setEstadoAbierto(null)} className="text-xs mt-2" style={{ color: MALVA, fontFamily: fontBody }}>Cancelar</button>
        </div>
      )}

      {abierto && abierto.categoria && !abierto.especie && (
        <div className="rounded-xl p-3" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
          <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>{abierto.categoria.toUpperCase()}</p>
          <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
            <ListaDeEspecies
              porEspecie={CATS[abierto.categoria]}
              ocultar={(especie) => especiesYaExcluidas.has(especie)}
              onElegir={(alimento) => onAnadir({ categoria: abierto.categoria, alimento })}
              onAbrir={(especie) => elegirEspecie(abierto.categoria, especie)}
              fondo={PAPEL}
            />
          </div>
          <button onClick={() => setEstadoAbierto({ grupo: idGrupo, categoria: null, especie: null })} className="text-xs mt-2" style={{ color: MALVA, fontFamily: fontBody }}>← Otra categoría</button>
        </div>
      )}

      {abierto && abierto.categoria && abierto.especie && (
        <div className="rounded-xl p-3" style={{ background: "#FFFFFF", border: "1.5px solid #E3DAF0" }}>
          <p className="text-xs mb-2" style={{ color: MALVA, fontFamily: "monospace" }}>{abierto.especie.toUpperCase()}</p>
          <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
            {/* ⚠️ CORREGIDO (5 agosto, madrugada): mismo ajuste que en
                Personalizar -- este botón salía siempre, aunque solo
                hubiera 1 alimento para la especie, duplicando la opción. */}
            {CATS[abierto.categoria][abierto.especie].length > 1 && (
              <button
                onClick={() => onAnadir({ categoria: abierto.categoria, alimento: `Todo: ${abierto.especie}` })}
                className="text-left px-3 py-2 rounded-lg text-sm"
                style={{ color: VIOLETA, fontFamily: fontBody, fontWeight: 700, background: "#F0ECF7" }}
              >
                Todo el/la {abierto.especie}
              </button>
            )}
            {CATS[abierto.categoria][abierto.especie].map((alimento) => (
              <button
                key={alimento}
                onClick={() => onAnadir({ categoria: abierto.categoria, alimento })}
                className="text-left px-3 py-2 rounded-lg text-sm"
                style={{ color: TINTA, fontFamily: fontBody, background: PAPEL }}
              >
                {alimento}
              </button>
            ))}
          </div>
          <button onClick={() => setEstadoAbierto({ grupo: idGrupo, categoria: abierto.categoria, especie: null })} className="text-xs mt-2" style={{ color: MALVA, fontFamily: fontBody }}>← Otra especie</button>
        </div>
      )}
    </div>
  );
}

export function Rueda({ valores, valor, onChange, ancho = 72 }) {
  const alturaItem = 40;
  const idx = Math.max(0, valores.indexOf(valor));

  // ⚠️ AÑADIDO (5 agosto, madrugada) — pedido expreso: en móvil solo se
  // podía tocar la flechita repetidamente o tocar uno de los 3 valores
  // visibles a la vez -- nada de deslizar el dedo, que es como
  // cualquier persona espera poder usar una rueda de selección en
  // móvil. Esto añade arrastre real (touch Y ratón, con el mismo
  // código): mientras se arrastra, la rueda sigue el dedo/ratón en
  // tiempo real sin cambiar el valor todavía; al soltar, se calcula a
  // cuántas posiciones equivale ese arrastre y se ajusta el valor de
  // golpe, con un pequeño "snap" final para quedar alineado.
  const [arrastre, setArrastre] = useState(null); // { yInicial, offsetPx } o null si no se está arrastrando
  const arrastreRef = useRef(null);
  useEffect(() => { arrastreRef.current = arrastre; }, [arrastre]);

  const mover = (delta) => {
    const nuevo = Math.max(0, Math.min(valores.length - 1, idx + delta));
    if (nuevo !== idx) onChange(valores[nuevo]);
  };

  const iniciarArrastre = (yCliente) => {
    setArrastre({ yInicial: yCliente, offsetPx: 0 });
  };
  const moverArrastre = (yCliente) => {
    if (!arrastreRef.current) return;
    setArrastre((prev) => prev && { ...prev, offsetPx: yCliente - prev.yInicial });
  };
  const soltarArrastre = () => {
    const a = arrastreRef.current;
    setArrastre(null);
    if (!a) return;
    // se arrastra hacia ABAJO para ir a valores ANTERIORES (como una
    // rueda física: empujas el papel hacia abajo para ver lo de arriba)
    const pasos = Math.round(-a.offsetPx / alturaItem);
    if (pasos !== 0) mover(pasos);
  };

  // ⚠️ AÑADIDO (5 agosto, madrugada): con el RATÓN, si se suelta el
  // botón FUERA del componente (arrastrando y moviendo el cursor
  // lejos antes de soltar), el onMouseUp local del propio elemento no
  // lo capturaría -- por eso, mientras se está arrastrando con ratón,
  // se escuchan mousemove/mouseup en window entero, no solo dentro
  // del componente. El táctil no necesita esto: touchmove/touchend sí
  // se disparan sobre el elemento aunque el dedo se mueva fuera.
  useEffect(() => {
    if (!arrastre) return;
    const alMover = (e) => moverArrastre(e.clientY);
    const alSoltar = () => soltarArrastre();
    window.addEventListener("mousemove", alMover);
    window.addEventListener("mouseup", alSoltar);
    return () => {
      window.removeEventListener("mousemove", alMover);
      window.removeEventListener("mouseup", alSoltar);
    };
  }, [arrastre]);

  // el desplazamiento visual mientras se arrastra: se limita un poco
  // más allá del propio contenido para que no se sienta "duro" al
  // llegar al primer/último valor, pero sin desplazarse infinitamente
  const offsetVisual = arrastre ? arrastre.offsetPx : 0;

  const Flecha = ({ dir }) => (
    <button
      type="button"
      onClick={() => mover(dir)}
      disabled={dir < 0 ? idx === 0 : idx === valores.length - 1}
      className="w-full flex items-center justify-center py-1"
      style={{ opacity: (dir < 0 ? idx === 0 : idx === valores.length - 1) ? 0.25 : 1, cursor: "pointer" }}
      aria-label={dir < 0 ? "Anterior" : "Siguiente"}
    >
      <ChevronRight size={15} style={{ color: VIOLETA, transform: dir < 0 ? "rotate(-90deg)" : "rotate(90deg)" }} />
    </button>
  );

  return (
    <div
      style={{ width: ancho, outline: "none" }}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowUp") { e.preventDefault(); mover(-1); }
        if (e.key === "ArrowDown") { e.preventDefault(); mover(1); }
      }}
      onWheel={(e) => { mover(e.deltaY > 0 ? 1 : -1); }}
    >
      <Flecha dir={-1} />
      <div
        className="cnl-rueda-arrastrable"
        style={{ position: "relative", height: alturaItem * 3, overflow: "hidden", touchAction: "none", cursor: arrastre ? "grabbing" : "grab" }}
        onTouchStart={(e) => iniciarArrastre(e.touches[0].clientY)}
        onTouchMove={(e) => { e.preventDefault(); moverArrastre(e.touches[0].clientY); }}
        onTouchEnd={soltarArrastre}
        onMouseDown={(e) => { e.preventDefault(); iniciarArrastre(e.clientY); }}
      >
        <div style={{ position: "absolute", top: alturaItem, left: 0, right: 0, height: alturaItem,
                      borderTop: `1.5px solid ${VIOLETA}`, borderBottom: `1.5px solid ${VIOLETA}`,
                      pointerEvents: "none", borderRadius: 8 }} />
        <div style={{
          transform: `translateY(${(1 - idx) * alturaItem + offsetVisual}px)`,
          transition: arrastre ? "none" : "transform 0.18s ease-out",
        }}>
          {valores.map((v, i) => (
            <div
              key={v}
              onClick={() => { if (!arrastre) onChange(v); }}
              style={{
                height: alturaItem, display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: fontDisplay,
                fontSize: i === idx ? 19 : 15,
                color: i === idx ? TINTA : "#C9BEDD",
                opacity: Math.abs(i - idx) > 1 ? 0 : 1,
                transition: arrastre ? "none" : "all 0.18s", cursor: "pointer",
              }}
            >
              {v}
            </div>
          ))}
        </div>
      </div>
      <Flecha dir={1} />
    </div>
  );
}
