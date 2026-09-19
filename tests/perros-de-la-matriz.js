// ─── LOS PERROS DE LA MATRIZ, EN UN SOLO SITIO ───────────────────────────────
//
// ⚠️ ESTÁN AQUÍ Y NO DENTRO DE UNA PRUEBA porque los usan DOS: la matriz contra
// el motor de verdad con la app local (`todos-los-perros-contra-el-motor-real`)
// y la misma matriz contra **rawku.app desplegado**
// (`rawku-en-produccion`). Copiarlos a la segunda sería la cuarta copia de la
// misma lista en este repo -- la forma de fallo que el CLAUDE.md del motor
// tiene escrita cinco veces -- y además la peor aquí: las dos pruebas seguirían
// en verde recorriendo perros distintos sin que se note.
import { PERRO_DE_PRUEBA } from "./fake-supabase.js";

const PERROS = [
  // nombre                       etapa                  peso  raza                      tamano     nacimiento     premios
  ["adulto mediano",              "adulto",              24.5, "Pastor Alemán",          "Grande",  "2021-05-14",  null],
  ["adulto toy",                  "adulto",               1.8, "Chihuahua",              "Toy",     "2021-05-14",  null],
  ["adulto gigante",              "adulto",              62.0, "Mastín Español",         "Gigante", "2021-05-14",  null],
  ["senior",                      "adulto",              24.5, "Pastor Alemán",          "Grande",  "2015-05-14",  null],
  ["cachorro joven",              "cachorro_joven",       4.0, "Pastor Alemán",          "Grande",  null,          null],
  ["cachorro crecimiento",        "cachorro_crecimiento", 12.0, "Pastor Alemán",         "Grande",  null,          null],
  ["gestante",                    "gestante_tardia",     22.0, "Pastor Alemán",          "Grande",  "2021-05-14",  null],
  ["lactante",                    "lactante",            22.0, "Pastor Alemán",          "Grande",  "2021-05-14",  null],
  // EL CASO DE CAIRO, con los cuatro niveles de premios
  ["Cairo sin premios",           "cachorro_crecimiento", 20.0, "American Staffordshire Terrier", "Mediano", null, "ninguno"],
  ["Cairo pocos premios",         "cachorro_crecimiento", 20.0, "American Staffordshire Terrier", "Mediano", null, "alguno"],
  ["Cairo premios al máximo",     "cachorro_crecimiento", 20.0, "American Staffordshire Terrier", "Mediano", null, "hasta_el_maximo"],
  ["Cairo más del máximo",        "cachorro_crecimiento", 20.0, "American Staffordshire Terrier", "Mediano", null, "mas_del_maximo"],
  // y el adulto con premios, que es la otra mitad de la regla 3-bis
  ["adulto con premios",          "adulto",              24.5, "Pastor Alemán",          "Grande",  "2021-05-14",  "mas_del_maximo"],
  ["toy con premios",             "adulto",               1.8, "Chihuahua",              "Toy",     "2021-05-14",  "hastaـel_maximo".replace("ـ", "_")],
];


function fichaDe([nombre, etapa, peso, raza, tamano, nacimiento, premios], patologias = []) {
  return {
    ...PERRO_DE_PRUEBA,
    nombre,
    peso_actual: peso,
    etapa,
    tamano,
    raza,
    // Sin fecha, la app calcula la etapa desde `etapa`. Con ella, desde la edad
    // -- que es lo que hace la app de verdad, así que se manda cuando la hay.
    fecha_nacimiento: nacimiento,
    premios_nivel: premios,
    patologia_si: patologias.length ? "si" : "no",
    patologias,
    dieta_actual: "barf",
  };
}


export { PERROS, fichaDe };
