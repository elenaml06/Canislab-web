// ─── Cómo se escriben los gramos, los comprimidos y las razas ──────────────
//
// Funciones puras: entra un número o un nombre, sale un texto. No tocan
// estado ni red, así que se pueden probar solas.


// ⚠️ QUITADO (5 agosto, madrugada) — AUDITORÍA: "POOL_CANDIDATOS" y las
// dos funciones que lo usaban ("especiesBaseDisponibles",
// "generarCandidatosAleatorios") nunca se llamaban desde ningún sitio
// activo -- código muerto. Dependían de una lista con "fantasmas"
// (alimentos que no existen en el catálogo real, como "Cuello de
// pollo" o "Rabo de toro") que nunca se actualizó cuando el catálogo
// real cambió. Exactamente el mismo patrón que causó que "Lengua de
// ternera" cayera en Extras -- una segunda fuente de verdad
// desincronizada. Se quita del todo: categoriaDeAlimento() ya no
// necesita ningún respaldo, CATEGORIAS_ALIMENTO cubre el catálogo
// real completo, verificado alimento por alimento contra el backend.

// ⚠️ AÑADIDO (5 agosto, madrugada) — CASO REAL, pedido expreso: "me ha
// añadido Yoduro potásico a 0 gramos... ¿cómo puede añadir algo a 0
// gramos?" -- el backend permite valores muy pequeños a propósito (un
// suplemento como el yoduro potásico puede necesitarse en fracciones
// de gramo para cerrar el yodo exacto), pero al redondear a 1 decimal
// aquí, un valor real como 0.03g se mostraba literalmente como "0g" --
// visualmente parece que no se añade nada, cuando SÍ se está añadiendo
// una cantidad real, solo que diminuta. Bajar el redondeo del backend
// reintroduciría el problema que motivó bajarlo en su momento (perder
// del todo aportes reales y necesarios de suplementos concentrados) --
// la solución correcta es aquí: para cantidades tan pequeñas que
// redondearían a "0", mostrar "< 0,1 g" en vez de "0g", para dejar
// claro que sí hay algo, aunque sea una traza.
export function formatearGramos(gramos) {
  const redondeado = Math.round(gramos * 10) / 10;
  if (redondeado === 0 && gramos > 0) return "< 0,1 g";
  return `${redondeado}g`;
}

// ⚠️ AÑADIDO (5 agosto, madrugada) — CASO REAL, pedido expreso: para un
// suplemento vendido en comprimidos, mostrar "0,1g" o "< 0,1 g" no
// sirve para nada -- nadie puede pesar eso en casa. Convierte los
// gramos reales a una fracción de comprimido PRACTICABLE (entero,
// medio, cuarto...) -- partir en trozos más pequeños que un cuarto no
// es realista, así que se redondea a la fracción practicable más
// cercana. Es el único alimento del catálogo vendido así (confirmado
// revisando el catálogo entero), de ahí que sea una función dedicada
// en vez de un sistema genérico de "peso por unidad" para todo el
// catálogo -- estaría sobredimensionado para un único caso real.
export function formatearComprimidos(gramos, pesoComprimido) {
  const unidades = gramos / pesoComprimido;
  const fracciones = [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 8];
  let mejor = fracciones[0];
  let menorDiferencia = Math.abs(unidades - mejor);
  for (const f of fracciones) {
    const diferencia = Math.abs(unidades - f);
    if (diferencia < menorDiferencia) { mejor = f; menorDiferencia = diferencia; }
  }
  if (unidades > 8) return `${Math.round(unidades)} comprimidos`;
  const NOMBRES = { 0.25: "1/4 comprimido", 0.5: "medio comprimido", 0.75: "3/4 comprimido", 1: "1 comprimido" };
  return NOMBRES[mejor] || `${mejor} comprimidos`;
}

// ⚠️ AÑADIDO — saca el nombre de la raza venga como venga. Las filas
// guardadas antes del arreglo tienen el objeto entero serializado, así
// que hay que saber leerlas igualmente: si no, esas usuarias seguirían
// viendo el texto raro para siempre aunque el guardado ya esté bien.
export function nombreDeRaza(valor) {
  if (!valor) return null;
  if (typeof valor === "object") return valor.nombre ? nombreDeRaza(valor.nombre) : null;
  const texto = String(valor).trim();
  if (!texto || texto === "[object Object]") return null;
  if (texto.startsWith("{")) {
    try {
      const objeto = JSON.parse(texto);
      return objeto?.nombre ? nombreDeRaza(objeto.nombre) : null;
    } catch {
      return null; // JSON roto: mejor sin raza que con un churro en pantalla
    }
  }
  return texto;
}

// Recupera la raza completa del catálogo a partir de su nombre, para no
// perder tamano/pesoMedio (que se usan para calcular la etapa y el peso
// adulto esperado). Si es una raza que no está en el catálogo, al menos
// se conserva el nombre.
export function razaDesdeNombre(nombre) {
  if (!nombre) return null;
  return RAZAS.find((r) => r.nombre === nombre) || { nombre };
}

export const RAZAS = [
  {"nombre": "Affenpinscher", "tamano": "Toy", "pesoMin": 3, "pesoMax": 6, "pesoMedio": 4.5},
  {"nombre": "Airedale Terrier", "tamano": "Mediano", "pesoMin": 19, "pesoMax": 25, "pesoMedio": 22.0},
  {"nombre": "Akita Americano", "tamano": "Gigante", "pesoMin": 32, "pesoMax": 59, "pesoMedio": 45.5},
  {"nombre": "Akita Inu", "tamano": "Grande", "pesoMin": 32, "pesoMax": 45, "pesoMedio": 38.5},
  {"nombre": "Alaskan Malamute", "tamano": "Grande", "pesoMin": 34, "pesoMax": 39, "pesoMedio": 36.5},
  {"nombre": "American Staffordshire Terrier", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 34, "pesoMedio": 26.0},
  {"nombre": "Barbet", "tamano": "Mediano", "pesoMin": 14, "pesoMax": 28, "pesoMedio": 21.0},
  {"nombre": "Basenji", "tamano": "Pequeño", "pesoMin": 9.5, "pesoMax": 11, "pesoMedio": 10.2},
  {"nombre": "Basset Hound", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 29, "pesoMedio": 24.5},
  {"nombre": "Beagle", "tamano": "Pequeño", "pesoMin": 9, "pesoMax": 15, "pesoMedio": 12.0},
  {"nombre": "Bearded Collie", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 27, "pesoMedio": 22.5},
  {"nombre": "Beauceron", "tamano": "Grande", "pesoMin": 30, "pesoMax": 45, "pesoMedio": 37.5},
  {"nombre": "Bedlington Terrier", "tamano": "Pequeño", "pesoMin": 8, "pesoMax": 10, "pesoMedio": 9.0},
  {"nombre": "Bichón Frisé", "tamano": "Mini", "pesoMin": 5, "pesoMax": 8, "pesoMedio": 6.5},
  {"nombre": "Bichón Habanero", "tamano": "Mini", "pesoMin": 4.5, "pesoMax": 7.3, "pesoMedio": 5.9},
  {"nombre": "Bichón Maltés", "tamano": "Toy", "pesoMin": 3, "pesoMax": 4, "pesoMedio": 3.5},
  {"nombre": "Bobtail (Old English Sheepdog)", "tamano": "Grande", "pesoMin": 27, "pesoMax": 45, "pesoMedio": 36.0},
  {"nombre": "Border Collie", "tamano": "Mediano", "pesoMin": 14, "pesoMax": 20, "pesoMedio": 17.0},
  {"nombre": "Border Terrier", "tamano": "Mini", "pesoMin": 5.2, "pesoMax": 7.1, "pesoMedio": 6.2},
  {"nombre": "Borzoi", "tamano": "Grande", "pesoMin": 27, "pesoMax": 48, "pesoMedio": 37.5},
  {"nombre": "Boston Terrier", "tamano": "Pequeño", "pesoMin": 5, "pesoMax": 11, "pesoMedio": 8.0},
  {"nombre": "Boxer", "tamano": "Grande", "pesoMin": 25, "pesoMax": 32, "pesoMedio": 28.5},
  {"nombre": "Boyero de Berna", "tamano": "Grande", "pesoMin": 36, "pesoMax": 52, "pesoMedio": 44.0},
  {"nombre": "Boyero de Flandes", "tamano": "Grande", "pesoMin": 27, "pesoMax": 40, "pesoMedio": 33.5},
  {"nombre": "Braco Alemán de Pelo Corto", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 32, "pesoMedio": 26.0},
  {"nombre": "Braco Húngaro (Vizsla)", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 29, "pesoMedio": 23.5},
  {"nombre": "Bretón", "tamano": "Mediano", "pesoMin": 14, "pesoMax": 18, "pesoMedio": 16.0},
  {"nombre": "Bull Terrier", "tamano": "Grande", "pesoMin": 22, "pesoMax": 38, "pesoMedio": 30.0},
  {"nombre": "Bulldog Francés", "tamano": "Pequeño", "pesoMin": 8, "pesoMax": 14, "pesoMedio": 11.0},
  {"nombre": "Bulldog Inglés", "tamano": "Mediano", "pesoMin": 23, "pesoMax": 25, "pesoMedio": 24.0},
  {"nombre": "Bullmastiff", "tamano": "Gigante", "pesoMin": 41, "pesoMax": 59, "pesoMedio": 50.0},
  {"nombre": "Cairn Terrier", "tamano": "Mini", "pesoMin": 6, "pesoMax": 7.5, "pesoMedio": 6.8},
  {"nombre": "Cane Corso", "tamano": "Gigante", "pesoMin": 40, "pesoMax": 50, "pesoMedio": 45.0},
  {"nombre": "Caniche Enano", "tamano": "Mini", "pesoMin": 5, "pesoMax": 7, "pesoMedio": 6.0},
  {"nombre": "Caniche Mediano", "tamano": "Pequeño", "pesoMin": 9, "pesoMax": 13, "pesoMedio": 11.0},
  {"nombre": "Caniche Toy", "tamano": "Toy", "pesoMin": 2, "pesoMax": 4, "pesoMedio": 3.0},
  {"nombre": "Carlino (Pug)", "tamano": "Mini", "pesoMin": 6.3, "pesoMax": 8.1, "pesoMedio": 7.2},
  {"nombre": "Cavalier King Charles Spaniel", "tamano": "Mini", "pesoMin": 5.4, "pesoMax": 8.2, "pesoMedio": 6.8},
  {"nombre": "Chesapeake Bay Retriever", "tamano": "Grande", "pesoMin": 25, "pesoMax": 36, "pesoMedio": 30.5},
  {"nombre": "Chihuahua", "tamano": "Toy", "pesoMin": 1.5, "pesoMax": 3, "pesoMedio": 2.2},
  {"nombre": "Chow Chow", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 32, "pesoMedio": 26.0},
  {"nombre": "Cocker Spaniel Americano", "tamano": "Pequeño", "pesoMin": 11, "pesoMax": 14, "pesoMedio": 12.5},
  {"nombre": "Cocker Spaniel Inglés", "tamano": "Pequeño", "pesoMin": 13, "pesoMax": 15, "pesoMedio": 14.0},
  {"nombre": "Collie de Pelo Largo", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 30, "pesoMedio": 24.0},
  {"nombre": "Corgi Galés Cardigan", "tamano": "Pequeño", "pesoMin": 11, "pesoMax": 17, "pesoMedio": 14.0},
  {"nombre": "Corgi Galés Pembroke", "tamano": "Pequeño", "pesoMin": 10, "pesoMax": 14, "pesoMedio": 12.0},
  {"nombre": "Coton de Tuléar", "tamano": "Mini", "pesoMin": 4, "pesoMax": 6, "pesoMedio": 5.0},
  {"nombre": "Dachshund Estándar", "tamano": "Pequeño", "pesoMin": 7, "pesoMax": 9, "pesoMedio": 8.0},
  {"nombre": "Dachshund Miniatura", "tamano": "Toy", "pesoMin": 4, "pesoMax": 5, "pesoMedio": 4.5},
  {"nombre": "Deerhound", "tamano": "Grande", "pesoMin": 34, "pesoMax": 50, "pesoMedio": 42.0},
  {"nombre": "Dogo Argentino", "tamano": "Grande", "pesoMin": 35, "pesoMax": 45, "pesoMedio": 40.0},
  {"nombre": "Dogo de Burdeos", "tamano": "Gigante", "pesoMin": 45, "pesoMax": 65, "pesoMedio": 55.0},
  {"nombre": "Dálmata", "tamano": "Mediano", "pesoMin": 15, "pesoMax": 32, "pesoMedio": 23.5},
  {"nombre": "Dóberman", "tamano": "Grande", "pesoMin": 32, "pesoMax": 45, "pesoMedio": 38.5},
  {"nombre": "Fila Brasileño", "tamano": "Gigante", "pesoMin": 50, "pesoMax": 82, "pesoMedio": 66.0},
  {"nombre": "Flat Coated Retriever", "tamano": "Grande", "pesoMin": 25, "pesoMax": 36, "pesoMedio": 30.5},
  {"nombre": "Fox Terrier de Pelo Duro", "tamano": "Pequeño", "pesoMin": 7, "pesoMax": 9, "pesoMedio": 8.0},
  {"nombre": "Fox Terrier de Pelo Liso", "tamano": "Mini", "pesoMin": 6.8, "pesoMax": 8.6, "pesoMedio": 7.7},
  {"nombre": "Galgo Afgano", "tamano": "Mediano", "pesoMin": 23, "pesoMax": 27, "pesoMedio": 25.0},
  {"nombre": "Galgo Español", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 30, "pesoMedio": 25.0},
  {"nombre": "Golden Retriever", "tamano": "Grande", "pesoMin": 25, "pesoMax": 34, "pesoMedio": 29.5},
  {"nombre": "Gran Danés", "tamano": "Gigante", "pesoMin": 45, "pesoMax": 90, "pesoMedio": 67.5},
  {"nombre": "Gran Pirineo", "tamano": "Gigante", "pesoMin": 39, "pesoMax": 73, "pesoMedio": 56.0},
  {"nombre": "Greyhound", "tamano": "Grande", "pesoMin": 27, "pesoMax": 40, "pesoMedio": 33.5},
  {"nombre": "Grifón de Bruselas", "tamano": "Toy", "pesoMin": 3.5, "pesoMax": 6, "pesoMedio": 4.8},
  {"nombre": "Husky Siberiano", "tamano": "Mediano", "pesoMin": 16, "pesoMax": 27, "pesoMedio": 21.5},
  {"nombre": "Jack Russell Terrier", "tamano": "Mini", "pesoMin": 6, "pesoMax": 8, "pesoMedio": 7.0},
  {"nombre": "Keeshond", "tamano": "Mediano", "pesoMin": 14, "pesoMax": 18, "pesoMedio": 16.0},
  {"nombre": "Kelpie Australiano", "tamano": "Mediano", "pesoMin": 14, "pesoMax": 20, "pesoMedio": 17.0},
  {"nombre": "Komondor", "tamano": "Gigante", "pesoMin": 36, "pesoMax": 61, "pesoMedio": 48.5},
  {"nombre": "Kuvasz", "tamano": "Grande", "pesoMin": 30, "pesoMax": 52, "pesoMedio": 41.0},
  {"nombre": "Labrador Retriever", "tamano": "Grande", "pesoMin": 25, "pesoMax": 36, "pesoMedio": 30.5},
  {"nombre": "Landseer", "tamano": "Gigante", "pesoMin": 50, "pesoMax": 75, "pesoMedio": 62.5},
  {"nombre": "Leonberger", "tamano": "Gigante", "pesoMin": 41, "pesoMax": 75, "pesoMedio": 58.0},
  {"nombre": "Lhasa Apso", "tamano": "Mini", "pesoMin": 5.4, "pesoMax": 8.2, "pesoMedio": 6.8},
  {"nombre": "Lobero Irlandés", "tamano": "Gigante", "pesoMin": 40, "pesoMax": 69, "pesoMedio": 54.5},
  {"nombre": "Mastín Español", "tamano": "Gigante", "pesoMin": 52, "pesoMax": 100, "pesoMedio": 76.0},
  {"nombre": "Mastín Inglés", "tamano": "Gigante", "pesoMin": 68, "pesoMax": 110, "pesoMedio": 89.0},
  {"nombre": "Mastín Napolitano", "tamano": "Gigante", "pesoMin": 50, "pesoMax": 70, "pesoMedio": 60.0},
  {"nombre": "Norfolk Terrier", "tamano": "Mini", "pesoMin": 5, "pesoMax": 5.4, "pesoMedio": 5.2},
  {"nombre": "Norwich Terrier", "tamano": "Mini", "pesoMin": 5, "pesoMax": 5.4, "pesoMedio": 5.2},
  {"nombre": "Papillón", "tamano": "Toy", "pesoMin": 3.5, "pesoMax": 4.5, "pesoMedio": 4.0},
  {"nombre": "Parson Russell Terrier", "tamano": "Mini", "pesoMin": 6, "pesoMax": 8, "pesoMedio": 7.0},
  {"nombre": "Pastor Alemán", "tamano": "Grande", "pesoMin": 22, "pesoMax": 40, "pesoMedio": 31.0},
  {"nombre": "Pastor Australiano", "tamano": "Mediano", "pesoMin": 16, "pesoMax": 32, "pesoMedio": 24.0},
  {"nombre": "Pastor Belga Groenendael", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 30, "pesoMedio": 25.0},
  {"nombre": "Pastor Belga Malinois", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 30, "pesoMedio": 25.0},
  {"nombre": "Pastor de Anatolia", "tamano": "Gigante", "pesoMin": 40, "pesoMax": 68, "pesoMedio": 54.0},
  {"nombre": "Pastor del Cáucaso", "tamano": "Gigante", "pesoMin": 45, "pesoMax": 100, "pesoMedio": 72.5},
  {"nombre": "Pequinés", "tamano": "Toy", "pesoMin": 3.2, "pesoMax": 6, "pesoMedio": 4.6},
  {"nombre": "Perro Chino con Cresta", "tamano": "Toy", "pesoMin": 3, "pesoMax": 6, "pesoMedio": 4.5},
  {"nombre": "Perro Lobo Checoslovaco", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 26, "pesoMedio": 23.0},
  {"nombre": "Perro de Agua Español", "tamano": "Mediano", "pesoMin": 14, "pesoMax": 22, "pesoMedio": 18.0},
  {"nombre": "Perro de Agua Frisón", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 25, "pesoMedio": 21.5},
  {"nombre": "Perro de Agua Irlandés", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 29, "pesoMedio": 24.5},
  {"nombre": "Perro de Agua Portugués", "tamano": "Mediano", "pesoMin": 16, "pesoMax": 25, "pesoMedio": 20.5},
  {"nombre": "Perro de Montaña de los Apeninos", "tamano": "Grande", "pesoMin": 30, "pesoMax": 45, "pesoMedio": 37.5},
  {"nombre": "Perro de Montaña de los Pirineos", "tamano": "Gigante", "pesoMin": 40, "pesoMax": 60, "pesoMedio": 50.0},
  {"nombre": "Perro de Presa Canario", "tamano": "Gigante", "pesoMin": 40, "pesoMax": 65, "pesoMedio": 52.5},
  {"nombre": "Pinscher Miniatura", "tamano": "Mini", "pesoMin": 4, "pesoMax": 6, "pesoMedio": 5.0},
  {"nombre": "Podenco Andaluz", "tamano": "Mediano", "pesoMin": 16, "pesoMax": 33, "pesoMedio": 24.5},
  {"nombre": "Podenco Ibicenco", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 29, "pesoMedio": 24.5},
  {"nombre": "Pointer Inglés", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 30, "pesoMedio": 25.0},
  {"nombre": "Pomerania", "tamano": "Toy", "pesoMin": 1.9, "pesoMax": 3.5, "pesoMedio": 2.7},
  {"nombre": "Prague Ratter", "tamano": "Toy", "pesoMin": 1.5, "pesoMax": 3.6, "pesoMedio": 2.5},
  {"nombre": "Rhodesian Ridgeback", "tamano": "Grande", "pesoMin": 32, "pesoMax": 36, "pesoMedio": 34.0},
  {"nombre": "Rottweiler", "tamano": "Gigante", "pesoMin": 35, "pesoMax": 60, "pesoMedio": 47.5},
  {"nombre": "Saluki", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 27, "pesoMedio": 22.5},
  {"nombre": "Samoyedo", "tamano": "Mediano", "pesoMin": 16, "pesoMax": 30, "pesoMedio": 23.0},
  {"nombre": "San Bernardo", "tamano": "Gigante", "pesoMin": 64, "pesoMax": 82, "pesoMedio": 73.0},
  {"nombre": "Schnauzer Estándar", "tamano": "Mediano", "pesoMin": 14, "pesoMax": 20, "pesoMedio": 17.0},
  {"nombre": "Schnauzer Miniatura", "tamano": "Mini", "pesoMin": 5, "pesoMax": 9, "pesoMedio": 7.0},
  {"nombre": "Scottish Terrier", "tamano": "Pequeño", "pesoMin": 8.5, "pesoMax": 10.4, "pesoMedio": 9.4},
  {"nombre": "Sealyham Terrier", "tamano": "Pequeño", "pesoMin": 8, "pesoMax": 9, "pesoMedio": 8.5},
  {"nombre": "Setter Gordon", "tamano": "Grande", "pesoMin": 20, "pesoMax": 36, "pesoMedio": 28.0},
  {"nombre": "Setter Inglés", "tamano": "Grande", "pesoMin": 20, "pesoMax": 36, "pesoMedio": 28.0},
  {"nombre": "Setter Irlandés Rojo", "tamano": "Grande", "pesoMin": 24, "pesoMax": 32, "pesoMedio": 28.0},
  {"nombre": "Shar Pei", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 25, "pesoMedio": 21.5},
  {"nombre": "Shetland Sheepdog", "tamano": "Pequeño", "pesoMin": 6, "pesoMax": 12, "pesoMedio": 9.0},
  {"nombre": "Shiba Inu", "tamano": "Pequeño", "pesoMin": 8, "pesoMax": 11, "pesoMedio": 9.5},
  {"nombre": "Shih Tzu", "tamano": "Mini", "pesoMin": 4, "pesoMax": 7.2, "pesoMedio": 5.6},
  {"nombre": "Silky Terrier", "tamano": "Toy", "pesoMin": 3.5, "pesoMax": 4.5, "pesoMedio": 4.0},
  {"nombre": "Skye Terrier", "tamano": "Pequeño", "pesoMin": 11, "pesoMax": 18, "pesoMedio": 14.5},
  {"nombre": "Spitz Alemán Mediano", "tamano": "Pequeño", "pesoMin": 7, "pesoMax": 11, "pesoMedio": 9.0},
  {"nombre": "Springer Spaniel Inglés", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 25, "pesoMedio": 21.5},
  {"nombre": "Staffordshire Bull Terrier", "tamano": "Pequeño", "pesoMin": 11, "pesoMax": 17, "pesoMedio": 14.0},
  {"nombre": "Terranova", "tamano": "Gigante", "pesoMin": 45, "pesoMax": 68, "pesoMedio": 56.5},
  {"nombre": "Terrier Negro Ruso", "tamano": "Gigante", "pesoMin": 36, "pesoMax": 60, "pesoMedio": 48.0},
  {"nombre": "Terrier Ruso", "tamano": "Toy", "pesoMin": 2, "pesoMax": 3, "pesoMedio": 2.5},
  {"nombre": "Terrier Tibetano", "tamano": "Pequeño", "pesoMin": 8, "pesoMax": 14, "pesoMedio": 11.0},
  {"nombre": "Toy Fox Terrier", "tamano": "Toy", "pesoMin": 1.5, "pesoMax": 3, "pesoMedio": 2.2},
  {"nombre": "Volpino Italiano", "tamano": "Toy", "pesoMin": 4, "pesoMax": 5, "pesoMedio": 4.5},
  {"nombre": "Weimaraner", "tamano": "Grande", "pesoMin": 25, "pesoMax": 40, "pesoMedio": 32.5},
  {"nombre": "West Highland White Terrier", "tamano": "Mini", "pesoMin": 6.8, "pesoMax": 9.1, "pesoMedio": 7.9},
  {"nombre": "Whippet", "tamano": "Pequeño", "pesoMin": 9, "pesoMax": 19, "pesoMedio": 14.0},
  {"nombre": "Yorkshire Terrier", "tamano": "Toy", "pesoMin": 2, "pesoMax": 3.2, "pesoMedio": 2.6},
  {"nombre": "Lebrel Italiano", "tamano": "Toy", "pesoMin": 3, "pesoMax": 5, "pesoMedio": 4},
  {"nombre": "Azawakh", "tamano": "Mediano", "pesoMin": 15, "pesoMax": 25, "pesoMedio": 20},
  {"nombre": "Sloughi (Lebrel Árabe)", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 28, "pesoMedio": 24},
  {"nombre": "Galgo Húngaro (Magyar Agár)", "tamano": "Mediano", "pesoMin": 22, "pesoMax": 31, "pesoMedio": 26.5},
  {"nombre": "Lebrel Polaco (Chart Polski)", "tamano": "Grande", "pesoMin": 27, "pesoMax": 31, "pesoMedio": 29},
  {"nombre": "Boyero Australiano", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 26, "pesoMedio": 22},
  {"nombre": "Briard (Pastor de Brie)", "tamano": "Grande", "pesoMin": 34, "pesoMax": 45, "pesoMedio": 39.5},
  {"nombre": "Pastor de Picardía", "tamano": "Mediano", "pesoMin": 23, "pesoMax": 32, "pesoMedio": 27.5},
  {"nombre": "Pastor de los Pirineos", "tamano": "Pequeño", "pesoMin": 7, "pesoMax": 15, "pesoMedio": 11},
  {"nombre": "Puli", "tamano": "Pequeño", "pesoMin": 10, "pesoMax": 15, "pesoMedio": 12.5},
  {"nombre": "Pumi", "tamano": "Pequeño", "pesoMin": 8, "pesoMax": 15, "pesoMedio": 11.5},
  {"nombre": "Mudi", "tamano": "Pequeño", "pesoMin": 8, "pesoMax": 13, "pesoMedio": 10.5},
  {"nombre": "Perro de Pastor Bergamasco", "tamano": "Grande", "pesoMin": 26, "pesoMax": 38, "pesoMedio": 32},
  {"nombre": "Pastor Maremmano-Abruzzés", "tamano": "Grande", "pesoMin": 30, "pesoMax": 45, "pesoMedio": 37.5},
  {"nombre": "Collie de Pelo Corto", "tamano": "Grande", "pesoMin": 18, "pesoMax": 30, "pesoMedio": 24},
  {"nombre": "Pastor Blanco Suizo", "tamano": "Grande", "pesoMin": 25, "pesoMax": 40, "pesoMedio": 32.5},
  {"nombre": "Pastor Catalán", "tamano": "Mediano", "pesoMin": 16, "pesoMax": 22, "pesoMedio": 19},
  {"nombre": "Pastor Polaco de Tierras Bajas", "tamano": "Mediano", "pesoMin": 14, "pesoMax": 23, "pesoMedio": 18.5},
  {"nombre": "Pastor Polaco de Podhale (Tatra)", "tamano": "Gigante", "pesoMin": 45, "pesoMax": 70, "pesoMedio": 57.5},
  {"nombre": "Perro de Pastor Portugués", "tamano": "Mediano", "pesoMin": 17, "pesoMax": 27, "pesoMedio": 22},
  {"nombre": "Tchuvatch Eslovaco", "tamano": "Grande", "pesoMin": 31, "pesoMax": 44, "pesoMedio": 37.5},
  {"nombre": "Perro Lobo de Saarloos", "tamano": "Grande", "pesoMin": 36, "pesoMax": 41, "pesoMedio": 38.5},
  {"nombre": "Schapendoes Neerlandés", "tamano": "Pequeño", "pesoMin": 12, "pesoMax": 20, "pesoMedio": 16},
  {"nombre": "Perro de Pastor Islandés", "tamano": "Pequeño", "pesoMin": 11, "pesoMax": 20, "pesoMedio": 15.5},
  {"nombre": "Pinscher Alemán", "tamano": "Mediano", "pesoMin": 14, "pesoMax": 20, "pesoMedio": 17},
  {"nombre": "Schnauzer Gigante", "tamano": "Grande", "pesoMin": 35, "pesoMax": 47, "pesoMedio": 41},
  {"nombre": "Mastín Tibetano", "tamano": "Gigante", "pesoMin": 34, "pesoMax": 72, "pesoMedio": 53},
  {"nombre": "Hovawart", "tamano": "Grande", "pesoMin": 25, "pesoMax": 40, "pesoMedio": 32.5},
  {"nombre": "Boerboel", "tamano": "Gigante", "pesoMin": 50, "pesoMax": 90, "pesoMedio": 70},
  {"nombre": "Tosa Inu", "tamano": "Gigante", "pesoMin": 35, "pesoMax": 90, "pesoMedio": 62.5},
  {"nombre": "Broholmer", "tamano": "Gigante", "pesoMin": 40, "pesoMax": 70, "pesoMedio": 55},
  {"nombre": "Ca de Bou (Dogo Mallorquín)", "tamano": "Grande", "pesoMin": 30, "pesoMax": 38, "pesoMedio": 34},
  {"nombre": "Alano Español", "tamano": "Grande", "pesoMin": 33, "pesoMax": 45, "pesoMedio": 39},
  {"nombre": "Perro Pastor de Kangal", "tamano": "Gigante", "pesoMin": 40, "pesoMax": 60, "pesoMedio": 50},
  {"nombre": "Perro de Pastor de Asia Central", "tamano": "Gigante", "pesoMin": 40, "pesoMax": 79, "pesoMedio": 59.5},
  {"nombre": "Perro de Pastor de Charplanina", "tamano": "Grande", "pesoMin": 25, "pesoMax": 45, "pesoMedio": 35},
  {"nombre": "Perro de Montaña de la Estrela", "tamano": "Gigante", "pesoMin": 30, "pesoMax": 50, "pesoMedio": 40},
  {"nombre": "Rafeiro do Alentejo", "tamano": "Gigante", "pesoMin": 35, "pesoMax": 60, "pesoMedio": 47.5},
  {"nombre": "Perro de Castro Laboreiro", "tamano": "Grande", "pesoMin": 20, "pesoMax": 40, "pesoMedio": 30},
  {"nombre": "Gran Boyero Suizo", "tamano": "Gigante", "pesoMin": 38.5, "pesoMax": 64, "pesoMedio": 51.2},
  {"nombre": "Boyero de Appenzell", "tamano": "Grande", "pesoMin": 22, "pesoMax": 32, "pesoMedio": 27},
  {"nombre": "Boyero de Entlebuch", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 30, "pesoMedio": 25},
  {"nombre": "Pinscher Austríaco", "tamano": "Mediano", "pesoMin": 12, "pesoMax": 18, "pesoMedio": 15},
  {"nombre": "Continental Bulldog", "tamano": "Mediano", "pesoMin": 22, "pesoMax": 30, "pesoMedio": 26},
  {"nombre": "Kerry Blue Terrier", "tamano": "Mediano", "pesoMin": 15, "pesoMax": 18, "pesoMedio": 16.5},
  {"nombre": "Terrier Galés", "tamano": "Pequeño", "pesoMin": 9, "pesoMax": 10, "pesoMedio": 9.5},
  {"nombre": "Terrier Irlandés", "tamano": "Pequeño", "pesoMin": 11, "pesoMax": 12, "pesoMedio": 11.5},
  {"nombre": "Lakeland Terrier", "tamano": "Pequeño", "pesoMin": 7, "pesoMax": 8, "pesoMedio": 7.5},
  {"nombre": "Irish Soft Coated Wheaten Terrier", "tamano": "Mediano", "pesoMin": 16, "pesoMax": 20.5, "pesoMedio": 18.2},
  {"nombre": "Glen of Imaal Terrier", "tamano": "Pequeño", "pesoMin": 14, "pesoMax": 16, "pesoMedio": 15},
  {"nombre": "Dandie Dinmont Terrier", "tamano": "Pequeño", "pesoMin": 8, "pesoMax": 11, "pesoMedio": 9.5},
  {"nombre": "Cesky Terrier", "tamano": "Mini", "pesoMin": 6, "pesoMax": 10, "pesoMedio": 8},
  {"nombre": "Terrier de Caza Alemán (Jagdterrier)", "tamano": "Pequeño", "pesoMin": 7.5, "pesoMax": 10, "pesoMedio": 8.8},
  {"nombre": "Terrier Australiano", "tamano": "Mini", "pesoMin": 5, "pesoMax": 7, "pesoMedio": 6},
  {"nombre": "Bull Terrier Miniatura", "tamano": "Pequeño", "pesoMin": 5, "pesoMax": 18, "pesoMedio": 11.5},
  {"nombre": "American Pit Bull Terrier", "tamano": "Mediano", "pesoMin": 14, "pesoMax": 27, "pesoMedio": 20.5},
  {"nombre": "Manchester Terrier", "tamano": "Pequeño", "pesoMin": 5, "pesoMax": 10, "pesoMedio": 7.5},
  {"nombre": "Terrier Japonés", "tamano": "Mini", "pesoMin": 4, "pesoMax": 6, "pesoMedio": 5},
  {"nombre": "Eurasier", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 32, "pesoMedio": 25},
  {"nombre": "Perro Cazador de Alces Noruego", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 27, "pesoMedio": 23.5},
  {"nombre": "Spitz Finlandés", "tamano": "Pequeño", "pesoMin": 7, "pesoMax": 13, "pesoMedio": 10},
  {"nombre": "Buhund Noruego", "tamano": "Pequeño", "pesoMin": 12, "pesoMax": 18, "pesoMedio": 15},
  {"nombre": "Vallhund Sueco", "tamano": "Pequeño", "pesoMin": 11.5, "pesoMax": 16, "pesoMedio": 13.8},
  {"nombre": "Perro Finlandés de Laponia", "tamano": "Mediano", "pesoMin": 15, "pesoMax": 24, "pesoMedio": 19.5},
  {"nombre": "Spitz Japonés", "tamano": "Mini", "pesoMin": 5, "pesoMax": 10, "pesoMedio": 7.5},
  {"nombre": "Spitz Alemán Grande", "tamano": "Pequeño", "pesoMin": 17, "pesoMax": 20, "pesoMedio": 18.5},
  {"nombre": "Spitz Alemán Pequeño", "tamano": "Mini", "pesoMin": 5, "pesoMax": 10, "pesoMedio": 7.5},
  {"nombre": "Shikoku", "tamano": "Mediano", "pesoMin": 16, "pesoMax": 25, "pesoMedio": 20.5},
  {"nombre": "Kai Ken", "tamano": "Mediano", "pesoMin": 11, "pesoMax": 25, "pesoMedio": 18},
  {"nombre": "Kishu Ken", "tamano": "Mediano", "pesoMin": 13, "pesoMax": 27, "pesoMedio": 20},
  {"nombre": "Hokkaido", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 30, "pesoMedio": 25},
  {"nombre": "Jindo Coreano", "tamano": "Mediano", "pesoMin": 15, "pesoMax": 23, "pesoMedio": 19},
  {"nombre": "Thai Ridgeback", "tamano": "Mediano", "pesoMin": 23, "pesoMax": 34, "pesoMedio": 28.5},
  {"nombre": "Faraón (Pharaoh Hound)", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 27, "pesoMedio": 22.5},
  {"nombre": "Perro de Canaan", "tamano": "Mediano", "pesoMin": 15, "pesoMax": 25, "pesoMedio": 20},
  {"nombre": "Cirneco del Etna", "tamano": "Pequeño", "pesoMin": 8, "pesoMax": 12, "pesoMedio": 10},
  {"nombre": "Podenco Canario", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 25, "pesoMedio": 22.5},
  {"nombre": "Xoloitzcuintle Estándar", "tamano": "Mediano", "pesoMin": 14, "pesoMax": 25, "pesoMedio": 19.5},
  {"nombre": "Sabueso de San Huberto (Bloodhound)", "tamano": "Grande", "pesoMin": 36, "pesoMax": 50, "pesoMedio": 43},
  {"nombre": "Foxhound Inglés", "tamano": "Grande", "pesoMin": 30, "pesoMax": 34, "pesoMedio": 32},
  {"nombre": "Foxhound Americano", "tamano": "Grande", "pesoMin": 29, "pesoMax": 34, "pesoMedio": 31.5},
  {"nombre": "Coonhound Negro y Fuego", "tamano": "Grande", "pesoMin": 25, "pesoMax": 36, "pesoMedio": 30.5},
  {"nombre": "Harrier", "tamano": "Mediano", "pesoMin": 22, "pesoMax": 27, "pesoMedio": 24.5},
  {"nombre": "Otterhound", "tamano": "Grande", "pesoMin": 30, "pesoMax": 52, "pesoMedio": 41},
  {"nombre": "Gran Basset Grifón Vendeano", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 20, "pesoMedio": 19},
  {"nombre": "Pequeño Basset Grifón Vendeano", "tamano": "Pequeño", "pesoMin": 11, "pesoMax": 20, "pesoMedio": 15.5},
  {"nombre": "Sabueso Español", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 25, "pesoMedio": 22.5},
  {"nombre": "Basset Azul de Gascuña", "tamano": "Mediano", "pesoMin": 16, "pesoMax": 20, "pesoMedio": 18},
  {"nombre": "Basset Artesiano de Normandía", "tamano": "Mediano", "pesoMin": 15, "pesoMax": 20, "pesoMedio": 17.5},
  {"nombre": "Braco Italiano", "tamano": "Grande", "pesoMin": 25, "pesoMax": 40, "pesoMedio": 32.5},
  {"nombre": "Spinone Italiano", "tamano": "Grande", "pesoMin": 28, "pesoMax": 39, "pesoMedio": 33.5},
  {"nombre": "Braco Alemán de Pelo Duro", "tamano": "Grande", "pesoMin": 20, "pesoMax": 32, "pesoMedio": 26},
  {"nombre": "Grifón Korthals (de Pelo Duro)", "tamano": "Mediano", "pesoMin": 16, "pesoMax": 32, "pesoMedio": 24},
  {"nombre": "Perdiguero de Burgos", "tamano": "Grande", "pesoMin": 25, "pesoMax": 30, "pesoMedio": 27.5},
  {"nombre": "Perdiguero Portugués", "tamano": "Mediano", "pesoMin": 16, "pesoMax": 27, "pesoMedio": 21.5},
  {"nombre": "Braco Húngaro de Pelo Duro", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 30, "pesoMedio": 25},
  {"nombre": "Gran Münsterländer", "tamano": "Grande", "pesoMin": 25, "pesoMax": 32, "pesoMedio": 28.5},
  {"nombre": "Pequeño Münsterländer", "tamano": "Mediano", "pesoMin": 17, "pesoMax": 26, "pesoMedio": 21.5},
  {"nombre": "Stabyhoun", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 27, "pesoMedio": 22.5},
  {"nombre": "Pudelpointer", "tamano": "Grande", "pesoMin": 25, "pesoMax": 31, "pesoMedio": 28},
  {"nombre": "Setter Irlandés Rojo y Blanco", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 32, "pesoMedio": 25},
  {"nombre": "Clumber Spaniel", "tamano": "Grande", "pesoMin": 25, "pesoMax": 39, "pesoMedio": 32},
  {"nombre": "Sussex Spaniel", "tamano": "Mediano", "pesoMin": 20, "pesoMax": 23, "pesoMedio": 21.5},
  {"nombre": "Welsh Springer Spaniel", "tamano": "Mediano", "pesoMin": 16, "pesoMax": 25, "pesoMedio": 20.5},
  {"nombre": "Field Spaniel", "tamano": "Mediano", "pesoMin": 18, "pesoMax": 25, "pesoMedio": 21.5},
  {"nombre": "Retriever de Nueva Escocia", "tamano": "Mediano", "pesoMin": 17, "pesoMax": 23, "pesoMedio": 20},
  {"nombre": "Retriever de Pelo Rizado", "tamano": "Grande", "pesoMin": 32, "pesoMax": 45, "pesoMedio": 38.5},
  {"nombre": "Kooikerhondje", "tamano": "Pequeño", "pesoMin": 9, "pesoMax": 11, "pesoMedio": 10},
  {"nombre": "Lagotto Romagnolo", "tamano": "Pequeño", "pesoMin": 11, "pesoMax": 16, "pesoMedio": 13.5},
  {"nombre": "Perro de Agua Americano", "tamano": "Pequeño", "pesoMin": 11, "pesoMax": 20, "pesoMedio": 15.5},
  {"nombre": "Caniche Grande", "tamano": "Grande", "pesoMin": 20, "pesoMax": 32, "pesoMedio": 26},
  {"nombre": "Bichón Boloñés", "tamano": "Toy", "pesoMin": 2.5, "pesoMax": 4, "pesoMedio": 3.2},
  {"nombre": "Löwchen (Pequeño Perro León)", "tamano": "Mini", "pesoMin": 4, "pesoMax": 8, "pesoMedio": 6},
  {"nombre": "Petit Brabançon", "tamano": "Toy", "pesoMin": 3.5, "pesoMax": 6, "pesoMedio": 4.8},
  {"nombre": "Grifón Belga", "tamano": "Toy", "pesoMin": 3.5, "pesoMax": 6, "pesoMedio": 4.8},
  {"nombre": "King Charles Spaniel", "tamano": "Toy", "pesoMin": 3.6, "pesoMax": 6.4, "pesoMedio": 5},
  {"nombre": "Chin Japonés", "tamano": "Toy", "pesoMin": 1.8, "pesoMax": 3.5, "pesoMedio": 2.6},
  {"nombre": "Spaniel Tibetano", "tamano": "Mini", "pesoMin": 4, "pesoMax": 7, "pesoMedio": 5.5},
  {"nombre": "Kromfohrländer", "tamano": "Pequeño", "pesoMin": 9, "pesoMax": 16, "pesoMedio": 12.5},
];
