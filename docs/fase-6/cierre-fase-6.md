# Cierre técnico de la Fase 6 — Planeación y capacidad

Fecha de cierre: 2026-08-13

## Resultado

La Fase 6 queda cerrada técnicamente. Planeación usa recursos identificables, capacidad por turno y excepciones, con decisiones concurrentes dentro de PostgreSQL. Las vistas son clientes de lectura: toda programación, reprogramación y toma de preparación pasan por Server Actions autorizadas y RPCs exclusivas de `service_role`.

## Controles confirmados

- RLS activa en recursos, capacidades, excepciones y programaciones.
- `authenticated` no tiene ejecución en las RPC de programación, reprogramación ni carga agregada.
- Locks, restricciones e índices de PostgreSQL protegen capacidad, candados y pantallas obsoletas.
- Realtime no usa payloads como datos de negocio; invalida y relee una proyección autorizada.
- Fixtures `SIM-PLN` se mantienen idempotentes y separados de datos reales. Las pruebas E2E temporales se limpian.

## Evidencia de cierre

| Compuerta | Resultado |
| --- | --- |
| `pnpm typecheck` | Correcto |
| `pnpm lint` | Correcto, sin advertencias |
| `pnpm test` | 270 pruebas unitarias correctas |
| `pnpm test:integracion` | 15 pruebas correctas |
| `pnpm build` | Correcto; `/planeacion` es ruta dinámica RSC |
| E2E remoto | Correcto; programación, preparación, auditoría y sincronización entre vistas |
| `supabase db lint --linked` | Sin errores de esquema |
| `supabase migration list --linked` | Sin drift hasta `20260813211519` |

## Pendiente de negocio

Antes de usar Planeación en planta, CC Manufacturing Group debe aprobar el catálogo real de recursos, calendarios, turnos y capacidades. Esa carga reemplazará los fixtures sin relajar los controles de RLS, RPC ni concurrencia.
