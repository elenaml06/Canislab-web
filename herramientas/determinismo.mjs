if (process.env.HTTPS_PROXY){const u=await import('undici');u.setGlobalDispatcher(new u.ProxyAgent(process.env.HTTPS_PROXY))}
const API='https://canislab-api.onrender.com'
const post=async(c)=>{const r=await fetch(API+'/menu/v2',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(c)});return r.json()}
const casos={
  'adulto sano':      {etapa_requisitos:'Adulto',der_objetivo:1100,peso_perro_kg:25,peso_adulto_esperado_kg:25,patologias:[]},
  'cardiopatia':      {etapa_requisitos:'Adulto',der_objetivo:1100,peso_perro_kg:25,peso_adulto_esperado_kg:25,patologias:['cardiopatia']},
  'pancreatitis':     {etapa_requisitos:'Adulto',der_objetivo:1100,peso_perro_kg:25,peso_adulto_esperado_kg:25,patologias:['pancreatitis']},
  'CachorroJoven':    {etapa_requisitos:'CachorroJoven',der_objetivo:900,peso_perro_kg:10,peso_adulto_esperado_kg:25,patologias:[]},
  'CachorroCrecim.':  {etapa_requisitos:'CachorroCrecimiento',der_objetivo:1400,peso_perro_kg:15,peso_adulto_esperado_kg:30,patologias:[]},
}
const base={modo:'automatico',nombres_alimentos:[],especies_excluidas:[]}
console.log('\nMisma peticion, 5 veces cada una:\n')
for (const [nombre,caso] of Object.entries(casos)) {
  const res=[]
  for (let i=0;i<5;i++){const m=await post({...base,...caso});res.push(m.factible?'SI':'no')}
  const unicos=new Set(res)
  const marca=unicos.size===1?'\x1b[32m  estable  \x1b[0m':'\x1b[31m ¡VARIA! \x1b[0m'
  console.log(`${marca} ${nombre.padEnd(18)} ${res.join(' ')}`)
}
console.log('')
