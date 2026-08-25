// ─── CÓMO SE PREPARA CADA COSA ────────────────────────────────────────────────
//
// ⚠️ SACADO DE App.jsx (23 agosto) para poder COMPROBARLO ENTERO.
//
// Estos textos vivían dentro de App.jsx, y la única forma de probarlos era
// abrir en pantalla el panel de cada alimento. Eso sólo alcanza a los
// alimentos que le toque traer al menú de ese momento: al quitar los tiempos
// de congelación de las ocho categorías, la prueba dio verde igual cuando se
// volvió a meter uno a mano en "Carne muscular", porque ese menú de prueba no
// llevaba carne. Un punto ciego, y encima en la parte de seguridad.
//
// Aquí son datos importables, así que tests/menu-dos-pestanas.spec.js los
// recorre TODOS -- las 8 categorías y los 77 alimentos -- sin depender de qué
// haya salido en el menú.
//
// DÓNDE VA CADA COSA
// Los tiempos de congelación (1 semana, 2 el pescado, 3 días una vez
// descongelado) van en UN solo sitio: el panel de «Congelación» de la pestaña
// «Cómo darlo». Aquí no se repiten. Estaban en las ocho categorías con
// palabras distintas cada una: ocho sitios donde equivocarse y ocho donde
// contradecirse. Lo que sí se queda aquí es lo que es de ESE alimento — que
// el hueso crudo nunca se cocina, que el pescado crudo sólo vale si se ha
// congelado, que el cuello de pollo se puede dar semicongelado a un tragón.

export const INSTRUCCIONES_POR_CATEGORIA = {
  "Carne muscular": "Cruda. En trozos, no picada — picada tiene más riesgo bacteriano.",
  "Vísceras": "Crudas, en trozos pequeños.",
  "Hígado": "Crudo, en trozos pequeños — se da en poca cantidad, no hace falta trocear más de la cuenta.",
  "Verduras y frutas": "Cada una necesita algo distinto (triturar, cocer, quitar semillas...) — mira la indicación de este alimento en concreto, más abajo.",
  "Extras": "Aceites, semillas y huevo se añaden CRUDOS al final y nunca se cocinan — algunos, como el aceite de girasol o de linaza, pierden sus propiedades con el calor. Cada alimento de esta categoría tiene además su propia indicación aquí abajo.",
  "Hueso carnoso": "Crudo SIEMPRE, nunca cocinado — cocinado se astilla y es peligroso. Entero o en trozos grandes, nunca troceado pequeño: el perro tiene que roerlo, no tragarlo. Que coma tranquilo y supervisado, sobre todo las primeras veces. Espera a las 14 semanas para los huesos más duros, y ve variando el tipo entre menús.",
  "Pescados y mariscos": "Crudo SOLO si se ha congelado antes; si no, cocinado. Los mariscos, SIEMPRE cocinados. Solo si se convierte en la proteína principal DE FORMA REPETIDA: el pescado crudo lleva una enzima que va destruyendo la Vitamina B1 poco a poco — con un uso normal, variando entre proteínas, no supone ningún problema. Si usas atún u otro pescado grande, no más de 1 vez por semana — acumulan más mercurio que la sardina, la caballa o el boquerón.",
  "Suplementos comerciales": "Los gramos que te damos aquí YA están calculados respetando el límite máximo seguro del fabricante para el peso de tu perro — no hace falta que sigas la dosis del envase por tu cuenta, dale la cantidad que te mostramos. Se añaden al final, junto con los extras.",
};

export const COMO_DAR_ALIMENTO = {
  // ⚠️ AÑADIDO (5 agosto, madrugada) — CASO REAL, pedido expreso: se
  // vende en comprimidos, no a granel -- pesoComprimido (0.25 g, según
  // la ficha del fabricante) permite convertir los gramos reales del
  // menú a "cuántos comprimidos" en vez de un peso que nadie puede
  // pesar en casa. esComprimido activa esa conversión especial en el
  // punto donde se muestra (ver formatearComprimidos).
  "Yoduro potásico (comprimidos 200 µg)": { pieza: "un comprimido pesa unos 0,25 g", como: "Se puede partir o disolver en agua para dosis más pequeñas.", esComprimido: true, pesoComprimido: 0.25 },
  "Aceite de girasol": { pieza: "una cucharadita rasa son unos 5 g", como: "Crudo, añadido por encima justo antes de servir. Nunca lo calientes: pierde la vitamina E, que es justo para lo que está. Guárdalo cerrado y lejos de la luz." },
  "Aceite de oliva": { pieza: "una cucharadita rasa son unos 5 g", como: "Crudo, por encima al servir. No lo calientes." },
  "Aceite de oliva virgen extra": { pieza: "una cucharadita rasa son unos 5 g", como: "Crudo, por encima al servir. No lo calientes." },
  "Aceite de linaza": { pieza: "una cucharadita rasa son unos 5 g", como: "Crudo y muy fresco: se oxida rápido. Guárdalo en la nevera y gástalo en pocas semanas." },
  "Huevo de gallina entero": { pieza: "un huevo M pesa unos 55 g sin cáscara", como: "Mejor cocido que crudo, sobre todo en cachorros, por el riesgo de salmonela. Cocido puede darse entero, troceado sobre la comida." },
  "Huevo de codorniz": { pieza: "un huevo pesa unos 10 g", como: "Cocido. Por su tamaño, son fáciles de dosificar en perros pequeños." },
  "Huevo clara": { pieza: "la clara de un huevo M son unos 35 g", como: "SIEMPRE cocida. La clara cruda lleva avidina, que bloquea la absorción de biotina si se da con frecuencia." },
  "Huevo yema": { pieza: "una yema pesa unos 18 g", como: "Puede darse cruda si el huevo es fresco y de confianza. Es la parte más nutritiva del huevo." },
  "Semilla de lino": { pieza: "una cucharadita son unos 4 g", como: "SIEMPRE molida justo antes de dar. Entera pasa de largo sin digerirse y no aporta nada." },
  "Pipa de calabaza": { pieza: "una cucharadita son unos 5 g", como: "Molidas o muy trituradas, si no pasan enteras." },
  "Pipa de girasol": { pieza: "una cucharadita son unos 5 g", como: "Peladas y molidas." },
  "Semilla de sésamo": { pieza: "una cucharadita son unos 4 g", como: "Molido, si no pasa entero sin digerir." },
  "Yogur griego": { pieza: "una cucharada son unos 20 g", como: "Natural y sin azúcar ni edulcorantes. Empieza con poca cantidad: no todos los perros digieren bien la lactosa." },
  "Cuello de pollo": { pieza: "un cuello entero pesa unos 35-50 g", como: "Entero, sin trocear. Es de los más blandos: buen hueso para empezar. En perros muy tragones, dáselo semicongelado para que tenga que roerlo en vez de tragárselo de golpe." },
  "Carcasa de pollo": { pieza: "incluye el espinazo — en España se compran como la misma pieza, no se venden por separado. Media carcasa son unos 150-200 g", como: "Partida por la mitad o en cuartos según el tamaño del perro. Lleva poca carne, así que suele ir acompañada de carne aparte." },
  "Ala de pollo": { pieza: "un ala entera pesa unos 90-100 g", como: "Entera, con la punta. Es el hueso más graso de los de pollo, ojo si el perro tiende a engordar." },
  "Cuello de pavo": { pieza: "un cuello entero pesa 300-500 g", como: "Casi siempre hay que partirlo: un tercio o medio cuello por toma según el perro. Es duro, mejor a partir de los 6 meses." },
  "Ala de pavo": { pieza: "un ala entera pesa 200-300 g", como: "Suele darse partida por la articulación. Bastante dura, no es un hueso para principiantes." },
  "Carcasa de pavo": { pieza: "una carcasa entera pesa 400-700 g", como: "Partida en trozos grandes. Igual que la de pollo, lleva poca carne." },
  "Cuello de pato": { pieza: "un cuello entero pesa 60-100 g", como: "Entero. Es más blando que el de pavo y muy bien aceptado." },
  "Codorniz entera": { pieza: "una codorniz entera pesa 130-180 g", como: "Entera, es presa completa. Ideal para perros medianos; en pequeños, partida por la mitad." },
  "Carcasa de conejo": { pieza: "media carcasa son unos 200-300 g", como: "En trozos grandes. Los huesos de conejo son finos y quebradizos: dáselos siempre crudos y vigila que roa, no que trague." },
  "Cabeza de conejo": { pieza: "una cabeza pesa 80-120 g", como: "Entera. Muy completa y muy entretenida para el perro, aunque impresione al principio." },
  "Patas de conejo": { pieza: "una pata pesa 40-70 g", como: "Enteras. Pequeñas y manejables, buenas para perros de tamaño mediano." },
  "Costillas de cordero": { pieza: "una costilla pesa 60-90 g", como: "De una en una, sin trocear. Es un hueso graso: no abuses si el perro tiene tendencia a la pancreatitis." },
  "Cuello de cordero": { pieza: "un cuello entero pesa 300-500 g", como: "Partido en rodajas por el carnicero. Ojo: el cuello puede llevar restos de tejido tiroideo, así que no lo repitas en todos los menús." },
  "Espinazo de cordero": { pieza: "un trozo de espinazo pesa 150-250 g", como: "En trozos grandes, tal como lo corte el carnicero. Bastante duro." },
  "Costillas de ternera": { pieza: "una costilla pesa 200-400 g", como: "De una en una. Son huesos grandes y duros: para perros con experiencia, y siempre supervisado. Si el perro es de morder fuerte, retíralo cuando quede solo el hueso pelado." },
  "Pecho de ternera con hueso": { pieza: "un trozo pesa 300-600 g", como: "En trozos grandes, que el perro tenga que trabajarlo. Es de los más ricos en calcio, por eso suele salir en cantidades pequeñas." },
  "Rabo de toro": { pieza: "una pieza de rabo pesa 150-250 g", como: "Por vértebras, tal como viene cortado. Duro pero muy carnoso, gusta mucho." },

  // ⚠️ AÑADIDO (5 agosto, madrugada) — CASO REAL, pedido expreso: antes
  // TODA la categoría "Verduras y frutas" mostraba el mismo texto
  // genérico ("trituradas o muy cocidas... si hay manzana quitar
  // semillas"), aunque solo la manzana tenga semillas, y no todas
  // necesitan lo mismo. Cada una de las 46 verduras/frutas reales del
  // catálogo tiene aquí su propio aviso, solo con lo que a ESE
  // alimento en concreto le aplica de verdad.
  "Acelga": { como: "Muy troceada o cocida al vapor, nunca cruda entera — el perro no digiere bien la fibra vegetal cruda." },
  "Albahaca": { como: "Picada fina, en poca cantidad — se usa más como aromática que como verdura de base." },
  "Albaricoque": { pieza: "quita SIEMPRE el hueso entero", como: "Solo la pulpe madura, troceada. El hueso contiene amigdalina (libera cianuro) y además es un riesgo real de atragantamiento — nunca se lo des con el hueso." },
  "Alcachofa": { como: "Cocida, solo el corazón (la parte tierna) — las hojas duras no se digieren." },
  "Apio": { como: "Muy troceado o cocido — las fibras largas del tallo pueden costarle de tragar y digerir enteras." },
  "Arándano": { como: "Enteros o chafados, crudos — son pequeños y blandos, no hace falta cocerlos." },
  "Berenjena": { como: "SIEMPRE cocida, nunca cruda — cruda puede irritar el estómago por la solanina de la piel." },
  "Boniato": { como: "Cocido y en puré o troceado — crudo es duro y casi no se digiere. Pélalo si lo das cocido en trozos grandes." },
  "Borraja": { como: "No se recomienda dar en ninguna cantidad ni forma — contiene alcaloides tóxicos para el hígado (ver aviso de seguridad)." },
  "Brócoli": { como: "Cocido al vapor o muy troceado — crudo puede costarle de digerir y dar gases en cantidad." },
  "Calabacín": { como: "Cocido o muy rallado, con piel — es blando y se digiere bien así." },
  "Calabaza": { como: "Cocida y en puré — cruda es dura y casi no se digiere." },
  "Canónigos": { como: "Muy picados o triturados — son hojas finas, pero igualmente crudas cuesta digerirlas enteras." },
  "Cardo": { como: "Cocido — crudo es fibroso y duro de digerir." },
  "Champiñón": { como: "SOLO champiñón de cultivo comercial (nunca silvestre, por riesgo real de intoxicación). Cocido, troceado." },
  "Coco fresco": { pieza: "solo la pulpe blanca, nunca la cáscara ni el agua en exceso", como: "Pulpa fresca rallada o en trozos pequeños, cruda — en poca cantidad, es muy grasa." },
  "Col lombarda": { como: "Cocida o muy troceada — cruda en cantidad puede dar gases." },
  "Col rizada": { como: "Cocida o muy troceada — cruda en cantidad puede dar gases." },
  "Coles de Bruselas": { como: "Cocidas — crudas y en cantidad son de las que más gases dan." },
  "Coliflor": { como: "Cocida — cruda en cantidad puede dar gases." },
  "Dátil": { pieza: "quita SIEMPRE el hueso entero", como: "Solo la pulpe, troceada, en poca cantidad (es muy azucarado). El hueso es duro y alargado — riesgo real de atragantamiento u obstrucción." },
  "Endibia": { como: "Troceada, cruda — es una hoja tierna, se digiere razonablemente bien así." },
  "Espinaca": { como: "Cocida al vapor o muy troceada — cruda en cantidad puede interferir con la absorción de algunos minerales." },
  "Espárrago verde": { como: "Cocido y troceado — crudo es fibroso." },
  "Frambuesa": { como: "Enteras o chafadas, crudas — son pequeñas y blandas." },
  "Fresa": { como: "Troceada, cruda — quita el rabito verde." },
  "Grelo": { como: "Cocido — crudo en cantidad puede dar gases, y en hipotiroidismo hay que vigilar la cantidad (ver aviso de seguridad)." },
  "Judía verde": { como: "Cocida — cruda es dura y fibrosa." },
  "Lechuga": { como: "Troceada, cruda — aporta poco, pero no hay problema en darla así." },
  "Mandarina": { pieza: "quita las pepitas si tiene", como: "Solo la pulpe, sin piel ni pepitas — en trozos pequeños, cruda." },
  "Mango": { pieza: "quita SIEMPRE el hueso entero", como: "Solo la pulpe madura, sin piel, troceada. El hueso es grande y duro — riesgo real de atragantamiento u obstrucción." },
  "Manzana": { pieza: "quita SIEMPRE las semillas y el corazón", como: "Troceada, cruda, sin piel si el perro tiene el estómago sensible. Las semillas y el corazón contienen una pequeña cantidad de cianuro." },
  "Melón": { pieza: "sin piel ni pepitas", como: "Pulpa troceada, cruda — la piel es dura y no se digiere." },
  "Nabo pelado": { como: "Cocido y troceado — crudo es duro, y en hipotiroidismo hay que vigilar la cantidad (ver aviso de seguridad)." },
  "Naranja": { pieza: "quita las pepitas si tiene", como: "Solo la pulpe, sin piel ni pepitas — en trozos pequeños, cruda." },
  "Pepino": { como: "Troceado, crudo, con piel — se digiere bien así, no hace falta cocerlo." },
  "Pera": { pieza: "quita SIEMPRE las semillas y el corazón", como: "Troceada, cruda. Las semillas y el corazón contienen una pequeña cantidad de cianuro, igual que en la manzana." },
  "Pimiento rojo": { pieza: "quita siempre las semillas y el tallo", como: "Solo maduro (rojo, nunca verde), sin semillas, cocido o muy troceado." },
  "Piña": { pieza: "sin piel ni corazón duro", como: "Pulpa troceada, cruda, en poca cantidad — la piel es dura y no se digiere." },
  "Plátano": { como: "Troceado o chafado, crudo, sin piel — en poca cantidad, es azucarado." },
  "Repollo": { como: "Cocido o muy troceado — crudo en cantidad puede dar gases." },
  "Rucula": { como: "Troceada, cruda — es una hoja tierna, se digiere razonablemente bien así." },
  "Rábano": { como: "Troceado o rallado, crudo, en poca cantidad — tiene sabor fuerte, no a todos los perros les gusta." },
  "Sandía": { pieza: "sin pepitas ni piel", como: "Pulpa troceada, cruda — quita la piel dura y las pepitas grandes si las tiene." },
  "Tomate (puré)": { como: "SOLO maduro (nunca verde ni la planta) — el tomate verde contiene solanina, tóxica. Ya viene en puré, se añade directamente." },
  "Zanahoria": { como: "Rallada o muy troceada, cruda — con piel, bien lavada." },
};
