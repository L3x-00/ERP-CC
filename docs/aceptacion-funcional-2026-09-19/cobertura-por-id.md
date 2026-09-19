# Cobertura de aceptación por ID del catálogo y OBS — 2026-09-19

Estado de **cobertura** = inventario vigente (matriz `COBERTURA_IMPLEMENTACION_ACTUAL.csv`).
Estado de **ejecución** = evidencia real de esta entrega (E2E de navegador contra Supabase local,
runtime SQL en PGlite o unitarias). Una capacidad con cobertura `completo` pero sin flujo de
navegador ejecutado queda como inventario verificado, no como aceptación E2E.

- Cobertura global: **57 completo · 68 parcial · 38 ausente · 1 no verificable estático** (164).
- Ejecución E2E de navegador: **14/14** pruebas locales (`tests/e2e/*.spec.ts`), incluida la
  aceptación comercial nueva (`aceptacion-comercial.spec.ts`).
- Runtime SQL aislado: `verificar-rfq0506-wiring` 12/12, `verificar-ti-aprobacion-ar` 5/5,
  `verificar-dashboard-ti` 7/7, `verificar-comercial-rfq` 3/3, `verificar-bancos-pagos`.
- Unitarias: 614/614. Gates: typecheck 0 · lint 0 · build 17 rutas.

| ID | Capacidad | Cobertura | Evidencia de ejecución |
|---|---|---|---|
| **ACC** | *(módulo)* | | |
| ACC-01 | Acceso por identidad | completo | login por rol: E2E local 14/14 (`pnpm test:e2e`) (dashboard-roles/configuracion) |
| ACC-02 | Captura y rechazo de PIN | completo | PIN válido: E2E local 14/14 (`pnpm test:e2e`) (produccion-piso); rechazo de PIN inválido no ejecutado |
| ACC-03 | Navegación administrativa | completo | login por rol: E2E local 14/14 (`pnpm test:e2e`) (dashboard-roles/configuracion) |
| ACC-04 | Cambio de vista y cierre de sesión | completo | login por rol: E2E local 14/14 (`pnpm test:e2e`) (dashboard-roles/configuracion) |
| ACC-05 | Identidad en taller y confirmación de cierre | completo | cierre por PIN: E2E local 14/14 (`pnpm test:e2e`) (produccion-piso) |
| ACC-06 | Actualización diaria del tipo de cambio | parcial | TC y persistencia: E2E local 14/14 (`pnpm test:e2e`) (configuracion-flujo) |
| ACC-07 | Carga y reintento | parcial | inventario estático (matriz 164) |
| ACC-08 | Disponibilidad compartida de registros | no_verificable_estatico | segunda vista/Realtime: E2E local 14/14 (`pnpm test:e2e`) (cobranza/planeacion/gastos/piso) |
| **DAS** | *(módulo)* | | |
| DAS-01 | Resumen comercial mensual | completo | E2E local 14/14 (`pnpm test:e2e`) (dashboard-roles) + PGlite aislado (harness .ai-shared/qa/cobertura) (verificar-dashboard-ti) |
| DAS-02 | Gastos y margen global | completo | E2E local 14/14 (`pnpm test:e2e`) (dashboard-roles) + PGlite aislado (harness .ai-shared/qa/cobertura) (verificar-dashboard-ti) |
| DAS-03 | Situación de las órdenes | completo | E2E local 14/14 (`pnpm test:e2e`) (dashboard-roles) + PGlite aislado (harness .ai-shared/qa/cobertura) (verificar-dashboard-ti) |
| DAS-04 | Situación de cartera | completo | E2E local 14/14 (`pnpm test:e2e`) (dashboard-roles) + PGlite aislado (harness .ai-shared/qa/cobertura) (verificar-dashboard-ti) |
| DAS-05 | Rendimiento del pipeline | completo | E2E local 14/14 (`pnpm test:e2e`) (dashboard-roles) + PGlite aislado (harness .ai-shared/qa/cobertura) (verificar-dashboard-ti) |
| DAS-06 | Seguimientos y distribución del gasto | completo | E2E local 14/14 (`pnpm test:e2e`) (dashboard-roles) + PGlite aislado (harness .ai-shared/qa/cobertura) (verificar-dashboard-ti) |
| **CLI** | *(módulo)* | | |
| CLI-01 | Alta y edición del cliente | completo | unitarias (614/614) |
| CLI-02 | Búsqueda y filtros | completo | unitarias (614/614) |
| CLI-03 | Listado y acceso a historial | completo | unitarias (614/614) |
| CLI-04 | Disponibilidad de crédito | completo | unitarias (614/614) |
| CLI-05 | Tier automático por consumo | completo | unitarias (614/614) |
| CLI-06 | Tier inicial temporal | completo | unitarias (614/614) |
| CLI-07 | Historial de órdenes | parcial | inventario estático (matriz 164) |
| CLI-08 | Repetición de un trabajo | ausente | inventario estático (matriz 164) |
| **RFQ** | *(módulo)* | | |
| RFQ-01 | Cotización multilínea | completo | E2E local 14/14 (`pnpm test:e2e`) (aceptacion-comercial) + PGlite aislado (harness .ai-shared/qa/cobertura) |
| RFQ-02 | Alta rápida de cliente | completo | E2E local 14/14 (`pnpm test:e2e`) (aceptacion-comercial) + PGlite aislado (harness .ai-shared/qa/cobertura) |
| RFQ-03 | Condiciones y descuento del cliente | completo | E2E local 14/14 (`pnpm test:e2e`) (aceptacion-comercial) + PGlite aislado (harness .ai-shared/qa/cobertura) |
| RFQ-04 | Gestión de líneas | completo | E2E local 14/14 (`pnpm test:e2e`) (aceptacion-comercial) + PGlite aislado (harness .ai-shared/qa/cobertura) |
| RFQ-05 | Áreas y procesos por línea | completo | E2E local 14/14 (`pnpm test:e2e`) (aceptacion-comercial) + PGlite aislado (harness .ai-shared/qa/cobertura) |
| RFQ-06 | Trabajo externo | completo | E2E local 14/14 (`pnpm test:e2e`) (aceptacion-comercial) + PGlite aislado (harness .ai-shared/qa/cobertura) |
| RFQ-07 | Estados comerciales | completo | inventario estático (matriz 164) |
| RFQ-08 | Fechas de envío y seguimiento | parcial | inventario estático (matriz 164) |
| RFQ-09 | Identificación de trabajos internos | completo | E2E local 14/14 (`pnpm test:e2e`) (aceptacion-comercial, TI) + PGlite aislado (harness .ai-shared/qa/cobertura) (verificar-ti-aprobacion-ar) |
| RFQ-10 | Folio comercial mensual | completo | E2E local 14/14 (`pnpm test:e2e`) (aceptacion-comercial) + PGlite aislado (harness .ai-shared/qa/cobertura) |
| RFQ-11 | Moneda e impuesto de cotización | completo | unitarias (614/614) |
| RFQ-12 | Etiquetas múltiples | completo | unitarias (614/614) + E2E local 14/14 (`pnpm test:e2e`) (importe/filtros/etiquetas) |
| RFQ-13 | Búsqueda y combinación de filtros | completo | unitarias (614/614) + E2E local 14/14 (`pnpm test:e2e`) (importe/filtros/etiquetas) |
| RFQ-14 | Resumen de pipeline | completo | unitarias (614/614) + E2E local 14/14 (`pnpm test:e2e`) (importe/filtros/etiquetas) |
| RFQ-15 | Aprobación comercial integrada | completo | E2E local 14/14 (`pnpm test:e2e`) (aceptacion-comercial) + PGlite aislado (harness .ai-shared/qa/cobertura) |
| RFQ-16 | Autorización por límite de crédito | ausente | inventario estático (matriz 164) |
| RFQ-17 | Edición posterior y aviso a taller | completo | inventario estático (matriz 164) |
| RFQ-18 | Retiro de cotización sin orden | completo | unitarias (614/614) + PGlite aislado (harness .ai-shared/qa/cobertura) (verificar-comercial-rfq) |
| RFQ-19 | Archivos de solicitud | parcial | inventario estático (matriz 164) |
| **COT** | *(módulo)* | | |
| COT-01 | Cálculo dentro de la cotización | completo | unitarias (614/614) |
| COT-02 | Procesos acumulables | completo | unitarias (614/614) |
| COT-03 | Material y cantidad | completo | unitarias (614/614) |
| COT-04 | Lectura geométrica DXF | completo | unitarias (614/614) |
| COT-05 | Compatibilidad de geometrías DXF | completo | unitarias (614/614) |
| COT-06 | EPS y AI con captura manual | completo | unitarias (614/614) |
| COT-07 | Costo de corte láser | completo | unitarias (614/614) |
| COT-08 | Costo de router | completo | unitarias (614/614) |
| COT-09 | Costo de doblado | completo | unitarias (614/614) |
| COT-10 | Fabricación y otros costos | completo | unitarias (614/614) |
| COT-11 | Precio y recargo | completo | unitarias (614/614) |
| **ORD** | *(módulo)* | | |
| ORD-01 | Listado y filtros | parcial | E2E local 14/14 (`pnpm test:e2e`) (ordenes-flujo-completo/produccion-piso) |
| ORD-02 | Resumen operativo e interno | ausente | E2E local 14/14 (`pnpm test:e2e`) (ordenes-flujo-completo/produccion-piso) |
| ORD-03 | Detalle integral | ausente | E2E local 14/14 (`pnpm test:e2e`) (ordenes-flujo-completo/produccion-piso) |
| ORD-04 | Alta administrativa base | parcial | E2E local 14/14 (`pnpm test:e2e`) (ordenes-flujo-completo/produccion-piso) |
| ORD-05 | Edición de orden | ausente | E2E local 14/14 (`pnpm test:e2e`) (ordenes-flujo-completo/produccion-piso) |
| ORD-06 | Captura de trabajo heredado | ausente | E2E local 14/14 (`pnpm test:e2e`) (ordenes-flujo-completo/produccion-piso) |
| ORD-07 | Partes y metas | parcial | E2E local 14/14 (`pnpm test:e2e`) (ordenes-flujo-completo/produccion-piso) |
| ORD-08 | Sincronización comercial | ausente | E2E local 14/14 (`pnpm test:e2e`) (ordenes-flujo-completo/produccion-piso) |
| ORD-09 | Nuevos archivos durante ejecución | ausente | E2E local 14/14 (`pnpm test:e2e`) (ordenes-flujo-completo/produccion-piso) |
| ORD-10 | Eliminación administrativa | parcial | E2E local 14/14 (`pnpm test:e2e`) (ordenes-flujo-completo/produccion-piso) |
| ORD-11 | Comparativa de desempeño | ausente | E2E local 14/14 (`pnpm test:e2e`) (ordenes-flujo-completo/produccion-piso) |
| ORD-12 | Estados y fechas operativas | parcial | inventario estático (matriz 164) |
| **PRD** | *(módulo)* | | |
| PRD-01 | Tableros de trabajo | parcial | E2E local 14/14 (`pnpm test:e2e`) (produccion-piso/ordenes-flujo-completo) + unitarias (614/614) (horas netas) |
| PRD-02 | Filtrar y agrupar por área | parcial | E2E local 14/14 (`pnpm test:e2e`) (produccion-piso/ordenes-flujo-completo) + unitarias (614/614) (horas netas) |
| PRD-03 | Tarjeta de trabajo | parcial | E2E local 14/14 (`pnpm test:e2e`) (produccion-piso/ordenes-flujo-completo) + unitarias (614/614) (horas netas) |
| PRD-04 | Preparación e inicio | parcial | E2E local 14/14 (`pnpm test:e2e`) (produccion-piso/ordenes-flujo-completo) + unitarias (614/614) (horas netas) |
| PRD-05 | Pausa motivada | completo | E2E local 14/14 (`pnpm test:e2e`) (produccion-piso/ordenes-flujo-completo) + unitarias (614/614) (horas netas) |
| PRD-06 | Reanudación con contexto | parcial | E2E local 14/14 (`pnpm test:e2e`) (produccion-piso/ordenes-flujo-completo) + unitarias (614/614) (horas netas) |
| PRD-07 | Sesión de trabajo | parcial | E2E local 14/14 (`pnpm test:e2e`) (produccion-piso/ordenes-flujo-completo) + unitarias (614/614) (horas netas) |
| PRD-08 | Horas netas | parcial | E2E local 14/14 (`pnpm test:e2e`) (produccion-piso/ordenes-flujo-completo) + unitarias (614/614) (horas netas) |
| PRD-09 | Avances parciales por parte y proceso | parcial | E2E local 14/14 (`pnpm test:e2e`) (produccion-piso/ordenes-flujo-completo) + unitarias (614/614) (horas netas) |
| PRD-10 | Orden heredada sin partes | ausente | E2E local 14/14 (`pnpm test:e2e`) (produccion-piso/ordenes-flujo-completo) + unitarias (614/614) (horas netas) |
| PRD-11 | Procesos según área del operador | ausente | E2E local 14/14 (`pnpm test:e2e`) (produccion-piso/ordenes-flujo-completo) + unitarias (614/614) (horas netas) |
| PRD-12 | Confirmación documental e identidad | parcial | E2E local 14/14 (`pnpm test:e2e`) (produccion-piso/ordenes-flujo-completo) + unitarias (614/614) (horas netas) |
| PRD-13 | Cierre parcial y final | parcial | E2E local 14/14 (`pnpm test:e2e`) (produccion-piso/ordenes-flujo-completo) + unitarias (614/614) (horas netas) |
| PRD-14 | Activación de cobranza por fin de trabajo | parcial | E2E local 14/14 (`pnpm test:e2e`) (produccion-piso/ordenes-flujo-completo) + unitarias (614/614) (horas netas) |
| PRD-15 | Reactivación administrativa | ausente | inventario estático (matriz 164) |
| PRD-16 | Detalle técnico para fabricar | ausente | inventario estático (matriz 164) |
| PRD-17 | Historial de sesiones y archivos | ausente | inventario estático (matriz 164) |
| PRD-18 | Bitácora de operaciones | completo | E2E local 14/14 (`pnpm test:e2e`) (produccion-piso/ordenes-flujo-completo) + unitarias (614/614) (horas netas) |
| **PLA** | *(módulo)* | | |
| PLA-01 | Calendario semanal y mensual | parcial | inventario estático (matriz 164) |
| PLA-02 | Asignar fecha por arrastre | parcial | inventario estático (matriz 164) |
| PLA-03 | Capacidad diaria base | parcial | E2E local 14/14 (`pnpm test:e2e`) (planeacion-flujo-colaborativo) + unitarias (614/614) (motor de capacidad) |
| PLA-04 | Tratamiento de sobrecarga base | parcial | E2E local 14/14 (`pnpm test:e2e`) (planeacion-flujo-colaborativo) + unitarias (614/614) (motor de capacidad) |
| PLA-05 | Liberación y trabajos disponibles | ausente | inventario estático (matriz 164) |
| PLA-06 | Acciones desde calendario | ausente | inventario estático (matriz 164) |
| PLA-07 | Semáforo y vista mensual | ausente | inventario estático (matriz 164) |
| **DOC** | *(módulo)* | | |
| DOC-01 | Orden de servicio | ausente | inventario estático (matriz 164) |
| DOC-02 | Nota de entrega | parcial | E2E local 14/14 (`pnpm test:e2e`) (produccion-piso: registro de nota) |
| DOC-03 | Consulta y reimpresión | ausente | inventario estático (matriz 164) |
| DOC-04 | Ciclo de archivos múltiples | parcial | inventario estático (matriz 164) |
| **AR** | *(módulo)* | | |
| AR-01 | AR vinculado al aprobar | parcial | E2E local 14/14 (`pnpm test:e2e`) (aceptacion-comercial: sin AR al aprobar, D-04) + PGlite aislado (harness .ai-shared/qa/cobertura) |
| AR-02 | Alta de factura/cuenta por cobrar | parcial | inventario estático (matriz 164) |
| AR-03 | Estados y activación | parcial | E2E local 14/14 (`pnpm test:e2e`) (cobranza-flujo) + PGlite aislado (harness .ai-shared/qa/cobertura) (verificar-bancos-pagos) |
| AR-04 | Reglas de plazo | ausente | inventario estático (matriz 164) |
| AR-05 | Pagos y anticipos | parcial | E2E local 14/14 (`pnpm test:e2e`) (cobranza-flujo) + PGlite aislado (harness .ai-shared/qa/cobertura) (verificar-bancos-pagos) |
| AR-06 | Anticipo antes de terminación | ausente | inventario estático (matriz 164) |
| AR-07 | Liquidación y resumen | parcial | E2E local 14/14 (`pnpm test:e2e`) (cobranza-flujo) + PGlite aislado (harness .ai-shared/qa/cobertura) (verificar-bancos-pagos) |
| AR-08 | Edición de pago | ausente | inventario estático (matriz 164) |
| AR-09 | Movimientos heredados | ausente | inventario estático (matriz 164) |
| AR-10 | Listado y métricas filtradas | parcial | E2E local 14/14 (`pnpm test:e2e`) (cobranza-flujo) + PGlite aislado (harness .ai-shared/qa/cobertura) (verificar-bancos-pagos) |
| AR-11 | Navegar a la orden | parcial | E2E local 14/14 (`pnpm test:e2e`) (cobranza-flujo) + PGlite aislado (harness .ai-shared/qa/cobertura) (verificar-bancos-pagos) |
| AR-12 | Antigüedad de saldos | completo | E2E local 14/14 (`pnpm test:e2e`) (cobranza-flujo) + PGlite aislado (harness .ai-shared/qa/cobertura) (verificar-bancos-pagos) |
| AR-13 | Alertas de vencimiento | parcial | inventario estático (matriz 164) |
| AR-14 | Estado de cuenta por cliente | ausente | inventario estático (matriz 164) |
| AR-15 | Cobros agrupados por cuenta | ausente | inventario estático (matriz 164) |
| AR-16 | Eliminación de registro de cobro | ausente | inventario estático (matriz 164) |
| **GAS** | *(módulo)* | | |
| GAS-01 | Alta manual | parcial | E2E local 14/14 (`pnpm test:e2e`) (gastos-rentabilidad) |
| GAS-02 | Edición de gasto | ausente | inventario estático (matriz 164) |
| GAS-03 | Impuesto y moneda | parcial | inventario estático (matriz 164) |
| GAS-04 | Vinculación a orden | parcial | E2E local 14/14 (`pnpm test:e2e`) (gastos-rentabilidad) |
| GAS-05 | Pago y vencimiento de CxP | parcial | E2E local 14/14 (`pnpm test:e2e`) (gastos-rentabilidad) |
| GAS-06 | Filtros de gastos | parcial | inventario estático (matriz 164) |
| GAS-07 | Métricas y gráfico interactivo | parcial | inventario estático (matriz 164) |
| GAS-08 | Escaneo de comprobante | parcial | inventario estático (matriz 164) |
| GAS-09 | Adjunto y revisión del comprobante | parcial | inventario estático (matriz 164) |
| **CFG** | *(módulo)* | | |
| CFG-01 | Datos empresariales | parcial | E2E local 14/14 (`pnpm test:e2e`) (configuracion-flujo) |
| CFG-02 | TC e IVA global | parcial | E2E local 14/14 (`pnpm test:e2e`) (configuracion-flujo) |
| CFG-03 | Cuentas de cobro | completo | E2E local 14/14 (`pnpm test:e2e`) (cobranza-flujo: cuentas) + PGlite aislado (harness .ai-shared/qa/cobertura) (verificar-bancos-pagos) |
| CFG-04 | Continuidad de folios | ausente | inventario estático (matriz 164) |
| CFG-05 | Usuarios de taller | ausente | inventario estático (matriz 164) |
| CFG-06 | Áreas y procesos | parcial | inventario estático (matriz 164) |
| CFG-07 | Etiquetas comerciales | ausente | inventario estático (matriz 164) |
| CFG-08 | Tiers comerciales | ausente | inventario estático (matriz 164) |
| CFG-09 | Categorías de gasto | ausente | inventario estático (matriz 164) |
| CFG-10 | Tarifas de cotizador | completo | unitarias (614/614) |
| CFG-11 | Catálogos iniciales de referencia | ausente | inventario estático (matriz 164) |
| CFG-12 | Consolidación de datos heredados | ausente | inventario estático (matriz 164) |
| CFG-13 | Consulta de acciones recientes | parcial | inventario estático (matriz 164) |
| **TRA** | *(módulo)* | | |
| TRA-01 | Períodos de consulta | parcial | unitarias (614/614) |
| TRA-02 | Relación entre entidades | completo | E2E local 14/14 (`pnpm test:e2e`) (aceptacion-comercial: cadena RFQ→OP) |
| TRA-03 | Cancelación de formularios y consulta vacía | completo | unitarias (614/614) |
| **OBS** | *(módulo)* | | |
| OBS-01 | Navegación desde indicadores | completo | unitarias (614/614) (aging) |
| OBS-02 | Búsqueda de empresa y contacto | ausente | inventario estático (matriz 164) |
| OBS-03 | Seguimiento del prospecto | parcial | inventario estático (matriz 164) |
| OBS-04 | Necesidad completa y varias solicitudes | parcial | inventario estático (matriz 164) |
| OBS-05 | Distribución por estaciones y procesos | parcial | inventario estático (matriz 164) |
| OBS-06 | Planos múltiples utilizables en taller | parcial | unitarias (614/614)/estático |
| OBS-07 | Cotizaciones integradas al pipeline | parcial | unitarias (614/614)/estático |
| OBS-08 | Desglose de lo solicitado | parcial | inventario estático (matriz 164) |
| OBS-09 | Asignación inequívoca del trabajo | parcial | inventario estático (matriz 164) |
| OBS-10 | Parciales de producción y entrega | completo | inventario estático (matriz 164) |
| OBS-11 | Historial comercial y operativo navegable | parcial | unitarias (614/614)/estático |
| OBS-12 | Descuento automático de existencias | parcial | E2E local 14/14 (`pnpm test:e2e`) (ordenes-flujo-completo: consumo/kardex) |
| OBS-13 | Conformidad fiel al pedido | parcial | E2E local 14/14 (`pnpm test:e2e`) (produccion-piso: nota parcial/total) |
| OBS-14 | Áreas, subáreas y procesos configurables | parcial | inventario estático (matriz 164) |
| OBS-15 | Origen comercial y tablero de órdenes | parcial | inventario estático (matriz 164) |
| OBS-16 | Acciones y estados consistentes | parcial | E2E local 14/14 (`pnpm test:e2e`) (comentarios-notificaciones) |
| OBS-17 | Comentarios por orden | parcial | unitarias (614/614)/estático |
| OBS-18 | Programar partida comprensible | parcial | unitarias (614/614)/estático |
| OBS-19 | Horario, capacidad y sobrecarga | parcial | unitarias (614/614)/estático |
| OBS-20 | Área como filtro principal y flujo completo | parcial | unitarias (614/614)/estático |
| OBS-21 | Retirar terminadas del trabajo activo | parcial | inventario estático (matriz 164) |
| OBS-22 | Visibilidad financiera desde aprobación | ausente | unitarias (614/614)/estático |
| OBS-23 | Moneda de cobro y tipo de cambio | completo | E2E local 14/14 (`pnpm test:e2e`) (cobranza-flujo) |
| OBS-24 | Cuenta destino/origen y referencias | parcial | unitarias (614/614)/estático |
| OBS-25 | Saldo a favor visible y aplicable | completo | E2E local 14/14 (`pnpm test:e2e`) (cobranza-flujo) |
| OBS-26 | Proforma o comprobante de cobro | completo | E2E local 14/14 (`pnpm test:e2e`) (cobranza-flujo) |
| OBS-27 | Consolidado imprimible y compartible | ausente | inventario estático (matriz 164) |
| OBS-28 | Gasto con cuenta y selección de orden | ausente | inventario estático (matriz 164) |
| OBS-29 | Rentabilidad por orden y estación | parcial | E2E local 14/14 (`pnpm test:e2e`) (gastos-rentabilidad) + unitarias (614/614) |
| OBS-30 | Parámetros completos del cotizador | completo | E2E local 14/14 (`pnpm test:e2e`) (gastos-rentabilidad) + unitarias (614/614) |

## Lectura por OBS (30)

| OBS | Estado de cobertura | Ejecución en esta entrega |
|---|---|---|
| OBS-01 | completo | unitarias de aging + navegación dashboard→cobranza (matriz) |
| OBS-02/03/04 | ausente/parcial | estático; sin flujo de prospecto completo ejecutado |
| OBS-05 | parcial | estático (programación por áreas existe; sin distribución automática) |
| OBS-06 | parcial | estático (planos no consultables en taller) |
| OBS-07 | parcial | E2E aceptacion-comercial (cotización ligada a la oportunidad) |
| OBS-08 | parcial | estático (desglose limitado en Planeación) |
| OBS-09 | parcial | backend fuerza asignación (unit/PGlite); sin colas por área |
| OBS-10 | completo | E2E produccion-piso (entrega parcial + total) |
| OBS-11 | parcial | estático (ficha sin enlaces originales) |
| OBS-12 | parcial | E2E ordenes-flujo-completo (consumo/kardex); divergencia D-10 |
| OBS-13 | parcial | E2E produccion-piso (registro); sin documento imprimible |
| OBS-14 | parcial | estático (áreas planas; sin subáreas/procesos) |
| OBS-15 | parcial | E2E aceptacion-comercial (origen comercial); alta manual sigue existiendo |
| OBS-16 | parcial | E2E comentarios-notificaciones (hilo en Órdenes) |
| OBS-17 | parcial | estático (comentarios fuera de Producción) |
| OBS-18 | parcial | E2E planeacion-flujo-colaborativo (programar sin IDs) |
| OBS-19 | parcial | E2E planeacion + unitarias (bloqueo de capacidad); D-02 pendiente de alcance |
| OBS-20 | parcial | E2E produccion-piso (flujo completo por estado) |
| OBS-21 | parcial | estático (entregadas no se archivan) |
| OBS-22 | ausente | divergencia D-04: sin visibilidad desde aprobación |
| OBS-23 | completo | E2E cobranza-flujo (USD + TC) |
| OBS-24 | parcial | E2E cobranza (cuenta destino) + PGlite bancos; sin flujo por cuenta |
| OBS-25 | completo | E2E cobranza (sobrepago/crédito) |
| OBS-26 | completo | E2E cobranza (recibo persistido) |
| OBS-27 | ausente | no ejecutado (estado de cuenta consolidado) |
| OBS-28 | ausente | no ejecutado (cuenta de salida en gastos) |
| OBS-29 | parcial | E2E gastos-rentabilidad (cálculo por orden); falta desglose UI |
| OBS-30 | completo | unitarias cotizador + configuración (tarifas por estación) |

## Casos ejecutados en navegador (14/14)

```
✓ aceptacion-comercial: cadena comercial descuento/área/externo → orden (E2E-05/E2E-07)
✓ aceptacion-comercial: trabajo interno TI sin AR e identificado (E2E-09)
✓ cobranza-flujo: pago parcial, sobrepago, recibos y sincronización (E2E-24/25/40)
✓ comentarios-notificaciones: comentario, mención y notificación en tiempo real (E2E-36)
✓ configuracion-flujo (x2): TC recuperado y acceso denegado a vendedor (E2E-02/31)
✓ dashboard-roles (x4): vendedor/contador/admin/operador (E2E-01/32)
✓ gastos-rentabilidad: gasto, CxP, rentabilidad y segunda vista (E2E-29/41)
✓ ordenes-flujo-completo: OP con tiempo, avance, consumo y auditoría (E2E-15/19/38)
✓ planeacion-flujo-colaborativo: programar, preparar y reprogramación externa (E2E-22)
✓ produccion-piso: PIN, partida completa, entregas parcial y total (E2E-17/18/20/37)
```
