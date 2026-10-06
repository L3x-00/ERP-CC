# Estado COORDINADOR — Integración y custodia

> Append-only. El coordinador mantiene aquí el control del trabajo paralelo.

## 2026-10-05 — Arranque del modo paralelo

- **E1 (B1.1/B1.2)**: verificado y commiteado `7f97714`. pgTAP 402/402, integración 223/223, E2E 40/40, unit 770/770, visual 4/4.
- **E3 (B1.9 archivos)**: verificado y commiteado `72d1765`. pgTAP 413/413, integración 223/223, E2E 41/41 (incluye `archivos-cliente.spec.ts`), unit 778/778. Migración `20261005100003` aplicada en local; pendiente que el PO la aplique en remoto cuando autorice.
- **Ajustes de tests por E3**: `ar-movimientos` usa razón social única; `usuario-inactivo-rls` sube fixture PDF (los límites MIME del bucket ya aplican); `subir-documento-orden` ahora registra metadata.
- **Streams lanzados**: A (E2 catálogos `2026100610xxxx`), B (E4 actividad `2026100620xxxx`), C (B2 clientes `2026100630xxxx`).
- **Zonas de coordinación activas**: `supabase.ts` (bloqueo de tipos), pruebas mutantes/E2E (bloqueo de pruebas), migraciones (las aplica el PO).
- **Fuera de los streams** (coordinador): retrofit de `correlationId` en acciones de todos los módulos, pipeline/B3 en adelante, limpieza de `clientes-contactos` si C cambia el flujo, commits e integración.
- **Bloqueos actuales**: ninguno.
- **Siguiente**: vigilar estado de A/B/C, resolver peticiones de zonas compartidas, verificar y commitear cada sub-bloque terminado.
- **Verificación**: checklist y línea base en `paralelo/VERIFICACION-COORDINADOR.md`; Auditoría 0 = CONFORME (árbol limpio, sin cambios aún).

## 2026-10-05 — Auditorías 1 y 2; cierre de olas y nuevos prompts

- Auditoría 1: bloque de tipos de B pisado en `supabase.ts` → restaurado por el coordinador; protocolo §4bis (marcadores) añadido.
- Auditoría 2: E4/B verificado (pgTAP 27/27); E2/A y B2/C no estaban aplicadas en local (C solo en remoto) → coordinador aplicó con `supabase migration up --local --include-all`; pgTAP global 29 archivos / 555 PASS. Protocolo §1.2 (verificación de aplicación) y §1.1 (bandas por bloque) añadidos.
- Coordinador: `clientes-folios-concurrencia.test.ts` agregado a `test:concurrencia` (package.json).
- Nuevos prompts emitidos: A cierre E2 + retrofit de correlación; B B3 RFQ ola 1 (`2026100710*`); C cierre B2.
- Pendiente coordinador: cross-review y commit de E4/B; commit de E2/A y B2/C cuando reporten cierre; aplicar regla de bandas y vigilancia de marcadores en cada guardado de `supabase.ts`.

### Cierre de la ola paralela — 2026-10-05

- Verificación final combinada: typecheck 0 · lint 0 · build OK · pgTAP 611/611 · unit 862/862 · integración 226/226 · E2E 44/45 con el fallo corregido (spec `comercial-realtime` re-ejecutado 1/1).
- Defectos corregidos por el coordinador: `registrar-consumo.ts` (sintaxis) y `comercial-realtime.spec.ts` (baja lógica de contactos).
- Commits: `452bfcf` B · `d10ecf5` A · `b98a56a` C · `7887e31` fix · `f37b036` docs · `b3fad90` unitarias RFQ.
- Pendiente PO: aplicar en remoto A `2026100610*` y B3 `2026100710*` (en ese orden; re-ejecutar 0002/0003 tras A). **Resuelto: el PO confirmó migraciones aplicadas.**

## 2026-10-06 — Siguiente ola emitida

- Prompts: A `PROMPT-TERMINAL-A-FOLIOS.md` (continuidad de folios, banda `2026100715*`), B `PROMPT-TERMINAL-B-B3-OLA2.md` (UI RFQ + consumidores `etapa` + archivos + gate + retiro del puente, banda `2026100710*` 0004+), C `PROMPT-TERMINAL-C-B4-OLA1.md` (B4 propuestas ola 1 modelo/RPC/tests, banda `2026100711*`).
- Protocolo actualizado: bandas, transferencias (B toma consumidores de `etapa` en clientes y `comercial-realtime`), marcadores nuevos y §4ter con las lecciones obligatorias de la ola anterior.
- Dependencias de orden a vigilar: `0610*` (A) → `0710*` (B3) → `0711*` (B4). Cada migración nueva lleva guarda `to_regclass`.

## 2026-10-06 — Cierre de la ola 3 y siguiente asignación

- Cerrado y commiteado: folios (A) `c161b1a` · B4 ola 1 (C) `6b0c524` · B3 ola 2 (B) `a0cd4f3` · fixes coordinador `a7e87c5`.
- Verificación final: typecheck/lint/build 0 · pgTAP 744/744 · unit 886/886 · integración 226/226 · E2E 46/46 (+1 condicional).
- Fixes del coordinador: scoping pgTAP de catálogos, limpieza de fixtures E2E por desactivación, desborde/relleno de folio (999), `hoyIso` unificado en Planeación.
- Migraciones para el PO: `20261007100004/5` (B), `0006/7/8` (fixes folio), `20261007110001/2` (C), `20261007150001` (A) en ese orden.
- Siguiente ola emitida: A → B5 ola 1 (`0712*`) + rango folios 999; B → B6 ola 1 (`0713*`, modelo sin UI); C → B4 ola 2 (`0711*` 0003+, UI/PDF/envío/E2E). Prompts en `paralelo/prompts/`.

### Cierre de la ola 4 y nueva asignación — 2026-10-06

- Commits: B5 ola 1 `7aaee76` · B6 ola 1 `247fe31` · B4 ola 2 `5aa3ca9` · fixes `d91fdc8`.
- Auditoría 7: corregidos el puente `estado_sii` en INSERT, la próxima acción en READY_TO_SEND y specs frágiles (paginación, Realtime, selectores estrictos). Gates: pgTAP 912/912, unit 916/916, integración 226/226, typecheck/lint/build 0; specs E2E afectados verdes en focal; suite completa local pendiente de `db reset` autorizado.
- Migraciones para el PO: `0711 0003/0004`, `0712 0001/0002/0003`, `0713 0001/0002`, `0715 0002`.
- Nueva ola: A → B5 ola 2 (UI órdenes/consumidores, `0712*` 0004+); B → B6 ola 2 (UI piso/calidad/checklist real, `0713*` 0003+); C → B7 ola 1 (entregas modelo, `0714*`). Prompts en `paralelo/prompts/`.

### Cierre ola 5 (parcial) — 2026-10-06

- B (B6 ola 2) `78933f0` y C (B7 ola 1) `b4c4487` verificados y commiteados; fixes de auditoría `ad2d8ad`.
- Gates: pgTAP 968/968 · unit 932/932 · typecheck/lint/build 0 · integración 226/227 (1 flake ambiental de concurrencia PIN, pasa aislado).
- A (B5 ola 2) sin cerrar: artefactos completos, terminal atascada desde ~09:57 (¿E2E/build largo?); migración `20261007120004` aplicada en local por el coordinador; pgTAP verde. Pendiente que A reporte o se reinicie.
- Migraciones para el PO: `20261007120004` (A, tras su cierre) y `20261007140001` (C).
- Decisiones pendientes: colisión potencial `NE-M MYY_XX-YY` entre O y OI; autorización de `supabase db reset` local.

### Cierre B5 ola 2 verificado — 2026-10-06

- El PO pidió retomar el cierre; la terminal A estaba atascada con artefactos completos. Durante la verificación se detectó y detuvo (por indicación del PO) una sesión paralela que corría el mismo E2E, para evitar doble mutación de la base local.
- Defectos corregidos por el coordinador:
  1. `prefer-const` en `ordenes-estados-sii.spec.ts`.
  2. Flake horario del pgTAP B6: con la ventana de 5 h el descuento de comida (12:00–13:00 Tijuana) dejaba `horas_netas = 4` justo cuando la corrida cae entre 13:00 y 17:00; se usa 6 h (neto ≥ 5 > jornada 4) y queda determinista (`sii_b6_produccion.test.sql`).
  3. E2E B5: la entrega total archiva la orden (OBS-21), por lo que el cierre administrativo se ejecuta desde la bandeja **Archivo**; la TI no lleva cliente y se identifica por el folio `OI-` del mensaje de alta.
  4. Specs heredados al badge SII: `ordenes-heredadas-reactivacion` ahora espera `Planificada`/`Producción completada`/`En producción`.
- Gates: typecheck 0 · lint 0 · unit 932/932 · pgTAP **968/968** · integración 226/227 (PIN pasa aislado 8.6 s) · E2E focal B5 1/1 + regresión 10/10 · build OK · capturas 4/4.
- Migración para el PO: `20261007120004` (aplicada solo local) y `20261007120005` (fix SECURITY DEFINER de triggers de avance, aportada por la sesión paralela; aplicada solo local).
- Pendiente: commit del cierre de B5 ola 2; después B7 ola 2 (UI `/entregas`, firma/evidencia y E2E).

### Cierre B7 ola 2 verificado — 2026-10-06

- Implementado por el coordinador (sesión paralela ya detenida): cola `/entregas` con pendientes por orden (ITxx) y notas registradas con filtros; panel de preparación con cantidades por partida, contacto y quién recibe; detalle con evidencia fotográfica, firma digital en canvas y firma escaneada versionada; enlace desde la ficha de orden y entrada en el menú.
- Gates: typecheck 0 · lint 0 · unit **935/935** · pgTAP **968/968** · E2E focal `entregas-flujo` **1/1** · regresión producción/cobranza **7/7** · build OK · capturas **8/8** en `.ai-shared/qa/sii-b7-ola2/visual/`.
- Defectos ambientales endurecidos en pgTAP (sin cambios de producto):
  1. `sii_b3_continuidad_folios`: neutraliza también contador y folios `O`/`OI` del periodo vigente (la base local acumula órdenes reales de E2E).
  2. `sii_b3_rfq_consumidores`: el corte de equipo se evalúa en ventana futura aislada (mismo criterio que el ejecutivo).
  3. `sii_b6_produccion`: finaliza sesiones activas ajenas dentro de la transacción antes de `cerrar_jornada`.
- Sin migración nueva (reusa `20261007140001`). Pendiente: commit del cierre de B7 ola 2.

### B8 Finanzas — diseño validado y F1 cerrada localmente — 2026-10-06

- El PO validó los criterios §8.4: conservar AR D-04 + vincular factura; gastos nuevos `CG-MMYY_####`; promesas **con recordatorios**; y autorizó F1.
- F1 (folio `RP-MMYY_XX-YY`, espejo del NE) implementada: `20261007160001` + `20261007160002` (limpieza de índice redundante), sin cambios de firma ni de idempotencia.
- Gates: typecheck 0 · lint 0 · unit 935/935 · pgTAP **980/980** (nuevo `sii_b8_folio_recibo` 12/12) · E2E `cobranza-folio-rp` 1/1 + regresión cobranza 5/5 · build OK · capturas 2/2.
- Decisiones registradas en `.ai-shared/memory/decisions/ADR-SII-B8-FINANZAS-20261006.md`.
- Pendiente: commit de cierre B8-F1; F2–F5 esperan autorización por fase.

### B8 Finanzas — F2 facturación cerrada localmente — 2026-10-06

- El PO autorizó F2 y validó el diseño: montos precargados/editables, una factura por entrega, emitir vincula la AR y cancelar desvincula (re-factura permitida).
- Implementado: `20261007170001` (tabla `facturas`, `cuentas_por_cobrar.factura_id`, RPC crear/editar/emitir/cancelar), `/facturacion` con cola y panel, enlace desde el detalle de entrega y menú.
- Gates: typecheck 0 · lint 0 · unit 940/940 · pgTAP **999/999** (`sii_b8_facturacion` 19/19) · E2E facturación 1/1 + regresión 4/4 · build OK · capturas 4/4.
- Pendiente: commit de cierre B8-F2; aplicar `20261007170001` en remoto (tras `20261007160002`).

### B8 Finanzas — F3 cobros repartidos y promesas cerrada localmente — 2026-10-06

- El PO autorizó F3 y validó: recibo multi-factura, folio `RP-MMYY_0000-YY`, recordatorios 2 días antes y al vencer, y cumplimiento automático.
- Implementado: `20261007180001`–`0005` (aplicaciones N:M con backfill, reverso por aplicaciones, cobro múltiple, promesas + procesador de recordatorios compatible con `notificaciones_usuario`, literales de F1 corregidos) y UI `/cobranza` (cobro múltiple + promesa).
- Gates: typecheck 0 · lint 0 · unit 944/944 · pgTAP **1026/1026** (`sii_b8_cobros_promesas` 27/27) · E2E F3 1/1 + regresión 5/5 · build OK · capturas 2/2.
- Pendiente: commit de cierre B8-F3; aplicar `20261007180001`–`0005` en remoto (tras `20261007170001`).
