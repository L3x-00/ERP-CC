# Cierre técnico de la Fase 9 — Gastos, CxP y rentabilidad

Fecha del corte: 2026-09-09

## Alcance implementado localmente

Se entregaron el esquema de Gastos/CxP, folios atómicos, RPCs de alta y estado,
tarifas históricas, motor de rentabilidad por orden, OCR server-side, contratos
TypeScript, mappers, validaciones Zod v4, acciones autorizadas, auditoría,
Zustand efímero, Realtime, ruta `/gastos`, fixture `SIM-GTO`, pruebas unitarias,
integración y una E2E remota opt-in.

La venta se toma exclusivamente de CxC; los gastos cancelados no se costean;
la merma es costo real; y el historial laboral usa la tarifa congelada en cada
sesión. Ninguna de estas reglas depende de conteos o cálculos concurrentes del
navegador.

## Evidencia de verificación local

| Compuerta | Resultado |
| --- | --- |
| `pnpm typecheck` | PASS (`tsc --noEmit`) |
| `pnpm lint` | PASS |
| `pnpm test` | PASS — 40 archivos, 348 pruebas |
| `pnpm test:integracion` | PASS — 8 archivos, 33 pruebas |
| `pnpm build` | PASS — Next.js 16.3.3, rutas incluida `/gastos` |
| `pnpm audit` | PASS — sin vulnerabilidades conocidas |
| `pnpm test:e2e` | PASS como compuerta opt-in — 5 pruebas omitidas sin credenciales remotas |
| `node --check supabase/semillas/gastos-ficticia.mjs` | PASS |

Durante el endurecimiento se actualizaron Next.js y `eslint-config-next` a
16.3.3 y se fijaron dependencias transitivas vulnerables mediante los overrides
del workspace. La comprobación de vulnerabilidades quedó limpia.

## Migraciones

| Migración | Contenido |
| --- | --- |
| `20260909224637_fase_9_gastos_base.sql` | tabla, folio, RLS, Realtime y tarifa histórica |
| `20260909224640_fase_9_motor_rentabilidad.sql` | RPC de rentabilidad agregada |
| `20260909224643_fase_9_rpc_gastos.sql` | registro y cambio de estado atómicos |

Los nombres fueron generados por la CLI de Supabase para conservar el orden
cronológico del historial; no se renombraron manualmente.

## Compuerta pendiente

La cuenta CLI vinculada al proyecto `pwnecbcynnqnvfwmvrnn` responde 403
(`LegacyDbConfigLoginRoleStatusError`) al intentar consultar migraciones,
`db lint` o regenerar tipos. Por ello este corte no afirma que las tres
migraciones estén aplicadas en Supabase ni que exista una lista remota sin
drift. Los tipos Supabase fueron mantenidos localmente de forma explícita para
que el código compile y deberán regenerarse directamente desde la base después
de recuperar el privilegio de CLI. La verificación (`pnpm verificar:ficticios:gastos`)
reproduce el mismo estado: el caché remoto aún no
contiene `public.gastos` ni `public.obtener_rentabilidad_orden`.

## Próximo paso operativo

Restaurar el acceso de la cuenta Supabase, ejecutar `pnpm supabase db push
--linked`, regenerar `src/compartido/tipos/supabase.ts`, correr `db lint`,
sembrar `SIM-GTO` con confirmación y ejecutar la E2E remota. Solo después de
esas comprobaciones se podrá cerrar formalmente la Fase 9.
