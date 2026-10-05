# Prompt de desarrollo — Bloques B0 y B1 (listo para pegar en Claude Code)

> **Uso:** Codex lo entrega como encargo a Claude Code. Modelo recomendado: Opus (o el nivel alto disponible), esfuerzo alto, turno único por etapa.
> **Regla:** no ejecutar dos etapas a la vez; cada etapa se reporta y Codex revisa antes de continuar.

---

## PROMPT (copiar desde aquí)

Actúas como **Claude Code**, desarrollador delegado del ERP ORCA MFG (repositorio `D:\ERP-CC`, Next.js 16 + Supabase). Codex orquesta, revisa, verifica e integra (Git/PR/migraciones remotas); el Product Owner define reglas de negocio. Tú implementas **solo** este encargo y reportas evidencia; no haces Git de integración ni acciones remotas.

### 0. Lecturas obligatorias antes de tocar código

1. `AGENTS.md` y `CLAUDE.md` (roles, límites, Git, seguridad).
2. `docs/plan-erp-sii/README.md`, `docs/plan-erp-sii/00-fundamentos.md`, `docs/plan-erp-sii/01-sistema-catalogos.md` (fuente de este encargo).
3. `docs/ERP_SII_Handoff_Tecnico_Funcional.md` §§5, 6, 15, 17 (norma del cliente).
4. Estado de Git: `git status` y `git log --oneline -5`. Preserva los `entregables/*` sin trackear y cualquier trabajo ajeno no confirmado. Si hay cambios sin commitear que no son tuyos, **detente y reporta**.
5. Skills de apoyo (cargar antes de ejecutar gates): `orca-dev-env`, `orca-testing`, `orca-migrations` y `orca-e2e` (fuente `.agents/skills/`, sincronizadas a Claude).

### 1. Misión

Completar **B0 (fundamentos, solo verificación)** y **B1 (Sistema: usuarios, permisos, catálogos, archivos, auditoría)** del plan `docs/plan-erp-sii/`, en 4 etapas secuenciales. No implementes nada fuera de B0/B1.

### 2. Etapas, alcance y entregables

#### Etapa E0 — B0 (sin código de producto)

- Revisar los 9 ADRs de `00-fundamentos.md §0.5`, la nomenclatura de folios (§0.6) y los patrones (§0.8) contra el documento del cliente.
- Entregar: lista de contradicciones o vacíos encontrados (si los hay), con cita de sección del documento y propuesta concreta.
- **No implementar** ningún ADR; solo revisión. Codex/PO ratifican antes de E1.
- Aceptación: informe de revisión con veredicto por ADR (`conforme` / `ajustar`), sin cambios de archivos.

#### Etapa E1 — B1.1 + B1.2: roles, usuarios y permisos por acción

- **B1.1:** RPC `cambiar_rol_usuario` con protección anti-autodegradación y mínimo un admin activo; UI Configuración → Usuarios (listar, rol, activo/inactivo, auditoría). El CHECK de roles vigente no se cambia (5 roles fijos del §5).
- **B1.2:** migración `20261005100001_sii_b1_permisos_catalogo.sql`:
  - tabla `permisos` (código PK, módulo, descripción, activo);
  - `permisos_rol` pasa de CHECK enumerado a FK al catálogo (localizar el nombre real del CHECK en `20260813201729` y eliminarlo con `ALTER ... DROP CONSTRAINT`);
  - seed de los 14 permisos vigentes (`PERMISOS` en `src/compartido/constantes/indice.ts`) + el conjunto nuevo de §1.2 con la matriz por rol propuesta;
  - RPC `actualizar_permisos_rol(rol, permisos[], actor)` con lock, auditoría y guardas (admin no queda sin permisos críticos);
  - `can()` / `obtener-permisos-*` leen el catálogo (sin listas nuevas hardcodeadas);
  - UI Configuración → Permisos (matriz rol×permiso, solo admin).
- Aceptación: pgTAP de FK/seed/guardas; unitarias + integración JWT; E2E de la matriz; ningún permiso nuevo rompe las acciones existentes.

#### Etapa E2 — B1.3 a B1.8: catálogos configurables y versionado

- Migración `20261005100002_sii_b1_catalogos_base.sql` con las tablas y seeds de §1.3–1.7: `catalogo_materiales` (8 materiales del §15.1), `catalogo_espesores` (dependiente de material), `catalogo_procesos` (8 procesos + `prefijo_corrida`), `grupos_equipo`, `grupos_planeados`, `catalogo_proximas_acciones` (7 códigos + `OTHER` único) y `recursos_planeacion.grupo_equipo_id`.
- **B1.8:** `versiones_catalogo` + trigger genérico `registrar_version_catalogo()`; los catálogos no exponen DELETE (solo `activo=false`).
- UI Configuración → Catálogos: CRUD con activo/inactivo, orden e historial de versiones; select de espesor dependiente de material; seeds de grupos de equipo sugeridos desde `recursos_planeacion` existentes (sin inventar recursos).
- Aceptación: pgTAP de seeds, unicidad, versionado y "sin delete"; unitarias de selects dependientes; E2E de catálogo con historial.

#### Etapa E3 — B1.9: archivos privados con metadatos y versionado

- Migración `20261005100003_sii_b1_archivos.sql`: tabla `archivos` (§1.9) + trigger de versión + RLS de lectura por permiso de la entidad.
- Servicio/acciones comunes en `src/nucleo/archivos/*`: preparar subida firmada, confirmar releyendo el objeto real, firmar lectura (≤300 s), reemplazar con versión (`vigente=false` + `reemplaza_a`), descartar huérfanos.
- Backfill idempotente de metadata: `documentos_cliente`, `archivos_sesion_produccion`, `archivos_orden` y adjuntos de `adjuntos-cotizacion` (hoy listados por prefijo). Los buckets existentes se conservan.
- Completar límites de bucket faltantes (`adjuntos-cotizacion`, `documentos-cliente`) con tamaño/MIME.
- Aceptación: pgTAP de versionado/RLS/backfill; integración de subida-reemplazo-lectura; E2E de al menos documento de cliente y adjunto de RFQ.

#### Etapa E4 — B1.10: Actividad con correlationId

- Migración `20261005100004_sii_b1_actividad.sql`: `logs.correlation_id uuid` + índice + RPC de consulta `obtener_actividad(filtros)` con permiso `ACTIVIDAD_VISTA`, paginación estable y resolución de etiquetas legibles (folio/nombre; nunca UUID crudo).
- `registrar-log` acepta y propaga `correlationId`; helpers de generación.
- Página `/actividad` + enlace en navegación; agrupación visual por `correlationId`; Realtime sin payloads.
- Aceptación: pgTAP de permisos/paginación; unitarias de propagación; E2E de filtros y agrupación; la pestaña Bitácora admin actual se conserva.

### 3. Reglas técnicas (obligatorias, de `00-fundamentos.md §0.8`)

- SQL: `SECURITY DEFINER SET search_path = ''`, `REVOKE ALL` de PUBLIC/anon/authenticated y `GRANT EXECUTE` solo a `service_role` salvo RPC con JWT; permisos revalidados en la RPC; locks ordenados documentados; CAS con `actualizado_en`; índices únicos parciales; `COMMENT ON` en lo nuevo; RLS de solo lectura con permiso; publicar en Realtime solo lo que la UI observe.
- TS: Zod v4 strict en cada Server Action, errores tipados con códigos estables, mappers defensivos, sin lógica de negocio en cliente, invalidación TanStack correcta, tipos regenerados del Supabase local (nunca editar `supabase.ts` a mano si se puede regenerar).
- UI: estándar §17 (cola → ficha → formulario → acción; acciones de negocio arriba; validaciones por sección; tokens de `tokens.css`; claro/oscuro).
- No inventar reglas de negocio: lo no especificado en el documento del cliente se conserva como está; si detectas un vacío, lo reportas como pendiente, no lo resuelves por tu cuenta.

### 4. Pruebas y gates (por etapa)

Ejecuta y reporta: `pnpm typecheck`, `pnpm lint`, `pnpm test` (Vitest), `supabase test db` (pgTAP del sub-bloque), `pnpm test:integracion`, `pnpm test:concurrencia` (donde haya locks/CAS), `pnpm build` (al cerrar etapa con UI) y `pnpm test:e2e` (spec nuevo + regresión del área). Capturas visuales 1440/768 claro/oscuro cuando haya UI. **Prohibido** usar `.env.local` (es producción) para pruebas mutantes: usa solo Supabase local (wrapper loopback).

### 5. Exclusiones del encargo

- No tocar B2/B3/B4 (Clientes, RFQ, Propuestas) ni sus pantallas, salvo ajustes mínimos estrictamente necesarios para que los permisos nuevos no rompan lo existente (repórtalos).
- No renombrar tablas físicas ni eliminar columnas/tablas legacy (ADR-09).
- No Git de integración: sin commit, push, PR, merge ni migraciones remotas (los aplica el PO/Codex).
- No modificar `AGENTS.md`, `CLAUDE.md`, `.codex/`, skills, memoria/coordinación (`.ai-shared/`), `entregables/*`, `.env*` ni configuración global.
- No agregar dependencias nuevas en este encargo (el PDF es B4).

### 6. Formato del reporte de cada etapa

Al terminar cada etapa, entrega un reporte con:
1. Alcance ejecutado y archivos cambiados (rutas).
2. Migraciones creadas (nombre exacto) y cómo se aplicaron **solo en local**.
3. Comandos ejecutados y resultados (verde/rojo, conteos).
4. Fallos, bloqueos y riesgos.
5. Pendientes y propuesta de siguiente etapa.
6. Confirmación explícita de exclusiones respetadas.

Si un gate falla y no puedes corregirlo sin salir del alcance, detente y reporta; no amplíes el alcance para "arreglar" otras áreas.

## (Fin del prompt)
