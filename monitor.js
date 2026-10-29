(() => {
  'use strict';
  const key = 'la-previa:auto', loadedAt = Date.now();
  const recovery = ['home','assist','opening','back'];
  function currentRoute() {
    const path = location.pathname;
    let m = path.match(/^\/matches\/(\d+)\/plateas(\/seats\/\d+)?\/?$/);
    if (m) return {kind: m[2] ? 'seats' : 'plateas', id: m[1]};
    m = path.match(/^\/matches\/(\d+)\/assist\/?$/);
    if (m) return {kind: 'assist', id: m[1]};
    return {kind: /^\/(?:home)?\/?$/.test(path) ? 'home' : 'other', id: null};
  }
  const route = currentRoute(), onMap = route.kind === 'plateas' || route.kind === 'seats';
  let state;
  try {
    state = JSON.parse(sessionStorage.getItem(key) || 'null');
    // Estado guardado por versiones anteriores, una clave por partido.
    if (!state && onMap) state = JSON.parse(sessionStorage.getItem('boca-monitor-auto:/matches/'+route.id+'/plateas') || sessionStorage.getItem('boca-monitor:/matches/'+route.id+'/plateas') || 'null');
  } catch {}
  state ||= {};
  if (onMap && state.matchId && state.matchId !== route.id) state = {interval: state.interval};
  let matchId = onMap ? route.id : state.matchId || null;
  let running = state.running === true, timer, checking = false, reloadAt = 0, shown = false, retries = Number(state.retries) || 0;
  let enteredSector = state.sector || null, skip = state.skip || null;
  const triedSeats = new WeakSet();
  let apiFailed = false, noDirect = state.noDirect === true, polling = false, runId = 0;
  let fastPending = false, noFast = false, lastPollError = false;
  let selected = Array.isArray(state.sectors) ? new Set(state.sectors) : null;
  let sectorSignature = '';
  let phase = state.phase || 'watch', phaseAt = state.phaseAt || Date.now();
  // Solo AGREGAR PLATEA queda incierto tras una recarga; los pasos previos no tocan el carrito.
  if (running && !['watch','direct','entering','searching','seat',...recovery].includes(phase)) running = false;
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;bottom:16px;left:16px;z-index:2147483647';
  const root = host.attachShadow({mode:'open'});
  root.innerHTML = `<style>
    :host{font:13px/1.5 "Segoe UI",Arial,sans-serif;color:#142640;color-scheme:light}
    *{box-sizing:border-box}[hidden]{display:none!important}
    section{width:350px;max-width:calc(100vw - 32px);background:#f6f7f9;border:1px solid #dce1e8;border-radius:19px;box-shadow:0 18px 65px #0b1d3f38;overflow:hidden}
    header{background:#102440;color:white;padding:17px 18px;display:flex;align-items:center;gap:10px;border-bottom:3px solid #f6c84d}
    .mark{display:grid;place-items:center;width:34px;height:34px;border:1px solid #f6c84d66;border-radius:11px;color:#f6c84d;font-size:18px;font-weight:800}
    .brand{flex:1}.brand b{font-size:15px;letter-spacing:2px}.brand span{display:block;color:#b0bfd1;font-size:11px}
    button,select{font:inherit}button{cursor:pointer;border:0;border-radius:10px;padding:10px 13px;transition:background .15s}
    button:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #2d73c9;outline-offset:3px}
    #collapse{background:#ffffff0d;color:#e8eef7;font-size:18px;width:30px;height:30px;padding:0}
    .body{padding:17px}.state-row{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.state{font-size:10px;text-transform:uppercase;letter-spacing:1.2px;font-weight:700;display:flex;align-items:center;gap:7px}
    .dot{height:7px;width:7px;border-radius:50%;background:#9aa7b6}.state[data-active="true"] .dot{background:#2ba477;box-shadow:0 0 0 4px #2ba47716}.version{font-size:10px;color:#7f8b9c}
    #status{margin:0;background:white;border:1px solid #e4e8ee;border-radius:11px;padding:12px;min-height:63px;font-size:12px;color:#526276}
    .steps{display:flex;margin:15px 0;gap:4px}.steps span{flex:1;text-align:center;font-size:10px;color:#8b96a6;padding:7px 0;border-top:2px solid #dfe5ed}.steps span.current{border-color:#e9b72f;color:#142640;font-weight:700}
    .actions{display:flex;gap:8px;margin:0 0 16px}#start,#stop{flex:1;font-weight:700;background:#f5c64b;color:#172a45;padding:12px}#stop{background:#e8edf3}#sound{background:white;border:1px solid #dfe5ed;color:#53647a;font-size:12px}
    .interval-row{display:flex;align-items:center;justify-content:space-between;margin:0;padding:13px 0;border-top:1px solid #e0e5ed}select{background:white;border:1px solid #dce2eb;border-radius:8px;color:#182c47;padding:7px 10px;font-weight:700}
    details{border-top:1px solid #e0e5ed;padding-top:12px}summary{cursor:pointer;font-weight:600;padding:2px 0;list-style-position:inside}details p{margin:10px 0}#all,#none{padding:5px 10px;background:#e7edf4;color:#425773;font-size:11px}
    #sectors label{background:white;border:1px solid #dce3ed;border-radius:7px;padding:6px;font-size:11px}#sectors label:has(input:checked){border-color:#b4c3d7;background:#edf2f8}input{accent-color:#173d6d;width:13px;height:13px}#count{font-size:10px;color:#6f8095}
    footer{padding:12px 17px;background:#edf0f5;border-top:1px solid #dfe5ed}footer strong{font-size:11px;display:block;color:#445974}small{display:block;color:#7c899a;font-size:10px;line-height:1.5;margin-top:3px}
    section[data-collapsed="true"] .body,section[data-collapsed="true"] footer{display:none}section[data-collapsed="true"]{width:260px}
    @media(prefers-reduced-motion:reduce){*{transition:none!important}}
    </style><section><header><div class="mark">QC</div><div class="brand"><b>QCONTROLLER</b><span>Platea</span></div><button id="collapse" aria-label="Minimizar panel" title="Minimizar; el asistente sigue funcionando">−</button></header><div class="body"><div class="state-row"><div class="state" id="run-state"><span class="dot"></span><span id="run-label">En pausa</span></div><span class="version">v0.9.0</span></div><p id="status" role="status" aria-live="polite"></p><div class="steps"><span data-phase="watch">01 · Sector</span><span data-phase="seat">02 · Asiento</span><span data-phase="adding">03 · Carrito</span><span data-phase="done">04 · Manual</span></div><div class="actions"><button id="start">Iniciar búsqueda</button><button id="stop">Detener búsqueda</button><button id="sound" title="Escuchar el aviso">♫ Sonido</button></div><p class="interval-row"><label for="interval">Consultar disponibilidad</label><span><select id="interval"><option>2</option><option>3</option><option>5</option><option>15</option><option>30</option><option>60</option><option>120</option></select> s</span></p><div id="picker-slot"></div></div><footer><strong>Una platea · Pago manual</strong><small>La reserva depende de Boca. Revisá el carrito y completá el pago manualmente.</small></footer></section>`;
  document.documentElement.append(host);
  const status = root.querySelector('#status');
  const style = document.createElement('style');
  style.textContent = '[hidden]{display:none!important}';
  root.append(style);
  const interval = root.querySelector('#interval');
  const picker = document.createElement('details');
  picker.innerHTML = '<summary>Sectores a revisar</summary><p><button id="all">Todos</button><button id="none">Ninguno</button></p><div id="sectors" style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-height:180px;overflow:auto"></div><p id="count"></p>';
  root.querySelector('#picker-slot').append(picker);
  root.querySelector('#collapse').onclick = () => {
    const panel = root.querySelector('section');
    const collapsed = panel.dataset.collapsed !== 'true';
    panel.dataset.collapsed = String(collapsed);
    root.querySelector('#collapse').textContent = collapsed ? '+' : '−';
    root.querySelector('#collapse').setAttribute('aria-label', collapsed ? 'Expandir panel' : 'Minimizar panel');
  };
  root.querySelector('section').style.cssText += ';max-height:85vh;overflow:auto';
  function renderSectors() {
    const groups = Array.from(document.querySelectorAll('g[id^="seccion-"]'));
    const signature = groups.map(g=>g.id).join('|');
    if (signature === sectorSignature) return;
    sectorSignature = signature;
    const list = root.querySelector('#sectors');
    list.replaceChildren();
    for (const group of groups) {
      const label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:4px;cursor:pointer';
      const input = document.createElement('input');
      input.type = 'checkbox'; input.value = group.id;
      input.checked = selected === null || selected.has(group.id);
      label.append(input, document.createTextNode(group.id.replace('seccion-','').replace(/_1_$/, '')));
      list.append(label);
    }
    updateCount();
  }
  function updateCount() {
    const inputs = Array.from(root.querySelectorAll('#sectors input'));
    root.querySelector('#count').textContent = inputs.length ? inputs.filter(i=>i.checked).length+' de '+inputs.length+' sectores seleccionados' : 'Esperando el mapa…';
  }
  function selectionChanged() {
    selected = new Set(Array.from(root.querySelectorAll('#sectors input:checked'), i=>i.value));
    updateCount(); save();
    if (!selected.size) { stop('Marcá al menos un sector para iniciar.'); return; }
    if (running) check();
    else status.textContent = selected.size+' sectores elegidos. Pulsá Iniciar búsqueda cuando quieras.';
  }
  picker.onchange = selectionChanged;
  for (const [id, checked] of [['all',true],['none',false]]) {
    root.querySelector('#'+id).onclick = () => {
      for (const input of root.querySelectorAll('#sectors input')) input.checked = checked;
      selectionChanged();
    };
  }
  interval.insertAdjacentHTML('afterbegin', '<option>1</option>');
  interval.value = ['1','2','3','5','15','30','60','120'].includes(state.interval) ? state.interval : '3';
  let audio;
  async function chime() {
    try {
      audio ||= new AudioContext();
      await audio.resume();
      for (const offset of [0, .4, .8]) {
        const o = audio.createOscillator(), g = audio.createGain();
        const t = audio.currentTime + offset;
        o.type = 'sine'; o.frequency.value = 740;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(.25, t + .025);
        g.gain.exponentialRampToValueAtTime(.001, t + .25);
        o.connect(g).connect(audio.destination); o.start(t); o.stop(t + .27);
      }
    } catch {}
  }
  root.querySelector('#sound').onclick = chime;
  function syncVisibility() {
    const r = currentRoute();
    shown ||= r.kind === 'plateas' || r.kind === 'seats' || (recovery.includes(phase) && (r.kind === 'home' || r.kind === 'assist'));
    host.style.display = shown ? '' : 'none';
  }
  function syncControls() {
    syncVisibility();
    root.querySelector('#start').hidden = running;
    root.querySelector('#start').disabled = fastPending;
    root.querySelector('#stop').hidden = !running;
    root.querySelector('#run-state').dataset.active = String(running);
    root.querySelector('#run-label').textContent = running ? 'Búsqueda activa' : 'En pausa';
    const step = phase === 'api' ? 'adding' : phase === 'direct' || phase === 'entering' || phase === 'searching' || phase === 'seat' ? 'seat' : recovery.includes(phase) ? 'watch' : phase;
    for (const node of root.querySelectorAll('[data-phase]')) node.classList.toggle('current',node.dataset.phase === step);
  }
  function save() { syncControls(); sessionStorage.setItem(key, JSON.stringify({running,matchId,retries,sector:enteredSector,skip,noDirect,interval:interval.value,sectors:selected === null ? null : [...selected],phase,phaseAt})); }
  function stop(message) { running = false; runId++; clearTimeout(timer); window.postMessage({type:'la-previa:cancel'}, location.origin); save(); status.textContent = message; }
  function color(value) { const m = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/); return m ? m.slice(1,4).join(',') : value; }
  function available() {
    const label = Array.from(document.querySelectorAll('span')).find(e=>e.textContent.trim()==='Disponible');
    const dot = label?.previousElementSibling;
    if (!dot) return null;
    const green = color(getComputedStyle(dot).backgroundColor);
    if (!green || green === '0,0,0') return null;
    const groups = Array.from(document.querySelectorAll('g[id^="seccion-"]'));
    if (!groups.length) return null;
    return groups.filter(g=>(selected === null || selected.has(g.id)) && !(skip && skip.id === g.id && Date.now() < skip.until)).filter(g=>Array.from(g.querySelectorAll('path,polygon,rect')).some(p=>color(getComputedStyle(p).fill)===green));
  }
  function sectorKey(value) { return String(value).replace(/^seccion-/, '').replace(/_1_$/, '').replace(/[^0-9a-z]/gi, '').toUpperCase(); }
  function apiRequest(type, responseType, data = {}, timeout = 5500) {
    return new Promise(resolve => {
      const id = Date.now()+Math.random();
      const done = data => { window.removeEventListener('message', onMessage); clearTimeout(limit); resolve(data); };
      const onMessage = event => { if (event.source === window && event.origin === location.origin && event.data?.type === responseType && event.data.id === id) done(event.data); };
      const limit = setTimeout(() => done({error: 'tiempo'}), timeout);
      window.addEventListener('message', onMessage);
      window.postMessage({type, id, matchId, ...data}, location.origin);
    });
  }
  function pollAvailability() { return apiRequest('la-previa:poll', 'la-previa:availability'); }
  async function reserveFast(target) {
    const activeRun = runId, startedAt = Date.now();
    enteredSector = Array.from(document.querySelectorAll('g[id^="seccion-"]')).find(g=>sectorKey(g.id) === sectorKey(target.codigo))?.id || null;
    fastPending = true; phase = 'api'; phaseAt = Date.now(); reloadAt = 0; save();
    status.textContent = 'Sector '+target.codigo+': consultando asientos y reservando directamente, sin cargar la pantalla…';
    const result = await apiRequest('la-previa:fast-reserve', 'la-previa:fast-result', {sectionId:target.nid}, 35000);
    fastPending = false; syncControls();
    const stillActive = running && activeRun === runId;
    if (result.outcome === 'reserved') {
      phase = 'done';
      const message = 'Boca confirmó el asiento en el carrito ('+((Date.now()-startedAt)/1000).toFixed(2)+' s). '+(result.canContinue && stillActive ? 'Abriendo pago manual.' : 'Revisá el carrito y completá la asignación o los datos del asistente.');
      stop(message); void chime(); document.title = 'Revisá tu platea · Boca';
      if (stillActive) {
        const navigation = await apiRequest('la-previa:navigate', 'la-previa:navigation', {page:result.canContinue ? 'purchase' : 'seats', sectionId:target.nid}, 10000);
        if (!navigation.ok) status.textContent = message+' Abrí el carrito para continuar.';
      }
      return true;
    }
    if (!stillActive) return true;
    if (result.outcome === 'unavailable') { noFast = true; phase = 'watch'; save(); return false; }
    if (result.outcome === 'empty' || result.outcome === 'taken') {
      retries++; phase = 'watch'; phaseAt = Date.now();
      skip = {id:enteredSector, until: Date.now()+Number(interval.value)*1000};
      reloadAt = Date.now()+Number(interval.value)*1000; save();
      status.textContent = 'El lugar se agotó antes de reservar. Sigo buscando en los sectores elegidos.';
      return true;
    }
    stop(result.message || (result.outcome === 'stopped' ? 'Operación detenida antes de reservar.' : 'No pude confirmar la reserva. Revisá el carrito; no se repite el agregado.'));
    return true;
  }
  // Pregunta a Boca solo por la disponibilidad (como hace la página al abrir el mapa) y recarga el mapa recién cuando hay lugar.
  async function refreshMap() {
    if (polling) return;
    polling = true;
    const activeRun = runId, startedAt = Date.now();
    let navigating = false;
    try {
    if (!apiFailed) {
      const result = await pollAvailability();
      if (!running || phase !== 'watch' || activeRun !== runId) return;
      if (result.blocked) return stop('Boca requiere tu atención o limitó las consultas. Revisá sesión, cola o aviso del sitio.');
      lastPollError = !result.sections;
      if (result.sections) {
        const onMap = new Set(Array.from(document.querySelectorAll('g[id^="seccion-"]'), g=>sectorKey(g.id)));
        const wanted = selected === null ? null : new Set([...selected].map(sectorKey));
        const skipped = skip && Date.now() < skip.until ? sectorKey(skip.id) : null;
        const free = result.sections.filter(s=>s.activa && s.libre && sectorKey(s.codigo) !== skipped && (!wanted || wanted.has(sectorKey(s.codigo))));
        if (!free.length) { reloadAt = Math.max(Date.now(), startedAt + Number(interval.value)*1000); return; }
        const fast = noFast || !result.fastReady ? [] : free.filter(s=>s.nid !== null);
        if (fast.length && await reserveFast(fast[Math.floor(Math.random()*fast.length)])) return;
        if (!running || activeRun !== runId || phase !== 'watch') return;
        // La pantalla de asientos usa el número de sección (/plateas/seats/79881 = G): se entra directo, sin recargar el mapa.
        const direct = noDirect ? [] : free.filter(s=>s.nid !== null && onMap.has(sectorKey(s.codigo)));
        if (direct.length) {
          const target = direct[Math.floor(Math.random()*direct.length)];
          enteredSector = Array.from(document.querySelectorAll('g[id^="seccion-"]')).find(g=>sectorKey(g.id) === sectorKey(target.codigo))?.id || null;
          phase = 'direct'; phaseAt = Date.now(); reloadAt = 0; save();
          status.textContent = 'Boca informa lugar en '+target.codigo+'. Entrando directo a asientos…';
          location.assign('/matches/'+matchId+'/plateas/seats/'+target.nid);
          return;
        }
        status.textContent = 'Boca informa lugar en '+free.map(s=>s.codigo).join(', ')+'. Cargando el mapa…';
      } else if (result.error === 'sin-consulta' || result.error === 'formato') apiFailed = true;
      else { reloadAt = Date.now()+Math.max(1000, Number(interval.value)*1000); return; }
    }
    navigating = true; save(); location.reload();
    } finally {
      polling = false;
      if (!navigating && running && phase === 'watch') check();
    }
  }
  function cartHasSelection(text) { return /\b[1-9]\d*\s+Reservas?\b/i.test(text) || (text.includes('TU CARRITO') && !text.includes('Aún no agregaste entradas.') && Array.from(document.querySelectorAll('button')).some(b=>b.textContent.trim()==='CONTINUAR' && !b.disabled)); }
  function button(name) {
    const matches = Array.from(document.querySelectorAll('button,[role="button"]')).filter(e=>e.textContent.trim().replace(/\s+/g,' ').toUpperCase()===name && !e.disabled && e.getAttribute('aria-disabled')!=='true' && e.getClientRects().length);
    return matches.length === 1 ? matches[0] : null;
  }
  function act(element, next, message) {
    phase = next; phaseAt = Date.now(); reloadAt = 0; save();
    status.textContent = message;
    timer = setTimeout(check, 100);
    if (typeof element.click === 'function') element.click();
    else element.dispatchEvent(new MouseEvent('click', {bubbles:true, cancelable:true, view:window}));
  }
  function waitForFlow() {
    if (Date.now()-phaseAt > (phase === 'seat' ? 5000 : 10000)) {
      if (phase === 'adding') return stop('El sitio no confirmó el siguiente paso. Revisá la pantalla; no se repite la acción.');
      const other = phase === 'seat' && greenSeat();
      if (other) return act(other, 'seat', 'El asiento no respondió en 5 s. Probando otro del mismo sector…');
      return retry('El sitio no respondió a tiempo.');
    }
    timer = setTimeout(check, 100);
  }
  function retry(message) {
    retries++; phaseAt = Date.now(); reloadAt = 0;
    // El sector que falló espera un intervalo; los demás se pueden probar enseguida.
    if (enteredSector) skip = {id: enteredSector, until: Date.now() + Number(interval.value)*1000};
    const back = controls('VOLVER AL MAPA');
    phase = back.length === 1 ? 'back' : 'watch'; save();
    status.textContent = message+' Volviendo al mapa (reintento '+retries+')…';
    if (phase === 'back') { timer = setTimeout(check, 100); back[0].click(); return; }
    location.assign('/matches/'+matchId+'/plateas');
  }
  function controls(name) {
    const found = Array.from(document.querySelectorAll('a,button,[role="button"]')).filter(e=>e.textContent.replace(/[^\p{L}\p{N}]+/gu,' ').trim().toUpperCase()===name && !e.disabled && e.getAttribute('aria-disabled')!=='true' && e.getClientRects().length);
    return found.filter(e=>!found.some(o=>o!==e && e.contains(o)));
  }
  function errorPage(text) { return /hubo un problema/i.test(text) && /no se pudo procesar tu solicitud/i.test(text); }
  function goHome(message) {
    phase = 'home'; phaseAt = Date.now(); reloadAt = 0; save();
    status.textContent = message;
    location.assign('/home');
  }
  function recoveryWait(message) {
    if (Date.now()-Math.max(phaseAt, loadedAt) > 20000) return goHome('El sitio no avanzó en 20 s. Volviendo a Inicio para reintentar…');
    status.textContent = message;
    timer = setTimeout(check, 500);
  }
  function recover() {
    if (phase === 'adding') return stop('Boca mostró un error mientras se agregaba la platea. Revisá el carrito; no se reintenta.');
    if (phase === 'home' && Date.now()-phaseAt < Math.max(5000, Number(interval.value)*1000)) { timer = setTimeout(check, 500); return; }
    const back = controls('VOLVER AL INICIO');
    if (back.length === 1) return act(back[0], 'home', 'Boca mostró «Hubo un problema». Volviendo al inicio…');
    goHome('Boca mostró «Hubo un problema». Abriendo Inicio…');
  }
  function matchCard(element) {
    for (let node = element.parentElement, i = 0; node && i < 6; node = node.parentElement, i++) if (/\bvs\b/i.test(node.innerText)) return true;
    return false;
  }
  function homeFlow(text, route) {
    if (route.kind !== 'home') return recoveryWait('Volviendo al inicio…');
    const options = controls('VER MÁS'), href = e=>e.closest('a')?.getAttribute('href') || '';
    const own = options.filter(e=>new RegExp('/matches/'+matchId+'(?:[/?#]|$)').test(href(e)));
    const unknown = options.filter(e=>!href(e).includes('/matches/') && matchCard(e));
    if (own.length || unknown.length === 1) return act(own[0] || unknown[0], 'assist', 'Partido publicado. Entrando en VER MÁS…');
    if (unknown.length) {
      phase = 'assist'; phaseAt = Date.now(); save();
      status.textContent = 'Hay varios partidos publicados. Abriendo el que estabas buscando…';
      location.assign('/matches/'+matchId+'/assist?backUrl=/home');
      return;
    }
    if (!/no pudimos cargar los partidos/i.test(text) && Date.now()-Math.max(phaseAt, loadedAt) < 15000) { status.textContent = 'Esperando que Inicio muestre el partido…'; timer = setTimeout(check, 500); return; }
    if (!reloadAt) reloadAt = Date.now() + Number(interval.value)*1000;
    status.textContent = 'Inicio todavía no muestra el partido. Próxima actualización sin caché en '+interval.value+' s. Última revisión: '+new Date().toLocaleTimeString();
    timer = setTimeout(()=>{ if (!running || phase !== 'home') return; save(); hardReload(); }, Math.max(0, reloadAt-Date.now()));
  }
  function hardReload() {
    try { chrome.runtime.sendMessage({type: 'hard-reload'}).catch(()=>location.reload()); } catch { location.reload(); }
  }
  function assistFlow(route) {
    if (route.kind !== 'assist') return recoveryWait('Abriendo el partido…');
    if (route.id !== matchId) return stop('VER MÁS abrió otro partido. Revisalo manualmente.');
    const options = controls('OBTENER PLATEAS');
    if (options.length > 1) return stop('Hay más de una opción OBTENER PLATEAS. Elegí manualmente.');
    if (options.length) return act(options[0], 'opening', 'Entrando en OBTENER PLATEAS…');
    recoveryWait('Esperando OBTENER PLATEAS…');
  }
  function greenSeat() {
    const label = Array.from(document.querySelectorAll('span')).find(e=>e.textContent.trim()==='Disponible');
    const dot = label?.previousElementSibling;
    if (!dot) return null;
    const green = color(getComputedStyle(dot).backgroundColor);
    if (!green || green==='0,0,0') return null;
    // Al azar entre los verdes que todavía no se probaron: el primero de la lista es el que más gente intenta tomar.
    const seats = Array.from(document.querySelectorAll('button,[role="button"],div')).filter(e=>{
      if (triedSeats.has(e) || !/^\d{1,4}$/.test(e.textContent.trim()) || e.disabled || e.getAttribute('aria-disabled')==='true') return false;
      const box=e.getBoundingClientRect(), css=getComputedStyle(e);
      return box.width>8 && box.width<85 && box.height>8 && box.height<85 && css.visibility!=='hidden' && color(css.backgroundColor)===green && (e.matches('button,[role="button"]') || css.cursor==='pointer');
    });
    const seat = seats[Math.floor(Math.random()*seats.length)];
    if (seat) triedSeats.add(seat);
    return seat;
  }
  function seatFlow(text) {
    const taken = /(?:asiento|ubicación|platea|entrada).{0,60}(?:ya no está disponible|no se encuentra disponible|ya (?:fue |está )reservad)/i.test(text);
    if (taken || /ocurrió un error|no se pudo|intentalo nuevamente/i.test(text)) {
      // Antes de AGREGAR PLATEA no hay nada en el carrito; después, solo se sigue si Boca dice que no estaba disponible y el carrito no muestra una reserva.
      if (phase !== 'adding' || (taken && !cartHasSelection(text))) return retry(taken ? 'Ese lugar ya no estaba disponible.' : 'El sitio mostró un error antes de agregar.');
      return stop('El sitio rechazó la selección. Revisá el aviso antes de volver a iniciar.');
    }
    const hasCart = cartHasSelection(text);
    if (hasCart) {
      if (phase !== 'adding') return stop('Ya hay una selección en el carrito. Revisala manualmente.');
      const count = text.match(/\b(\d+)\s+Reservas?\b/i);
      if (!count || Number(count[1])!==1) return stop('No pude confirmar una única reserva. Revisá el carrito.');
      const next = button('CONTINUAR');
      if (!next) return waitForFlow();
      phase = 'done';
      stop('Una platea figura en el carrito. Avanzando al paso siguiente; verificá la reserva y completá el pago manualmente.');
      void chime();
      document.title = 'Revisá tu platea · Boca';
      next.click();
      return;
    }
    if (phase==='adding') return waitForFlow();
    const add = button('AGREGAR PLATEA');
    if (add && text.includes('UBICACIÓN SELECCIONADA')) {
      return act(add, 'adding', 'Agregando una sola platea. Esperando respuesta del sitio…');
    }
    if (phase==='seat') return waitForFlow();
    const seat = greenSeat();
    if (seat) return act(seat,'seat','Asiento disponible detectado. Esperando el detalle de ubicación…');
    if (phase==='searching') return waitForFlow();
    const search = button('BUSCAR ASIENTO DISPONIBLE');
    if (search) return act(search,'searching','Buscando una ubicación con el botón del sitio…');
    if (phase==='entering') return waitForFlow();
    stop('No pude reconocer la pantalla de asientos. Revisala manualmente.');
  }
  function check() {
    if (!running || checking) return;
    checking = true; clearTimeout(timer);
    try {
      renderSectors();
      if (selected !== null && !selected.size) return stop('Marcá al menos un sector para iniciar.');
      const text = document.body.innerText, route = currentRoute();
      // «Sala de espera» y «fila virtual» solo frenan en el mapa: en Inicio pueden ser texto informativo.
      const attention = route.kind === 'plateas' || route.kind === 'seats' ? /captcha|demasiadas solicitudes|acceso denegado|sala de espera|fila virtual|sesión (?:ha )?(?:expirado|vencida)/i : /captcha|demasiadas solicitudes|acceso denegado|sesión (?:ha )?(?:expirado|vencida)/i;
      if (attention.test(text)) return stop('El sitio requiere tu atención. Monitor detenido.');
      if (fastPending) {
        if (route.id !== matchId || !['plateas','seats'].includes(route.kind) || errorPage(text)) stop('Cambió la pantalla durante la reserva. Revisá el carrito antes de volver a iniciar.');
        return;
      }
      if (errorPage(text)) return recover();
      if ((phase === 'assist' || phase === 'opening') && route.kind === 'plateas' && route.id === matchId) { phase = 'watch'; phaseAt = Date.now(); reloadAt = 0; save(); }
      if (phase === 'direct') {
        // Si Boca no deja abrir asientos directo y devuelve al mapa, se sigue con el mapa (ya actualizado) y no se vuelve a intentar.
        if (route.kind === 'seats') { phase = 'entering'; phaseAt = Date.now(); save(); }
        else if (route.kind === 'plateas' && loadedAt > phaseAt) { noDirect = true; phase = 'watch'; phaseAt = Date.now(); save(); }
        else if (route.kind === 'plateas') { timer = setTimeout(check, 200); return; }
      }
      if (phase === 'back') {
        if (route.kind !== 'plateas' || route.id !== matchId) {
          if (Date.now()-phaseAt < 5000) { timer = setTimeout(check, 200); return; }
          phase = 'watch'; save(); location.assign('/matches/'+matchId+'/plateas'); return;
        }
        phase = 'watch'; phaseAt = Date.now(); save();
      }
      if (phase === 'home') return homeFlow(text, route);
      if (phase === 'assist') return assistFlow(route);
      if (phase === 'opening') return recoveryWait('Abriendo el mapa de plateas…');
      if (route.id !== matchId || (route.kind !== 'plateas' && route.kind !== 'seats')) return stop('Fuera de selección de plateas. Pago manual; monitor detenido.');
      if (route.kind === 'seats') return seatFlow(text);
      if (phase !== 'watch') return waitForFlow();
      if (cartHasSelection(text)) return stop('Hay una selección en el carrito. Revisala manualmente.');
      if (polling) return;
      const sectors = available();
      if (sectors === null) { status.textContent = 'Esperando el mapa. No se recarga hasta reconocerlo.'; timer=setTimeout(check,1000); return; }
      if (sectors.length && apiFailed) {
        const sector = sectors[Math.floor(Math.random()*sectors.length)];
        enteredSector = sector.id;
        return act(sector, 'entering', 'Sector disponible: '+sector.id.replace('seccion-','')+'. Entrando a asientos…');
      }
      if (!reloadAt) reloadAt = Date.now();
      status.textContent=(lastPollError && !apiFailed ? 'La última consulta falló. Reintentando. Próxima ' : 'Sin disponibilidad en los sectores elegidos. Próxima ')+(apiFailed ? 'actualización del mapa' : 'consulta a Boca')+' en '+interval.value+' s. Última revisión: '+new Date().toLocaleTimeString()+(retries ? ' · Reintentos: '+retries : '');
      timer=setTimeout(()=>{ if (!running) return; const current=document.body.innerText; if (cartHasSelection(current)) return stop('Carrito con selección. Actualización cancelada.'); if (errorPage(current)) return recover(); if (!document.querySelector('g[id^="seccion-"]') || !current.includes('Seleccioná un sector disponible en el mapa')) return stop('Cambió la pantalla. Revisala manualmente.'); void refreshMap(); },Math.max(0,reloadAt-Date.now()));
    } finally {checking=false;}
  }
  root.querySelector('#start').onclick=()=>{
    if (fastPending) return;
    const r=currentRoute();
    if (r.kind==='plateas'||r.kind==='seats') { matchId=r.id; phase='watch'; }
    else if (matchId && (r.kind==='home'||r.kind==='assist')) phase=r.kind;
    else { status.textContent='Abrí el mapa de plateas del partido y pulsá Iniciar.'; return; }
    clearTimeout(timer);runId++;running=true;phaseAt=Date.now();reloadAt=0;retries=0;skip=null;noDirect=false;noFast=false;apiFailed=false;lastPollError=false;save();check();
  };
  root.querySelector('#stop').onclick=()=>stop('Detenido.');
  interval.onchange=()=>{save();if(running){clearTimeout(timer);reloadAt=0;check();}};
  let queued = false;
  const observer = new MutationObserver(() => {
    syncVisibility();
    renderSectors();
    if (!running || queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; check(); });
  });
  observer.observe(document.body, {subtree:true, childList:true, attributes:true,
    attributeFilter:['fill','class','style','disabled','aria-disabled'], characterData:true});
  syncControls();
  renderSectors();
  if(running) check(); else status.textContent='Detenido. Abrí el mapa y pulsá Iniciar.';
})();
