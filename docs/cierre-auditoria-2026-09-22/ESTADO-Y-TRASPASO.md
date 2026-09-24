# Estado y traspaso del cierre de auditoría ORCA — 24 septiembre 2026

Fuente operativa para retomar: `.ai-shared/qa/cierre-auditoria-2026-09-22/CONTINUIDAD.md`; línea base: `entregables/auditoria-global-2026-09-22/` (20 hallazgos, 164 requisitos y 41 escenarios). La rama local es `codex/cierre-auditoria-global`, nacida de `main` en `2d7f0c2`. No hay publicación de esta rama, merge, despliegue ni aplicación remota de las migraciones nuevas. Cuatro rutas no seguidas bajo `entregables/` pertenecen a trabajo ajeno y se preservaron fuera de los commits.

| Alcance | Commit local | Resultado principal |
| --- | --- | --- |
| A01 | `79cbd15` | Protección de hash PIN y comprobación de permisos SQL |
| A02–A04 | `2db77b8` | Cancelación de orden/cartera, base neta e IVA, dashboard sin duplicados ni falsos cero |
| A05–A06 | `4d27e4f` | Asignación atómica de áreas y jerarquía de permisos completa |
| A07–A09 | `c56f585` | Realtime de clientes/pipeline, publicación y revocación con JWT anterior |
| A10–A11 | `9d8850e` | Pruebas de integración y semillas aisladas de producción; gate de CI |
| A13–A14 | `d762500` | Crédito concurrente en transacción e identidad de cliente conservada |
| A15 | `54e81e8` | Horas estimadas repartidas por tarifa, sin tocar costo histórico |
| A16 | `1332eba` | Crédito vence a 45 días al entregar; historia AR intacta |
| A17 | `132984d` | Gestión administrativa de operadores/PIN, unicidad concurrente y revocación viva |
| A18 | `d809460` | Bitácora administrativa, RLS de usuario activo y detalles protegidos |
| A19 | `4968777` | Gastos editables con CAS y comprobantes privados persistidos |
| A20 (parcial: ORD-02/11) | `cce64e0` | Resumen operativo y comparativa KPI de órdenes |
| A20 (parcial: PRD-06/17) | `0db4a29` | Reanudación contextual con CAS e historial de intervalos |
| A20 (PRD-17, archivos) | Ver historial de esta rama | Archivos privados por sesión y salida final separados, carga directa y lectura firmada |
| A20 (CFG-04) | Ver historial de esta rama | Continuidad mensual CNC consultable y ajuste monotónico con permisos y bitácora |

Cada bloque tiene evidencia y límites en su documento `A*.md`. El último subbloque PRD-17 superó pgTAP 10/10, integración local con JWT 184/184, 740 unitarias, tipos/lint/build y E2E de Producción 2/2 con carga >2 MiB, rechazo de formato, segunda pantalla y lectura firmada. Los bloques anteriores tienen pruebas locales registradas en sus documentos y en `.ai-shared/qa/cierre-auditoria-2026-09-22/`. Esos resultados **no certifican producción**.

## Trabajo restante

1. **A20:** ORD-02/11, PRD-06/17 y CFG-04 tienen implementación y pruebas locales. Restan CLI-08, ORD-06/07, PRD-09/15, PLA-05/06, AR-01/02/08/09/16 y CFG-12. Reconciliar e implementar las brechas individuales indicadas por `hallazgos.json` y `matriz-164.csv`; no declarar completo un ID por una prueba parcial.
2. **A12 final:** ejecutar aceptación por los 164 requisitos y las variantes de 41 escenarios; reconciliar evidencias locales y remotas, CI y decisión del Product Owner.

Las migraciones del cierre (`20260922000001`–`000008`, `20260923144144`, A15 `20260923170507`, A16 `20260923181412`, A17 `20260923183348`, A18 `20260923232245`, A19 `20260923235400`/`20260923235600`/`20260924001000` y A20 `20260924010000`/`20260924013000`/`20260924100631`) se aplicaron **solo a Supabase local**. La comprobación remota anterior devolvió HTTP 403. `.env.local` apunta a producción: para pruebas con escritura usar exclusivamente `.ai-shared/qa/auditoria-global-2026-09-22/entorno-local.ps1` y verificar loopback. Los commits siguen solo locales; cualquier push, merge, migración remota o despliegue requiere un encargo y control de riesgo separados. Claude no ejecutó ni revisó A15–A20 (API 429); Codex implementó y revisó estos bloques provisionalmente.
