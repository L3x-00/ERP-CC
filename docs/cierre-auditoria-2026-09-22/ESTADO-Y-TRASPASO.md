# Estado y traspaso del cierre de auditoría ORCA — 23 septiembre 2026

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
| A18 | Ver historial de esta rama | Bitácora administrativa, RLS de usuario activo y detalles protegidos |

Cada bloque tiene evidencia y límites en su documento `A*.md`. A18 superó SQL 158/158, integración 177/177, 734 unitarias, tipos, lint, compilación y E2E local 2/2 de bitácora/roles; la revisión visual cubrió 1440/768/390 px en ambos temas. A17 superó SQL 150/150, integración 173/173, 727 unitarias y E2E 1/1 de operadores. Los bloques anteriores también tienen pruebas locales registradas en sus documentos y en `.ai-shared/qa/cierre-auditoria-2026-09-22/`. Esos resultados **no certifican producción**.

## Trabajo restante

1. **A19 (GAS-01/02/06/07/09):** edición controlada de gastos, proveedor, filtros y reapertura autorizada de comprobante.
2. **A20:** reconciliar e implementar las brechas individuales de órdenes, taller, planeación y cartera indicadas por `hallazgos.json` y `matriz-164.csv`; no declarar completo un ID por una prueba parcial.
3. **A12 final:** ejecutar aceptación por los 164 requisitos y las variantes de 41 escenarios; reconciliar evidencias locales y remotas, CI y decisión del Product Owner.

Las migraciones del cierre (`20260922000001`–`000008`, `20260923144144`, A15 `20260923170507`, A16 `20260923181412`, A17 `20260923183348` y A18 `20260923232245`) se aplicaron **solo a Supabase local**. La comprobación remota anterior devolvió HTTP 403. `.env.local` apunta a producción: para pruebas con escritura usar exclusivamente `.ai-shared/qa/auditoria-global-2026-09-22/entorno-local.ps1` y verificar loopback. Los commits siguen solo locales; cualquier push, merge, migración remota o despliegue requiere un encargo y control de riesgo separados. Claude no ejecutó ni revisó A15–A18 (API 429); Codex implementó y revisó estos bloques provisionalmente.
