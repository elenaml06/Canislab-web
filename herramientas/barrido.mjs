if (process.env.HTTPS_PROXY){const u=await import('undici');u.setGlobalDispatcher(new u.ProxyAgent(process.env.HTTPS_PROXY))}
const API='https://canislab-api.onrender.com'
const V='\x1b[32m',R='\x1b[31m',A='\x1b[33m',G='\x1b[90m',F='\x1b[0m'
let fallos=0, avisos=0
const ok=(c,q,d='')=>{console.log(`${c?V+'  OK  ':R+' FALLA '}${F} ${q}${d?`\n${G}        ${d}${F}`:''}`);if(!c)fallos++}
const nota=(q,d='')=>{console.log(`${A}  ··  ${F} ${q}${d?`\n${G}        ${d}${F}`:''}`);avisos++}
const post=async(ruta,cuerpo)=>{const r=await fetch(API+ruta,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(cuerpo)});return r.json()}
const base={modo:'automatico',nombres_alimentos:[],especies_excluidas:[],patologias:[]}

// ══ 1. TODAS LAS ETAPAS ════════════════════════════════════════════════════
console.log('\n══ TODAS LAS ETAPAS ══')
for (const [etapa,der,peso,adulto] of [
  ['Adulto',1100,25,25],['CachorroJoven',900,10,25],['CachorroCrecimiento',1400,15,30],
]) {
  const m=await post('/menu/v2',{...base,etapa_requisitos:etapa,der_objetivo:der,peso_perro_kg:peso,peso_adulto_esperado_kg:adulto})
  const f=m.ficha||{}
  ok(m.factible&&f.semaforo==='verde',`${etapa}: menú verde`,
    m.factible?`${f.correctos}/${f.total}, ${f.gramos} g, Ca:P ${f.ratio_ca_p}`:(m.motivo||'').slice(0,110))
}

// ══ 2. PERROS EXTREMOS ═════════════════════════════════════════════════════
console.log('\n══ PERROS EXTREMOS ══')
for (const [nombre,der,peso] of [['toy 2 kg',180,2],['mini 5 kg',350,5],['gigante 70 kg',2200,70],['gigante 90 kg',2700,90]]) {
  const m=await post('/menu/v2',{...base,etapa_requisitos:'Adulto',der_objetivo:der,peso_perro_kg:peso,peso_adulto_esperado_kg:peso})
  const f=m.ficha||{}
  if (m.factible) {
    const pct=f.gramos&&peso?(100*f.gramos/(peso*1000)).toFixed(1):'?'
    ok(f.semaforo==='verde',`${nombre}: verde`,`${f.correctos}/${f.total}, ${f.gramos} g = ${pct}% del peso`)
  } else ok(false,`${nombre}`,(m.motivo||'').slice(0,130))
}

// ══ 3. TODAS LAS PATOLOGÍAS, UNA A UNA ═════════════════════════════════════
console.log('\n══ LAS ONCE PATOLOGÍAS, EN ADULTO ══')
for (const p of ['cardiopatia','cistina','diabetes','estruvita','hepatopatia','hipotiroidismo','otra','oxalato','pancreatitis','renal','urato']) {
  const m=await post('/menu/v2',{...base,patologias:[p],etapa_requisitos:'Adulto',der_objetivo:1100,peso_perro_kg:25,peso_adulto_esperado_kg:25})
  const f=m.ficha||{}
  if (m.factible) ok(f.semaforo==='verde',`${p}: sale y verde`,`${f.correctos}/${f.total}`)
  else nota(`${p}: NO sale`,(m.motivo||'').slice(0,140))
}

// ══ 4. EL CRUCE DEL SELENIO (CLAUDE.md: a DER 49 sale, a DER 45 no) ════════
console.log('\n══ EL CRUCE DEL SELENIO ══')
console.log(`${G}CLAUDE.md: el mínimo escala al bajar las kcal y el máximo no; se cruzan`)
console.log(`en DER 45,2. A DER 49 sale menú y a DER 45 ya no, con un mensaje DISTINTO.${F}`)
for (const der of [49,45]) {
  const m=await post('/menu/v2',{...base,etapa_requisitos:'Adulto',der_objetivo:der,peso_perro_kg:2,peso_adulto_esperado_kg:2,peso_objetivo_kg:2})
  if (der===49) ok(m.factible===true,`DER ${der}: sale menú`,(m.motivo||'').slice(0,120))
  else {
    ok(m.factible===false,`DER ${der}: NO sale`,(m.motivo||'').slice(0,120))
    ok(m.imposible_por_aritmetica===true,`DER ${der}: se dice que es imposible por aritmética, no "quita restricciones"`,
      `imposible_por_aritmetica=${m.imposible_por_aritmetica}`)
  }
}

// ══ 5. LA ALERGIA ARRASTRA A LA FAMILIA ════════════════════════════════════
console.log('\n══ EXCLUIR UNA ESPECIE ARRASTRA A SU FAMILIA ══')
const conPollo=await post('/menu/v2',{...base,etapa_requisitos:'Adulto',der_objetivo:1100,peso_perro_kg:25,peso_adulto_esperado_kg:25,especies_excluidas:['Pollo']})
if (conPollo.factible){
  const n=Object.keys(conPollo.menu||{})
  const cuela=n.filter(x=>/pollo|gallina/i.test(x))
  ok(cuela.length===0,'excluir "Pollo" quita también gallina',cuela.join(', ')||n.join(', '))
}
console.log(fallos===0?`\n${V}Sin fallos. ${avisos} avisos.${F}\n`:`\n${R}${fallos} FALLOS, ${avisos} avisos.${F}\n`)
