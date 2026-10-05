# B1 — Sistema: usuarios, permisos, catálogos, archivos y auditoría

Referencias del documento: §5 (roles y permisos), §15 (configuración, catálogos, archivos, auditoría), §17 (UX de catálogos), §6 (reglas técnicas).
Depende de: B0. Es prerrequisito de B2, B3, B4, B5, B6, B7.

**Resultado del bloque:** permisos por acción administrables; catálogos configurables, activables/desactivables, versionados y auditados (materiales, espesores por material, procesos, grupos de equipo, grupos planeados, próximas acciones); un modelo único de archivos privados con metadatos y reemplazo trazado; vista de Actividad con `correlationId` y sin IDs técnicos.

---

## 1.1 Roles y usuarios

**Documento:** Operator, Customer Service, Administrative, Management, Admin; Admin "no debe eliminar su propio acceso crítico accidentalmente".

**Decisión:** los 5 roles existentes del sistema (`operador`, `vendedor`, `gerente`, `contador`, `admin`) se mapean 1:1 con los roles del documento; no se crean roles nuevos. Se documenta el mapeo en UI y en `permisos_rol`.

| Rol documento | Rol sistema | Responsabilidad |
|---|---|---|
| Operator | `operador` | Ejecutar producción; no ve precios |
| Customer Service | `vendedor` | Clientes, RFQ, propuestas, seguimiento |
| Administrative | `contador` | Facturación, CxC, pagos, cierres |
| Management | `gerente` | Supervisión, aprobaciones, catálogos según permiso |
| Admin | `admin` | Sistema, permisos, configuración |

**Reglas obligatorias:**
1. Un admin no puede quitarse a sí mismo el rol/permiso crítico ni desactivarse sin confirmación fuerte (RPC valida y rechaza con `no_puede_autodegradarse`; mínimo un admin activo en el sistema).
2. Operador nunca recibe permisos comerciales/financieros por defecto (no ve precios).
3. Altas de usuarios internos: se mantiene el flujo actual (Supabase Auth + perfil `vendedor`); B1.2 agrega UI admin para rol y activación. No se implementan invitaciones por correo en este plan.

**Tareas**

| ID | Tarea | Entregable | Pruebas | Aceptación |
|---|---|---|---|---|
| SII-B1.1-01 | RPC `cambiar_rol_usuario(usuario_id, rol, actor)` con protección anti-autodegradación y mínimo un admin activo | Migración | pgTAP: último admin no se degrada; admin no se degrada a sí mismo | La UI muestra error claro |
| SII-B1.1-02 | UI pestaña Usuarios (Configuración, solo admin): listar, rol, activo/inactivo, auditoría | Componente + acciones | Unitarias + E2E | Doc §5 |

**Exclusiones:** invitaciones, recuperación de contraseña, roles personalizados.

---

## 1.2 Permisos por acción (ADR-SII-05)

**Documento (§5):** "los permisos deben ser por acción y aplicar del lado servidor. Ejemplos: `PROPUESTA_VISTA`, `PROPUESTA_EDITAR_ARTICULO`, `PROPUESTA_EDITAR_PRECIO`, `PROPUESTA_ENVIAR`, `PROPUESTA_CREAR_REVISION`".

**Esquema (migración `20261005100001_sii_b1_permisos_catalogo.sql`):**

```sql
create table public.permisos (
  codigo      text primary key,             -- 'PROPUESTA_ENVIAR'
  modulo      text not null,                -- 'propuestas'
  descripcion text not null,
  activo      boolean not null default true,
  creado_en   timestamptz not null default now()
);
-- permisos_rol pasa de CHECK enumerado a FK al catálogo
alter table public.permisos_rol add constraint permisos_rol_permiso_fk
  foreign key (permiso) references public.permisos(codigo);
-- (eliminar el CHECK vigente; ver nombre real en 20260813201729)
```

**Conjunto inicial** (los 14 vigentes se conservan tal cual para no romper código; los nuevos se agregan por módulo):

| Módulo | Permisos nuevos |
|---|---|
| clientes | `CLIENTE_VISTA`, `CLIENTE_EDITAR`, `CLIENTE_DOCUMENTOS`, `CLIENTE_COMERCIAL` |
| rfq | `RFQ_VISTA`, `RFQ_CREAR`, `RFQ_EDITAR`, `RFQ_ITEM_EDITAR`, `RFQ_MARCAR_LISTO`, `RFQ_CERRAR` |
| propuestas | `PROPUESTA_VISTA`, `PROPUESTA_EDITAR_ARTICULO`, `PROPUESTA_EDITAR_PRECIO`, `PROPUESTA_EDITAR_RUTEO`, `PROPUESTA_EDITAR_COSTO`, `PROPUESTA_VALIDAR`, `PROPUESTA_GENERAR_PDF`, `PROPUESTA_ENVIAR`, `PROPUESTA_SEGUIMIENTO`, `PROPUESTA_ACEPTAR`, `PROPUESTA_CREAR_REVISION`, `PROPUESTA_CERRAR` |
| ordenes | `ORDEN_VISTA`, `ORDEN_EDITAR`, `ORDEN_LIBERAR`, `ORDEN_REPROGRAMAR`, `ORDEN_CERRAR_ADMIN`, `ORDEN_CANCELAR` |
| produccion | `PRODUCCION_OPERAR` (equivale a `gestionar_produccion`), `CALIDAD_LIBERAR_PRIMERA_PIEZA`, `CALIDAD_INSPECCIONAR` |
| entregas | `ENTREGA_GENERAR`, `ENTREGA_EVIDENCIA` |
| sistema | `ACTIVIDAD_VISTA`, `CATALOGO_VER`, `CATALOGO_EDITAR`, `USUARIO_ADMIN`, `PERMISO_ADMIN` |

**Notación:** el documento cita los permisos en MAYÚSCULAS (`PROPUESTA_VISTA`); la implementación usa snake_case minúsculo (`propuesta_vista`) conforme a la convención del repo. La equivalencia es directa y el mapeo queda documentado en la migración `20261005100001_sii_b1_permisos_catalogo.sql`.

**Matriz por defecto** (seed; ajustable en UI):

| Permiso | operador | vendedor | gerente | contador | admin |
|---|---|---|---|---|---|
| CLIENTE_VISTA / RFQ_VISTA / PROPUESTA_VISTA | — | sí | sí | sí (consulta) | sí |
| RFQ_* / PROPUESTA_EDITAR_ARTICULO / PRECIO / RUTEO | — | sí | sí | — | sí |
| PROPUESTA_EDITAR_COSTO y vista de costo/margen | — | — | sí | — | sí |
| PROPUESTA_ACEPTAR / ORDEN_LIBERAR | — | — | sí | — | sí |
| PRODUCCION_OPERAR / CALIDAD_* | sí | — | sí | — | sí |
| ENTREGA_* | — | — | sí | sí | sí |
| ACTIVIDAD_VISTA | — | — | sí | — | sí |
| CATALOGO_EDITAR / USUARIO_ADMIN / PERMISO_ADMIN | — | — | según permiso | — | sí |

**Tareas**

| ID | Tarea | Entregable | Pruebas |
|---|---|---|---|
| SII-B1.2-01 | Catálogo `permisos` + FK + seed de 14 vigentes + nuevos con matriz por rol | Migración | pgTAP: FK, seeds, ningún permiso huérfano |
| SII-B1.2-02 | Actualizar `can()`/`obtener-permisos-*` para leer del catálogo (sin listas hardcodeadas nuevas) | Código | Unitarias + integración JWT |
| SII-B1.2-03 | UI Configuración → Permisos (matriz rol×permiso, solo admin) con auditoría | Componente + acciones | E2E + pgTAP del RPC |
| SII-B1.2-04 | RPC `actualizar_permisos_rol(rol, permisos[], actor)` con lock y auditoría | Migración | pgTAP: no deja sin permisos críticos a admin |

**Reglas:** permisos retirados se `activo=false`, nunca se borran; `usuario_tiene_permiso` sigue siendo `SECURITY DEFINER`; ninguna Server Action escribe sin validar permiso.

---

## 1.3 Catálogo de materiales (ADR-SII-06 y §15.1)

**Documento:** "Materiales: Acero al carbón, Galvanizado, Inoxidable, Aluminio, Birch, MDF, Acrílico, Plástico ingeniería" — configurables, activos/inactivos, versionados y auditados.

**Decisión:** nueva tabla `catalogo_materiales` (no se usa `materiales` de inventario, que conserva stock/costos). Vínculo opcional futuro inventario↔catálogo por `codigo`.

```sql
create table public.catalogo_materiales (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  activo boolean not null default true,
  orden integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
```

Seed inicial: los 8 materiales del documento (código `ACERO_CARBON`, `GALVANIZADO`, `INOXIDABLE`, `ALUMINIO`, `BIRCH`, `MDF`, `ACRILICO`, `PLASTICO_ING`). Históricos de texto libre en líneas antiguas no se tocan.

---

## 1.4 Catálogo de espesores dependientes del material

**Documento:** "Espesores dependientes de material; mm normalizado + etiqueta".

```sql
create table public.catalogo_espesores (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.catalogo_materiales(id),
  etiqueta text not null,            -- '3 mm', '1/8"'
  espesor_mm numeric(8,3) not null check (espesor_mm > 0),
  activo boolean not null default true,
  orden integer not null default 0,
  creado_en timestamptz not null default now(),
  unique (material_id, etiqueta)
);
```

Regla UI: el selector de espesor depende del material elegido; un espesor inactivo no se ofrece en registros nuevos pero permanece visible en históricos (§15.1).

---

## 1.5 Catálogo de procesos

**Documento:** "Procesos: Láser fibra, Doblado CNC, Soldadura, CNC Router, Láser CO₂, Marcado láser, Maquinado/Fabricación, Acabado".

**Decisión:** nueva tabla `catalogo_procesos` (fuente única para "operación solicitada" en RFQ, ruteo en propuestas y prefijo de corridas), sin romper `areas_trabajo_config` (taxonomía de piso) — se enlazan por código.

```sql
create table public.catalogo_procesos (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,             -- LASER_FIBRA, DOB, SOLD, ROUTER, LASER_CO2, MARCADO, MAQUINADO, ACABADO
  nombre text not null,
  prefijo_corrida text not null,           -- LAS, DOB, ROU, SOL, MAR, MAQ, ACA
  grupo_planeado_id uuid references public.grupos_planeados(id),
  area_trabajo_codigo text references public.areas_trabajo_config(codigo),
  requiere_archivo_tecnico boolean not null default true,  -- LISTO de RFQ (decisión cliente 2026-10-05)
  activo boolean not null default true,
  orden integer not null default 0,
  creado_en timestamptz not null default now()
);
```

Seed con los 8 procesos del documento; `prefijo_corrida` alimenta folios de corrida (`LAS01`, `DOB01`, `ROU01`…). `requiere_archivo_tecnico` y (B6) `requiere_primera_pieza`/`intervalo_inspeccion_lote` son configurables desde Configuración → Catálogos.

---

## 1.6 Grupos de equipo y grupos planeados

**Documento:** "Grupos de equipo: categorías de recursos (CNC Router, Láser Fibra, Press Brake…)" y "Grupos planeados: Corte, Doblado, Soldadura, Maquinado, Acabado, Ensamble".

```sql
create table public.grupos_equipo (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique, nombre text not null,
  activo boolean not null default true, orden integer not null default 0
);
create table public.grupos_planeados (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique, nombre text not null,
  activo boolean not null default true, orden integer not null default 0
);
alter table public.recursos_planeacion
  add column grupo_equipo_id uuid references public.grupos_equipo(id);
```

Seed: grupos de equipo a partir de los recursos existentes (categoría por tipo de máquina) + los ya nombrados; grupos planeados con los 6 del documento. Recursos sin grupo quedan `null` (se completan en Configuración).

---

## 1.7 Catálogo de próximas acciones

**Documento (§10.4):** catálogo configurable, selección controlada con instantánea histórica; "Otro" habilita texto obligatorio. Códigos iniciales: `FOLLOW_UP`, `CONFIRM_RECEIPT`, `WAIT_CUSTOMER_RESPONSE`, `REQUEST_APPROVAL_PO`, `RESOLVE_CUSTOMER_QUESTIONS`, `PREPARE_NEW_REVISION`, `OTHER`.

```sql
create table public.catalogo_proximas_acciones (
  id uuid primary key default gen_random_uuid(),
  codigo text not null unique,
  nombre text not null,
  es_otro boolean not null default false,
  activo boolean not null default true,
  orden integer not null default 0
);
create unique index ux_proxima_accion_otro on public.catalogo_proximas_acciones (es_otro) where es_otro;
```

Regla transversal: donde se use, se guarda `codigo` + `texto_otro` (si aplica) + `fecha` + `responsable_id`; el histórico conserva valores aunque el catálogo desactive el código.

---

## 1.8 Versionado y auditoría de catálogos

**Documento (§15.1):** "configurables, activos/inactivos, versionados y auditados".

```sql
create table public.versiones_catalogo (
  id uuid primary key default gen_random_uuid(),
  entidad text not null,               -- catalogo_materiales, catalogo_procesos, ...
  entidad_id uuid not null,
  version integer not null,
  datos jsonb not null,                -- snapshot completo de la fila
  actor_id uuid references public.usuarios(id),
  creado_en timestamptz not null default now(),
  unique (entidad, entidad_id, version)
);
```

Trigger genérico `registrar_version_catalogo()` en las tablas de catálogo (INSERT/UPDATE) que inserta snapshot con `version = anterior + 1`; los catálogos **no exponen DELETE** (solo `activo=false`). La UI de Configuración muestra historial por registro.

**Migración sugerida:** `20261005100002_sii_b1_catalogos_base.sql` (materiales, espesores, procesos, grupos, próximas acciones, versiones y seeds).

---

## 1.9 Archivos: modelo único privado con versionado (ADR-SII-06, §15.2)

**Documento:** almacenamiento privado; metadatos separados del blob; nombre original + nombre ERP; vínculo explícito a entidad/revisión/ítem; no reemplazar silenciosamente archivos históricos; cambios del archivo vigente trazados.

```sql
create table public.archivos (
  id uuid primary key default gen_random_uuid(),
  entidad text not null check (entidad in
    ('cliente','rfq','rfq_item','propuesta','propuesta_revision','propuesta_item',
     'orden','sesion_produccion','entrega','gasto','inspeccion_calidad')),
  entidad_id uuid not null,
  tema_codigo text,                          -- tema del RFQ (B3); null = general
  clase text not null,                       -- general|tecnico|pdf|evidencia|firma|comprobante|salida
  nombre_original text not null,
  nombre_erp text,                           -- p.ej. RFQ-2610_01_IT01_DXF.dxf
  bucket text not null,
  ruta_storage text not null unique,
  mime text not null,
  tamano_bytes bigint not null check (tamano_bytes > 0),
  hash_sha256 text,
  version integer not null default 1,
  reemplaza_a uuid references public.archivos(id),
  vigente boolean not null default true,
  subido_por uuid references public.usuarios(id),
  creado_en timestamptz not null default now()
);
create unique index ux_archivo_vigente
  on public.archivos (entidad, entidad_id, coalesce(tema_codigo,''), nombre_erp)
  where vigente;
create index ix_archivos_entidad on public.archivos (entidad, entidad_id);
```

**Reglas:**
1. Subida con URL firmada directa (patrón A19/PRD-17), revalidación de objeto real (tamaño/MIME/ruta) al confirmar, descarte de huérfanos.
2. Reemplazo: la fila anterior `vigente=false` y la nueva `reemplaza_a=<anterior>` + `version+1`; nunca `update` del blob.
3. Límites de tamaño/MIME **en el bucket** (no solo en la acción).
4. Lectura por URL firmada ≤ 300 s con permiso de la entidad.
5. Migración de metadata existente: `documentos_cliente`, `archivos_sesion_produccion`, `archivos_orden` y adjuntos de pipeline (hoy sin tabla) se backfillean a `archivos`; los buckets se conservan.

**Tareas**

| ID | Tarea | Entregable | Pruebas |
|---|---|---|---|
| SII-B1.9-01 | Migración `archivos` + trigger de versión + RLS | SQL | pgTAP RLS/versionado |
| SII-B1.9-02 | Servicio/acciones comunes de archivos (preparar subida, confirmar, firmar lectura, reemplazar) | `src/nucleo/archivos/*` | Unitarias + integración |
| SII-B1.9-03 | Backfill metadata de los 4 orígenes actuales | Migración idempotente | pgTAP de conteos |
| SII-B1.9-04 | Límites de bucket faltantes (`adjuntos-cotizacion`, `documentos-cliente`) | Migración storage | Prueba de rechazo por tamaño/MIME |

---

## 1.10 Actividad / auditoría (ADR-SII-08, §15.3)

**Documento:** "La vista de Actividad debe permitir entender qué ocurrió sin mostrar IDs técnicos. Los eventos relacionados de una misma acción pueden compartir `correlationId`."

```sql
alter table public.logs add column correlation_id uuid;
create index ix_logs_correlation on public.logs (correlation_id) where correlation_id is not null;
```

**Alcance:**
1. `registrar-log` acepta y propaga `correlationId` generado por cada Server Action de negocio (un UUID por acción; eventos hijos lo heredan).
2. Nueva ruta `/actividad` (permiso `ACTIVIDAD_VISTA`; admin siempre): filtros por usuario/módulo/acción/entidad/rango, paginación estable, enlaces resueltos a ficha (cliente → `/clientes?cliente=`, RFQ → `/rfq?rfq=`, propuesta → `/propuestas?...`, orden → `/ordenes?...`); **si no hay enlace, mostrar folio o nombre, nunca el UUID crudo**.
3. Agrupación visual por `correlationId` (misma acción = mismo grupo).
4. La pestaña Bitácora admin se conserva; Actividad es la vista operativa.

**Tareas**

| ID | Tarea | Entregable | Pruebas |
|---|---|---|---|
| SII-B1.10-01 | Migración `logs.correlation_id` + RPC de consulta `obtener_actividad(filtros)` con seguridad y resolución de etiquetas | SQL | pgTAP permisos/paginación |
| SII-B1.10-02 | Página `/actividad` + sincronización realtime sin payload | UI | E2E + visual |
| SII-B1.10-03 | Convención de `correlationId` en `registrar-log` y helpers | Código | Unitarias |

---

## 1.11 Criterios de aceptación del bloque

1. Matriz de permisos administrable en Configuración, aplicada en servidor; ningún permiso nuevo hardcodeado en listas TS.
2. Los 6 catálogos existen, con seed, activo/inactivo, versionado y auditoría; la UI permite CRUD con historial.
3. El modelo `archivos` funciona para al menos un caso real de cada tipo (documento de cliente y adjunto de RFQ) con reemplazo trazado.
4. `/actividad` muestra acciones con `correlationId` y sin UUID crudos visibles.
5. Gates de §0.9 en verde + regresión de bloques previos.

**Evidencia a entregar:** migraciones (solo locales), capturas visuales, resultados de pruebas, listado de permisos sembrados, matriz rol×permiso resultante.
