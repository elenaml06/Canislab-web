if (process.env.HTTPS_PROXY){const u=await import('undici');u.setGlobalDispatcher(new u.ProxyAgent(process.env.HTTPS_PROXY))}
const API='https://canislab-api.onrender.com'
const base={modo:'automatico',nombres_alimentos:[],especies_excluidas:[]}
const casos=[
  ['adulto sano',{etapa_requisitos:'Adulto',der_objetivo:1100,peso_perro_kg:25,peso_adulto_esperado_kg:25,patologias:[]}],
  ['pancreatitis',{etapa_requisitos:'Adulto',der_objetivo:1100,peso_perro_kg:25,peso_adulto_esperado_kg:25,patologias:['pancreatitis']}],
  ['CachorroCrecim.',{etapa_requisitos:'CachorroCrecimiento',der_objetivo:1400,peso_perro_kg:15,peso_adulto_esperado_kg:30,patologias:[]}],
]
console.log('\nEl presupuesto global de la API son 24 s.\n')
for (const [n,c] of casos){
  const t0=Date.now()
  const r=await fetch(API+'/menu/v2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...base,...c})})
  const m=await r.json()
  const seg=((Date.now()-t0)/1000).toFixed(1)
  console.log(`${n.padEnd(18)} ${seg.padStart(5)}s   factible=${m.factible}`)
}
console.log('')
