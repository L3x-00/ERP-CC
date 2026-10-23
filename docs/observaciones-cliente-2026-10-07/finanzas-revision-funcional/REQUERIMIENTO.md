# Requerimiento — Revisión funcional de Módulos financieros (Cobranza, Facturación, Gastos, Compras, Tesorería) · nota del cliente, relevada por el PO el 2026-10-14

> Fase: **requerimiento normalizado** (sin investigar el código aún). Mismo método que Órdenes y Planeación: requerimiento → estado real verificado → cambio mínimo → impacto → plan en 4 tandas de 5 → el PO aprueba → ejecución. **Ajustar, no rehacer** («los módulos actuales pueden conservarse»).
> Escrito para: el PO. Corte propuesto: **Corte 10 (C10.1–C10.4)**; Órdenes = C8, Planeación = C9.

## 1. Principio del cliente

El ERP debe poder responder: *«Pensábamos gastar X; comprometimos Y; realmente gastamos Z; el margen esperado era A y el real fue B.»* El hueco crítico es la **conciliación de costos estimados vs reales por Orden**. Tres niveles de costo, sin sobrescribirse: **Estimado** (Propuesta, congelado al crear la Orden) · **Comprometido** (Compra/OC) · **Real** (imputado a la Orden). Rentabilidad **siempre sin IVA**.

## 2. Requisitos atómicos F01–F20 y agrupación hipotética

| Tanda | ID | Sec. | Requisito |
|---|---|---|---|
| **C10.1 Vista de costos por Orden** | F01 | 3, 15 | Vista de **Costos / Rentabilidad por Orden** (dentro de la Orden o en Gastos y rentabilidad con filtro por Orden; sin menú nuevo): venta sin IVA, costo estimado, costo real y variación |
| | F02 | 3 | Tabla por concepto — Material · Fabricación/operación · Subcontratación · Gastos directos · TOTAL — con Estimado / Real / Variación (absoluta y %) |
| | F03 | 2, 15 | **Tres niveles de costo** sin sobrescribirse: estimado (congelado desde Propuesta/Orden), comprometido (Compra/OC) y real (imputado); el sistema distingue comprometido de real |
| | F04 | 3, 16 | **Margen estimado vs margen real** con la misma base de venta sin IVA (ej. 61 % vs 58 %) |
| | F05 | 4, 15 | **Material como categoría independiente** (estimado desde Propuesta, comprometido desde Compra/OC, real imputado; variación absoluta y %), consultable por separado, sin inventario formal |
| **C10.2 Compras y Gastos → costo real** | F06 | 8 | **Compra vinculada a Orden = costo comprometido**; al recibir/confirmar alimenta el costo real de material o subcontratación (no es real solo por existir) |
| | F07 | 8, 16 | **Evitar doble captura**: una compra vinculada no obliga a recapturar el mismo costo como Gasto; trazabilidad de la fuente (compra, gasto manual, ajuste, otro) |
| | F08 | 9 | Datos mínimos de Compras de material: Proveedor, Orden vinculada (opcional), Material/concepto, Cantidad, Unidad, Costo unitario, Subtotal, IVA, Moneda, Tipo de cambio, Vencimiento → proponer el último costo conocido sin inventario |
| | F09 | 7, 8 | Gastos **directos** (con Orden: material, subcontratación, transporte dedicado, otros) vs **indirectos** (sin Orden: renta, internet, papelería…); corregir la regla «las compras no entran a la rentabilidad» |
| | F10 | 13 | Fuentes del costo real con trazabilidad: compra material, gasto directo, subcontratación, producción (horas reales / costo estándar cuando exista), ajuste manual autorizado |
| **C10.3 IVA, Facturación y Cobranza** | F11 | 10, 16 | **Rentabilidad siempre sin IVA** (compra $5,800 = $5,000 + IVA $800 → costo $5,000); el IVA se conserva para control administrativo/tesorería |
| | F12 | 6 | Facturación: **factura por entrega** en el MVP, sin asumir 1 entrega = 1 factura (permitir agrupar a futuro); borrador, entrega a facturar, montos, folio fiscal externo, vínculo con CxC |
| | F13 | 6 | **Cancelar factura** desvincula correctamente CxC y permite refacturar sin borrar historial |
| | F14 | 5, 16 | Cobranza/CxC se conserva: aging (al corriente, 1-30, 31-60, 61-90, +90), saldo, historial, promesa, acción de cobrar, relación con Orden/factura; sin mezclar flujo bancario; **opera sin depender del costo real** |
| | F15 | 7, 14 | Guardarraíl: **no implementar** contabilidad fiscal, inventario/kardex nuevo, overhead automático, costeo absorbente, MRP, conciliación bancaria automática, motor de costos por recurso sin tarifas calibradas; **gastos indirectos fuera de la rentabilidad individual** |
| **C10.4 Tesorería, coherencia y aceptación** | F16 | 11 | Tesorería: cuentas, saldo inicial, movimientos, conciliación; **cobros y pagos reales afectan saldos** |
| | F17 | 11, 16 | **Transferencias internas** no son ingreso ni gasto (solo mueven efectivo); sin duplicar ingresos/gastos |
| | F18 | 11, 12, 15 | Tesorería = movimiento de dinero, **no fuente primaria de rentabilidad**; conciliación bancaria separada de la rentabilidad de Orden |
| | F19 | (PO) | **Coherencia** con Órdenes y Planeación: contratos compartidos (costo estimado congelado, confidencialidad de costos, horas reales de Producción, tarifario único, materiales DC-13/14) sin choques con C8/C9 |
| | F20 | 15, 16, 17 | Aceptación: los 9 criterios del cliente evidenciados (incluida la frase X/Y/Z/A/B) |

Criterios de aceptación del cliente (16): una Orden muestra venta sin IVA, estimado, real y variación (F01, F02) · Material estimado vs real consultable aparte (F05) · compra vinculada sin recapturar como gasto (F07) · comprometido ≠ real (F03) · IVA fuera del margen (F11) · márgenes con la misma base (F04) · indirectos no se asignan a órdenes (F15) · Tesorería sin duplicar por transferencias (F17) · CxC y Facturación sin depender del costo real (F14).

## 3. Pistas de partida (a verificar, no son hallazgos)

- Rentabilidad ya vive en **gastos** (`rentabilidad-servicio.ts`, `tarjeta-rentabilidad-orden.tsx`, RPC `obtener_rentabilidad_orden` / `obtener_desglose_rentabilidad_orden`); migraciones previas: motor de rentabilidad (fase 9), desglose por estación/rubro y costo TI (obs. 29), **ingreso neto sin IVA (A03)**, **estimado distribuido por tarifa (A15)**. Parte de F01/F02/F04/F11 puede existir.
- Compras: `crear_compra`, `cambiar_estado_compra`, `pagar_compra`, `pagos_compra`; Tesorería lee pagos de AR, de compras y gastos; Facturación: `crear_factura_borrador`, `emitir_factura`, `cancelar_factura`.
- Decisiones previas que condicionan: **DC-13** (último costo manual o propuesto por Compra/Gasto; compra requiere confirmación; el maestro no cambia solo), **DC-14** (consumo congela costo/moneda/TC), C6.x «Materiales y costos» sin stock, tarifario único (DC-07), snapshot de costeo del ruteo (C3.3).

## 4. Puntos de coherencia con Órdenes (C8) y Planeación (C9) — una sola regla

| Superficie | Otro plan | Finanzas | Regla propuesta |
|---|---|---|---|
| Vista de costos por Orden | Órdenes T2/T3 reordenan pestañas y proyecciones de la ficha | F01 puede vivir como pestaña de la ficha | Si va en la ficha: gate `ver_finanzas`, nunca para operador; ubicarla **después** de C8.3 |
| Confidencialidad | Órdenes R17/R18 (sin precios para operador) | Costos estimados/reales y márgenes son economía | Mismas proyecciones por lista blanca; prueba de no-fuga |
| Costo estimado congelado | Snapshot de la Orden (C3.3/C4.2) | F03: estimado intocable | Una sola fuente (snapshot); Finanzas solo lee |
| Horas reales de Producción | Planeación P14 (capacidad real al cerrar) | F10: costo de producción real | Mismas horas netas (`sesiones_trabajo`); no duplicar cálculo |
| Eventos / Actividad | Órdenes R10 diccionario de eventos | F07 trazabilidad de fuente | Etiquetas de eventos financieros en el mismo diccionario |
| Materiales y costo | DC-13/14, C6 | F05, F08 | Compras proponen el último costo; confirma una persona autorizada |

## 5. Diseño de la investigación (barato y secuencial)

1. **Mapas estáticos sin modelo** por módulo (`mapas/MAPA-{gastos,compras,facturacion,cobranza,tesoreria,dashboard}.md`) generados por script.
2. **6 áreas en 2 oleadas de 3** (lector → escéptico, esfuerzo medio, ~40 herramientas): oleada 1 = `rentabilidad-orden` (F01, F02, F04, F11) · `material-tres-niveles` (F03, F05) · `compras` (F06, F07, F08); oleada 2 = `gastos-fuentes` (F09, F10, F15) · `facturacion-cobranza` (F12, F13, F14) · `tesoreria-coherencia` (F16–F20).
3. Fase final: impacto · BD/RLS · pre-mortem · **coherencia con Órdenes y Planeación** → plan en 4 tandas → crítico → plan final. La secuencia probable es C10.2 (fuentes del costo real) **antes** de C10.1 (vista): la vista depende de los datos.
4. Cola completa en `../COLA-DE-TRABAJO.md`. Nada de código hasta que apruebes cada plan.
