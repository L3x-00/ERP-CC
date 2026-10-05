# Prompt — TERMINAL C · Cierre de B2 (clientes)

Trabajas en `D:\ERP-CC` en paralelo con A y B. Lee `docs/plan-erp-sii/paralelo/PROTOCOLO-PARALELO.md` y tu estado `estado/TERMINAL-C.md`.

## Contexto verificado por el coordinador

- El remoto tenía tus 3 migraciones, pero el **local no**; el coordinador las aplicó localmente con `supabase migration up --local --include-all`:
  `20261006300001_sii_b2_cliente_folio`, `20261006300002_sii_b2_cliente_comercial_estado`, `20261006300003_sii_b2_contactos_logicos`.
- `sii_b2_clientes.test.sql` ya corre y pasa (75/75); pgTAP global 555/555 PASS.
- El coordinador agregó `tests/integracion/clientes-folios-concurrencia.test.ts` a `pnpm test:concurrencia`.

## Tareas de cierre

1. Con `BLOQUEO-PRUEBAS.lock` (protocolo §5):
   - `pnpm test:concurrencia` (incluye tu prueba de 8 folios concurrentes)
   - `pnpm test:integracion`
   - `pnpm exec playwright test tests/e2e/clientes-ficha.spec.ts tests/e2e/clientes-contactos.spec.ts tests/e2e/clientes-historial.spec.ts tests/e2e/aceptacion-comercial.spec.ts tests/e2e/archivos-cliente.spec.ts`
2. Capturas visuales 1440/768 × claro/oscuro en `.ai-shared/qa/sii-b2/visual/` usando `E2E_CAPTURAR_VISUAL=si` en tu spec (según tu diseño).
3. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build`.
4. Revisa que los ajustes fuera de tu mapa que hiciste (unitarias de pipeline `pipeline-cliente-rfq`, `pipeline-selector-cliente`) sean **solo** consecuencia de tus cambios de firma/estado y no alteren lógica de negocio; si algo es más que un ajuste de fixture, repórtalo como bloqueo.
5. Actualiza `estado/TERMINAL-C.md` con la entrada final (formato §7) y **reporta para cross-review/commit**. No hagas git.

## Criterios de cierre

- Folio CLI-#### único, atómico y no reutilizable (pgTAP + concurrencia verdes).
- Alta atómica cliente + contacto principal; un solo principal activo; baja lógica.
- Ficha con pestañas Resumen/Contactos/Comercial/Documentos/Historial; documentos versionados sobre `archivos`.
- Estado por acción auditado; sin borrado de clientes.
- E2E focal y regresión de clientes/archivos/aceptación en verde.

## Exclusiones

No UI de otros módulos, no migraciones nuevas, no git, no migraciones remotas, no archivos de A/B.
