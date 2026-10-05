# B3 — Módulo RFQ

Referencias del documento: §9 completo (estados, campos, ítems y archivos), §6.1 (folio `RFQ-MMYY_XX`, ítems `ITxx`), §7 (relación 1:N RFQ→Propuestas), §17 (UX).
Depende de: B1 (catálogos, archivos, permisos, auditoría) y B2 (clientes/contactos). Es prerrequisito de B4.

**Resultado del bloque:** `pipeline` operando como cabecera RFQ con estados y acciones propias; ítems `ITxx` estables por RFQ (nunca reutilizados); captura completa (cliente, contacto, canal, fechas, responsable, descripción, próxima acción); material/espesor/operaciones desde catálogos; archivos generales y por ítem con tipos del documento; gate LISTO con validaciones estructuradas por sección; folio `RFQ-MMYY_XX`; cola de trabajo y ficha RFQ.

---

## 3.1 Modelo de datos (ADR-SII-01/09)

`pipeline` se conserva como cabecera RFQ. Columnas nuevas (migración `20261005300001_sii_b3_rfq_base.sql`):

```sql
alter table public.pipeline
  add column folio_rfq text,                                   -- RFQ-MMYY_XX (nuevos)
  add column estado_rfq text not null default 'NEW'
    check (estado_rfq in ('NEW','INCOMPLETE','WAITING_CUSTOMER','WAITING_TECHNICAL',
                          'READY_FOR_PROPOSAL','CONVERTED','CLOSED','CANCELLED')),
  add column canal text,                                       -- texto (doc no define catálogo)
  add column fecha_solicitud date,
  add column contacto_id uuid references public.contactos_cliente(id),
  add column descripcion_general text,
  add column responsable_id uuid references public.usuarios(id),  -- por defecto vendedor_id
  add column proxima_accion_codigo text references public.catalogo_proximas_acciones(codigo),
  add column proxima_accion_texto text,                        -- obligatorio si codigo=OTHER
  add column fecha_proxima_accion date,
  add column responsable_proxima_accion_id uuid references public.usuarios(id);
create unique index ux_pipeline_folio_rfq on public.pipeline (folio_rfq);
```

Nuevas tablas:

```sql
create table public.rfq_items (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references public.pipeline(id) on delete cascade,
  numero integer not null,                    -- 1 → IT01; nunca se reutiliza
  codigo text not null,                       -- IT01, IT02...
  descripcion text not null check (char_length(descripcion) between 1 and 300),
  cantidad numeric(12,2) not null check (cantidad > 0),
  material_id uuid references public.catalogo_materiales(id),
  espesor_id uuid references public.catalogo_espesores(id),
  acabado text,
  notas text,
  estado text not null default 'activo' check (estado in ('activo','cancelado')),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (rfq_id, numero), unique (rfq_id, codigo)
);

create table public.rfq_item_operaciones (
  id uuid primary key default gen_random_uuid(),
  rfq_item_id uuid not null references public.rfq_items(id) on delete cascade,
  proceso_id uuid not null references public.catalogo_procesos(id),
  orden integer not null default 0,
  unique (rfq_item_id, proceso_id)
);

create table public.rfq_eventos (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references public.pipeline(id) on delete cascade,
  estado_anterior text, estado_nuevo text,
  accion text not null, motivo text,
  actor_id uuid references public.usuarios(id),
  correlation_id uuid,
  creado_en timestamptz not null default now()
);
```

**Backfill (misma migración, idempotente):**
- `estado_rfq` desde `etapa`: `prospecto→NEW`; `contactado→INCOMPLETE`; `cotizado|negociacion|ganada→CONVERTED`; `perdida→CLOSED`; demás casos `INCOMPLETE`.
- `fecha_solicitud = creado_en::date`; `responsable_id = vendedor_id`; `descripcion_general = notas` si existe.
- Cada `cotizacion_linea` activa → `rfq_item` con `numero` = `orden` y `codigo = 'IT' || lpad(orden,2,'0')`; sus procesos (texto libre) se mapean por nombre/código al catálogo cuando coincidan; los no mapeados se conservan como texto en `notas` (`procesos_legacy: [...]`) y no bloquean.
- `etapa` queda **deprecada**: ningún código nuevo la lee; se conserva la columna (grandfathering ADR-09) y se sincroniza solo hacia atrás en el backfill.

**Reglas:** RLS de `rfq_items`/`rfq_item_operaciones`/`rfq_eventos` hereda del RFQ (mismo patrón que `cotizacion_lineas`); Realtime solo `pipeline` y `rfq_items`.

---

## 3.2 Estados y acciones de negocio (ADR-SII-07)

| Estado | Significado | Acciones que salen |
|---|---|---|
| NEW | recién capturado | `marcar_incompleto`, `poner_en_espera`, `marcar_listo`, `cerrar`, `cancelar` |
| INCOMPLETE | faltan datos técnicos/comerciales | `poner_en_espera`, `marcar_listo`, `cerrar`, `cancelar` |
| WAITING_CUSTOMER | espera información del cliente | `marcar_incompleto`, `marcar_listo`, `cerrar`, `cancelar` |
| WAITING_TECHNICAL | espera aclaración interna/técnica | `marcar_incompleto`, `marcar_listo`, `cerrar`, `cancelar` |
| READY_FOR_PROPOSAL | cumple requisitos | `crear_propuesta` (B4, → CONVERTED), `marcar_incompleto`, `cerrar`, `cancelar` |
| CONVERTED | ya generó propuesta | *(lo gobierna B4; el RFQ no vuelve atrás)* |
| CLOSED / CANCELLED | terminales con motivo | — |

Una sola RPC `cambiar_estado_rfq(p_rfq_id, p_accion, p_args jsonb, p_actor, p_correlation_id)`:
- valida estado de origen por acción, permisos (`RFQ_EDITAR`, `RFQ_MARCAR_LISTO`, `RFQ_CERRAR`), CAS con `actualizado_en`;
- `cerrar`/`cancelar` exigen motivo ≥ 3 caracteres; `marcar_listo` exige validación LISTO (3.6) y devuelve `requisitos_faltantes: [...]`;
- escribe `rfq_eventos` + `logs` con `correlationId`; sin dropdown de estado en UI.

**Reglas de captura obligatoria (§9.2):** al guardar un RFQ activo se exige cliente, contacto, canal, fecha de solicitud, responsable, descripción general, ≥1 ítem activo con descripción y cantidad > 0, y **próxima acción + fecha + responsable de próxima acción**. El responsable de la próxima acción puede diferir del vendedor.

**Tareas:** migración de RPC + triggers de validación; servicios/acciones TS; unitarias de transiciones; pgTAP de permisos/CAS/motivos; E2E.

---

## 3.3 Ítems `ITxx` (identidad estable, §6.1)

- `numero` se asigna con el lock del RFQ (`select ... for update` sobre `pipeline`) como `max(numero)+1 considerando cancelados`; `codigo = 'IT' || lpad(numero, 2, '0')`.
- Cancelar un ítem solo cambia `estado='cancelado'` (nunca se reutiliza su número; el siguiente continúa). Un ítem con propuesta u orden vinculada no se cancela (error `item_con_documentos`).
- `material_id`/`espesor_id` desde catálogos B1; regla: si el material tiene espesores definidos, el espesor es obligatorio; si no, opcional (no se inventan reglas: se documenta como pendiente si el PO quiere otra).
- `rfq_item_operaciones` reemplaza el `text[]` libre para registros nuevos; la UI multi-select usa `catalogo_procesos` activos; validación: ≥1 operación por ítem para LISTO.
- Los ítems se muestran ordenados por `numero`; el código ITxx viaja a propuesta (B4) y orden (B5) sin renumerar.

**Tareas:** RPC `guardar_item_rfq` (alta/edición/cancelación con CAS y permiso `RFQ_ITEM_EDITAR`), RPC `reemplazar_operaciones_item`, UI de ítems en ficha, pgTAP de no-reutilización y concurrencia (dos altas simultáneas → IT03 e IT04 sin duplicar).

---

## 3.4 Archivos generales y por ítem (§9.3)

- Se usa `archivos` (B1.9) con `entidad='rfq'` + `entidad_id=rfq.id` para generales, o `entidad='rfq_item'` + `entidad_id=item.id` para archivos por tema/ítem.
- `clase` para RFQ: `CAD`, `DIBUJO`, `IMAGEN`, `ESPECIFICACIONES`, `OTROS` (se suman a los valores de B1.9; se documenta en el catálogo de clases permitidas por entidad).
- Migración del bucket `adjuntos-cotizacion`: backfill de sus objetos a `archivos` conservando `pipelineId` como `rfq_id` y `clase='OTROS'` (los existentes no tienen tipo); límites de tamaño/MIME en bucket (B1.9-04).
- Regla LISTO (decisión del cliente 2026-10-05): el requisito de archivo técnico es configurable por proceso (`catalogo_procesos.requiere_archivo_tecnico`, default `true`). Si algún ítem activo usa un proceso que lo requiere, se exige al menos un archivo técnico (`CAD`, `DIBUJO` o `ESPECIFICACIONES`) vinculado al RFQ o a ese ítem; si ningún proceso lo requiere, el RFQ puede marcarse listo sin archivo.

**Tareas:** UI gestor de archivos por ítem y generales con tipo obligatorio y vínculo explícito; pgTAP de vínculo y versionado; E2E de subida/descarga tipo RFQ.

---

## 3.5 Folio `RFQ-MMYY_XX` y continuidad

- Usa `generar_folio_periodico('RFQ')` (ADR-SII-02, B0.6) al crear el RFQ; columna `folio_rfq` única; históricos conservan `folio_op` y la UI muestra `folio_rfq ?? folio_op`.
- Continuidad administrativa en Configuración → Folios (consultar/ajustar sin retroceder, auditado), extendiendo la pestaña actual (hoy solo CNC).
- Tope por periodo: error `folio_periodo_agotado` con instrucción de ajuste administrativo.

**Tareas:** migración del generador genérico + clave `RFQ`; generalizar pestaña Folios y RPCs `ajustar_continuidad_folio(tipo, periodo, ultimo, actor)` (superset compatible de las CNC existentes); pgTAP de no-reutilización y tope.

---

## 3.6 Validación estructurada para LISTO

`validar_rfq_listo(p_rfq_id)` devuelve `jsonb` con faltantes por sección:

| Sección | Requisito |
|---|---|
| Cliente | cliente ligado y activo, contacto vigente |
| General | descripción general, canal, fecha, responsable |
| Ítems | ≥1 ítem activo; cada ítem activo con material, espesor (si aplica), ≥1 operación solicitada |
| Archivos | ≥1 archivo técnico del RFQ o de un ítem **si algún ítem activo usa un proceso con `requiere_archivo_tecnico=true`** (configurable por proceso) |
| Seguimiento | próxima acción + fecha + responsable |

La UI muestra exactamente qué falta (por sección, con enlaces) y el botón "Marcar listo" se habilita solo si no hay faltantes. `cambiar_estado_rfq('marcar_listo')` revalida en servidor (la UI nunca es la única barrera).

---

## 3.7 Relación con Propuestas

- RFQ 1:N Propuestas (§7). `crear_propuesta` (B4) toma el RFQ en `READY_FOR_PROPOSAL`, crea la propuesta + revisión A DRAFT con copia de ítems/operaciones, y deja el RFQ en `CONVERTED` en la misma transacción (idempotente: si ya existe una propuesta DRAFT activa para el RFQ, la devuelve).
- El modelo permite **varias propuestas por RFQ** (el documento §7 lo define 1:N); si una propuesta se cierra sin venta, se puede crear otra desde el mismo RFQ sin reabrirlo (el RFQ permanece `CONVERTED`; el documento no define retorno: decisión pendiente PO registrada en §0.12-3).

---

## 3.8 UI: cola de trabajo y ficha RFQ (§17)

1. **Cola `/rfq`** (se conserva `/pipeline` como redirección): lista filtrable por estado (chips), cliente, responsable, próxima acción vencida; columnas folio, cliente, descripción, ítems, estado, próxima acción/fecha/responsable; vistas Lista y Tablero por estado (reemplaza el Kanban por `etapa`).
2. **Ficha `/rfq?rfq=<id>`**: encabezado folio + chip de estado; acciones de negocio arriba según estado (Marcar listo, Poner en espera, Cerrar, Cancelar, Crear propuesta); pestañas Resumen, Ítems, Archivos, Propuestas, Actividad.
3. **Formulario maestro**: alta/edición con validaciones por sección; el alta hereda cliente/contacto si viene de la ficha del cliente.
4. Se retiran de la UI los cambios de `etapa` y el botón "marcar ganada" (la aceptación de propuesta los sustituye en B4/B5).

**Ajustes obligatorios en consumidores existentes:** dashboard ejecutivo/vendedor/pipeline-equipo, alertas (`calcular-alertas`), resumen, filtros y `historial-cliente` deben leer `estado_rfq` (no `etapa`). Listarlos y actualizarlos en la misma rama para no dejar doble fuente de verdad.

---

## 3.9 Criterios de aceptación del bloque

1. No queda ningún código que lea `etapa` para lógica de negocio (solo columnas legacy y backfill).
2. Estados y transiciones solo por acciones; `rfq_eventos` + `logs` con `correlationId`.
3. `ITxx` nunca se reutiliza (prueba: cancelar IT02 y crear → IT03 o posterior; nunca IT02).
4. LISTO imposible sin validación completa (pgTAP + UI con faltantes por sección).
5. Folio `RFQ-MMYY_XX` atómico, único, no reutilizado, con continuidad administrativa auditada.
6. Archivos generales y por ítem con tipo, vínculo y versionado.
7. E2E: crear RFQ desde cero → completar → marcar listo → crear propuesta (DRAFT en B4) → RFQ CONVERTED.
8. Gates §0.9 + regresión de clientes.

**Exclusiones:** costos/márgenes (son de B4), aceptación (B4/B5), portal del cliente.
