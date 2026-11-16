# Estado actual

**Corte:** 2026-11-16 · `main` = `df65a47` (merge del PR #193).

## Resumen

ORCA MFG ERP v2 está **en producción** para CC Manufacturing Group. Cubre el ciclo completo de manufactura: captura comercial (RFQ, pipeline y propuestas), órdenes de producción, planeación y capacidad, piso de taller, entregas, cobranza, tesorería, compras, gastos, facturación, dashboard por rol, configuración maestra y comentarios/notificaciones.

El código y las migraciones viven en este repositorio; el PO fusiona los PR y aplica las migraciones en Supabase remoto. Ninguna migración se aplica en remoto desde una sesión de agente.

## Módulos operativos

| Módulo | Rutas principales | Estado |
| --- | --- | --- |
| Autenticación y permisos | `/iniciar-sesion`, `/operador` | Operativo |
| Pipeline, RFQ y propuestas | `/pipeline`, `/rfq`, `/propuestas` | Operativo |
| Clientes | `/clientes` | Operativo |
| Inventario y compras | `/inventario`, `/compras` | Operativo |
| Órdenes de producción | `/ordenes`, `/ordenes/[id]` | Operativo |
| Planeación y capacidad | `/planeacion` | Operativo |
| Producción y piso | `/produccion`, `/produccion-piso`, `/produccion-piso/hoja/[ordenId]` | Operativo |
| Entregas | `/entregas`, `/entregas/[id]` | Operativo |
| Cobranza y tesorería | `/cobranza`, `/cobros`, `/tesoreria` | Operativo |
| Compras, gastos y egresos | `/compras`, `/gastos`, `/egresos` | Operativo |
| Facturación | `/facturacion` | Operativo (sin timbrado CFDI) |
| Dashboard por rol | `/dashboard`, `/tablero` (redirección) | Operativo |
| Configuración maestra | `/configuracion` | Operativo |
| Cierre administrativo | `/cierre-administrativo` | Operativo |
| Documentación en producto | `/[lang]/docs/...` | Operativo |

## Últimos cambios relevantes

- **C18 — Horario laboral (2026-11-16):** lunes a viernes 9 h, sábado 4 h, domingo cerrado; turnos matutino/vespertino acotados. La misma regla se aplica en capacidad, planeación, producción y en la jornada del operador.
- **C19 — Cierre por entrega (2026-11-16):** la orden pasa a `CERRADA` al entregar el 100 %, se reabre al anular la nota y el cierre administrativo completa costo y margen.
- **PR #192 — Correcciones QA (2026-11-15):** fechas del negocio en Tijuana, permisos de calidad del operador, cierre excepcional del supervisor, adjuntos, estados, avisos de React y ajustes de accesibilidad.
- **PR #193 — Cobertura y jornada (2026-11-16):** E2E de anulación de nota parcial y liberación de máquina tras pausa; unitarias de fechas sin hora y mensajes de corrida; jornada del operador derivada de `horasJornadaDia`.

## Calidad

- **Unitarias e integración:** Vitest. Último corte completo: 330 archivos y 2 898 pruebas en verde (102 skipped).
- **E2E:** Playwright, 72 escenarios en verde con Supabase local. CI ejecuta `e2e-local` sobre un build de producción.
- **Base de datos:** pgTAP para RPCs, RLS, folios y máquinas de estado.
- **Gates por cambio:** `tsc --noEmit`, ESLint, pruebas proporcionales y E2E de los flujos tocados.

## Entornos

- **Local:** Next.js + Supabase local (Postgres, Auth, Storage, Realtime) con Docker. Los E2E usan loopback y datos temporales aislados.
- **CI:** GitHub Actions con los jobs `cambios`, `verificacion` y `e2e-local`; el PR debe quedar en verde antes de que el PO lo fusione.
- **Producción:** Supabase remoto + despliegue de Next.js. El agente no toca producción ni migraciones remotas.

## Pendientes y límites conocidos

- **CFDI/PAC:** el ERP no timbra facturas; falta definir proveedor y alcance fiscal.
- **Portal de cliente:** módulo preparado en el dominio, sin flujo de producción habilitado.
- **Ajuste manual del costo real (F10):** parcial por decisión del PO.
- **Migraciones recientes:** C18/C19 están en `main`; su aplicación en remoto la controla el PO.
- **Análisis de UI:** `analisis-ui-configuracion.md` recoge observaciones del PO pendientes de priorizar.

## Documentos relacionados

- [Arquitectura](arquitectura.md) · [Tecnologías](tecnologias.md) · [APIs](apis.md)
- [Contexto](contexto.md) · [Alcance](alcance.md) · [Cuellos de botella](CUELLOS-DE-BOTELLA.md)
