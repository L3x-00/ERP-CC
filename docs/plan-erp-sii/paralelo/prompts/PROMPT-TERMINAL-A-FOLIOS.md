# Prompt — TERMINAL A · Continuidad administrativa de folios (cierre B3.5)

Trabajas en `D:\ERP-CC` en paralelo con B (B3 ola 2) y C (B4 propuestas ola 1). Lee `docs/plan-erp-sii/paralelo/PROTOCOLO-PARALELO.md`, tu estado y `docs/plan-erp-sii/03-rfq.md` §3.5.

## Contexto

- B3 ola 1 (commit `452bfcf`) creó `contadores_folio_periodico` y `generar_folio_periodico(tipo)` (`RFQ-MMYY_XX`, tope 99; en local ya está aplicada).
- La pestaña **Folios** de Configuración sigue solo con CNC (contador 4 dígitos histórico, `contador_folios` + `ajustar/consultar_continuidad_folio_cnc`).
- Tu tarea es generalizar la **continuidad administrativa** a los tipos nuevos **sin tocar CNC**.

## Migración (banda propia `2026100715xxxx`)

`supabase/migrations/20261007150001_sii_b3_continuidad_folios.sql` (créala a mano, no `migration new`):

```sql
DO $$ BEGIN
  IF to_regclass('public.contadores_folio_periodico') IS NULL THEN
    RAISE EXCEPTION 'Dependencia faltante: aplicar 20261007100001_sii_b3_folio_periodico antes';
  END IF;
END $$;
```

- `consultar_continuidad_folio_periodico(p_tipo text, p_actor_id uuid)` → `(periodo text, ultimo_contador integer, ultimo_emitido integer, siguiente integer)`:
  - Valida actor activo con permiso `configuracion` (error `sin_permiso_configuracion`, 42501).
  - Tipos permitidos: `RFQ`, `O`, `OI`, `NE`, `RP`, `CG` (error `tipo_folio_invalido`). CNC queda fuera (su RPC existente no se toca).
  - `ultimo_contador`: de `contadores_folio_periodico` para el periodo actual.
  - `ultimo_emitido` real: para **RFQ**, el máximo consecutivo de `pipeline.folio_rfq` del periodo (`RFQ-MMYY_XX`); para tipos sin tabla aún, `NULL` (documentado: se amplía en su bloque).
  - `siguiente = greatest(coalesce(ultimo_contador,0), coalesce(ultimo_emitido,0)) + 1` (NULL si supera 99).
- `ajustar_continuidad_folio_periodico(p_tipo text, p_periodo text, p_ultimo integer, p_actor_id uuid)`:
  - Valida actor/permiso, tipo, periodo `^(0[1-9]|1[0-2])[0-9]{2}$`, rango `0..99`.
  - **Nunca retrocede** por debajo del máximo real emitido (error `folio_no_puede_retroceder`, 23514) ni del contador vigente; upsert en `contadores_folio_periodico`.
- `SECURITY DEFINER`, `search_path=''`, `REVOKE`/`GRANT` solo `service_role`, `COMMENT ON`.

## Código (dueño: tú)

- `src/modulos/configuracion/acciones/continuidad-folios-periodico.ts` (acciones con Zod + `can(usuario,'configuracion')` + admin + `registrarLog` + `nuevoCorrelationId()`); no modifiques las acciones CNC existentes salvo importarlas.
- `src/modulos/configuracion/componentes/pestana-folios.tsx`: agrega sección “Folios por periodo” con selector de tipo, periodo, último reservado, siguiente y guardado con confirmación. **Conserva el bloque CNC exactamente como está** (hay E2E que lo cubre).
- `supabase.ts` con `BLOQUEO-TIPOS.lock` y marcadores §4bis (tu marcador nuevo: `ajustar_continuidad_folio_periodico:`).

## Pruebas

- pgTAP `supabase/tests/sii_b3_continuidad_folios.test.sql`: privilegios, permisos, tipo/periodo inválidos, tope 99, no retroceso (incluye un `folio_rfq` emitido real que impide bajar), upsert idempotente.
- Unitarias de validaciones período/rango y mapeo de tipos.
- E2E `tests/e2e/continuidad-folios-rfq.spec.ts` (o amplía el existente de folios): admin ajusta el periodo vigente de RFQ, ve el siguiente; intenta retroceder y recibe error; capturas 1440/768 × claro/oscuro en `.ai-shared/qa/sii-b3-folios/visual/`.
- Regresión: `continuidad-folios-configuracion.spec.ts` y `configuracion-flujo.spec.ts` verdes.

## Errores de la ola anterior que NO debes repetir

1. **Dependencias de migración**: si tu migración referencia tablas de otro stream, agrega la guarda `to_regclass` con mensaje de orden (como arriba). B3 falló en remoto por aplicar `0710*` antes de `0610*`.
2. **`supabase.ts`**: usa el lock; después de guardar verifica los marcadores de **todos** los streams (§4bis); si falta el de otro, repórtalo, no lo edites.
3. **Ediciones masivas**: tras cualquier lote, corre `pnpm typecheck` de inmediato (el retrofit insertó una línea dentro de una firma y rompió 9 errores).
4. **Etiquetas/testids cambiados**: antes de reportar, grep de textos viejos en `tests/` y actualiza lo que corresponda.
5. **Migraciones**: solo las aplica el PO/coordinador; tú nunca. Sin git.
6. **Pruebas mutantes**: con `BLOQUEO-PRUEBAS.lock`; no toques archivos de B/C.

## Gates y reporte

`pnpm typecheck` · `pnpm lint` · `pnpm test` · `supabase test db` · `pnpm test:integracion` (con lock) · E2E focal+regresión (con lock) · `pnpm build`. Reporta en `estado/TERMINAL-A.md` (formato §7) y pide al PO aplicar `2026100715*` (local lo destraba el coordinador con `--include-all` si el orden remoto lo bloquea).
