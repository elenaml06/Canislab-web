// ─── El catálogo, en orden alfabético ────────────────────────────────────────
//
// POR QUÉ EXISTE (13 de septiembre de 2026, noche). Elena, en Personalizar:
//
//     «Y han desaparecido cosas del catalogo... No te se decir todas pero por
//      ejemplo la zanahoria no esta»
//
// y un minuto después:
//
//     «Ah calla si está, solo q no esta por orden alfabetico»
//
// ⚠️ ESO ES LO QUE HACE QUE ESTO MEREZCA UNA PRUEBA. El fallo NO dejaba nada
// fuera, y aun así hizo exactamente el mismo daño que dejarlo fuera: quien lo
// vio dio por hecho que el alimento ya no estaba. Un alimento que no se
// encuentra es un alimento que no se elige, y eso no lo caza ninguna prueba de
// las que comparan el catálogo de la app con el del motor -- las dos listas
// tenían los mismos alimentos, que es justo lo que esas pruebas miran.
//
// Los grupos salían en el orden en que aparecen en el catálogo del motor: en
// «Verduras y frutas», Calabaza · Calabacín · Zanahoria · Judía · Brócoli.
//
// Se prueba la MISMA función que pinta (`arbolOrdenado` de `texto.js`), no una
// copia suya: el motor ya sirve sus grupos ordenados desde hoy, pero el
// RESPALDO --la lista que se ve cuando Render duerme-- no pasa por el motor, y
// es justo donde una lista escrita a mano se desordena en cuanto alguien añade
// una línea al final.
import { test, expect } from "@playwright/test";
import { arbolOrdenado, ordenAlfabetico } from "../src/texto.js";

test.describe("el catálogo se pinta en orden alfabético", () => {
  test("los grupos y los alimentos de dentro, los dos", () => {
    const desordenado = {
      "Verduras y frutas": {
        Calabaza: ["Calabaza"],
        Zanahoria: ["Zanahoria"],
        Brócoli: ["Brócoli"],
        Acelga: ["Acelga"],
      },
      "Carne muscular": {
        Pollo: ["Pollo pechuga sin piel", "Corazón de pollo", "Pollo muslo con piel"],
      },
    };
    const ordenado = arbolOrdenado(desordenado);
    expect(Object.keys(ordenado["Verduras y frutas"]),
      "los grupos siguen saliendo en el orden del catálogo, que no es ningún orden")
      .toEqual(["Acelga", "Brócoli", "Calabaza", "Zanahoria"]);
    expect(ordenado["Carne muscular"].Pollo,
      "los alimentos de dentro de un grupo no se ordenan")
      .toEqual(["Corazón de pollo", "Pollo muslo con piel", "Pollo pechuga sin piel"]);
  });

  test("y las tildes y la eñe van donde una persona las busca", () => {
    // ⚠️ ESTO ES LO QUE FALLA CON UN `sort()` PELADO. Ordenando por código de
    // carácter, todo lo que lleva tilde se va DETRÁS de la Z -- «Ñ» incluida --,
    // así que «Riñón» acabaría después de «Zanahoria» y «Ácido» después de
    // «Yogur». Es el mismo fallo otra vez: no falta nada y no se encuentra.
    const nombres = ["Zanahoria", "Ñora", "Ácido fólico", "Acelga", "Brócoli", "Nabo"];
    expect([...nombres].sort(ordenAlfabetico)).toEqual(
      ["Acelga", "Ácido fólico", "Brócoli", "Nabo", "Ñora", "Zanahoria"]);
    // Y la prueba de que no es un `sort()` normal disfrazado:
    expect([...nombres].sort()).not.toEqual([...nombres].sort(ordenAlfabetico));
  });

  test("un árbol vacío o a medias no revienta la pantalla", () => {
    // El respaldo puede llegar a medias si alguien toca la constante, y una
    // pantalla en blanco por un orden sería peor que el desorden.
    expect(arbolOrdenado(null)).toEqual({});
    expect(arbolOrdenado({ "Carne muscular": null })).toEqual({ "Carne muscular": {} });
  });
});
