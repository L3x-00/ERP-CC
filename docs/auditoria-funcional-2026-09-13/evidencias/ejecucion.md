# Evidencia ejecutada y límites

Fecha: 13 de septiembre de 2026. Producto auditado: `9209de8`. Los resultados locales no se presentan como ejecución real de SQL, navegador o producción.

## Pruebas ejecutadas

Comando seleccionado tras inspeccionar acceso a servicios:

```text
pnpm exec vitest run tests/unitarias tests/integracion/ordenes-acciones.test.ts tests/integracion/produccion-sesiones.test.ts tests/integracion/cobranza-acciones.test.ts tests/integracion/gastos-acciones.test.ts tests/integracion/dashboard-acciones.test.ts tests/integracion/configuracion-acciones.test.ts tests/integracion/comentarios-acciones.test.ts --reporter=json --outputFile=docs/auditoria-funcional-2026-09-13/evidencias/pruebas-locales.json
```

Resultado: **56 archivos, 427 casos aprobados = 390 unitarios + 37 casos de acciones con dependencias simuladas; cero fallidos y cero omitidos en esta selección**. El ejecutor terminó con código 0. Evidencia original: `pruebas-locales.json`; índice legible de cada nombre/resultado: `casos-locales.csv`.

| Caso ejecutado | Rol/dato ficticio | Acción y resultado observado | Límite |
|---|---|---|---|
| `tests/integracion/ordenes-acciones.test.ts:175` | Operador fixture, partida `77777777-7777-4777-8777-777777777777` | Identidad de operador coincidente registra tiempo y llama auditoría | Sesión, servicio y auditoría simulados |
| Mismo archivo, línea164 | Operador de sesión y otro ID `99999999-9999-4999-8999-999999999999` | Rechaza marca de tiempo con identidad ajena y no llama servicio | No se ejecuta asignación persistida ni control de BD |
| Mismo archivo, línea123 | Usuario sin permiso aprobar_ordenes | Cambio de estado rechazado; servicio y log no llamados | `can` simulado; no prueba la matriz de permisos remota |
| `tests/integracion/produccion-sesiones.test.ts:153` | Operador E2E; OP `33333333-3333-4333-8333-333333333333`, partida `44444444-4444-4444-8444-444444444444` | Inicio permitido con identidad HMAC simulada | Sin navegador/SQL |
| Mismo archivo, líneas176 y192 | Sesión `66666666-6666-4666-8666-666666666666` | PIN no confirmado rechaza; PIN coincidente acepta cierre y auditoría | Resultado de servicio preparado: 5 piezas, 8h brutas/7h netas; no fabricación real |
| Mismo archivo, líneas216 y229 | Gerente E2E; nota fixture `NE-001001` | Generación rechazada sin gestionar_produccion; permitida con identidad del servidor, sin precios | Prueba de acción con respuesta de servicio simulada; no documento imprimible |
| `tests/unitarias/produccion-comida.test.ts:8` | Intervalo Tijuana 08:00–16:00 del 14-08-2026 | Resultado real de función pura: 8h brutas −1h comida =7h netas | No verifica acumulación en BD ni resumen UI |
| Mismo archivo, línea17 | Intervalo 12:30–12:45 Tijuana | 0.25h brutas, 0.25h comida, 0h netas | Función pura |
| `tests/unitarias/clientes-tier.test.ts:38` | Tier manual vigente frente a consumo mayor | La regla probada hace prevalecer manual; confirma divergencia frente al máximo beneficio base | Prueba actual aprobada no implica requisito CLI-06 satisfecho |
| `tests/unitarias/gastos-rentabilidad.test.ts:56` | Material10 + scrap2, costo histórico25.5 | Costo calculado306 | No prueba consumo real ni deduplicación de gasto/material |
| `tests/integracion/cobranza-acciones.test.ts` | CxC/pagos/cliente con IDs ficticios del archivo | Se validan permisos y llamadas de pago/aplicación en seis casos | No se ejecuta transacción ni se demuestra flujo bancario real |

## Comprobaciones de entorno y pruebas excluidas

- `docker info --format '{{.ServerVersion}}'`: no pudo conectar a `dockerDesktopLinuxEngine`; no se arrancó ni reconfiguró infraestructura. No existe `supabase/config.toml` local en el árbol inspeccionado. No se verificó otro entorno aislado.
- `tests/integracion/clientes-promocion.test.ts`, `pipeline-promocion.test.ts`, `pipeline-folios-concurrencia.test.ts` e `inventario-movimientos.test.ts` leen `.env.local`, crean cliente privilegiado y escriben/eliminan fixtures. No se ejecutaron en esta auditoría.
- Las suites de `tests/e2e/` usan clientes privilegiados y opt-in remoto. No se lanzó `pnpm test:e2e` ni se activó su bandera. Los 41 casos del Prompt3 quedaron **no ejecutados**, no «aprobados» ni «omitidos por test».
- No se ejecutaron migraciones, cambios de datos reales, limpieza de demo, envío a clientes ni despliegues. No se consultaron filas reales ni se copiaron credenciales.
- No se volvió a ejecutar build/lint/typecheck porque el producto no cambió; el objetivo fue evidencia funcional y documentación. Gates históricos no se atribuyen a esta ejecución.

## Revisión cruzada y validación de entrega

Delegación de solo lectura a Claude Code 2.1.260: alias solicitado `opus`, modelo resuelto `claude-opus-5`; 40 IDs revisados. Salida con `is_error=false`, `terminal_reason=completed`, cero permission_denials y cero subagentes. Codex conserva el veredicto y verificó las diferencias incorporadas en la matriz. No se atribuye prueba funcional ejecutada al revisor.

`generar-informe.py` comprueba igualdad exacta de 164 IDs entre fuente y evaluación, ausencia de duplicados, referencias existentes/líneas válidas, 427 casos locales aprobados y 41 E2E inventariados. `validacion-entregables.json` contiene los conteos. Las huellas de archivos permiten reconocer cambios posteriores al corte sin confundir evidencia antigua con producto actual.

El informe HTML se comprobó en un navegador local y con DOM: 164 filas; búsqueda COT-04 devuelve una; filtro OBS devuelve30; filtro no cubierta devuelve34; limpiar restaura164. Capturas de escritorio1440×1000 y móvil390×844 revisadas visualmente, sin desbordamiento horizontal. Evidencia: `validacion-informe-html.json`, `informe-escritorio.png` e `informe-movil.png`. Estas comprobaciones pertenecen al documento de auditoría, no al ERP.

Reproducción desde la raíz: `node docs/auditoria-funcional-2026-09-13/validar-informe.mjs`, usando las dependencias locales ya instaladas. Se validaron también codificación sin caracteres de reemplazo, campos obligatorios completos y ausencia de patrones de credenciales en los documentos. Solo se integran documentos y evidencia de esta auditoría; los tres archivos previos de `entregables/` se conservan fuera del commit. La integración es local: no se hace push ni despliegue.

## Control de límites y continuidad

Límite inicial disponible: 98 % en ventana de cinco horas, 86 % semanal. En controles intermedios se observaron 73 %/82 % y 48 %/78 %. No se alcanzó el umbral menor a 10 % en esos controles. Si en una continuación baja de ese umbral, guardar primero matriz/evidencia y estado Git, documentar siguiente paso y programar reanudación posterior al reinicio. No consumir créditos ni confundir reinicio de cuota con disponibilidad del entorno E2E.

La aprobación de la auditoría documental no sustituye aceptación de negocio. Para retomar, usar `README.md`, `resumen.json`, el registro E2E y el handoff local; repetir pruebas únicamente cuando haya cambiado el producto o se habilite el entorno dependiente.
