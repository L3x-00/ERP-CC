# Aceptación funcional ORCA MFG ERP — 2026-09-19

**Método.** Extracción estática de la referencia (ERP-CC-main.zip, `src/App.jsx`) + observaciones del
Product Owner (OBS-01…OBS-30), evaluada contra la versión mejorada (este repositorio). No se copia
tecnología, diseño ni comportamiento accidental: se conserva el resultado de negocio. Los IDs del
catálogo (`docs/auditoria-funcional-2026-09-13/fuentes/catalogo.csv`) y los OBS se mantienen.

**Entorno de ejecución.** Supabase local en Docker (`127.0.0.1:54321`, migraciones al día incluida
`20260916000006`) + Next.js 16 en `127.0.0.1:3100` (Playwright `webServer`). Nunca se tocó
producción. Datos ficticios con prefijo `QA-FUNC` y limpieza por ID en cada spec; usuarios
`@orca.local` creados y eliminados por las propias pruebas.

**Evidencia disponible (ejecutada):**

| Nivel | Qué cubre | Resultado |
|---|---|---|
| Playwright E2E local (`pnpm test:e2e`) | 14 pruebas: órdenes completo, cobranza, gastos, planeación, piso, comentarios, configuración, dashboard 4 roles, **cadena comercial con descuento/área/externo** y **trabajo interno TI** | **14/14 ejecutado conforme** |
| PGlite aislado (`.ai-shared/qa/cobertura/*.mjs`) | RPC de cotización/orden/partidas/TI/AR-dashboard/bancos sobre migraciones reales | 12/12, 5/5, 7/7, 3/3 |
| Unitarias (`pnpm test`) | mappers, cálculos, esquemas, acciones simuladas, parsers DXF/EPS | **614/614** |
| Gates | typecheck 0 · lint 0 · build 17 rutas | correctos |

**Límites.** La revisión estática del inventario no equivale a E2E; cada caso sin flujo de navegador
ejecutado se marca `no ejecutado (diseñado)` aunque su inventario esté completo. El OCR real
(GAS-08) no puede probarse aquí: no hay clave del proveedor de IA en el entorno local. La
concurrencia estricta (carreras) no se probó: solo sincronización multi-pestaña observada. Las
migraciones remotas y la publicación las controla Codex/PO.

---

## Decisiones D-01 a D-16 (reconciliación)

Cada decisión se registra con el resultado adoptado por la versión mejorada. Cuando una observación
sustituye la base, se evalúa el resultado pedido (no se exigen dos reglas incompatibles).

- **D-01 · Alta de órdenes.** *Adoptada.* La creación ordinaria nace del origen comercial
  (`aprobar_oportunidad_y_crear_orden`); el alta manual en Órdenes se conserva como excepción
  administrativa (no crea AR ni Bandeja). Casos E2E-07/E2E-14 evaluados con ese origen.
- **D-02 · Capacidad.** *Adoptada con alcance a definir.* No hay 8 h globales: la capacidad es por
  recurso+turno (`capacidades_recurso_turno`) con bloqueo transaccional al sobreasignar
  (OBS-19). Falta que el negocio precise si "8 h" es por operador, por estación o ambos; hasta
  entonces no se inventa el valor. Caso E2E-22 ejecutado: bloquear funciona; el reparto exacto
  queda como decisión de negocio.
- **D-03 · Estados.** *Adoptada.* `Programada` es condición de planificación (`programacion_areas`)
  separada del estado de fabricación (`ordenes_produccion`) y del financiero (AR). No se fusionan.
- **D-04 · Cobranza.** *Sustituida y evaluada por resultado.* La versión mejorada **no** crea AR
  borrador al aprobar: la AR nace al completar la OP y exige todas las partidas producidas (Fase 8,
  verificado en PGlite). OBS-22 se cumple como divergencia intencional documentada (ADR
  2026-09-19): facturar trabajo no entregado distorsiona el flujo. E2E-07/E2E-39 registran el
  reemplazo.
- **D-05 · Parciales.** *Adoptada.* El avance parcial es por partida y sesión
  (`registros_avance_partida`); fabricar 4 no entrega 4. La entrega parcial con documento existe
  (OBS-10/13) y se ejecutó en E2E-37.
- **D-06 · Retiro de trabajos.** *Adoptada parcialmente.* Se conserva historia: `cancelada`
  (motivo + auditoría) y `eliminación administrativa` quedó como brecha (ORD-10); la propuesta de
  bandeja de entregas separada no se implementó. Caso E2E-16 parcial.
- **D-07 · Divisas.** *Adoptada.* TC se expresa MXN por USD; el selector define la moneda de
  captura y el importe original se conserva con su TC (OBS-23, AR-05). La conversión inversa
  explícita no se implementó (subcapacidad pendiente).
- **D-08 · Referencias bancarias.** *Adoptada.* La referencia se conserva como dato opcional y la
  cuenta destino/origen se identifica con catálogo enmascarado (OBS-24 parcial: falta reflejo de
  flujo por cuenta).
- **D-09 · Saldo a favor.** *Adoptada.* Origen por excedente (sobrepago) y aplicación identificada
  al monedero MXN (OBS-25 completo). Devoluciones/caducidad no existen: decisión de negocio no
  solicitada.
- **D-10 · Inventario.** *Equivalencia aceptada.* Existe módulo de inventario/CPP y consumo
  atómico con kardex (OBS-12 parcial). No se impone el "descuento automático al finalizar" de la
  base: el consumo se registra durante la producción y una variante con consumo previo descuenta
  solo la diferencia; el saldo final coincide (88).
- **D-11 · Rentabilidad.** *Adoptada.* Venta neta sin IVA − material real − horas por tarifa
  histórica − otros costos (OBS-29, motor `obtener_rentabilidad_orden`); el detalle por rubro en
  UI es brecha (parcial).
- **D-12 · Cotizador.** *Adoptada.* Se usan los campos de COT/CFG-10 del cotizador
  (láser/router/doblado/fabricación/otros + tarifas por estación); sin lista nueva de campos.
- **D-13 · Estructura de taller.** *Adoptada.* Áreas planas configurables (código/color/externa);
  subáreas/procesos configurables son brecha (OBS-14 parcial). El proceso externo registra
  proveedor (RFQ-06) sin orden de compra ni integración con terceros.
- **D-14 · Documentos y notas.** *Adoptada.* No hay portal de cliente; el historial es ficha
  interna y las notas operativas no se envían al cliente. La OS/nota imprimible son brecha
  (DOC-01/02/03).
- **D-15 · Formulario de planeación.** *Adoptada.* La programación es contextual (panel partida/
  recurso) y no obliga a recapturar el pedido; el calendario filtra por rango/área/recurso. La
  alternancia semana/mes y el arrastre quedan como brecha (PLA-01/02).
- **D-16 · Tasas.** *Adoptada.* IVA por cotización (16/8) y equivalente en USD; gastos con
  subtotal/IVA/total explícitos y TC validado (MXN ⇒ TC=1); la tasa global configurable existe
  para tarifas, pero el IVA global no tiene UI (CFG-02 parcial). No se confunde configuración con
  propagación probada.

---

## Casos E2E-01 a E2E-41

Estados: `ejecutado conforme` solo con flujo observable ejecutado; `divergencia funcional` cuando
la versión mejorada cumple el resultado por una regla distinta y documentada; `parcial` califica
la ejecución cuando una subcapacidad del criterio no se ejerció; el resto es `no ejecutado
(diseñado)` o `bloqueado por dependencia`.

### E2E-01 · Ingreso y navegación por rol — [B]
Actor: admin/operador · Entorno: local. Pasos→esperado: login admin OK; PIN inválido rechazado;
recorrido de módulos; cambio a Producción y vuelta; cierre de sesión; login operador.
Observado/Evidencia: logins por rol ejecutados en `dashboard-roles.spec.ts` (4 roles) y
`configuracion-flujo.spec.ts`; PIN válido en `produccion-piso.spec.ts`. **El PIN inválido no se
ejerció** (subcapacidad pendiente). Criterio: ACC-01/02/03/04/07. Estado: **ejecutado conforme
(parcial)**.

### E2E-02 · Tipo de cambio del día — [B]
Actor: admin · Entorno: local. Pasos→esperado: entrar al panel; actualizar TC a 17.50; abrir
Configuración; guardar; reentrar. Observado/Evidencia: `configuracion-flujo.spec.ts` guarda TC y
lo recupera tras recarga; la confirmación de guardado se corrigió (hallazgo E2E). El recordatorio
proactivo por fecha en el panel no existe (ACC-06 parcial) y el IVA global no tiene UI (CFG-02
parcial). Criterio: ACC-06, CFG-02. Estado: **ejecutado conforme (parcial)**.

### E2E-03 · Crear y editar cliente — [B]
Actor: admin · Entorno: local. Datos: QA-FUNC Alfa. Pasos→esperado: alta con validación; búsqueda;
edición de contacto/límite; filtros combinados; historial vacío; cancelar edición no persiste.
Observado/Evidencia: inventario completo (CLI-01/02/03/04, TRA-03) y pruebas unitarias de esquemas/
filtros; **sin flujo de navegador ejecutado** en esta entrega. Criterio: CLI-01…CLI-04, TRA-03.
Estado: **no ejecutado (diseñado)**.

### E2E-04 · Consumo, tier y descuento temporal — [B]
Actor: admin · Entorno: local. Datos: Cliente D con consumo 60 000. Pasos→esperado: tier efectivo
Plata 3%; tier manual Oro vigente; expirado retorna a automático; no elegibles no inflan consumo.
Observado/Evidencia: unitarias de `calcularTier`/tiers y panel CLI-05/06; **CFG-08 no existe**
(tiers fijos en código, no catálogo editable): subcapacidad sin ejecución. Criterio: CLI-05/06,
CFG-08. Estado: **divergencia funcional** (tiers fijos) / decisión pendiente para hacerlos
editables.

### E2E-05 · Alta rápida y cotización con descuento — [B]
Actor: admin · Entorno: local. Datos: cliente+área QA, RFQ 10×100 + 1×300 externo + descuento 100.
Pasos→esperado: (1) crear RFQ; (2) vincular cliente → hereda condiciones; (3) capturar líneas con
área/EXT/descuento; (4) totales 1200+192=1392; (5) guardar → persistida; (6) reabrir → vigente.
Observado/Evidencia: `aceptacion-comercial.spec.ts` test 1 (ejecutado): totales en vivo, guardado y
verificación en BD (2 partidas, descuento fuera de fabricables). La **alta rápida "Nuevo cliente"
no se ejerció** (se vinculó un cliente existente): subcapacidad pendiente. Criterio: RFQ-01/02/03/
04/05/06/11. Estado: **ejecutado conforme (parcial)**.

### E2E-06 · Seguimiento, etiquetas y estados comerciales — [B]
Actor: admin · Entorno: local. Pasos→esperado: etiquetas por RFQ; pasar a enviada; fechas a 3/10
días hábiles; editar seguimiento; filtros y períodos; rechazo con motivo.
Observado/Evidencia: RFQ-07/12/13/14 completos con unitarias de filtros/resumen; el envío fija
`fecha_envio_cotizacion`. **RFQ-08 parcial**: no hay fecha de seguimiento (+3 hábiles) ni
vencimiento (+10) editables. Criterio: RFQ-07/08/12/13/14, CFG-07, TRA-01. Estado: **ejecutado
parcialmente (unitarias)**; brecha RFQ-08 declarada.

### E2E-07 · Aprobación multiárea hasta taller y CxC — [B]
Actor: admin · Entorno: local. Datos: línea fabricable (área CNC + procesos) + línea externa +
descuento. Pasos→esperado: capturar; guardar; aprobar; consultar Órdenes/Producción/Cobranza;
repetir aprobación sin duplicar cadena.
Observado/Evidencia: `aceptacion-comercial.spec.ts` test 1 (ejecutado): etapa `ganada`, OP
`borrador`, **2 partidas** (COT-001 con área/procesos; COT-002 externa con proveedor; descuento
excluido), **sin AR** (D-04) y folio CNC visible en `/ordenes`; PGlite
`verificar-rfq0506-wiring.mjs` (12/12) confirma la propagación y la exclusión. La repetición de la
aprobación no se reintentó por UI (rota a terminal); la idempotencia está cubierta por PGlite
(`ya_existia`). Criterio: RFQ-05/06/10/15, AR-01, TRA-02. Estado: **ejecutado conforme con
divergencia D-04** (sin AR al aprobar).

### E2E-08 · Límite de crédito y autorización — [B]
Actor: admin · Entorno: local. Datos: Cliente C con crédito 100% usado. Pasos→esperado: aprobar →
cancelar autorización deja RFQ sin OP/AR; autorizar crea el trabajo. Observado: **RFQ-16 ausente**:
la aprobación no evalúa `limite_credito`; el gate de confirmación no existe. Criterio: RFQ-16.
Estado: **decisión pendiente** (implementar gate de autorización).

### E2E-09 · Orden interna completa — [B]
Actor: admin · Entorno: local. Datos: RFQ TI con una línea. Pasos→esperado: crear interna;
aprobar; programar/iniciar/completar/entregar; TI identificada y sin AR comercial.
Observado/Evidencia: `aceptacion-comercial.spec.ts` test 2 (ejecutado): `pipeline.es_orden_interna`
y `ordenes_produccion.es_interna` en true; `abrir_cuenta_por_cobrar` rechaza
(`orden_interna_sin_cobranza`); badge TI en `/ordenes`. Programación/ejecución usan las mismas RPC
de PRD ya cubiertas por `ordenes-flujo-completo`/`produccion-piso`; ORD-02 (resumen TI) es brecha.
Criterio: RFQ-09, ORD-02. Estado: **ejecutado conforme** (sin resumen ORD-02).

### E2E-10 · Cotizador y archivos geométricos — [B]
Actor: admin · Entorno: local (sin adjuntos reales de prueba DXF/EPS/AI en esta corrida).
Pasos→esperado: calculadora; DXF mm/pulgadas; EPS/AI según contrato; parámetros manuales; estación
múltiple; precio a la línea. Observado/Evidencia: COT-01…06 completos con unitarias del parser y
del formulario; **sin flujo de navegador con archivos reales** en esta entrega. Criterio:
COT-01…06. Estado: **no ejecutado (diseñado)**; evidencia unitaria.

### E2E-11 · Tarifas y cálculo de manufactura — [B/C]
Actor: admin · Entorno: local. Pasos→esperado: láser/router/doblado/fabricación/flete; cambiar una
tarifa; recargo. Observado/Evidencia: unitarias `cotizador-calculo` (incluye tiempo estimado) y
`cotizador-tarifas`; CFG-10 completo; la configuración de tarifas se guarda por RPC (probada en
`configuracion-flujo` solo para TC). Control de recargo verificado por fórmula en unitarias.
Criterio: COT-07…11, CFG-10. Estado: **no ejecutado (diseñado)**; evidencia unitaria.

### E2E-12 · Adjuntos comerciales y actualización en ejecución — [B]
Actor: admin/operador · Entorno: local. Pasos→esperado: subir planos en RFQ; aprobar; abrirlos
desde taller; tercero en orden activa; aviso y visto; retiro solo de borrador. Observado:
RFQ-19/DOC-04 parciales (adjuntos por pipeline, con URL firmada y modo lectura en la oportunidad)
y **ORD-09 ausente** (sin archivos/aviso durante ejecución, sin visor en taller). Criterio:
RFQ-19, ORD-09, DOC-04. Estado: **divergencia/parcial**; dependencia de ORD-09.

### E2E-13 · Cambio comercial sincronizado a orden — [B]
Actor: admin · Entorno: local. Pasos→esperado: editar RFQ con avance, aviso pendiente, sincronizar
sin perder historia. Observado: decisión v2 (RFQ-17, ADR 2026-09-19): la cotización con orden es
**inmutable**; el editor muestra la orden vinculada y la vía cancelar+reemplazar. No existe
"sincronizar" ni aviso pendiente. Criterio: RFQ-17, ORD-08. Estado: **divergencia funcional
intencional**.

### E2E-14 · Órdenes nuevas, heredadas y repetidas — [B/OBS]
Actor: admin · Entorno: local. Pasos→esperado: continuidad de folios 47→48; orden heredada con ID
previo; repetir trabajo desde historial. Observado: CFG-04 (continuidad de folios) y CLI-08
(repetición) **ausentes**; ORD-04/06 parciales; no se ejecutó por decisión D-01/D-14. Criterio:
ORD-04/06, CLI-07/08, CFG-04/12. Estado: **decisión pendiente / no ejecutado**.

### E2E-15 · Edición, partes y consulta de órdenes — [B]
Actor: admin · Entorno: local. Pasos→esperado: filtros; modal; editar campos/procesos/metas;
cancelar no persiste; historial/sesiones/adjuntos; fechas requerida vs planeada.
Observado/Evidencia: `ordenes-flujo-completo.spec.ts` (ejecutado) cubre listado/transiciones/
tiempos/consumo/auditoría; `produccion-piso.spec.ts` cubre sesiones y entrega. **ORD-03/05/07/12
son brechas** (detalle integral, edición de orden, metas por proceso, fecha requerida vs planeada):
subcapacidades no ejecutadas. Criterio: ORD-01/03/05/07/12. Estado: **ejecutado conforme
(parcial)**.

### E2E-16 · Retiro de registros administrativos — [B]
Actor: admin · Entorno: local. Pasos→esperado: cancelar retiro; retirar RFQ sin orden; bloquear OP
con AR activo; baja permitida solo en fixture; anular AR no borra OP. Observado/Evidencia: RFQ-18
completo (unit + PGlite cascade); cancelación de OP con motivo y auditoría (ORD-10 parcial);
**AR-16 (anulación de AR) ausente**. Criterio: RFQ-18, ORD-10, AR-16. Estado: **parcial**;
subcapacidad AR-16 no ejecutada.

### E2E-17 · Inicio por área y colas de trabajo — [B]
Actor: operador/admin · Entorno: local. Pasos→esperado: Kanban/Por área; Bandeja→inicio; exclusión
de la segunda orden de la misma área; área independiente permitida; tarjetas con instrucciones.
Observado/Evidencia: `produccion-piso.spec.ts` (ejecutado) inicia sesión PIN, completa partida y
entrega; el bloqueo es por recurso/programación (equivalencia de exclusividad) y el Kanban muestra
avance/estado; **la vista "Por área" y la exclusividad por área del operador son brechas**
(PRD-01/02/11). Criterio: PRD-01/02/03/04. Estado: **ejecutado conforme (parcial)** con
equivalencia por recurso.

### E2E-18 · Pausa, sesión y relevo — [B]
Actor: operador · Entorno: local. Pasos→esperado: pausar con motivo; resumen de última ejecución;
reanudar; cancelar reanudación; cerrar sesión con horario/nota/archivo/confirmación/PIN.
Observado/Evidencia: `produccion-piso.spec.ts` cierra sesión verificada por PIN y deja nota de
entrega; PRD-05 completo (pausa motivada) y PRD-06/07 parciales (falta resumen de última ejecución
y archivos de sesión). Criterio: PRD-05/06/07/12, ACC-05. Estado: **ejecutado conforme (parcial)**.

### E2E-19 · Parciales hasta orden completa — [B]
Actor: operador/admin · Entorno: local. Datos: 10 piezas Corte+Doblado. Pasos→esperado: avances
parciales 20/50/100%; no pasa a Lista hasta completar; horas 08–17 = 8 netas.
Observado/Evidencia: `ordenes-flujo-completo.spec.ts` registra avance y consumo acumulado por
partida; unitarias de horas netas (descuento de comida por solape 12:00–13:00 America/Tijuana) y
PRD-08/09/13 parciales. PRD-10 (orden heredada sin partes) es decisión v2: no aplica. Criterio:
PRD-08/09/10/13. Estado: **ejecutado conforme (parcial)**, con D-05.

### E2E-20 · Asignación del operador — [C/OBS]
Actor: operadores por área · Entorno: local. Pasos→esperado: cada operador ve lo suyo; registrar
avance propio; rechazo de lo ajeno. Observado/Evidencia: el backend impone asignación
(`operador_asignado_id`; RPC rechazan operador no asignado: PRD-12, cubierto por PGlite/unitarias)
y `produccion-piso.spec.ts` ejecuta la sesión PIN asignada. **No hay `areaId` en usuarios ni colas
por área** (PRD-11, OBS-09 parcial): la verificación "operador Corte intenta Router" no se ejecutó
por UI. Criterio: PRD-11, OBS-09. Estado: **bloqueado por dependencia** (catálogo área-operador).

### E2E-21 · Detalle, historial y reactivación — [B]
Actor: admin · Entorno: local. Pasos→esperado: detalle desde tres vistas; ejecución previa
conservada; reactivación admin; bitácora. Observado/Evidencia: PRD-18 completo (bitácora durable,
consulta por actor, `configuracion-flujo`/unit) y PRD-15/16/17 **ausentes** (sin detalle técnico,
historial de sesiones ni reactivación; completada es terminal por diseño). Criterio:
PRD-15/16/17/18, CFG-13. Estado: **divergencia funcional + parcial** (PRD-18 ejecutado).

### E2E-22 · Programación y capacidad — [B/OBS]
Actor: admin/gerente · Entorno: local. Pasos→esperado: programar 5 h+3 h; bloquear 1 h;
día alternativo; activa no se mueve; pausada sin planear; vista semanal/mensual.
Observado/Evidencia: `planeacion-flujo-colaborativo.spec.ts` (ejecutado) programa por formulario,
activa preparación, reprograma externamente y sincroniza la segunda vista; el **bloqueo por
capacidad** está en la RPC (`capacidad_insuficiente`) y cubierto por unitarias/PGlite de motor;
PLA-02 (arrastre), PLA-01 (semana/mes) y PLA-05/06/07 son brechas declaradas. Criterio:
PLA-01…07, OBS-19. Estado: **ejecutado conforme (parcial)**; D-02 pendiente de alcance 8 h.

### E2E-23 · Documentos y entrega — [B/OBS]
Actor: admin · Entorno: local. Pasos→esperado: generar OS y nota; imprimir/guardar; cotejo;
entregar; recuperar; AR. Observado: el **registro** de nota de entrega existe y se ejecuta en
`produccion-piso.spec.ts` (parcial/total), con cantidades y conformidad; **DOC-01/03 ausentes** y
DOC-02 sin documento imprimible. Criterio: DOC-01/02/03, PRD-14, OBS-13/21. Estado: **bloqueado
por dependencia** (documentos imprimibles).

### E2E-24 · Ciclo completo de cobro con anticipo — [B]
Actor: admin · Entorno: local. Datos: AR por 2320 con anticipo 580 y pago 1740.
Observado/Evidencia: `cobranza-flujo.spec.ts` (ejecutado) registra pago parcial en USD con TC,
sobrepago, recibo persistido, saldo y sincronización; el **anticipo antes de terminar** no aplica
por D-04 (la AR nace al completar) y el anticipo heredado es AR-09 ausente. La suma
580+1740=2320 queda cubierta por la variante v2 (pago parcial + liquidación). Criterio:
AR-03/04/05/06/07/09. Estado: **divergencia funcional D-04** + ejecutado conforme en su variante.

### E2E-25 · Nueva CxC y edición de pago — [B]
Actor: admin · Entorno: local. Pasos→esperado: crear cuenta desde orden; registrar pago; editar
fecha/monto/método/cuenta/TC/notas; cancelar edición; filtrar. Observado/Evidencia:
`cobranza-flujo.spec.ts` cubre alta implícita (AR por RPC), pagos, saldo/estado e historial con
recibo; **AR-08 (edición de pago) ausente** por diseño de libro mayor inmutable: subcapacidad no
ejecutada. Criterio: AR-02/08/10/11. Estado: **parcial**.

### E2E-26 · Aging y navegación por antigüedad — [B/OBS]
Actor: admin · Entorno: local. Pasos→esperado: bandas 100/200/200/200/100 con cortes 30/31/60/61/
90/91; días y alerta; navegación desde dashboard con filtro visible. Observado/Evidencia: AR-12
completo y OBS-01 completo (slug de aging → `/cobranza?aging=`), cubiertos por unitarias
(`aging-servicio`) y UI; **los ocho documentos de fixture no se montaron** en esta corrida, por lo
que las sumas exactas por banda no se observaron en navegador. Criterio: AR-12/13, OBS-01. Estado:
**parcial (unitario)**.

### E2E-27 · Estado de cuenta de cinco órdenes — [B/OBS]
Actor: admin · Entorno: local. Pasos→esperado: cinco documentos por cliente con pagos/saldos/días;
total concilia; impresión/descarga; sin envío real. Observado: **AR-14 y OBS-27 ausentes** (no
existe estado de cuenta consolidado ni preparación de envío). Criterio: AR-14, OBS-27. Estado:
**decisión pendiente / no ejecutado**.

### E2E-28 · Cuentas, pagos y movimientos — [B/OBS]
Actor: admin · Entorno: local. Datos: cuentas A/B, ingreso 1000 y egreso 300. Pasos→esperado:
crear/editar cuentas; cobro con A; gasto con A; flujo por cuenta; inactivar A.
Observado/Evidencia: CFG-03 completo y OBS-23/26 completos; el pago guarda `cuenta_bancaria_id`
con catálogo enmascarado (harness `verificar-bancos-pagos.mjs`); **AR-15 (cobros agrupados) y
OBS-28 (cuenta de salida en gastos) ausentes**. Criterio: AR-15, CFG-03, OBS-24/28. Estado:
**parcial**.

### E2E-29 · Gastos manuales, estados y filtros — [B]
Actor: admin · Entorno: local. Datos: USD 100 + IVA 16% a TC 17.50; otro MXN sin IVA. Pasos→
esperado: categoría; alta; proveedor/orden; pagar; filtros y gráfico. Observado/Evidencia:
`gastos-rentabilidad.spec.ts` (ejecutado) registra gasto, cambia estado a pagado, concilia CxP y
rentabilidad en dos vistas; GAS-01/04/05 funcionan con validación de total=subtotal+IVA y TC.
**GAS-02 (edición), GAS-03 (selector IVA), CFG-09 (categorías editables), GAS-06/07 parciales**
son brechas declaradas. Criterio: GAS-01…07, CFG-09. Estado: **ejecutado conforme (parcial)**.

### E2E-30 · Comprobante asistido y captura manual — [C/B]
Actor: admin · Entorno: local **sin clave de IA**. Pasos→esperado: subir comprobante; revisar
extracción; corregir; consultar; reescanear; alta manual. Observado/Evidencia: la captura manual se
ejecutó en `gastos-rentabilidad.spec.ts`; el OCR server-side existe pero su proveedor no está
configurado en local: **extracción no verificable aquí** (no se declara E2E de escaneo aprobado).
Criterio: GAS-08/09. Estado: **bloqueado por dependencia** (servicio de escaneo).

### E2E-31 · Catálogos y datos de empresa — [B/OBS]
Actor: admin · Entorno: local. Pasos→esperado: empresa; crear operador; PIN duplicado rechazado;
área/proceso externo; catálogos en RFQ/taller; retirar prueba. Observado/Evidencia:
`configuracion-flujo.spec.ts` ejecuta datos de empresa y TC con recuperación; el área de prueba se
creó/eliminó vía API en la aceptación comercial (selector de área en la línea). **CFG-05 (usuarios
de taller), CFG-11 (catálogos iniciales) y OBS-14 (subáreas)** son brechas. Criterio:
CFG-01/05/06/11, OBS-14. Estado: **ejecutado conforme (parcial)**.

### E2E-32 · KPI de órdenes y dashboard conciliados — [B]
Actor: admin/gerente/contador · Entorno: local. Pasos→esperado: comparativa 10 h estimadas/8 h
reales ⇒ 125%; entregas a tiempo/tarde; ventas/gastos/pipeline/cartera con documentos.
Observado/Evidencia: `dashboard-roles.spec.ts` (4 roles, ejecutado) y
`verificar-dashboard-ti.mjs` (7/7: internas, tiempos, gastos, distribución) validan el RPC; la
conciliación por documento es estática (DAS completo en matriz). **ORD-11 (comparativa por orden)
ausente**. Criterio: ORD-11, DAS-01…06. Estado: **ejecutado conforme (parcial)**.

### E2E-33 · Persistencia y segunda sesión — [B]
Actor: admin · Entorno: local. Pasos→esperado: sesión A edita cliente/RFQ/OP/pago/gasto/
configuración; B consulta; recargar ambas; sin duplicados. Observado/Evidencia: sincronización de
segunda vista observada en `cobranza-flujo` (data-eventos), `planeacion-flujo-colaborativo`
(reprogramación externa sin recargar), `gastos-rentabilidad` (observador) y `produccion-piso`
(segunda vista). Se distingue sincronización observada de **concurrencia estricta no probada**.
Criterio: ACC-08. Estado: **ejecutado conforme** (con ese límite).

### E2E-34 · Prospecto hasta cotización contextual — [OBS]
Actor: admin · Entorno: local. Pasos→esperado: buscar empresa/contacto; prospecto; seguimiento con
próxima acción; varias solicitudes con área; cotización ligada sin recaptura. Observado: OBS-07
parcial (cotización en modal ligada a la oportunidad, ejecutada en aceptación-comercial), OBS-02
parcial (falta búsqueda/alta de empresas existentes desde el alta —la del cliente sí existe),
OBS-03/04 parciales (sin próxima acción/equipo por solicitud). Criterio: OBS-02/03/04/07. Estado:
**parcial**.

### E2E-35 · Solicitud distribuida a operadores — [OBS]
Actor: admin/operador · Entorno: local. Pasos→esperado: aprobar; abrir partida en Planeación;
programar contextual; colas por área; iniciar con actor asignado y planos. Observado: OBS-05/08/
18/20 parciales; OBS-06 (planos en taller) y OBS-09 (colas por área) sin ejecución por UI;
la asignación inequívoca sí está forzada en backend. Criterio: OBS-05/06/08/09/18/20. Estado:
**parcial / bloqueado por dependencia**.

### E2E-36 · Órdenes como tablero y comentarios — [OBS]
Actor: admin/operador · Entorno: local. Pasos→esperado: OP desde Comercial; detalle por tarjeta;
comentar; transiciones por menú; ficha cliente con cotización/orden/nota; cancelar conserva
historial. Observado/Evidencia: OBS-16 completo con `comentarios-notificaciones.spec.ts`
(ejecutado: comentario, mención resuelta y notificación en tiempo real); OBS-15 parcial (alta
manual sigue existiendo como excepción); OBS-11 parcial (ficha sin enlaces a originales y sin notas
de operador automáticas). Criterio: OBS-11/15/16/17. Estado: **ejecutado conforme (parcial)**.

### E2E-37 · Entrega parcial independiente — [OBS]
Actor: operador/admin · Entorno: local. Datos: 10 piezas fabricadas; entregar 4 y luego 6.
Observado/Evidencia: `produccion-piso.spec.ts` (ejecutado) genera entrega parcial y total con
nota persistida, cantidades efectivas/acumuladas y estado; OBS-10 completo. **OBS-13 sin documento
imprimible** (misma dependencia que E2E-23). Criterio: OBS-10, OBS-13. Estado: **ejecutado
conforme (parcial: documento)**.

### E2E-38 · Consumo automático al finalizar — [OBS]
Actor: operador/admin · Entorno: local. Datos: material M stock 100; consumo 12 (variante 5+7).
Observado/Evidencia: `ordenes-flujo-completo.spec.ts` registra consumo real (usado+scrap) con
kardex y CPP por RPC atómica; el saldo final coincide. La regla "descuento automático al finalizar"
**no es la de la versión mejorada** (D-10): el consumo se registra en producción y una variante con
consumo previo descuenta solo la diferencia. Criterio: OBS-12. Estado: **divergencia funcional
intencional D-10** (equivalencia por resultado).

### E2E-39 · Cobro MXN/USD — [OBS]
Actor: admin · Entorno: local. Pasos→esperado: MXN con TC 1; USD 100 a TC 17.50 ⇒ 1750; reabrir;
conversión inversa si existe. Observado/Evidencia: `cobranza-flujo.spec.ts` ejecuta pago USD con
TC (parcial/sobrepago) y conserva moneda/importe/TC; OBS-23 completo. La **visibilidad del AR
desde la aprobación** no existe (D-04) y la conversión inversa explícita tampoco. Criterio:
OBS-22/23. Estado: **divergencia funcional D-04** + ejecutado en la variante v2.

### E2E-40 · Saldo a favor y documento de cobro — [OBS]
Actor: admin · Entorno: local. Datos: deuda 1000, pago 1200, aplicación 150 a segunda orden.
Observado/Evidencia: OBS-25/26 completos: el sobrepago genera crédito MXN en `movimientos_saldo_
favor` y la aplicación reduce la deuda sin nuevo ingreso bancario; el recibo persistido se ejecutó
en `cobranza-flujo` (sobrepago con crédito) y el harness de bancos/pagos cubre el flujo SQL. La
aplicación a segunda orden no se ejercitó por UI en esta corrida. Criterio: OBS-25/26. Estado:
**ejecutado conforme (parcial)**.

### E2E-41 · Rentabilidad y tarifas históricas — [OBS]
Actor: admin/contador · Entorno: local. Datos: venta neta 10000, material 3000, horas 2000, otros
1000. Pasos→esperado: costo 6000, utilidad 4000, margen 40%; cambiar tarifa no reescribe histórico.
Observado/Evidencia: `gastos-rentabilidad.spec.ts` ejecuta el cálculo de rentabilidad por orden y
su panel; unitarias de tarifas históricas por sesión (costo interno congelado). El desglose por
rubro en UI y la comparación histórica/nueva no se observaron en navegador. Criterio: OBS-29/30.
Estado: **ejecutado conforme (parcial)**.

---

## Hallazgos de producto corregidos durante esta aceptación

1. **Tablero no reflejaba la oportunidad recién creada** (`FormularioProspecto` solo hacía
   `router.refresh()`): se invalidó `['pipeline']`. Reproducido y corregido en E2E-05.
2. **El cambio de etapa no se reflejaba en la tarjeta** (`SelectorEtapa` sin invalidación): se
   invalidan `['pipeline']` y `['oportunidad', id]`. Reproducido y corregido en E2E-06/07.
3. **Dashboard del vendedor sin meta** (`metaMxn`/`comisionAcumuladaMxn` null): mapper nullable y
   tarjeta "—" (hallazgo del bloque E2E anterior, E2E-32).
4. **Confirmación de guardado invisible en Configuración** por remontaje de pestaña: confirmación
   a nivel de página (E2E-02/31).

Ninguno de estos hallazgos se declara "bug de la referencia": son divergencias/defectos de la
versión mejorada, ya corregidos y cubiertos por prueba.
