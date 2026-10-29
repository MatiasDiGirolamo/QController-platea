# QController platea

Extensión para Chrome que busca una platea en los sectores elegidos de Boca Socios, intenta reservarla y deja el pago en manos del usuario.

## Instalación

1. Descargá o cloná este repositorio.
2. Abrí `chrome://extensions` y activá el modo de desarrollador.
3. Elegí **Cargar descomprimida** y seleccioná la carpeta que contiene `manifest.json`.
4. Abrí o recargá Boca Socios. El panel debe mostrar **QCONTROLLER / Platea / v0.9.0**.

Si ya la tenés instalada desde esta carpeta, pulsá **Recargar** en la extensión y recargá la página.

## Uso

Marcá los sectores, elegí el intervalo y pulsá **Iniciar búsqueda**. Hay una opción de 1 segundo; se respeta la selección guardada. El valor por defecto es 3 segundos.

Cuando detecta disponibilidad, consulta los asientos del sector y elige uno al azar. Usa el cliente HTTP del sitio para enviar una reserva, asignarla si hay un único socio habilitado y verificar el mismo ticket y asiento en el carrito. Abre el paso siguiente para completar el pago manualmente.

Si hay varios socios o faltan datos de invitado, deja esos pasos para el usuario. Si el resultado de una reserva queda incierto, se detiene sin repetir automáticamente el agregado. Detener no revierte una solicitud ya enviada.

No evita colas ni CAPTCHAs. No almacena tokens ni contraseñas. No garantiza conseguir una entrada ni evitar restricciones del sitio. La versión se probó con respuestas simuladas; no se ejecutó una reserva real para validarla.

## Pruebas

Requiere Node.js, sin dependencias adicionales:

```sh
node --test tests/page-api.test.cjs tests/monitor-fast.test.cjs
```

## Archivos

- `monitor.js`: panel, selección de sectores y coordinación del flujo.
- `page-api.js`: integración con el cliente HTTP de Boca.
- `background.js`: recuperación mediante recarga sin caché.
- `LEEME.txt`: instrucciones detalladas.
- `research/CONTRATO.md`: referencias del contrato HTTP comprobado.

Proyecto independiente, sin afiliación con el Club Atlético Boca Juniors.
