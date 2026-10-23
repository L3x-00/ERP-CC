# CHECKPOINT DE EJECUCIÓN — correcciones del cliente (Órdenes C8 · Planeación C9 · Finanzas C10)

> **Archivo vivo.** Quien reanude (otra IA o persona) lee **solo este archivo**, `PLAN-REVISADO-RESPUESTAS-2026-10-15.md` (§2 y §3) y la ficha de la tanda activa (`fichas-de-tanda/`). No hace falta releer investigación, planes ni historial. Reglas fijas resumidas en §5; detalle en `LEEME-EJECUCION.md`.
> **Última actualización:** 19/10/2026 · C10.3 fusionada (**PR #81**, merge `68d94b9`) y migración `20261019150000` aplicada en remoto; C10.4 (aceptación y registro) FUSIONADA (**PR #82**, merge `77339e6`), sin migración; CI verde run `39199986179` sobre `9cefb14`. PR #83 (solo docs postmerge) CI verde `39202000054` sobre `4f08783`, fusionado. **UI Planeación en PR #84**, sin migración: filtros/paneles colapsables y calendario compacto; CI verde run `39213114658` sobre `ea06ccf`, listo para fusionar.

> **Demo local (19/10/2026):** base reiniciada y resembrada sin datos basura; 7 usuarios demo/5 roles, 8 clientes, 10 oportunidades, 13 órdenes, 3 propuestas con costeo, 4 compras, 2 facturas y tesorería completa. Scripts `supabase/semillas/demo-cliente.mjs` + `demo-finanzas-c10.mjs`; credenciales/comandos en `supabase/semillas/README.md`; dumps previos en `.ai-shared/backups/`. Solo local; remoto intacto. PR #85 con CI verde `39232496564` sobre `4d2529c`.

> **Demo remota (19/10/2026):** proyecto `pwnecbcynnqnvfwmvrnn` respaldado, 72 tablas transaccionales truncadas y demo completa sembrada (8 usuarios/5 roles, 13 órdenes, 17 partidas, 3 propuestas, 4 compras, 2 facturas, 6 CxC, 5 cobros, 10 gastos y tesorería). `ales@gmail.com` preservado; `ales_2_@hotmail.com` con `Demo2026!`; login y 6 módulos verificados. Scripts con modo remoto explícito; PR #86.

## 1. Estado en una línea
C8.3b (#68), C8.3c (#69), C8.4 (#70), C8.5 (#71), C9.0 (#72), C9.1 (#73), **C9.2 (#74), C9.3 (#75), C9.4 (#76), C8.6 (#77), C10.1 (#78), C10.2 (#79), C10.2b (#80) y C10.3 (#81, merge `68d94b9`) están FUSIONADAS**. **C10.4 «Aceptación de punta a punta y registro» está FUSIONADA** (#82, merge `77339e6`) desde `origin/main == 68d94b9`, **sin migración**. E2E de aceptación 1/1, Vitest focal 19/19, pgTAP focal 99/99, CI verde run `39199986179` sobre `9cefb14` y documentación de cierre. No hay migraciones pendientes de Finanzas.

## 2. Autorizaciones del PO (vigentes; no ampliar por cuenta propia)
| Fecha | Autorización |
|---|---|
| 2026-10-15 | C8.1, C8.2 y C8.2b ejecutadas y fusionadas. |
| 2026-10-15 | **D1–D5 aprobadas «de la forma más recomendable y viable»** y «empieza con la tanda que sigue» (C8.3). Cada tanda siguiente del orden recomendado queda autorizada; el PO fusiona cada PR antes de la siguiente. C9.0 exige ficha de diseño antes de codificar. |
| 2026-10-15 | C8.3b autorizada explícitamente (encargo de Codex, rama `feat/ordenes-archivos-vivos-hoja-trabajo`). |
| 2026-10-17 | **C9.0 con ficha de diseño aprobada sin objeciones (D-1..D-4).** Tras su merge: seguir **C9.1** y después C9.2–C9.4 («debemos cumplir lo que pide el cliente»). |
| 2026-10-17 | El PO instruye que Codex retome todo el desarrollo sin Claude Code y que omita para sí los umbrales de `checkpoint.mjs`; Codex se rige únicamente por sus límites propios. |
| — | Nunca mergear (lo hace el PO); nada remoto (`supabase db push/repair`); las migraciones las aplica el PO. |

**Control de uso:** los umbrales de `checkpoint.mjs` pertenecen al flujo anterior de Claude y no detienen a Codex. Codex continúa según sus límites propios de uso y mantiene este checkpoint actualizado en los hitos normales de la tanda.

## 3. Tandas (orden recomendado; C8.3 se parte en tres PR)
| # | Tanda | Estado |
|---|---|---|
| 1–3 | C8.1, C8.2, C8.2b | ✅ fusionadas |
| 4a | **C8.3a** permiso `orden_ver_totales` + R07 procesos + R08 ruta en tabla + R18 columnas explícitas | ✅ fusionada (#67); migración aplicada en remoto por el PO |
| 4b | **C8.3b** R09 Archivos vivos (O-12) + R17 hoja de trabajo en la ficha (sin precios, observaciones de ítem + orden) | ✅ fusionada (#68, `ce0d3c3`) |
| 4c | C8.3c hoja de trabajo del **operador** en Producción con PIN (O-05 C) | ✅ fusionada (#69, 2026-10-16, merge `e4925d9`) |
| 5 | C8.4 Entrega/cierre (O-08 No, SQL) + Dashboard atrasadas (SQL) | ✅ fusionada (#70, 2026-10-17, merge `bb8bc2d`) |
| 6 | C8.5 Eventos de negocio de la Orden (O-13, SQL) | ✅ fusionada (#71, 2026-10-17, merge `a2b5a81`) |
| 7 | C9.0 Programar por operación (P-01 B, SQL) — ficha de diseño primero | ✅ fusionada (#72, merge `75fec017`); migración `20261017130000` aplicada en remoto |
| 8 | C9.1 Capacidad como dato central: carga semanal, semáforo accesible y bloque con contexto | ✅ fusionada (#73, merge `0c8b357`); sin migraciones |
| 9 | **C9.2** Pendientes visibles + recurso compatible (P-04 impedir, SQL) + aviso de sobrecapacidad | ✅ fusionada: PR #74, merge `61f4acf`; migración `20261017140000` aplicada en remoto por el PO |
| 10 | **C9.3** Horas reales ajustan capacidad (P-03 B), liberación formal e historial | ✅ fusionada: PR #75, merge `7793479`; migración aplicada en remoto por el PO |
| 11 | **C9.4** Estados simples, Producción consume sin recaptura y contratos con Órdenes | ✅ fusionada (#76, `f17b319`); sin migración |
| 12 | **C8.6** Nueva orden basada en la anterior (O-03 B, SQL) | ✅ fusionada (#77, `c2f8b422`); migración remota pendiente de confirmación del PO |
| 13 | **C10.1** Costo sin IVA y Compras como fuente (F-11/F-09/F-06/F-07/F-08, 2 SQL) | ✅ fusionada (#78, merge `578dca2`); migraciones `20261018220000` + `20261018230000` aplicadas en remoto |
| 14 | **C10.2** Conciliación Estimado/Comprometido/Real + pestaña Costos (F-01/F-02/F-04/F-05/F-07, 1 SQL) | ✅ fusionada (#79, merge `d248521`); migración `20261019090000` aplicada en remoto por el PO |
| 15 | **C10.2b** Factura por entrega (F-03 A, riesgo alto) | ✅ fusionada (#80, merge `83b9e35`); migración `20261019120000` aplicada en remoto |
| 16 | **C10.3** Facturación/Cobranza, flujo en Tesorería, reversos y guardarraíles (F-12/F-13/F-14/F-15, 1 SQL) | ✅ fusionada (#81, merge `68d94b9`); migración `20261019150000` aplicada en remoto |
| 17 | **C10.4** Aceptación punta a punta y registro (F10 parcial, F17–F20) | ✅ fusionada (#82, merge `77339e6`); sin migración; CI verde `39199986179` |

## 4. ÚLTIMA TANDA — C10.4 «Aceptación de punta a punta y registro» (fusionada)

No hay tanda activa: Finanzas C10 está cerrado. C10.4 quedó fusionada en #82; se conserva este digest para auditoría y para futuras correcciones.

Rama `feat/finanzas-c10-4-aceptacion-punta-a-punta` desde `origin/main == 68d94b9` (merge de C10.3), **PR #82 fusionada (merge `77339e6`)**. **Sin migración** y sin cambio funcional.

**Qué hace:** un único E2E de aceptación (`tests/e2e/finanzas-conciliacion-orden.spec.ts`) siembra por service_role una Orden con Propuesta, compra de material recibida, consumo real y gasto directo; la UI solo selecciona la Orden desde Gastos y lee la tabla. Responde: estimado `$7,800.00`, comprometido `$4,000.00`, real `$5,650.00`, margen estimado `61.0 %` y real `71.8 %`, con Fuente `Compra · Consumo` y `Gasto`.

**Decisiones y desviaciones:** F10 queda **parcial** (ajuste manual autorizado diferido; la tabla lo declara). F17/F18 se citan ejecutadas: `tesoreria-saldos`, `sii_b8_tesoreria` y `f15`. F19: confidencialidad y contratos verdes; horas reales pausada/finalizada; la coherencia dedicada con C9.3 queda **pendiente de C9.3** sin marcar. F20: registro documental. No se crea DC nueva; los refinamientos van en `DECISIONES-ACEPTADAS.md`.

**Evidencia:** Vitest focal 19/19 (`tesoreria-saldos`, `gastos-conciliacion`, `ordenes-confidencialidad-c4-3`, `ficha-orden-c4-2`); pgTAP focal 99/99 (`f15`, `sii_b8_tesoreria`, `f03`); typecheck y ESLint focales; E2E aceptación 1/1 + tesorería 1/1 en loopback; `finanzas-conciliacion-orden` con captura `c10-4-aceptacion.png`. C10.3 conserva su evidencia: `sii_b8_facturacion` 41/41, `f15` 14/14, 230/1878 unitarias, build, pgTAP 78/1819 y E2E 4/4; CI `39195341121`.

**Marcas y reservas:** reservadas por el plan `20261015100000`, `20261015110000`, `20261015120000`; usadas `20261018220000`, `20261018230000`, `20261019090000`, `20261019120000`, `20261019150000`; reservas de Órdenes `20261015120000`, `20261015130000`, `20261015140000`; `orden_ver_totales` no cambia el gate `ver_finanzas`.

**Siguiente paso exacto:** C10.4 fusionada; Finanzas C10 queda cerrado. La aceptación del cliente/PO y cualquier corrección futura parten de `origin/main` en rama nueva. No hay migraciones pendientes.

### Referencia: C8.6 (FUSIONADA, PR #77, merge `c2f8b422`)
Nueva OP técnica desde una actual finalizada, sin precio ni CxC; CI verde run `39169988253` sobre `ff05149`. Su migración `20261018211523_c8_6_orden_basada_anterior.sql` fue aplicada solo en local y espera confirmación del PO en remoto.

### Referencia: C9.2 «Pendientes visibles, recurso compatible y aviso de sobrecapacidad» — PR #74 (FUSIONADA)
Rama `feat/planeacion-c9-2-programar-compatibilidad` desde `main == 0c8b357`. Commits: `79bbab2` (código + pruebas + migración) y `a6439b9` (CUELLOS). Migración `20261017140000_c9_2_recurso_incompatible.sql` **aplicada solo en local** (el PO la aplica en remoto tras el merge).

**Alcance (ficha `fichas-de-tanda/C9.2-…`; donde difiera mandan las respuestas del cliente, PLAN-REVISADO 2026-10-15):** selector de partidas con tope 300 + aviso «Mostrando N de M partidas», marca « (N programada(s))» y sugerencia de secuencia (`utilidades/partidas-programables.ts`); selector de recursos con los compatibles primero («codigo · nombre — Grupo» y «(otro grupo)») vía `utilidades/compatibilidad.ts` + `servicios/compatibilidad-servicio.ts`; **P-04 «impedir»**: candado `privado.recurso_compatible_con_partida` (espejo de la utilidad; «sin dato» nunca bloquea; respaldo por `partidas.maquina_asignada`) + error `recurso_incompatible` en `programar_partida_recurso` y `reprogramar_partida_recurso` (misma firma/GRANT), con Guardar deshabilitado y aviso en el panel; P09: «Excede la capacidad por X h (p/c h)» + estado «Verificando capacidad…» (Guardar sigue habilitado: la RPC es la autoridad, P-02 A).

**Pruebas:** unitarias nuevas de compatibilidad y partidas programables + flip del panel; suite completa 223 archivos / 1820; pgTAP nuevo 31/31 (candado 23505, compromiso inmutable y compatibilidad 22-31 con rol `service_role`) + regresiones c9_0/c4_2/sii_b6/a20_prd09; E2E focal 5/5; gates completos `-Pgtap` OK (pgTAP completo 71 archivos / 1627, tolerado `b4_folio_desborde_check`).

**Falta:**
1. ✅ CI verde del head `a6439b9` (run 39073555705; jobs `verificacion` y `e2e-local`).
2. ✅ Merge del PO `61f4acf` + migración `20261017140000` aplicada en remoto (confirmado por el PO el 2026-10-17).
3. Validación funcional en producción aún pertenece al PO; C9.3 ya inició desde el merge.

**Hallazgos/decisiones a declarar en el PR:** (a) P-04 impedir con migración (la ficha conservaba el default «advertir»; manda la respuesta registrada). (b) **DP-07:** confirmar con el PO que `20261012110000_b1_proceso_grupo_equipo.sql` está aplicada en remoto (C9.2 usa `grupo_equipo_id`). (c) Hallazgo abierto: con `cantidad_equipos > 1`, el candado por recurso permite activar en simultáneo varias máquinas del mismo grupo por partida (hoy sí, a propósito: decidir si se desea).

### Referencia: C9.1 (FUSIONADA, PR #73, merge `0c8b357`)
Carga semanal (matriz Equipo × días), semáforo accesible de 3 niveles (el 100 % exacto = «Cerca del límite») y tarjeta con Ítem de catálogo → resumen rápido → «Abrir orden»; sin migraciones.

### Referencia: C8.5 (FUSIONADA, PR #71, merge `a2b5a81`)
Eventos de negocio del ciclo de la orden (O-13); migración `20261017120000_c8_5_eventos_negocio_orden.sql` (aplicación remota a confirmar con el PO).

### Referencia: C8.4 (FUSIONADA, PR #70, merge `bb8bc2d`)
La entrega exige producción completada; el atraso se mide contra el compromiso comercial; migración `20261017100001_c8_4_entrega_completada_y_puntualidad_comercial.sql` (aplicación remota a confirmar con el PO).

### Referencia: C8.3c (FUSIONADA, PR #69, merge `e4925d9`)
Hoja de trabajo de piso sin precios para el operador con PIN (O-05 C), sin SQL.

### Referencia: C8.3b (FUSIONADA, PR #68, merge `ce0d3c3`)
`derivar-archivos-ficha.ts` + `archivos-ficha-servicio.ts` (tabla Archivo | Origen | Asociado a | Tipo; no vigentes/retirados ocultos; «No disponible»), `obtenerUrlArchivoFichaAccion` (`can(orden_vista)` + pertenencia), `hoja-trabajo-orden-servicio.ts` (lista blanca), Documento visible siempre y Totales solo con `orden_ver_totales`. CI verde run 38824557004. Decisión abierta del PO: se ocultan archivos no vigentes además de retirados.

### Referencia: C8.3a (FUSIONADA, PR #67)
Hecho (commits `229b688`, `7bc1e98`, `73bc1ca`, `2793a53` pgTAP B7, `4f5f87c` CUELLOS): permiso `orden_ver_totales` (migración `20261015090000`, pgTAP 10/10), banderas `puedeVerTotales`/`incluirTotales`, R07 `resumirProcesos`, R08 `proyectar-snapshot-ficha.ts` + Ruta en tabla («Pendiente») para todo `orden_vista`, R18 columnas explícitas de partidas + integración c4-3 por columna.
**Efecto a conocer:** `orden_vista` para vendedor también le abre la evidencia de entrega y los archivos de la Orden (`puede_ver_archivo`); el pgTAP B7 se actualizó y el PR lo declaró. Aprendizaje en CUELLOS: tras tocar `permisos_rol`, `supabase test db` completo.

## 5. Reglas duras (resumen)
- **Ajustar, no rehacer.** Cambio mínimo; reubicar antes de retirar; español 100 %; nunca `any`; Zod para entradas; `can()` antes de mutar; hooks con alias.
- **Confidencialidad:** operadores y roles sin permiso nunca reciben precios, costos, IVA, márgenes ni totales desde el backend; lista blanca; prueba de no-fuga PRIMERO.
- **Pruebas:** solo las focales de lo editado + `pnpm typecheck` + eslint focal; `typecheck` antes de cualquier E2E; E2E solo en loopback con `& .\.claude\skills\cerrar-tanda\scripts\e2e-focal.ps1 -Specs 'a','b'` (puede añadirse `'--timeout=300000'` para specs largos con `next dev`); `.env.local` es PRODUCCIÓN: ninguna prueba mutante lo usa. Fechas relativas, PIN aleatorio, limpiar residuales. Si Docker no corre tras reiniciar el equipo: lanzar Docker Desktop y esperar a los contenedores `supabase_*_ERP-CC`. La integración exige exportar las variables loopback (`supabase status -o env`) antes de `pnpm test:integracion`, y ese script ignora el filtro de archivo tras `--` (corre toda la suite).
- **Git:** rama desde `origin/main`; `git add` por ruta (nunca `-A`); NO incluir en PRs: `docs/observaciones-cliente-2026-10-07/` salvo `DECISIONES-ACEPTADAS.md` (el resto está sin versionar), las skills nuevas, el bloque de estado de `tasks/todo.md` ni la migración `20261014110000_tarifario_unico_estacion_grupo.sql` (typo local; el PO dijo no restaurarla). Para volver a `main` con cambios locales ajenos: `git checkout -B main origin/main`.
- Migraciones solo locales (`supabase migration up --local`), idempotentes, `SECURITY DEFINER` + `search_path=''` en triggers, pgTAP con `SET LOCAL ROLE service_role` (`supabase test db <archivo>`), tipos en UTF-8 (`| Out-File -Encoding utf8`).
- Gotchas en `docs/CUELLOS-DE-BOTELLA.md`. Commits de trabajo incompleto: el mensaje dice qué falta y qué gates se corrieron.
- **Reglas críticas del cliente:** ver plan revisado §5 (no invertir compromiso → planeación → operativa; scrap ≠ entrega; Material real no suma compra + consumo; margen sin IVA; operadores sin precios; sin borrar historial financiero). Si algo las contradice, consultar antes de desarrollar.

## 6. Cómo reanudar (sin releer nada)
1. `cd D:\ERP-CC; git status; git log --oneline -5; git branch --show-current`.
2. Leer §4 de este archivo y la tanda activa; si es una tanda con ficha, solo sus rangos de evidencia.
3. Retomar en «Siguiente paso exacto»; antes, correr la caracterización del paso 0 de la tanda.
4. Al terminar un paso: commit (mensaje con «falta» y gates) → actualizar §4 → revisar los límites propios de Codex cuando corresponda.

## 7. Pendientes y decisiones abiertas (acumuladas)
- Migración `20261015090000` (orden_ver_totales): APLICADA en remoto por el PO (2026-10-15).
- Migración `20261017130000` (C9.0): aplicada en remoto por el PO tras el merge de #72. **Confirmar con el PO la aplicación remota** de `20261017100001` (C8.4) y `20261017120000` (C8.5).
- Migración `20261017140000` (C9.2): **aplicada en remoto** por el PO tras el merge de #74 (confirmado 2026-10-17).
- Migración `20261017180000` (C9.3): **aplicada en remoto** por el PO tras el merge de PR #75 (confirmado 2026-10-18).
- C9.4 no incorporó migración; su contrato SQL se verificó por pgTAP local. PR #76 fue fusionado por el PO (`f17b319`) tras CI `39146894998` verde sobre `0a0877e`.
- C8.6: PR #77 fusionada (`c2f8b422`), CI verde `39169988253`; la migración `20261018211523_c8_6_orden_basada_anterior.sql` fue solo local y su aplicación remota espera confirmación del PO.
- C10.1 FUSIONADA (**PR #78**, merge `578dca2`, CI verde `39177465745` sobre `b9c0fe1`): migraciones `20261018220000` (F11) y `20261018230000` (F06/F07/F08) **aplicadas en remoto** (confirmado por el PO el 2026-10-19). La referencia de KPI se corrigió: la definición vigente de `privado.metricas_ejecutivas_rango` está en `20261017100001` (C8.4) y la de `privado.costo_ti_rango` en `20261007120004`; `20261007210001_sii_b9_kpis.sql` solo define `obtener_kpis_sii`.
- C10.1/F08 se incluyó completo (no se difirió): columnas nullable + UI de material; no mueve inventario ni actualiza el maestro de costos. El último costo capturado en compras se muestra solo como referencia de lectura.
- C10.2 FUSIONADA (**PR #79**, merge `d248521`, CI verde `39183144852` sobre `35ff39f`): migración `20261019090000` **aplicada en remoto** (confirmado por el PO el 2026-10-19). Desviaciones conscientes de la ficha: F-01 A (material real = consumo, compra no suma), F-02 (PAGADA sin recepción no es real), F-04 (margen estimado con snapshot y real con AR), F-07 B (pestaña Costos con `ver_finanzas`).
- C10.2b FUSIONADA (**PR #80**, merge `83b9e35`, CI verde `39188094167` sobre `4b83dac`): migración `20261019120000` **aplicada en remoto** (confirmado por el PO el 2026-10-19). Sin ficha previa: el diseño deriva de PLAN-REVISADO §2 F-03 A y del corte F12 de C10.3; la ficha de trabajo está en `fichas-de-tanda/C10.2b-factura-por-entrega.md`.
- C10.3 FUSIONADA (**PR #81**, merge `68d94b9`, CI verde run `39195341121` sobre `f8642ab`): migración `20261019150000` **aplicada en remoto** por el PO. Desviaciones conscientes de la ficha: F-12 impide cancelar con cobros aplicados (la ficha conservaba D8=A), F-13 retira el flujo de Cobranza y lo reubica en Tesorería (D9=A), F-14 muestra original y reverso (D10=A). La ficha C10.3 conserva además el caso obsoleto de «segunda emisión falla»; C10.2b ya permite una factura por entrega.
- C10.4 en cierre: sin migración. E2E de aceptación 1/1, Vitest focal 19/19, pgTAP focal 99/99, typecheck/ESLint focales; F10 **parcial** (ajuste manual diferido) y C9.3 pendiente de C9.3. PR #82 con la matriz criterio→prueba→resultado.
- **DP-07:** confirmar que `20261012110000_b1_proceso_grupo_equipo.sql` (columna `grupo_equipo_id`) está aplicada en remoto: C9.2 la usa (respaldos por grupo).
- Hallazgo abierto de C9.2: `cantidad_equipos > 1` — decidir si varias máquinas del mismo grupo por partida deben poder activarse en simultáneo (hoy sí, a propósito).
- Herramientas nuevas (2026-10-15): skill `orca-ejecutar-tanda` → `scripts/{editar.mjs,checkpoint.mjs,entorno.ps1,gates.ps1}` + `lecciones.md`; `e2e-focal.ps1` acepta `-Specs a,b` y `-TimeoutMs`. Skills en `.agents/skills` (ignorado por Git) y copia en `.claude/skills`.
- Cambios locales no versionables que NO van en PR: migración `20261014110000` (typo local) y bloque de `tasks/todo.md`.
- `DocumentoOrdenBoton` queda sin uso en la UI desde C8.1 (su acción `obtenerDocumentoOrdenAccion` ya se gobierna con `orden_ver_totales`).
- Dashboard «atrasadas/por vencer» (SQL): corregido en la migración de C8.4 (`20261017100001`), fusionada en #70.
- El RBAC (matriz de permisos en Configuración) ahora lista `orden_ver_totales`; el PO puede ajustarla por rol sin tocar código.
- Incoherencia ficha vs Producción en archivos retirados/no vigentes (Producción los sigue listando): hallazgo registrado, sin tocar Producción.



## Punto de control 2026-10-22 — obs. cliente puntos 3-6 (RFQ)

- **Hecho y verificado:** #103 mergeado. #104 (resultado desde el Resumen + migración DC-09 `20261022025747`, aplicada en remoto) con CI verde. #105 (plazo comercial, rama `feat/rfq-plazo-comercial`, head `95eb9d8`, apilado sobre #104) con CI verde, run `39728936018`.
- **Pendiente del PO:** mergear #104 y luego #105; aplicar en remoto `20261022120000_rfq_plazo_comercial.sql` antes o junto con el despliegue de #105 (la ficha del RFQ lee la columna).
- **Pendiente de desarrollo:** plazo comercial en el PDF de la propuesta; revisión visual 320/1440 claro y oscuro; campo de resultado en «Finalizar captura» al reanudar una captura con acción existente.
- **Nota de árbol:** otro flujo edita `panel-acciones-propuesta.tsx` (`PanelDisponibilidadPropuesta`) y `tasks/todo.md`; commitear solo lo propio (blob + `git update-index --cacheinfo`).
- **Reanudar:** `git switch feat/rfq-plazo-comercial; gh pr view 105`; tras el merge, rama nueva desde `origin/main`.
