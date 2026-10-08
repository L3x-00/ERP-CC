# Ejecución por cortes — observaciones del cliente 2026-10-07

Estado: decisiones `DC-01..DC-15` aceptadas; preparación en curso; producto aún sin modificar por este frente.

Regla de coordinación: antes de cada tarea, `ACTIVE_TASKS.md` debe fijar un dueño, archivos exclusivos y gates. Codex y Claude no editan el mismo archivo a la vez. Solo Codex integra mediante Git.

## P0 — Preparación y contrato

### P0.1 Fijar decisiones y aislar la rama — Codex

**Aceptación**

- [x] Las respuestas están normalizadas como `DC-01..DC-15` en una fuente durable.
- [x] La auditoría B1–B9 permanece pausada y la rama es `feature/observaciones-cliente`.
- [x] Los documentos previos no se sobrescribieron ni se confundieron con aceptación de producto.

**Verificación:** `git status --short --branch` y revisión de `DECISIONES-ACEPTADAS.md`.

### P0.2 Preparar toolchain local — Codex

**Aceptación**

- [x] Node 24.14.0, pnpm 11.9.0, Supabase CLI 2.109.0, Docker 29.4.0 y Playwright 1.62.1 disponibles.
- [x] `pnpm install --frozen-lockfile` termina sin modificar el lockfile.
- [x] Supabase local y puertos 54321/54322/54323 confirmados; variables mutantes se obtendrán del stack local, nunca de `.env.local`.
- [x] El wrapper `entorno-local.ps1` tolera los avisos normales de servicios opcionales detenidos y `validar-entorno.mjs` confirma loopback.

**Verificación:** versiones, `docker ps`, `supabase status` y árbol Git.

### P0.3 Crear y sincronizar Skill de correcciones — Claude implementa, Codex revisa

**Aceptación**

- [x] Existe `.agents/skills/orca-correcciones-cliente/SKILL.md`, sin duplicar la auditoría B1–B9.
- [x] La Skill define contratos, propietarios, cortes, defectos incidentales y checkpoints 20/10 %.
- [x] `quick_validate.py` y `sync-ai-skills.ps1 -Check` pasan después de sincronizarla hacia Claude.

**Dependencias:** P0.1.
**Archivos exclusivos durante ejecución:** `.agents/skills/orca-correcciones-cliente/**` para Claude; sincronización para Codex.

### P0.4 Caracterizar contratos compartidos — Codex

**Aceptación**

- [ ] Pruebas existentes o nuevas fijan: RFQ sin propuesta implícita, archivos versionados, revisión de Propuesta, aceptación y consumo congelado.
- [x] Los contratos de fechas, `INCOMPLETO`, tarifa Grupo/override, Orden pendiente y snapshot de consumo están documentados antes de migraciones (`CONTRATOS-CORTE-0.md`).
- [ ] Se registra el baseline visual claro/oscuro en 320, 768, 1024 y 1440 px.

**Verificación:** pruebas focales RED/GREEN de caracterización y revisión visual registrada.
**Dependencias:** P0.1–P0.3.

### Checkpoint P0

- [x] Skill compartida sincronizada y validada para Codex/Claude.
- [ ] Contratos listos para repartir trabajo sin editar archivos comunes.
- [ ] `HANDOFF.md`, `ACTIVE_TASKS.md`, estado Git y gates baseline actualizados.

## C1 — RFQ visual y alta recuperable

### C1.1 Lista única, Resumen y tokens semánticos

**Aceptación**

- [ ] RFQ abre únicamente en lista; no existe selector/tablero.
- [ ] Resumen muestra Datos generales, Próxima acción y Descripción como tarjetas de solo lectura.
- [ ] Estados verdes/amarillos/ámbar usan tokens accesibles en claro/oscuro.

**Verificación:** unitarias/componentes, E2E de navegación y revisión `orca-ui-review`.
**Dependencias:** P0.4. **Tamaño:** M, máximo cinco archivos por encargo.

### C1.2 Wizard durable y campos aprobados

**Aceptación**

- [ ] Pasos: Cliente → Solicitud → Ítems → Archivos → Revisar.
- [ ] Orden de compra/Horas estimadas no aparecen; Fecha requerida por cliente es opcional y claramente distinta de Fecha compromiso.
- [ ] Cerrar después de guardar deja `INCOMPLETO`; Continuar captura recupera datos y archivos confirmados.

**Verificación:** validaciones, integración de reanudación y E2E cliente existente/nuevo/interrupción.
**Dependencias:** P0.4. **Tamaño:** dividir contrato servidor y UI en encargos M independientes.

### C1.3 Canal configurable y Espesor

**Aceptación**

- [ ] Catálogo inicial contiene WhatsApp, Correo, Teléfono, Visita, Referido y Otro.
- [ ] “Otro” exige detalle y valores históricos sobreviven a una desactivación.
- [ ] Espesor aparece debajo de Material o muestra por qué el material no tiene espesores.

**Verificación:** pgTAP/validación, integración y E2E del formulario.
**Dependencias:** P0.4.

### Checkpoint C1

- [ ] RFQ nuevo puede iniciarse, interrumpirse y reanudarse sin pérdida.
- [ ] Typecheck, lint, unitarias/integración focales y revisión responsive verdes.
- [ ] Commit(s) atómicos aceptados por Codex.

## C2 — RFQ versionado, estados y documentos

### C2.1 Snapshot RFQ y congelamiento Rev A

**Aceptación**

- [ ] Cada versión append-only congela cabecera + ítems, actor, fecha y causa.
- [ ] Crear explícitamente Propuesta Rev A congela el RFQ; navegar o editar nunca crea propuesta.
- [ ] Bajas de ítems son lógicas y un ITxx no se reutiliza.

**Verificación:** pgTAP append-only/CAS/RBAC, carrera de dos conexiones e integración.
**Dependencias:** C1.2.

### C2.2 Próxima acción por transición

**Aceptación**

- [ ] Transiciones no terminales exigen próxima acción en la misma operación.
- [ ] Estados terminales no exigen acción futura y solicitan motivo/resultado según contrato.
- [ ] Fallar seguimiento revierte la transición completa.

**Verificación:** pgTAP, integración por estado y E2E comercial.
**Dependencias:** P0.4.

### C2.3 Historial documental y archivos ITxx

**Aceptación**

- [ ] “Ver versiones” incluye metadata no vigente y no ofrece borrado físico.
- [ ] DXF/DWG aparecen en ayuda/selector y suben/descargan correctamente, incluido >1 MiB.
- [ ] Archivos de `rfq_item` llegan autorizadamente a Propuesta, Orden y piso sin duplicar blobs.

**Verificación:** integración Storage/RLS, E2E de versión repetida y E2E de piso.
**Dependencias:** P0.4; coordinar con H-B1-29 parcial sin reimplementarlo.

### Checkpoint C2

- [ ] RFQ conserva versiones y documentos independientes.
- [ ] Ningún flujo implícito crea propuesta ni borra historial.
- [ ] SQL focal, integración, concurrencia, UI y E2E verdes.

## C3 — Propuesta, ruteo y costos

### C3.1 Ítems nuevos y revisiones

**Aceptación**

- [ ] Una nueva revisión puede agregar IT consecutivo estable sin modificar RFQ.
- [ ] Se registra la revisión de origen; quitar ítems/procesos es lógico.
- [ ] Historial abre versiones anteriores en solo lectura.

**Verificación:** pgTAP de numeración/concurrencia, unitarias e E2E de dos revisiones.
**Dependencias:** C2.1.

### C3.2 Tarifa estándar de Grupo y override de recurso

**Aceptación**

- [ ] `grupos_equipo` posee tarifa estándar versionada y Configuración permite mantenerla.
- [ ] El override de recurso tiene indicador explícito; cero no equivale a “sin override”.
- [ ] Falta de tarifa bloquea el costeo con mensaje accionable.

**Verificación:** pgTAP de constraints/historial, servicios y UI de Configuración.
**Dependencias:** P0.4.

### C3.3 Snapshot y desglose de ruteo

**Aceptación**

- [ ] Preparación + operación usan la misma tarifa en el MVP.
- [ ] Cada fila congela tarifa, fuente, grupo, recurso opcional y fecha.
- [ ] Desglose y total/margen evitan doble conteo con costos manuales.

**Verificación:** paridad SQL/TypeScript, redondeo/moneda, unitarias y E2E.
**Dependencias:** C3.1–C3.2.

### Checkpoint C3

- [ ] Dos revisiones conservan sus propios ítems y costos históricos.
- [ ] Cambiar una tarifa no altera revisiones previas.
- [ ] Gates focales y revisión financiera aprobados.

## C4 — Aceptación y Orden inmutable

### C4.1 Aceptación durable y Orden pendiente

**Aceptación**

- [ ] Comercial acepta una revisión exacta y confirma Fecha compromiso.
- [ ] La misma transacción guarda aceptación + solicitud única de orden.
- [ ] Un gate fallido conserva `Orden pendiente`, causa y reintento; carreras crean exactamente una Orden.

**Verificación:** pgTAP, concurrencia, permisos aceptar/reintentar e integración de crédito/FX.
**Dependencias:** C3.3.

### C4.2 Snapshot comercial y cambios operativos

**Aceptación**

- [ ] Alcance, revisión, ítems, cantidades, precios y moneda son inmutables.
- [ ] Prioridad, fecha operativa, recurso y notas pueden cambiar con historial.
- [ ] Fecha compromiso comercial original permanece separada e inmutable.

**Verificación:** pgTAP de columnas protegidas/CAS, integración y E2E Planeación.
**Dependencias:** C4.1.

### C4.3 Confidencialidad y simplificación de Órdenes

**Aceptación**

- [ ] Comentarios se reubican antes de retirar Seleccionar; se retiran mutaciones comerciales no permitidas.
- [ ] La ruta exige permiso y el servidor no serializa finanzas a roles operativos.
- [ ] Cancelación queda solo para Administración y permanece auditada.

**Verificación:** RBAC negativo sobre payload, unitarias, integración y E2E admin/operador.
**Dependencias:** C4.2.

### Checkpoint C4

- [ ] Aceptación nunca se pierde y Orden nunca se duplica.
- [ ] Operación no recibe campos financieros.
- [ ] Cobranza, crédito y documentos de Orden sin regresión.

## C5 — Acceso operativo

### C5.1 Flujo PIN simplificado

**Aceptación**

- [ ] Ingreso, selección de trabajo y salida forman un flujo continuo en móvil/tablet.
- [ ] PIN correcto/incorrecto, rate limit, revocación y expiración conservan seguridad vigente.
- [ ] No aparecen precios ni rutas administrativas.

**Verificación:** unitarias, integración de sesión y E2E táctil.
**Dependencias:** C4.3.

### C5.2 “Ver como operador” de solo lectura

**Aceptación**

- [ ] Administración entra sin conocer PIN, con operador, admin real, motivo y expiración auditados.
- [ ] Banner permanente y salida explícita identifican la delegación.
- [ ] Toda mutación productiva se rechaza en el MVP.

**Verificación:** RBAC negativo, expiración/revocación, auditoría y E2E.
**Dependencias:** C5.1.

## C6 — Materiales y costos sin stock

### C6.1 Maestro e historial de costos

**Aceptación**

- [ ] `catalogo_materiales` es canónico, con unidad base, MXN/USD y costo vigente.
- [ ] Compra/Gasto propone; solo confirmación autorizada cambia el maestro.
- [ ] Historial append-only congela anterior/nuevo/moneda/fecha/fuente/actor.

**Verificación:** pgTAP/RBAC/concurrencia, integración y UI de Materiales y costos.
**Dependencias:** P0.4.

### C6.2 Consumo congelado sin movimiento de stock

**Aceptación**

- [ ] Consumo congela cantidad, unidad, costo, moneda y tipo de cambio.
- [ ] Registrar consumo no crea entradas, salidas, reservas ni cambios de existencia.
- [ ] Rentabilidad suma legado y nuevo sin doble conteo.

**Verificación:** pgTAP, integración, reconciliación antes/después y E2E.
**Dependencias:** C6.1.

### C6.3 Retiro operativo del inventario legado

**Aceptación**

- [ ] Navegación diaria usa “Materiales y costos”; no ofrece stock/entradas/salidas/reservas.
- [ ] Movimientos, existencias y kardex previos siguen consultables en solo lectura.
- [ ] Ninguna tabla ni historia se elimina.

**Verificación:** RBAC, consultas históricas, E2E de navegación y reconciliación.
**Dependencias:** C6.2.

## C7 — Cierre

- [ ] Ejecutar typecheck, lint, unitarias, build y, según cambios, pgTAP, integración, concurrencia y E2E.
- [ ] Aplicar `code-simplification`, `cross-review`, revisión visual/accesible y seguridad.
- [ ] Actualizar ADR, documentación y memoria compartida.
- [ ] Entregar `REPORTE-HALLAZGOS-Y-CORRECCIONES.md` con síntoma, causa, severidad, corrección, evidencia y pendientes.
- [ ] Separar claramente verificación local, remoto, despliegue y aceptación del cliente.

## Protocolo de continuidad

- [ ] A 20 % o menos: no iniciar tarea L; terminar el incremento y actualizar evidencia.
- [ ] A 10 % o menos: actualizar `HANDOFF.md`, `ACTIVE_TASKS.md`, estado Git, archivos, pruebas, fallos y siguiente acción exacta; detener trabajo nuevo.
- [ ] El agente disponible solo continúa encargos independientes con contrato y archivos ya asignados; nunca adivina el estado del agente pausado.
