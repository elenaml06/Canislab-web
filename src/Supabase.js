import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://kvtkdpgpmrvwmvymyqof.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_2VP-J7Ir13S7CnZaxyy2rw_IFdR81mB'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

// ─── AUTH ────────────────────────────────────────────────────────────────────

export async function registrar(email, password, nombre) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { nombre } },
  })
  if (error) throw error
  return data
}

export async function login(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data
}

export async function logout() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function recuperarPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + '/?reset=true',
  })
  if (error) throw error
}

export function onAuthChange(callback) {
  return supabase.auth.onAuthStateChange((_event, session) => {
    callback(session?.user ?? null)
  })
}

export async function getUsuarioActual() {
  const { data } = await supabase.auth.getUser()
  return data?.user ?? null
}

// ─── PERFIL ───────────────────────────────────────────────────────────────────

export async function getPerfil(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error) throw error
  return data
}

export async function esPremium(userId) {
  const perfil = await getPerfil(userId)
  if (!perfil) return false
  if (perfil.plan !== 'premium') return false
  if (!perfil.suscripcion_activa_hasta) return false
  return new Date(perfil.suscripcion_activa_hasta) > new Date()
}

// ─── PERROS ───────────────────────────────────────────────────────────────────

export async function getPerros(userId) {
  const { data, error } = await supabase
    .from('perros')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function guardarPerro(userId, perfil) {
  const payload = {
    user_id: userId,
    nombre: perfil.nombre,
    peso_actual: perfil.pesoActual ? Number(perfil.pesoActual) : null,
    peso_adulto_esperado: perfil.pesoAdultoEsperado ? Number(perfil.pesoAdultoEsperado) : null,
    condicion_idx: perfil.condicionIdx ?? 2,
    etapa: perfil.etapa,
    tamano: perfil.tamano,
    sexo: perfil.sexo,
    castrado: perfil.castrado ?? false,
    actividad: perfil.actividad,
    raza: perfil.raza,
    fecha_nacimiento: perfil.fechaNacimiento || null,
    dieta_actual: perfil.dietaActual,
    alergia_si: perfil.alergiaSi,
    alergias: perfil.alergias ?? [],
    otros_evitar_si: perfil.otrosEvitarSi,
    otros_evitar: perfil.otrosEvitar ?? [],
    categorias_excluidas_si: perfil.categoriasExcluidasSi,
    categorias_excluidas: perfil.categoriasExcluidas ?? [],
    patologia_si: perfil.patologiaSi,
    patologias: perfil.patologias ?? [],
    updated_at: new Date().toISOString(),
  }

  if (perfil.id) {
    // actualizar perro existente
    const { data, error } = await supabase
      .from('perros')
      .update(payload)
      .eq('id', perfil.id)
      .select()
      .single()
    if (error) throw error
    return data
  } else {
    // crear perro nuevo
    const { data, error } = await supabase
      .from('perros')
      .insert(payload)
      .select()
      .single()
    if (error) throw error
    return data
  }
}

export async function eliminarPerro(perroId) {
  const { error } = await supabase
    .from('perros')
    .delete()
    .eq('id', perroId)
  if (error) throw error
}

// ─── MENÚS ────────────────────────────────────────────────────────────────────

export async function getMenus(perroId) {
  const { data, error } = await supabase
    .from('menus')
    .select('*')
    .eq('perro_id', perroId)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw error
  return data ?? []
}

export async function guardarMenu(userId, perroId, { modo, derReal, etapaLabel, menusData, numMenus, nombre }) {
  const { data, error } = await supabase
    .from('menus')
    .insert({
      user_id: userId,
      perro_id: perroId,
      modo,
      der_real: derReal,
      etapa_label: etapaLabel,
      menus_data: menusData,
      num_menus: numMenus ?? 1,
      nombre: nombre ?? null,
    })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function eliminarMenu(menuId) {
  const { error } = await supabase
    .from('menus')
    .delete()
    .eq('id', menuId)
  if (error) throw error
}
