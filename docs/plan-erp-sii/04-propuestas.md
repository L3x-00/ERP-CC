# B4 — Módulo Propuestas y revisiones

Referencias del documento: §10 completo (estados, revisiones, ítems/ruteo/costeo, próxima acción, PDF, archivos, "Requiere revisión"), §7 (PDF pertenece a la revisión), §6.1 (folio `CNC-MMYY_XX-A/B/C`), §17 (UX).
Depende de: B1, B3. Es prerrequisito de B5.

**Resultado del bloque:** propuesta con revisiones A/B/C… inmutables al enviarse; snapshot por revisión; ítems con ITxx estable y precios; ruteo estimado por ítem (setup/run/total automático); costo estimado interno por categorías y margen; catálogo de próxima acción; PDF por revisión con exclusión de datos internos; envío atómico que congela; aceptación de la revisión exacta (`acceptedRevisionId`) con `SALE_CONFIRMED` para habilitar la orden.

---

## 4.1 Modelo de datos (migración `20261005400001_sii_b4_propuestas_base.sql`)

```sql
create table public.propuestas (
  id uuid primary key default gen_random_uuid(),
  rfq_id uuid not null references public.pipeline(id),
  cliente_id uuid not null references public.clientes(id),
  folio_cnc text not null unique,                 -- CNC-MMYY_XX (contador CNC del doc)
  estado text not null default 'DRAFT',           -- espejo del estado de la revisión vigente
  revision_vigente_id uuid,
  accepted_revision_id uuid,                      -- revisión exacta aceptada
  responsable_id uuid not null references public.usuarios(id),
  creado_por uuid not null references public.usuarios(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
-- RFQ 1:N Propuestas (§7): no hay índice único por rfq_id.
-- Regla de UI (no de BD): se muestra como "activa" la propuesta no terminal más reciente.
create index ix_propuestas_rfq on public.propuestas (rfq_id, estado);

create table public.propuesta_revisiones (
  id uuid primary key default gen_random_uuid(),
  propuesta_id uuid not null references public.propuestas(id) on delete cascade,
  letra text not null check (letra ~ '^[A-Z]$'),  -- A..Z
  folio_revision text not null unique,            -- CNC-MMYY_XX-A
  estado text not null default 'DRAFT'
    check (estado in ('DRAFT','PENDING_APPROVAL','READY_TO_SEND','SENT','FOLLOW_UP',
                      'ACCEPTED','PENDING_FINANCIAL','SALE_CONFIRMED','REJECTED','CLOSED')),
  motivo_creacion text,                           -- obligatorio desde B
  snapshot_cabecera jsonb not null,               -- cliente, contacto, moneda, condiciones, validez
  requiere_revision_ruteo boolean not null default false,
  requiere_revision_costeo boolean not null default false,
  canal_envio text, destino_envio text, enviado_en timestamptz, enviado_por uuid,
  validada_en timestamptz, validada_por uuid,
  creado_por uuid not null references public.usuarios(id),
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (propuesta_id, letra)
);

create table public.propuesta_items (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.propuesta_revisiones(id) on delete cascade,
  rfq_item_id uuid references public.rfq_items(id),
  codigo text not null,                           -- ITxx copiado
  descripcion text not null,
  cantidad numeric(12,2) not null check (cantidad > 0),
  material_id uuid references public.catalogo_materiales(id),
  espesor_id uuid references public.catalogo_espesores(id),
  acabado text, notas text,
  precio_unitario numeric(14,4) not null default 0 check (precio_unitario >= 0),
  es_descuento boolean not null default false,     -- comportamiento heredado (doc silente)
  activo boolean not null default true,
  unique (revision_id, codigo)
);

create table public.propuesta_item_operaciones (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.propuesta_items(id) on delete cascade,
  proceso_id uuid not null references public.catalogo_procesos(id),
  orden integer not null default 0,
  unique (item_id, proceso_id)
);

create table public.propuesta_item_ruteo (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.propuesta_items(id) on delete cascade,
  secuencia integer not null,
  proceso_id uuid not null references public.catalogo_procesos(id),
  grupo_equipo_id uuid references public.grupos_equipo(id),
  grupo_planeado_id uuid references public.grupos_planeados(id),
  setup_horas numeric(8,2) not null default 0 check (setup_horas >= 0),
  run_horas numeric(8,2) not null default 0 check (run_horas >= 0),
  total_horas numeric(8,2) generated always as (setup_horas + run_horas) stored,
  requiere_revision boolean not null default false,
  unique (item_id, secuencia)
);

create table public.propuesta_revision_costos (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.propuesta_revisiones(id) on delete cascade,
  categoria text not null check (categoria in
    ('material','maquina','mano_obra','gastos_directos','subcontratacion')),
  monto numeric(14,4) not null check (monto >= 0),
  nota text,
  unique (revision_id, categoria)
);

create table public.propuesta_pdfs (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.propuesta_revisiones(id) on delete cascade,
  archivo_id uuid not null references public.archivos(id),
  contenido_hash text not null,
  generado_por uuid not null references public.usuarios(id),
  creado_en timestamptz not null default now()
);
create unique index ux_pdf_vigente_revision
  on public.propuesta_pdfs (revision_id) where archivo_id in
  (select id from public.archivos where vigente);   -- simplificar con columna vigente
```

> Nota de implementación: el índice parcial con subconsulta no es válido en Postgres; se usará columna `vigente boolean` en `propuesta_pdfs` + `unique (revision_id) where vigente`.

`propuesta_revision_acciones` replica el patrón de RFQ: `codigo` (catálogo B1.7), `texto_otro`, `fecha`, `responsable_id`; se usa al crear propuesta, actualizar, registrar seguimiento, enviar y crear nueva revisión (histórico conservado por revisión).

**Backfill (idempotente):**
- RFQ con `folio_cnc` no nulo → propuesta `DRAFT/SENT/ACCEPTED` según etapa (`ganada` con orden → `SALE_CONFIRMED` y `accepted_revision_id`), revisión A con folio `CNC-MMYY_XX-A` (si colisiona con el formato viejo `CNC-MMYY_XXXX`, la letra lo desambigua y el folio viejo se conserva en `snapshot_cabecera.folio_legacy`).
- `cotizacion_lineas` → `propuesta_items` de la revisión A con `codigo ITxx` del ítem equivalente creado en B3; operaciones mapeadas; `calculo_tecnico.tiempoEstimadoMinutos` → una fila de ruteo estimada (secuencia 1, proceso principal, `run_horas`).
- `cotizacion_lineas.es_descuento` → `es_descuento` (comportamiento existente).
- `cotizacion_lineas` queda de solo lectura para consumidores nuevos.

---

## 4.2 Estados y acciones de negocio (ADR-SII-07)

El estado de la propuesta es espejo de su revisión vigente; **ambos se actualizan en la misma transacción** y ninguna UI escribe el campo.

| Estado revisión | Acciones (RPC) |
|---|---|
| DRAFT | `editar_item`, `editar_ruteo`, `editar_costos`, `validar` (→READY_TO_SEND), `registrar_seguimiento` (actualiza próxima acción), `cerrar` (→CLOSED), `rechazar` (→REJECTED) |
| PENDING_APPROVAL | reservado para aprobación interna futura; acciones administrativas |
| READY_TO_SEND | `generar_pdf`, `enviar` (exige PDF vigente + canal + destino + próxima acción) → SENT |
| SENT | `registrar_seguimiento` (→FOLLOW_UP o mantiene SENT), `crear_nueva_revision`, `marcar_rechazada`, `aceptar_revision` (→ACCEPTED) |
| FOLLOW_UP | igual que SENT + `aceptar_revision` |
| ACCEPTED | `confirmar_venta` (→SALE_CONFIRMED; habilita orden B5); `pasar_a_financiero` (→PENDING_FINANCIAL, fase posterior) |
| PENDING_FINANCIAL | `confirmar_venta` cuando se cumpla la condición financiera externa |
| SALE_CONFIRMED | terminal operativo (la orden se crea en B5 desde `accepted_revision_id`) |
| REJECTED / CLOSED | terminales con motivo |

Toda transición: valida estado de origen, permiso (`PROPUESTA_VALIDAR`, `PROPUESTA_ENVIAR`, `PROPUESTA_SEGUIMIENTO`, `PROPUESTA_ACEPTAR`, `PROPUESTA_CERRAR`, `PROPUESTA_CREAR_REVISION`), CAS, auditoría (`correlationId`) y evento en la revisión.

---

## 4.3 Revisiones A/B/C… (§10.2)

Reglas del documento, implementadas literalmente:

1. La revisión A se crea desde RFQ `READY_FOR_PROPOSAL` (acción `crear_propuesta`, B3.7).
2. Mientras está DRAFT se edita **la misma revisión**; nunca se crea B por correcciones internas.
3. Una revisión SENT/ACCEPTED es inmutable en contenido comercial/técnico sustantivo (4.4).
4. Cambios pedidos por el cliente → acción `crear_nueva_revision` con **motivo obligatorio** (≥3 caracteres); genera B, C… y deja la nueva en DRAFT.
5. Cada nueva revisión **copia el snapshot anterior** (cabecera + ítems + operaciones + ruteo + costos + próxima acción) manteniendo el mismo `codigo ITxx` y `rfq_item_id`.
6. Selección de revisión aceptada: `aceptar_revision` puede apuntar a una revisión anterior a la última; `propuestas.accepted_revision_id` es explícito y **solo esa** habilita la orden.
7. Letra máxima Z con error explícito `limite_revisiones_alcanzado` (decisión pendiente PO sobre doble letra; no se inventa).

**Tareas:** RPC `crear_nueva_revision(p_revision_origen, p_motivo, p_actor)` transaccional con locks (propuesta→revisiones), copia profunda, detección de cambios para "Requiere revisión" (4.9), auditoría; unitarias de copia; pgTAP de motivo obligatorio, ITxx preservado y aceptación de revisión anterior.

---

## 4.4 Congelamiento SENT (frozen)

- Trigger `proteger_revision_congelada` sobre `propuesta_revisiones`: prohíbe UPDATE de `estado`, `folio_revision`, `snapshot_cabecera` fuera de RPC autorizada; y sobre `propuesta_items`/`propuesta_item_operaciones`/`propuesta_item_ruteo`/`propuesta_revision_costos`: prohíbe INSERT/UPDATE/DELETE cuando la revisión padre no está en `DRAFT`.
- Las RPC de edición (`editar_item`, `editar_ruteo`, `editar_costos`) exigen DRAFT + CAS + permiso y son las únicas que escriben.
- Tras SENT solo se permiten: seguimiento/próxima acción, PDF ya generado (descarga), crear nueva revisión, aceptar/rechazar, cerrar. Cualquier cambio sustantivo devuelve `revision_congelada` con la acción sugerida "Crear nueva revisión".

**Pruebas pgTAP:** intento de update directo falla; seguimiento sí funciona; edición de precio tras SENT falla; nueva revisión sí copia.

---

## 4.5 Ítems, ruteo y costeo (§10.3)

**Ítems:** en DRAFT se editan descripción, cantidad, material, espesor, operaciones solicitadas, acabado, notas y precio unitario (`PROPUESTA_EDITAR_ARTICULO` / `PROPUESTA_EDITAR_PRECIO`). Cancelar un ítem lo marca `activo=false` (no se borra) y conserva su ITxx.

**Ruteo estimado (por ítem, `PROPUESTA_EDITAR_RUTEO`):** proceso, secuencia, grupo de equipo, grupo planeado, setup h, run h; `total_horas` automático (columna generada). Se puede autogenerar una propuesta inicial desde las operaciones solicitadas (una secuencia por operación) para reducir captura; el resultado es editable.

**Costeo interno (`PROPUESTA_EDITAR_COSTO`):** filas por categoría: material, máquina, mano de obra, gastos directos, subcontratación; `costo_total_estimado` = suma. Valor manual (el motor completo queda postergado, §16.5).

**Venta y márgenes (calculados en SQL y replicados en TS para UI):**
- `importe_línea = precio_unitario × cantidad`; `subtotal = Σ líneas activas no descuento − Σ descuentos`;
- `iva = subtotal × iva_porcentaje` (de la oportunidad/config); `total = subtotal + iva`;
- `margen = (subtotal − costo_total_estimado) / subtotal` (si subtotal = 0 → margen nulo, no `NaN`);
- el mínimo de margen queda sin definir (§10.3; decisión del cliente 2026-10-05: **sin mínimo bloqueante por ahora**): no se agrega regla de bloqueo.

**Funciones:** `calcular_totales_revision(revision_id)` `SECURITY DEFINER` de solo lectura (service_role) + espejo TS `calcularTotalesPropuesta()` con pruebas unitarias idénticas (tabla de casos compartida).

---

## 4.6 Próxima acción y seguimiento (§10.4)

- Toda revisión activa lleva `propuesta_revision_acciones` con `codigo` del catálogo B1.7, `texto_otro` obligatorio si `OTHER`, `fecha` y `responsable_id`.
- Se actualiza al crear propuesta, al registrar seguimiento, al enviar y al crear nueva revisión (histórico por revisión; nunca se sobrescribe el pasado).
- La cola `/propuestas` muestra próximas acciones vencidas y por vencer; el seguimiento registra evento con canal/nota y auditoría.

---

## 4.7 PDF por revisión (§10.5, ADR-SII-04)

1. **Generación:** solo para revisión `READY_TO_SEND` y con permiso `PROPUESTA_GENERAR_PDF`. Server Action → servicio de PDF → bucket privado `propuestas-pdf` → fila en `archivos` (`entidad='propuesta_revision'`, `clase='pdf'`) + `propuesta_pdfs` (`vigente=true`; la anterior pasa a `vigente=false`).
2. **Contenido:** datos comerciales de la revisión (cliente/contacto snapshot, ítems, cantidades, precios, subtotal, IVA, total, condiciones, validez, folio y letra). **Excluye**: costo interno, margen, horas, ruteo y notas internas. Prueba automatizada: el HTML/PDF no contiene los campos prohibidos (aserción sobre texto extraído).
3. **Privado y ligado a la revisión exacta:** nunca se infiere por nombre de archivo; lectura por URL firmada corta y permiso `PROPUESTA_VISTA`.
4. **Idempotencia:** `(revision_id, contenido_hash)`; si el contenido no cambió, devuelve el PDF vigente sin regenerar.
5. **Enviar** (`PROPUESTA_ENVIAR`) exige PDF vigente + canal + destino + próxima acción y pasa a SENT **congelando atómicamente** (transacción con locks; fallo = no cambia nada).
6. **Spike B4.6 (ADR-SII-04):** comparar `@react-pdf/renderer` vs Chromium headless; criterios: sin red en runtime, determinista, peso de build aceptable, plantilla reutilizable para B5/B7. Registrar decisión en el ADR antes de implementar.

> **DECISIÓN DEL SPIKE (2026-10-06, terminal C):** se implementó un **escritor PDF 1.4 interno sin dependencias** (`src/modulos/propuestas/servicios/pdf/escritor-pdf.ts`). Cumple los criterios: sin red en runtime, determinista (mismos datos ⇒ mismos bytes, hash estable para la idempotencia), peso de build nulo (no toca `package.json`) y contenido exclusivamente comercial (prueba unitaria de exclusión de costo/margen/horas/ruteo/notas internas). `@react-pdf/renderer` queda descartado por ahora (dependencia nueva + reconciliador React) y Chromium headless por peso/runtime/indeterminismo de fuentes; ambos podrían sustituir al renderer detrás de `generarPdfBorrador` sin cambiar datos ni flujo si el cliente exige maquetación rica.

---

## 4.8 Archivos de la propuesta (§10.6)

La pestaña Archivos muestra y separa:
1. **Heredados/referenciados del RFQ** (no se duplican): lectura desde `archivos` de `rfq`/`rfq_item`, con chip "Origen: RFQ" y sin copia de blob.
2. **Propios de la propuesta**: `archivos` con `entidad='propuesta_revision'`, clase general/tecnico.
3. **Por ítem de propuesta**: `entidad='propuesta_item'`.
4. **PDFs por revisión**: de `propuesta_pdfs`, con historial de versiones y descarga; los de revisiones anteriores quedan visibles en modo lectura.

Regla: prohibido duplicar archivos del RFQ (se referencia el mismo `archivo_id`); el vínculo guarda origen + revisión + tema/ítem.

---

## 4.9 "Requiere revisión" (§10.7)

1. Al crear una nueva revisión, el sistema compara cada ítem con su predecesor: si cambió **cantidad, material, espesor u operaciones solicitadas**, marca `propuesta_item_ruteo.requiere_revision=true` para las filas heredadas del ítem y `requiere_revision_ruteo` en la revisión.
2. Si hay costos y hubo cambios de alcance, `requiere_revision_costeo=true`. Los datos **se conservan** (no se borran): se marcan.
3. `validar` (→READY_TO_SEND) queda bloqueada mientras haya flags pendientes: la UI muestra "Requiere revisión" por ítem con acción "Confirmar ruteo/costeo" (revisar y guardar); al confirmar/editar el ruteo, `requiere_revision=false`.
4. No convertir la UI en un asistente rígido: el aviso es visible pero la edición sigue siendo directa.

---

## 4.10 Aceptación de la revisión exacta (§10.1, §10.2)

- `aceptar_revision(p_revision_id, p_actor, p_canal, p_destino)`: revisión en SENT/FOLLOW_UP; registra `ACCEPTED` y `propuestas.accepted_revision_id`; puede ser una revisión anterior a la última (queda `accepted` aunque exista una DRAFT posterior); evento + auditoría.
- `confirmar_venta`: `SALE_CONFIRMED` (habilita la creación de orden en B5).
- `PENDING_FINANCIAL`: reservado; no se implementan reglas de crédito nuevas (las de crédito del cliente siguen aplicando en B5 como hoy).
- `rechazar` exige motivo; `cerrar` exige motivo; ambos conservan toda la historia.

---

## 4.11 UI y criterios de aceptación

**UI:** `/propuestas` (cola con filtros estado/cliente/responsable/próxima acción), ficha `/propuestas?propuesta=<id>` con encabezado folio+chip y acciones de negocio arriba; pestañas Resumen, Ítems, Ruteo/Costeo, Archivos, PDFs, Seguimiento, Actividad; editor de revisión DRAFT con validaciones por sección; badge "Requiere revisión".

**Criterios del bloque:**
1. Ningún cambio sustantivo es posible en SENT/ACCEPTED (pgTAP).
2. Toda nueva revisión copia snapshot, conserva ITxx y exige motivo (pgTAP + E2E).
3. `accepted_revision_id` explícito y aceptable anterior a la última (pgTAP).
4. READY_TO_SEND bloqueado por "Requiere revisión" y por falta de validación; PDF solo en READY_TO_SEND; envío exige PDF+canal+destino+próxima acción y congela atómico (pgTAP + integración).
5. PDF sin datos internos (prueba de contenido) y ligado a la revisión.
6. Totales/margen correctos (unitarias + SQL espejo) y costo manual por categorías.
7. E2E: RFQ LISTO → propuesta A → PDF → enviar → seguimiento → crear B con motivo → aceptar A o B → confirmar venta.
8. Gates §0.9 completos.

**Exclusiones:** aprobación interna (`PENDING_APPROVAL` queda reservada), motor de costos por hora (§16.5), múltiples propuestas simultáneas por RFQ, portal del cliente.
