# Cierre administrativo y entregas — diseño funcional (2026-11-04)

> Estado: **definición**, sin código. Objetivo: cerrar cada orden terminada con una
> comparación estimado vs real, y dar seguimiento a entregas parciales.
> Fuente de datos: propuesta aceptada congelada en la orden + producción real.

## 1. Cierre administrativo

### 1.1 Qué órdenes entran

Órdenes **terminadas de producción**: `estado_sii` en `PRODUCCION_COMPLETADA` o `CERRADA`, o el legacy `completada`. Se excluyen canceladas. Una orden puede tener entregas parciales y aun así cerrarse comparativamente.

### 1.2 Qué se compara (por orden)

| Dimensión | Estimado (propuesta aceptada) | Real (producción) |
| --- | --- | --- |
| Horas de ruteo | `sum(propuesta_item_ruteo.total_horas)` de la revisión aceptada | `sum(sesiones_trabajo.horas_netas)` + `retrabajos_produccion.minutos / 60` |
| Costo de mano de obra | `sum(propuesta_item_ruteo.costo_total)` | horas reales por proceso × `tarifa_hora` congelada de la fila de ruteo del mismo proceso |
| Material | `propuesta_revision_costos` categoría `material` + costo de material del ruteo | `sum(registros_consumo_material.costo_unitario_momento × (usada + merma))` + material de retrabajos |
| Otros costos internos | `propuesta_revision_costos` categorías restantes | no hay real capturado; se muestra el estimado como referencia |
| Costo total | ruteo + material + otros | mano de obra real + material real |
| Venta | `sum(propuesta_items.cantidad × precio_unitario)` | — |
| Piezas | cantidad solicitada por ítem | producida (`partidas.cantidad_producida`) y entregada (`nota_entrega_partidas`) |
| Avance | — | producidas / solicitadas y entregadas / solicitadas |

El material puesto por el cliente no se costea ni entra al costo real.

### 1.3 Resultado por orden

- **Desviación de costo** = (real − estimado) / estimado × 100.
  - Positiva = gastaste más (rojo); negativa = ahorro (verde).
- **Desviación de tiempo** = (horas reales − horas estimadas) / estimadas × 100.
- **Margen real** = (venta − costo real) / venta × 100.
- **Cumplimiento de entrega** = entregado / solicitado × 100.
- Frase de negocio: «Cotizaste 8 h y usaste 5: estás cotizando 37 % de más en tiempo».

### 1.4 Pantallas

1. **Dashboard (arriba de la tabla)** con:
   - KPIs de las últimas 20 órdenes cerradas: desviación media de costo, de tiempo, margen medio, órdenes con sobrecosto.
   - Tendencia: línea de desviación por orden (últimas 20) con banda de ±10 %.
   - Dispersión estimado vs real (cada punto una orden; diagonal ideal).
   - Barras de las 5 órdenes con mayor desviación y composición del costo real (mano de obra / material).
   - Filtros: periodo, cliente, rango de desviación, tipo (comercial / TI).
2. **Tabla de órdenes terminadas** interactiva:
   - Columnas: folio, cliente, fecha de cierre, costo estimado, costo real, desviación, horas estimadas/reales, margen, entrega %, semáforo.
   - Orden por columna, búsqueda, paginación y fila cliqueable.
   - Semáforo: verde ≤ −10 %, ámbar entre −10 % y +10 %, rojo ≥ +10 % (costo y tiempo); el margen se colorea al revés.
3. **Detalle de cierre** (modal o panel lateral):
   - Cabecera: orden, cliente, fechas, resultado global.
   - Comparativo por ítem: cantidad, horas y costo estimado vs real, con barras y desviación.
   - Comparativo por proceso del ruteo: horas estimadas vs reales y costo.
   - Material: estimado vs consumido (cantidad y costo).
   - Puntos críticos: 3 mayores desviaciones con una frase accionable.
   - Entregas: historial y pendiente.
   - Acción: exportar el cierre (PDF/CSV) para administración.

### 1.5 Reglas de UX

- Sin jerga técnica ni IDs: folio, ítem, proceso y cifras.
- Números con moneda y porcentaje; los negativos/ahorros en verde, sobrecostos en rojo, zona neutra en ámbar.
- Animaciones suaves al entrar y al cambiar filtros; respetar `prefers-reduced-motion`.
- Tabla usable en 1280 px y en tableta; el detalle en modal con scroll interno.
- Estados vacíos claros («aún no hay órdenes cerradas en este periodo»).

## 2. Entregas parciales

- En la ficha de la orden y en Entregas: **historial de notas** (folio, fecha, ítems y cantidades, parcial/total, evidencia).
- **Pendiente por ítem en tiempo real**: producido − entregado; se actualiza al registrar una entrega (invalidación + realtime).
- Si no hay piezas producidas, el botón «Preparar entrega» se muestra **deshabilitado con el motivo**, sin abrir el modal vacío.
- Cada nota se puede **descargar** (PDF de la nota de entrega) desde la ficha y desde el historial.
- La orden terminada muestra el total entregado y el pendiente aunque ya no tenga trabajo de piso.

## 3. Datos y rendimiento

- Lectura con el cliente admin y permisos `gestionar_produccion` / `ver_finanzas` / `orden_vista`.
- Una sola consulta agregada por orden para el listado (evitar N+1): costos estimados de la revisión, horas y consumos reales, entregas.
- El dashboard usa las últimas 20 órdenes cerradas; los cálculos se hacen en servidor.
- Sin migraciones nuevas: se reutilizan propuestas, sesiones, consumos, retrabajos y notas de entrega. Si el volumen lo exige, se añadirá una vista materializada en una tanda posterior.

## 4. Tandas propuestas

| Tanda | Alcance |
| --- | --- |
| C14.1 | Servicio de cierre comparativo + listado de órdenes terminadas + detalle por ítem/proceso/material |
| C14.2 | Dashboard interactivo + tendencias de las últimas 20 + semáforos y filtros |
| C14.3 | Historial de entregas por orden, pendiente en tiempo real y descarga de notas; estado vacío sin modal |
| C14.4 | Exportación del cierre y ajustes finos de UX/rendimiento |

## 5. Decisiones aceptadas (PO, 2026-11-04)

| Pregunta | Decisión |
| --- | --- |
| Base del estimado | **Revisión aceptada** de la propuesta (`propuesta_revision_id`), con ruteo, horas, tarifas y costos congelados. |
| Costo real de mano de obra | Horas reales por proceso × **tarifa congelada** de la fila de ruteo del mismo proceso. |
| Retrabajo | **Incluido**: sus minutos suman al tiempo real y su material al costo real. |
| Indicador principal | **Desviación de costo** (real vs estimado); el margen real se muestra como KPI separado. |
| Semáforos | Verde ≤ −10 %, ámbar entre −10 % y +10 %, rojo ≥ +10 % (margen invertido). |
| Tendencia | **Últimas 20 órdenes** cerradas. |
| Entregas | **Historial + pendiente por ítem en tiempo real + descarga de la nota**; botón bloqueado con motivo si no hay piezas producidas. |

## 6. Preguntas abiertas

Resueltas en `PREGUNTAS.md` y en la sección 5.
