// Puente en el contexto de Boca. Usa el cliente HTTP y la sesión que ya usa el sitio.
// Contratos comprobados en el build público ZjtPdUbA-bZTrUy51xKDH (29/10/2026).
(() => {
  'use strict';
  const pattern = /^\/event\/\d+\/seat\/section\/availability$/;
  const pending = new WeakMap();
  let request = null, runtime = null, job = null, pollController = null;
  const {open, setRequestHeader, send} = XMLHttpRequest.prototype;
  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    let parsed;
    try { parsed = new URL(url, location.href); } catch {}
    if (String(method).toUpperCase() === 'GET' && parsed?.origin === 'https://bocasocios-gw.bocajuniors.com.ar' && pattern.test(parsed.pathname)) pending.set(this, {url: parsed.href, headers: {}});
    else pending.delete(this);
    return open.call(this, method, url, ...rest);
  };
  XMLHttpRequest.prototype.setRequestHeader = function (name, value) {
    const entry = pending.get(this);
    if (entry) entry.headers[name] = value;
    return setRequestHeader.call(this, name, value);
  };
  XMLHttpRequest.prototype.send = function (...args) {
    if (pending.has(this)) request = pending.get(this);
    return send.apply(this, args);
  };
  function site() {
    try {
      if (!runtime) {
        const chunks = window.webpackChunk_N_E;
        if (!Array.isArray(chunks)) return null;
        chunks.push([['la-previa-' + Date.now()], {}, require => { runtime = require; }]);
      }
      if (!runtime) return null;
      const api = runtime(12033).ZP, paths = runtime(28275);
      if (typeof api?.get !== 'function' || typeof api?.post !== 'function' || paths.m1 !== '/event/seat/reserve/{{seatId}}' || paths.f !== '/event/seat/assignPurchase' || paths.gr !== '/member/shoppingCart') return null;
      const cache = runtime(94578).Z, keys = runtime(57711).j;
      if (typeof cache?.setQueryData !== 'function' || typeof keys?.SHOPPING_CART_BY_ID !== 'string') return null;
      return {api, paths, cache, keys};
    } catch { return null; }
  }
  function routeMatch(matchId) {
    return new RegExp('^/matches/' + matchId + '/plateas(?:/seats/\\d+)?/?$').test(location.pathname);
  }
  function validId(id) { return Number.isSafeInteger(Number(id)) && Number(id) > 0; }
  function errorInfo(error) {
    let code;
    try { code = error.errorCode?.(); } catch {}
    code = String(code ?? error.response?.data?.codigo ?? error.response?.data?.errorCode ?? '');
    const status = Number(error.response?.status) || 0;
    const message = String(error.response?.data?.descripcion ?? error.message ?? 'Error de Boca');
    return {status, code, message, blocked: [401,403,429].includes(status) || ['ERROR_TOKEN_INVALIDO','50000','429'].includes(code)};
  }
  // Boca puede omitir eventoNid; la URL del carrito ya incluye el partido.
  // Si lo devuelve, debe coincidir; después del POST se verifican además ticket y asiento.
  function cartValid(cart, matchId) { return Array.isArray(cart?.items) && (cart.eventoNid == null || Number(cart.eventoNid) === Number(matchId)); }
  function syncCart(context, matchId, cart) {
    context.cache.setQueryData([context.keys.SHOPPING_CART_BY_ID, {matchId: String(matchId)}], cart);
  }
  async function reserve(data) {
    if (job) return {outcome: 'busy'};
    const context = site();
    if (!context || !validId(data.matchId) || !validId(data.sectionId) || !routeMatch(data.matchId)) return {outcome: 'unavailable'};
    const current = {cancelled: false, postStarted: false, controller: new AbortController()};
    job = current;
    const {api, paths} = context, matchId = Number(data.matchId), sectionId = Number(data.sectionId);
    const options = {timeout: 4500, signal: current.controller.signal};
    const cartUrl = paths.gr + '/' + matchId;
    let seatId, ticketId;
    try {
      // No se reutiliza un carrito viejo: todos los controles previos son lecturas en paralelo.
      const [cartResponse, sectionsResponse, seatsResponse, membersResponse] = await Promise.all([
        api.get(cartUrl, options),
        api.get(paths.fe.replace('{{matchId}}', matchId), options),
        api.get(paths.yJ.replace('{{sectionId}}', sectionId), options),
        api.get(paths.wT, options)
      ]);
      if (current.cancelled || !routeMatch(matchId)) return {outcome: 'stopped'};
      const cart = cartResponse.data, sections = sectionsResponse.data, seats = seatsResponse.data, members = membersResponse.data;
      if (!cartValid(cart, matchId)) return {outcome: 'blocked', message: 'No pude verificar el carrito de este partido.'};
      if (cart.items.length) return {outcome: 'blocked', message: 'Ya hay entradas en el carrito. Revisalas manualmente.'};
      if (Number(sections?.evento?.nid) !== matchId || Number(seats?.evento?.nid) !== matchId || !Array.isArray(sections.secciones) || !Array.isArray(seats.ubicaciones) || !Array.isArray(members?.socios)) return {outcome: 'unavailable'};
      const section = sections.secciones.find(s => s.nid === sectionId && s.activa === true && s.hayDisponibilidad === true);
      if (!section || !seats.ubicaciones.length) return {outcome: 'empty'};
      const seatsAvailable = seats.ubicaciones.filter(s => validId(s.nid));
      if (!seatsAvailable.length) return {outcome: 'empty'};
      seatId = seatsAvailable[Math.floor(Math.random()*seatsAvailable.length)].nid;
      // Desde aquí un error de red es incierto: nunca se repite automáticamente este POST.
      current.postStarted = true;
      const reserved = await api.post(paths.m1.replace('{{seatId}}', seatId), {eventoUbicacionNid: seatId}, {timeout: 10000});
      ticketId = reserved.data?.ticket?.nid;
      if (!validId(ticketId)) return {outcome: 'uncertain', message: 'Boca respondió al agregado sin un ticket verificable. Revisá el carrito.'};
      let assignmentError = false, guest = false;
      if (!current.cancelled && members.socios.length === 1) {
        const member = members.socios[0];
        try {
          const assigned = await api.post(paths.f, {socioNid: member.nid, ticketNid: ticketId, abonoNid: member.abonoNid}, {timeout: 10000});
          guest = assigned.data?.tipoTarifaNid === -5;
          if (guest) {
            // Mismo editor de datos de invitado que abre la pantalla de Boca.
            try { runtime(63628).Z.getState().setCurrentEditTicket({ticketNid: ticketId, memberName: member.nombre}); } catch {}
          }
        } catch { assignmentError = true; }
      }
      const confirmed = (await api.get(cartUrl, {timeout: 4500})).data;
      if (!cartValid(confirmed, matchId)) return {outcome: 'uncertain', message: 'No pude verificar el carrito después del agregado.'};
      syncCart(context, matchId, confirmed);
      const item = confirmed.items.find(i => Number(i.nid) === Number(ticketId) && Number(i.ubicacion?.nid) === Number(seatId));
      if (!item) return {outcome: 'uncertain', message: 'El ticket no figura confirmado en el carrito. Revisalo; no se repite la reserva.'};
      return {outcome: 'reserved', seatId, ticketId, count: confirmed.items.length, sectionId,
        canContinue: !current.cancelled && !assignmentError && !guest && confirmed.items.length === 1 && !!item.socioNid};
    } catch (error) {
      const info = errorInfo(error);
      if (!current.postStarted) return current.cancelled ? {outcome: 'stopped'} : {outcome: info.blocked ? 'blocked' : 'unavailable', message: info.message};
      // Solo un rechazo explícito de ubicación, seguido de carrito vacío, habilita otro intento.
      if (!ticketId && !info.blocked && /ubicaci[oó]n no disponible/i.test(info.message)) {
        try {
          const cart = (await context.api.get(cartUrl, {timeout: 4500})).data;
          if (cartValid(cart, matchId) && !cart.items.length) return {outcome: 'taken'};
        } catch {}
      }
      return {outcome: 'uncertain', message: 'No pude confirmar el resultado de la reserva. Revisá el carrito; no se repite el agregado.'};
    } finally {
      current.controller.abort();
      if (job === current) job = null;
    }
  }
  async function poll(data) {
    if (pollController) return {error: 'ocupado'};
    const controller = new AbortController();
    pollController = controller;
    const timeout = setTimeout(() => controller.abort(), 4500);
    try {
      const context = site();
      let body;
      if (context && validId(data.matchId) && routeMatch(data.matchId)) {
        body = (await context.api.get(context.paths.fe.replace('{{matchId}}', data.matchId), {signal: controller.signal, timeout: 4500})).data;
      } else {
        if (!request || !validId(data.matchId) || !new URL(request.url).pathname.startsWith('/event/' + data.matchId + '/')) return {error: 'sin-consulta'};
        const response = await fetch(request.url, {headers: request.headers, credentials: 'include', cache: 'no-cache', signal: controller.signal});
        if (!response.ok) return {error: 'http-' + response.status, blocked: [401,403,429].includes(response.status)};
        body = await response.json();
      }
      if (!Array.isArray(body?.secciones)) return {error: 'formato'};
      return {fastReady: !!context, sections: body.secciones.map(s => ({nid: Number.isSafeInteger(s.nid) ? s.nid : null, codigo: String(s.codigo), activa: s.activa === true, libre: s.hayDisponibilidad === true}))};
    } catch (error) {
      const info = errorInfo(error);
      return {error: info.status ? 'http-' + info.status : 'red', blocked: info.blocked};
    } finally {
      clearTimeout(timeout);
      if (pollController === controller) pollController = null;
    }
  }
  window.addEventListener('message', async event => {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || typeof data.type !== 'string') return;
    const reply = (type, result) => window.postMessage({type, id: data.id, ...result}, location.origin);
    if (data.type === 'la-previa:cancel') {
      pollController?.abort();
      if (job) { job.cancelled = true; job.controller.abort(); }
    } else if (data.type === 'la-previa:poll') {
      reply('la-previa:availability', await poll(data));
    } else if (data.type === 'la-previa:fast-reserve') {
      reply('la-previa:fast-result', await reserve(data));
    } else if (data.type === 'la-previa:navigate') {
      // Solo navega a las dos pantallas verificadas del mismo partido. Nunca envía pagos.
      if (!validId(data.matchId) || !routeMatch(data.matchId) || (data.page !== 'purchase' && !validId(data.sectionId))) return reply('la-previa:navigation', {ok: false});
      const path = '/matches/' + data.matchId + (data.page === 'purchase' ? '/purchase?from=plateas' : '/plateas/seats/' + data.sectionId);
      try {
        if (!site()) throw new Error('sin-cliente');
        const router = runtime(5632).default;
        const ok = await router.push(path);
        reply('la-previa:navigation', {ok: ok !== false});
      } catch { reply('la-previa:navigation', {ok: false}); }
    }
  });
})();
