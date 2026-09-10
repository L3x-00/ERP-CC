# Cierre técnico de la Fase 10 — Dashboard por rol

Fecha del corte: 2026-09-09/10

## Resultado local

Se implementaron las cuatro sub-fases: RPCs de consolidación, configuración de
metas y comisiones, contratos/mappers Zod v4, tendencias puras, servicio por
rol, Server Actions, Zustand, Realtime, dashboard funcional, compatibilidad de
ruta y gate E2E opt-in.

La información financiera queda detrás de `ver_finanzas`; pipeline de equipo
detrás de `ver_pipeline_equipo`; un vendedor no recibe el bloque ejecutivo. La
gerencia recibe alertas operativas y aprobaciones pendientes derivadas de OP en
`borrador`, sin importar datos financieros; un operador es redirigido a
Producción.

## Verificación

| Compuerta | Resultado |
| --- | --- |
| `pnpm typecheck` | PASS |
| `pnpm lint` | PASS sin advertencias |
| `pnpm test` | PASS — 43 archivos, 365 pruebas |
| `pnpm test:integracion` | PASS — 9 archivos, 36 pruebas |
| `pnpm build` | PASS — Next.js 16.3.3, ruta `/dashboard` dinámica |
| `pnpm test:e2e` | PASS como gate opt-in — 9 pruebas omitidas sin credenciales remotas |
| `pnpm supabase db lint --local` | BLOQUEADO: no hay PostgreSQL local conectado |
| `pnpm supabase migration list --linked` | BLOQUEADO: cuenta Supabase responde 403 `LegacyDbConfigLoginRoleStatusError` |

La migración `20260910001120_fase_10_dashboard_base.sql` está versionada
localmente y no se afirma aplicada en Supabase. Los tipos de
`src/compartido/tipos/supabase.ts` fueron aumentados de forma explícita como
puente; deben regenerarse desde la base cuando se recupere el privilegio CLI.

## Pendientes de cierre remoto

1. Recuperar privilegios de la cuenta vinculada al proyecto
   `pwnecbcynnqnvfwmvrnn`.
2. Ejecutar `pnpm supabase db push --linked`, `db lint`, asesores de seguridad
   y rendimiento, y `migration list`.
3. Regenerar tipos desde la base y ejecutar la E2E con cuatro credenciales de
   prueba y datos ficticios aislados.
