# Contrato comprobado de Boca

Fecha: 29/10/2026. Build público: `ZjtPdUbA-bZTrUy51xKDH`.

Fuentes descargadas sin sesión y sin ejecutar solicitudes privadas:

- https://bocasocios.bocajuniors.com.ar/_next/static/ZjtPdUbA-bZTrUy51xKDH/_buildManifest.js
- https://bocasocios.bocajuniors.com.ar/_next/static/chunks/pages/matches/[matchId]/plateas/seats/[sectionId]-14330b8e27cbb482.js
- https://bocasocios.bocajuniors.com.ar/_next/static/chunks/3439-475fa89d6484ccba.js
- https://bocasocios.bocajuniors.com.ar/_next/static/chunks/8635-1acc190f86d18398.js
- https://bocasocios.bocajuniors.com.ar/_next/static/chunks/7243-ddb1335e09b2ad50.js

Módulos: 12033 = cliente HTTP del sitio; 28275 = rutas; 94578 = QueryClient; 57711 = claves de consultas; 5632 = router Next; 63628 = editor de invitado.

1. GET `/event/:matchId/seat/section/availability` devuelve `evento` y `secciones`.
2. GET `/event/seat/section/:sectionId/availability` devuelve `evento` y `ubicaciones` disponibles.
3. GET `/member/shoppingCart/:matchId` devuelve `items`, `eventoNid` opcional y tiempo restante.
4. GET `/event/seat/availability/buy` devuelve `socios` habilitados.
5. POST `/event/seat/reserve/:seatId`, JSON `{eventoUbicacionNid: seatId}`. La pantalla usa `data.ticket.nid` como ticket agregado. No se envía matchId en este body.
6. Si socios.length === 1, POST `/event/seat/assignPurchase`, JSON `{socioNid, ticketNid, abonoNid}`. Para invitado (`tipoTarifaNid === -5`) se abre el editor de datos.
7. Se refresca el carrito. Continuar requiere al menos un item y todos con socioNid. La extensión exige exactamente un item y verifica ticket y asiento.
8. Navegación interna a `/matches/:matchId/purchase?from=plateas`. Esto no envía un pago.

El cliente HTTP aplica los encabezados vigentes de autenticación y de cola. La extensión no muestra ni persiste sus valores. Si cambia la versión y los módulos/rutas no coinciden, el camino directo queda deshabilitado antes de enviar una reserva.
