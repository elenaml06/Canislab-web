// SEPARAR LOS PACIENTES DEL PERRO PROPIO — la regla de la que cuelga el
// interruptor de modo.
//
// ⚠️ POR QUÉ EXISTE. Un veterinario tiene en su cuenta sus pacientes y, si
// tiene perro, su perro. Las dos filas llevan `user_id` = él, así que esa
// columna NO los distingue. Lo que los distingue es tener fila en `accesos`.
//
// Si esto se rompe no da ningún error: simplemente le sale su perro entre
// los pacientes, o sus pacientes entre sus perros. Se ve, pero solo si te
// fijas -- y es la clase de cosa que un veterinario no perdona.
import { test, expect } from "@playwright/test";
import { idsDePacientes, repartirPerros, perrosDelModo } from "../src/pacientes.js";

const MI_PERRO = { id: "p-mio", nombre: "Cairo" };
const PACIENTE_1 = { id: "p-1", nombre: "Nala" };
const PACIENTE_2 = { id: "p-2", nombre: "Ruffo" };
const PERROS = [MI_PERRO, PACIENTE_1, PACIENTE_2];
const ACCESOS = [
  { perro_id: "p-1", estado: "activo", origen: "creado_por_el_profesional" },
  { perro_id: "p-2", estado: "activo", origen: "creado_por_el_profesional" },
];

const nombres = (lista) => lista.map((p) => p.nombre);

test("un paciente tiene fila en accesos; el perro propio no", () => {
  const { mios, pacientes } = repartirPerros(PERROS, ACCESOS);
  expect(nombres(mios)).toEqual(["Cairo"]);
  expect(nombres(pacientes)).toEqual(["Nala", "Ruffo"]);
});

test("un acceso revocado deja de ser paciente, pero la fila se queda", () => {
  // No se borra la fila -- quién tuvo acceso y hasta cuándo es justo el dato
  // que hará falta el día que alguien pregunte -- pero deja de contar.
  const revocado = [{ perro_id: "p-1", estado: "revocado" }, ACCESOS[1]];
  const { mios, pacientes } = repartirPerros(PERROS, revocado);
  expect(nombres(pacientes)).toEqual(["Ruffo"]);
  // Y el perro NO desaparece de la app: vuelve al lado del dueño de la ficha.
  expect(nombres(mios)).toEqual(["Cairo", "Nala"]);
});

test("NO PODER LEERLOS y NO TENER NINGUNO son cosas distintas", () => {
  // ⚠️ MEDIDO, y costaba caro confundirlas: tratando las dos como lista
  // vacía, un veterinario en su modo se quedaba SIN NINGÚN PERRO en
  // pantalla en cuanto faltara la migración.
  //
  //   null  = no se han podido leer -> no se reparte, se ven todos.
  //   []    = leídos bien, no hay ninguno -> su lista sale vacía de verdad.
  expect(nombres(perrosDelModo(PERROS, null, true))).toEqual(["Cairo", "Nala", "Ruffo"]);
  expect(nombres(perrosDelModo(PERROS, undefined, true))).toEqual(["Cairo", "Nala", "Ruffo"]);
  expect(nombres(perrosDelModo(PERROS, null, false))).toEqual(["Cairo", "Nala", "Ruffo"]);

  // Leídos y ninguno: en su modo no tiene pacientes, y en modo tutor son
  // todos suyos, que es exactamente la verdad.
  expect(perrosDelModo(PERROS, [], true)).toEqual([]);
  expect(nombres(perrosDelModo(PERROS, [], false))).toEqual(["Cairo", "Nala", "Ruffo"]);
});

test("el modo decide qué lista se enseña", () => {
  expect(nombres(perrosDelModo(PERROS, ACCESOS, true))).toEqual(["Nala", "Ruffo"]);
  expect(nombres(perrosDelModo(PERROS, ACCESOS, false))).toEqual(["Cairo"]);
});

test("aguanta filas rotas sin llevarse por delante la lista", () => {
  // Un acceso sin perro_id, o un hueco en la lista de perros, no puede
  // dejar al veterinario sin pacientes.
  expect(idsDePacientes([{ estado: "activo" }, null, ACCESOS[0]])).toEqual(new Set(["p-1"]));
  const { mios, pacientes } = repartirPerros([MI_PERRO, null, PACIENTE_1], ACCESOS);
  expect(nombres(mios)).toEqual(["Cairo"]);
  expect(nombres(pacientes)).toEqual(["Nala"]);
});

test("los ids se comparan como texto, no por tipo", () => {
  // Supabase devuelve uuid como cadena, pero el Supabase de mentira y algún
  // camino viejo usan números. Si esto se compara por tipo, un paciente
  // aparecería como perro propio y nadie vería un error.
  const { pacientes } = repartirPerros([{ id: 7, nombre: "Siete" }],
                                       [{ perro_id: "7", estado: "activo" }]);
  expect(nombres(pacientes)).toEqual(["Siete"]);
});
