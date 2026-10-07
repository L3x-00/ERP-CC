# B6 — Producción básica (Go Live 3)

Referencias del documento: §12 completo (unidad de ejecución, reglas críticas, calidad básica), §6.1 (corridas `LAS01`, `DOB01`, `ROU01`), §18 (KPIs de producción/calidad), §17.
Depende de: B5. Es prerrequisito de B7 (entregas consumen producción) y alimenta B9 (KPIs).

**Resultado del bloque:** corridas como unidad de ejecución dentro de la orden; reglas críticas de piso (un operador por equipo, bloqueo por recurso, pausas con causa configurable, liberación de máquina >1 h, fin de jornada, horas extra autorizadas, checklist de eventos críticos); calidad básica (primera pieza, referencias de lote, cierre con tolerancias/cantidades/fotos/material); archivos vivos liberados al operador al iniciar.

---

## 6.1 Corridas: unidad de ejecución (§12.1)

**Documento:** "La unidad de ejecución son Operaciones/Corridas ligadas a la Orden. Una corrida puede agrupar ítems compatibles dentro de la misma Orden. Por ahora no agrupar órdenes distintas."

Migración `20261005600001_sii_b6_corridas.sql`:

```sql
create table public.corridas (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.ordenes_produccion(id),
  codigo text not null,                    -- <PREFIJO_PROCESO><NN>: LAS01, DOB01...
  proceso_id uuid not null references public.catalogo_procesos(id),
  estado text not null default 'PLANIFICADA'
    check (estado in ('PLANIFICADA','EN_PROCESO','PAUSADA','COMPLETADA','CANCELADA')),
  cantidad_planificada numeric(12,2) not null check (cantidad_planificada > 0),
  corrida_origen_id uuid references public.corridas(id),   -- repetir corrida sin copiar ejecución
  creado_por uuid not null, creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now(),
  unique (orden_id, codigo)
);
create table public.corrida_items (
  id uuid primary key default gen_random_uuid(),
  corrida_id uuid not null references public.corridas(id) on delete cascade,
  partida_id uuid not null references public.partidas_orden_produccion(id),
  codigo_item text not null,               -- ITxx del snapshot
  cantidad numeric(12,2) not null check (cantidad > 0),
  unique (corrida_id, partida_id)
);
alter table public.sesiones_trabajo
  add column corrida_id uuid references public.corridas(id);
create index ix_sesiones_corrida on public.sesiones_trabajo (corrida_id);
```

**Reglas:**
1. Ítems **compatibles** = misma orden + mismo proceso + mismo grupo de equipo; cantidades por ítem; nunca órdenes distintas (§12.1).
2. RPC `crear_corrida(orden_id, proceso_id, items[], actor)` valida compatibilidad, orden no terminada y cantidades ≤ pendiente; asigna `codigo` con lock de orden (`<prefijo><max+1>`).
3. Estados por acciones: `iniciar_corrida` (primera sesión), `pausar`, `completar` (todas las metas de los ítems cumplidas), `cancelar` (motivo; solo si no hay sesiones finalizadas con avance). Las RPC de sesión de piso existentes se adaptan para operar dentro de una corrida (`corrida_id` obligatorio en registros nuevos).
4. La UI de piso permite elegir corrida y muestra sus ítems; sin corrida no se inicia sesión nueva (las órdenes legacy sin corrida generan una corrida automática al primer inicio: compatibilidad).
5. Repetir trabajo desde una corrida/orden histórica crea corrida nueva sin copiar ejecución (se conserva `corrida_origen_id`).

**Tareas:** migración + RPCs + adaptación de `iniciar_sesion_trabajo_operador`/`cerrar_sesion_trabajo_operador`; UI de corridas en `/produccion` y `/ordenes`; pgTAP de compatibilidad/códigos; E2E de corrida completa.

---

## 6.2 Reglas críticas de piso (§12.2)

| Regla del documento | Implementación |
|---|---|
| Un operador por equipo; individuo creíble | sesión activa única por programación/recurso (índices existentes) + validación de operador activo y área; auditoría por operador |
| Bloqueo por máquina/equipo | índice parcial `programacion_areas` activo por recurso (existe); corridas no evitan el candado |
| Inicio registra hora y libera archivos vivos | `iniciar_sesion_trabajo_operador` registra hora; el piso recibe los `archivo_id` vivos del snapshot de la orden con URL firmada (B5) |
| Pausa requiere causa | nuevo `catalogo_motivos_pausa` con seeds `DUDA, MATERIAL, FALLA, COMIDA, FIN_JORNADA, OTRA` + `activo`, `requiere_nota`, `libera_maquina`; la sesión guarda `motivo_pausa_codigo` + nota |
| Material/aclaración > 1 h puede liberar máquina | los motivos `MATERIAL`/`DUDA` tienen `libera_maquina=true`; RPC `reclamar_recurso_liberado(recurso_id, actor)` libera el recurso si existe sesión pausada ≥ 60 min con motivo liberable (marca `recurso_liberado=true`); al reanudar se revalida capacidad/locks |
| Al terminar se registra cantidad producida | se conserva el cierre actual (metas por proceso + piezas) con `corrida_id` |
| Fin de jornada se cierra; no continúa al día siguiente | RPC `cerrar_jornada(fecha, actor)`: cierra sesiones activas con causa `FIN_JORNADA`; se invoca al primer ingreso del día en piso/planeación y por acción de supervisor; ninguna sesión cruza de fecha |
| Horas extra requiere autorización | tabla `autorizaciones_hora_extra` (orden_id, sesion_id?, horas_autorizadas, motivo, autorizado_por, estado, creado_en) y RPC `autorizar_horas_extra`; el cierre de sesión exige autorización vigente cuando se excede **la jornada configurada del turno** (autoriza Management/Admin). Jornada estándar: **8 h por turno, ajustable por recurso** (decisión final 2026-10-06) |
| Eventos críticos antes de iniciar | `verificaciones_inicio_sesion` (sesión, checklist jsonb con material, espesor, cantidad, revisión/archivo vigente, proceso/equipo, observaciones) obligatorio: sin checklist completo no inicia la sesión |

```sql
create table public.catalogo_motivos_pausa (
  codigo text primary key, nombre text not null,
  activo boolean not null default true,
  requiere_nota boolean not null default false,
  libera_maquina boolean not null default false,
  orden integer not null default 0
);
alter table public.sesiones_trabajo
  add column motivo_pausa_codigo text references public.catalogo_motivos_pausa(codigo),
  add column motivo_pausa_nota text,
  add column recurso_liberado boolean not null default false,
  add column verificacion_inicio jsonb;
create table public.autorizaciones_hora_extra (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.ordenes_produccion(id),
  sesion_id uuid references public.sesiones_trabajo(id),
  horas_autorizadas numeric(6,2) not null check (horas_autorizadas > 0),
  motivo text not null,
  autorizado_por uuid not null references public.usuarios(id),
  estado text not null default 'VIGENTE' check (estado in ('VIGENTE','USADA','REVOCADA')),
  creado_en timestamptz not null default now()
);
```

**Backfill:** motivos legacy (`falta_informacion→DUDA`, `material_pendiente→MATERIAL`, `aprobacion_cliente→DUDA`, `problema_tecnico→FALLA`, `mantenimiento→FALLA`, `otro→OTRA`); el CHECK viejo se conserva hasta que ningún consumidor lo use (grandfathering ADR-09).

**Tareas:** migración + catálogo + RPCs (`reclamar_recurso_liberado`, `cerrar_jornada`, `autorizar_horas_extra`, checklist en inicio); UI de pausas con catálogo, horas extra y checklist; pgTAP de cada regla; concurrencia de dos inicios sobre el mismo recurso.

---

## 6.3 Calidad básica (§12.3)

**Documento:** primera pieza debe liberarse cuando aplique; lotes 5+: referencias iniciales 1, 3 y 5; lotes grandes cada 10 o 20 según cliente/proceso; cierre captura tolerancias, cantidades, fotos y material usado; perfiles de inspección por cliente → fase posterior.

```sql
create table public.inspecciones_calidad (
  id uuid primary key default gen_random_uuid(),
  orden_id uuid not null references public.ordenes_produccion(id),
  corrida_id uuid references public.corridas(id),
  partida_id uuid references public.partidas_orden_produccion(id),
  codigo_item text not null,
  tipo text not null check (tipo in ('PRIMERA_PIEZA','REFERENCIA_LOTE','CIERRE')),
  referencia integer,                        -- 1, 3, 5, 10, 20...
  resultado text not null check (resultado in ('APROBADA','RECHAZADA')),
  tolerancias jsonb not null default '{}'::jsonb,
  cantidad_inspeccionada numeric(12,2) not null default 0,
  cantidad_ok numeric(12,2) not null default 0,
  cantidad_nok numeric(12,2) not null default 0,
  cantidad_retrabajo numeric(12,2) not null default 0,
  material_usado jsonb not null default '{}'::jsonb,
  observaciones text, liberado_por uuid not null references public.usuarios(id),
  creado_en timestamptz not null default now()
);
alter table public.catalogo_procesos
  add column requiere_primera_pieza boolean not null default false,
  add column intervalo_inspeccion_lote integer;   -- 10 o 20 configurable por proceso
-- Seed según decisión del cliente 2026-10-05:
--   requiere_primera_pieza = true en LASER_FIBRA, LASER_CO2, DOB, ROUTER, MAQUINADO
--   (SOLD y ACABADO quedan false, configurables después)
--   intervalo_inspeccion_lote = 10 por defecto (20 configurable por proceso)
```

**Reglas:**
1. **Primera pieza:** si el proceso de la corrida `requiere_primera_pieza`, no se registran piezas de producción hasta una inspección `PRIMERA_PIEZA` `APROBADA` (gate en RPC de cierre/avance, error `primera_pieza_pendiente`). El flag es configurable por proceso (decisión cliente 2026-10-05: activo inicialmente en Láser Fibra, Láser CO₂, Doblado CNC, CNC Router y Maquinado/Fabricación).
2. **Referencias de lote:** para cantidades ≥ 5, la UI sugiere y exige referencias 1, 3 y 5; para lotes grandes, cada `intervalo_inspeccion_lote` (10 o 20, configurable por proceso; decisión cliente 2026-10-05; el perfil por cliente queda en fase posterior). Las referencias se registran como `REFERENCIA_LOTE` sin bloquear producción (control estadístico básico).
3. **Cierre:** `CIERRE` captura tolerancias, cantidades (ok/nok/retrabajo), fotos (`archivos` `entidad='inspeccion_calidad'`) y material usado.
4. **Scrap/retrabajo:** se conservan los contadores actuales y se suman los de inspección; motivos de no conformidad quedan para fase avanzada (§16.5).

**Tareas:** migración + RPC `registrar_inspeccion` con permisos `CALIDAD_LIBERAR_PRIMERA_PIEZA`/`CALIDAD_INSPECCIONAR`; gates en avance/cierre; UI de calidad en piso y ficha de orden; pgTAP del gate de primera pieza y referencias; E2E de lote con primera pieza.

**Jornada (resuelta, decisión final 2026-10-06):** jornada estándar inicial de 8 h por turno, ajustable/configurable por recurso (override o capacidad por turno en Planeación); las horas extra se autorizan al exceder la jornada configurada vigente. Corrección de auditoría (2026-10-07, migración `20261007230003`): el umbral de horas extra usa la **jornada del turno** (excepción > override > capacidad del turno > 8 h), no la capacidad instalada `equipos × jornada`.

---

## 6.4 UI, pruebas y criterios de aceptación

**UI:**
- `/produccion`: cola por área (existente) + panel de corridas (crear, ver ítems, estado, avance), checklist de inicio, pausas con catálogo, horas extra (supervisor), panel de calidad.
- `/produccion-piso`: sesión por corrida, archivos vivos visibles al iniciar, pausa/reanudar/cerrar con reglas nuevas, avance por meta (existente) y captura de inspecciones permitidas al operador según permisos.

**Criterios del bloque:**
1. No se crea corrida con ítems incompatibles ni de otra orden (pgTAP).
2. No hay dos operaciones simultáneas en el mismo recurso; la liberación >1 h deja traza y reanuda con revalidación (concurrencia + pgTAP).
3. Ninguna sesión cruza de fecha; `cerrar_jornada` cierra con causa `FIN_JORNADA` (pgTAP).
4. Horas extra sin autorización vigente no cierran la sesión (pgTAP).
5. Primera pieza aprobada bloquea/desbloquea producción cuando el proceso lo exige (pgTAP + E2E).
6. Inspecciones de cierre guardan tolerancias/cantidades/fotos/material (E2E).
7. Corridas legacy: una orden antigua sin corrida puede iniciar (se genera corrida automática) sin romper candados.
8. Gates §0.9 + regresión de PRD-09 (avance por proceso) y piso.

**Exclusiones:** perfiles de inspección por cliente, motivos de no conformidad, capacidad instalada sofisticada, planificación multi-orden.
