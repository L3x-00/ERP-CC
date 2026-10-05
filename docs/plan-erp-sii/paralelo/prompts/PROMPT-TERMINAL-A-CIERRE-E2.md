# Prompt — TERMINAL A · Cierre de E2 (catálogos) y fase 2: retrofit de correlación

Trabajas en `D:\ERP-CC` en paralelo con B y C. Lee `docs/plan-erp-sii/paralelo/PROTOCOLO-PARALELO.md` y tu estado `estado/TERMINAL-A.md`.

## Contexto verificado por el coordinador

- Tus migraciones `20261006100001` y `20261006100002` **ya están aplicadas en local** y `sii_b1_catalogos.test.sql` pasa (40/40); pgTAP global 555/555 PASS.
- En **remoto** las aplicará el PO cuando autorice (no las apliques tú).
- El typecheck global quedó en 0 tras cerrar C su código.

## Fase 1 — Cierre de E2 (hazlo primero)

1. Verifica: `supabase migration list --local` (tus 2 migraciones aplicadas) y `supabase test db` (todo verde).
2. Con `BLOQUEO-PRUEBAS.lock` (protocolo §5):
   - `pnpm test:integracion`
   - `pnpm exec playwright test tests/e2e/catalogos-base.spec.ts tests/e2e/catalogos-comerciales.spec.ts tests/e2e/configuracion-flujo.spec.ts tests/e2e/continuidad-folios-configuracion.spec.ts`
3. Capturas visuales 1440/768 × claro/oscuro en `.ai-shared/qa/sii-b1-e2/visual/` (usa tu propio spec o un script; no commitees binarios).
4. `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` (reporta cualquier error ajeno sin tocarlo).
5. Actualiza `estado/TERMINAL-A.md` con la entrada final (formato §7) y **reporta para cross-review/commit**. No hagas git.

## Fase 2 — Retrofit de `correlationId` en tus módulos (tras cerrar la fase 1)

Objetivo: que cada acción de negocio de los módulos asignados genere **un** `nuevoCorrelationId()` y lo pase a **todas** sus llamadas a `registrarLog` (regla: eventos de la misma acción comparten id).

- Módulos asignados: `src/modulos/ordenes/**`, `src/modulos/planeacion/**`, `src/modulos/produccion/**`, `src/modulos/cobranza/**`, `src/modulos/gastos/**`, `src/modulos/inventario/**`, `src/modulos/configuracion/acciones/**` (excepto los archivos `catalogos-base*` que ya son tuyos), `src/modulos/comentarios/**`, `src/modulos/dashboard/**` (solo si registra logs).
- **Excluidos** (congelados u otros streams): `src/modulos/permisos/**`, `src/nucleo/almacenamiento/archivos/**`, `src/modulos/clientes/**`, `src/modulos/catalogos/**`, `src/modulos/auditoria/**`, `src/nucleo/auditoria/registrar-log.ts`, `src/modulos/pipeline/**` (lo está tocando B en B3).
- Reglas: cambio mínimo (generar id + pasarlo como 6.º argumento); no cambies lógica de negocio ni firmas de RPC; no toques `supabase.ts` para esto; unitarias y lint de lo tocado.
- Mide el avance por módulo en tu estado. Si un archivo tuyo ya tiene `correlationId`, consérvalo.

## Gates y reporte

Aplica los gates del protocolo §7 y registra en tu estado: archivos, comandos, resultados, bloqueos. Si algo falla fuera de tu alcance, repórtalo; no lo arregles.

## Exclusiones

No UI nueva, no migraciones nuevas, no git, no migraciones remotas, no archivos de B/C.
