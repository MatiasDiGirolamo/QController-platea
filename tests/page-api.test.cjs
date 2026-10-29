'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'page-api.js'), 'utf8');
const MATCH = 878, SECTION = 79881, SEAT = 7218497, TICKET = 444;
const routes = {
  fe: '/event/{{matchId}}/seat/section/availability',
  yG: '/event/seat/section/{{sectionId}}/locations',
  yJ: '/event/seat/section/{{sectionId}}/availability',
  m1: '/event/seat/reserve/{{seatId}}',
  pG: '/event/seat/location/{{seatId}}/availability',
  wT: '/event/seat/availability/buy',
  f: '/event/seat/assignPurchase',
  gr: '/member/shoppingCart',
};

const emptyCart = () => ({eventoNid: MATCH, items: []});
const reservedCart = () => ({eventoNid: MATCH, tiempoRestante: 300, items: [{
  nid: TICKET, productoNid: -7, socioNid: 42,
  ubicacion: {nid: SEAT, seccion: 'G', fila: 14, columna: 30},
}]});
const httpError = (status, body = {}) => Object.assign(new Error(body.descripcion || 'HTTP ' + status), {
  response: {status, data: body},
});
const flush = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};

function browser(options = {}) {
  const listeners = new Map(), sent = [], calls = [], cache = [], navigation = [];
  let cartReads = 0;
  const client = {
    async get(url, config) {
      calls.push({method: 'GET', url, config});
      if (options.get) {
        const value = await options.get(url, config, cartReads);
        if (value !== undefined) return {data: value};
      }
      if (url === '/member/shoppingCart/' + MATCH) {
        return {data: cartReads++ === 0 ? options.initialCart || emptyCart() : options.finalCart || reservedCart()};
      }
      if (url === '/event/' + MATCH + '/seat/section/availability') return {data: {
        evento: {nid: MATCH}, secciones: [{nid: SECTION, codigo: 'G', activa: true, hayDisponibilidad: true}],
      }};
      if (url === '/event/seat/section/' + SECTION + '/availability') return {data: {
        evento: {nid: MATCH}, nombreSeccion: 'G', ubicaciones: [{nid: SEAT, fila: 14, columna: 30}],
      }};
      if (url === routes.wT) return {data: {socios: [{nid: 42, abonoNid: null}]}};
      throw new Error('Unexpected GET ' + url);
    },
    async post(url, body, config) {
      calls.push({method: 'POST', url, body: JSON.parse(JSON.stringify(body)), config});
      if (options.post) {
        const value = await options.post(url, body, config);
        if (value !== undefined) return {data: value};
      }
      if (url === '/event/seat/reserve/' + SEAT) return {data: {ticket: {nid: TICKET}}};
      if (url === routes.f) return {data: {tipoTarifaNid: -2}};
      throw new Error('Unexpected POST ' + url);
    },
  };
  const queryClient = {
    setQueryData: (...args) => cache.push(args),
    refetchQueries: async () => {},
    invalidateQueries: async () => {},
    getQueryData: () => undefined,
  };
  const modules = {
    12033: {ZP: client}, 28275: routes, 94578: {Z: queryClient},
    57711: {j: {SHOPPING_CART_BY_ID: 'cart', SECTIONS_AVAILABILITY: 'sections', SECTION_SEATS_AVAILABILITY: 'seats', PLATEAS_AVAILABLE_MEMBERS: 'members'}},
    5632: {default: {push: async url => { navigation.push(url); return true; }, router: {push: async url => { navigation.push(url); return true; }}}},
  };
  const requireModule = id => {
    if (!(id in modules)) throw new Error('Unexpected module ' + id);
    return modules[id];
  };
  const chunks = [];
  chunks.push = chunk => { if (typeof chunk[2] === 'function') chunk[2](requireModule); return 1; };
  const window = {
    webpackChunk_N_E: chunks,
    addEventListener(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    postMessage(data) { sent.push(data); },
  };
  class XMLHttpRequest {
    open() {}
    setRequestHeader() {}
    send() {}
    addEventListener() {}
  }
  const location = {href: 'https://bocasocios.bocajuniors.com.ar/matches/' + MATCH + '/plateas', origin: 'https://bocasocios.bocajuniors.com.ar', pathname: options.pathname || '/matches/' + MATCH + '/plateas', assign: url => navigation.push(url)};
  window.location = location;
  const context = vm.createContext({
    window, self: window, location, XMLHttpRequest, URL, AbortController, setTimeout, clearTimeout,
    console, fetch: async () => { throw new Error('Unexpected network request'); },
  });
  vm.runInContext(source, context, {filename: 'page-api.js'});
  const send = data => {
    for (const fn of listeners.get('message') || []) fn({source: window, origin: location.origin, data});
  };
  const result = async id => {
    for (let i = 0; i < 20; i++) {
      const found = sent.find(data => data.type === 'la-previa:fast-result' && data.id === id);
      if (found) return found;
      await flush();
    }
    throw new Error('Missing fast-result for ' + id + '; sent=' + JSON.stringify(sent));
  };
  const reserve = id => send({type: 'la-previa:fast-reserve', id, matchId: MATCH, sectionId: SECTION});
  return {calls, sent, cache, navigation, send, result, reserve};
}

test('reserva por el contrato de Boca, asigna al socio único y confirma el carrito', async () => {
  const b = browser(); b.reserve('happy');
  const result = await b.result('happy');
  assert.equal(result.outcome, 'reserved');
  const posts = b.calls.filter(call => call.method === 'POST');
  assert.deepEqual(posts.map(({url, body}) => ({url, body})), [
    {url: '/event/seat/reserve/' + SEAT, body: {eventoUbicacionNid: SEAT}},
    {url: routes.f, body: {socioNid: 42, ticketNid: TICKET, abonoNid: null}},
  ]);
  assert.equal(b.calls.filter(call => call.url === '/member/shoppingCart/' + MATCH).length, 2);
  assert.equal(b.navigation.length, 0);
});

test('un carrito previo impide enviar cualquier reserva', async () => {
  const b = browser({initialCart: reservedCart()}); b.reserve('previous');
  const result = await b.result('previous');
  assert.equal(result.outcome, 'blocked');
  assert.equal(b.calls.filter(call => call.method === 'POST').length, 0);
});

test('cancelar durante preflight impide el POST', async () => {
  const gate = deferred();
  const b = browser({get: url => url === routes.wT ? gate.promise : undefined});
  b.reserve('cancel'); await flush();
  b.send({type: 'la-previa:cancel', id: 'cancel'});
  gate.resolve({socios: [{nid: 42, abonoNid: null}]});
  const result = await b.result('cancel');
  assert.equal(result.outcome, 'stopped');
  assert.equal(b.calls.filter(call => call.method === 'POST').length, 0);
});

test('dos pedidos simultáneos no duplican la reserva', async () => {
  const gate = deferred();
  const b = browser({get: url => url === routes.wT ? gate.promise : undefined});
  b.reserve('one'); b.reserve('two'); await flush();
  gate.resolve({socios: [{nid: 42, abonoNid: null}]});
  await b.result('one'); await b.result('two');
  assert.equal(b.calls.filter(call => call.method === 'POST' && call.url.startsWith('/event/seat/reserve/')).length, 1);
});

test('un error de red tras enviar reserva deja resultado incierto sin repetir POST', async () => {
  const b = browser({post: url => { if (url.startsWith('/event/seat/reserve/')) throw new Error('Network Error'); }});
  b.reserve('uncertain');
  const result = await b.result('uncertain');
  assert.equal(result.outcome, 'uncertain');
  assert.equal(b.calls.filter(call => call.method === 'POST').length, 1);
});

for (const status of [401, 429]) test('HTTP ' + status + ' en preflight detiene antes de reservar', async () => {
  const b = browser({get: url => { if (url === routes.wT) throw httpError(status, {codigo: status === 401 ? 'ERROR_TOKEN_INVALIDO' : '429', descripcion: 'Acceso no permitido'}); }});
  b.reserve('http-' + status);
  const result = await b.result('http-' + status);
  assert.equal(result.outcome, 'blocked');
  assert.equal(b.calls.filter(call => call.method === 'POST').length, 0);
});

test('la ruta de asientos del mismo partido permite el flujo', async () => {
  const b = browser({pathname: '/matches/' + MATCH + '/plateas/seats/' + SECTION});
  b.reserve('nested');
  assert.equal((await b.result('nested')).outcome, 'reserved');
});

test('fuera del partido solicitado no consulta ni reserva', async () => {
  const b = browser({pathname: '/matches/999/plateas'});
  b.reserve('wrong-route');
  assert.equal((await b.result('wrong-route')).outcome, 'unavailable');
  assert.equal(b.calls.length, 0);
});

test('un carrito declarado de otro partido bloquea el agregado', async () => {
  const b = browser({initialCart: {eventoNid: 999, items: []}});
  b.reserve('wrong-cart');
  assert.equal((await b.result('wrong-cart')).outcome, 'blocked');
  assert.equal(b.calls.filter(call => call.method === 'POST').length, 0);
});

test('asientos de otro evento no habilitan una reserva', async () => {
  const b = browser({get: url => url === '/event/seat/section/' + SECTION + '/availability'
    ? {evento: {nid: 999}, ubicaciones: [{nid: SEAT}]} : undefined});
  b.reserve('wrong-event');
  assert.equal((await b.result('wrong-event')).outcome, 'unavailable');
  assert.equal(b.calls.filter(call => call.method === 'POST').length, 0);
});

test('el carrito final debe confirmar el mismo ticket y asiento', async () => {
  const cart = reservedCart(); cart.items[0].ubicacion.nid++;
  const b = browser({finalCart: cart}); b.reserve('wrong-seat');
  assert.equal((await b.result('wrong-seat')).outcome, 'uncertain');
  assert.equal(b.calls.filter(call => call.method === 'POST' && call.url.startsWith('/event/seat/reserve/')).length, 1);
});

test('un rechazo explícito de ubicación sólo se reintenta con carrito vacío verificado', async () => {
  const b = browser({finalCart: emptyCart(), post: url => {
    if (url.startsWith('/event/seat/reserve/')) throw httpError(409, {codigo: 'SEAT_UNAVAILABLE', descripcion: 'Ubicación no disponible'});
  }});
  b.reserve('taken');
  assert.equal((await b.result('taken')).outcome, 'taken');
  assert.equal(b.calls.filter(call => call.url === '/member/shoppingCart/' + MATCH).length, 2);
  assert.equal(b.calls.filter(call => call.method === 'POST').length, 1);
});

test('un error de cola 50000 detiene el flujo antes de reservar', async () => {
  const b = browser({get: url => {
    if (url === routes.wT) throw httpError(500, {errorCode: 50000, newRedirectUrl: 'https://queue.example/'});
  }});
  b.reserve('queue');
  assert.equal((await b.result('queue')).outcome, 'blocked');
  assert.equal(b.calls.filter(call => call.method === 'POST').length, 0);
});

test('con varios socios reserva y deja la asignación para el usuario', async () => {
  const cart = reservedCart(); cart.items[0].socioNid = null;
  const b = browser({finalCart: cart, get: url => url === routes.wT
    ? {socios: [{nid: 42}, {nid: 43}]} : undefined});
  b.reserve('members');
  const result = await b.result('members');
  assert.equal(result.outcome, 'reserved');
  assert.equal(result.canContinue, false);
  assert.equal(b.calls.filter(call => call.method === 'POST').length, 1);
});

test('cancelar después del POST confirma el carrito sin asignar ni continuar', async () => {
  const gate = deferred();
  const cart = reservedCart(); cart.items[0].socioNid = null;
  const b = browser({finalCart: cart, post: url => url.startsWith('/event/seat/reserve/') ? gate.promise : undefined});
  b.reserve('late-cancel'); await flush();
  assert.equal(b.calls.filter(call => call.method === 'POST').length, 1);
  b.send({type: 'la-previa:cancel', id: 'late-cancel'});
  gate.resolve({ticket: {nid: TICKET}});
  const result = await b.result('late-cancel');
  assert.equal(result.outcome, 'reserved');
  assert.equal(result.canContinue, false);
  assert.equal(b.calls.filter(call => call.method === 'POST').length, 1);
  assert.equal(b.calls.filter(call => call.url === '/member/shoppingCart/' + MATCH).length, 2);
});
