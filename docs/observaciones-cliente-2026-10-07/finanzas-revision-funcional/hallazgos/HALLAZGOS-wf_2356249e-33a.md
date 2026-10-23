# Hallazgos verificados - revision funcional de Finanzas
Generado sin modelo desde `wf_2356249e-33a/journal.jsonl` el 2026-10-14T23:18:53.743Z. Áreas: 6 · otros resultados: 0.
Los estados «verificada» pasaron por un revisor escéptico independiente; «SIN verificar» es la lectura cruda del primer agente.

## Área «compras» (verificada) — Finanzas — Compras: costo comprometido, costo real, doble captura y datos mínimos (F06, F07, F08)

**Cómo funciona hoy:** Compras (migraciones 20261007190001/190002) es una cabecera de CxP con proveedor, orden_id opcional, subtotal/IVA/total, moneda, TC, vencimiento y pagos parciales; no tiene concepto, cantidad, unidad ni costo unitario, ni vínculo con gastos. La rentabilidad vigente (obtener_rentabilidad_orden en 20260922000003, desglose en 20260923170507) no consulta compras; suma consumo de material, sesiones y gastos. Gastos (tabla de 20260909224637) ya tiene categoría (incluye materia_prima y maquila_externa), subtotal, IVA y total. La verificación confirmó el informe del lector con dos precisiones: la migración debe hacer DROP + CREATE (a03 ya usa CREATE FUNCTION sin OR REPLACE) si cambia el tipo de retorno, y el defecto de IVA en gastos también afecta al dashboard (a04).

### F06 — ausente (confirmado) · esfuerzo M · REQUIERE MIGRACIÓN

**Estado actual:** Confirmado. Compras permite orden_id y estados BORRADOR, CONFIRMADA, RECIBIDA, PAGADA y CANCELADA, pero ninguna función de rentabilidad lee compras (grep de 'compras' en a03 y a15 sin resultados). No existe nivel comprometido.

**Cambio mínimo:** Confirmado el del lector, con ajuste: reutilizar los valores de categoría de gastos (materia_prima, maquila_externa, otros) en lugar de inventar un vocabulario nuevo, y usar DROP FUNCTION + CREATE al ampliar el retorno (a03 no usa OR REPLACE). Añadir categoria_costo a compras, comprometido = CONFIRMADA y real = RECIBIDA/PAGADA, todo con monto_subtotal * TC.

**Archivos a tocar:**
- supabase/migrations/<nueva>_f06_compras_costo_comprometido_real.sql
- src/modulos/compras/validaciones/esquemas-compras.ts
- src/modulos/compras/tipos/indice.ts
- src/modulos/compras/componentes/panel-compra.tsx
- src/app/(privado)/compras/page.tsx
- src/modulos/gastos/servicios/rentabilidad-servicio.ts
- src/modulos/gastos/componentes/tarjeta-rentabilidad-orden.tsx
- src/compartido/tipos/supabase.ts

**Impacto en otros módulos:**
- [alto] gastos (rentabilidad): Cambia el retorno de las RPC.
- [medio] dashboard (supabase/migrations/20260922000004_a04_dashboard_costos_y_venta_neta.sql): Consume costos de orden con gasto.monto_total (líneas 130-208); evitar duplicar costo y decidir si incluye compras.
- [medio] ordenes/planeacion: Contrato del estimado congelado.

**Pruebas afectadas:**
- supabase/tests/sii_b8_compras.test.sql
- supabase/tests/a03_a04_ingreso_neto.test.sql
- supabase/tests/a15_estimado_por_tarifa.test.sql
- supabase/tests/sii_b9_kpis.test.sql
- tests/unitarias/gastos-rentabilidad.test.ts
- tests/unitarias/compras-esquemas.test.ts
- tests/e2e/compras-flujo.spec.ts

**Pruebas nuevas (RED):**
- pgTAP: compra CONFIRMADA suma a comprometido y no a real.
- pgTAP: RECIBIDA pasa a real de material.
- pgTAP: se usa subtotal (5,000 y no 5,800).
- pgTAP: BORRADOR y CANCELADA no suman.
- Vitest: categoriaCosto obligatoria con ordenId.

**Riesgos:**
- Doble conteo si no entra F07 junto.
- Compras históricas sin categoría.
- Redefinir RPC conservando GRANT a service_role.

**Preguntas al PO:**
- ¿Real = RECIBIDA o también PAGADA sin recibir?
- ¿Compras históricas: categoría por defecto?

**Evidencia:**
- supabase/migrations/20260922000003_a03_ingreso_neto_sin_iva.sql:279, 386-404 — Última definición de obtener_rentabilidad_orden (CREATE FUNCTION sin OR REPLACE); el costo directo sale solo de gastos.
- supabase/migrations/20260923170507_a15_distribuir_estimado_por_tarifa.sql:4, 122, 141 — Última definición del desglose; solo gastos, sin compras.
- supabase/migrations/20261007190001_sii_b8_compras_base.sql:7, 20-25, 48 — Regla 'las compras no entran a la rentabilidad'; subtotal, IVA y total en la tabla.
- supabase/migrations/20260909224637_fase_9_gastos_base.sql:43-53 — Gastos ya tiene categorías materia_prima y maquila_externa, reutilizables como vocabulario para la categoría de costo de la compra.

**Notas de verificación:** Confirmadas las definiciones vigentes (a03 y a15) y la ausencia de compras. Se añade que a03 usa CREATE FUNCTION (exige DROP al cambiar retorno) y que gastos ya ofrece categorías reutilizables.

**Omisiones halladas por el verificador:**
- supabase/migrations/20260922000004_a04_dashboard_costos_y_venta_neta.sql: Dashboard calcula costos con gastos y debe revisarse si compras entra al costo.

### F07 — ausente (confirmado) · esfuerzo S · REQUIERE MIGRACIÓN

**Estado actual:** Confirmado. No hay vínculo entre compras y gastos; solo comparten serie de folio. El grep de compra_id aparece en compras, tesorería y actividad, no en gastos.

**Cambio mínimo:** Más simple que el del lector: como la compra será fuente directa (F06), basta con no obligar a capturar Gasto. Añadir gastos.compra_id nullable (único parcial) solo si el PO necesita complementos; la columna fuente se entrega en el desglose por renglón (compra/gasto/consumo/sesión). La advertencia de duplicado en el formulario de Gasto es opcional y puede diferirse.

**Archivos a tocar:**
- supabase/migrations/<nueva> (con F06)
- src/modulos/gastos/servicios/rentabilidad-servicio.ts
- src/modulos/gastos/componentes (advertencia opcional)

**Impacto en otros módulos:**
- [medio] gastos (supabase/migrations/20261007190002_sii_b8_compras_motores.sql): Si registrar_gasto recibe compraId cambia la firma.
- [bajo] tesoreria: Sin cambio funcional.

**Pruebas afectadas:**
- supabase/tests/a19_gastos_edicion.test.sql
- supabase/tests/sii_b8_tesoreria.test.sql
- tests/integracion/gastos-acciones.test.ts
- tests/unitarias/gastos-esquemas.test.ts
- tests/e2e/gastos-rentabilidad.spec.ts

**Pruebas nuevas (RED):**
- pgTAP: compra recibida + gasto con compra_id suman una vez.
- pgTAP: desglose marca la fuente.
- e2e: compra RECIBIDA con orden actualiza rentabilidad sin capturar Gasto.

**Riesgos:**
- Sin exclusión por compra_id quien capture ambos duplica.
- Cambio de firma de registrar_gasto afecta llamadores y tipos.

**Evidencia:**
- supabase/migrations/20261007190001_sii_b8_compras_base.sql:79-119 — Solo folio compartido, sin relación.
- supabase/migrations/20261007190002_sii_b8_compras_motores.sql:114-129 — registrar_gasto sin compra_id ni origen.
- supabase/migrations/20260922000003_a03_ingreso_neto_sin_iva.sql:386-404 — Costo directo solo desde gastos.
- supabase/migrations/20261007200002_sii_b8_tesoreria_acciones.sql:193-208 — Tesorería trata pago_compra y gasto por separado.

**Notas de verificación:** Confirmado; se propone que compra_id en gastos y la advertencia sean opcionales para mantener el cambio mínimo.

### F08 — parcial (confirmado) · esfuerzo M · REQUIERE MIGRACIÓN

**Estado actual:** Confirmado. Existen proveedor, orden, subtotal, IVA, total, moneda, TC y vencimiento; faltan concepto/material, cantidad, unidad y costo unitario. DC-13 existe en Inventario con referencia libre, sin FK a compras.

**Cambio mínimo:** Confirmado el del lector: columnas nullables material_id, concepto, cantidad, unidad, costo_unitario en compras con subtotal calculado cuando hay cantidad y costo. Recortable: la conexión automática con DC-13 al pasar a RECIBIDA (y propuestas_costo_material.compra_id) puede diferirse; basta ahora con capturar los datos.

**Archivos a tocar:**
- supabase/migrations/<nueva>_f08_compras_datos_minimos_material.sql
- src/modulos/compras/validaciones/esquemas-compras.ts
- src/modulos/compras/tipos/indice.ts
- src/modulos/compras/acciones/crear-compra.ts
- src/modulos/compras/acciones/actualizar-compra.ts
- src/modulos/compras/componentes/panel-compra.tsx
- src/modulos/compras/servicios/obtener-compras.ts
- src/compartido/tipos/supabase.ts

**Impacto en otros módulos:**
- [medio] inventario (src/modulos/inventario/servicios/materiales-costos-servicio.ts): Solo si se conecta la propuesta automática.
- [bajo] auditoria (src/modulos/auditoria/utilidades/actividad.ts): Etiquetas nuevas.

**Pruebas afectadas:**
- supabase/tests/sii_b8_compras.test.sql
- supabase/tests/c6_1_materiales_costos.test.sql
- tests/unitarias/compras-esquemas.test.ts
- tests/integracion/materiales-costos-acciones.test.ts
- tests/e2e/compras-flujo.spec.ts

**Pruebas nuevas (RED):**
- Vitest: cantidad > 0 y concepto o material obligatorio.
- pgTAP: subtotal = cantidad*costo_unitario.
- pgTAP: compras antiguas siguen válidas.

**Riesgos:**
- No volver NOT NULL las columnas nuevas.
- Unidad distinta a unidad_base sin conversión.
- Cambio de firma de crear_compra/actualizar_compra_borrador.

**Evidencia:**
- supabase/migrations/20261007190001_sii_b8_compras_base.sql:12-45 — Columnas de compras sin material, cantidad, unidad ni costo unitario.
- src/modulos/compras/validaciones/esquemas-compras.ts:8-22 — Esquema Zod sin campos de material.
- supabase/migrations/20261010120000_c6_1_materiales_costos.sql:75-102 — propuestas_costo_material con fuente COMPRA y referencia libre.
- src/modulos/inventario/componentes/modal-proponer-costo.tsx:39-63 — Única UI que propone costo, a mano.

**Notas de verificación:** Confirmado; solo se sugiere diferir la integración DC-13 para mantener el cambio mínimo.

### Hallazgos extra (fuera del alcance; solo para decisión del PO)
- [alta] Costo directo de gastos usa monto_total (con IVA) en rentabilidad y dashboard (supabase/migrations/20260922000003_a03_ingreso_neto_sin_iva.sql): Confirmado en a03 (línea 388) y en a15 (líneas 122 y 141). Además a04 (dashboard, líneas 130, 137, 157, 160, 208) también suma gasto.monto_total. Contradice la regla de rentabilidad sin IVA; el lector solo citó a03 y a15. Corregir con monto_subtotal en todas.
- [baja] cambiar_estado_compra no guarda fecha ni actor de recepción (supabase/migrations/20261007190002_sii_b8_compras_motores.sql): Reportado por el lector; no re-verificado línea a línea.
- [baja] pagar_compra permite pagar sin recibir (supabase/migrations/20261007190002_sii_b8_compras_motores.sql): Reportado por el lector; definir con el PO si PAGADA cuenta como real.

### Limitaciones
- No se releyeron UI de compras ni acciones; la comparación de campos se basa en migración y esquema Zod.
- Pruebas afectadas inferidas por nombre y mapa, sin leer su contenido.
- Líneas de cambiar_estado_compra y pagar_compra no re-verificadas.
- Presupuesto de herramientas limitado; verificación dirigida a definiciones vigentes de RPC y columnas.

## Área «facturacion-cobranza» (verificada) — Finanzas: Facturación y Cobranza/CxC (factura por entrega, cancelación y aging)

**Cómo funciona hoy:** Facturación es administrativa: una factura nace de una entrega, emitir_factura captura el folio fiscal y liga la CxC de la orden, y cancelar_factura la marca CANCELADA con motivo y desvincula la CxC sin borrar la fila. La CxC es una por orden, con una sola columna factura_id. Por eso una segunda factura emitida de la misma orden falla con cuenta_ya_facturada. Cobranza conserva el aging de 5 buckets, saldo, historial y promesas. Cobranza y Facturación no dependen de costo real. Única mezcla bancaria: la tabla "Flujo por cuenta" en /cobranza. Verifiqué en el cuerpo real emitir_factura (vigente en 20261007230002) y cancelar_factura. El informe del lector es esencialmente correcto; corrijo la reubicación de F14.

### F12 — parcial (confirmado) · esfuerzo M · REQUIERE MIGRACIÓN

**Estado actual:** Confirmado. emitir_factura vigente (20261007230002, líneas 160-172) busca la CxC por orden_id y lanza cuenta_ya_facturada si factura_id apunta a otra factura. Por eso solo se puede emitir una factura por orden aunque haya varias entregas parciales. El borrador, los montos editables con CAS, el folio fiscal externo y el vínculo con CxC existen. No se verificó la unicidad de ux_cuentas_factura con una lectura nueva; se toma del lector.

**Cambio mínimo:** Como propuso el lector: facturas.cuenta_id con backfill, permitir varias EMITIDA por CxC dejando factura_id y folio denormalizados de la última, relajar ux_cuentas_factura y mostrar lo ya facturado contra la CxC. Alternativa más barata si el PO acepta diferir: documentar la limitación y no construir nada en el MVP, porque la nota solo pide no asumir 1:1 en la arquitectura. No construir tabla puente ni dividir la CxC.

**Archivos a tocar:**
- supabase/migrations/<nueva>_facturacion_varias_por_cuenta.sql
- src/modulos/facturacion/servicios/obtener-facturas.ts
- src/modulos/facturacion/servicios/errores-factura.ts
- src/modulos/facturacion/componentes/panel-factura.tsx

**Impacto en otros módulos:**
- [medio] cobranza (src/modulos/cobranza/componentes/tabla-cuentas-por-cobrar.tsx): Muestra folio_factura_remision, que sería solo el de la última factura emitida.
- [medio] cobranza (supabase/migrations/20260925000100_a20_factura_sobre_ar_existente.sql): registrar_factura_ar escribe folio_factura_remision (línea 56) sin tocar facturas ni factura_id; debe convivir con el nuevo vínculo.

**Pruebas afectadas:**
- supabase/tests/sii_b8_facturacion.test.sql
- supabase/tests/a20_factura_ar_existente.test.sql
- tests/e2e/facturacion-flujo.spec.ts

**Pruebas nuevas (RED):**
- pgTAP: dos entregas de una orden, emitir ambas sin cuenta_ya_facturada
- pgTAP: cancelar la segunda deja la CxC apuntando a la primera emitida

**Riesgos:**
- Cobranza asume una factura por CxC.
- Sin validación de suma contra la CxC puede facturarse de más.

**Evidencia:**
- supabase/migrations/20261007230002_sii_credito_dias_cliente.sql:160-172 — La CxC se busca por orden_id y cuenta_ya_facturada bloquea una segunda factura emitida.
- supabase/migrations/20261007170001_sii_b8_facturacion.sql:12-16,51-52,61-62 — entrega_id escalar; índice de entrega activa; ux_cuentas_factura (citas del lector, no releídas).
- supabase/migrations/20260814143339_fase_8_cobranza_base.sql:40 — CxC con orden_id UNIQUE (cita del lector, no releída).

**Omisiones halladas por el verificador:**
- supabase/migrations/20261007220001_sii_b8_emitir_factura_credito.sql: Es una versión previa de emitir_factura; la vigente es 20261007230002. Cualquier migración nueva debe redefinir la de 230002 completa.

### F13 — parcial (corregido) · esfuerzo XS

**Estado actual:** Confirmado leyendo el cuerpo (líneas 377-400). cancelar_factura exige permiso registrar_pagos, motivo de 3 a 500 caracteres y CAS. Pone factura_id y folio_factura_remision en NULL en la CxC. Marca CANCELADA con cancelada_en y motivo, sin borrar la fila. No toca fecha_vencimiento ni valida pagos o promesas. Rechaza una factura ya cancelada. Puede cancelar un BORRADOR, que no tiene CxC ligada, y entonces v_ar_id queda NULL.

**Cambio mínimo:** Cumple el núcleo; no tocar nada. Opcional según decisión del PO: rechazar la cancelación si la CxC ya tiene pagos aplicados. Si se hace F12, reasignar la CxC a la factura emitida previa en la misma migración.

**Archivos a tocar:**
- supabase/migrations/<nueva>_facturacion_varias_por_cuenta.sql
- supabase/tests/sii_b8_facturacion.test.sql

**Impacto en otros módulos:**
- [bajo] cobranza (src/modulos/cobranza/componentes/tabla-cuentas-por-cobrar.tsx): El folio queda vacío hasta refacturar.

**Pruebas afectadas:**
- supabase/tests/sii_b8_facturacion.test.sql
- tests/e2e/facturacion-flujo.spec.ts

**Pruebas nuevas (RED):**
- pgTAP: cancelar con pagos aplicados según decisión del PO

**Riesgos:**
- Cancelar con cobros registrados deja cobros contra una CxC sin factura.

**Evidencia:**
- supabase/migrations/20261007170001_sii_b8_facturacion.sql:371-400 — Cuerpo completo: desvincula la CxC y marca CANCELADA; sin validación de pagos.
- supabase/migrations/20261007170001_sii_b8_facturacion.sql:404-409 — Solo service_role puede ejecutarla.
- supabase/tests/sii_b8_facturacion.test.sql:121-139 — Cita del lector, no releída.

**Notas de verificación:** El lector marcó requiereMigracion=true y esfuerzo S. Para F13 por sí sola la nota ya se cumple y no se requiere migración. Solo la tocaría la migración de F12 o la validación opcional de pagos.

### F14 — parcial (corregido) · esfuerzo S

**Estado actual:** Confirmado. /cobranza/page.tsx importa obtenerFlujoCuentasServicio (línea 4), lo carga en paralelo (líneas 32-34) y renderiza la sección Flujo por cuenta (líneas 45-69), que es flujo bancario dentro de CxC. El aging, saldo, historial y promesas se conservan según el lector. No releí aging-servicio.ts. Corrección sobre la reubicación: obtener-tesoreria.ts solo menciona 'flujo' en un comentario (línea 32), así que Tesorería no tiene hoy una vista equivalente de neto por cuenta.

**Cambio mínimo:** No retirar el flujo antes de reubicarlo, porque Tesorería no lo tiene. Opción mínima: dejar el flujo como está, informativo, y marcar F14 como cumple con nota. Si el PO exige separarlo, mover primero la sección y su servicio a Tesorería (cambiar la ruta de importación) y después quitarla de /cobranza. No reescribir el aging.

**Archivos a tocar:**
- src/app/(privado)/cobranza/page.tsx
- src/modulos/cobranza/servicios/flujo-cuentas-servicio.ts
- src/modulos/cobranza/acciones/obtener-flujo-cuentas.ts
- src/app/(privado)/tesoreria/page.tsx

**Impacto en otros módulos:**
- [medio] tesoreria (src/app/(privado)/tesoreria/page.tsx): Debe recibir la vista antes de retirarla de Cobranza (hoy no la tiene).

**Pruebas afectadas:**
- tests/unitarias/cobranza-flujo-cuentas.test.ts
- tests/e2e/cobranza-flujo.spec.ts
- tests/e2e/tesoreria-flujo.spec.ts

**Pruebas nuevas (RED):**
- unitaria: clasificarBucketAging en los bordes 0, 1, 30, 31, 60, 61, 90, 91

**Riesgos:**
- Quitar el flujo de Cobranza sin reubicarlo elimina una vista en uso.

**Evidencia:**
- src/app/(privado)/cobranza/page.tsx:4,32-34,45-69 — Importa y muestra el flujo por cuenta en la pantalla de CxC.
- src/modulos/tesoreria/servicios/obtener-tesoreria.ts:32 — Única mención de 'flujo' en Tesorería, solo en un comentario; no hay vista de neto por cuenta.
- src/modulos/cobranza/servicios/flujo-cuentas-servicio.ts — Importado solo por page.tsx y obtener-flujo-cuentas.ts (grep en src/).

**Notas de verificación:** El lector dejó como duda si Tesorería ya tenía la vista. Un grep en src/modulos/tesoreria no encontró ninguna, así que la reubicación es obligatoria antes de retirar.

### Hallazgos extra (fuera del alcance; solo para decisión del PO)
- [media] cancelar_factura no valida pagos ni deja evento en la CxC (supabase/migrations/20261007170001_sii_b8_facturacion.sql): Líneas 391-400: la CxC pierde factura_id y folio aunque tenga cobros. No hay evento en la CxC; solo queda la fila en facturas.
- [media] Montos del borrador no atados a la entrega (src/modulos/facturacion/servicios/obtener-facturas.ts): Según el lector, el borrador precarga el total de toda la CxC y no hay validación contra la suma. No releí este archivo.
- [baja] Doble ruta para ligar folio a la CxC (supabase/migrations/20260925000100_a20_factura_sobre_ar_existente.sql): registrar_factura_ar escribe folio_factura_remision (línea 56) sin crear fila en facturas ni factura_id, por lo que la CxC puede tener folio sin factura.

### Limitaciones
- No releí aging-servicio.ts, obtener-facturas.ts, panel-factura.tsx ni las pruebas; esas citas se toman del lector.
- No verifiqué triggers o políticas posteriores sobre facturas.
- No leí el cuerpo de flujo-cuentas-servicio.ts ni la UI de Tesorería más allá de un grep por 'flujo' y 'neto'.

## Área «gastos-fuentes» (verificada) — Finanzas: gastos directos/indirectos, fuentes del costo real y guardarraíles (F09, F10, F15)

**Cómo funciona hoy:** La rentabilidad por orden se calcula en obtener_rentabilidad_orden (vigente: A03, 20260922000003) y obtener_desglose_rentabilidad_orden (vigente: A15, 20260923170507), con espejo TS en rentabilidad-servicio.ts. El costo real suma material consumido, mano de obra (horas_netas por costo_hora_interno de la sesión) y gastos con orden_id, sin cancelados y sin materia_prima/nomina. Directo/indirecto se decide solo por orden_id, sin prorrateo. Compras ya tiene orden_id y estados BORRADOR/CONFIRMADA/RECIBIDA/PAGADA/CANCELADA, pero no alimenta la rentabilidad y la UI lo declara (compras/page.tsx:33, panel-compra.tsx:68). No hay nivel comprometido, ajuste manual ni campo de fuente. Los gastos se suman con monto_total (con IVA) mientras la venta va sin IVA: defecto real. Los guardarraíles se respetan en lo existente.

### F09 — parcial (confirmado) · esfuerzo M · REQUIERE MIGRACIÓN

**Estado actual:** Confirmado. Directo/indirecto por orden_id: A03 L384-404 filtra gastos por orden_id sin reparto. A15 L122-147 y obs29 (L113, 253, 272, 329) usan monto_total; el espejo TS usa gasto.montoTotal (rentabilidad-servicio.ts:162). La regla 'las compras no entran a la rentabilidad' sigue en compras/page.tsx:33 (única coincidencia en src/) y panel-compra.tsx:68. No existe la agrupación Material/Subcontratación/Transporte/Otros; maquila_externa y logistica la aproximan.

**Cambio mínimo:** 1) Corregir textos de compras/page.tsx:33 y panel-compra.tsx:68 (y el COMMENT de compras). 2) Una migración que redefine (DROP+CREATE según firma) obtener_rentabilidad_orden, obtener_desglose_rentabilidad_orden y privado.costo_ti_rango para usar gasto.monto_subtotal, y calcularCostoGastosDirectosMxn en TS con montoSubtotal (verificar que el tipo del gasto lo exponga). 3) Mapa categoría->rubro solo de presentación (maquila_externa=Subcontratación, logistica=Transporte dedicado, materia_prima=Material, resto=Otros directos), sin cambiar categorías almacenadas. 4) Compra como costo: ver F10.

**Enfoque descartado:** Crear fila en gastos al recibir la compra (duplica datos y folios, riesgo de doble conteo), enum nuevo de categorías (rompe históricos y CFG-09) o prorrateo de indirectos.

**Archivos a tocar:**
- src/app/(privado)/compras/page.tsx
- src/modulos/compras/componentes/panel-compra.tsx
- src/modulos/gastos/servicios/rentabilidad-servicio.ts
- src/modulos/gastos/tipos/gastos.ts
- src/modulos/gastos/componentes/tarjeta-rentabilidad-orden.tsx
- supabase/migrations/<nueva>_rentabilidad_sin_iva_y_rubros.sql

**Impacto en otros módulos:**
- [medio] dashboard (supabase/migrations/20260922000004_a04_dashboard_costos_y_venta_neta.sql): KPIs de costo/margen deben pasar a subtotal en el mismo cambio o divergen de la orden (no releído en esta verificación).
- [medio] ordenes (src/modulos/ordenes): El mapa de rubros debe ser uno solo con el plan de Órdenes (estimado congelado / consumo).
- [bajo] configuracion (src/modulos/configuracion/validaciones/configuracion.ts): Categorías configurables nuevas caen en 'Otros directos'.

**Pruebas afectadas:**
- tests/unitarias/gastos-rentabilidad.test.ts
- tests/unitarias/gastos-desglose.test.ts
- supabase/tests/a03_a04_ingreso_neto.test.sql
- supabase/tests/a15_estimado_por_tarifa.test.sql
- tests/e2e/gastos-rentabilidad.spec.ts
- tests/unitarias/dashboard-mappers.test.ts
- supabase/tests/sii_b9_kpis.test.sql

**Pruebas nuevas (RED):**
- pgTAP RED: gasto 1,160 total / 1,000 subtotal con orden suma 1,000.
- pgTAP RED: gasto sin orden no cambia costo de ninguna orden.
- Vitest RED: calcularCostoGastosDirectosMxn usa montoSubtotal.
- Vitest RED: mapa categoría->rubro.
- Vitest RED: textos de compras sin 'no entran a la rentabilidad'.

**Riesgos:**
- Pasar de total a subtotal baja costos y sube márgenes históricos: avisar al PO.
- Cambio de firma de RPC: regenerar tipos Supabase en UTF-8.
- Doble conteo si materia_prima con orden se decide sumar.

**Preguntas al PO:**
- ¿Un gasto materia_prima con orden debe sumar como Material real cuando no hay consumo?
- ¿La Compra necesita categoría propia o basta un selector de rubro al vincularla?
- ¿Se aceptan históricos recalculados sin IVA?

**Evidencia:**
- supabase/migrations/20260922000003_a03_ingreso_neto_sin_iva.sql:384-404 — Gastos por orden_id, sin cancelados ni materia_prima/nomina, suma monto_total por TC; sin prorrateo.
- supabase/migrations/20260923170507_a15_distribuir_estimado_por_tarifa.sql:122-147 — Desglose de gastos con monto_total; materia_prima/nomina como gasto_incluido.
- supabase/migrations/20260921000003_obs29_desglose_ti_periodo.sql:113,253,272,329 — Costo TI por periodo también con monto_total.
- src/modulos/gastos/servicios/rentabilidad-servicio.ts:162 — convertirAMxn(gasto.montoTotal, ...) en el espejo TS.
- src/app/(privado)/compras/page.tsx:33 — Texto 'Las compras no entran a la rentabilidad de las órdenes.'
- supabase/migrations/20261007190001_sii_b8_compras_base.sql:17-25 — compras ya tiene orden_id, estado y monto_subtotal/iva/total coherentes.

**Notas de verificación:** Confirmado tras releer A03, A15, obs29, TS y compras base. Matiz: compras ya tiene orden_id, por lo que el plan de leerlas en las RPC es viable sin añadir vínculo.

**Omisiones halladas por el verificador:**
- supabase/migrations/20260921000003_obs29_desglose_ti_periodo.sql: Líneas 113, 253, 272 y 329 también usan monto_total; deben entrar en la migración sin IVA.
- supabase/migrations/20260919000001_rfq08_fechas_gasto_cuenta.sql: Otra definición histórica de registrar_gasto con lista fija; la vigente es la de sii_b8.

### F10 — parcial (confirmado) · esfuerzo L · REQUIERE MIGRACIÓN

**Estado actual:** Confirmado. Material (consumo con costo congelado) y mano de obra (horas reales x tarifa copiada a la sesión) existen: A03 L365-382. Gasto directo vía gastos.orden_id. Subcontratación solo como categoría maquila_externa. Compra no alimenta nada, aunque compras tiene orden_id y estados utilizables. No hay ajuste manual autorizado, campo de fuente ni nivel comprometido en ninguna RPC (no se halló en las definiciones vigentes).

**Cambio mínimo:** Una migración: (a) compras.categoria (o rubro) y que las RPC lean compras con orden_id: RECIBIDA/PAGADA como real, CONFIRMADA como comprometido, usando monto_subtotal x TC; la compra no crea gasto. (b) Ajuste manual: mínimo, solo si el PO lo pide; preferir una columna origen en gastos con motivo obligatorio y can() con permiso admin o nuevo, en vez de relajar CHECKs globales de importes. (c) Añadir fuente al desglose y costo_comprometido_mxn a obtener_rentabilidad_orden; UI: columna de fuente y bloque comprometido. (d) Mano de obra queda como horas reales x tarifa congelada; sin costo estándar.

**Enfoque descartado:** Tabla genérica costos_orden con ledger y backfill: motor nuevo sobredimensionado. Tampoco costo estándar por partida con tarifas sin calibrar.

**Archivos a tocar:**
- supabase/migrations/<nueva>_fuentes_costo_real.sql
- src/modulos/gastos/validaciones/gastos.ts
- src/modulos/gastos/acciones/guardar-gasto-a19.ts
- src/modulos/gastos/servicios/gastos-servicio.ts
- src/modulos/gastos/tipos/gastos.ts
- src/modulos/gastos/componentes/tarjeta-rentabilidad-orden.tsx
- src/modulos/compras/validaciones/esquemas-compras.ts
- src/modulos/compras/componentes/panel-compra.tsx
- src/compartido/tipos/supabase.ts

**Impacto en otros módulos:**
- [medio] compras (supabase/migrations/20261007190002_sii_b8_compras_motores.sql): crear_compra y actualizar_compra_borrador deben aceptar categoría.
- [alto] ordenes (src/modulos/ordenes/acciones/registrar-consumo.ts): Doble conteo de material entre consumo y compra recibida sobre la misma orden; definir una regla única con Órdenes.
- [medio] dashboard (supabase/migrations/20260922000004_a04_dashboard_costos_y_venta_neta.sql): Decidir si el KPI de costo real incluye compras recibidas.
- [bajo] tesoreria (src/modulos/tesoreria): pagar_compra no debe afectar rentabilidad.

**Pruebas afectadas:**
- supabase/tests/a19_gastos_edicion.test.sql
- supabase/tests/sii_b8_compras.test.sql
- supabase/tests/a03_a04_ingreso_neto.test.sql
- supabase/tests/c6_2_consumo_sin_stock.test.sql
- tests/unitarias/compras-esquemas.test.ts
- tests/unitarias/gastos-esquemas.test.ts
- tests/integracion/gastos-acciones.test.ts
- tests/e2e/compras-flujo.spec.ts

**Pruebas nuevas (RED):**
- pgTAP RED: compra CONFIRMADA con orden suma a comprometido, RECIBIDA a real.
- pgTAP RED: la compra no crea fila en gastos.
- pgTAP RED: ajuste sin motivo o sin permiso falla.
- pgTAP RED: desglose devuelve fuente por rubro.
- Vitest RED: acción de ajuste verifica can() y registrarLog.

**Riesgos:**
- Doble conteo material entre consumo, compra recibida y gasto materia_prima.
- Permitir importes negativos en ajustes toca CHECKs de gastos.
- Cambio de firma de RPC: regenerar tipos en UTF-8.

**Preguntas al PO:**
- ¿Quién autoriza un ajuste: admin o permiso nuevo?
- ¿La compra es costo real al estar RECIBIDA o al confirmar el costo?
- ¿Se muestra costo estándar de producción o basta horas reales x tarifa?

**Evidencia:**
- supabase/migrations/20260922000003_a03_ingreso_neto_sin_iva.sql:365-382 — Material desde registros_consumo_material y mano de obra desde sesiones_trabajo pausada/finalizada.
- supabase/migrations/20260923170507_a15_distribuir_estimado_por_tarifa.sql:41-150 — Desglose por rubro mano_obra/material/gasto/gasto_incluido, sin columna de fuente.
- supabase/migrations/20261007190001_sii_b8_compras_base.sql:17-25 — compras con orden_id, estado y montos subtotal/iva/total; sin categoría.
- supabase/migrations/20261007190002_sii_b8_compras_motores.sql:54-59 — registrar_gasto vigente con 9 categorías fijas.

**Notas de verificación:** Confirmado. Se sugiere acotar el ajuste manual a decisión del PO por ser lo más pesado del paquete; el resto (compras con orden_id) es viable con lo existente.

### F15 — cumple (confirmado) · esfuerzo XS

**Estado actual:** Confirmado en lo existente: A03 L384-404 no reparte indirectos y no hay prorrateo en las RPC de rentabilidad; el costo TI es agregado por periodo. La conciliación de tesorería es manual. Las tarifas por estación ya existen. Riesgo futuro solo si se añade reparto, kardex desde compras o motor de costos.

**Cambio mínimo:** ninguno en código existente; añadir pruebas RED de guardarraíl y dejarlos como criterio de aceptación de F09/F10.

**Enfoque descartado:** Retirar o esconder tarifas, inventario o conciliación manual: piezas en uso; reubicar antes de retirar.

**Archivos a tocar:**
- supabase/tests/<nuevo>_guardarrailes_rentabilidad.test.sql

**Impacto en otros módulos:**
- [bajo] tesoreria (src/modulos/tesoreria/acciones/conciliar-movimiento.ts): Debe seguir separada de la rentabilidad.

**Pruebas afectadas:**
- supabase/tests/a03_a04_ingreso_neto.test.sql
- tests/unitarias/gastos-rentabilidad.test.ts

**Pruebas nuevas (RED):**
- pgTAP RED: gasto indirecto grande no cambia el costo de ninguna orden.
- pgTAP RED: movimientos y transferencias de tesorería no modifican obtener_rentabilidad_orden.

**Riesgos:**
- Sin prueba RED un cambio futuro podría repartir indirectos.

**Preguntas al PO:**
- ¿Se mantiene visible el historial de movimientos de inventario?

**Evidencia:**
- supabase/migrations/20260922000003_a03_ingreso_neto_sin_iva.sql:384-404 — Solo gastos con orden_id; sin cláusula de reparto.
- supabase/migrations/20260921000003_obs29_desglose_ti_periodo.sql:253-329 — Costo TI por periodo, no asignado a órdenes de cliente.

**Notas de verificación:** Confirmado; no se reverificaron las referencias a inventario y tesorería de esta fila.

### Hallazgos extra (fuera del alcance; solo para decisión del PO)
- [alta] Rentabilidad suma gastos con IVA (supabase/migrations/20260922000003_a03_ingreso_neto_sin_iva.sql): Verificado: A03 L388, A15 L122/141, obs29 L113/253/272/329 y rentabilidad-servicio.ts:162 usan monto_total, mientras la venta va en monto_subtotal. Contradice la regla de rentabilidad sin IVA.
- [media] Categorías configurables rechazadas por registrar_gasto (supabase/migrations/20261007190002_sii_b8_compras_motores.sql): La migración 20260919000002 relajó el CHECK de gastos.categoria a un formato libre, pero registrar_gasto vigente (L54-59) valida contra 9 categorías fijas, así que una categoría creada en Configuración fallaría con categoria_gasto_invalida.
- [baja] Mensaje de compras contradice la nota del cliente (src/app/(privado)/compras/page.tsx): L33 y panel-compra.tsx L68 afirman que la compra no entra a la rentabilidad.

### Limitaciones
- No ejecuté pruebas ni consulté el remoto.
- No releí dashboard a04 ni sii_b9 ni las pruebas pgTAP/e2e; su afectación se infiere de los mapas.
- No reverifiqué las referencias de F15 a inventario y tesorería.
- No leí PLAN-ORDENES-RESUMEN.md; la coherencia con Órdenes queda como pregunta.

## Área «material-tres-niveles» (verificada) — Finanzas: tres niveles de costo (estimado / comprometido / real) y Material independiente

**Cómo funciona hoy:** La rentabilidad por Orden (obtener_rentabilidad_orden, A03, con el desglose A15) tiene un solo nivel, el real. Suma consumo de material congelado, sesiones de mano de obra y gastos con orden_id, y excluye materia_prima y nomina. El estimado existe en propuesta_revision_costos y el ruteo costeado, pero no se compara en Finanzas. Las compras tienen orden_id opcional y estado, y están declaradas fuera de la rentabilidad (comentario en compras_base línea 48). El mapa del lector se confirma en lo esencial. Verifiqué que los triggers de congelado existen sobre propuesta_revision_costos y propuesta_item_ruteo (b4_propuestas_base 444-508), por lo que el estimado se puede leer de la revisión sin copiarlo al snapshot_json. Confirmé el defecto de IVA en gastos: monto_total en A03 línea 388 y en A15 líneas 122 y 141.

### F03 — ausente (corregido) · esfuerzo M · REQUIERE MIGRACIÓN

**Estado actual:** Solo existe el nivel real. Estimado y comprometido no se calculan como cifras de Finanzas. El estimado vive en propuesta_revision_costos y el ruteo costeado, y no está en el snapshot_json de la Orden. Las compras con orden_id y estado CONFIRMADA o posterior no se agregan a ningún cálculo.

**Cambio mínimo:** Confirmado el del lector: RPC de solo lectura obtener_conciliacion_costos_orden(p_orden_id) que lee estimado de la revisión ligada (propuesta_revision_id), comprometido de compras con orden_id en CONFIRMADA/RECIBIDA (monto_subtotal x TC, sin IVA) y real del RPC existente; acción con Zod y permiso, y tabla dentro de tarjeta-rentabilidad-orden.tsx. No congelar en snapshot_json: los triggers ya hacen estable la revisión, así que leerla basta. Corregir el COMMENT de compras.

**Archivos a tocar:**
- supabase/migrations/<AAAAMMDDNNNNNN>_f03_conciliacion_costos_orden.sql
- src/modulos/gastos/acciones/obtener-conciliacion-costos.ts
- src/modulos/gastos/acciones/indice.ts
- src/modulos/gastos/servicios/gastos-servicio.ts
- src/modulos/gastos/tipos/gastos.ts
- src/modulos/gastos/validaciones/gastos.ts
- src/modulos/gastos/componentes/tarjeta-rentabilidad-orden.tsx
- supabase/tests/f03_conciliacion_costos.test.sql

**Impacto en otros módulos:**
- [medio] propuestas (supabase/migrations/20261009160000_c3_3_snapshot_costeo_ruteo.sql): La RPC depende del estimado y del ruteo costeado; el tarifario único (20261014110000, modificada localmente) puede alterarlo.
- [medio] ordenes (src/modulos/ordenes/servicios/ficha-orden-servicio.ts): Solo si se decide congelar costos en snapshot_json.
- [bajo] compras (src/modulos/compras/servicios/obtener-compras.ts): Solo lectura de compras.

**Pruebas afectadas:**
- supabase/tests/a03_a04_ingreso_neto.test.sql
- supabase/tests/a15_estimado_por_tarifa.test.sql
- supabase/tests/sii_b8_compras.test.sql
- tests/unitarias/gastos-rentabilidad.test.ts
- tests/unitarias/gastos-desglose.test.ts

**Pruebas nuevas (RED):**
- pgTAP: estimado, comprometido y real por categoría con variación real menos estimado.
- pgTAP: compra CANCELADA, BORRADOR o sin orden_id no es comprometida.
- pgTAP: la RPC no es ejecutable por authenticated ni anon.
- Vitest: mapearConciliacionCostos con la misma venta neta para ambos márgenes; null si no hay venta.
- Vitest: la acción rechaza ordenId no uuid.

**Riesgos:**
- Órdenes heredadas o internas sin propuesta_revision_id: mostrar 'sin estimado', no 0.
- Mezcla de monedas entre compra y consumo.
- Hay que mapear fabricación = maquina + mano_obra del estimado contra sesiones, y maquila_externa a subcontratación.
- Si el PO insiste en congelar en el snapshot, es un cambio mayor que choca con el plan de Órdenes; no es necesario.

**Preguntas al PO:**
- ¿Se acepta como comprometido toda compra ligada a Orden en CONFIRMADA o RECIBIDA, y no BORRADOR?
- ¿Basta leer el estimado de la revisión (inmutable) en lugar de copiarlo al snapshot_json?

**Evidencia:**
- supabase/migrations/20260922000003_a03_ingreso_neto_sin_iva.sql:365-410 — El costo total tiene un solo nivel (consumo, sesiones y gastos). La línea 388 usa gasto.monto_total.
- supabase/migrations/20261007190001_sii_b8_compras_base.sql:7, 48 — La cabecera y el COMMENT dicen que la compra no entra a rentabilidad.
- supabase/migrations/20261007110001_sii_b4_propuestas_base.sql:426-508 — Los triggers de revisión congelada cubren propuesta_revision_costos, propuesta_item_ruteo e items; el estimado es estable una vez enviada la revisión.
- supabase/migrations/20261007120001_sii_b5_orden_base.sql:536-565 — El snapshot_json no contiene costos.

**Notas de verificación:** Resolví la duda del lector sobre inmutabilidad: existen triggers de revisión congelada para propuesta_revision_costos y propuesta_item_ruteo, así que el estimado no se mueve tras enviar la revisión y no hace falta congelarlo en el snapshot. Lo demás se confirma.

**Omisiones halladas por el verificador:**
- supabase/migrations/20260922000003_a03_ingreso_neto_sin_iva.sql: Los gastos suman monto_total (con IVA, línea 388); el nivel 'real' queda inflado y contradice la regla sin IVA. Conviene corregirlo en la misma migración o antes.

### F05 — parcial (corregido) · esfuerzo S · REQUIERE MIGRACIÓN

**Estado actual:** Material ya es un rubro independiente del real (costo_materiales_mxn y rubro 'material' del desglose A15), basado en consumo congelado y sin inventario formal. Faltan el estimado comparado, el comprometido y la variación absoluta y porcentual. Las compras son solo cabecera, sin material, cantidad ni unidad.

**Cambio mínimo:** Confirmado: la fila 'material' de la misma RPC de F03, con estimado (categoria='material'), comprometido (compras CONFIRMADA/RECIBIDA con orden_id) y real = consumo, y variación absoluta y % (nula si estimado 0). Sin tablas ni inventario. Mantener consumo como real y dejar la sustitución por compra RECIBIDA como decisión posterior del PO. No hace falta migración aparte de la de F03: se unifican en una sola.

**Archivos a tocar:**
- supabase/migrations/<AAAAMMDDNNNNNN>_f03_conciliacion_costos_orden.sql
- src/modulos/gastos/servicios/gastos-servicio.ts
- src/modulos/gastos/tipos/gastos.ts
- src/modulos/gastos/componentes/tarjeta-rentabilidad-orden.tsx

**Impacto en otros módulos:**
- [bajo] gastos (src/modulos/gastos/servicios/rentabilidad-servicio.ts): Espejo TypeScript del cálculo; mantener alineado.
- [bajo] dashboard (src/modulos/dashboard/tipos/dashboard.ts): No cambia si el real sigue siendo el consumo.
- [medio] inventario (src/modulos/inventario/servicios/materiales-costos-servicio.ts): Solo si la compra gana líneas y propone costo (DC-13).

**Pruebas afectadas:**
- supabase/tests/c6_2_consumo_sin_stock.test.sql
- supabase/tests/a15_estimado_por_tarifa.test.sql
- supabase/tests/sii_b8_compras.test.sql
- tests/unitarias/gastos-desglose.test.ts
- tests/unitarias/gastos-rentabilidad.test.ts

**Pruebas nuevas (RED):**
- pgTAP: compra de 5,450 sin IVA, estimado 5,000 y consumo 5,450 dan variación +450 y +9%.
- pgTAP: estimado 0 da variación % nula.
- pgTAP anti doble conteo: compra y consumo no suman dos veces.
- Vitest: formato de variación del rubro material.

**Riesgos:**
- Doble conteo si se suma la compra RECIBIDA y el consumo.
- El consumo valúa al costo vigente del maestro, no al de la compra; la variación puede ser cero aunque la compra haya costado más.
- Sin líneas de compra, el comprometido es por Orden, no por material concreto.

**Preguntas al PO:**
- ¿El 'real de material' es el consumo de Producción o la compra recibida? No se pueden sumar.
- ¿Las líneas de compra (material, cantidad, unidad) van en esta tanda o en una posterior?

**Evidencia:**
- supabase/migrations/20260923170507_a15_distribuir_estimado_por_tarifa.sql:93-148 — El rubro material sale del consumo; materia_prima y nomina no suman. Las líneas 122 y 141 suman monto_total.
- supabase/migrations/20261010130000_c6_2_consumo_sin_stock.sql:96-140, 204-216 — El consumo congela costo y TC sin mover existencias.
- supabase/migrations/20261007190001_sii_b8_compras_base.sql:12-45 — compras no tiene columnas de material, cantidad ni unidad.
- src/modulos/gastos/componentes/tarjeta-rentabilidad-orden.tsx:74-88 — Material consumido sin estimado ni variación.

**Notas de verificación:** Bajé el esfuerzo a S y unifiqué la migración con la de F03 para no duplicar trabajo. Se mantienen las preguntas al PO.

### Hallazgos extra (fuera del alcance; solo para decisión del PO)
- [alta] Rentabilidad suma gastos con IVA (monto_total) (supabase/migrations/20260922000003_a03_ingreso_neto_sin_iva.sql): Confirmado en la línea 388 de A03 y en las líneas 122 y 141 de A15. La tabla gastos tiene monto_subtotal y monto_iva. Contradice la regla de rentabilidad sin IVA y deprime el margen real.
- [baja] Comentario de compras contradice lo pedido (supabase/migrations/20261007190001_sii_b8_compras_base.sql): Líneas 7 y 48 dicen que no entra a rentabilidad; actualizar al implementar F03.
- [media] Subcontratación no se separa en el desglose real (supabase/migrations/20260923170507_a15_distribuir_estimado_por_tarifa.sql): maquila_externa aparece como gasto genérico; hay que mapearla a subcontratación para conciliar.

### Limitaciones
- No revisé la migración local modificada 20261014110000 (tarifario único).
- No leí el cuerpo de pagar_compra ni los planes C8 y C9 de Órdenes y Planeación.
- No existe la carpeta pistas/; me basé en el mapa y el código.
- No ejecuté pruebas ni consulté el remoto.

## Área «rentabilidad-orden» (verificada) — Finanzas — Rentabilidad por Orden (vista, estimado vs real, márgenes, base sin IVA)

**Cómo funciona hoy:** La rentabilidad por Orden vive solo en Gastos (tarjeta con selector de Orden). Usa las RPC obtener_rentabilidad_orden (definición vigente: 20260922000003_a03) y obtener_desglose_rentabilidad_orden (vigente: 20260923170507_a15), ambas solo service_role. Solo existe el lado real: venta neta sin IVA de cuentas_por_cobrar.monto_subtotal (AR cobrables), más material consumido, mano de obra por sesiones y gastos. No hay estimado, comprometido ni variación, aunque propuesta_revision_costos persiste el estimado por categoría. Los gastos se suman con monto_total (con IVA), lo que contradice la regla sin IVA. El informe del lector se confirma; solo se revisaron en esta pasada las citas de F11 y la regla de gastos, y el resto queda como lo dejó el lector.

### F01 — parcial (confirmado) · esfuerzo M · REQUIERE MIGRACIÓN

**Estado actual:** Existe la tarjeta de rentabilidad real por Orden en Gastos, sin menú nuevo. Muestra venta neta, costo, utilidad y margen reales. Faltan costo estimado y variación. Las RPC vigentes devuelven solo reales. Este punto no se re-leyó a fondo en la revisión, se acepta lo reportado por el lector.

**Cambio mínimo:** Función nueva service_role obtener_conciliacion_costos_orden(p_orden_id) con estimado desde propuesta_revision_costos de la revisión que originó la Orden, más acción con can(ver_finanzas), tipo y componente dentro de la tarjeta actual. Sin tocar las RPC existentes.

**Migración:** Una función nueva SECURITY DEFINER, search_path vacío, REVOKE a PUBLIC/anon/authenticated y GRANT a service_role. Sin tablas ni columnas. Regenerar tipos en UTF-8.

**Archivos a tocar:**
- supabase/migrations/<nueva>_f01_conciliacion_costos_orden.sql
- src/modulos/gastos/servicios/gastos-servicio.ts
- src/modulos/gastos/acciones/obtener-conciliacion-costos.ts
- src/modulos/gastos/acciones/indice.ts
- src/modulos/gastos/tipos/gastos.ts
- src/modulos/gastos/componentes/tarjeta-rentabilidad-orden.tsx
- src/modulos/gastos/componentes/operacion-gastos.tsx
- src/compartido/tipos/supabase.ts

**Impacto en otros módulos:**
- [bajo] propuestas (src/modulos/propuestas/tipos/indice.ts): El mapeo de categorías de costo debe seguir alineado.
- [medio] dashboard (supabase/migrations/20261007210001_sii_b9_kpis.sql): Calcula margen estimado agregado desde la misma fuente; evitar discrepancias.

**Pruebas afectadas:**
- tests/unitarias/gastos-rentabilidad.test.ts
- tests/unitarias/gastos-desglose.test.ts
- supabase/tests/a03_a04_ingreso_neto.test.sql
- supabase/tests/a15_estimado_por_tarifa.test.sql

**Pruebas nuevas (RED):**
- pgTAP: estimado por categoría desde revisión aceptada, inmune a revisiones posteriores.
- pgTAP: la RPC no es ejecutable por authenticated/anon.
- Unitaria: la acción niega sin ver_finanzas.
- E2E: seleccionar Orden muestra tabla Estimado/Real/Variación.

**Riesgos:**
- Orden sin revisión de propuesta: mostrar «sin estimado», no cero.
- Estimado de Fabricación puede ser parcial hasta que el ruteo esté costeado.
- USD: convertir con el TC del snapshot.

**Preguntas al PO:**
- ¿La vista va solo en Gastos con filtro por Orden o también en la ficha de Orden?
- ¿El estimado de Fabricación es maquina + mano_obra de la propuesta, o solo el ruteo?

**Evidencia:**
- supabase/migrations/20260922000003_a03_ingreso_neto_sin_iva.sql:279-445 — RPC vigente de rentabilidad (única definición posterior a d04 y obs29); solo reales.
- supabase/migrations/20260923170507_a15_distribuir_estimado_por_tarifa.sql:4-156 — RPC de desglose vigente; solo reales.
- src/modulos/gastos/componentes/tarjeta-rentabilidad-orden.tsx:220-269 — Tarjeta sin columnas Estimado/Variación (cita del lector).

**Notas de verificación:** Se confirmó que las definiciones vigentes de ambas RPC son las de a03 y a15. No se re-leyeron la tarjeta ni propuesta_revision_costos.

### F02 — ausente (confirmado) · esfuerzo M · REQUIERE MIGRACIÓN

**Estado actual:** No hay tabla por concepto con Estimado, Real y Variación. El real tiene tres rubros: material consumido, mano de obra y gastos. No existe rubro Subcontratación: maquila_externa cae en gastos directos. Los gastos materia_prima y nomina ligados a la Orden no suman, para no duplicar con consumo y sesiones, y quedan solo como conteo de «incluidos».

**Cambio mínimo:** La misma función nueva de F01 devuelve una fila por concepto con estimado, real, variación absoluta y porcentual (null si el estimado es 0). Subcontratación = gastos maquila_externa, separados solo en la función nueva. La variación se calcula como función pura en rentabilidad-servicio.ts.

**Enfoque descartado:** Agregar columnas de estimado a obtener_rentabilidad_orden (DROP+CREATE) o crear una tabla materializada: rompe tipos y pruebas y añade estado a sincronizar.

**Migración:** Comparte la migración de F01.

**Archivos a tocar:**
- supabase/migrations/<nueva>_f01_conciliacion_costos_orden.sql
- src/modulos/gastos/servicios/rentabilidad-servicio.ts
- src/modulos/gastos/tipos/gastos.ts
- src/modulos/gastos/componentes/tabla-conciliacion-costos.tsx
- src/modulos/gastos/componentes/tarjeta-rentabilidad-orden.tsx

**Impacto en otros módulos:**
- [medio] configuracion (src/modulos/configuracion/hooks/usar-catalogos-comerciales.ts): Las categorías de gasto son configurables; maquila_externa debe seguir existiendo para el mapeo.
- [medio] compras (src/modulos/compras/servicios/obtener-compras.ts): Material y Subcontratación reales no vienen de compras hasta resolver el vínculo Compra-costo real.

**Pruebas afectadas:**
- tests/unitarias/gastos-rentabilidad.test.ts
- tests/unitarias/gastos-desglose.test.ts
- supabase/tests/a15_estimado_por_tarifa.test.sql

**Pruebas nuevas (RED):**
- Unitaria: ejemplo del cliente (5000/5450, 2000/1800, 0/500, 800/650, total 7800/8400, +600).
- Unitaria: estimado 0 da porcentaje null.
- pgTAP: maquila_externa aparece en Subcontratación y no en Gastos directos.

**Riesgos:**
- Un gasto de material sin consumo registrado infraestima el costo real.
- Cambiar la regla altera márgenes ya vistos por el cliente.

**Preguntas al PO:**
- ¿El gasto materia_prima ligado a una Orden cuenta como Material real?
- ¿maquila_externa se mapea a Subcontratación?

**Evidencia:**
- supabase/migrations/20260922000003_a03_ingreso_neto_sin_iva.sql:384-404 — Verificado: materia_prima y nomina excluidas de la suma; el resto va a gastos.
- supabase/migrations/20260923170507_a15_distribuir_estimado_por_tarifa.sql:114-148 — El desglose agrupa gastos por categoría con monto_total.
- src/modulos/gastos/tipos/gastos.ts:7-17 — Nueve categorías de gasto, sin subcontratación como rubro (cita del lector).

### F04 — parcial (confirmado) · esfuerzo S · REQUIERE MIGRACIÓN

**Estado actual:** Solo existe margen real (utilidad / venta neta). La venta neta es SUM(monto_subtotal) de AR cobrables, convertida con tipo_cambio_origen. Si alguna AR no tiene desglose, el resultado es NULL. No hay margen estimado por Orden. Antes de entregar la Orden no hay AR cobrable, así que la venta real es 0 y el margen es NULL. La base común debe definirse.

**Cambio mínimo:** En la función nueva devolver venta_base única (snapshot_json.totales.subtotal de la Orden × TC, o monto_subtotal de la AR) y los dos márgenes sobre ella. obtener_rentabilidad_orden queda sin cambios. La tarjeta muestra la venta base.

**Enfoque descartado:** Cambiar la base del margen real existente a snapshot: altera la semántica D-04 y la prueba a03_a04.

**Migración:** Misma función de F01.

**Archivos a tocar:**
- supabase/migrations/<nueva>_f01_conciliacion_costos_orden.sql
- src/modulos/gastos/servicios/rentabilidad-servicio.ts
- src/modulos/gastos/componentes/tarjeta-rentabilidad-orden.tsx
- src/modulos/gastos/tipos/gastos.ts

**Impacto en otros módulos:**
- [medio] dashboard (src/modulos/dashboard/servicios/dashboard-servicio.ts): El margen estimado agregado usa otra base y puede discrepar.

**Pruebas afectadas:**
- tests/unitarias/gastos-rentabilidad.test.ts
- supabase/tests/a03_a04_ingreso_neto.test.sql
- supabase/tests/sii_b9_kpis.test.sql

**Pruebas nuevas (RED):**
- Unitaria: venta 20000, estimado 7800 da 61 %, real 8400 da 58 %.
- pgTAP: ambos márgenes con el mismo denominador aunque la AR no sea cobrable.
- pgTAP: sin desglose ni snapshot los márgenes son NULL.

**Riesgos:**
- Dos bases de venta posibles (AR vs snapshot) pueden diferir; elegir una sola.
- Con USD el TC debe ser el mismo en ambos márgenes.

**Preguntas al PO:**
- ¿La venta base común es la de la Propuesta aceptada (snapshot) o la de la AR?

**Evidencia:**
- supabase/migrations/20260922000003_a03_ingreso_neto_sin_iva.sql:334-362 — Verificado en el grep: la venta usa monto_subtotal, y monto_total solo se usa como comparación.
- supabase/migrations/20260922000003_a03_ingreso_neto_sin_iva.sql:406-431 — Utilidad y margen sobre la venta neta.
- src/modulos/gastos/servicios/rentabilidad-servicio.ts:173-204 — Misma fórmula en TS (cita del lector, no re-leída).

### F11 — parcial (confirmado) · esfuerzo S · REQUIERE MIGRACIÓN

**Estado actual:** La venta es neta sin IVA (A03). El costo de gastos contradice la regla: la RPC vigente suma gasto.monto_total (con IVA) × TC, y el desglose (a15) hace lo mismo. TS usa gasto.montoTotal (rentabilidad-servicio.ts:162). Un gasto de 5800 con IVA 800 cuenta 5800 en el costo. La tabla gastos tiene monto_subtotal. Las compras no entran. Discrepancia menor: TS excluye gastos MXN con TC distinto de 1 (líneas 158-161) y SQL no (línea 388). El tipo de ingreso ya tiene montoSubtotal (línea 26), pero el tipo Gasto no.

**Cambio mínimo:** Migración con CREATE OR REPLACE de las dos RPC, misma firma, usando gasto.monto_subtotal. Cambio paralelo en rentabilidad-servicio.ts (agregar montoSubtotal a Gasto y usarlo) y en el mapeo de gastos-servicio.ts. El dashboard se reporta aparte.

**Enfoque descartado:** Dividir monto_total entre 1+tasa: reescribiría costos con la tasa vigente; el subtotal ya está persistido.

**Migración:** CREATE OR REPLACE de dos funciones, la última de cada una es a03 (rentabilidad) y a15 (desglose). Si la migración de F01 también toca el desglose, ordenar bien los timestamps. Sin cambio de datos.

**Archivos a tocar:**
- supabase/migrations/<nueva>_f11_costo_gastos_sin_iva.sql
- src/modulos/gastos/servicios/rentabilidad-servicio.ts
- src/modulos/gastos/tipos/gastos.ts
- src/modulos/gastos/servicios/gastos-servicio.ts

**Impacto en otros módulos:**
- [medio] dashboard (supabase/migrations/20260916000001_dashboard_respuesta_gastos.sql): Sigue con IVA hasta alinear.
- [bajo] compras (supabase/migrations/20261007190001_sii_b8_compras_base.sql): Usar monto_subtotal al conectar compras.

**Pruebas afectadas:**
- supabase/tests/a03_a04_ingreso_neto.test.sql
- supabase/tests/a15_estimado_por_tarifa.test.sql
- tests/unitarias/gastos-rentabilidad.test.ts
- tests/unitarias/gastos-desglose.test.ts
- tests/integracion/gastos-acciones.test.ts
- tests/e2e/gastos-rentabilidad.spec.ts

**Pruebas nuevas (RED):**
- pgTAP RED: gasto con subtotal 5000, IVA 800 y total 5800 ligado a Orden da costo 5000.
- pgTAP RED: el desglose por categoría suma subtotal.
- Unitaria RED: calcularCostoGastosDirectosMxn usa montoSubtotal.

**Riesgos:**
- El costo baja y el margen sube en órdenes con gastos con IVA: avisar al cliente.
- Los pgTAP existentes que asumen monto_total se romperán por diseño.
- El dashboard seguirá divergiendo de la tarjeta.

**Preguntas al PO:**
- ¿Se alinea también el dashboard a base sin IVA?
- ¿Hay gastos sin IVA acreditable que deban contar con el total?

**Evidencia:**
- supabase/migrations/20260922000003_a03_ingreso_neto_sin_iva.sql:386-392 — Verificado: SUM(gasto.monto_total × TC) en el costo de gastos.
- supabase/migrations/20260923170507_a15_distribuir_estimado_por_tarifa.sql:122-142 — Verificado: el desglose también usa monto_total.
- src/modulos/gastos/servicios/rentabilidad-servicio.ts:158-162 — Verificado: exclusión MXN con TC ≠ 1 y uso de montoTotal.
- supabase/migrations/20260909224637_fase_9_gastos_base.sql:55-57 — gastos tiene monto_subtotal, monto_iva y monto_total (cita del lector).
- supabase/migrations/20260916000001_dashboard_respuesta_gastos.sql:113-132 — El dashboard también suma monto_total (cita del lector).

**Notas de verificación:** Confirmado con lectura directa de a03, a15 y rentabilidad-servicio.ts. Se agregó que el desglose es la definición a15 (no obs29) y que el tipo de ingreso ya tiene montoSubtotal, patrón reutilizable.

### Hallazgos extra (fuera del alcance; solo para decisión del PO)
- [media] Dashboard suma gastos con IVA y venta con monto_total (supabase/migrations/20260916000001_dashboard_respuesta_gastos.sql): Reportado por el lector sin re-verificar aquí: puede discrepar de la tarjeta por Orden.
- [baja] TS vs SQL difieren con gastos MXN y TC distinto de 1 (src/modulos/gastos/servicios/rentabilidad-servicio.ts): Verificado: TS excluye el gasto (líneas 158-161) y SQL multiplica por tipo_cambio (línea 388 de a03).
- [media] Gasto materia_prima ligado a Orden no suma al costo real (supabase/migrations/20260922000003_a03_ingreso_neto_sin_iva.sql): Verificado en líneas 384-404. Sin consumo registrado, el costo de material queda fuera y el margen se sobreestima.

### Limitaciones
- Revisión acotada: se re-verificaron solo las migraciones a03 y a15, las definiciones vigentes de las RPC y rentabilidad-servicio.ts. No se re-leyeron tarjeta, propuesta_revision_costos, snapshot de la Orden ni pruebas existentes.
- Mapeo de Fabricación estimada (maquina + mano_obra frente al ruteo C3.3) sin confirmar.
- Anticipos y notas de crédito sobre monto_subtotal de AR sin inspeccionar.
- Sin ejecución; sin leer el plan de Órdenes ni los mapas MAPA-gastos.

## Área «tesoreria-coherencia» (verificada) — Tesorería, coherencia con Órdenes/Planeación, alcance y trazabilidad documental (Finanzas, C10)

**Cómo funciona hoy:** Tesorería calcula en TypeScript (obtener-tesoreria.ts) el saldo por cuenta = saldo inicial + cobros (pagos_ar con cuenta) - pagos de compra - gastos pagados con cuenta, más transferencias como pares SALIDA/ENTRADA de movimientos_tesoreria. Las transferencias solo mueven saldo entre cuentas y ningún total de ingresos o egresos las cuenta. La conciliación es un marcado manual por movimiento. Fuera de src/modulos/tesoreria, solo cobranza (flujo-cuentas-servicio.ts, historial, realtime), configuración y gastos (catálogo de cuentas) tocan cuentas_bancarias o movimientos_tesoreria. Ninguno usa Tesorería para rentabilidad, así que F17 y F18 se confirman. F16 se degrada a parcial: reversar_pago_ar no borra el pago, inserta una fila en reversos_pago_ar, y Tesorería no excluye los cobros reversados, así que el saldo de la cuenta queda inflado tras un reverso. F19 y F20 son trabajo de coordinación y registro documental, como dijo el lector. No pude reabrir los planes de Órdenes y Planeación por el presupuesto, así que sus citas no se re-verificaron.

### F16 — parcial (corregido) · esfuerzo S

**Estado actual:** Cuentas, saldo inicial, movimientos y conciliación existen, y los cobros y pagos con cuenta afectan el saldo (obtener-tesoreria.ts 38-62, 98-182). Defecto real que el lector marcó como 'no verificado' y que yo confirmé: reversar_pago_ar (migración 20261007230005, líneas 60-67 y 143) deja la fila en pagos_ar e inserta en reversos_pago_ar. La consulta de pagos_ar de Tesorería (45-48) solo filtra cuenta_bancaria_id no nulo. Un cobro reversado sigue sumando al saldo de la cuenta, y 'cobros reales afectan saldos' queda violado tras un reverso. Además, no hay fecha de corte y los movimientos en moneda distinta a la cuenta se omiten en silencio (filas 109 y 142-147).

**Cambio mínimo:** En obtener-tesoreria.ts, leer pago_id de reversos_pago_ar en el mismo Promise.all y omitir esos cobros al acumular. Sin migración, sin RPC nueva. Aplicar el mismo filtro en flujo-cuentas-servicio.ts para que ambas pantallas coincidan. Si el PO lo prefiere, mostrar el reverso como movimiento negativo para dejar trazabilidad.

**Enfoque descartado:** Mover el saldo a una RPC o vista SQL con fecha de corte: reescribe algo que ya funciona y la nota no lo pide.

**Archivos a tocar:**
- src/modulos/tesoreria/servicios/obtener-tesoreria.ts
- src/modulos/cobranza/servicios/flujo-cuentas-servicio.ts

**Impacto en otros módulos:**
- [bajo] Cobranza (flujo por cuenta) (src/modulos/cobranza/servicios/flujo-cuentas-servicio.ts): Tiene el mismo problema con pagos reversados; arreglarlo junto.

**Pruebas afectadas:**
- supabase/tests/sii_b8_tesoreria.test.sql
- tests/e2e/tesoreria-flujo.spec.ts
- tests/unitarias/tesoreria-esquemas.test.ts

**Pruebas nuevas (RED):**
- Unitaria con cliente simulado: un cobro con fila en reversos_pago_ar no suma al saldo.
- Unitaria: saldo = inicial + cobro - pago_compra - gasto pagado; gasto USD en cuenta MXN con TC; gasto sin cuenta no suma.

**Riesgos:**
- Si RLS impide a quien ve Tesorería leer reversos_pago_ar, el filtro no funcionaría; verificar la política de la tabla antes de implementar.
- Moneda distinta a la cuenta omitida en silencio.
- Sin prueba unitaria del cálculo de saldo.

**Preguntas al PO:**
- Al reversar un cobro, ¿Tesorería debe ocultarlo o mostrarlo como contramovimiento?

**Evidencia:**
- src/modulos/tesoreria/servicios/obtener-tesoreria.ts:45-48 — pagos_ar solo se filtra por cuenta no nula; no excluye pagos presentes en reversos_pago_ar.
- src/modulos/tesoreria/servicios/obtener-tesoreria.ts:125-129 — Cada cobro se registra con signo +1 sin consultar reversos.
- supabase/migrations/20261007230005_sii_b8_reverso_promesa.sql:60-67, 143 — El reverso lee el pago, lo marca insertando en reversos_pago_ar y no lo elimina de pagos_ar.
- src/modulos/cobranza/servicios/historial-cobranza-servicio.ts — Único consumidor de reversos_pago_ar en src; ni Tesorería ni el flujo por cuenta lo usan.
- supabase/tests/sii_b8_tesoreria.test.sql — pgTAP de saldo inicial, transferencias y conciliación; no cubre reversos.

**Notas de verificación:** El lector dijo 'cumple' y dejó el reverso de cobros como duda no verificada. Lo verifiqué: reversar_pago_ar inserta en reversos_pago_ar sin eliminar el pago, y obtenerTesoreria no excluye reversados, por lo que bajé el estado a parcial. Las líneas 38-62, 98-151 y 169-182 coinciden con lo citado.

**Omisiones halladas por el verificador:**
- src/modulos/cobranza/servicios/flujo-cuentas-servicio.ts: Tampoco excluye pagos reversados (líneas 99-101).

### F17 — cumple (confirmado) · esfuerzo XS

**Estado actual:** Confirmado. Las transferencias entran a obtener-tesoreria.ts (153-167) solo como signo +1 o -1 por cuenta, y el neto entre cuentas es 0. flujo-cuentas-servicio.ts (94-106) lee solo pagos_ar y gastos, nunca movimientos_tesoreria. La RPC registrar_transferencia exige misma moneda y crea el par enlazado. No existe un total de ingresos o egresos en Tesorería.

**Cambio mínimo:** ninguno

**Pruebas afectadas:**
- supabase/tests/sii_b8_tesoreria.test.sql
- tests/e2e/tesoreria-flujo.spec.ts

**Pruebas nuevas (RED):**
- Opcional: un par SALIDA/ENTRADA no cambia la suma de saldos de las dos cuentas.

**Riesgos:**
- Si se añade un total de ingresos o egresos, hay que filtrar la entidad 'transferencia'.

**Evidencia:**
- src/modulos/tesoreria/servicios/obtener-tesoreria.ts:153-167 — Transferencia con signo según ENTRADA o SALIDA, solo contra el saldo de la cuenta.
- src/modulos/cobranza/servicios/flujo-cuentas-servicio.ts:94-134 — El flujo por cuenta no lee movimientos_tesoreria.
- supabase/migrations/20261007200003_sii_b8_tesoreria_conflicto.sql:60-76 — Par SALIDA/ENTRADA enlazado, según el lector; no lo reabrí.
- supabase/tests/sii_b8_tesoreria.test.sql:184-188 — Prueba de transferencias fuera de ingresos y gastos, según el lector.

### F18 — cumple (confirmado) · esfuerzo XS

**Estado actual:** Confirmado. El grep de movimientos_tesoreria y cuentas_bancarias en src da 8 archivos: tipos, tesoreria, cobranza (flujo, historial, realtime), configuración (servicio y sincronizador) y gastos/acciones/obtener-cuentas-gasto.ts. Este último es un catálogo de cuentas para el formulario de gasto, no rentabilidad. Ninguno calcula margen con datos de Tesorería. La conciliación es manual.

**Cambio mínimo:** ninguno

**Impacto en otros módulos:**
- [bajo] Gastos (src/modulos/gastos/acciones/obtener-cuentas-gasto.ts): Solo lee el catálogo de cuentas; el lector omitió este consumidor.

**Pruebas afectadas:**
- tests/e2e/tesoreria-flujo.spec.ts
- supabase/tests/sii_b8_tesoreria.test.sql

**Riesgos:**
- Evitar que el costo real use pagos_compra con IVA como fuente; debe usar el subtotal de la Compra.

**Evidencia:**
- src/modulos/tesoreria/servicios/obtener-tesoreria.ts:24-33 — Documenta el alcance sin cálculo de margen.
- src/modulos/cobranza/servicios/flujo-cuentas-servicio.ts:86-106 — Flujo informativo, no rentabilidad.

**Notas de verificación:** Agregué a obtener-cuentas-gasto.ts a la lista de consumidores externos. Retiré la prueba guardarraíl por grep propuesta por el lector, que es frágil y de poco valor.

**Omisiones halladas por el verificador:**
- src/modulos/gastos/acciones/obtener-cuentas-gasto.ts: Consumidor del catálogo de cuentas no mencionado por el lector.

### F19 — parcial (confirmado) · esfuerzo S

**Estado actual:** Los planes C8 y C9 no tocan Finanzas. El contrato compartido es implícito: lista blanca del snapshot y gate ver_finanzas, horas reales de C9.3, eventos en etiquetas-evento.ts, DC-13 y DC-14, y marcas de migración. Según el lector, la marca 20261014120000 está reservada. No pude reabrir los RESUMEN de los planes por el presupuesto, así que estas citas siguen sin re-verificar.

**Cambio mínimo:** Sin código. Registrar en el plan de C10 que arranca tras C8.3 y C9.3. La vista de costos reutiliza la proyección por lista blanca y el gate ver_finanzas. Fabricación real consume la misma fuente de horas que C9.3. Los eventos nuevos van a etiquetas-evento.ts. La migración toma timestamp libre con Glob.

**Enfoque descartado:** Un módulo Costos nuevo con ruta y permiso propios: la nota pide vivir en la Orden o en Gastos con filtro por Orden.

**Archivos a tocar:**
- docs/observaciones-cliente-2026-10-07/COLA-DE-TRABAJO.md
- docs/observaciones-cliente-2026-10-07/finanzas-revision-funcional/CONTINUIDAD.md

**Impacto en otros módulos:**
- [alto] Órdenes (ficha) (src/modulos/ordenes/servicios/ficha-orden-servicio.ts): C10 añade el bloque de costos sobre la misma proyección.
- [medio] Planeación (src/modulos/planeacion): Evitar una segunda fórmula de horas reales.

**Pruebas afectadas:**
- tests/unitarias/ficha-orden-c4-2.test.ts
- tests/unitarias/ordenes-confidencialidad-c4-3.test.ts

**Pruebas nuevas (RED):**
- La ficha sin ver_finanzas no contiene costos estimados ni reales.

**Riesgos:**
- Dos tandas editan ficha-orden.tsx y ficha-orden-servicio.ts; sin secuencia habrá conflictos.
- Colisión de timestamp de migración.

**Evidencia:**
- docs/observaciones-cliente-2026-10-07/ordenes-revision-funcional/PLAN-ORDENES-RESUMEN.md:30-41 — Según el lector, T3 define la lista blanca del snapshot y exige ver_finanzas.
- docs/observaciones-cliente-2026-10-07/planeacion-revision-funcional/PLAN-PLANEACION-RESUMEN.md:36-37 — Según el lector, las horas reales (P13/P14) son la suma de horas_netas por programacion_id.
- docs/observaciones-cliente-2026-10-07/DECISIONES-ACEPTADAS.md:21-22 — Según el lector, DC-13 y DC-14.

**Notas de verificación:** Sin cambios; no pude reverificar los planes.

### F20 — ausente (confirmado) · esfuerzo S

**Estado actual:** Sin registro documental de la nota en Refinamientos ni en tasks/plan.md. Los criterios de aceptación dependen de los requisitos F01-F15. Hoy se cumplen solo IVA fuera del margen, indirectos fuera de la Orden, transferencias sin duplicar y CxC/Facturación independientes del costo real.

**Cambio mínimo:** Registro mínimo en el PR de cierre de C10: cuatro filas de Refinamientos con fecha 2026-10-14, sin DC nueva. Agregar CLI-17 y las casillas del Corte 10. Tabla criterio -> prueba, sin marcar casillas sin prueba.

**Enfoque descartado:** DC-16..22 y CLI-17..25 detalladas.

**Archivos a tocar:**
- docs/observaciones-cliente-2026-10-07/DECISIONES-ACEPTADAS.md
- tasks/plan.md
- tasks/todo.md

**Pruebas nuevas (RED):**
- E2E de aceptación tests/e2e/finanzas-conciliacion-orden.spec.ts con la respuesta 'pensábamos X, comprometimos Y, gastamos Z, margen A/B'.

**Riesgos:**
- Marcar criterios sin prueba.
- Registrar como DC en vez de Refinamiento.

**Evidencia:**
- docs/observaciones-cliente-2026-10-07/DECISIONES-ACEPTADAS.md:25 — Según el lector, es la sección Refinamientos posteriores.
- tasks/plan.md:62 — Según el lector, la última entrada es CLI-14.

**Notas de verificación:** Sin cambios.

### Hallazgos extra (fuera del alcance; solo para decisión del PO)
- [media] Tesorería y flujo de Cobranza cuentan cobros reversados (src/modulos/tesoreria/servicios/obtener-tesoreria.ts): reversar_pago_ar inserta en reversos_pago_ar y deja el pago en pagos_ar. Ni obtener-tesoreria.ts (45-48) ni flujo-cuentas-servicio.ts (99-101) excluyen esos pagos. Un cobro reversado infla el saldo de la cuenta y el flujo.
- [media] Egreso distinto entre Cobranza y Tesorería (src/modulos/cobranza/servicios/flujo-cuentas-servicio.ts): El flujo cuenta todo gasto no cancelado (102-105) y no incluye pagos_compra. Tesorería cuenta solo gastos pagados (53-57) y sí incluye pagos_compra.
- [media] Doble salida posible entre pagos_compra y gastos pagados (src/modulos/tesoreria/servicios/obtener-tesoreria.ts): Tesorería resta pagos_compra (131-136) y gastos pagados (138-151). No hay vínculo compra->gasto que impida que la misma compra reste dos veces. Es la doble captura que la nota quiere evitar.
- [baja] Omisión silenciosa por moneda distinta a la cuenta (src/modulos/tesoreria/servicios/obtener-tesoreria.ts): Las líneas 109 y 142-147 descartan sin aviso los movimientos de moneda distinta a la cuenta, salvo gasto USD en cuenta MXN.

### Limitaciones
- No existe la carpeta pistas/; el análisis sale de lectura directa del código.
- No reabrí los RESUMEN de Órdenes y Planeación ni DECISIONES-ACEPTADAS.md ni tasks/plan.md por el presupuesto; sus citas son las del lector y no están re-verificadas.
- No reabrí registrar_transferencia ni el pgTAP de Tesorería; esas citas son del lector.
- No verifiqué la política RLS de reversos_pago_ar para saber si el rol de Tesorería puede leerla.
- No ejecuté pruebas ni consulté el remoto.
