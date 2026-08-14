# Cierre técnico de la Fase 8 — Cobranza

Fecha de cierre: 2026-08-14

## Resultado

La Fase 8 entrega Cuentas por Cobrar transaccionales: apertura controlada desde Producción terminada, pagos multimoneda, sobrepagos convertidos a monedero MXN, aging, recibos REC, autorización granular y actualización entre sesiones sin refresco manual.

## Evidencia de cierre

| Compuerta | Resultado |
| --- | --- |
| `pnpm typecheck` | Correcto |
| `pnpm lint` | Correcto, sin advertencias |
| `pnpm test` | 323 pruebas unitarias correctas |
| `pnpm test:integracion` | 27 pruebas correctas |
| `pnpm build` | Correcto; `/cobranza` es una ruta dinámica RSC |
| `pnpm audit --prod` | Sin vulnerabilidades conocidas |
| E2E remoto | Correcto; pago parcial, sobrepago, REC, auditoría y Realtime entre dos sesiones |
| Fixtures persistentes | `SIM-AR` verificado: 3 cuentas, 2 pagos y un crédito |
| `supabase db lint --linked` | Sin errores de esquema |
| `supabase migration list --linked` | Sin drift hasta `20260814151257` |
| Asesor de rendimiento Supabase | Sin hallazgos |

## Riesgo de plataforma pendiente

Supabase Auth informa que la protección contra contraseñas filtradas está desactivada. Es una configuración global de autenticación, ajena a las migraciones de Cobranza, y debe activarse con autorización del Product Owner para no alterar de forma silenciosa la política de acceso.
