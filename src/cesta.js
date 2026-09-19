// ─── LA CESTA DE LA COMPRA ────────────────────────────────────────────────────
//
// Hasta ahora la app decía qué come el perro CADA DÍA, y comprar era cosa
// tuya: mirar dos o tres menús, multiplicar cada uno por sus días, sumar lo
// que se repite y acordarse de lo que solo sale en uno. Con dos perros, por
// dos.
//
// Y lo que había en la pantalla de varios perros ("la compra de un día,
// para todos") sumaba SOLO el primer menú de cada perro. Si el segundo menú
// llevaba un alimento distinto -- que es justo para lo que sirve tener dos
// menús -- ese alimento no aparecía en la compra. Te ibas a la tienda sin él.
//
// POR QUÉ ESTÁ EN SU PROPIO ARCHIVO Y NO EN App.jsx
// Porque lo usan DOS pantallas (un perro y varios) y tiene que dar el mismo
// resultado en las dos. Cuando esto vivía repartido, la de varios perros se
// quedó en "un día" y la de un perro no existía; separarlo es lo que impide
// que vuelvan a divergir. Y así las pruebas pueden llamarlo directamente,
// con menús inventados, en vez de depender de lo que devuelva el servidor.
//
// LO QUE **NO** HACE, a propósito: precios. No los tenemos, cambian por
// tienda y por semana, y una cifra inventada en una lista de la compra es
// peor que ninguna cifra.

// Dónde se compra cada cosa. La lista de la compra de verdad se recorre por
// zonas de la tienda, no por categoría nutricional: "carne, hueso, víscera e
// hígado" son cuatro casillas del motor pero un solo mostrador.
export const ZONAS = [
  {
    clave: "carniceria",
    titulo: "Carnicería",
    categorias: ["Carne muscular", "Hueso carnoso", "Vísceras", "Hígado"],
  },
  {
    clave: "pescaderia",
    titulo: "Pescadería",
    categorias: ["Pescados y mariscos"],
  },
  {
    clave: "verduleria",
    titulo: "Frutería",
    // ⚠️ «Cereales y tubérculos» entró el 17 de septiembre y no estaba en
    // NINGUNA zona, así que caía en «Despensa» por el `|| "despensa"` de abajo
    // — sin error y sin que nadie lo viera. La patata y el boniato se compran
    // en la frutería; el arroz y la avena también salen aquí porque quien hace
    // la compra no va a buscarlos entre los botes de vitaminas.
    categorias: ["Verduras y frutas", "Cereales y tubérculos"],
  },
  {
    // Todo lo que no se compra fresco ni se compra cada semana: sal,
    // aceites, semillas, huevo y los suplementos. Van juntos porque para
    // quien compra son la misma cosa -- "esto ya lo tengo en casa".
    clave: "despensa",
    titulo: "Despensa y suplementos",
    categorias: ["Extras", "Suplementos comerciales", "Multivitamínico",
                 "Yodo", "Calcio", "Omega-3", "Vitamina B", "Hierro", "Fibra"],
  },
];

// Si una ficha se pesa cocida lo dice el motor, no su nombre: hay fichas
// cocidas que no se llaman «cocido» (el Boniato) y al revés. Se pregunta por la
// misma vía que el factor, y sin respuesta se asume que no, que es el lado que
// no cambia ninguna cantidad.
let _esCocida = () => false;
export function declararQueEsCocido(fn) { _esCocida = fn || (() => false); }
const esCocida = (nombre) => { try { return !!_esCocida(nombre); } catch { return false; } };

const ZONA_DE = {};
for (const z of ZONAS) for (const c of z.categorias) ZONA_DE[c] = z.clave;

export const zonaDeCategoria = (categoria) => ZONA_DE[categoria] || "despensa";

// ⚠️ Cómo se escribe una cantidad PARA COMPRAR, que no es lo mismo que una
// cantidad para pesar en la báscula. En el menú, 2478 g de conejo es el dato
// exacto y así tiene que salir. En la tienda, "2,5 kg" es lo que pides. Por
// debajo del kilo se dan gramos enteros, y por debajo de 10 g un decimal,
// porque ahí la diferencia entre 3 y 3,4 sí importa (son suplementos).
export function formatearCompra(gramos) {
  if (!(gramos > 0)) return "0 g";
  if (gramos >= 1000) {
    const kg = Math.round(gramos / 100) / 10;
    return `${String(kg).replace(".", ",")} kg`;
  }
  if (gramos >= 10) return `${Math.round(gramos)} g`;
  const g = Math.round(gramos * 10) / 10;
  if (g === 0) return "< 0,1 g";
  return `${String(g).replace(".", ",")} g`;
}

// Enumeración en español: "Cairo", "Cairo y Lola", "Cairo, Lola y Ruffo".
function enumerar(nombres) {
  if (nombres.length === 0) return "";
  if (nombres.length === 1) return nombres[0];
  return `${nombres.slice(0, -1).join(", ")} y ${nombres[nombres.length - 1]}`;
}

/**
 * La compra de una semana.
 *
 * `perros`: [{ nombre, menus: [{ gramos: {alimento: g/día}, dias }] }]
 *   Un menú de 4 días con 600 g de conejo al día son 2400 g de conejo. Ese
 *   `dias` es lo que antes no se usaba y por eso la compra salía corta.
 *
 * `categoriaDe`: función nombre -> categoría. Se pasa desde fuera para no
 *   duplicar aquí el catálogo entero, que ya vive en App.jsx.
 *
 * Devuelve las líneas ya agrupadas por zona de tienda:
 *   [{ clave, titulo, lineas: [{ alimento, categoria, gramos, deQuien }] }]
 * `deQuien` son los nombres de los perros que lo llevan, en el orden en que
 * vinieron. Con un solo perro no sirve de nada y la pantalla no lo pinta,
 * pero se calcula igual: es más simple que tener dos caminos.
 */
export function cestaDeLaCompra(perros, categoriaDe, crudoQueHaceFalta) {
  const total = new Map();

  for (const perro of perros || []) {
    for (const m of perro.menus || []) {
      // Un menú sin días declarados vale por UNO. Nunca por cero: un cero
      // silencioso haría desaparecer alimentos de la lista de la compra,
      // que es exactamente el fallo que esto viene a arreglar.
      const dias = m.dias > 0 ? m.dias : 1;
      for (const [alimento, gramosDia] of Object.entries(m.gramos || {})) {
        if (!(gramosDia > 0)) continue;
        if (!total.has(alimento)) {
          total.set(alimento, {
            alimento,
            categoria: categoriaDe(alimento),
            gramos: 0,
            deQuien: [],
          });
        }
        const linea = total.get(alimento);
        linea.gramos += gramosDia * dias;
        if (perro.nombre && !linea.deQuien.includes(perro.nombre)) {
          linea.deQuien.push(perro.nombre);
        }
      }
    }
  }

  // ⚠️ EN LA TIENDA SE COMPRA CRUDO (18 de septiembre de 2026), y esto era un
  // fallo, no una mejora. Los gramos de un menú COCINADO son de comida YA
  // COCINADA —la ficha lo declara y el aviso al comprar lo repite— pero lo que
  // se pide en el mostrador es el peso crudo. Y la diferencia no es un
  // redondeo: medida sobre las 69 fichas que se pesan cocidas, va de **×0,20 a
  // ×1,99**. Del pulpo hay que comprar el DOBLE de lo que dice el menú y de los
  // copos de avena una QUINTA PARTE. Sin convertir, la lista manda a la tienda
  // a por la cantidad equivocada, y en el peor caso por la mitad de la comida.
  //
  // El factor lo calcula el MOTOR y llega dentro de cada alimento
  // (`cuanto_crudo_hace_falta`): se deriva del agua de la ficha cocida y la de
  // su crudo, así que el día que una humedad cambie, el factor cambia solo.
  // Aquí no hay ni un número — regla 6.
  //
  // ⚠️ Y lo que NO tiene factor se queda TAL CUAL y se dice. Hoy es una sola
  // ficha, «Vaca para guisar cocida», porque la fila cruda que la ancla no
  // publica agua. Poner el factor de otro corte de vaca sería inventarse una
  // cifra en una lista de la compra.
  for (const linea of total.values()) {
    const d = crudoQueHaceFalta ? crudoQueHaceFalta(linea.alimento) : null;
    if (d && d.factor > 0) {
      linea.gramosEnElPlato = linea.gramos;
      linea.gramos = linea.gramos * d.factor;
      linea.seCompraEnCrudo = true;
      linea.factorCrudo = d.factor;
      linea.factorAproximado = !!d.aproximado;
    } else if (esCocida(linea.alimento)) {
      linea.seCompraEnCrudo = false;
      linea.sinFactor = true;
    }
  }

  const lineas = [...total.values()].sort((a, b) => b.gramos - a.gramos);

  return ZONAS.map((z) => ({
    clave: z.clave,
    titulo: z.titulo,
    lineas: lineas.filter((l) => zonaDeCategoria(l.categoria) === z.clave),
  })).filter((z) => z.lineas.length > 0);
}

/**
 * Cómo se dice de quién es una línea de la compra.
 *
 * PEDIDO EXPRESO: "diferenciando de quién es cada cosa (para Cairo / para
 * Nala / para los dos). Solo aparece la distinción si hay más de un perro".
 *
 * Devuelve null cuando no hay nada que distinguir: con un solo perro en
 * casa, y también cuando el alimento es de TODOS -- poner "para Cairo y
 * Lola" en catorce de las quince líneas es ruido que tapa justo la línea
 * que sí es de uno solo.
 */
export function deQuienEs(deQuien, cuantosPerros) {
  if (cuantosPerros <= 1) return null;
  if (!deQuien || deQuien.length === 0) return null;
  if (deQuien.length >= cuantosPerros) return null;
  return `solo ${enumerar(deQuien)}`;
}
