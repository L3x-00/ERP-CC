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


