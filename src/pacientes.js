// ─── PACIENTES Y PERROS PROPIOS ──────────────────────────────────────────────
//
// Lógica pura, sin React y sin red, como `der.js` y `rol.js`.
//
// EL PROBLEMA QUE RESUELVE. Un veterinario tiene en su cuenta dos cosas
// distintas: sus PACIENTES y, si tiene perro, SU PERRO. Las dos filas de
// `perros` llevan `user_id` = él, así que esa columna no las distingue.
//
// Lo que las distingue es la tabla `accesos`: un paciente tiene fila ahí y
// su perro no. Parece redundante -- la ficha del paciente ya es suya -- y es
// justo lo que hace que el interruptor de modo funcione: sin esto, en modo
// profesional le sale su propio perro entre los pacientes, y en modo tutor
// le salen sus pacientes entre sus perros.
//
// ⚠️ HAY QUE DISTINGUIR DOS COSAS QUE PARECEN LA MISMA, y confundirlas
// cuesta caro (medido: al confundirlas, un veterinario en su modo se
// quedaba sin NINGÚN perro en pantalla):
//
//   `null`  — no se han podido leer los accesos. La tabla no existe todavía,
//             o Supabase falló. No sabemos repartir, así que NO SE REPARTE:
//             se enseñan todos los perros. Es el lado seguro del error --
//             la app se comporta como antes de que existiera nada de esto,
//             en vez de esconderle a alguien sus perros.
//   `[]`    — se han leído bien y no hay ninguno. Eso SÍ es información: es
//             un veterinario que todavía no ha dado de alta a nadie, y su
//             lista de pacientes tiene que salir vacía de verdad.

// Los ids de perro que son PACIENTE de esta cuenta. Se pasa la lista cruda
// de `accesos` tal como la devuelve Supabase.
export function idsDePacientes(accesos) {
  const ids = new Set()
  for (const a of accesos || []) {
    if (!a || !a.perro_id) continue
    // Un acceso revocado ya no es un paciente activo. No se borra la fila
    // -- quién tuvo acceso y hasta cuándo hace falta -- pero deja de contar.
    if (a.estado && a.estado !== 'activo') continue
    ids.add(String(a.perro_id))
  }
  return ids
}

// Parte la lista de perros en las dos. Devuelve SIEMPRE las dos claves, aunque
// alguna vaya vacía: quien lo use no tiene que comprobar si existen.
export function repartirPerros(perros, accesos) {
  const pacientes = idsDePacientes(accesos)
  const mios = []
  const susPacientes = []
  for (const p of perros || []) {
    if (!p) continue
    ;(pacientes.has(String(p.id)) ? susPacientes : mios).push(p)
  }
  return { mios, pacientes: susPacientes }
}

// Qué lista toca enseñar según el modo. Está aquí y no en la pantalla para
// que la regla viva en un solo sitio: el día que la fase 3 añada perros que
// NO son suyos, se cambia aquí y lo ven todas las pantallas a la vez.
export function perrosDelModo(perros, accesos, enModoProfesional) {
  // No se pudieron leer: no se reparte nada. Ver el aviso de arriba.
  if (accesos === null || accesos === undefined) return perros || []
  const { mios, pacientes } = repartirPerros(perros, accesos)
  return enModoProfesional ? pacientes : mios
}
