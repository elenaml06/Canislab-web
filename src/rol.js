// ─── QUIÉN ES UN VETERINARIO, Y QUIÉN SOLO LO DICE ──────────────────────────
//
// Lógica pura, sin React y sin red, como `der.js`. Está aparte a propósito:
// es una regla de una línea de la que cuelga todo lo demás de la parte
// profesional, y una regla así tiene que poder probarse sin levantar la app.
//
// LA REGLA. El modo profesional se enciende sólo si se cumplen LAS DOS:
//   · `rol` dice 'profesional'
//   · `rol_verificado_en` tiene fecha
//
// POR QUÉ LAS DOS. Porque cualquiera puede escribir que es veterinario.
// `rol` es lo que la persona PIDE; `rol_verificado_en` es que alguien miró
// su número de colegiado y lo aprobó. Con sólo la primera, el rol no
// acreditaría nada -- y de este rol va a colgar poder pautar por debajo de
// los mínimos de FEDIAF y firmar la pauta con un número de colegiado
// (ver VETERINARIOS.md en el repo de la API). Un rol que se autoconcede no
// puede sostener eso.
//
// Y por eso la comprobación está aquí y no repartida por las pantallas: el
// día que haga falta cambiarla, se cambia en un sitio.

export function esProfesional(perfil) {
  if (!perfil) return false
  if (perfil.rol !== 'profesional') return false
  // Basta con que haya fecha. No se compara con hoy a propósito: una
  // acreditación no caduca sola, la retira una persona poniendo esto a
  // NULL. Comparar contra el reloj apagaría cuentas buenas por un desfase
  // horario o por una fecha guardada en otro huso.
  return Boolean(perfil.rol_verificado_en)
}

// El número de colegiado que se enseña en la pauta firmada. Se lee de aquí
// y no de cualquier sitio para que haya un único punto por el que pasa: el
// día que la firma exista, lo que se imprime tiene que salir de una cuenta
// ACREDITADA, no de un campo que alguien rellenó.
export function colegiadoDe(perfil) {
  return esProfesional(perfil) ? (perfil.num_colegiado || null) : null
}
