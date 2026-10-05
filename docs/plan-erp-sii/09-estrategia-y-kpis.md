# B9 — Estrategia de Go Live, UX, KPIs y transferencia

Referencias del documento: §§16 (Go Live progresivo), 17 (UX), 18 (KPIs), 19 (plataforma), 20 (transferencia), 21 (backlog), 22 (glosario), 23 (nota final).
Transversal: sus estándares aplican desde B1; los dashboards y el cierre documental se ejecutan al final de cada Go Live.

---

## 9.1 Go Live progresivo y compuertas de aceptación (§16)

| Go Live | Alcance | Bloque(s) | Compuerta (además de §0.9) |
|---|---|---|---|
| GL1 Comercial | Clientes, RFQ, Propuestas, Usuarios/permisos, Configuración, Actividad | B1, B2, B3, B4 | Uso real de un ciclo completo: cliente → RFQ → propuesta → PDF → envío → seguimiento → aceptación. Producción y Finanzas pueden seguir fuera del ERP |
| GL2 Aceptación + Orden | Convertir revisión aceptada en orden con snapshot confiable | B5 | Orden creada solo desde revisión aceptada; snapshot inmutable; estados derivados |
| GL3 Producción básica | Corridas, iniciar/pausar/continuar/terminar, piezas, tiempo real, bloqueo por máquina | B6 | Un día de producción real sin fugas de estado ni dobles inicios |
| GL4 Entrega | Nota de entrega, parciales, firma/evidencia, cantidades | B7 | Entrega parcial y total reales con AR activada correctamente |
| Después | Facturación/CxC/Cobranza (B8), Portal, Calidad avanzada, Capacidad sofisticada, Inventario, Paneles completos | B8 + backlog | Solo cuando el valor justifique la inversión (§16.5) |

Regla de inversión: no se construye un módulo futuro antes de que su Go Live anterior esté en uso real (aunque el código exista por historia del repo, no se amplía sin justificación).

---

## 9.2 Estándar de UX / interacción (§17)

Checklist aplicable a toda pantalla nueva o modificada (validar con skill `orca-ui-review`):

1. Patrón: **cola de trabajo / lista → ficha / detalle → formulario maestro crear/editar → acción de negocio específica → CRUD de configuración**.
2. Encabezado con entidad + folio + chip de estado; pestañas contextuales.
3. Acciones de negocio cerca de la parte superior; nunca dropdowns genéricos de estado.
4. Tarjetas/resumen para contexto, sin ocultar datos críticos.
5. Formulario para capturar/editar; ficha para entender/operar.
6. Validaciones estructuradas que indican **exactamente qué falta**, por sección (patrón `validar_rfq_listo`, `requisitos_faltantes`).
7. La app "lleva de la mano" sin mago rígido; modos claro/oscuro; densidad escritorio-primero, responsive en piso/tablet.
8. Tokens del sistema (`src/compartido/diseno/tokens.css`), sin colores/tamaños ad hoc.

---

## 9.3 Diccionario formal de KPIs (§18)

Los tres conceptos **nunca se mezclan**: vendido ≠ producido ≠ cobrado. Toda moneda extranjera se convierte a MXN con el **TC congelado del documento origen** (no el TC del día del reporte).

| Área | KPI | Fórmula | Fuente |
|---|---|---|---|
| Ventas | Ventas semana/mes | Σ `total` sin IVA de propuestas en `SALE_CONFIRMED` por fecha de confirmación (excluye TI) | `propuestas`, `propuesta_revisiones` |
| Ventas | Tasa de cierre | propuestas `ACCEPTED/SALE_CONFIRMED` ÷ propuestas `SENT` del periodo | revisiones |
| Ventas | Propuestas en seguimiento | revisión vigente en `SENT/FOLLOW_UP` | revisiones + acciones |
| Producción | Horas reales vs estimadas | Σ horas netas de sesiones ÷ Σ `total_horas` del ruteo del snapshot (por orden/periodo) | `sesiones_trabajo`, snapshot |
| Producción | WIP | órdenes en `EN_PRODUCCION`/`PRODUCCION_COMPLETADA` sin cierre administrativo, valoradas a costo estimado | órdenes + costos |
| Producción | Utilización por máquina | horas de sesión por recurso ÷ capacidad efectiva del periodo (equipos × jornada) | sesiones + capacidades |
| Producción | Piezas producidas | Σ cantidades de la **meta final** por ítem (nunca sumar procesos intermedios) | metas/avance |
| Calidad | Retrabajos | Σ `cantidad_retrabajo` de inspecciones | `inspecciones_calidad` |
| Calidad | Scrap | Σ `cantidad_scrap` + `cantidad_nok` | partidas + inspecciones |
| Calidad | No conformidades | inspecciones `RECHAZADA` | inspecciones |
| Rentabilidad | Rentabilidad por orden | venta reconocida (AR cobrable) − costos reales (material, mano de obra, gastos) | funciones existentes + snapshot |
| Rentabilidad | Margen operativo | margen estimado de la revisión aceptada vs margen real al cierre de orden | revisiones + rentabilidad |
| Cobranza | Cobros del periodo | Σ pagos vigentes (sin transferencias internas) | `pagos_ar` + `movimientos_tesoreria` (B8) |
| Cobranza | Saldo vencido / aging | Σ saldo de AR vencidas por tramos 0-30/31-60/61-90/90+ | AR (existente) |
| Cobranza | Promesas | promesas vigentes/cumplidas/vencidas (cuando B8-F3 exista) | `promesas_pago` |

**Reglas anti doble conteo:**
- Una venta se reconoce **una vez** por revisión aceptada (no por cada revisión ni por cada PDF).
- Producido cuenta piezas finales una sola vez; los avances por proceso son operativos, no KPI de piezas.
- Cobrado cuenta pagos aplicados; los anticipos cuentan al aplicarse, no al facturarse.
- Órdenes internas (TI) se reportan aparte en todas las áreas (ventas = 0).

**Tareas:** RPC/consultas de dashboard actualizadas a `estado_rfq`/nuevos estados (B3/B5), tarjetas de KPIs nuevos (calidad, propuestas en seguimiento, utilización real), pruebas unitarias de fórmulas contra fixtures y E2E de dashboard por rol. Cerrar el diccionario con el PO antes de construir paneles avanzados (§18 "pendiente").

---

## 9.4 Plataforma y arquitectura (§19)

El documento describe la plataforma actual como referencia, no como obligación tecnológica. Este repo (Next.js + Supabase) conserva todas las garantías exigidas: IDs internos, `camelCase` en app, permisos en servidor, transacciones, versionado optimista + idempotencia, archivos privados con acceso temporal. Si en el futuro se migra de plataforma, estas garantías son el contrato funcional a preservar.

---

## 9.5 Transferencia, backlog y documento vivo (§§20–23)

**Criterio de transferencia:** cualquier desarrollador/IA debe poder explicar el flujo RFQ → Propuesta → Orden con este plan + los ADRs, distinguir operación solicitada de ruteo estimado, entender que SENT congela, y preservar IDs/folios/auditoría/idempotencia/archivos privados. Cada bloque deja: doc del bloque, migraciones, pruebas y evidencia.

**Backlog posterior (§21), priorizado:** facturación/CxC/Cobranza (B8), compras/CxP/tesorería (B8), perfiles de inspección por cliente, nomenclatura maestra de archivos DXF/PDF/NC/nests/revisiones, vista de carga semanal por equipo/capacidad, portal cliente, inventario, paneles completos, exportación CSV.

**Documento vivo (§23):** cuando una regla de negocio cambie, **primero** se actualiza la especificación funcional (`docs/ERP_SII_Handoff_Tecnico_Funcional.md` o ADR) y **después** el sistema. Este plan debe actualizarse en la misma operación.

---

## 9.6 Criterios de aceptación del bloque

1. Cada Go Live tiene su compuerta documentada y evidencia en el handoff.
2. Checklist UX aplicado y verificado (skill `orca-ui-review`) en todas las pantallas nuevas.
3. Diccionario de KPIs acordado con el PO; fórmulas con pruebas unitarias; sin doble conteo.
4. Documento del cliente y plan actualizados ante cualquier cambio de regla.

---

## Anexo — Decisiones del cliente (respondidas 2026-10-05)

| # | Tema | Decisión del cliente | Impacto |
|---|---|---|---|
| 1 | Permisos de precio/ruteo | Customer Service edita artículos, precios y ruteo; costo interno y margen solo Management/Admin | B1/B4 |
| 2 | Visibilidad costo/margen | Solo Management/Admin | B1/B4 |
| 3 | Órdenes internas (TI) | Alta directa sin propuesta comercial, con autorización; se registran, agendan y conservan horas/costos | B5 |
| 4 | Archivos para LISTO | Configurable por proceso; RFQ listo sin archivo cuando el proceso no lo requiera | B1/B3 |
| 5 | Primera pieza | Configurable por proceso; inicialmente activa en Láser Fibra, Láser CO₂, Doblado CNC, CNC Router y Maquinado/Fabricación; Soldadura y Acabado configurables después | B6 |
| 6 | Inspección lotes grandes | Configurable por proceso (10 o 20) | B6 |
| 7 | Pausa > 1 h | La máquina puede reclamarse para otro trabajo automáticamente, con trazabilidad | B6 |
| 8 | Horas extra | Al exceder la jornada configurada del turno (no hardcodear 8 h); autoriza Management/Admin; **pendiente definir jornada exacta** | B6 |
| 9 | Cierre administrativo | Al 100 % de cantidades entregadas; el cobro se controla aparte en CxC | B5 |
| 10 | Entregas | Siempre: cantidades, entrega/recibe y fecha. Industrial: hoja con sello/fecha/firma + digitalización; no industrial: preferencia firma digital; evidencia fotográfica disponible; futuro configurable por cliente | B7 |
| 11 | Margen mínimo | Sin mínimo bloqueante por ahora | B4 |

**Decisiones técnicas ya tomadas por el plan (no requieren cliente):** `CNC-MMYY_XX` 2 dígitos según documento con tope y ajuste administrativo; PDF server-side tras spike B4.6; la cola RFQ reemplaza el Kanban por `etapa`; RFQ `CONVERTED` no retorna; `PENDING_FINANCIAL` reservado hasta B8; costo de máquina manual (motor postergado); perfiles de inspección por cliente en fase posterior.

**Único pendiente real del cliente:** la jornada exacta por turno (para horas extra), que no bloquea B0/B1.
