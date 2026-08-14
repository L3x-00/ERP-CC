# Sub-fase 7.4 — Operación de piso y E2E

Fecha: 2026-08-14

## Ruta operativa

`/produccion` es una ruta RSC privada. Muestra un Kanban derivado con las columnas Bandeja, En proceso, Pausada, Lista y Entregada; esas etiquetas no se escriben en `ordenes_produccion`.

El panel permite elegir una programación preparada, iniciar una sesión, pausar o finalizar con PIN y registrar la nota de entrega sin datos financieros. El navegador se actualiza por Realtime sin recarga manual.

## Prueba de navegador

`tests/e2e/produccion-piso.spec.ts` prepara datos remotos temporales aislados y después los elimina. Valida:

- acceso con usuario administrador y PIN de operador;
- inicio de sesión sobre un recurso preparado;
- actualización Realtime observada en una segunda sesión de navegador;
- cierre de la partida, avance y liberación de recurso;
- entrega parcial y entrega total con folios `NE-NNNNNN`;
- bitácora de inicio, cierre y entrega; y
- ausencia de campos de precio en los documentos de entrega.
