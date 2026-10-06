# Estado TERMINAL A — Stream E2 Catálogos (B1.3–B1.8)

> Append-only. Cada entrada usa el formato §7 del `PROTOCOLO-PARALELO.md`.
> No editar entradas anteriores; agrega una nueva al final.

## 2026-10-05 — Arranque

- ESTADO: PENDIENTE DE INICIO
- Prompt: `docs/plan-erp-sii/paralelo/prompts/PROMPT-TERMINAL-A.md`
- Bloque: `docs/plan-erp-sii/01-sistema-catalogos.md` §1.3–1.8
- Migraciones: banda `2026100610xxxx`
- Bloqueos actuales: ninguno
- Siguiente: crear migraciones base + seeds y pgTAP.

## 2026-10-05 17:05 — SII-B1.3–B1.8 implementado; falta que el PO aplique migraciones

```
TERMINAL: A | FECHA-HORA: 2026-10-05 17:05
ESTADO: SUB-BLOQUE LISTO (código/tests) · BLOQUEADO para gates mutantes hasta aplicar migraciones
TAREAS: SII-B1.3-01 tablas+seed+RLS materiales ✅ · SII-B1.4-01 espesores ✅ · SII-B1.5-01 procesos ✅
        SII-B1.6-01 grupos equipo/planeados + FK recursos ✅ · SII-B1.7-01 próximas acciones ✅
        SII-B1.8-01 versionado+trigger ✅ · UI Catálogos base ✅ · pgTAP ✅ · unitarias ✅ · E2E escrito (no ejecutado) ✅
ARCHIVOS:
  supabase/migrations/20261006100001_sii_b1_catalogos_base.sql (nuevo)
  supabase/migrations/20261006100002_sii_b1_catalogos_versionado.sql (nuevo)
  supabase/tests/sii_b1_catalogos.test.sql (nuevo)
  src/modulos/catalogos/** (nuevo: tipos, validaciones, servicios, utilidades, 10 acciones)
  src/modulos/configuracion/componentes/pestana-catalogos-base.tsx (nuevo)
  src/modulos/configuracion/componentes/operacion-configuracion.tsx (pestaña + visibilidad por permiso)
  src/compartido/tipos/supabase.ts (bloqueo §4 tomado/liberado; 7 tablas + recursos_planeacion.grupo_equipo_id)
  tests/unitarias/catalogos-esquemas.test.ts, catalogos-utilidades.test.ts, catalogos-mappers.test.ts (nuevos)
  tests/e2e/catalogos-base.spec.ts (nuevo)
  tests/e2e/catalogos-comerciales.spec.ts (2 selectores con exact:true por colisión "Catálogos"/"Catálogos base")
  tests/unitarias/planeacion-esquemas.test.ts (fixture + grupo_equipo_id: null por el tipo nuevo)
MIGRACIONES: 20261006100001_sii_b1_catalogos_base.sql, 20261006100002_sii_b1_catalogos_versionado.sql | APLICADA POR PO: no
GATES: unit focal 18/18 ✅ · unit global 814/815 (❌ ajena: clientes-crear-accion, stream C en curso) ·
       lint propio 0 errores (warning ajeno en tablas de B/C) · typecheck global ❌ por stream C (clientes), mis archivos ✅ ·
       pgTAP 40/40 ✅ en dry-run transaccional revertido (sin persistencia; 0 rastros verificados) · integración ⏸ ·
       E2E focal+regresión ⏸ · build: compila ✅, typecheck global bloqueado por C
EVIDENCIA:
  npx vitest run tests/unitarias/catalogos-*.test.ts -> 3 files / 18 tests passed
  docker exec psql BEGIN+2 migraciones+test+ROLLBACK -> plan(40), 40 ok, sin "not ok"; tablas nuevas=0 tras rollback
  pnpm lint -> solo warnings ajenos; pnpm typecheck -> errores solo en src/modulos/clientes/** y tests de clientes
BLOQUEOS: migraciones sin aplicar (dueño: PO). Al aplicarlas: correr supabase test db + integración + E2E con bloqueo.
SIGUIENTE: pedir aplicación de migraciones; luego gates mutantes, capturas .ai-shared/qa/sii-b1-e2/visual y cierre.
```

## 2026-10-06 — Cierre Fase 1 (E2 completo) + Fase 2 (retrofit correlationId)

```
TERMINAL: A | FECHA-HORA: 2026-10-06 (cierre de gates locales)
ESTADO: SUB-BLOQUE LISTO para cross-review/commit

--- FASE 1: CIERRE E2 (B1.3–B1.8) ---
MIGRACIONES: 20261006100001_sii_b1_catalogos_base.sql, 20261006100002_sii_b1_catalogos_versionado.sql
  APLICADAS EN LOCAL: sí (supabase migration list --local las muestra aplicadas). REMOTO: pendiente PO.
GATES: pgTAP 555/555 (29 archivos, incl. sii_b1_catalogos 40/40) · unit 862/862 · integración 226/226 ·
  E2E 5/5 (catalogos-base focal + catalogos-comerciales + configuracion-flujo x2 + continuidad-folios) ·
  typecheck 0 errores · lint 0 problemas · build "Compiled successfully" (Turbopack).
EVIDENCIA:
  · supabase test db → Files=29, Tests=555, Result: PASS
  · pnpm test:integracion → 30 files / 226 tests passed (con BLOQUEO-PRUEBAS tomado y liberado)
  · playwright (E2E_PUERTO=3101, fixture e2e-local.mjs) → 5 passed (2.0m)
  · capturas 1440/768 × claro/oscuro en .ai-shared/qa/sii-b1-e2/visual/ (4 PNG, sin commitear binarios)
  · fixture E2E limpiado por desactivación (E2E_MAT_* activo=f) y ACABADO restaurado (requiere_archivo_tecnico=t)
BLOQUEOS: ninguno.

--- FASE 2: RETROFIT CORRELATIONID (dueño A) ---
RESULTADO: 45 archivos / 85 llamadas a registrarLog ahora pasan correlationId (6.º argumento), una sola
  generación de nuevoCorrelationId() por invocación de acción.
  ordenes 12/12 · planeacion 4/4 · produccion 6/6 · cobranza 8/8 · gastos 4/4 · inventario 3/3 ·
  configuracion/acciones 3/3 (utilidades-acciones propaga a todas las acciones de configuración) ·
  comentarios 4/4 · dashboard 1/1.
ARCHIVOS (src): src/modulos/{ordenes,planeacion,produccion,cobranza,gastos,inventario,comentarios,dashboard}/acciones/*.ts
  y src/modulos/configuracion/acciones/{guardar-operador,utilidades-acciones,continuidad-folios}.ts.
  Sin cambios en módulos excluidos (permisos, archivos/nucleo, clientes, catalogos, auditoria, registrar-log, pipeline).
ARCHIVOS (tests, ajuste por contrato nuevo): tests/unitarias/{ordenes-acciones,planeacion-acciones,operadores-gestion-acciones}.test.ts
  y tests/integracion/{ordenes,cobranza,gastos,dashboard,comentarios,configuracion,produccion-sesiones}-acciones.test.ts:
  mocks exportan nuevoCorrelationId y las aserciones de aridad incluyen el 6.º argumento.
GATES post-retrofit (mismos comandos): unit 862/862 · integración 226/226 · E2E 5/5 · typecheck 0 · lint 0 · build OK.
EVIDENCIA: verificación programática de cobertura (85/85 llamadas con 6.º arg) + tsc/eslint/vitest en verde;
  git diff de los 45 archivos = import + const por función + 6.º argumento (sin cambios de lógica ni RPC).
MIGRACIONES: ninguna.
BLOQUEOS: ninguno.
SIGUIENTE: cross-review del coordinador y commit de Fase 1 + Fase 2; remoto de las 2 migraciones cuando el PO autorice.
```

## 2026-10-05 18:50 — B3.5 cierre: continuidad de folios periódicos implementada (pendiente aplicar migración)

```
TERMINAL: A | FECHA-HORA: 2026-10-05 18:50
ESTADO: SUB-BLOQUE LISTO (código/tests) · BLOQUEADO para gates mutantes hasta aplicar 2026100715* en local

TAREAS (B3.5 cierre):
  · Migración `consultar_continuidad_folio_periodico` + `ajustar_continuidad_folio_periodico` ✅
  · Guarda de dependencia `to_regclass('public.contadores_folio_periodico')` ✅
  · Acciones tipadas con `can('configuracion')` + service_role + registrarLog + correlationId ✅
  · Sección "Folios por periodo" en pestaña Folios (bloque CNC intacto) ✅
  · Tipos `supabase.ts` con BLOQUEO-TIPOS tomado/liberado y marcadores §4bis verificados ✅
  · pgTAP 28 aserciones ✅ (dry-run transaccional revertido, 0 rastros) · unit 3/3 ✅ · E2E escrito ⏸

ARCHIVOS:
  supabase/migrations/20261007150001_sii_b3_continuidad_folios.sql (nuevo)
  supabase/tests/sii_b3_continuidad_folios.test.sql (nuevo)
  src/modulos/configuracion/acciones/continuidad-folios-periodico.ts (nuevo; solo exports async)
  src/modulos/configuracion/tipos/continuidad-folios-periodico.ts (nuevo)
  src/modulos/configuracion/validaciones/continuidad-folios-periodico.ts (nuevo)
  src/modulos/configuracion/componentes/pestana-folios.tsx (sección nueva; CNC sin cambios de markup)
  src/compartido/tipos/supabase.ts (2 funciones al final de Functions; bloqueo §4 liberado)
  tests/unitarias/configuracion-continuidad-periodico.test.ts (nuevo)
  tests/e2e/continuidad-folios-rfq.spec.ts (nuevo)

MIGRACIONES: 20261007150001_sii_b3_continuidad_folios.sql | APLICADA POR PO: no
  (orden: 0610* → 0710* → 0711* → 0715*; si el orden remoto bloquea, el coordinador aplica local con --include-all)

GATES: typecheck 0 · lint 0 (mis archivos) · unit 865/865 · build "Compiled successfully" ·
  pgTAP 28/28 en dry-run revertido · pgTAP real ⏸ (requiere migración aplicada) · integración ⏸ · E2E focal+regresión ⏸

EVIDENCIA:
  · docker exec psql BEGIN + migración + test + ROLLBACK → plan(28), 28 ok, sin "not ok"; 0 funciones tras rollback
  · npx vitest run tests/unitarias/configuracion-continuidad-periodico.test.ts → 3/3
  · pnpm test → 107 files / 865 tests passed · pnpm build → OK
  · Select-String marcadores: catalogo_materiales:, obtener_actividad:, credito_habilitado:,
    ajustar_continuidad_folio_periodico:, consultar_continuidad_folio_periodico: presentes
  · E2E: ajusta periodo vigente RFQ, ve siguiente, retroceso muestra error, capturas en
    .ai-shared/qa/sii-b3-folios/visual/ (se generan al ejecutar el spec)

BLOQUEOS: migración 20261007150001 sin aplicar en local (dueño: PO/coordinador). Sin ella no corren
  `supabase test db`, integración ni E2E focal/regresión.
SIGUIENTE: aplicar 2026100715* en local → correr pgTAP + integración + E2E focal/regresión con
  BLOQUEO-PRUEBAS y cerrar reporte.
```

## 2026-10-05 21:48 — B5 ola 1 (orden desde revisión, snapshot y estados) + Fase 0 rango 999

```
TERMINAL: A | FECHA-HORA: 2026-10-05 21:48
ESTADO: SUB-BLOQUE LISTO (código/dominio/tests) · BLOQUEADO para gates mutantes hasta aplicar 0712* y 0715*0002

TAREAS:
  FASE 0 (rango folios): RPC consultar/ajustar periódico con rango 0..999 ✅ · UI/validaciones a 999 ✅ ·
    pgTAP actualizado (ajustar 100 y 999 OK; 1000 falla) ✅
  B5.1/B5.2/B5.5 (0001): columnas SII + folio_sii + snapshot_json + eventos + backfill + puente ✅ ·
    RPC crear_orden_desde_revision (idempotente, snapshot, AR no cobrable, gate de crédito) ✅ ·
    RPC crear_orden_interna (OI- con autorización) ✅
  B5.3/B5.4 (0002): liberar_orden ✅ · cerrar_orden_administrativa ✅ · ajustar_orden_post_aceptacion ✅ ·
    derivaciones programación→PLANIFICADA, sesión→EN_PRODUCCION, metas→PRODUCCION_COMPLETADA ✅
  Dominio TS (sin UI): tipos + snapshot guard + Zod + servicio + 5 acciones con can/registrarLog/correlationId ✅
  supabase.ts con BLOQUEO-TIPOS tomado/liberado y marcadores de los 4 streams ✅
  pgTAP sii_b5_orden.test.sql (64 aserciones) ✅ dry-run · unitarias estado/snapshot/Zod ✅

ARCHIVOS:
  supabase/migrations/20261007150002_sii_b3_continuidad_folios_rango.sql (nuevo)
  supabase/migrations/20261007120001_sii_b5_orden_base.sql (nuevo)
  supabase/migrations/20261007120002_sii_b5_orden_estados.sql (nuevo)
  supabase/tests/sii_b5_orden.test.sql (nuevo) · supabase/tests/sii_b3_continuidad_folios.test.sql (rango 999)
  src/modulos/ordenes/tipos/orden-sii.ts · validaciones/orden-sii.ts · servicios/orden-sii-servicio.ts (nuevos)
  src/modulos/ordenes/acciones/{crear-orden-desde-revision,crear-orden-interna,liberar-orden,cerrar-orden-administrativa,ajustar-orden-post-aceptacion}.ts (nuevos)
  src/modulos/configuracion/{componentes/pestana-folios.tsx,validaciones/continuidad-folios-periodico.ts} (rango 999)
  src/compartido/tipos/supabase.ts (eventos + columnas SII + 5 funciones)
  Ajustes por mi cambio de FK/tipos (hints PostgREST + fixture): src/modulos/ordenes/servicios/ordenes-servicio.ts,
    planeacion/servicios/desglose-servicio.ts, produccion/servicios/documentos-orden-servicio.ts,
    pipeline/servicios/obtener-oportunidades.ts, cobranza/componentes/estado-cuenta-cliente-boton.tsx,
    tests/unitarias/ordenes-esquemas.test.ts
  tests/unitarias/ordenes-estado-sii.test.ts · tests/unitarias/configuracion-continuidad-periodico.test.ts (nuevos/actualizados)

MIGRACIONES: 20261007150002, 20261007120001, 20261007120002 | APLICADA POR PO: no
  Orden: 0610* → 0710* → 0711* → 0712* → 0715* (el 0712 relaja el CHECK de contadores para el tipo `O` de una letra)

GATES: typecheck: mis archivos 0 (global falla por C: propuestas cola/hook) · lint 0 (mis archivos) ·
  unit 906/906 · build: bloqueado por C (module-not-found en propuestas) — mi código compila ·
  pgTAP B5 64/64 y B3.5 29/29 en dry-run transaccional revertido (0 rastros) · pgTAP real/integración/E2E ⏸

EVIDENCIA:
  · docker psql BEGIN + 0712/0001 + 0712/0002 + sii_b5_orden.test → 64 ok, sin "not ok"; luego 0 funciones/tablas tras ROLLBACK
  · docker psql BEGIN + 0712/0001 + 0715/0002 + sii_b3_continuidad_folios.test → 29 ok
  · npx vitest run ordenes-estado-sii + ordenes-esquemas + continuidad-periodico → 36/36; pnpm test → 111 files/906
  · Corregidos durante el dry-run: partidas antes de la orden (FK), `id` ambiguo con OUT params, CHECK de 2..6 letras del contador

BLOQUEOS: falta aplicar 20261007150002 y 20261007120001/0002 en local (PO/coordinador; `--include-all` si el orden
  remoto lo bloquea). Sin eso no corren `supabase test db`, integración ni E2E.
SIGUIENTE: aplicar migraciones → pgTAP global + integración + E2E de regresión (planeación/producción) con
  BLOQUEO-PRUEBAS; la UI de la orden (consumidores) es la ola 2.
```


