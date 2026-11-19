# Estado actual

**Corte:** 2026-11-19 · C29 reanudar solo con piezas disponibles (base `main` = `3d0690e`).

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

- **C29 — Reanudar solo con piezas disponibles (2026-11-19):** un proceso posterior (p. ej. Doblado) ya no puede arrancar ni reanudarse mientras el proceso anterior no le haya liberado piezas nuevas. La validación de disponibilidad se aplica también al reanudar una pausa (antes se omitía en `iniciar_sesion_trabajo_operador` cuando existía una sesión pausada). La ficha y el panel de piso ocultan «Continuar sesión pausada» y explican que hay que esperar al proceso anterior; «Cerrar pausa sin producir» sigue disponible para no dejar la operación atrapada. Requiere migración `20261119160000_c29_reanudar_sin_piezas.sql`.
- **C28 — Pausa completa sin reanudar (2026-11-19):** cuando una pausa queda con la operación ya completa pero pendiente el consumo de material (Opción 2), la ficha deja de ofrecer «Continuar sesión pausada» y «Cerrar pausa sin producir». `puedeReanudar` exige que la operación no esté completa; el aviso explica que solo falta asentar el consumo y conserva el formulario de avance, que mantiene las piezas y horas ya declaradas para no restar producción. El panel de piso aplica la misma regla.
- **C27 — Pausa automática por jornada acumulada del día (2026-11-19):** el barrido deja de medir solo la sesión en curso y usa la jornada acumulada del día (8 h netas, comida descontada): descuenta lo ya cerrado y corta la sesión activa cuando el total del día alcanza la jornada. Si el día ya estaba agotado, el trabajo es tiempo extra y lo gobierna la autorización del cierre, no la pausa al iniciar. El cliente ya no compara reloj bruto contra 8 h: consulta al servidor cada 60 s y muestra el error si la consulta falla. Planeación también dispara el barrido. El cierre exige la hora real de conclusión prellenada con el reloj del taller y el panel de horas extra explica el cálculo y ofrece corregir la hora real, justificar o pedir aprobación. Migración `20261119150000`. PR #217.
- **Capacidad visible en días cerrados (2026-11-19):** las horas reales que la RPC conserva en un día sin jornada ya se ven en la matriz semanal de Planeación y en la vista «Carga» del operador: la columna del domingo aparece cuando solo tiene tiempo real registrado y la celda dice «N h reales» en lugar de un `0/0`. En Propuestas, un grupo cuyas únicas filas del horizonte sean de día cerrado con horas reales vuelve a declararse «sin capacidad configurada» en vez de «con capacidad 0». El diagnóstico de reprogramación mantiene el aviso correcto de «sin capacidad» para ese día, y las acciones de la tarjeta del operador recuperan el ancho completo.
- **Fix capacidad en día sin jornada (2026-11-19):** `obtener_carga_capacidad_diaria` conserva las horas reales de un recurso liberado aunque la fecha no tenga jornada (domingo o día cerrado); antes la fila desaparecía al quedar capacidad 0 y saldo ocupado 0, como si el trabajo real se hubiera borrado. Migración `20261119130000`.
- **C18 - Horario laboral (2026-11-16, jornada ajustada por C24):** lunes a viernes 8 h, sábado 4 h, domingo cerrado; matutino y vespertino son etiquetas. La misma regla se aplica en capacidad, planeación, producción y en la jornada del operador.
- **C19 — Cierre por entrega (2026-11-16):** la orden pasa a `CERRADA` al entregar el 100 %, se reabre al anular la nota y el cierre administrativo completa costo y margen.
- **PR #192 — Correcciones QA (2026-11-15):** fechas del negocio en Tijuana, permisos de calidad del operador, cierre excepcional del supervisor, adjuntos, estados, avisos de React y ajustes de accesibilidad.
- **PR #193 — Cobertura y jornada (2026-11-16):** E2E de anulación de nota parcial y liberación de máquina tras pausa; unitarias de fechas sin hora y mensajes de corrida; jornada del operador derivada de `horasJornadaDia`.
- **C20 (2026-11-17):** hora real de finalización en el cierre, pausa automática con bandera «Actualizar avance», corrección de piezas/hora real y control de jornada acumulada por día. PR #195.
- **C24 — Turnos visuales y jornada continua (2026-11-18):** la jornada es continua de 8 h de lunes a viernes, 4 h el sábado y domingo cerrado; matutino y vespertino son solo etiquetas visuales y ya no reparten la capacidad. La capacidad es `equipos × jornada` e ignora `capacidades_recurso_turno`, que queda como legado. Los errores de arranque siempre traen causa exacta (`jornada_cerrada`, `recurso_sin_capacidad`, `recurso_capacidad_excedida`, `recurso_ocupado`) y la app muestra el detalle. PR #203, migración `20261118150000`.
- **C25 — Disponibilidad y ocupación con causa exacta (2026-11-19):** la ocupación de un equipo es física e independiente de la fecha (un solo `en_preparacion`/`en_proceso` por recurso); la fecha solo reparte la capacidad diaria. Al arrancar, el error distingue `jornada_cerrada`, `recurso_sin_equipos`, `recurso_sin_capacidad`, `recurso_ocupado` y `recurso_capacidad_excedida`, y cuando el equipo está ocupado nombra la orden, la operación y el operador. El arranque nunca cancela ni mueve el trabajo de otro operador. Migración `20261119120000`.
- **C21 (2026-11-17):** jornada corrida de 8 h con comida descontada; declaración del tiempo real de cada bloque pausado; corrección cronológica desde el historial; pausas sobrantes marcadas como inválidas; tope de 3 pausas sin avance; dos opciones para el consumo de material y errores en modal con salidas accionables. PR #196.
- **PR #201 — Horas por operación en Planeación (2026-11-18):** la bolsa y el formulario programan cada operación con las horas de su ruteo (`propuesta_item_ruteo.total_horas`); el total de la partida solo se usa cuando hay una única operación. Producción quedó normalizada: O-1126_09 reprogramada y cinco filas históricas corregidas con evento de auditoría.
- **C23 — Producción sin callejones sin salida (2026-11-18):** las horas reales de la partida se derivan de las sesiones (`tiempo_real_minutos` = suma de horas netas no inválidas) en todos los caminos; la corrección de avance aplica delta y topa contra meta y disponible; se puede cerrar o pausar una sesión aunque otra haya completado la operación; el trigger B2 permite descartar sesiones vacías; las pausas huérfanas de órdenes terminadas se cierran con una RPC administrativa auditada; y el administrador ve un diagnóstico de consistencia con aviso de entrega pendiente. Asignación de horas de una operación `en_proceso` ya cubierta por la C24. Migraciones `20261118160000/160100`.
- **Panel del operador — carga de equipos (2026-11-19):** la terminal de piso (`/produccion-piso`) añade la vista «Carga» con la misma tabla Equipo × día de Planeación (`ResumenCargaSemanal`), con conmutador Día/Semana. El operador ve las horas pendientes/capacidad y las libres de cada equipo de la semana en curso sin salir de su panel; el domingo cerrado se explica en lugar de mostrar una tabla vacía. Sin migraciones.
- **Auditoría C25 + Carga (2026-11-19):** «hoy» del espacio del operador usa la fecha de negocio (`America/Tijuana`), así la semana de Carga ya no cambia a las 17:00; un fallo al leer capacidad muestra un aviso local en la pestaña «Carga» sin tumbar la terminal; la barra de pestañas es 2×2 táctil en móvil; `obtener_carga_capacidad_diaria` agrega las sesiones solo de las programaciones del rango con `LEFT JOIN LATERAL` (misma salida y contrato, migración `20261119140000`); el E2E de piso deja de depender del día real (domingo cerrado / lunes abierto) y los scripts de CI pierden el shebang para cargar en Vitest sobre Windows.

## Calidad

- **Unitarias e integración:** Vitest. Último corte completo local (2026-11-19): 335 archivos y 2871 pruebas unitarias en verde; 307 de integración en verde en el corte previo.
- **Base de datos:** 113 archivos pgTAP (2464 pruebas) en verde en CI sobre base limpia (2026-11-19). La base local acumula residuos E2E: los pgTAP tocados se corren focales antes de cerrar.
- **E2E:** Playwright, 73 escenarios en verde con Supabase local. CI ejecuta `e2e-local` sobre un build de producción.
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
- **Migraciones recientes:** C18/C19/C20/C21 están en `main` y fueron aplicadas en remoto por el PO; no reaplicarlas ni usar `db push`.
- **Análisis de UI:** `analisis-ui-configuracion.md` recoge observaciones del PO pendientes de priorizar.

## Documentos relacionados

- [Arquitectura](arquitectura.md) · [Tecnologías](tecnologias.md) · [APIs](apis.md)
- [Contexto](contexto.md) · [Alcance](alcance.md) · [Cuellos de botella](CUELLOS-DE-BOTELLA.md)
