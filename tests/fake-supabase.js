// ─── Supabase de mentira, en local ───────────────────────────────────────────
//
// Levanta un servidor HTTP que habla el mismo idioma que Supabase (GoTrue
// para /auth/v1/* y PostgREST para /rest/v1/*), suficiente para que el
// cliente REAL @supabase/supabase-js funcione contra él sin enterarse.
//
// Por qué existe:
//   1. Los tests no pueden (ni deben) tocar la base de datos real de
//      rawku.app ni crear cuentas de verdad.
//   2. El bug que perseguimos es de ORDEN DE CARGA. Contra el Supabase
//      real la carrera depende de la latencia y unas veces sale y otras
//      no. Aquí podemos decir "getPerros tarda 400 ms" y reproducirlo
//      el 100% de las veces.
//
// Lo importante: el cliente de Supabase es el auténtico, con su orden
// real de eventos (INITIAL_SESSION, SIGNED_IN, y el await de los
// callbacks de onAuthStateChange). Sólo la red es local.

import http from "node:http";

const b64url = (obj) =>
  Buffer.from(JSON.stringify(obj)).toString("base64")
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

// JWT con forma válida. La firma es de adorno: el cliente de navegador
// no la verifica, sólo lee el payload para saber cuándo caduca.
function hacerJwt(sub, segundos = 3600) {
  const ahora = Math.floor(Date.now() / 1000);
  const head = b64url({ alg: "HS256", typ: "JWT" });
  const payload = b64url({
    sub, aud: "authenticated", role: "authenticated",
    iat: ahora, exp: ahora + segundos, email: "test@rawku.test",
    session_id: "sesion-de-prueba",
  });
  return `${head}.${payload}.firma-de-mentira`;
}

const USER_ID = "00000000-0000-4000-8000-000000000001";
const PERRO_ID = "11111111-1111-4111-8111-111111111111";

export const CUENTA_DE_PRUEBA = {
  email: "prueba.rawku@example.test",
  password: "prueba-rawku-1234",
  userId: USER_ID,
};

// El perro que ya tiene guardado la cuenta de prueba: es lo que hace
// que, al entrar, la app DEBA saltarse el onboarding e ir al generador.
export const PERRO_DE_PRUEBA = {
  id: PERRO_ID,
  user_id: USER_ID,
  nombre: "Nala",
  peso_actual: 24.5,
  peso_adulto_esperado: null,
  condicion_idx: 2,
  etapa: "adulto",
  tamano: "grande",
  sexo: "hembra",
  castrado: true,
  actividad: "media",
  raza: "Pastor alemán",
  fecha_nacimiento: "2021-05-14",
  dieta_actual: null,
  alergia_si: false,
  alergias: [],
  otros_evitar_si: false,
  otros_evitar: [],
  categorias_excluidas_si: false,
  categorias_excluidas: [],
  patologia_si: false,
  patologias: [],
  created_at: "2024-01-01T00:00:00.000Z",
  updated_at: "2024-01-01T00:00:00.000Z",
};

// ⚠️ AÑADIDO — segundo perro, para las pruebas de varios perros por
// cuenta. No se siembra por defecto: las pruebas que no van de esto
// siguen viendo una cuenta con UN perro, como antes.
export const SEGUNDO_PERRO_DE_PRUEBA = {
  ...PERRO_DE_PRUEBA,
  id: "22222222-2222-4222-8222-222222222222",
  nombre: "Cairo",
  peso_actual: 8.2,
  tamano: "pequeño",
  sexo: "macho",
  raza: "Bulldog francés",
  created_at: "2024-06-01T00:00:00.000Z",
};

function usuario() {
  return {
    id: USER_ID,
    aud: "authenticated",
    role: "authenticated",
    email: CUENTA_DE_PRUEBA.email,
    email_confirmed_at: "2024-01-01T00:00:00.000Z",
    phone: "",
    confirmed_at: "2024-01-01T00:00:00.000Z",
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { nombre: "Cuenta de prueba" },
    identities: [],
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: new Date().toISOString(),
    is_anonymous: false,
  };
}

function sesion() {
  const expiresIn = 3600;
  return {
    access_token: hacerJwt(USER_ID, expiresIn),
    token_type: "bearer",
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    refresh_token: "refresh-de-prueba",
    user: usuario(),
  };
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * @param {object} opciones
 * @param {number} opciones.retrasoPerrosMs  cuánto tarda GET /rest/v1/perros
 * @param {boolean} opciones.sinPerro        simula cuenta recién creada
 * @param {(linea:string)=>void} opciones.log
 */
export function crearFakeSupabase(opciones = {}) {
  const {
    retrasoPerrosMs = 400,
    sinPerro = false,
    log = () => {},
  } = opciones;

  // Mutables: los tests los cambian en caliente vía POST /__control,
  // así un mismo servidor sirve para todos los escenarios.
  const estado = {
    retrasoPerrosMs,
    perros: sinPerro ? [] : [{ ...PERRO_DE_PRUEBA }],
    // Menús guardados, con su perro_id. El GET filtra de verdad por esa
    // columna: así, si la app volviera a guardarlos con perro_id vacío,
    // el test lo notaría (la lista saldría vacía) en vez de pasar por
    // casualidad.
    menus: [],
    // Si es true, /menu/v2 y /menu/semana NO responden nunca: simula la
    // API dormida en Render, que es lo que dejaba el "Calculando..."
    // colgado para siempre.
    colgarGenerador: false,
    // Qué contesta /menu/revalidar: "vale" (sigue valiendo), "corregido"
    // (ya no vale pero hay arreglo) o "sin_arreglo".
    revalidar: "vale",
    // Último POST /rest/v1/menus recibido, para poder afirmar sobre él.
    ultimoMenuGuardado: null,
    // Qué manda el backend en "aviso_composicion": el texto que explica
    // por qué a este menú le falta una categoría entera. null = no falta
    // nada. Se puede fijar por separado para la GENERACIÓN y para la
    // EDICIÓN, porque el caso interesante es justo que cambien: se genera
    // con aviso y al editar deja de haberlo.
    avisoComposicion: null,
    avisoComposicionAlEditar: null,
    // Escenarios de /menu/varios-perros: si la compra sale única (todos
    // los perros con los mismos alimentos) y si la llamada falla entera.
    casaCompraUnica: true,
    casaFalla: false,
  };

  const servidor = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://localhost");
    const ruta = url.pathname;

    const cors = {
      "Access-Control-Allow-Origin": req.headers.origin || "*",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
      "Access-Control-Expose-Headers": "content-range, x-supabase-api-version",
      "Access-Control-Max-Age": "86400",
    };

    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      res.end();
      return;
    }

    let cuerpo = "";
    for await (const trozo of req) cuerpo += trozo;

    const responder = (codigo, datos) => {
      const texto = JSON.stringify(datos);
      res.writeHead(codigo, {
        ...cors,
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(texto),
      });
      res.end(texto);
    };

    log(`${req.method} ${ruta}${url.search}`);

    // ── Mando a distancia para los tests (no existe en Supabase) ────────
    if (ruta === "/__control") {
      const cfg = cuerpo ? JSON.parse(cuerpo) : {};
      if (typeof cfg.retrasoPerrosMs === "number") estado.retrasoPerrosMs = cfg.retrasoPerrosMs;
      if (typeof cfg.sinPerro === "boolean") {
        estado.perros = cfg.sinPerro ? [] : [{ ...PERRO_DE_PRUEBA }];
      }
      if (Array.isArray(cfg.menus)) estado.menus = cfg.menus.map((m) => ({ ...m }));
      if (typeof cfg.colgarGenerador === "boolean") estado.colgarGenerador = cfg.colgarGenerador;
      if ("avisoComposicion" in cfg) estado.avisoComposicion = cfg.avisoComposicion;
      if ("avisoComposicionAlEditar" in cfg) estado.avisoComposicionAlEditar = cfg.avisoComposicionAlEditar;
      if (cfg.revalidar) estado.revalidar = cfg.revalidar;
      if (typeof cfg.casaCompraUnica === "boolean") estado.casaCompraUnica = cfg.casaCompraUnica;
      if (typeof cfg.casaFalla === "boolean") estado.casaFalla = cfg.casaFalla;
      // Permite sembrar un perro con campos concretos: por ejemplo con la
      // raza guardada "a la antigua" (el objeto entero), para comprobar
      // que esas filas viejas se siguen leyendo bien.
      if (cfg.perro) estado.perros = [{ ...PERRO_DE_PRUEBA, ...cfg.perro }];
      // Sembrar VARIOS perros de golpe (pruebas de multi-perro). Va
      // después de `cfg.perro` a propósito: si se mandan los dos, manda
      // la lista completa.
      if (Array.isArray(cfg.perros)) estado.perros = cfg.perros.map((p) => ({ ...PERRO_DE_PRUEBA, ...p }));
      if (cfg.olvidarUltimoMenu) estado.ultimoMenuGuardado = null;
      return responder(200, {
        retrasoPerrosMs: estado.retrasoPerrosMs,
        perros: estado.perros.length,
        nombresDePerros: estado.perros.map((p) => p.nombre),
        // Cuántos menús guardados tiene CADA perro. Mirar solo el total
        // no distingue "un menú para cada uno" de "los dos menús en el
        // mismo perro", que es justo el fallo que hay que poder cazar.
        menusPorPerro: estado.menus.reduce((cuenta, m) => {
          const k = String(m.perro_id);
          cuenta[k] = (cuenta[k] || 0) + 1;
          return cuenta;
        }, {}),
        menus: estado.menus.length,
        ultimoMenuGuardado: estado.ultimoMenuGuardado,
      });
    }

    // ── GoTrue ──────────────────────────────────────────────────────────
    if (ruta === "/auth/v1/token") {
      const datos = cuerpo ? JSON.parse(cuerpo) : {};
      if (url.searchParams.get("grant_type") === "password") {
        if (datos.email !== CUENTA_DE_PRUEBA.email || datos.password !== CUENTA_DE_PRUEBA.password) {
          return responder(400, {
            error: "invalid_grant",
            error_description: "Invalid login credentials",
            msg: "Invalid login credentials",
          });
        }
      }
      return responder(200, sesion());
    }
    if (ruta === "/auth/v1/signup") return responder(200, sesion());
    if (ruta === "/auth/v1/user") return responder(200, usuario());
    if (ruta === "/auth/v1/logout") { res.writeHead(204, cors); return res.end(); }
    if (ruta === "/auth/v1/recover") return responder(200, {});
    if (ruta === "/auth/v1/settings") {
      return responder(200, { external: {}, disable_signup: false, mailer_autoconfirm: true });
    }

    // ── API de menús de mentira (lo que en producción es canislab-api) ──
    //
    // No calcula nada: devuelve siempre el mismo menú plausible. Los tests
    // de este fichero comprueban la NAVEGACIÓN y el GUARDADO, no la
    // nutrición — de eso se encarga el backend, que tiene sus propias
    // pruebas. Lo único que importa aquí es que la respuesta tenga la
    // forma que la app espera.
    const MENU_FALSO = {
      factible: true,
      menu: {
        "Carne muscular de pollo": 420,
        "Hueso carnoso de pollo": 150,
        "Hígado de ternera": 40,
        "Vísceras de ternera": 40,
        "Calabacín": 90,
      },
    };

    if (estado.colgarGenerador && (ruta === "/menu/v2" || ruta === "/menu/semana")) {
      // Ni respuesta ni error: la petición se queda abierta, igual que
      // una API que no contesta. Sin timeout en el cliente, esto cuelga
      // la app para siempre.
      return;
    }
    if (ruta === "/menu/revalidar") {
      const datos = JSON.parse(cuerpo || "{}");
      if (!datos.menu_actual_gramos || Object.keys(datos.menu_actual_gramos).length === 0) {
        return responder(400, { detail: "Hace falta el menú actual con sus gramos." });
      }
      // "por_contenido": decide menú a menú, como hace el de verdad. Un
      // menú que lleva el multivitamínico de cachorro ya no vale; los
      // demás sí. Sirve para probar la semana MEZCLADA.
      if (estado.revalidar === "por_contenido") {
        const lleva = Object.keys(datos.menu_actual_gramos).includes("V-INTEGRA Cachorro");
        if (!lleva) {
          return responder(200, { factible: true, sigue_siendo_valido: true, menu: datos.menu_actual_gramos });
        }
        const corregido = { ...datos.menu_actual_gramos };
        delete corregido["V-INTEGRA Cachorro"];
        corregido["Mejillón de Nueva Zelanda"] = 12;
        return responder(200, {
          factible: true,
          sigue_siendo_valido: false,
          por_que_ya_no_vale: ["manganeso se queda en el 68%"],
          menu: corregido,
          cambios: {
            quitados: ["V-INTEGRA Cachorro"],
            anadidos: ["Mejillón de Nueva Zelanda"],
            se_mantienen: Object.keys(corregido).filter((n) => n !== "Mejillón de Nueva Zelanda"),
          },
        });
      }

      if (estado.revalidar === "vale") {
        return responder(200, { factible: true, sigue_siendo_valido: true, menu: datos.menu_actual_gramos });
      }
      if (estado.revalidar === "sin_arreglo") {
        return responder(200, {
          factible: false,
          sigue_siendo_valido: false,
          motivo: "Este menú ya no cumple los requisitos de la etapa actual del perro y no hemos encontrado forma de arreglarlo conservando sus alimentos. Genera un menú nuevo.",
          por_que_ya_no_vale: ["manganeso se queda en el 68%", "linoleico se queda en el 75%"],
        });
      }
      // "corregido": ya no vale, pero el motor lo ha rehecho conservando
      // lo que ha podido.
      return responder(200, {
        factible: true,
        sigue_siendo_valido: false,
        por_que_ya_no_vale: ["manganeso se queda en el 68%"],
        menu: { "Carne muscular de pollo": 430, "Hueso carnoso de pollo": 150, "Mejillón de Nueva Zelanda": 12 },
        cambios: {
          quitados: ["V-INTEGRA Cachorro"],
          anadidos: ["Mejillón de Nueva Zelanda"],
          se_mantienen: ["Carne muscular de pollo", "Hueso carnoso de pollo"],
        },
      });
    }

    if (ruta === "/menu/v2") {
      return responder(200, { ...MENU_FALSO, aviso_composicion: estado.avisoComposicion });
    }
    // Los tres caminos de edición devuelven el menú en "gramos", no en
    // "menu" -- igual que el backend de verdad.
    if (ruta === "/menu/cambiar" || ruta === "/menu/anadir" || ruta === "/menu/quitar") {
      return responder(200, {
        factible: true,
        gramos: MENU_FALSO.menu,
        ficha: { semaforo: "verde", correctos: 30, total: 30 },
        problemas_seguridad: [],
        aviso_composicion: estado.avisoComposicionAlEditar,
      });
    }
    // ⚠️ AÑADIDO — los menús de todos los perros de la casa en una sola
    // llamada. No calcula nada (para eso está el backend, con sus propias
    // pruebas): devuelve una respuesta con la FORMA que la app espera, y
    // los tests eligen el escenario con estado.casaCompraUnica.
    if (ruta === "/menu/varios-perros") {
      const pedido = JSON.parse(cuerpo || "{}");
      const noms = pedido.nombres || [];
      const base = { "Carne muscular de pollo": 420, "Hueso carnoso de pollo": 150,
                     "Hígado de ternera": 40 };
      const unica = estado.casaCompraUnica;
      const menus = noms.map((nombre, i) => {
        // el primero manda; los demás, o iguales, o con uno más
        const propio = (i > 0 && !unica)
          ? { ...base, "Sardina": 25 }
          : { ...base };
        const anadidos = (i > 0 && !unica) ? ["Sardina"] : [];
        // las cantidades cambian por perro: es el sentido de "parecidos"
        const escalado = Object.fromEntries(
          Object.entries(propio).map(([n, g]) => [n, Math.round(g * (1 - i * 0.4))]));
        return {
          indice: i, nombre, es_la_base: i === 0, factible: true,
          menu: escalado,
          kcal_total: 1200 - i * 400, gramos_total: 610 - i * 200,
          cambios: { iguales: Object.keys(base), anadidos, quitados: [],
                     cuantos_cambios: anadidos.length },
          resumen_parecido: i === 0 ? null : (anadidos.length === 0
            ? `El menú de ${nombre} lleva exactamente los mismos alimentos que el de ${noms[0]}: solo cambian las cantidades. Compras una vez y repartes.`
            : `El menú de ${nombre} comparte 3 alimentos con el de ${noms[0]}, pero lleva además Sardina. Es un cambio respecto a la compra de ${noms[0]}.`),
        };
      });
      const totales = menus.reduce((t, m) => t + m.cambios.cuantos_cambios, 0);
      return responder(200, {
        factible: !estado.casaFalla,
        motivo: estado.casaFalla ? "No hemos encontrado menús que cumplan para todos." : undefined,
        modo_conjunto: pedido.modo_conjunto,
        perro_base: noms[0],
        cambios_totales: totales,
        compra_unica: totales === 0,
        menus,
      });
    }
    if (ruta === "/menu/semana") {
      const cuantos = Number(url.searchParams.get("numero_de_menus") || 1);
      return responder(200, {
        factible: true,
        menus: Array.from({ length: cuantos },
                          () => ({ ...MENU_FALSO, aviso_composicion: estado.avisoComposicion })),
      });
    }
    if (ruta === "/alimentos") {
      return responder(200, {
        "Carne muscular": [{ nombre: "Carne muscular de pollo", kcal_100g: 110 }],
        "Hueso carnoso": [{ nombre: "Hueso carnoso de pollo", kcal_100g: 150 }],
      });
    }
    if (ruta.startsWith("/revisar") || ruta.startsWith("/analizar")) {
      return responder(200, { factible: true, problemas: [] });
    }

    // ── PostgREST ───────────────────────────────────────────────────────
    const unSoloObjeto = (req.headers.accept || "").includes("pgrst.object");
    // PostgREST manda los filtros como ?columna=eq.<valor>.
    const idDelFiltro = (u, columna) => {
      const filtro = u.searchParams.get(columna);
      return filtro && filtro.startsWith("eq.") ? filtro.slice(3) : null;
    };

    if (ruta === "/rest/v1/perros") {
      if (req.method === "GET") {
        // ⏱ El retraso es el corazón del test: reproduce que el perro
        // llegue DESPUÉS de que la app ya haya decidido qué pantalla pintar.
        await dormir(estado.retrasoPerrosMs);
        return responder(200, estado.perros);
      }
      // ⚠️ AMPLIADO — antes esta tabla sólo sabía guardar UN perro:
      // POST y PATCH hacían `splice(0, length, ...)`, o sea machacaban
      // la lista entera, y DELETE la vaciaba del todo. Con eso, una
      // prueba de varios perros habría pasado en verde diciendo cosas
      // falsas (crear el segundo perro habría "funcionado" borrando el
      // primero). Ahora se comporta como una tabla de verdad: por id.
      if (req.method === "POST") {
        const enviado = JSON.parse(cuerpo || "{}");
        // El primer perro conserva el id de siempre para no romper las
        // pruebas que lo dan por hecho; los siguientes llevan uno nuevo.
        const nuevo = {
          ...PERRO_DE_PRUEBA,
          ...enviado,
          id: estado.perros.length === 0
            ? PERRO_ID
            : `33333333-3333-4333-8333-${String(estado.perros.length).padStart(12, "0")}`,
          created_at: new Date().toISOString(),
        };
        estado.perros.push(nuevo);
        return responder(201, unSoloObjeto ? nuevo : [nuevo]);
      }
      if (req.method === "PATCH") {
        const id = idDelFiltro(url, "id");
        const i = id ? estado.perros.findIndex((p) => String(p.id) === id) : 0;
        if (i < 0) return responder(200, unSoloObjeto ? null : []);
        const actualizado = { ...(estado.perros[i] || PERRO_DE_PRUEBA), ...JSON.parse(cuerpo || "{}") };
        estado.perros[i] = actualizado;
        return responder(200, unSoloObjeto ? actualizado : [actualizado]);
      }
      if (req.method === "DELETE") {
        const id = idDelFiltro(url, "id");
        estado.perros = id
          ? estado.perros.filter((p) => String(p.id) !== id)
          : [];
        return responder(200, []);
      }
    }

    if (ruta === "/rest/v1/profiles") {
      const perfil = {
        id: USER_ID,
        plan: "free",
        suscripcion_activa_hasta: null,
        nombre: "Cuenta de prueba",
      };
      return responder(200, unSoloObjeto ? perfil : [perfil]);
    }

    if (ruta === "/rest/v1/menus") {
      if (req.method === "GET") {
        // PostgREST manda ?perro_id=eq.<uuid>. Filtramos de verdad: es lo
        // que hace que el test detecte un perro_id mal guardado.
        const filtro = url.searchParams.get("perro_id");
        const perroId = filtro && filtro.startsWith("eq.") ? filtro.slice(3) : null;
        const filas = perroId
          ? estado.menus.filter((m) => String(m.perro_id) === perroId)
          : estado.menus;
        return responder(200, filas);
      }
      if (req.method === "DELETE") {
        // Se borra por menú suelto (id) o por perro entero (perro_id):
        // borrar un perro se lleva sus menús por delante, y esta tabla
        // tiene que reflejarlo para que la prueba lo pueda comprobar.
        const id = idDelFiltro(url, "id");
        const perroId = idDelFiltro(url, "perro_id");
        if (perroId) estado.menus = estado.menus.filter((m) => String(m.perro_id) !== perroId);
        else if (id) estado.menus = estado.menus.filter((m) => String(m.id) !== id);
        return responder(200, []);
      }
      const datos = JSON.parse(cuerpo || "{}");
      const fila = {
        id: `menu-${estado.menus.length + 1}`,
        created_at: new Date().toISOString(),
        ...datos,
      };
      estado.ultimoMenuGuardado = fila;
      estado.menus.unshift(fila);
      return responder(201, unSoloObjeto ? fila : [fila]);
    }

    responder(404, { message: `fake-supabase: sin ruta para ${req.method} ${ruta}` });
  });

  return {
    servidor,
    escuchar: (puerto = 0) =>
      new Promise((resolve) => {
        servidor.listen(puerto, "127.0.0.1", () => resolve(`http://127.0.0.1:${servidor.address().port}`));
      }),
    cerrar: () => new Promise((resolve) => servidor.close(resolve)),
  };
}
