'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'monitor.js'), 'utf8');
function extract(name) {
  const re = new RegExp('^  (?:async )?function ' + name + '\\(', 'm');
  const start = source.search(re);
  assert.notEqual(start, -1, 'Function missing: ' + name);
  const lineEnd = source.indexOf('\n', start);
  if (source.slice(start, lineEnd).trimEnd().endsWith('}')) return source.slice(start, lineEnd);
  const match = /\r?\n  \}/.exec(source.slice(start));
  assert.ok(match, 'Closing brace missing: ' + name);
  return source.slice(start, start + match.index + match[0].length);
}
function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return {promise, resolve};
}
function setup({result = {outcome:'reserved',canContinue:true}, pollResult, realCheck = false} = {}) {
  let now = 1000;
  const actions = {requests:[], posts:[], assignments:[], reloads:0, clicks:0, saves:[], checks:0, timers:[]};
  const groups = [{id:'seccion-G'}, {id:'seccion-F'}];
  const controls = new Map();
  const c = {
    console, Number, Math, Array, Set, Promise,
    Date: class extends Date { static now() { return now; } },
    running:true, checking:false, polling:false, fastPending:false, noFast:false, apiFailed:false, noDirect:false,
    runId:1, phase:'watch', phaseAt:1000, loadedAt:100, reloadAt:0, retries:0, enteredSector:null, skip:null,
    recovery:['home','assist','opening','back'], selected:new Set(['seccion-G']), matchId:'878', interval:{value:'1'}, timer:null,
    status:{textContent:''},
    document:{
      body:{innerText:'Seleccioná un sector disponible en el mapa'}, title:'Boca',
      querySelectorAll: selector => selector.startsWith('g[') ? groups : [],
      querySelector: selector => selector.startsWith('g[') ? groups[0] : null,
    },
    location:{origin:'https://bocasocios.bocajuniors.com.ar', assign:p=>actions.assignments.push(p), reload:()=>actions.reloads++},
    window:{postMessage:(data,origin)=>actions.posts.push({data,origin})},
    root:{querySelector:selector=>{if(!controls.has(selector))controls.set(selector,{});return controls.get(selector)}},
    setTimeout:(callback,ms)=>{const t={callback,ms};actions.timers.push(t);return t}, clearTimeout:()=>{},
    syncControls:()=>{},
    save:()=>actions.saves.push({phase:c.phase,running:c.running,fastPending:c.fastPending}),
    chime:async()=>{}, renderSectors:()=>{}, currentRoute:()=>({kind:'plateas',id:'878'}),
    errorPage:()=>false, cartHasSelection:()=>false,
    available:()=>[],
    recover:()=>{throw Error('unexpected recovery')}, homeFlow:()=>{throw Error('unexpected home')}, assistFlow:()=>{throw Error('unexpected assist')}, recoveryWait:()=>{throw Error('unexpected opening')}, seatFlow:()=>{throw Error('unexpected DOM seat flow')}, waitForFlow:()=>{throw Error('unexpected DOM wait')},
    act:()=>actions.clicks++,
    apiRequest:async(type,responseType,data,timeout)=>{
      actions.requests.push({type,responseType,data,timeout});
      return type==='la-previa:navigate' ? {ok:true} : result;
    },
    pollAvailability:async()=>pollResult||{fastReady:true,sections:[{nid:79881,codigo:'G',activa:true,libre:true}]},
    check:()=>actions.checks++,
  };
  vm.createContext(c);
  for (const name of ['sectorKey','stop','reserveFast','refreshMap']) vm.runInContext(extract(name),c);
  if(realCheck) vm.runInContext(extract('check'),c);
  const handlerStart = source.indexOf("  root.querySelector('#start').onclick=()=>{");
  const handlerEnd = source.indexOf('\n  };',handlerStart);
  assert.ok(handlerStart>=0 && handlerEnd>handlerStart);
  vm.runInContext(source.slice(handlerStart,handlerEnd+5),c);
  return {c,actions,controls,setNow:v=>{now=v}};
}
const target = {nid:79881,codigo:'G',activa:true,libre:true};

test('fastReady reserva desde el mapa sin recargar ni pulsar un asiento',async()=>{
  const {c,actions}=setup();
  await c.refreshMap();
  assert.equal(actions.requests.filter(r=>r.type==='la-previa:fast-reserve').length,1);
  assert.equal(actions.requests.find(r=>r.type==='la-previa:fast-reserve').data.sectionId,79881);
  assert.equal(actions.assignments.length,0);
  assert.equal(actions.reloads,0);
  assert.equal(actions.clicks,0);
  assert.equal(c.running,false);
  assert.equal(c.phase,'done');
  assert.ok(actions.saves.some(s=>s.phase==='api'&&s.fastPending));
  assert.equal(actions.requests.find(r=>r.type==='la-previa:navigate').data.page,'purchase');
});

test('unavailable antes de reservar habilita el flujo anterior',async()=>{
  const {c,actions}=setup({result:{outcome:'unavailable'}});
  await c.refreshMap();
  assert.equal(c.noFast,true);
  assert.equal(c.fastPending,false);
  assert.equal(c.phase,'direct');
  assert.equal(actions.assignments[0],'/matches/878/plateas/seats/79881');
});

for(const outcome of ['empty','taken']) test(outcome+' vuelve a vigilar sin navegar ni reservar otra vez en el mismo intento',async()=>{
  const {c,actions}=setup({result:{outcome}});
  await c.refreshMap();
  assert.equal(c.phase,'watch');assert.equal(c.running,true);assert.equal(c.retries,1);
  assert.equal(c.skip.id,'seccion-G');assert.equal(c.skip.until,2000);
  assert.equal(actions.requests.filter(r=>r.type==='la-previa:fast-reserve').length,1);
  assert.equal(actions.assignments.length,0);assert.equal(actions.reloads,0);
});

for(const outcome of ['uncertain','blocked','busy']) test(outcome+' detiene la búsqueda sin caer al flujo DOM',async()=>{
  const {c,actions}=setup({result:{outcome}});
  await c.refreshMap();
  assert.equal(c.running,false);
  assert.equal(actions.requests.filter(r=>r.type==='la-previa:fast-reserve').length,1);
  assert.equal(actions.requests.filter(r=>r.type==='la-previa:navigate').length,0);
  assert.equal(actions.assignments.length,0);assert.equal(actions.reloads,0);assert.equal(actions.clicks,0);
});

test('timeout del puente no repite la reserva ni navega al flujo anterior',async()=>{
  const {c,actions}=setup({result:{error:'tiempo'}});
  await c.refreshMap();
  assert.equal(c.running,false);assert.equal(c.noFast,false);
  assert.equal(actions.assignments.length,0);assert.equal(actions.requests.length,1);
});

test('Detener durante una solicitud impide reiniciar y navegar aunque luego llegue la reserva',async()=>{
  const {c,actions,controls}=setup();
  const d=deferred();
  c.apiRequest=(type)=>{actions.requests.push({type});return d.promise};
  const pending=c.reserveFast(target);
  assert.equal(c.fastPending,true);
  c.stop('Detenido.');
  const stoppedRun=c.runId;
  controls.get('#start').onclick();
  assert.equal(c.running,false);assert.equal(c.runId,stoppedRun);
  d.resolve({outcome:'reserved',canContinue:true});await pending;
  assert.equal(c.running,false);assert.equal(c.fastPending,false);
  assert.equal(actions.requests.length,1);
  assert.ok(actions.posts.some(p=>p.data.type==='la-previa:cancel'));
});

test('reserva sin socio confirmado dirige a asignación manual, sin avanzar al pago',async()=>{
  const {c,actions}=setup({result:{outcome:'reserved',canContinue:false}});
  await c.reserveFast(target);
  const navigate=actions.requests.find(r=>r.type==='la-previa:navigate');
  assert.equal(navigate.data.page,'seats');assert.equal(navigate.data.sectionId,79881);
  assert.equal(c.running,false);
});

test('un sector ajeno a la selección se excluye incluso si no figura en el mapa',async()=>{
  const {c,actions}=setup({pollResult:{fastReady:true,sections:[{nid:99999,codigo:'NO_ELEGIDO',activa:true,libre:true}]}});
  await c.refreshMap();
  assert.equal(actions.requests.length,0);assert.equal(actions.assignments.length,0);assert.equal(actions.reloads,0);
  assert.equal(c.reloadAt,2000);
});

test('no hay dos consultas simultáneas aunque lleguen dos actualizaciones',async()=>{
  const {c,actions}=setup();
  const d=deferred();let polls=0;
  c.pollAvailability=()=>{polls++;return d.promise};
  const first=c.refreshMap();await c.refreshMap();
  assert.equal(polls,1);assert.equal(c.polling,true);
  d.resolve({sections:[]});await first;
  assert.equal(c.polling,false);assert.equal(actions.requests.length,0);
});

test('una respuesta de un ciclo detenido no dispara ninguna reserva',async()=>{
  const {c,actions}=setup();const d=deferred();c.pollAvailability=()=>d.promise;
  const first=c.refreshMap();c.runId++;
  d.resolve({fastReady:true,sections:[target]});await first;
  assert.equal(actions.requests.length,0);assert.equal(actions.assignments.length,0);assert.equal(c.polling,false);
});

test('al iniciar se programa una consulta inmediata, sin esperar un intervalo',()=>{
  const {c,actions,controls}=setup({realCheck:true});
  c.running=false;controls.get('#start').onclick();
  assert.equal(c.running,true);assert.equal(actions.timers.length,1);assert.equal(actions.timers[0].ms,0);
});

test('durante reserva API las mutaciones DOM no seleccionan otro asiento',()=>{
  const {c,actions}=setup({realCheck:true});c.fastPending=true;c.phase='api';
  c.check();
  assert.equal(actions.timers.length,0);assert.equal(actions.clicks,0);assert.equal(c.running,true);
});
