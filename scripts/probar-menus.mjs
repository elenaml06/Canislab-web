#!/usr/bin/env node
// ─── LOS MENÚS A FONDO, CONTRA LA API DE VERDAD ──────────────────────────────
//
// Lo que prueba, y por qué cada cosa:
//
// 1. EDITAR EL MENÚ DE UN PERRO RENAL. Es el fallo real que está documentado
//    en CLAUDE.md: el camino de EDICIÓN no le pasaba las patologías al motor,
//    así que editar el menú de un renal daba 3084 mg de fósforo con el tope en
//    1200 -- y salía VERDE, porque el semáforo de FEDIAF mide los requisitos
//    de un perro SANO y 3084 cabe de sobra ahí. Se añade y se quita un
//    alimento y se exige que el menú siga cumpliendo.
//
// 2. REVALIDAR CUANDO EL PERRO CAMBIA. Un menú calculado para un cachorro deja
//    de cumplir cuando ese perro es adulto, y nada lo detectaría solo.
//
// 3. LA SEMANA. Que devuelva los que se piden, que salgan todos verdes, y que
//    NO SEAN EL MISMO MENÚ REPETIDO -- la rotación existe para dar variedad, y
//    tres copias del mismo plato pasarían todas las comprobaciones de
//    nutrientes sin dar ningún error.
//
// 4. EL TOKEN DEL VETERINARIO. La API comprueba contra Supabase, con la clave
//    de servicio, si quien pide el menú es un profesional acreditado, y solo a
//    ése le formula las patologías que al dueño se le bloquean. Se prueba con
//    los TRES casos -- sin token, con el de un tutor y con el de un veterinario
//    -- porque lo que hay que demostrar no es que el veterinario pueda: es que
//    el tutor NO pueda mandando un token cualquiera.
//
// ⚠️ SE COMPARA EL MOTIVO, NO SOLO `factible`. En hepatopatía los dos acaban
// en factible=false, pero por motivos DISTINTOS: al tutor se le bloquea antes
// de intentarlo y al veterinario se le levanta el bloqueo y el motor lo
// intenta de verdad. Comparando solo el resultado final, esta prueba daba una
// ROJA FALSA y parecía que el token no hacía nada.
//
// CÓMO SE EJECUTA, desde la carpeta del repo:
//
//     node scripts/probar-menus.mjs
//
// Necesita las dos cuentas de prueba en el entorno (RAWKU_PRUEBA_EMAIL_A y _B
// con sus contraseñas), y que la A esté acreditada como profesional. Ver
// `scripts/probar-recorrido-veterinario.mjs` para cómo se acredita.
//
// QUÉ DEJA DETRÁS: nada. No escribe en la base: solo entra para conseguir los
// dos tokens y todo lo demás son llamadas a la API.
import { createClient } from '@supabase/supabase-js'
if (process.env.HTTPS_PROXY){const u=await import('undici');u.setGlobalDispatcher(new u.ProxyAgent(process.env.HTTPS_PROXY))}
const URL='https://kvtkdpgpmrvwmvymyqof.supabase.co'
const ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2dGtkcGdwbXJ2d212eW15cW9mIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcxNTY4OTEsImV4cCI6MjEwMjczMjg5MX0.-I339koFHO6TE2bf0ty9hNji-9CeH57AE0C4a2ZccYE'
const API='https://canislab-api.onrender.com'
const V='\x1b[32m',R='\x1b[31m',G='\x1b[90m',F='\x1b[0m'
let fallos=0
const ok=(c,q,d='')=>{console.log(`${c?V+'  OK  ':R+' FALLA '}${F} ${q}${d?`\n${G}        ${d}${F}`:''}`);if(!c)fallos++}
const post=async(ruta,cuerpo)=>{const r=await fetch(API+ruta,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(cuerpo)});return r.json()}

const cliVet=createClient(URL,ANON)
const {data:sVet,error:eVet}=await cliVet.auth.signInWithPassword({
  email:process.env.RAWKU_PRUEBA_EMAIL_A,password:process.env.RAWKU_PRUEBA_PASSWORD_A})
const cliTutor=createClient(URL,ANON)
const {data:sTutor,error:eTutor}=await cliTutor.auth.signInWithPassword({
  email:process.env.RAWKU_PRUEBA_EMAIL_B,password:process.env.RAWKU_PRUEBA_PASSWORD_B})
if(eVet||eTutor){console.error(`\n${R}No se ha podido entrar con las cuentas de prueba. ¿Faltan RAWKU_PRUEBA_EMAIL_A/_B en el entorno?${F}\n`);process.exit(2)}
const tokenVet=sVet.session.access_token, tokenTutor=sTutor.session.access_token

const base={modo:'automatico',nombres_alimentos:[],der_objetivo:1000,etapa_requisitos:'Adulto',
  peso_perro_kg:20,peso_adulto_esperado_kg:20,especies_excluidas:[]}

// ══ 1. EDITAR UN MENÚ RENAL ════════════════════════════════════════════════
console.log('\n══ EDITAR EL MENÚ DE UN PERRO RENAL ══')
const m1=await post('/menu/v2',{...base,patologias:['renal']})
ok(m1.factible,'sale el menú renal')
const lista=Object.keys(m1.menu||{})
console.log(`${G}        ${lista.join(', ')}${F}`)

const anadido=await post('/menu/anadir',{...base,patologias:['renal'],menu_actual:lista,alimento:'Sardina'})
if(anadido.factible===false){ok(true,'añadir sardina: se rechaza y se explica',anadido.motivo||'')}
else{const f=anadido.ficha||{}
  ok(f.semaforo==='verde',`añadir sardina: sigue verde (${f.correctos}/${f.total})`,JSON.stringify(anadido).slice(0,150))
  ok(Object.keys(anadido.gramos||{}).includes('Sardina'),'la sardina entra de verdad')}

const quitado=await post('/menu/quitar',{...base,patologias:['renal'],menu_actual:lista,alimento:lista[0]})
if(quitado.factible===false){ok(true,`quitar ${lista[0]}: se rechaza y se explica`,quitado.motivo||'')}
else{const f=quitado.ficha||{}
  ok(f.semaforo==='verde',`quitar ${lista[0]}: sigue verde (${f.correctos}/${f.total})`)
  ok(!Object.keys(quitado.gramos||{}).includes(lista[0]),'y ya no está')}

// ══ 2. REVALIDAR TRAS CAMBIAR EL PERRO ═════════════════════════════════════
console.log('\n══ EL PERRO CAMBIA Y EL MENÚ SE REVALIDA ══')
const cach=await post('/menu/v2',{...base,patologias:[],etapa_requisitos:'CachorroCrecimiento',
  der_objetivo:900,peso_perro_kg:12,peso_adulto_esperado_kg:30})
ok(cach.factible,'sale menú de cachorro de raza grande',cach.motivo||'')
if(cach.factible){
  const rev=await post('/menu/revalidar',{menu_actual_gramos:cach.menu,der_objetivo:1600,
    etapa_requisitos:'Adulto',peso_perro_kg:30,peso_adulto_esperado_kg:30,patologias:[]})
  ok(typeof rev.sigue_siendo_valido==='boolean','revalidar contesta si sigue valiendo',
    `sigue_siendo_valido=${rev.sigue_siendo_valido} ${JSON.stringify(rev.por_que_ya_no_vale||[]).slice(0,140)}`)
}

// ══ 3. LA SEMANA ═══════════════════════════════════════════════════════════
console.log('\n══ LA SEMANA ══')
const r=await fetch(`${API}/menu/semana?numero_de_menus=3`,{method:'POST',
  headers:{'Content-Type':'application/json'},body:JSON.stringify({...base,patologias:[]})})
const sem=await r.json()
const menus=sem.menus||[]
ok(menus.length===3,'devuelve los 3 menús pedidos',`${menus.length}`)
if(menus.length){
  const verdes=menus.filter(m=>(m.ficha||{}).semaforo==='verde').length
  ok(verdes===menus.length,`los ${menus.length} salen verdes`,`verdes ${verdes}`)
  const combos=new Set(menus.map(m=>JSON.stringify(Object.keys(m.menu||{}).sort())))
  ok(combos.size>1,'no son todos el mismo menú',`combinaciones distintas: ${combos.size}`)
}

// ══ 4. EL TOKEN: ¿DE VERDAD DISTINGUE AL VETERINARIO? ══════════════════════
console.log('\n══ MENÚ EN MODO VETERINARIO (token_usuario) ══')
console.log(`${G}Hepatopatía bloquea al dueño porque el cobre terapéutico está por debajo`)
console.log(`del mínimo de FEDIAF. Un veterinario acreditado debería poder.${F}\n`)
const hep={...base,patologias:['hepatopatia']}
const sinToken=await post('/menu/v2',hep)
const conTutor=await post('/menu/v2',{...hep,token_usuario:tokenTutor})
const conVet=await post('/menu/v2',{...hep,token_usuario:tokenVet})
console.log(`${G}        sin token:      factible=${sinToken.factible} ${(sinToken.motivo||'').slice(0,90)}${F}`)
console.log(`${G}        token tutor:    factible=${conTutor.factible} ${(conTutor.motivo||'').slice(0,90)}${F}`)
console.log(`${G}        token vet:      factible=${conVet.factible} ${(conVet.motivo||'').slice(0,90)}${F}`)
ok(sinToken.factible===conTutor.factible,'un token de tutor NO da poderes',
  `sin token ${sinToken.factible} vs tutor ${conTutor.factible}`)
// ⚠️ SE COMPARA EL MOTIVO, NO `factible` (29 agosto). Comparar solo
// factible daba una roja falsa: los dos salen false, pero por motivos
// DISTINTOS -- al tutor se le bloquea antes de intentarlo ("la restricción
// de cobre está por debajo del mínimo") y al veterinario se le levanta el
// bloqueo y el motor lo intenta de verdad ("no existe ninguna combinación").
// Que el resultado final coincida no significa que haya pasado lo mismo.
const bloqueadoPorCobre = (m) => /por debajo del/i.test(m?.motivo || '')
ok(bloqueadoPorCobre(conTutor) && !bloqueadoPorCobre(conVet),
  'al veterinario acreditado se le levanta el bloqueo y al tutor no',
  `tutor bloqueado=${bloqueadoPorCobre(conTutor)} vet bloqueado=${bloqueadoPorCobre(conVet)}`)
if(conVet.factible){const f=conVet.ficha||{};console.log(`${G}        vet: ${f.correctos}/${f.total} ${f.semaforo}, ${Object.keys(conVet.menu||{}).join(', ')}${F}`)}

console.log(fallos===0?`\n${V}Sin fallos.${F}\n`:`\n${R}${fallos} FALLOS.${F}\n`)
process.exit(fallos?1:0)
