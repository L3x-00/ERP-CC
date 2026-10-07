# B1 — Registro de hallazgos (auditoría de cumplimiento)

Fuente: lentes por área (workflow `wf_797b616a-06e`, tanda 1: L1 roles/permisos/RBAC, L2 catálogos; tanda 2 en curso: L3 archivos, L4 Actividad/UX/alcance) + revisión propia (pruebas y git). Evidencia completa (consultas a la BD local, `pg_get_functiondef`, rutas:línea) en el resultado del workflow; aquí el resumen trazable.

Estados: **Pendiente** (B1, se corrige en esta auditoría) · **Resuelto** (commit + prueba) · **Diferido a Bx** (código de otro bloque; se corrige en su auditoría) · **Propuesto** (fuera de alcance o limpieza; espera decisión del PO).

| ID | Sev. | Tipo | Req. | Descripción | Estado |
|---|---|---|---|---|---|
| H-B1-01 | Requerido | Incumplimiento | R-B1-12 | Customer Service y Administrative ven costo interno y margen de propuestas (decisión #2: solo Management/Admin); `obtener-propuesta.ts` los entrega a quien tiene `propuesta_vista` | Diferido a B4 |
| H-B1-02 | Requerido | Incumplimiento | R-B1-05 | Administrative no puede consultar lo comercial: tiene `cliente_vista`/`rfq_vista`/`propuesta_vista` pero la RLS usa `ver_clientes`/`ver_pipeline_equipo` (simulación: 0/85 clientes, 0/8 RFQ, 0/8 propuestas) | Diferido a B2/B3/B4 (la RLS de clientes, RFQ y propuestas debe aceptar `*_vista`; otorgar `ver_clientes`/`ver_pipeline_equipo` abriría mutaciones y expondría costo/margen antes de corregir H-B1-01) |
| H-B1-03 | Requerido | Incumplimiento | R-B1-05 | Matriz deja a `contador` (Administrative) sin `orden_cerrar_admin` pese a §5 "cierres administrativos" | Resuelto (`ac35c5b`) |
| H-B1-04 | Requerido | Incumplimiento | R-B1-07 | Permiso legacy `aprobar_ordenes` (lo tiene `vendedor`) permite a Customer Service autorizar horas extra (decisión #8: Management/Admin) y administrar órdenes | Diferido a B6 |
| H-B1-05 | Requerido | Bug | R-B1-41 | `actualizar_permisos_rol` reemplaza la matriz sin lock ni control optimista: revierte cambios ajenos o mezcla conjuntos | Resuelto (`ac35c5b`) |
| H-B1-06 | Requerido | Bug | R-B1-09 | Guarda de "último admin activo" sin lock común: dos admins degradándose a la vez dejan 0 admins | Resuelto (`ac35c5b`) |
| H-B1-07 | Requerido | Seguridad | R-B1-11 | Un permiso desactivado (`permisos.activo=false`) sigue concediendo acceso (helpers SQL y `can()`), y bloquea guardar la matriz | Resuelto (`ac35c5b`) |
| H-B1-08 | Requerido | Seguridad | R-B1-02 | El operador recibe montos de la orden en el payload del piso y la RLS de `ordenes_produccion` es `USING(true)` | Diferido a B6/B5 |
| H-B1-09 | Requerido | Incumplimiento | R-B1-36 | Auditoría de RBAC sin "qué cambió" (permisos agregados/retirados, rol/estado anterior) y escrita fuera de la transacción | Resuelto (`ac35c5b`) |
| H-B1-10 | Opcional | Mantenibilidad | R-B1-50 | Matriz con permisos decorativos (`usuario_admin`, `permiso_admin`, `cliente_vista`) y duplicados legacy vs. por acción | Propuesto |
| H-B1-11 | Opcional | Mantenibilidad | R-B1-11 | Server Actions muertas `asignar-permiso`/`revocar-permiso` escriben `permisos_rol` sin las guardas de la RPC | Propuesto |
| H-B1-12 | Opcional | Seguridad | R-B1-11 | `privado.actor_con_permiso` con EXECUTE para PUBLIC (creado en B3) | Diferido a B3 |
| H-B1-13 | Detalle menor | Mantenibilidad | R-B1-35 | Acciones de permisos/usuarios sin `correlationId` | Resuelto (`ac35c5b`) |
| H-B1-14 | Requerido | Incumplimiento | R-B1-21/22/36 | `versiones_catalogo.actor_id` siempre NULL (165/165): el historial no dice quién cambió | Pendiente |
| H-B1-15 | Requerido | Incumplimiento | R-B1-35/22 | Acciones de catálogo auditadas sin `correlationId` (36/36 logs) | Pendiente |
| H-B1-16 | Requerido | Incumplimiento | R-B1-19..22 | `catalogo_motivos_pausa` (B6) no configurable, no versionado ni protegido contra borrado | Diferido a B6 |
| H-B1-17 | Requerido | Bug | R-B1-23/24 | `editar_item_propuesta` exige material/espesor activos aunque no cambien | Diferido a B4 |
| H-B1-18 | Requerido | Incumplimiento | R-B1-24 | Ficha RFQ oculta valores inactivos (material, espesor, proceso, próxima acción) | Diferido a B3 |
| H-B1-19 | Requerido | Incumplimiento | R-B1-24 | Ruteo de propuesta: filas con proceso/grupo inactivo en blanco y no se puede volver a guardar | Diferido a B4 |
| H-B1-20 | Requerido | Bug | R-B1-23 | `editar_ruteo_item` acepta grupos inactivos en filas nuevas | Diferido a B4 |
| H-B1-21 | Requerido | Incumplimiento | R-B1-18/23 | RFQ: acepta próxima acción inactiva; "Otro exige texto" depende del código fijo y deja pasar texto vacío | Diferido a B3 |
| H-B1-22 | Requerido | Incumplimiento | R-B1-41 | Ediciones de catálogo sin control optimista (gana la última escritura) | Pendiente |
| H-B1-23 | Requerido | Incumplimiento | R-B1-47 | Alta directa de órdenes usa la tabla de inventario `materiales` y procesos en texto libre | Diferido a B5 |
| H-B1-24 | Opcional | UX | R-B1-34/50 | Historial de versiones de catálogo muestra snapshot crudo (columnas, UUID, "Actor <uuid>") | Pendiente (actor legible) |
| H-B1-25 | Opcional | Fuera de alcance | R-B1-50 | Pestaña "Catálogos" (tiers de cliente, no pedido) junto a "Catálogos base" confunde | Propuesto |
| H-B1-26 | Opcional | Fuera de alcance | R-B1-47 | Cotizador legado sin uso con lista fija de procesos paralela al catálogo | Propuesto |
| H-B1-27 | Detalle menor | Bug | — | BD local: motivos de pausa con "??" en vez de acentos (verificar remoto) | Diferido a B6 |
| H-B1-28 | Opcional | Git | — | Commits de B1 con alcance mezclado: `452bfcf` (B1.10 + B3 ola 1) y `d10ecf5` (catálogos + retrofit en 45 archivos) | Registrado (proceso) |

## Cobertura preliminar (tanda 1)

- Cubiertos: R-B1-01, 03, 04, 07, 08, 10, 13, 14, 15, 16, 17, 18, 20, 25.
- Parciales: R-B1-02, 05, 06, 09, 11, 12, 19, 21, 22, 23, 24, 43, 47, 48.
- No cubierto: R-B1-41 (permisos/usuarios y catálogos).
- Pendientes de tanda 2: R-B1-26..38, 44, 46, 49, 50.
