# Caracterización y baseline — Corte 0

Fecha local: 2026-10-07. Alcance: decisiones `DC-01..DC-15`, contratos compartidos y primera rebanada visual RFQ. Toda la evidencia corresponde al stack local; no prueba remoto, despliegue ni aceptación del cliente.

## Contratos caracterizados

| Riesgo | Prueba/evidencia | Resultado |
| --- | --- | --- |
| Navegar o editar un RFQ crea una propuesta implícita | `tests/e2e/propuestas-flujo.spec.ts` navega Resumen/Ítems/Archivos y verifica cero propuestas; `tests/e2e/rfq-flujo.spec.ts` edita un RFQ y vuelve a verificar cero antes de cualquier acción explícita | Verde |
| Reemplazar un archivo pierde la versión anterior | `tests/e2e/archivos-cliente.spec.ts` comprueba versiones 1/2, una sola vigente y `reemplaza_a` | Verde |
| Una revisión posterior altera o impide aceptar la revisión exacta | `tests/e2e/propuestas-flujo.spec.ts` crea A/B, congela A y acepta A explícitamente | Verde |
| Orden no conserva snapshot/identidad de revisión | `tests/e2e/ordenes-estados-sii.spec.ts` recorre revisión aceptada, Orden, producción y cierre | Verde |
| Reintentos/concurrencia crean efectos duplicados | `tests/integracion/concurrencia-estricta.test.ts` comprueba idempotencia/concurrencia vigente, incluido un único consumo exitoso ante stock competido | Verde, contrato legado |
| Consumo no conserva el costo leído | `tests/unitarias/ordenes-servicio.test.ts` y `ordenes-esquemas.test.ts` fijan `costo_unitario_momento` y cantidades | Verde, contrato legado; aún faltan moneda/TC/unidad de DC-14 |

## Ejecuciones locales

- Lista RFQ: `rfq-cola-lista.test.ts`, 5/5.
- TypeScript: `pnpm typecheck`, cero errores tras la revisión cruzada.
- ESLint focal sobre componente y cinco pruebas afectadas: cero errores/advertencias.
- E2E de regresión por retirar tablero: aceptación comercial (dos escenarios), Realtime y RFQ, 4/4.
- E2E de caracterización: archivos, Orden y Propuestas, 3/3 después de ajustar la caracterización a los estados actualmente editables.
- Unitarias de consumo/Orden: 34/34.
- Integración de concurrencia vigente: 3/3.
- Claude reportó además 971/971 unitarias en su entrega; Codex revisó el diff y repitió los gates focales anteriores.

## Baseline visual RFQ

Evidencia local: `.ai-shared/qa/observaciones-cliente-2026-10-07/visual-baseline/`.

| Ancho | Claro | Oscuro | Desbordamiento de página | Error de consola |
| --- | --- | --- | --- | --- |
| 320 | capturado | capturado | no | no |
| 768 | capturado | capturado | no | no |
| 1024 | capturado | capturado | no | no |
| 1440 | capturado | capturado | no | no |

Revisión visual: la cola abre únicamente como lista; jerarquía, filtros y estados son legibles en ambos temas. En 320/768 px la tabla mantiene su desplazamiento dentro del contenedor sin ensanchar la página. El rediseño de colores/tokens y las tarjetas del Resumen pertenecen a las siguientes rebanadas de C1.1.

## Hallazgo de caracterización

`CV-01 — RFQ bloqueado antes de Rev A` (funcional, medio): la ficha deshabilita la edición cuando el RFQ ya está `READY_FOR_PROPOSAL`, aunque `DC-05` fija la frontera de congelamiento al crear Propuesta Rev A. No se cambió dentro de la rebanada de lista para evitar mezclar estados con UI; debe resolverse y probarse en C2.1 junto con el snapshot/congelamiento atómico.

## Límites pendientes

- El consumo actual todavía descuenta inventario y solo congela costo; este baseline sirve para demostrar el cambio de C6, no implica cumplimiento de DC-12/DC-14.
- La aceptación y creación de Orden siguen separadas; el baseline sirve para C4.1 y no implica que `Orden pendiente` ya exista.
- Las capturas son evidencia técnica local y requieren revisión final del Product Owner después de completar tokens y Resumen.
