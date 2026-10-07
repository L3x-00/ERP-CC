# B5 — Orden de trabajo (Go Live 2)

Referencias del documento: §11 completo (contenido, estados, reglas), §6.1 (folio `O-MMYY_XX`, `OI-MMYY_XX`), §7 (Order nace de la revisión aceptada), §17.
Depende de: B4 (`accepted_revision_id`). Es prerrequisito de B6 y B7.

**Resultado del bloque:** la orden nace únicamente de una revisión aceptada (`accepted_revision_id`) con snapshot suficiente para fabricar; folio `O-MMYY_XX` (internas `OI-MMYY_XX`); ítems ITxx trazables desde RFQ/propuesta; estados `CONFIRMADA → PLANIFICADA → LISTA → EN_PRODUCCION → PRODUCCION_COMPLETADA → CERRADA` con **estado derivado del avance** (sin "Iniciar" manual); cierre de producción y cierre administrativo separados; cambios posteriores a aceptación con trazabilidad.

---

## 5.1 Origen y snapshot (§11, ADR-SII-03)

Migración `20261005500001_sii_b5_orden_desde_revision.sql`:

```sql
alter table public.ordenes_produccion
  add column propuesta_id uuid references public.propuestas(id),
  add column propuesta_revision_id uuid references public.propuesta_revisiones(id),
  add column rfq_id uuid references public.pipeline(id),
  add column folio_sii text,                          -- O-MMYY_XX u OI-MMYY_XX
  add column estado_sii text not null default 'CONFIRMADA'
    check (estado_sii in ('CONFIRMADA','PLANIFICADA','LISTA','EN_PRODUCCION',
                          'PRODUCCION_COMPLETADA','CERRADA','CANCELADA')),
  add column snapshot_json jsonb not null default '{}'::jsonb,
  add column cerrada_admin_en timestamptz,
  add column cerrada_admin_por uuid references public.usuarios(id);
create unique index ux_ordenes_folio_sii on public.ordenes_produccion (folio_sii);
create unique index ux_ordenes_revision_unica
  on public.ordenes_produccion (propuesta_revision_id)
  where propuesta_revision_id is not null;

alter table public.partidas_orden_produccion
  add column codigo_item text,                        -- ITxx
  add column propuesta_item_id uuid references public.propuesta_items(id);
```

**RPC `crear_orden_desde_revision(p_revision_id, p_actor, p_correlation_id)`** (`SECURITY DEFINER`, solo `service_role`):
1. Valida revisión `ACCEPTED` (y propuesta `SALE_CONFIRMED`/`ACCEPTED`), actor con `ORDEN_LIBERAR`, cliente activo y gate de crédito vigente (se conserva el comportamiento actual de A13/A14: sobregiro solo admin).
2. Lock `pipeline`/`propuestas`/`propuesta_revisiones` en orden determinista; idempotente: si ya existe orden para `propuesta_revision_id`, devuelve `ya_existia=true`.
3. Copia a `partidas_orden_produccion`: `codigo_item` (ITxx), cantidad, material, espesor, operaciones (desde `propuesta_item_operaciones`), ruteo (setup/run/grupos) y archivos vivos referenciados; excluye ítems `es_descuento` (comportamiento vigente).
4. Congela `snapshot_json`: cabecera de la revisión (`snapshot_cabecera`), ítems con precios/condiciones, ruteo, lista de `archivo_id` vivos y observaciones. La orden **no depende** de datos futuros del RFQ/propuesta.
5. Folio `O-MMYY_XX` (u `OI-MMYY_XX` si `pipeline.es_orden_interna`) con `generar_folio_periodico`; crea AR no cobrable como hoy (D-04) salvo TI; auditoría + `correlationId`.
6. Marca la revisión `SALE_CONFIRMED` si no lo estaba.

**Reglas:** la aprobación antigua (`aprobar_oportunidad_y_crear_orden` / `marcar-ganada`) queda deprecada y se retira de la UI; se conserva la función para histórico (no se borra en este plan).

---

## 5.2 Folio de orden (§6.1)

- Nuevas órdenes: `O-MMYY_XX`; internas `OI-MMYY_XX` (la bandera `es_interna` se mantiene y ahora determina prefijo).
- Históricas `OP-######` conservan su folio; la UI muestra `folio_sii ?? folio`.
- Continuidad administrativa en Configuración → Folios para `O` y `OI` (sin retroceder, auditada).
- La AR interna sigue siendo `INVCNC-#######` (no cambia).

**Tareas:** generalizar el generador (B3.5) para `O`, `OI`; backfill: órdenes nuevas post-migración; históricas sin `folio_sii`; pgTAP de unicidad/atomicidad; E2E de visualización.

---

## 5.3 Estados y derivación (§11.2, §11.3, ADR-SII-07)

**Máquina de estados MVP:** `CONFIRMADA → PLANIFICADA → LISTA → EN_PRODUCCION → PRODUCCION_COMPLETADA → CERRADA` (+ `CANCELADA` con motivo). "Estados de riesgo/bloqueo se agregan gradualmente": la pausa deja de ser estado manual de la orden y se muestra como sub-estado derivado de las sesiones (`EN_PRODUCCION · en pausa`).

**Derivación (nunca desde la UI):**
| Transición | Disparador automático |
|---|---|
| CONFIRMADA → PLANIFICADA | todas las partidas tienen al menos una `programacion_areas` vigente (o la orden se marca solo cuando Planeación la programa; definición revisable por PO) |
| PLANIFICADA → LISTA | acción de negocio `liberar_orden` (`ORDEN_LIBERAR`) que valida material/archivos vivos/ruteo listos; se ejecuta una sola vez y deja traza |
| LISTA → EN_PRODUCCION | primera sesión de trabajo iniciada (trigger en `iniciar_sesion_trabajo_operador`) |
| EN_PRODUCCION → PRODUCCION_COMPLETADA | todas las metas/partidas completadas (`privado.orden_produccion_completa`) |
| PRODUCCION_COMPLETADA → CERRADA | acción `cerrar_orden_administrativa` (`ORDEN_CERRAR_ADMIN`) con validación de entregas registradas y cierre separado del de producción |
| cualquiera no terminal → CANCELADA | acción con motivo (se conserva la regla actual de AR/pagos: no cancelar con cobranza) |

**Cambios obligatorios en UI/servicios actuales:** quitar "Iniciar/Pausar/Completar" manual de `tabla-ordenes.tsx`; las acciones disponibles se calculan por estado (Liberar, Cancelar, Cerrar administrativa); Kanban de Producción sigue siendo derivado (ya lo es).

**Backfill:** `borrador→CONFIRMADA`, `programada→PLANIFICADA`, `en_proceso→EN_PRODUCCION`, `completada→PRODUCCION_COMPLETADA`, `cancelada→CANCELADA`, `pausada→EN_PRODUCCION` (el sub-estado de pausa se reconstruye desde sesiones). `estado` legacy se conserva en paralelo durante el bloque y se sincroniza por trigger para no romper consumidores; el retiro de la columna se planifica aparte (ADR-09).

---

## 5.4 Snapshot y cambios posteriores a la aceptación (§11.3)

1. La orden muestra ítems `ITxx` con cantidad, material, espesor, operaciones, archivos vivos y observaciones **desde su snapshot** (no releyendo propuesta viva).
2. Cambios posteriores a la aceptación (cantidad, alcance, archivos) se registran como **eventos de cambio de orden** (`orden_eventos_cambio`: orden_id, tipo, detalle jsonb, motivo, actor, `correlation_id`, creado_en) y ajustan la partida con CAS y permiso `ORDEN_EDITAR` solo cuando la orden no ha entrado a producción; nunca sobrescriben archivos/revisiones vigentes (si se reemplaza un archivo vivo, el anterior queda `vigente=false` con `reemplaza_a`, ADR-SII-06).
3. El documento imprimible de orden/orden de servicio lee el snapshot (no la cotización viva), corrigiendo el comportamiento actual. **Implementado 2026-10-07 (auditoría):** `documento-orden-servicio.ts` lee líneas, precios, descuentos, IVA/moneda, folio, contacto y observaciones del `snapshot_json`, con grandfathering para órdenes históricas sin snapshot.

**Tareas:** migración `orden_eventos_cambio` + RPC `ajustar_orden_post_aceptacion` (CAS, solo pre-producción, motivo obligatorio) + actualización de `documento-orden-servicio.ts` al snapshot; pgTAP de inmutabilidad post-producción.

---

## 5.5 Órdenes internas (TI)

**Decisión del cliente (2026-10-05): alta directa sin propuesta comercial, con autorización.** Son trabajos internos sin cobro que deben registrarse, agendarse y conservar horas/costos.

- RPC `crear_orden_interna(p_datos, p_actor, p_autorizacion)` con permiso `ORDEN_CREAR_INTERNA` (Management/Admin) y registro de la autorización (actor autorizante + motivo + `correlation_id`).
- La orden interna lleva `OI-MMYY_XX`, bandera `es_interna`, `snapshot_json` propio (ítems/cantidades/materiales/operaciones/ruteo capturados en la orden), sin AR y sin venta; el costo se mide por rentabilidad (DAS-01 vigente).
- Se agenda y ejecuta por el flujo normal de B5/B6 (programación, corridas, horas reales, costos) y se reporta aparte en ventas (KPI = 0).
- El alta directa **no** requiere revisión aceptada; el constraint de §5.1 (orden desde revisión) aplica solo a órdenes comerciales. Ambos caminos comparten folios, planeación y producción.
- El permiso `ORDEN_CREAR_INTERNA` se agrega a la matriz de B1.2 (gerente/admin) en la implementación de B5.

---

## 5.6 Criterios de aceptación del bloque

1. Ninguna orden nueva sin `propuesta_revision_id` aceptada (constraint + pgTAP).
2. Doble confirmación de venta no duplica orden (idempotencia + concurrencia).
3. `snapshot_json` permite renderizar la orden completa aunque cambie el RFQ/propuesta (prueba: mutar origen y releer orden).
4. Estados correctos y derivados; no existen botones de cambio manual de estado; pausa solo como sub-estado de sesiones.
5. Cierre administrativo separado y auditado; `CERRADA` no se mezcla con `PRODUCCION_COMPLETADA`.
6. Folios `O-`/`OI-` únicos, atómicos y con continuidad; históricos `OP-` intactos.
7. Planificación existente (B6 usa programación actual) sigue funcionando: al programar partidas de una orden CONFIRMADA, la orden pasa a PLANIFICADA.
8. E2E: propuesta aceptada → confirmar venta → crear orden → programar → liberar → iniciar producción (B6) → completar → cerrar administrativa. Gates §0.9 + regresión de planeación/producción actual.

**Exclusiones:** rediseño de partidas/procesos (los maneja B6), facturación (B8), reactivación de órdenes (se conserva el comportamiento actual con `reactivar_orden_op`, adaptado a los nuevos estados).
