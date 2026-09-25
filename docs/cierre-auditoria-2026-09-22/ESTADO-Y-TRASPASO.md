# Estado y traspaso del cierre de auditoría ORCA — 25 septiembre 2026, 09:29 Lima

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
| A20 (ORD-07) | `0fa7286` | Metas ordenadas por partida/proceso, configurables en borrador con CAS y RLS |
| A20 (PRD-17, archivos) | `bf6ab0a` | Archivos privados por sesión y salida final separados, carga directa y lectura firmada |
| A20 (CFG-04) | `131fb70` | Continuidad mensual CNC consultable y ajuste monotónico con permisos y bitácora |
| A20 (AR-01, referencia parcial) | `5cd3968` | Referencia interna INVCNC única, inmutable y visible en cartera/recibos |
| A20 (AR-02, registro parcial) | `8230d30` | Número fiscal y vencimiento sobre la AR existente; cobro inicial posterior, sin duplicar cuenta |
| A20 (AR-02, excepción histórica) | `8d1f0dd` | Alta excepcional para orden entregada sin AR, propuesta RFQ y abono posterior |

Cada bloque tiene evidencia y límites en su documento `A*.md`. La variante excepcional de AR-02 superó pgTAP 11/11, SQL global 250/250, integración local 187/187, 740 unitarias, tipos/lint/build y E2E de Cobranza 3/3; el caso focal se repitió tras el último ajuste de RFQ. La revisión visual cubrió escritorio y móvil. Los bloques anteriores tienen pruebas locales registradas en sus documentos y en `.ai-shared/qa/cierre-auditoria-2026-09-22/`. Esos resultados **no certifican producción**.

## Trabajo restante

1. **A20:** ORD-02/07/11, PRD-06/17, CFG-04 y AR-02 tienen implementación y pruebas locales; AR-01 incorporó su referencia interna, pero sigue parcial. Restan **11 ID**: PRD-09, ORD-06, CLI-08, PRD-15, PLA-05/06, AR-01/08/09/16 y CFG-12. Los diez encargos breves para otra IA están en `docs/cierre-auditoria-2026-09-22/PROMPTS-TRASPASO-A20-A12.md` (el décimo es A12). La automatización `continuar-cierre-orca` está en pausa para evitar duplicación.
2. **A12 final:** cerrar la correspondencia con los cuatro prompts originales: criterios de aceptación para 134 capacidades base y 30 OBS (164 ID), auditoría funcional de los cambios desde la línea base y variantes de 41 escenarios E2E. Reconciliar evidencias locales y remotas, revisión independiente, CI y decisión del Product Owner. No repetir desde cero lo ya acreditado; probar deltas y vacíos.

Las migraciones del cierre (`20260922000001`–`000008`, `20260923144144`, A15 `20260923170507`, A16 `20260923181412`, A17 `20260923183348`, A18 `20260923232245`, A19 `20260923235400`/`20260923235600`/`20260924001000` y A20 `20260924010000`/`20260924013000`/`20260924100631`/`20260924234000`/`20260925000100`/`20260925043000`/`20260925052500`) se aplicaron **solo a Supabase local**. La comprobación remota anterior devolvió HTTP 403. `.env.local` apunta a producción: para pruebas con escritura usar exclusivamente `.ai-shared/qa/auditoria-global-2026-09-22/entorno-local.ps1` y verificar loopback. Los commits siguen solo locales; cualquier push, merge, migración remota o despliegue requiere un encargo y control de riesgo separados. Claude no ejecutó ni revisó A15–A20 (API 429); Codex implementó y revisó estos bloques provisionalmente.
