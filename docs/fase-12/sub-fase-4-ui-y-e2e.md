# Sub-fase 12.4 — Hilos, centro de notificaciones y E2E

## UI funcional

- `HiloComentarios` se incrusta en órdenes, fichas de clientes y tarjetas de
  cotización. Incluye autocompletado `@`, texto accesible, contador, historial,
  fecha, indicador de edición y eliminación lógica autorizada.
- `CentroNotificacionesHeader` está presente en las zonas privada y de panel,
  muestra badge de no leídas, lista reciente y navegación solo a enlaces
  internos conocidos.
- Las órdenes aceptan `?ordenId=` para abrir automáticamente el contexto del
  hilo al llegar desde una notificación.

## Gate de navegador

`tests/e2e/comentarios-notificaciones.spec.ts` valida, cuando se habilita de
forma explícita, el flujo Vendedor → comentario con `@Gerente` → trigger de
notificación → lectura desde una segunda sesión → navegación a la orden. Usa
marcadores efímeros y elimina sus filas al terminar.

Sin `E2E_HABILITAR_PRUEBAS_REMOTAS=si` y credenciales de dos usuarios, el gate
se omite deliberadamente y no toca datos externos.
