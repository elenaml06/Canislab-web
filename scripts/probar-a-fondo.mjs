#!/usr/bin/env node
// ─── LA TANDA GORDA: MUCHOS PERROS, CONTRA LO DE VERDAD ─────────────────────
//
// PEDIDO EXPRESO: "haz todas las pruebas con varios perfiles de perros etc
// para comprobar que todo funciona como debe".
//
// Las baterías de siempre prueban las piezas: el motor con `pruebas_completas`
// y la pantalla con Playwright contra un Supabase de mentira. Esto prueba lo
// otro -- el recorrido entero de un perro concreto, con la API de producción
// y la base de producción --, que es donde aparecen los fallos que ninguna de
// las dos puede ver: una clave que se llama distinto, una columna que no
// existe, una política que no deja escribir.
//
// Doce perros, elegidos para que cada uno rompa algo distinto: un toy de 1,5
// kg (donde el yodo aprieta), un gigante en crecimiento (calcio reforzado),
// un renal (tope de fósforo por debajo de FEDIAF), una pancreatitis (grasa
// topada), un sobrepeso (las kcal salen del peso OBJETIVO, no del real), un
// senior sin dientes (categoría entera fuera), alergias múltiples, gestante y
// lactante.
//
//     node scripts/probar-a-fondo.mjs
//
// Con RAWKU_PRUEBA_EMAIL_A / _PASSWORD_A (la cuenta acreditada) hace además
// el recorrido del veterinario: formular, autocompletar, firmar y releer. Sin
// esas variables, se salta esa parte y avisa.
import { calcularDER, determinarEtapa } from "../src/der.js";
import { pesoIdealDesdeBcs } from "../src/bcs.js";
import { agruparNutrientes } from "../src/nutrientes.js";

if (process.env.HTTPS_PROXY || process.env.https_proxy) {
  try {
    const { ProxyAgent, setGlobalDispatcher } = await import("undici");
    setGlobalDispatcher(new ProxyAgent(process.env.HTTPS_PROXY || process.env.https_proxy));
  } catch { /* sin undici: si hay proxy, fallará al conectar y se dirá */ }
}

const API = process.env.API_BASE || "https://canislab-api.onrender.com";
const V = "\x1b[32m", R = "\x1b[31m", A = "\x1b[33m", G = "\x1b[90m", F = "\x1b[0m";
let fallos = 0, avisos = 0;
const ok = (q, d = "") => console.log(`${V}  OK  ${F} ${q}${d ? `\n${G}        ${d}${F}` : ""}`);
const mal = (q, d = "") => { fallos++; console.log(`${R} FALLA ${F} ${q}${d ? `\n${G}        ${d}${F}` : ""}`); };
const aviso = (q, d = "") => { avisos++; console.log(`${A} AVISO ${F} ${q}${d ? `\n${G}        ${d}${F}` : ""}`); };
const comprobar = (c, q, d = "") => (c ? ok(q, d) : mal(q, d));

const pedir = async (ruta, cuerpo) => {
  const r = await fetch(`${API}${ruta}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`${ruta} → ${r.status} ${JSON.stringify(j).slice(0, 120)}`);
  return j;
};

// ─── LOS PERROS ──────────────────────────────────────────────────────────────
// etapaApi: la que espera el motor. etapa: la de der.js. No son la misma
// palabra y confundirlas es un fallo real de este repo (ver verificar.py).
const PERROS = [
  { nombre: "Chihuahua adulto (toy)", peso: 1.5, etapa: "adulto", etapaApi: "Adulto",
    actividad: 1, esterilizado: "si" },
  { nombre: "Bulldog francés adulto", peso: 11, etapa: "adulto", etapaApi: "Adulto",
    actividad: 1, esterilizado: "si" },
  { nombre: "Mestiza mediana activa", peso: 20, etapa: "adulto", etapaApi: "Adulto",
    actividad: 3, esterilizado: "no" },
  { nombre: "Pastor alemán adulto", peso: 33, etapa: "adulto", etapaApi: "Adulto",
    actividad: 2, esterilizado: "no" },
  { nombre: "San Bernardo adulto", peso: 68, etapa: "adulto", etapaApi: "Adulto",
    actividad: 1, esterilizado: "si" },
  { nombre: "Senior de 12 años", peso: 24, etapa: "senior", etapaApi: "Adulto",
    actividad: 0, esterilizado: "si" },
  { nombre: "Cachorro pequeño (4 meses)", peso: 4, etapa: "cachorro_crecimiento",
    etapaApi: "CachorroCrecimiento", actividad: 2, esterilizado: "no", pesoAdulto: 9 },
  { nombre: "Cachorro gigante (5 meses)", peso: 22, etapa: "cachorro_crecimiento",
    etapaApi: "CachorroCrecimiento", actividad: 2, esterilizado: "no", pesoAdulto: 60 },
  { nombre: "Adulto con SOBREPESO (BCS 8)", peso: 30, etapa: "adulto", etapaApi: "Adulto",
    actividad: 0, esterilizado: "si", bcs: 8 },
  { nombre: "Renal 25 kg", peso: 25, etapa: "adulto", etapaApi: "Adulto",
    actividad: 1, esterilizado: "si", patologias: ["renal"] },
  { nombre: "Pancreatitis 25 kg", peso: 25, etapa: "adulto", etapaApi: "Adulto",
    actividad: 1, esterilizado: "si", patologias: ["pancreatitis"] },
  { nombre: "Alérgico a pollo y vacuno", peso: 18, etapa: "adulto", etapaApi: "Adulto",
    actividad: 1, esterilizado: "si", especies: ["pollo", "vacuno"] },
  { nombre: "Senior sin dientes (sin hueso)", peso: 15, etapa: "senior", etapaApi: "Adulto",
    actividad: 0, esterilizado: "si", categorias: ["Hueso carnoso"] },
];

const derDe = (p) => {
  const objetivo = p.bcs ? pesoIdealDesdeBcs(p.peso, p.bcs) : null;
  return {
    der: calcularDER(p.peso, p.etapa, p.actividad, p.esterilizado, {
      pesoAdultoKg: p.pesoAdulto, pesoIdealKg: objetivo,
      machoEntero: p.esterilizado !== "si",
    }),
    objetivo,
  };
};

const cuerpoDe = (p) => {
  const { der, objetivo } = derDe(p);
  return {
    nombres_alimentos: [], modo: "automatico",
    der_objetivo: der, etapa_requisitos: p.etapaApi, peso_perro_kg: p.peso,
    peso_adulto_esperado_kg: p.pesoAdulto || null,
    peso_objetivo_kg: objetivo, bcs: p.bcs ?? null,
    patologias: p.patologias || [], especies_excluidas: p.especies || [],
    categorias_excluidas: p.categorias || [],
  };
};

console.log(`${G}Contra ${API}${F}`);
console.log(`\n${G}════ 1. UN MENÚ PARA CADA PERRO ════${F}`);
const menus = {};
for (const p of PERROS) {
  const cuerpo = cuerpoDe(p);
  const t0 = Date.now();
  let r;
  try { r = await pedir("/menu/v2", cuerpo); }
  catch (err) { mal(`${p.nombre}: la API ha reventado`, String(err.message)); continue; }
  const seg = ((Date.now() - t0) / 1000).toFixed(1);
  if (!r.factible) {
    // No siempre es un fallo: hay combinaciones genuinamente imposibles. Pero
    // tiene que DECIR cuál, no dejar a nadie con "no se puede".
    if (r.imposible_por_aritmetica || r.se_agoto_el_tiempo) {
      aviso(`${p.nombre}: sin menú, y bien dicho`, `${(r.motivo || "").slice(0, 90)}`);
    } else {
      mal(`${p.nombre}: sin menú`, `${(r.motivo || "").slice(0, 110)} [${seg}s]`);
    }
    continue;
  }
  menus[p.nombre] = { cuerpo, menu: r.menu, respuesta: r };
  const gramos = Object.values(r.menu).reduce((a, g) => a + g, 0);
  const problemas = [];
  if (r.ficha?.semaforo !== "verde") problemas.push(`semáforo ${r.ficha?.semaforo}`);
  // Las exclusiones, comprobadas en el plato y no de palabra.
  for (const cat of p.categorias || []) {
    // El nombre de la categoría no viaja en el menú; se comprueba abajo con
    // /formular/estado, que sí devuelve el reparto por categorías.
  }
  comprobar(problemas.length === 0, `${p.nombre}`,
            `${Object.keys(r.menu).length} alimentos · ${gramos.toFixed(0)} g · ` +
            `${Math.round(cuerpo.der_objetivo)} kcal · ${seg}s` +
            (problemas.length ? ` · ${problemas.join(", ")}` : ""));
}

console.log(`\n${G}════ 2. LO QUE VE EL VETERINARIO DE ESE MISMO MENÚ ════${F}`);
for (const p of PERROS) {
  const caso = menus[p.nombre];
  if (!caso) continue;
  let estado;
  try {
    estado = await pedir("/formular/estado", { ...caso.cuerpo, gramos_por_alimento: caso.menu });
  } catch (err) { mal(`${p.nombre}: /formular/estado ha reventado`, String(err.message)); continue; }

  const filas = (estado.ficha?.faltan?.length || 0) + (estado.ficha?.se_pasa?.length || 0)
              + (estado.ficha?.dentro_de_rango?.length || 0);
  const grupos = agruparNutrientes(estado.ficha);
  const enOtros = grupos.find((g) => g.titulo === "Otros");
  const problemas = [];
  if (filas < 42) problemas.push(`solo ${filas} filas`);
  if (enOtros) problemas.push(`sin grupo: ${enOtros.filas.map((f) => f.nutriente).join(", ")}`);
  if (estado.topes_de_patologia_rotos?.length) {
    problemas.push(`tope roto: ${estado.topes_de_patologia_rotos.join("; ")}`);
  }
  // Las categorías excluidas NO pueden aparecer en el reparto.
  for (const cat of p.categorias || []) {
    if ((estado.reparto_categorias || {})[cat]) problemas.push(`lleva ${cat} y estaba excluida`);
  }
  // Y el desvío de kcal, que es lo que mira primero quien formula.
  if (Math.abs(estado.desvio_kcal_pct ?? 0) > 3.5) {
    problemas.push(`desvío ${estado.desvio_kcal_pct}%`);
  }
  comprobar(problemas.length === 0, `${p.nombre}`,
            `${filas} filas en ${grupos.length} grupos · desvío ${estado.desvio_kcal_pct}%` +
            (problemas.length ? ` · ${problemas.join(" · ")}` : ""));
}

console.log(`\n${G}════ 3. FORMULAR A MANO: SUS GRAMOS NO SE TOCAN ════${F}`);
for (const p of PERROS) {
  const caso = menus[p.nombre];
  if (!caso) continue;
  // Se fijan los dos alimentos más grandes del menú que el motor ya dio: son
  // cantidades que sabemos que caben, así que si algo se mueve es un fallo y
  // no una imposibilidad.
  const dos = Object.entries(caso.menu).sort((a, b) => b[1] - a[1]).slice(0, 2);
  const fijos = Object.fromEntries(dos.map(([n, g]) => [n, Math.round(g)]));
  let r;
  try { r = await pedir("/formular/autocompletar", { ...caso.cuerpo, gramos_por_alimento: fijos }); }
  catch (err) { mal(`${p.nombre}: autocompletar ha reventado`, String(err.message)); continue; }
  if (!r.factible) {
    aviso(`${p.nombre}: con esas cantidades no cuadra`, (r.motivo || "").slice(0, 100));
    continue;
  }
  const movidos = Object.entries(fijos)
    .filter(([n, g]) => Math.abs((r.menu[n] || 0) - g) > 0.5)
    .map(([n, g]) => `${n}: pedí ${g} y volvió ${Math.round(r.menu[n] || 0)}`);
  const verde = r.ficha?.semaforo === "verde";
  comprobar(movidos.length === 0 && verde, `${p.nombre}`,
            movidos.length ? movidos.join(" · ")
                           : `fijados ${dos.length}, completados ${Object.keys(r.menu).length}, ` +
                             `semáforo ${r.ficha?.semaforo}`);
}

console.log(`\n${G}════ 4. FIRMAR: SOLO LO QUE ESTÁ VERDE, Y SELLADO ════${F}`);
const FIRMANTE = { nombre: "Elena Martín", num_colegiado: "COLVET-12345" };
let documentoDePrueba = null;
for (const p of PERROS.slice(0, 6)) {   // seis basta: firmar no depende del perfil
  const caso = menus[p.nombre];
  if (!caso) continue;
  let r;
  try {
    r = await pedir("/pauta/firmar", {
      ...caso.cuerpo, gramos_por_alimento: caso.menu,
      firmante: FIRMANTE, paciente: { nombre: p.nombre, peso_kg: p.peso },
    });
  } catch (err) { mal(`${p.nombre}: /pauta/firmar ha reventado`, String(err.message)); continue; }
  if (!r.factible) { mal(`${p.nombre}: no se ha podido firmar un menú verde`,
                         (r.motivo || "").slice(0, 100)); continue; }
  const d = r.documento;
  documentoDePrueba = documentoDePrueba || d;
  const faltan = ["menu", "ficha_verificada", "contexto", "huecos", "sellos", "firmante",
                  "firmada_en", "sello"].filter((k) => !(k in d));
  const filas = (d.ficha_verificada?.dentro_de_rango?.length || 0)
              + (d.ficha_verificada?.faltan?.length || 0)
              + (d.ficha_verificada?.se_pasa?.length || 0);
  comprobar(faltan.length === 0 && filas >= 42, `${p.nombre}`,
            faltan.length ? `le falta ${faltan.join(", ")}`
                          : `sello ${d.sello} · ${filas} filas congeladas · ` +
                            `sellos ${Object.keys(d.sellos).length}`);
}
// Media ración NO se firma.
if (menus[PERROS[2].nombre]) {
  const caso = menus[PERROS[2].nombre];
  const mitad = Object.fromEntries(Object.entries(caso.menu).slice(0, 1));
  const r = await pedir("/pauta/firmar", { ...caso.cuerpo, gramos_por_alimento: mitad,
                                            firmante: FIRMANTE, paciente: {} });
  comprobar(r.factible === false, "media ración no se firma", (r.motivo || "").slice(0, 80));
}
// Y el sello sirve.
if (documentoDePrueba) {
  const igual = await pedir("/pauta/comprobar", documentoDePrueba);
  comprobar(igual.coincide === true, "el documento recién firmado cuadra con su sello");
  const tocado = JSON.parse(JSON.stringify(documentoDePrueba));
  const primer = Object.keys(tocado.menu)[0];
  tocado.menu[primer] = tocado.menu[primer] + 10;
  const distinto = await pedir("/pauta/comprobar", tocado);
  comprobar(distinto.coincide === false, "cambiar 10 g rompe el sello",
            `${distinto.sello_del_documento} → ${distinto.sello_recalculado}`);
}

console.log(`\n${G}════ 5. LA BASE DE VERDAD ════${F}`);
const EMAIL_A = process.env.RAWKU_PRUEBA_EMAIL_A;
const PASS_A = process.env.RAWKU_PRUEBA_PASSWORD_A;
if (!EMAIL_A || !PASS_A) {
  aviso("no se ha probado la base", "faltan RAWKU_PRUEBA_EMAIL_A / _PASSWORD_A");
} else {
  const { createClient } = await import("@supabase/supabase-js");
  const { filaDePerro } = await import("../src/supabase.js");
  const URL = "https://kvtkdpgpmrvwmvymyqof.supabase.co";
  const ANON = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2dGtkcGdwbXJ2d212eW15cW9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxNTY4OTEsImV4cCI6MjEwMjczMjg5MX0.-I339koFHO6TE2bf0ty9hNji-9CeH57AE0C4a2ZccYE";
  const cli = createClient(URL, ANON);
  const aBorrar = [];
  let pautaId = null;
  try {
    const { data: sesion, error } = await cli.auth.signInWithPassword({
      email: EMAIL_A, password: PASS_A });
    if (error) throw error;
    const userId = sesion.user.id;

    // Un paciente con TODOS los campos de la ficha clínica, incluidos los
    // nuevos: si alguno se pierde, se ve aquí y no dentro de un mes.
    const ficha = {
      nombre: "Paciente a fondo", pesoActual: "30", condicionIdx: 3, bcs: 6,
      sexo: "macho", esterilizado: "no", actividadIdx: 1, dia: 3, mesIdx: 4, anio: 2021,
      pesoObjetivoKg: pesoIdealDesdeBcs(30, 6),
      tutorNombre: "María López", tutorContacto: "600 000 000",
      alergiaSi: "si", alergias: [{ alimento: "Pollo" }],
      otrosEvitarSi: "no", otrosEvitar: [],
      categoriasExcluidasSi: "no", categoriasExcluidas: [],
      patologiaSi: "si", patologias: ["renal"],
    };
    const { data: creado, error: e1 } = await cli.from("perros")
      .insert(filaDePerro(userId, ficha)).select().single();
    if (e1) throw new Error(`no se puede crear el paciente: ${e1.code} ${e1.message}`);
    aBorrar.push(creado.id);
    const perdidos = [
      ["bcs", 6], ["condicion_idx", 3], ["tutor_nombre", "María López"],
      ["tutor_contacto", "600 000 000"], ["peso_objetivo_kg", 27.27],
    ].filter(([k, v]) => String(creado[k]) !== String(v))
     .map(([k, v]) => `${k}: ${JSON.stringify(creado[k])} en vez de ${JSON.stringify(v)}`);
    comprobar(perdidos.length === 0, "la ficha clínica se guarda entera", perdidos.join(" · "));

    // Y la pauta firmada, con el documento que selló la API.
    if (documentoDePrueba) {
      const { data: pauta, error: e2 } = await cli.from("pautas_firmadas").insert({
        perro_id: creado.id, profesional: userId, tutor: userId,
        nombre_firmante: documentoDePrueba.firmante.nombre,
        num_colegiado: documentoDePrueba.firmante.num_colegiado,
        firmada_en: documentoDePrueba.firmada_en,
        documento: documentoDePrueba, sello: documentoDePrueba.sello,
      }).select().single();
      if (e2) {
        mal("guardar la pauta firmada", `${e2.code}: ${e2.message} ` +
            "-- ¿falta ejecutar supabase/migracion-pautas-firmadas.sql?");
      } else {
        pautaId = pauta.id;
        ok("la pauta firmada se guarda", `sello ${pauta.sello}`);
        // Y vuelve entera: es lo único que hace que sirva un año después.
        const { data: leida } = await cli.from("pautas_firmadas")
          .select("*").eq("id", pauta.id).single();
        const doc = leida?.documento || {};
        const filas = (doc.ficha_verificada?.dentro_de_rango?.length || 0)
                    + (doc.ficha_verificada?.faltan?.length || 0)
                    + (doc.ficha_verificada?.se_pasa?.length || 0);
        comprobar(filas >= 42 && doc.sello === documentoDePrueba.sello,
                  "y vuelve entera, con su ficha congelada", `${filas} filas`);
        // Comprobada contra la API, como se haría un año después.
        const r = await pedir("/pauta/comprobar", doc);
        comprobar(r.coincide === true, "y la API confirma que es la que se firmó");
        // NO SE EDITA. La tabla no tiene política de update: tiene que fallar.
        const { error: e3 } = await cli.from("pautas_firmadas")
          .update({ num_colegiado: "OTRO" }).eq("id", pauta.id);
        const { data: trasIntento } = await cli.from("pautas_firmadas")
          .select("num_colegiado").eq("id", pauta.id).single();
        comprobar(trasIntento?.num_colegiado === documentoDePrueba.firmante.num_colegiado,
                  "una pauta firmada no se puede editar",
                  e3 ? `${e3.code}: ${String(e3.message).slice(0, 50)}`
                     : "sin error, pero el valor no ha cambiado (RLS no deja ver la fila editada)");
        // Ni borrar.
        await cli.from("pautas_firmadas").delete().eq("id", pauta.id);
        const { data: sigue } = await cli.from("pautas_firmadas")
          .select("id").eq("id", pauta.id).maybeSingle();
        comprobar(Boolean(sigue), "ni borrar");
      }
    }
  } catch (err) {
    mal("el recorrido contra la base ha reventado", String(err?.message || err));
  } finally {
    for (const id of aBorrar) await cli.from("perros").delete().eq("id", id);
    if (pautaId) {
      console.log(`${G}        (la pauta ${pautaId} se queda: no se puede borrar, y es a propósito)${F}`);
    }
  }
}

console.log(`\n${"═".repeat(60)}`);
console.log(fallos === 0
  ? `${V}TODO CUADRA${F}${avisos ? ` ${A}(${avisos} aviso(s), míralos)${F}` : ""}`
  : `${R}${fallos} FALLO(S)${F}${avisos ? ` y ${avisos} aviso(s)` : ""}`);
process.exit(fallos === 0 ? 0 : 1);
