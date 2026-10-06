# Prompt — TERMINAL C · B4 Propuestas, ola 2 (UI, PDF, envío y E2E)

Trabajas en `D:\ERP-CC` en paralelo con A (B5 orden ola 1) y B (B6 producción ola 1). Lee el protocolo, tu estado y `docs/plan-erp-sii/04-propuestas.md` §4.2, §4.5–§4.8, §4.11.

## Contexto

B4 ola 1 ya está aplicada: 9 tablas, 12 RPC, estados/frozen/revisiones/costeo/aceptación y dominio TS en `src/modulos/propuestas/**`. Faltan: UI, PDF por revisión, envío atómico y E2E.

## Migración (banda `2026100711xxxx`, `...0003+`)

- `enviar_revision(p_revision_id, p_canal, p_destino, p_actor, p_correlation_id)`: exige `READY_TO_SEND`, **PDF vigente**, canal y destino; pasa a `SENT` y **congela atómicamente** en la misma transacción.
- Ajustes que pida el PDF: índice/constraint de `propuesta_pdfs` vigente (ya existe), RPC de registro de PDF (`registrar_pdf_revision`) idempotente por `(revision_id, contenido_hash)`.
- Guarda `to_regclass` de dependencias (B4 base, `archivos`).

## PDF (ADR-SII-04)

1. **Spike corto documentado**: compara `@react-pdf/renderer` (default tentativo, Node puro) vs Chromium headless. Criterios: sin red en runtime, determinista, peso de build razonable. Registra la decisión en `docs/plan-erp-sii/04-propuestas.md` (nota ADR) o en tu estado.
2. Genera **solo** para revisiones `READY_TO_SEND` con permiso `propuesta_generar_pdf`; bucket privado `propuestas-pdf`; fila en `archivos` (`entidad='propuesta_revision'`, `clase='pdf'`) + `propuesta_pdfs` (`vigente`, único por revisión).
3. Contenido: datos comerciales de la revisión; **excluye** costo, margen, horas, ruteo y notas internas. Prueba automatizada de exclusión (el texto extraído no contiene esos campos).
4. Regenerable en DRAFT; inmutable en SENT (nueva revisión = nuevo PDF).

## UI (dueño: `src/modulos/propuestas/**`; puedes tocar solo la pestaña “Propuestas” de `src/modulos/rfq/componentes/ficha-rfq.tsx` para montarla)

- **Cola `/propuestas`** (nueva ruta, enlace en navegación): filtros por estado/cliente/responsable/próxima acción vencida; chips de estado; vista lista.
- **Ficha `/propuestas?propuesta=<id>`**: encabezado `folio_cnc` + chip; acciones de negocio arriba (Validar, Generar PDF, Enviar, Aceptar revisión, Confirmar venta, Nueva revisión con motivo, Rechazar/Cerrar); pestañas Resumen, Ítems, Ruteo/Costeo, Archivos, PDFs, Seguimiento, Actividad.
- **Editor DRAFT**: ítems (precio/artículo según permisos; ITxx visible), ruteo por ítem (setup/run/total), costos por categoría (solo `propuesta_editar_costo`), totales/IVA/margen en vivo (espejo TS), próxima acción del catálogo con `OTHER` + texto obligatorio.
- **Badge “Requiere revisión”** por ítem/revisión y bloqueo de Validar hasta confirmar ruteo/costeo.
- **Archivos**: heredados del RFQ (chip “Origen: RFQ”, sin duplicar), propios de la revisión, por ítem y PDFs por revisión con historial.
- RFQ ficha (B3): la pestaña “Propuestas” monta la lista de propuestas del RFQ (consume tu módulo; no rediseñes la ficha de B).

## Pruebas

- pgTAP: `enviar_revision` exige PDF vigente + canal + destino y congela atómicamente; PDF idempotente por hash; un solo vigente por revisión.
- Unitarias: totales/margen UI, esquemas Zod de edición, exclusión de campos internos del payload del PDF.
- E2E `tests/e2e/propuestas-flujo.spec.ts`: RFQ LISTO → crear propuesta A → editar ítems/ruteo/costeo → validar → PDF → enviar (congelado: editar falla) → seguimiento → crear B con motivo → aceptar **A** (revisión anterior) → confirmar venta. Capturas 1440/768 × claro/oscuro en `.ai-shared/qa/sii-b4-ola2/visual/`.
- Regresión: `rfq-flujo`, `aceptacion-comercial`, `actividad`.

## Errores de la ola anterior que NO debes repetir

1. **Formato numérico**: nunca `lpad(x,2,'0')` ni `to_char(x,'FM00')` para consecutivos variables; usa `CASE` y prueba 99→100→101.
2. **"Hoy" único**: usa `hoyIso()` para fechas de calendario; no `toISOString()`.
3. **Fixtures de catálogo**: no se borran (trigger `catalogo_sin_borrado`); desactiva y borra solo `versiones_catalogo`.
4. **Dependencias**: guardas `to_regclass`; orden `0610→0710→0711→0712→0715`.
5. **Migraciones**: solo PO/coordinador; sin git; `supabase.ts` con lock + marcadores.
6. **Typecheck** tras cada lote; grep de etiquetas viejas si tocas UI; pruebas mutantes con lock.

## Gates y reporte

`pnpm typecheck` · `pnpm lint` · `pnpm test` · `supabase test db` · `pnpm test:integracion` (con lock) · E2E focal+regresión (con lock) · `pnpm build`. Reporta en `estado/TERMINAL-C.md` (§7) y pide al PO aplicar tus migraciones.
