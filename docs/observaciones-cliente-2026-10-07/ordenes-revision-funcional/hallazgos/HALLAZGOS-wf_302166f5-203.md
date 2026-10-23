# Hallazgos verificados - revision funcional de Ordenes (workflow v2)
Generado sin modelo desde `wf_302166f5-203/journal.jsonl` el 2026-10-14T17:39:37.973Z. Áreas: 9 · otros resultados: 0.
Los estados «verificada» pasaron por un revisor escéptico independiente; «SIN verificar» es la lectura cruda del primer agente.

## Área «actividad-pestanas» (verificada) — Ficha de Orden: Actividad (eventos de negocio) y modelo mental de pestañas

**Cómo funciona hoy:** La ficha tiene 7 pestañas con los rótulos que pide el cliente (ficha-orden.tsx 34-44). Actividad se alimenta solo de orden_eventos_cambio (últimos 50) y pinta evento.tipo crudo con fecha, actor y motivo. No mezcla Comentarios ni la bitácora logs. Los INSERT en orden_eventos_cambio están únicamente en las RPC orden_creada, orden_interna_creada, orden_liberada, cierre_administrativo, ajuste_post_aceptacion, ajuste_operativo, programacion_inicial, reprogramacion_operativa (más versiones previas de las mismas funciones). Los triggers de derivación (planificada, en_produccion, completada) solo hacen UPDATE de estado_sii y no emiten evento. Reactivar y repetir existen como RPC aparte sin evento de orden. R10 es en su mayor parte presentación (etiquetas) más algunos eventos faltantes. R19 es microcopy y reubicar Comentarios.

### R10 — parcial (corregido) · esfuerzo S · REQUIERE MIGRACIÓN

**Estado actual:** Actividad lee orden_eventos_cambio y está separada de Comentarios y logs. Existen orden_creada y orden_liberada (ORDEN_CREADA y ORDEN_LIBERADA del cliente). ORDEN_PLANIFICADA y PRODUCCION_INICIADA no existen: derivar_orden_planificada y derivar_orden_en_produccion solo hacen UPDATE. Producción completada (derivar_orden_completada) tampoco emite evento. Cancelación, reactivación, repetición y entrega no insertan en orden_eventos_cambio (el único INSERT se localiza solo en las 8 RPC listadas). La UI imprime evento.tipo crudo en snake_case y el E2E fija ese texto. ResumenCambio etiqueta solo algunas claves; las demás salen crudas.

**Cambio mínimo:** Fase 1 sin migración: utilidad etiquetas-evento.ts con diccionario tipo->etiqueta en español (orden_creada=Orden creada, orden_interna_creada, orden_liberada, cierre_administrativo, ajuste_post_aceptacion, ajuste_operativo, programacion_inicial=Planeación inicial, reprogramacion_operativa) y fallback genérico que no muestre snake_case; ocultar o resolver recurso_id (no mostrar UUID); actor NULL rotulado Sistema; actualizar el E2E. Fase 2 (opcional, con migración): nueva migración que redefine con CREATE OR REPLACE las tres derivar_* (usar la definición vigente: planificada y en_produccion de 20261007120002, completada de 20261007120005, conservando SECURITY DEFINER y search_path vacío) agregando INSERT de orden_planificada, produccion_iniciada, produccion_completada solo cuando el UPDATE afectó fila (GET DIAGNOSTICS / ROW_COUNT > 0), actor NULL; evento de cancelación y de entrega dentro de sus RPC/servicios si se decide. Reactivar/repetir seguirán el destino que defina R de acciones (probablemente retiradas).

**Enfoque descartado:** Unificar Actividad con logs/obtener_actividad o con comentarios en una sola línea de tiempo: más pesado, mezcla bitácora técnica con negocio y contradice la separación pedida.

**Migración:** Solo Fase 2 y opcional. El lector omitió que derivar_orden_completada vigente vive en 20261007120005, no en 20261007120002; redefinir desde la versión incorrecta degradaría el SECURITY DEFINER. La tabla no restringe valores de tipo, no cambia esquema. El nombre de migración 20261014120000 propuesto debe verificarse que no colisione con otras tandas.

**Archivos a tocar:**
- src/modulos/ordenes/utilidades/etiquetas-evento.ts
- src/modulos/ordenes/componentes/ficha-orden.tsx
- tests/e2e/ordenes-estados-sii.spec.ts
- supabase/migrations/<nueva>_eventos_negocio_orden.sql (solo Fase 2)

**Impacto en otros módulos:**
- [medio] Planeación (supabase/migrations/20261007120002_sii_b5_orden_estados.sql): Redefinir derivar_orden_planificada para insertar evento; trigger en camino de programación.
- [medio] Producción (supabase/migrations/20261007120005_sii_b5_derivaciones_definer.sql): derivar_orden_completada y derivar_orden_en_produccion corren en el camino caliente de avance/sesiones; un error rompe el registro de piso.

**Pruebas afectadas:**
- tests/e2e/ordenes-estados-sii.spec.ts
- supabase/tests/sii_b5_orden.test.sql
- supabase/tests/sii_b1_actividad.test.sql

**Pruebas nuevas (RED):**
- Vitest: etiqueta de cada tipo conocido y fallback sin snake_case
- Vitest: ResumenCambio no muestra UUID
- pgTAP (Fase 2): transición a PLANIFICADA inserta un solo evento, idempotente
- pgTAP (Fase 2): primera sesión inserta produccion_iniciada una vez
- E2E: panel Actividad muestra 'Orden creada'

**Riesgos:**
- Triggers por fila: sin guardas el evento se duplicaría
- Ajustar el E2E que espera orden_creada
- Actor NULL en eventos de trigger: rotular Sistema
- Órdenes históricas no tendrán eventos nuevos retroactivamente
- Redefinir funciones desde la versión equivocada pierde SECURITY DEFINER

**Preguntas al PO:**
- ¿La Fase 2 (eventos de planificada, producción iniciada/completada, cancelación, entrega) entra antes de Producción o basta con el diccionario de etiquetas?

**Evidencia:**
- src/modulos/ordenes/componentes/ficha-orden.tsx:74-109, 468-487 — Panel imprime evento.tipo crudo; ResumenCambio con ETIQUETAS_CAMBIO parcial (recurso_id se rotula Recurso pero el valor es UUID). La fecha sí se muestra vía formatearFecha.
- supabase/migrations/20261007120002_sii_b5_orden_estados.sql:127-133, 220-227, 385-389, 413-515 — INSERT de orden_liberada, cierre_administrativo, ajuste_post_aceptacion; derivar_planificada y derivar_en_produccion solo UPDATE.
- supabase/migrations/20261007120005_sii_b5_derivaciones_definer.sql:43-64 — Definición vigente de privado.derivar_orden_completada (SECURITY DEFINER, search_path vacío), solo UPDATE a PRODUCCION_COMPLETADA, sin evento.
- supabase/migrations/20261009193327_c4_2_orden_comercial_operativa.sql:341-347, 393-397, 461-465 — ajuste_operativo, programacion_inicial, reprogramacion_operativa.
- supabase/migrations/20261012100000_b4_obs2_flujo_versiones.sql:1404-1416 — Definición vigente de orden_creada; orden_interna_creada en 20261012130000_b5_obs5_orden_interna_sin_cliente.sql:273.
- tests/e2e/ordenes-estados-sii.spec.ts:344 — Espera el texto orden_creada en ficha-panel-actividad; se romperá al etiquetar.
- supabase/migrations/20261007120004_sii_b5_consumidores_estado.sql:425, 552-611 — Definición vigente de repetir_orden_op y reactivar_orden_op, sin INSERT de evento.

**Notas de verificación:** Confirmado el diagnóstico general (8 RPC con INSERT, triggers sin evento, UI cruda, E2E línea 344). Corregido: la definición vigente de derivar_orden_completada está en 20261007120005 (definer), no en 20261007120002; añadido ajuste_post_aceptacion en 385-389; la fecha sí se muestra (el lector decía 'sin hora' ambiguamente, formatearFecha se usa); reactivar/repetir vigentes en 20261007120004. Sigue sin verificarse el cuerpo de la RPC de cancelación.

### R19 — parcial (corregido) · esfuerzo S

**Estado actual:** Los rótulos de pestañas ya existen (Resumen, Ítems / Partidas, Ruta / Operaciones, Archivos vivos, Entregas, Actividad, Documento). Falta el microcopy con la pregunta por pestaña. Resumen contiene la tarjeta 'Folio legacy' con el folio de la orden (línea 303), y, solo con finanzas, Totales y un bloque 'Origen (snapshot)' que vuelca clave: valor crudo (323-329). Los comentarios de orden solo se acceden por el diálogo de la cola.

**Cambio mínimo:** Constante PREGUNTAS_PESTANA y párrafo bajo la barra de pestañas (sin cambiar testids). Resumen: cambiar 'Folio legacy' por 'Folio' (coordinar con el requisito de folios). No quitar Totales del Resumen sin decisión del PO (el cliente no lo pidió; solo pide ocultar IDs). Comentarios: añadir dentro de la ficha un bloque con HiloComentarios (entidadTipo orden), preferible como sección titulada separada en Actividad o 8.ª pestaña; reubicar antes de retirar el diálogo de la cola.

**Enfoque descartado:** Rutas anidadas o rehacer los paneles: la base es válida y los testids están fijados por E2E.

**Archivos a tocar:**
- src/modulos/ordenes/componentes/ficha-orden.tsx
- src/app/(privado)/ordenes/[id]/page.tsx

**Impacto en otros módulos:**
- [bajo] Comentarios (src/modulos/comentarios/componentes/hilo-comentarios.tsx): Se reutiliza; requiere usuarioActualId y permisos desde la página (no verificado).
- [bajo] Cola de Órdenes (src/modulos/ordenes/componentes/tabla-ordenes.tsx): Retirar el diálogo solo tras reubicar; la prueba tabla-ordenes-c4-3 lo cubre.

**Pruebas afectadas:**
- tests/e2e/ordenes-estados-sii.spec.ts
- tests/unitarias/ficha-orden-c4-2.test.ts
- tests/unitarias/tabla-ordenes-c4-3.test.ts

**Pruebas nuevas (RED):**
- Vitest/RTL: cada pestaña muestra su pregunta
- Vitest: Resumen muestra 'Folio' y no 'Folio legacy'
- E2E: comentarios publicables desde la ficha

**Riesgos:**
- Una 8.ª pestaña cambia el ancho de la barra (ya hace wrap)
- Quitar Totales del Resumen podría chocar con pruebas; se recomienda conservarlos

**Preguntas al PO:**
- ¿Comentarios como 8.ª pestaña o sección dentro de Actividad?
- ¿Se mantienen los Totales en Resumen o solo en Documento?

**Evidencia:**
- src/modulos/ordenes/componentes/ficha-orden.tsx:34-44, 278-297 — Lista PESTANAS y barra con data-testid ficha-pestana-*; sin texto de pregunta.
- src/modulos/ordenes/componentes/ficha-orden.tsx:299-329 — Resumen: Folio legacy, Compromiso comercial y Fecha operativa separados, Totales y Origen crudo solo con puedeVerFinanzas.
- src/modulos/ordenes/componentes/tabla-ordenes.tsx:697-722 — Diálogo de comentarios en la cola (único acceso actual).
- tests/unitarias/tabla-ordenes-c4-3.test.ts:26 — La prueba mockea HiloComentarios en la cola; fija el comportamiento al retirar el diálogo.

**Notas de verificación:** Se matiza el cambio mínimo: el lector proponía quitar Totales del Resumen, lo cual el cliente no pide (riesgo de alcance); se deja como pregunta al PO. Origen crudo se solapa con el requisito de IDs técnicos/folios navegables (otra área). Añadida prueba tabla-ordenes-c4-3 como afectada. No se leyó page.tsx ni hilo-comentarios.tsx.

### Limitaciones
- No se leyó el cuerpo de la RPC/servicio de cancelación ni de registrar_entrega; la ausencia de evento se infiere del grep de INSERT INTO orden_eventos_cambio en supabase/migrations.
- No se leyeron page.tsx ni hilo-comentarios.tsx; permisos de comentarios sin comprobar.
- No se leyeron los pgTAP.

## Área «archivos» (verificada) — Ficha de Orden: Archivos vivos

**Cómo funciona hoy:** La Orden no duplica blobs: crear_orden_desde_revision congela en snapshot_json solo ids y metadatos de filas vigentes de la tabla archivos. La definición VIGENTE de esa función está en 20261012100000_b4_obs2_flujo_versiones.sql (967-1421), no en C3.1 (que la precedió con la misma lógica documental). La cabecera congela las entidades rfq, rfq_item (solo las ligadas a ítems de la revisión aceptada), propuesta y propuesta_revision (letras A..aceptada), con entidad, clase, tema, nombres, mime, revision_id y revision_letra; cada ítem congela sus archivos propuesta_item del mismo ITxx en A..aceptada. La ficha /ordenes/[id] exige can(orden_vista) y llama al servicio con el cliente admin (service_role, sin RLS). El servicio solo lee snapshot_json si el usuario tiene ver_finanzas, así que sin ese permiso la lista de archivos sale siempre vacía aunque la pestaña se muestra a todos. Con finanzas arma ArchivoFicha solo desde el snapshot, con origen binario 'revision'|'item', sin consultar la tabla archivos y descartando entidad y revision_letra; la UI es una lista de texto con respaldo al UUID, sin tabla ni descarga. El piso de Producción es un precedente parcial (resuelve ITxx de rfq_item y une adjuntos propios) pero pierde el ITxx de revisiones anteriores y no lleva clase ni letra, por lo que no conviene reutilizarlo. El cambio mínimo es derivar en lectura, sin migración.

### R09 — parcial (corregido) · esfuerzo S

**Estado actual:** La pestaña existe (ficha-orden.tsx:40) y el concepto base se cumple: ids congelados, sin copiar blobs, linaje A..aceptada estable. Faltan las tres columnas. Origen no distingue RFQ / Propuesta Rev X / Orden (solo 'revision'|'item'). Asociado a solo existe para archivos propuesta_item; los de entidad rfq_item caen en cabecera con itemCodigo=null y se verían como generales (el pieza.dxf del RFQ saldría sin IT01). Tipo muestra la clase cruda y heterogénea (RFQ: CAD|DIBUJO|IMAGEN|ESPECIFICACIONES|OTROS; propuesta manual: 'general'|'tecnico'; PDF generado: 'pdf'; documentos de Orden de Producción: 'OTROS'). Los adjuntos propios de la Orden (entidad 'orden') no se listan. Además, sin ver_finanzas la lista sale siempre vacía porque el snapshot no se lee, aunque la pestaña es visible para todo orden_vista (la nota sección 11 espera que el operador vea archivos). La UI cae al UUID cuando no hay nombre y su mensaje de vacío dice 'snapshot'.

**Cambio mínimo:** Sin migración, sin tocar Producción: derivar en lectura. (1) ficha-orden-servicio.ts: agregar propuesta_revision_id al select de la orden; leer snapshot_json SIEMPRE en una variable local del servidor y asignar snapshot, totales y moneda (207, 210, 211) solo si incluirFinanzas, para no filtrar precios (R11). (2) Con snapshot válido: consultar archivos con .in('id', archivosReferenciados(snapshot)) (id, entidad, entidad_id, clase, nombre_original, nombre_erp, mime, vigente, retirado_en) más las filas entidad='orden', entidad_id=orden.id, vigente=true; y propuesta_items (rfq_item_id, codigo) de la revisión aceptada solo si hay archivos rfq_item. (3) Helper puro nuevo ordenes/servicios/derivar-archivos-ficha.ts (sin importar de Producción): Origen por entidad de la fila (rfq y rfq_item = RFQ; propuesta_revision y propuesta_item = Propuesta Rev <revision_letra del snapshot>, o Propuesta sin letra; propuesta = Propuesta; orden = Orden); Asociado a (propuesta_item = item.codigo del contenedor del snapshot, sin consulta; rfq_item = propuesta_items.rfq_item_id a codigo; lo demás = general); Tipo por clase únicamente (CAD=CAD, DIBUJO=Plano, IMAGEN=Imagen, ESPECIFICACIONES=Especificaciones, OTROS=Otro, tecnico=Técnico; 'pdf', 'general', nula o desconocida = '-'), sin heurística por extensión; excluir retirado_en no nulo; id del snapshot sin fila = 'No disponible' conservando el nombre del snapshot; sin duplicar ids. (4) tipos/ficha-orden.ts: reemplazar origen e itemCodigo por origenTipo, revisionLetra, asociadoA, tipo y disponible (solo los usan el servicio y el componente); orden-sii.ts: campos opcionales entidad, revision_id, revision_letra, item_id sin endurecer el guard. (5) ficha-orden.tsx 413-428: tabla Archivo | Origen | Asociado a | Tipo con el patrón de Partidas, data-testid ficha-panel-archivos conservado, etiquetas 'RFQ', 'Propuesta Rev A', 'Orden', '(general)'; quitar el respaldo al UUID y la palabra snapshot. (6) Descarga: diferir (R09 no la pide); si se pide, acción nueva con can(orden_vista) y pertenencia contra la lista derivada.

**Enfoque descartado:** Migración o re-backfill de snapshot_json (añadir entidad_id o ITxx, columnas origen/tipo en archivos) o redefinir crear_orden_desde_revision (función de unas 450 líneas ya redefinida tres veces: b5, C3.1 y b4_obs2; toca datos congelados): los metadatos necesarios ya existen. Tampoco reutilizar construirDocumentosCongelados de Producción (sin clase ni letra, ITxx perdido en revisiones anteriores, acopla Órdenes con Producción), ni heurística por extensión o 'PDF técnico' para Tipo (contradiría el ejemplo del cliente donde el PDF de propuesta lleva '-'), ni copiar blobs, ni listar el RFQ vivo.

**Migración:** No requiere migración: origen, asociación y tipo se derivan de entidad, entidad_id, clase y revision_letra, que ya existen. Mejora futura y separada, solo si el PO la exige: CREATE OR REPLACE de public.crear_orden_desde_revision (vigente en 20261012100000_b4_obs2_flujo_versiones.sql:967-1421) agregando AND a.retirado_en IS NULL en los dos subqueries documentales (líneas 1143 y 1247); solo afectaría órdenes nuevas y obliga a copiar el cuerpo completo.

**Archivos a tocar:**
- src/modulos/ordenes/servicios/ficha-orden-servicio.ts
- src/modulos/ordenes/servicios/derivar-archivos-ficha.ts (nuevo, helper puro)
- src/modulos/ordenes/tipos/ficha-orden.ts
- src/modulos/ordenes/tipos/orden-sii.ts (solo campos opcionales)
- src/modulos/ordenes/componentes/ficha-orden.tsx
- tests/unitarias/ficha-orden-c4-2.test.ts (extender)
- tests/unitarias/derivar-archivos-ficha.test.ts (nuevo)

**Impacto en otros módulos:**
- [alto] Órdenes: confidencialidad C4.3 (R11) y Ruta (R07) (src/modulos/ordenes/servicios/ficha-orden-servicio.ts): Leer snapshot_json para todos los viewers exige mantener condicionados snapshot, totales y moneda a incluirFinanzas; la ficha es componente cliente y recibe props serializadas. R07 (Ruta vacía sin finanzas) toca el mismo bloque: resolver el gating una sola vez y coordinar.
- [medio] Producción (src/modulos/produccion/servicios/documentos-orden-servicio.ts): No se toca ni se reutiliza. Tras el cambio la ficha oculta archivos retirados y Producción seguirá listándolos y firmándolos (incoherencia entre pantallas).
- [medio] Órdenes (cola): adjuntos legados (src/modulos/ordenes/acciones/archivos-orden.ts): El diálogo de la cola escribe en la tabla legada archivos_orden (línea 108, bucket archivos-orden-historica), que no se refleja en archivos; Origen=Orden solo mostrará los de entidad 'orden' (Producción). Si R02 mueve el diálogo a la ficha, coordinar.
- [bajo] Tipos del snapshot (src/modulos/ordenes/tipos/orden-sii.ts): Solo campos opcionales; Producción importa archivosReferenciados y esSnapshotOrdenSii, que no cambian.
- [bajo] RFQ / Propuestas (src/modulos/rfq/acciones/archivos-rfq.ts): Solo lectura de clase y entidad; el mapa de Tipo debe ser defensivo porque archivos.clase es texto libre.

**Pruebas afectadas:**
- tests/unitarias/ficha-orden-c4-2.test.ts (fixture con archivos: [] en la línea 50; no se rompe, se extiende)
- Sin cambios con el cambio mínimo (solo regresión): tests/unitarias/produccion-documentos-orden.test.ts, tests/unitarias/produccion-documentos-orden-acciones.test.ts, tests/unitarias/produccion-documentos-orden-panel.test.ts, tests/integracion/c2-3-documentos-orden.test.ts, supabase/tests/c3_1_linaje_documental_orden.test.sql
- Adyacentes de confidencialidad C4.3: tests/unitarias/ordenes-confidencialidad-c4-3.test.ts, tests/unitarias/orden-documento-confidencialidad-c4-3.test.ts, tests/integracion/c4-3-confidencialidad-ordenes.test.ts, supabase/tests/c4_3_confidencialidad_ordenes.test.sql
- tests/e2e/ordenes-estados-sii.spec.ts:339 solo verifica la visibilidad de ficha-orden. Ninguna prueba referencia ficha-panel-archivos, obtenerFichaOrdenServicio ni incluirFinanzas.

**Pruebas nuevas (RED):**
- Unitaria RED del helper: archivo entidad rfq_item con propuesta_items {rfq_item_id a IT01} y clase CAD devuelve origen RFQ, asociadoA IT01, tipo CAD
- Unitaria: propuesta_revision con revision_letra 'A' y clase 'pdf' devuelve 'Propuesta Rev A', general y tipo '-' (ejemplo del cliente CNC-1026_04-A.pdf); entidad 'propuesta' sin letra devuelve 'Propuesta'
- Unitaria de regresión: propuesta_item de Rev A en una orden creada desde Rev B conserva asociadoA tomado de item.codigo del snapshot (caso que Producción pierde)
- Unitaria: entidad 'orden' vigente aparece como Orden, una versión no vigente se excluye y no hay ids duplicados con los congelados
- Unitaria de mapeo de tipo: CAD=CAD, DIBUJO=Plano, tecnico=Técnico; 'pdf', 'general', null y desconocida = '-'
- Unitaria: retirado_en no nulo se excluye; id del snapshot sin fila se muestra 'No disponible' sin lanzar; snapshot sin entidad ni revision_letra (órdenes previas) degrada a 'Propuesta' o '-' tomando entidad de la fila
- Servicio con cliente simulado: sin incluirFinanzas, archivos viene poblado y snapshot, totales y moneda son null; JSON.stringify de la ficha no contiene precio_unitario ni subtotal
- Componente: ficha-panel-archivos renderiza las cuatro columnas, '(general)' y 'No disponible', y no imprime UUID ni la palabra snapshot

**Riesgos:**
- Fuga de precios si al leer el snapshot para todos no se condicionan snapshot, totales (211) y moneda (207) a incluirFinanzas; exige la prueba de no-fuga y coordinar con R07/R11
- La regla de Tipo es inferencia del ejemplo del cliente (DIBUJO=Plano, CAD=CAD, PDF de propuesta='-'); clase es texto libre sin catálogo único; confirmar con el PO y evitar heurísticas por extensión o PDF técnico
- Órdenes sin snapshot válido (histórico OP-######, snapshot vacío) mostrarán lista vacía; Producción cae a la carpeta RFQ viva para esas y la ficha no debe hacerlo (rompería lo congelado)
- retirado_en: el RPC vigente solo filtra vigente y retirar solo se permite en revisiones DRAFT (retirar-archivo-propuesta.ts:95-97), por lo que todo archivo retirado en el snapshot ya lo estaba antes de nacer la orden; el filtro en lectura corrige la ficha pero Producción lo seguirá mostrando
- La ficha usa service_role (sin RLS): la única barrera es can(orden_vista) de la página; un enlace de descarga sin can() propio y comprobación de pertenencia sería una fuga (obtenerUrlDocumentoOrdenAccion exige gestionar_produccion, no orden_vista)
- Dos canales de adjuntos propios (archivos_orden legada y archivos entidad 'orden'): solo el segundo se reflejará
- Una o dos consultas extra por ficha (archivos por .in con ids únicos; propuesta_items solo si hay rfq_item), acotadas por el tamaño de la orden
- Asume que rfq_item e ITxx de propuesta_items coinciden (comentario de tabla: ITxx estable heredado del RFQ); se usa la misma fuente que las Partidas (codigo_item copiado de propuesta_items)

**Preguntas al PO:**
- ¿Los adjuntos subidos a la Orden (Producción, entidad 'orden') deben aparecer con Origen=Orden, y qué se hace con los del diálogo legado de la cola (archivos_orden)?
- Regla de Tipo: ¿basta el mapa por clase (CAD=CAD, DIBUJO=Plano, tecnico=Técnico, resto '-') o se quiere inferir CAD por extensión (dxf, dwg, step, igs)?
- ¿Un archivo retirado de la propuesta antes de crear la Orden debe ocultarse en Archivos vivos? (se propone que sí)
- ¿Un archivo del RFQ heredado se rotula 'RFQ' (origen real) y no 'Propuesta Rev X'? (se propone origen real; coincide con el ejemplo)
- ¿Se requiere abrir o descargar desde la ficha o basta con listar? Si se descarga, ¿con qué permiso: orden_vista o gestionar_produccion?
- ¿Qué roles con orden_vista pero sin ver_finanzas deben ver Archivos vivos? (la nota sección 11 indica que operador y servicio a clientes sí; se propone todos los que acceden a la ficha)

**Evidencia:**
- supabase/migrations/20261012100000_b4_obs2_flujo_versiones.sql:1115-1161, 1218-1251 — Definición VIGENTE (no C3.1). Cabecera: jsonb con archivo_id, entidad, clase, tema_codigo, nombres, mime, revision_id, revision_letra (nulas salvo propuesta_revision); filtra solo a.vigente (1143), no retirado_en; rfq_item solo vía propuesta_items.rfq_item_id de la revisión aceptada (1152-1159); no copia blobs ni guarda entidad_id. Por ítem: propuesta_item del mismo codigo en A..aceptada con item_id y revision_letra (sin entidad).
- supabase/migrations/20261013100000_b4_obs6_archivos_retiro.sql:6-18 — archivos.retirado_en/retirado_por: soft-delete que no toca vigente. Es posterior (10-13) al RPC vigente (10-12), que no lo filtra; tipos generados ya lo incluyen (src/compartido/tipos/supabase.ts:225-226).
- src/modulos/ordenes/servicios/ficha-orden-servicio.ts:47-49, 55-63, 151-178, 207-211 — snapshot_json solo se consulta con incluirFinanzas; sin él snapshot=null y archivos=[] (153). Con él arma ArchivoFicha solo del snapshot: origen fijo 'revision' (cabecera, itemCodigo null) o 'item'; ignora entidad y revision_letra; no consulta archivos. El select de la orden no incluye propuesta_revision_id. moneda/snapshot/totales (207, 210, 211) dependen de snapshotJson.
- src/app/(privado)/ordenes/[id]/page.tsx:17, 25-27 — Gate can(orden_vista); el servicio recibe crearClienteSupabaseAdmin() (sin RLS) e incluirFinanzas = ver_finanzas. Es el único consumidor del servicio.
- src/modulos/ordenes/componentes/ficha-orden.tsx:157-159, 350-359, 413-428 — Solo se oculta la pestaña Documento sin finanzas; Archivos vivos se ve para todos. El panel es una lista flex con nombreErp ?? nombreOriginal ?? archivoId (UUID de respaldo, 420), texto 'clase · ítem X / revisión' (423) y mensaje de vacío con la palabra snapshot (416). La tabla de Partidas (350-359) es el patrón visual a seguir. El componente es 'use client' (línea 1).
- src/modulos/ordenes/tipos/orden-sii.ts:63-70, 103-122 — ArchivoSnapshotOrden no tipa entidad, revision_id, revision_letra ni item_id aunque el JSON los trae; el guard esArchivoSnapshot solo exige archivo_id, así que añadir campos opcionales no lo endurece. ArchivoFicha (tipos/ficha-orden.ts:38-46) no tiene entidad, revisionLetra, tipo ni propios de Orden.
- src/modulos/produccion/servicios/documentos-orden-servicio.ts:157-162, 184-188, 227-293 — Precedente: rfq_item resuelve ITxx vía propuesta_items.rfq_item_id y se unen archivos entidad 'orden'. Pero propuesta_item resuelve ITxx solo con los ítems de la revisión aceptada y no cae a metadata.itemCodigo (pierde el ITxx de Rev A si la orden nace de Rev B); no lleva clase ni letra; columnasArchivo (227-228) no incluye retirado_en.
- src/modulos/propuestas/acciones/generar-pdf-revision.ts:146-152 — El PDF generado se registra como entidad propuesta_revision, clase 'pdf', nombre_erp '<folio_revision>.pdf' (coincide con el ejemplo del cliente CNC-1026_04-A.pdf | Propuesta Rev A | general | -). Otras clases: RFQ enum en esquemas-rfq.ts:143; propuesta manual tema general|tecnico (esquemas-propuestas.ts:233, subir-archivo-propuesta.ts:153); Orden 'OTROS' (subir-documento-orden.ts:127-129).

**Notas de verificación:** Se confirma el diagnóstico central del lector (parcial, sin migración, derivar en lectura, sin duplicar blobs). Correcciones: (1) la definición vigente de crear_orden_desde_revision es 20261012100000_b4_obs2 (967-1421), no C3.1; la forma del snapshot es la misma, cambian las líneas citadas. (2) La ficha NO usa un cliente con RLS: page.tsx:25 pasa crearClienteSupabaseAdmin(); el riesgo de privado.puede_ver_archivo del lector no aplica a la lectura de la ficha, el riesgo real es el gate de página y no filtrar de más. (3) Omisión grave del lector: el servicio solo lee snapshot_json con incluirFinanzas (55-63), así que sin ver_finanzas la lista es siempre vacía; el cambio mínimo debe leer el snapshot siempre pero seguir exponiendo snapshot/totales/moneda solo con finanzas, con prueba de no-fuga. (4) Omisión: archivos.retirado_en (b4_obs6) no es filtrado por el RPC; se agrega el filtro en lectura. (5) Refutado reutilizar construirDocumentosCongelados: pierde ITxx de propuesta_item de revisiones anteriores (184-188), no lleva clase ni letra y acopla módulos; el ITxx de propuesta_item sale del contenedor item.codigo del snapshot y solo rfq_item usa propuesta_items. (6) Tipo: se elimina la heurística por extensión y el criterio PDF técnico; mapa solo por clase (coincide con el ejemplo del cliente, PDF de propuesta='-'). (7) Falta añadir propuesta_revision_id al select de la orden. (8) La UI cae al UUID (420), contradice R03; se quita. (9) Se descarta el hallazgo de clave React duplicada: cabecera (rfq, rfq_item, propuesta, propuesta_revision) e ítems (propuesta_item) son entidades disjuntas y la clave es única, no reproducible con la salida del RPC. (10) Nombre visible: se mantiene nombre_erp ?? nombre_original, que coincide con el ejemplo del cliente (el PDF generado tiene nombre_erp CNC-1026_04-A.pdf).

**Omisiones halladas por el verificador:**
- supabase/migrations/20261012100000_b4_obs2_flujo_versiones.sql: Es la definición vigente de crear_orden_desde_revision; el lector citó C3.1 (superada).
- src/app/(privado)/ordenes/[id]/page.tsx: La ficha lee con cliente admin y gate can(orden_vista); el riesgo de RLS del lector estaba mal planteado.
- src/modulos/ordenes/servicios/ficha-orden-servicio.ts: Gating por incluirFinanzas (55-63): archivos vacíos para quien no ve finanzas; el cambio debe leer el snapshot siempre sin exponer precios (207, 210, 211) y agregar propuesta_revision_id al select.
- supabase/migrations/20261013100000_b4_obs6_archivos_retiro.sql: archivos.retirado_en (soft-delete) no filtrado por el RPC ni por Producción; el lector no lo leyó.
- src/modulos/produccion/servicios/documentos-orden-servicio.ts: Pierde el ITxx de propuesta_item de revisiones anteriores (184-188); por eso no debe reutilizarse construirDocumentosCongelados.
- src/modulos/ordenes/componentes/ficha-orden.tsx: Respaldo al UUID (420) y mensaje con la palabra snapshot (416); el patrón de tabla de Partidas (350-359) es la referencia de UI.
- tests/unitarias/produccion-documentos-orden-panel.test.ts: Prueba adyacente no listada por el lector; junto con las pruebas C4.3 de confidencialidad conviene correrla como regresión.

### Hallazgos extra (fuera del alcance; solo para decisión del PO)
- [media] Producción y el RPC de la Orden incluyen archivos retirados de la propuesta (supabase/migrations/20261012100000_b4_obs2_flujo_versiones.sql): El RPC vigente filtra solo a.vigente (líneas 1143 y 1247) y retirar (b4_obs6) no toca vigente, así que un archivo quitado en una revisión DRAFT reaparece congelado en la Orden. Producción (documentos-orden-servicio.ts:227-293) no selecciona ni filtra retirado_en y puede firmarlo. La ficha lo ocultará con el filtro en lectura, pero Producción no: requiere decisión del PO (corregir el RPC en migración aparte y alinear Producción).
- [media] Pestañas Archivos vivos y Ruta vacías para roles sin ver_finanzas (src/modulos/ordenes/servicios/ficha-orden-servicio.ts): snapshot_json solo se carga con incluirFinanzas (55-63) y ficha-orden.tsx:161-164 deriva la ruta de ficha.snapshot; sin ver_finanzas ambas pestañas salen vacías aunque se muestran a todo orden_vista, contra la sección 11 de la nota. No se verificó qué roles poseen orden_vista sin ver_finanzas (matriz de permisos no leída).
- [media] Dos canales de adjuntos propios de la Orden (src/modulos/ordenes/acciones/archivos-orden.ts): El diálogo de la cola (tabla-ordenes.tsx:725) escribe en la tabla legada archivos_orden (línea 108) y el bucket archivos-orden-historica; Producción registra en archivos con entidad 'orden' (subir-documento-orden.ts:124-129). La ficha no muestra ninguno hoy y tras el cambio solo el segundo.
- [baja] Producción pierde el ITxx de archivos de ítem de revisiones anteriores (src/modulos/produccion/servicios/documentos-orden-servicio.ts): Líneas 184-188: para entidad propuesta_item resuelve ITxx solo con los ítems de la revisión aceptada y no cae a metadata.itemCodigo del snapshot; una Orden creada desde Rev B muestra sin ítem los archivos de ítems de Rev A. Fuera del alcance de R09; no se toca sin aprobación.
- [baja] Clase de archivo sin catálogo único (src/modulos/propuestas/acciones/subir-archivo-propuesta.ts): archivos.clase es texto libre: RFQ usa CAD|DIBUJO|IMAGEN|ESPECIFICACIONES|OTROS (esquemas-rfq.ts:143), la propuesta guarda clase=tema general|tecnico (línea 153), el PDF generado 'pdf' (generar-pdf-revision.ts:150) y Producción 'OTROS'. El mapa de Tipo debe ser defensivo.

### Limitaciones
- No se leyó liberar_orden ni aceptar_revision/procesar_solicitud_orden: no se confirmó qué cuenta como archivos vivos al liberar ni que una revisión aceptada no pueda volver a DRAFT; la afirmación todo retirado ya lo estaba antes de la orden se apoya en retirar-archivo-propuesta.ts:95-97 (solo DRAFT).
- No se verificó qué roles poseen orden_vista sin ver_finanzas (matriz de permisos no leída), por lo que el alcance real de la brecha para operadores es inferido.
- No se leyó el cuerpo de las pruebas listadas ni los pgTAP; su cobertura se infiere por nombre y por grep (sin referencias a ficha-panel-archivos, obtenerFichaOrdenServicio ni incluirFinanzas en tests/).
- No se verificó la forma del snapshot de órdenes creadas con el RPC original de B5 (20261007120001); la propuesta toma entidad de la fila de archivos, por lo que degrada sin depender del snapshot.
- Se asume que rfq_items.codigo y propuesta_items.codigo coinciden para ítems enlazados (comentario de la tabla: ITxx estable heredado del RFQ) y que propuesta_revision_id está poblado en órdenes recientes.
- Revisión de solo lectura: no se ejecutaron pruebas, tipos ni consultas remotas.

## Área «cola» (verificada) — Órdenes - Cola de Órdenes (lista /ordenes)

**Cómo funciona hoy:** La cola (tabla-ordenes.tsx) tiene las columnas Folio, Estado, Prioridad, Compromiso, Partidas, Avance y Acciones (líneas 484-494). La columna Acciones ofrece hasta 9 controles por fila: Abrir, Liberar, Cerrar administrativa, Comentarios, Documento, Repetir, Reactivar, Adjuntos y Cancelar (572-671). La ficha ya tiene Liberar, Cancelar y Cerrar. No tiene Comentarios (HiloComentarios solo lo importan la tabla y otros módulos, no ficha-orden.tsx). Tampoco tiene Adjuntos legacy. La ficha ya expone idHistorico (tipos/ficha-orden.ts:68), así que no hace falta cambiar el tipo. page.tsx lee ordenId de la URL (línea 25) y lo pasa como ordenInicialId a la tabla (146), que abre el diálogo de Comentarios. Esa ruta de deep link se usa en 5 sitios. Es necesario reubicar Comentarios y Adjuntos y redirigir el deep link antes de retirar los botones.

### R01 — cumple (confirmado) · esfuerzo XS

**Estado actual:** Los encabezados son Folio, Estado, Prioridad, Compromiso, Partidas, Avance y Acciones. Cada fila tiene un enlace Abrir a /ordenes/[id] (574-580). El semáforo de compromiso, la prioridad coloreada, el scrap y la barra de avance existen. Las señales de atención (chips de estado, bandejas, semáforo) cubren "qué necesita atención". El avance es solo de producción, no de entrega.

**Cambio mínimo:** ninguno

**Pruebas afectadas:**
- tests/unitarias/tabla-ordenes-c4-3.test.ts

**Riesgos:**
- El avance solo mide producción, lo que puede confundir con la regla "producción completada no es orden cerrada". La nota no pide cambiarlo.

**Preguntas al PO:**
- ¿El avance debe seguir siendo solo de producción, o mostrar también lo entregado?

**Evidencia:**
- src/modulos/ordenes/componentes/tabla-ordenes.tsx:484-494 — Encabezados Folio, Estado, Prioridad, Compromiso, Partidas, Avance y Acciones.
- src/modulos/ordenes/componentes/tabla-ordenes.tsx:537-571 — Celdas de Estado, Prioridad, Compromiso, Partidas y Avance con semáforo y barra.
- src/modulos/ordenes/componentes/tabla-ordenes.tsx:574-580 — Link abrir-ficha-{folio} a /ordenes/{id}.

### R02 — contradice (corregido) · esfuerzo M

**Estado actual:** La fila muestra hasta 9 controles. Los verifiqué todos en 572-671: abrir-ficha, liberar-orden (PLANIFICADA y puedeLiberar), cerrar-administrativa, Comentarios (sin testid), DocumentoOrdenBoton (puedeVerFinanzas), repetir-orden, reactivar-orden, adjuntos-orden (idHistorico !== null) y cambiar-estado-cancelada. La ficha ya cubre Liberar, Cancelar y Cerrar, y tiene una pestaña Documento. Le faltan Comentarios y Adjuntos legacy, y no monta Repetir ni Reactivar. El diálogo de Comentarios de la cola es el destino de /ordenes?ordenId=. Ese enlace lo generan notificar-menciones-correo.ts:46, enlace-registro.ts:15 y 31, historial-cliente.tsx:262 y 375, y acciones-tarjeta-orden.tsx:66. Los otros ordenId= que aparecen en el grep (/produccion?ordenId y el estado local de cobranza) no se ven afectados.

**Cambio mínimo:** Orden estricto: reubicar y luego retirar. 1) En la ficha, agregar la sección o pestaña Comentarios con HiloComentarios (entidadTipo 'orden') y pasar usuarioActualId y puedeEliminarTodos desde [id]/page.tsx. 2) En la ficha, agregar un botón Adjuntos con AdjuntosOrdenDialog cuando orden.idHistorico !== null. 3) En ordenes/page.tsx, si llega ordenId, hacer redirect a /ordenes/{ordenId}. Eso mantiene vivos los 5 sitios de deep link sin tocarlos. 4) Después, en la cola dejar Abrir y solo Liberar (PLANIFICADA y puedeLiberar). Retirar Cerrar, Comentarios, Documento, Adjuntos y Cancelar, además de sus estados, diálogos y props. 5) Repetir y Reactivar: por la sección 10 de la nota se retiran o deshabilitan. Eso es otra área, así que hasta que haya decisión no se pierde nada, porque no tienen destino en la ficha. Sin cambios en servidor ni migración.

**Enfoque descartado:** Menú kebab o tarjetas con permisos y server actions nuevas: más pesado y la nota no lo pide. También se descarta retirar los botones primero, porque dejaría sin acceso a Comentarios, a Adjuntos legacy y a los deep links.

**Archivos a tocar:**
- src/modulos/ordenes/componentes/ficha-orden.tsx
- src/app/(privado)/ordenes/[id]/page.tsx
- src/app/(privado)/ordenes/page.tsx
- src/modulos/ordenes/componentes/tabla-ordenes.tsx

**Impacto en otros módulos:**
- [medio] Comentarios (src/modulos/comentarios/servicios/notificar-menciones-correo.ts): El enlace /ordenes?ordenId= debe resolverse por redirect a la ficha.
- [medio] Auditoría (src/modulos/auditoria/utilidades/enlace-registro.ts): Depende del mismo redirect.
- [bajo] Clientes (src/modulos/clientes/componentes/historial-cliente.tsx): Depende del mismo redirect.
- [bajo] Planeación (src/modulos/planeacion/componentes/acciones-tarjeta-orden.tsx): Navega a /ordenes?ordenId=; depende del mismo redirect.
- [bajo] Órdenes (src/modulos/ordenes/componentes/configurar-procesos-dialog.tsx): Importa tipos de tabla-ordenes; mantenerlos sin cambios.
- [bajo] Órdenes (src/modulos/ordenes/componentes/editar-orden-dialog.tsx): Importa tipos de tabla-ordenes; mantenerlos sin cambios.

**Pruebas afectadas:**
- tests/unitarias/tabla-ordenes-c4-3.test.ts
- tests/unitarias/ficha-orden-c4-2.test.ts
- tests/e2e/comentarios-notificaciones.spec.ts
- tests/e2e/ordenes-edicion-borrador.spec.ts
- tests/e2e/ordenes-estados-sii.spec.ts
- tests/e2e/cancelacion-financiera.spec.ts
- tests/e2e/ordenes-heredadas-reactivacion.spec.ts

**Pruebas nuevas (RED):**
- Unitaria RED: la ficha muestra Comentarios y monta HiloComentarios con el id de la orden.
- Unitaria RED: la ficha muestra Adjuntos solo si idHistorico no es null.
- Unitaria RED: la fila de la cola solo tiene abrir-ficha y, en PLANIFICADA con puedeLiberar, liberar-orden.
- E2E o unitaria RED: /ordenes?ordenId=X redirige a /ordenes/X.
- E2E: migrar cancelación, cierre y comentarios a la ficha (ficha-cancelar, ficha-cerrar).

**Riesgos:**
- Retirar Comentarios antes de reubicarlos rompe los deep links de correo, auditoría, historial y Planeación.
- Los adjuntos legacy quedarían inaccesibles si no se reubican.
- Repetir y Reactivar quedan sin destino y se pierden las E2E de ordenes-heredadas-reactivacion; la sección 10 de la nota ya prevé retirarlas.
- Quitar botones no reduce la protección del backend: las acciones mantienen can() propio.

**Preguntas al PO:**
- ¿El deep link de comentarios debe aterrizar en una pestaña Comentarios de la ficha?
- ¿Comentarios va como pestaña nueva o como sección dentro de Resumen? La nota pide Actividad separada de Comentarios.
- ¿Repetir y Reactivar se retiran de la cola ya, aunque no tengan destino en la ficha?

**Evidencia:**
- src/modulos/ordenes/componentes/tabla-ordenes.tsx:572-671 — Las 9 acciones por fila con sus condiciones y testids.
- src/modulos/ordenes/componentes/tabla-ordenes.tsx:696-816 — Diálogos montados (Comentarios, Adjuntos, Repetir, Reactivar, Cancelar, Cierre), según el informe del lector. No los releí.
- src/app/(privado)/ordenes/page.tsx:25, 146 — ordenId de la URL pasa como ordenInicialId a la tabla.
- src/modulos/ordenes/tipos/ficha-orden.ts:68 — FichaOrden ya expone idHistorico, así que no hace falta ampliar el tipo.
- src/modulos/ordenes/componentes/ficha-orden.tsx:245-268 — Ficha con Liberar, Cancelar y Cerrar administrativa, según el informe del lector. Verifiqué por grep que no usa HiloComentarios ni AdjuntosOrdenDialog.
- src/modulos/comentarios/servicios/notificar-menciones-correo.ts:46 — El correo de menciones enlaza a /ordenes?ordenId=.
- src/modulos/auditoria/utilidades/enlace-registro.ts:15, 31 — Genera /ordenes?ordenId=.
- src/modulos/clientes/componentes/historial-cliente.tsx:262, 375 — Enlaces a /ordenes?ordenId= para orden y nota de entrega.

**Notas de verificación:** Confirmé lo del lector sobre las 9 acciones, la falta de Comentarios y Adjuntos en la ficha, y los deep links. Corregí dos cosas. Primero, FichaOrden sí expone idHistorico (tipos/ficha-orden.ts:68), así que no hay que tocar tipos ni el servicio de ficha. Segundo, el redirect en ordenes/page.tsx resuelve los 5 sitios de deep link sin editarlos, por lo que los quité de los archivos a tocar. No releí los diálogos ni ficha-orden.tsx 245-268; esas citas vienen del lector.

**Omisiones halladas por el verificador:**
- src/modulos/ordenes/componentes/tabla-ordenes.tsx: Tras retirar las acciones, hay que limpiar los props de permisos que queden sin uso (puedeCerrar, puedeCancelar, puedeAdministrar, puedeVerFinanzas, usuarioActualId, puedeEliminarTodos) y el prop ordenInicialId, junto con los valores que les pasa ordenes/page.tsx.

### Hallazgos extra (fuera del alcance; solo para decisión del PO)
- [baja] Botón Comentarios de la cola sin data-testid (src/modulos/ordenes/componentes/tabla-ordenes.tsx): Líneas 608-614. Las pruebas lo localizan por rol y nombre. Se vuelve irrelevante al reubicarlo en la ficha, donde convendría darle un data-testid.

### Limitaciones
- No releí los diálogos de Adjuntos, Repetir, Reactivar ni DocumentoOrdenBoton, ni ficha-orden.tsx 245-268; esas citas son del lector.
- No leí [id]/page.tsx para ver qué props de permisos recibe la ficha.
- No verifiqué la RPC liberar_orden más allá de lo que reportó el lector.
- No leí los archivos de prueba; los números de línea de las pruebas afectadas vienen del lector.

## Área «documento-permisos» (verificada) — Documento de Orden, permisos por rol y confidencialidad económica en backend (módulo Órdenes)

**Cómo funciona hoy:** El documento de Orden vive en un diálogo imprimible (obtenerDocumentoOrdenAccion) y en la pestaña Documento de la ficha. Ambos exigen ver_finanzas y mezclan datos de fabricación con economía. La acción valida orden_vista y ver_finanzas con can() y lee con service_role. La ficha (/ordenes/[id]) lee snapshot_json solo si el usuario tiene ver_finanzas. Sin él, el snapshot es null y se pierden también ITxx, material, espesor, ruta y archivos. No existe hoja de trabajo sin precios. La migración C4.3 revoca SELECT de tabla a authenticated en ordenes_produccion y concede solo columnas operativas, así que snapshot_json, condicion_pago y monto_* quedan para service_role. La base backend es sólida. Los huecos son: no hay variante operativa, la ficha sin finanzas queda sin contenido útil, Realtime en navegador no está verificado, y el seed no da ver_finanzas a gerente ni a vendedor.

### R16 — cumple (confirmado) · esfuerzo XS

**Estado actual:** La acción obtenerDocumentoOrdenAccion exige orden_vista y ver_finanzas, compone con service_role y devuelve errores genéricos. El documento trae precios, subtotal, descuento, IVA, total y moneda desde el snapshot congelado. La ficha repite la pestaña Documento solo con puedeVerFinanzas e imprime con window.print(). El seed local solo da ver_finanzas a admin y contador (000002 líneas 62 y 78). En la migración B1 gerente recibe orden_vista (línea 164) pero no ver_finanzas; ver_finanzas solo se define en el catálogo (línea 52). Customer Service y Management ven el documento solo si el admin les asigna ver_finanzas por la matriz. La acción no usa Zod: solo comprueba typeof ordenId, desviación menor de convención.

**Cambio mínimo:** Ninguno en código. Decisión del PO: sembrar ver_finanzas a gerente (y a vendedor si Customer Service debe ver totales) con una migración de datos idempotente ON CONFLICT DO NOTHING. Opcional y menor: cambiar typeof por esquema Zod uuid.

**Archivos a tocar:**
- supabase/migrations/<AAAAMMDDNNNNNN>_orden_documento_permisos_roles.sql (solo si el PO lo decide)
- src/modulos/ordenes/acciones/obtener-documento-orden.ts (solo Zod, opcional)

**Impacto en otros módulos:**
- [alto] Cobranza, Gastos, Tesorería, Compras, Dashboard (supabase/migrations/20260814143339_fase_8_cobranza_base.sql): ver_finanzas gobierna la RLS de cobranza, gastos, compras y tesorería. Asignarlo a gerente o vendedor amplía el acceso fuera de Órdenes.

**Pruebas afectadas:**
- tests/unitarias/orden-documento-confidencialidad-c4-3.test.ts
- tests/unitarias/ordenes-documento.test.ts
- tests/unitarias/ficha-orden-c4-2.test.ts

**Pruebas nuevas (RED):**
- Solo si el PO amplía el alcance: unitaria de que el documento incluye condiciones de pago

**Riesgos:**
- ver_finanzas es un permiso grueso. Si el vendedor debe ver totales de Orden pero no cobranza, hace falta un permiso nuevo (por ejemplo orden_ver_totales).
- El estado real de permisos_rol en producción no es verificable desde las migraciones locales.

**Evidencia:**
- src/modulos/ordenes/acciones/obtener-documento-orden.ts:17-37 — can(orden_vista) y can(ver_finanzas), service_role, error genérico con console.error. Valida ordenId con typeof, sin Zod.
- src/modulos/ordenes/componentes/ficha-orden.tsx:157-159, 489-535 — La pestaña Documento se filtra sin puedeVerFinanzas; el documento muestra ITxx, material, espesor, ruta y Totales.
- src/modulos/ordenes/componentes/tabla-ordenes.tsx:615 — El botón Documento depende de puedeVerFinanzas.
- supabase/migrations/20261005100001_sii_b1_permisos_catalogo.sql:52, 164, 183 — ver_finanzas solo en catálogo; gerente y contador reciben orden_vista.
- supabase/migrations/20260703000002_crear_tabla_permisos_rol.sql:62, 78 — ver_finanzas se siembra solo para admin y contador.

**Notas de verificación:** Confirmé acción, pestaña, botón de la cola y seed. Añadí que la acción no usa Zod.

**Omisiones halladas por el verificador:**
- src/modulos/ordenes/acciones/obtener-documento-orden.ts: Validación por typeof en lugar de Zod.

### R17 — ausente (corregido) · esfuerzo M

**Estado actual:** No hay variante operativa sin precios. Sin ver_finanzas, la ficha no lee snapshot_json (ficha-orden-servicio.ts 55-63), así que snapshot = null y la pestaña Documento se oculta. Ruta y archivos, que dependen del snapshot, quedan vacíos. Las partidas sí llegan (select('*') de partidas_orden_produccion con codigo_item, descripcion, cantidad_solicitada y procesos), pero sin material ni espesor. Material y espesor existen como texto libre solo en items[] del snapshot, junto a precio_unitario. El rol operador no tiene orden_vista; el piso consume solo documentos y archivos por la acción de Producción.

**Cambio mínimo:** Proyección 'hoja de trabajo' sin economía dentro de la ficha existente. Cuando no hay ver_finanzas, leer snapshot_json con el cliente de servicio ya usado y construir una versión por lista blanca: por ítem codigo, descripcion, cantidad, material, espesor, notas, ruteo y archivos, sin precio_unitario ni es_descuento; cabecera sin campos económicos y totales = null. La pestaña Documento muestra la hoja de trabajo cuando falta ver_finanzas, reutilizando el marcado sin Totales. Una acción nueva solo si el piso o el operador con PIN van a imprimirla.

**Enfoque descartado:** Servicio y acción nuevos para todos los casos (propuesta del lector): más pesado, porque la ficha ya autoriza por orden_vista. Tampoco dar ver_finanzas al operador ni ocultar precios solo en frontend (viola R18).

**Archivos a tocar:**
- src/modulos/ordenes/servicios/ficha-orden-servicio.ts
- src/modulos/ordenes/tipos/ficha-orden.ts
- src/modulos/ordenes/componentes/ficha-orden.tsx
- src/modulos/ordenes/servicios/hoja-trabajo-orden-servicio.ts (nuevo, función pura de lista blanca)

**Impacto en otros módulos:**
- [bajo] Producción (piso) (src/modulos/produccion/componentes/documentos-orden-panel.tsx): Consumidor natural de la hoja de trabajo si el PO lo pide.
- [bajo] Órdenes (cola) (src/modulos/ordenes/componentes/tabla-ordenes.tsx): El botón Documento depende de puedeVerFinanzas; el cliente pidió mover acciones a la ficha.

**Pruebas afectadas:**
- tests/unitarias/ficha-orden-c4-2.test.ts
- tests/unitarias/tabla-ordenes-c4-3.test.ts
- tests/unitarias/orden-documento-confidencialidad-c4-3.test.ts

**Pruebas nuevas (RED):**
- Unitaria RED: la hoja de trabajo serializada con JSON.stringify a partir de un snapshot con precios no contiene precio_unitario, subtotal, iva, total, costo, margen ni moneda.
- Unitaria RED: ficha sin ver_finanzas devuelve items, archivos, material y espesor, con totales null y sin precio_unitario.
- Unitaria RED: la hoja contiene cliente, folio, ITxx, descripción, cantidad, material, espesor, procesos, observaciones y archivos.
- Unitaria RED: la lista blanca ignora campos extra del snapshot.

**Riesgos:**
- La lista blanca debe mantenerse si el snapshot agrega campos.
- Las órdenes sin snapshot no tienen material ni espesor legibles.
- Los operadores con PIN o vista delegada no pasan por can() de Supabase Auth; falta confirmar la guardia.

**Preguntas al PO:**
- ¿La hoja de trabajo es solo pestaña de la ficha (roles con orden_vista) o también debe imprimirse desde el piso para el operador con PIN?
- ¿Qué roles con orden_vista y sin ver_finanzas la reciben: gerente y vendedor?

**Evidencia:**
- src/modulos/ordenes/servicios/ficha-orden-servicio.ts:55-63, 151-178, 207-211 — El snapshot solo se lee con incluirFinanzas. Los archivos se derivan del snapshot. Con finanzas se entrega snapshot completo y totales.
- src/app/(privado)/ordenes/[id]/page.tsx:17-27 — incluirFinanzas = can(ver_finanzas), independiente del acceso por orden_vista.
- src/modulos/ordenes/componentes/ficha-orden.tsx:157-159, 489-514 — El documento con material y espesor solo existe para ver_finanzas.
- src/modulos/ordenes/tipos/orden-sii.ts:72-87 — ItemSnapshotOrden mezcla material, espesor, ruteo y archivos con precio_unitario (según el lector; no reabierto).
- supabase/migrations/20261005100001_sii_b1_permisos_catalogo.sql:186-189 — operador: produccion_operar y calidad, sin orden_vista (según el lector).

**Notas de verificación:** Confirmé el estado ausente. Cambié el cambioMinimo: el lector proponía acción y servicio nuevos más refactor de varios archivos; basta extender la ficha con una proyección por lista blanca.

**Omisiones halladas por el verificador:**
- src/modulos/ordenes/servicios/ficha-orden-servicio.ts: Línea 68: partidas con select('*'), regresión potencial si se añaden columnas económicas.

### R18 — parcial (corregido) · esfuerzo S

**Estado actual:** Con C4.3, authenticated no puede leer snapshot_json, condicion_pago, monto_sin_iva ni monto_iva de ordenes_produccion (REVOKE y GRANT por columna, líneas 5-14). La ficha selecciona columnas explícitas y lee el snapshot solo con finanzas. El documento lleva doble can(). Las partidas se leen con select('*'), hoy sin columnas económicas. Huecos: (a) con ver_finanzas, el snapshot completo y los totales viajan al cliente mezclados con lo operativo, aceptable para ese rol; (b) la RLS de ordenes_produccion y partidas es USING (true) para authenticated (según el lector); (c) ordenes_produccion y partidas están publicadas en supabase_realtime (migración 000052820, líneas 808-833) y cinco sincronizadores del navegador se suscriben. Los handlers ignoran el payload, pero no se verificó si Realtime entrega columnas sin GRANT; es un riesgo plausible, no confirmado.

**Cambio mínimo:** (1) Al implementar R17, la ficha sin ver_finanzas ya no recibe precios; la prueba de serialización cubre R18 en servidor. (2) Reemplazar select('*') de partidas por columnas explícitas. (3) Verificar Realtime en entorno real; si expone columnas sin GRANT, sacar ordenes_produccion de los sincronizadores de navegador o de la publicación, o usar el relay de señal vacía. (4) Prueba de integración o pgTAP de que partidas_orden_produccion no tiene columnas económicas.

**Enfoque descartado:** Vistas SQL por rol o RLS por rol en cada tabla: C4.3 más can() en servidor ya basta. Separar un campo 'economia' en el DTO es opcional.

**Archivos a tocar:**
- src/modulos/ordenes/servicios/ficha-orden-servicio.ts
- tests/unitarias/ficha-orden-c4-2.test.ts
- tests/integracion/c4-3-confidencialidad-ordenes.test.ts
- src/modulos/ordenes/componentes/sincronizador-ordenes-realtime.tsx (solo si se confirma fuga)

**Impacto en otros módulos:**
- [medio] Planeación, Cobranza, Dashboard y Producción (sincronizadores Realtime) (src/modulos/planeacion/componentes/sincronizador-planeacion-realtime.tsx): Cinco archivos *-realtime.tsx suscriben ordenes_produccion desde el navegador; cambiarlos afecta la frescura de la UI.

**Pruebas afectadas:**
- tests/unitarias/ficha-orden-c4-2.test.ts
- tests/unitarias/ordenes-confidencialidad-c4-3.test.ts
- tests/unitarias/orden-documento-confidencialidad-c4-3.test.ts
- tests/integracion/c4-3-confidencialidad-ordenes.test.ts
- supabase/tests/c4_3_confidencialidad_ordenes.test.sql

**Pruebas nuevas (RED):**
- Unitaria RED: obtenerFichaOrdenServicio sin ver_finanzas, JSON.stringify(ficha) no contiene precio_unitario, subtotal, iva, total ni moneda.
- Integración RED: una sesión authenticated no puede select('snapshot_json') ni select('*') en ordenes_produccion (ampliar a monto_* y condicion_pago).
- Integración o pgTAP: partidas_orden_produccion sin columnas de precio o costo.
- Prueba manual en entorno real: el payload Realtime de authenticated no incluye snapshot_json.

**Riesgos:**
- El hueco de Realtime tiene la mayor incertidumbre y no es verificable localmente.
- Un select('*') nuevo sobre ordenes_produccion fallaría en runtime por los privilegios por columna; mantener lista blanca.

**Evidencia:**
- supabase/migrations/20261010010303_c4_3_confidencialidad_ordenes.sql:5-14 — REVOKE SELECT de tabla y GRANT por columna sin snapshot_json, monto_*, condicion_pago.
- src/modulos/ordenes/servicios/ficha-orden-servicio.ts:45-63, 68, 207-211 — Select acotado; snapshot solo con incluirFinanzas; partidas con select('*'); totales derivados del snapshot.
- src/modulos/ordenes/acciones/obtener-documento-orden.ts:22-30 — Doble can() antes de usar service_role.
- supabase/migrations/20260812052820_endurecimiento_seguridad_realtime.sql:808-833 — ordenes_produccion y partidas_orden_produccion en la publicación supabase_realtime; el comentario dice que respetan RLS.
- supabase/migrations/20260812000000_fase_5_ordenes_produccion.sql:195-201 — Políticas SELECT USING (true) (según el lector; no reabierto).
- src/app/api/produccion-piso/sincronizacion/route.ts:30-34, 110-118 — Relay SSE con service_role que emite señal vacía (según el lector; no reabierto).

**Notas de verificación:** Confirmé la protección de C4.3, la ficha y la acción. Añadí la publicación de ordenes_produccion y partidas en Realtime con su comentario 'respetan RLS' (no cubre privilegios por columna), y marqué el select('*') de partidas como riesgo de regresión. No reabrí fase_5 ni el relay SSE.

**Omisiones halladas por el verificador:**
- supabase/migrations/20260812052820_endurecimiento_seguridad_realtime.sql: Publicación de ordenes_produccion en supabase_realtime: vía por la que podría salir snapshot_json.

### Hallazgos extra (fuera del alcance; solo para decisión del PO)
- [alta] Sin ver_finanzas la ficha pierde ruta, archivos, material y espesor (src/modulos/ordenes/servicios/ficha-orden-servicio.ts): Líneas 55-63 y 151-178: snapshot y archivos dependen de ver_finanzas. Un rol con orden_vista sin finanzas ve Ruta y Archivos vivos vacíos.
- [media] Seed sin ver_finanzas para gerente ni vendedor (supabase/migrations/20261005100001_sii_b1_permisos_catalogo.sql): Management y Customer Service no ven documento ni totales salvo asignación manual. Decisión del PO.
- [baja] RLS USING (true) en ordenes_produccion y partidas para authenticated (supabase/migrations/20260812000000_fase_5_ordenes_produccion.sql): La restricción depende de privilegios por columna y de can() en servidor. Cita tomada del lector, no reabierta.
- [baja] obtenerDocumentoOrdenAccion valida con typeof en vez de Zod (src/modulos/ordenes/acciones/obtener-documento-orden.ts): Línea 25: desvío menor de la convención de Zod para input externo.

### Limitaciones
- No se verificó si Supabase Realtime postgres_changes respeta privilegios por columna; requiere prueba en entorno real.
- No se verificó el contenido real de permisos_rol en producción.
- No reabrí fase_5 (líneas 195-201), el relay SSE de piso, orden-sii.ts ni las pruebas; esas citas son del lector.
- No se leyó la vista delegada C5 ni el piso con PIN.
- No se leyó documento-orden-servicio.ts ni las asignaciones de vendedor en el seed B1.

## Área «entregas-cierre» (verificada) — Órdenes: Entregas, cierre administrativo y estados (producción vs entrega)

**Cómo funciona hoy:** La Orden SII tiene 7 estados y CERRADA solo la fija cerrar_orden_administrativa, que exige estado PRODUCCION_COMPLETADA y, en cada partida, suma entregada >= cantidad_solicitada (b5, líneas 179-212; única definición en migraciones). registrar_entrega (b7) admite EN_PRODUCCION y PRODUCCION_COMPLETADA, permite parciales, topa por producido y por solicitado, y no cambia estado_sii. El trigger vigente archivar_orden_al_entregar (migración 20261007230002, no la D-04) archiva la orden y activa la AR al llegar al 100 %. El backend cumple lo pedido: parcial, bloqueo del cierre al 100 % y producción no equivale a cierre. La brecha es de presentación: ni la cola ni la ficha muestran saldo o avance de entrega, y el botón de cierre se habilita solo con PRODUCCION_COMPLETADA y permiso, aunque falten piezas.

### R11 — cumple (confirmado) · esfuerzo XS

**Estado actual:** La pestaña Entregas de la ficha tiene el Link 'Preparar entrega' a /entregas?orden=<id> (ficha-orden.tsx 436-443, testid ficha-preparar-entrega) y lista las notas con 'Parcial'/'Total' y suma de piezas (446-464). registrar_entrega acepta EN_PRODUCCION y PRODUCCION_COMPLETADA (b7 380-382), topa lo acumulado contra producido (422-435) y contra solicitado (437-450), y calcula es_parcial (452-462). No hay sobreentrega ni tolerancia. Confirmado en lectura directa.

**Cambio mínimo:** Ninguno funcional. Opcional XS: mostrar 'Entregado X/Y; faltan Z' en el panel Entregas con datos ya cargados en la ficha.

**Enfoque descartado:** Asistente o modal de entrega dentro de la ficha: el flujo /entregas ya cumple y el cliente lo dio por alineado.

**Archivos a tocar:**
- src/modulos/ordenes/componentes/ficha-orden.tsx

**Impacto en otros módulos:**
- [bajo] Entregas (src/modulos/entregas/acciones/preparar-entrega.ts): Sin cambios; es el destino del enlace.

**Pruebas afectadas:**
- supabase/tests/sii_b7_entregas.test.sql
- tests/e2e/entregas-flujo.spec.ts
- tests/unitarias/ficha-orden-c4-2.test.ts

**Pruebas nuevas (RED):**
- Unitaria RED: la pestaña Entregas muestra 'Entregado 30/50' con notas parciales (si se acepta el texto).

**Riesgos:**
- Entregar con la orden EN_PRODUCCION está permitido; si el cliente lo considera indebido habría que tocar la RPC y la cola de entregas.
- Con scrap, producido < solicitado impide llegar al 100 % entregado (ver R12).

**Preguntas al PO:**
- ¿Se confirma que se puede entregar con la orden EN_PRODUCCION (entrega parcial anticipada)?

**Evidencia:**
- src/modulos/ordenes/componentes/ficha-orden.tsx:430-466 — Panel Entregas: enlace Preparar entrega y notas con Parcial/Total y piezas.
- supabase/migrations/20261007140001_sii_b7_entregas.sql:380-382 — Solo EN_PRODUCCION y PRODUCCION_COMPLETADA son entregables; otro estado da orden_no_entregable.
- supabase/migrations/20261007140001_sii_b7_entregas.sql:422-450 — Topes por producido y por solicitado, con acumulado histórico.
- supabase/migrations/20261007140001_sii_b7_entregas.sql:452-462 — v_es_parcial verdadero si alguna partida queda por debajo de lo solicitado.

**Notas de verificación:** Citas reabiertas y correctas (ficha 430-466, b7 380-462). El enlace aparece en cualquier estado, incluso CERRADA o CANCELADA, como dice el informe.

### R12 — parcial (corregido) · esfuerzo S

**Estado actual:** El backend exige ambas condiciones: estado PRODUCCION_COMPLETADA (b5 182-184; CERRADA da orden_ya_cerrada) y entregado >= solicitado en cada partida (201-212), con error orden_no_entregada_completa. La acción verifica can('orden_cerrar_admin') y traduce los códigos (cerrar-orden-administrativa.ts 16-58). La UI no bloquea el botón: ficha-orden.tsx 261 y tabla-ordenes.tsx 593 lo muestran con solo estado + permiso, sin consultar cantidades. El modal informa pero no calcula (ficha 559-577). Con producción 50/50 y entrega 30/50 el cierre falla en servidor con el mensaje de 100 %. Callejón con scrap: como el tope de entrega es el producido y el cierre compara contra solicitado, una partida con producido < solicitado no se puede cerrar. Es posible solo si producción se completa con producido < solicitado; depende de las metas por proceso y no se verificó con datos. El cierre no toca cuentas_por_cobrar; la AR se activa en el trigger de entrega, que también archiva la orden.

**Cambio mínimo:** Sin migración. Función pura calcularSaldoEntrega(partidas solicitadas, entregadas). En la ficha, usar ficha.entregas para deshabilitar el botón con 'Faltan N piezas por entregar' si entregado < solicitado, dejando la RPC como autoridad. En la cola hace falta un entregado agregado por orden: una consulta en /ordenes/page.tsx o el servicio de listado, o dejar el botón habilitado y mostrar solo el saldo. Decidir con el PO la regla de scrap; solo si cambia habría que modificar la RPC.

**Enfoque descartado:** Cerrar automáticamente desde el trigger de entrega: cambia la semántica (el cierre es una acción con actor, permiso y CAS) y el cliente pide habilitar, no auto-cerrar. Tampoco reescribir la RPC.

**Archivos a tocar:**
- src/modulos/ordenes/utilidades/indice.ts
- src/modulos/ordenes/componentes/ficha-orden.tsx
- src/modulos/ordenes/componentes/tabla-ordenes.tsx
- src/modulos/ordenes/servicios/ordenes-servicio.ts
- src/app/(privado)/ordenes/page.tsx

**Impacto en otros módulos:**
- [medio] Dashboard/KPIs (supabase/migrations/20261007210001_sii_b9_kpis.sql): Solo se afecta si se cambia la regla del cierre.
- [bajo] Cobranza (supabase/migrations/20261007230002_sii_credito_dias_cliente.sql): La AR se activa por el trigger de entrega, no por el cierre.

**Pruebas afectadas:**
- supabase/tests/sii_b5_orden.test.sql
- tests/unitarias/tabla-ordenes-c4-3.test.ts
- tests/unitarias/ficha-orden-c4-2.test.ts
- tests/e2e/ordenes-estados-sii.spec.ts

**Pruebas nuevas (RED):**
- Unitaria RED: calcularSaldoEntrega(50 solicitado, 30 entregado) => faltan 20 y cierrePermitido=false.
- Componente RED: con PRODUCCION_COMPLETADA y 30/50 el botón ficha-cerrar está deshabilitado con 'Faltan 20'; con 50/50 está habilitado.
- pgTAP RED: cierre rechazado con 30/50 (sii_b5 hoy cubre solo el caso sin entrega); caso de scrap solo si el PO cambia la regla.

**Riesgos:**
- Callejón sin salida por scrap.
- El saldo del cliente es solo ayuda visual y puede divergir de la RPC.
- La cola necesita una consulta agregada adicional.

**Preguntas al PO:**
- ¿El 100 % se mide contra lo solicitado o lo producido? ¿Qué pasa con el scrap?
- ¿Se puede cerrar una orden 100 % entregada que aún figura EN_PRODUCCION?
- ¿Se admite tolerancia de sobreentrega o faltante?

**Evidencia:**
- supabase/migrations/20261007120002_sii_b5_orden_estados.sql:179-212 — Definición única de la RPC: valida estado, CAS, partidas y suma entregada < solicitado => orden_no_entregada_completa.
- src/modulos/ordenes/componentes/ficha-orden.tsx:261-267 — Botón ficha-cerrar con puedeCerrar && estado === PRODUCCION_COMPLETADA, sin saldo.
- src/modulos/ordenes/componentes/tabla-ordenes.tsx:593-607 — Mismo criterio en la cola; el title dice '100 % entregado' pero no se deshabilita.
- src/modulos/ordenes/acciones/cerrar-orden-administrativa.ts:16-58 — Permiso, mapa de errores y registro de log.
- supabase/migrations/20261007230002_sii_credito_dias_cliente.sql:35-87 — Definición vigente del trigger de entrega: con 100 % archiva y activa la AR (sustituye a la de D-04 que citó el lector).
- src/modulos/ordenes/servicios/ficha-orden-servicio.ts:120-128 — La ficha ya carga cantidadEntregada por partida y nota, así que el saldo se calcula sin consulta nueva.

**Notas de verificación:** Estado y evidencia confirmados. Corregí la cita del trigger: la definición vigente es 20261007230002 (35-87) y no la de 20260919000005. Precisé que la ficha ya trae lo entregado por partida, por lo que el botón de la ficha no necesita consulta nueva; solo la cola la necesita. Esa trigger ejecutada dentro de registrar_entrega puede lanzar cliente_credito_sin_dias (ver hallazgos).

### R13 — parcial (confirmado) · esfuerzo S

**Estado actual:** No hay estado ni etiqueta entre producción completada y cerrada: la orden sigue en PRODUCCION_COMPLETADA y registrar_entrega no cambia estado_sii. La cola solo trae archivadaEn (señal de 100 % entregado, tabla-ordenes 79, 530) y su Avance viene de calcularAvance(orden.partidas) (producido/solicitado). Por eso, con producción 50/50 y entrega 30/50 muestra 100 % y 'Producción completada' sin señal de las 20 piezas pendientes. La orden sí permanece abierta (no CERRADA, cerrada_admin_en nulo). La ficha igual: el panel Entregas solo lista notas y no hay saldo. resumen-ordenes ya distingue entregadas de completadas.

**Cambio mínimo:** Solo presentación, sin tocar enum, RPC ni KPIs: función pura etiquetaEntrega({estadoSii, solicitado, entregado}) => 'Pendiente de entrega' | 'Entrega parcial X/Y' | null. Mostrarla en el encabezado de la ficha (datos ya disponibles) y, en la cola, como texto 'Entregado X/Y' bajo el Badge, alimentado por una consulta agregada de partidas_nota_entrega en la carga de /ordenes. Reutilizar la misma utilidad que R12.

**Enfoque descartado:** Nuevo estado SII (p. ej. ENTREGA_PARCIAL): obliga a cambiar CHECK, mapa legacy, RPCs, KPIs, cobranza, planeación y pgTAP, y contradice 'no rehacer'.

**Archivos a tocar:**
- src/modulos/ordenes/utilidades/indice.ts
- src/modulos/ordenes/componentes/tabla-ordenes.tsx
- src/modulos/ordenes/componentes/ficha-orden.tsx
- src/app/(privado)/ordenes/page.tsx
- src/modulos/ordenes/servicios/ordenes-servicio.ts
- src/modulos/ordenes/tipos/ordenes.ts

**Impacto en otros módulos:**
- [bajo] Dashboard/KPIs (supabase/tests/sii_b9_kpis.test.sql): Sin cambio si la etiqueta es solo de UI.
- [bajo] Cobranza (src/modulos/cobranza/componentes/tabla-cuentas-por-cobrar.tsx): Tiene su propio mapa de etiquetas; no se afecta.

**Pruebas afectadas:**
- tests/unitarias/tabla-ordenes-c4-3.test.ts
- tests/unitarias/ordenes-estado-sii.test.ts
- tests/unitarias/ficha-orden-c4-2.test.ts
- tests/e2e/ordenes-estados-sii.spec.ts

**Pruebas nuevas (RED):**
- Unitaria RED: etiquetaEntrega(PRODUCCION_COMPLETADA,50,30)='Entrega parcial 30/50'; (…,50,0)='Pendiente de entrega'; (CERRADA,50,50)=null; (EN_PRODUCCION,50,20)='Entrega parcial 20/50'.
- Componente RED: fila de cola con producción 50/50 y entrega 30/50 muestra 'Entregado 30/50'.
- Componente RED: la ficha muestra la misma etiqueta en el encabezado.

**Riesgos:**
- Consulta adicional en la cola; usar una sola agregada.
- El tono verde del Avance al 100 % puede leerse como 'terminado'; condicionarlo a la entrega.
- Doble fuente de verdad si el saldo difiere de la RPC.

**Preguntas al PO:**
- ¿Qué etiquetas exactas quiere y dónde (cola, ficha, ambas)?
- ¿El Avance de la cola debe seguir siendo de producción o mostrar también la entrega?

**Evidencia:**
- src/modulos/ordenes/componentes/tabla-ordenes.tsx:86-94 — ETIQUETA_ESTADO_SII sin estado intermedio de entrega.
- src/modulos/ordenes/componentes/tabla-ordenes.tsx:116-169 — calcularAvance (producido/solicitado) y tonoAvance 'exito' para PRODUCCION_COMPLETADA/CERRADA; sin entregas.
- src/modulos/ordenes/componentes/tabla-ordenes.tsx:497-562 — Celdas Estado y Avance sin dato de entrega.
- src/modulos/ordenes/tipos/ficha-orden.ts:26 — La ficha recibe partidas[].cantidadEntregada por nota.
- src/modulos/ordenes/utilidades/resumen-ordenes.ts:14-31 — Ya separa entregadas (ordenesConEntregaFinal) de producción completada.

**Notas de verificación:** Confirmado. Añadí tipos/ordenes.ts como archivo a tocar, ya que ahí se mapea la fila de la cola (archivada_en en 198 y 238).

### Hallazgos extra (fuera del alcance; solo para decisión del PO)
- [media] El trigger de entrega puede abortar registrar_entrega al llegar al 100 % (supabase/migrations/20261007230002_sii_credito_dias_cliente.sql): Líneas 52-67: si la AR de la orden no es cobrable y el cliente tiene condiciones 'credito' sin credito_habilitado o sin dias_credito entre 1 y 365, el insert del último renglón lanza cliente_credito_sin_dias y revierte la entrega total. Es una dependencia oculta entre entrega y configuración del cliente. Conviene confirmar que la Server Action de entrega traduce ese código a un mensaje accionable.
- [media] Callejón sin salida del cierre con scrap (supabase/migrations/20261007140001_sii_b7_entregas.sql): La entrega se topa por cantidad_producida (422-435) pero el cierre y el trigger de archivo comparan contra cantidad_solicitada. Una partida completada con producido < solicitado no puede alcanzar el 100 % ni cerrarse. No verificado con datos.
- [baja] Rama muerta en cerrar_orden_administrativa (supabase/migrations/20261007120002_sii_b5_orden_estados.sql): Líneas 182-187: CANCELADA está en el NOT IN y luego otro IF la rechaza con el mismo código; redundante.
- [baja] Botón de cierre pulsable sin saldo (src/modulos/ordenes/componentes/tabla-ordenes.tsx): Líneas 593-607: el title promete 100 % entregado pero el botón se habilita solo con PRODUCCION_COMPLETADA; el error del servidor no dice cuántas piezas faltan.
- [baja] Preparar entrega visible en cualquier estado (src/modulos/ordenes/componentes/ficha-orden.tsx): Líneas 436-442: el enlace no filtra por estado; el rechazo (orden_no_entregable) llega recién al registrar.
- [baja] Mensaje de transicion_invalida impreciso (src/modulos/ordenes/acciones/cerrar-orden-administrativa.ts): Líneas 16-24: el mismo texto 'solo se cierra con producción completada' se usa también cuando la causa es CANCELADA.

### Limitaciones
- No ejecuté pgTAP, Vitest ni e2e; las pruebas afectadas se infieren por nombre y por búsqueda, no se abrieron.
- No leí cómo /ordenes/page.tsx arma el listado ni dónde exactamente agregar el entregado; la ruta queda por confirmar.
- No verifiqué con datos si una partida puede completarse con producido < solicitado ni si es posible 100 % entregado sin producción completada.
- No revisé los KPIs más allá de la condición cerrada_admin_en IS NULL.
- No leí preparar-entrega.ts ni la acción de registrar entrega en esta pasada; se aceptaron las citas del lector.

## Área «historial» (verificada) — Trazabilidad histórica de los requisitos (decisiones previas, reversos, numeración) — módulo Órdenes

**Cómo funciona hoy:** Verifiqué por grep: tasks/ llega a CLI-14 (plan.md l.61-62) sin CLI-15 ni Corte 8; DECISIONES-ACEPTADAS.md llega a DC-15 (l.23). Por tanto CLI-15, DC-16 y Corte 8 están libres, y el informe del lector es correcto en numeración. Confirmé en código que Repetir y Reactivar siguen vivos: botones en tabla-ordenes.tsx l.630 y l.643, diálogos importados en l.9-10 y montados en l.733 y l.741, acciones reactivar-orden.ts y repetir-orden.ts, y servicio ordenes-servicio.ts l.309 y l.338. "Folio legacy" está en ficha-orden.tsx l.303. La matriz de 164 sigue marcando PRD-15 (CSV l.80) y CLI-08 vieja (CSV l.23) como desactualizadas. El área es documental: los estados del lector describen el registro y la decisión, no solo el código. El lector no leyó código, así que sus estados sobre código se apoyan en documentos. Corrijo R05, que debe ser "contradice" y no "ausente". El resto lo confirmo con las limitaciones indicadas. Importa registrar los reversos de A20 (Reactivar y Repetir) como refinamientos con fecha y autor PO, antes de abrir el Corte 8, porque el skill exige decisión con fecha y autor.

### R01 — cumple (confirmado) · esfuerzo XS

**Estado actual:** Origen ORD-01 y C4.3. La cola ya tiene las columnas pedidas según todo.md (documento). No verifiqué columnas en código.

**Cambio mínimo:** Ninguno de producto; casilla en Corte 8 y actualizar ORD-01 en la matriz.

**Evidencia:**
- tasks/todo.md:244-261 — C4.3 cerrado local: cola sin Editar/Procesos/Seleccionar.

### R02 — parcial (confirmado) · esfuerzo M

**Estado actual:** La cola sigue con varias acciones por fila (Repetir y Reactivar en tabla-ordenes.tsx l.630 y l.643, más Comentarios, Documento, Adjuntos y Cancelar). La nota es refinamiento de C4.3, no contradice una decisión.

**Cambio mínimo:** Fila de refinamiento (fecha, PO) y CLI-15; casilla en C8.3; reubicar Comentarios, Documento y Cancelar en la ficha antes de retirarlos de la cola.

**Enfoque descartado:** Retirar controles sin reubicarlos en la ficha.

**Archivos a tocar:**
- docs/observaciones-cliente-2026-10-07/DECISIONES-ACEPTADAS.md
- tasks/plan.md
- tasks/todo.md

**Pruebas afectadas:**
- tests/e2e que usen botones de la cola

**Riesgos:**
- Enlaces profundos /ordenes?ordenId= dependen de la cola.

**Evidencia:**
- src/modulos/ordenes/componentes/tabla-ordenes.tsx:630-643 — Botones Repetir y Reactivar aún presentes en la fila.
- .agents/skills/orca-correcciones-cliente/SKILL.md:88 — Reubicar antes de retirar.

### R03 — parcial (confirmado) · esfuerzo S

**Estado actual:** Sin DC previa; nace de la nota. Según la síntesis, Origen vuelca UUID y Actividad pinta recurso_id.

**Cambio mínimo:** Casilla 1 de aceptación en C8.1; sin DC nueva.

**Pruebas nuevas (RED):**
- La ficha no muestra patrón UUID en texto visible.

**Evidencia:**
- docs/observaciones-cliente-2026-10-07/ordenes-revision-funcional/SINTESIS-PROVISIONAL.md:13 — UUID visibles.

### R04 — parcial (confirmado) · esfuerzo S

**Estado actual:** Linaje construido en C3.1/C4.x; DC-09 y DC-10 congelan la revisión aceptada. Falta presentación con folios y enlaces, hoy atada a ver_finanzas según la síntesis.

**Cambio mínimo:** Refinamiento sobre DC-10: linaje con folios sin importes para roles con orden_vista.

**Pruebas afectadas:**
- supabase/tests c4_3_confidencialidad_ordenes

**Riesgos:**
- Ampliar lectura puede filtrar precios.

**Evidencia:**
- docs/observaciones-cliente-2026-10-07/DECISIONES-ACEPTADAS.md:17-18 — DC-09/DC-10.

### R05 — contradice (corregido) · esfuerzo XS

**Estado actual:** ficha-orden.tsx l.303 rotula Tarjeta titulo="Folio legacy" para el folio de toda Orden. Contradice la nota, no es ausencia. Sin conflicto con decisiones previas.

**Cambio mínimo:** Cambiar rótulo a "Folio" y reservar "Referencia migrada" para idHistorico; criterio 3 en C8.1.

**Archivos a tocar:**
- src/modulos/ordenes/componentes/ficha-orden.tsx

**Pruebas afectadas:**
- e2e o unitarias que busquen el texto Folio legacy

**Evidencia:**
- src/modulos/ordenes/componentes/ficha-orden.tsx:303 — Rótulo Folio legacy sobre ficha.orden.folio.

**Notas de verificación:** El lector dijo ausente; el rótulo existe en código, por lo que contradice.

### R06 — cumple (confirmado) · esfuerzo XS

**Estado actual:** DC-01 y DC-10 respaldan la separación; implementado en C4.2 (documentado). todo.md deja C4.2 sin marcar: incongruencia documental.

**Cambio mínimo:** Ninguno de producto; marcar C4.2 con evidencia.

**Archivos a tocar:**
- tasks/todo.md

**Pruebas afectadas:**
- supabase/tests/c4_2_orden_comercial_operativa

**Evidencia:**
- docs/observaciones-cliente-2026-10-07/DECISIONES-ACEPTADAS.md:9,18 — DC-01/DC-10.
- tasks/todo.md:233-242 — Casillas C4.2 vacías.

### R07 — parcial (confirmado) · esfuerzo XS

**Estado actual:** Sin decisión previa. Hay un test de Planeación que fija el join de procesos.

**Cambio mínimo:** Casilla en C8.2; coordinar con C9 por el desglose compartido.

**Impacto en otros módulos:**
- [bajo] Planeación: desglose compartido

**Evidencia:**
- docs/observaciones-cliente-2026-10-07/ordenes-revision-funcional/SINTESIS-PROVISIONAL.md:17 — Duplicado Láser CO₂ · Láser CO₂.

### R08 — parcial (confirmado) · esfuerzo M

**Estado actual:** Ruteo heredado por DC-07 y refinamientos del 2026-10-13. Atención: CLI-08 de plan.md (ruteo) es homónimo de CLI-08 de la matriz vieja (repetir trabajo).

**Cambio mínimo:** Casilla en C8.2; ruta sin tarifas para roles sin ver_finanzas.

**Riesgos:**
- Colisión de vocabulario CLI-08.

**Evidencia:**
- tasks/plan.md:56 — CLI-08 octubre = ruteo.

### R09 — parcial (confirmado) · esfuerzo S

**Estado actual:** OBS-06, DC-04 (sin copiar blobs) y C3.1. Faltan columnas Origen, Asociado y Tipo.

**Cambio mínimo:** Resolver D9 con el PO; casilla en C8.2; actualizar OBS-06 y ORD-09 en la matriz.

**Pruebas afectadas:**
- supabase/tests sii_b1_archivos

**Evidencia:**
- docs/observaciones-cliente-2026-10-07/DECISIONES-ACEPTADAS.md:12 — DC-04.

### R10 — parcial (confirmado) · esfuerzo S

**Estado actual:** Actividad separada de Comentarios (B1). Faltan eventos de planificación, producción y entrega, según los documentos.

**Cambio mínimo:** Resolver D7; si hay migración, marca posterior a 20261014110000 y coordinar con C9.

**Impacto en otros módulos:**
- [medio] Planeación: triggers comparten eventos

**Pruebas afectadas:**
- supabase/tests/sii_b1_actividad

**Riesgos:**
- Solape con C9.

**Evidencia:**
- docs/observaciones-cliente-2026-10-07/ordenes-revision-funcional/SINTESIS-PROVISIONAL.md:20,58 — Fase 1 etiquetas; Fase 2 migración (D7).

### R11 — cumple (confirmado) · esfuerzo XS

**Estado actual:** B7 admite entregas parciales (documentos y pgTAP). No releí la RPC.

**Cambio mínimo:** Ninguno.

**Pruebas afectadas:**
- supabase/tests/sii_b7_entregas

**Evidencia:**
- docs/observaciones-cliente-2026-10-07/ordenes-revision-funcional/SINTESIS-PROVISIONAL.md:21 — R11 cumple.

### R12 — parcial (confirmado) · esfuerzo S

**Estado actual:** La RPC exige entregado >= solicitado, compatible con la nota. La UI deja pulsar y falla con error. D3 (scrap) abierta.

**Cambio mínimo:** Respuesta del PO a D3 antes de C8.4; deshabilitar botón en UI.

**Impacto en otros módulos:**
- [bajo] Cobranza: CxC independiente

**Pruebas afectadas:**
- supabase/tests/sii_b7_entregas

**Riesgos:**
- Orden que no puede cerrarse por scrap.

**Evidencia:**
- docs/observaciones-cliente-2026-10-07/ordenes-revision-funcional/CONTINUIDAD.md:61,92 — orden_no_entregada_completa.

### R13 — parcial (confirmado) · esfuerzo S

**Estado actual:** Avance refleja solo producción; D10 pendiente.

**Cambio mínimo:** Resolver D10; casilla en C8.4.

**Evidencia:**
- docs/observaciones-cliente-2026-10-07/ordenes-revision-funcional/SINTESIS-PROVISIONAL.md:23,61 — R13 parcial; D10.

### R14 — contradice (confirmado) · esfuerzo S

**Estado actual:** Reactivar está vivo: botón en tabla-ordenes.tsx l.643, ReactivarOrdenDialog (l.741), acción reactivar-orden.ts, servicio l.338 y esquema en validaciones l.75. A20 lo implementó (PRD-15) y la nota lo revierte; falta registro de reverso.

**Cambio mínimo:** Refinamiento en DECISIONES-ACEPTADAS (fecha, PO, afecta PRD-15 y PLA-06). Retirar solo el acceso de UI y la acción de servidor, dejando la RPC y la migración. Retirar también el punto de Planeación en la misma tanda.

**Enfoque descartado:** Borrar RPC y migración: destruye lo aplicado y exige migración destructiva.

**Archivos a tocar:**
- src/modulos/ordenes/componentes/tabla-ordenes.tsx
- src/modulos/ordenes/acciones/reactivar-orden.ts
- docs/observaciones-cliente-2026-10-07/DECISIONES-ACEPTADAS.md

**Impacto en otros módulos:**
- [medio] Planeación: acciones-tarjeta-orden.tsx trae Reactivar

**Pruebas afectadas:**
- tests/integracion/reactivar-orden.test.ts
- supabase/tests/a20_prd15_reactivar_orden

**Riesgos:**
- Retirar en dos tandas genera conflicto.

**Evidencia:**
- src/modulos/ordenes/componentes/tabla-ordenes.tsx:643,741 — Botón y diálogo de Reactivar.
- src/modulos/ordenes/servicios/ordenes-servicio.ts:338 — Servicio de reactivar.
- docs/cierre-auditoria-2026-09-22/A20.md:79-83 — PRD-15 implementado.
- .ai-shared/coordination/COBERTURA_IMPLEMENTACION_ACTUAL.csv:80 — Matriz marca ausente (desactualizada).

### R15 — contradice (confirmado) · esfuerzo S

**Estado actual:** Repetir está vivo: botón en tabla-ordenes.tsx l.630, RepetirOrdenDialog, acción repetir-orden.ts, servicio l.309. Ya crea una Orden nueva con orden_origen_id (A20), parecida a lo que pide la nota, pero se ofrece en la cola con el título "Repetir trabajo".

**Cambio mínimo:** Retirar el botón de la cola. Opcional: reubicar en la ficha como "Nueva orden basada en…" con folio nuevo y origen visible, si el PO lo decide (D2). Registrar refinamiento.

**Enfoque descartado:** Reescribir Repetir como flujo nuevo ahora (nota 15).

**Archivos a tocar:**
- src/modulos/ordenes/componentes/tabla-ordenes.tsx
- docs/observaciones-cliente-2026-10-07/DECISIONES-ACEPTADAS.md

**Impacto en otros módulos:**
- [medio] Cobranza: Repetir crea AR borrador

**Pruebas afectadas:**
- tests/integracion/repetir-trabajo.test.ts
- supabase/tests/a20_cli08_repetir_trabajo

**Riesgos:**
- Dos CLI-08 homónimos.

**Evidencia:**
- src/modulos/ordenes/componentes/tabla-ordenes.tsx:630,733 — Botón y diálogo de Repetir.
- src/modulos/ordenes/componentes/repetir-orden-dialog.tsx:71 — Título Repetir trabajo de {folio}.
- docs/cierre-auditoria-2026-09-22/A20.md:73-77 — Nueva OP con orden_origen_id, copia precio y AR.

### R16 — parcial (confirmado) · esfuerzo XS · REQUIERE MIGRACIÓN

**Estado actual:** Documento exige ver_finanzas (todo.md). Management y Customer Service no lo tienen, según la síntesis. D5 pendiente.

**Cambio mínimo:** Decisión D5 del PO; migración de datos en permisos_rol solo si se concede.

**Migración:** Solo datos idempotentes en permisos_rol, condicionada a D5.

**Impacto en otros módulos:**
- [alto] Cobranza/Tesorería/KPIs: ver_finanzas gobierna RLS

**Pruebas afectadas:**
- supabase/tests/c4_3_confidencialidad_ordenes

**Riesgos:**
- Otorgar ver_finanzas abre más tablas.

**Evidencia:**
- tasks/todo.md:256-259 — Documento exige ver_finanzas.

### R17 — ausente (confirmado) · esfuerzo M

**Estado actual:** No hay hoja de trabajo de Operator, según los documentos. D6 abierta.

**Cambio mínimo:** Resolver D6; lista blanca de campos operativos.

**Impacto en otros módulos:**
- [medio] Producción: vista operador

**Riesgos:**
- Spread de objetos filtra precios.

**Evidencia:**
- docs/observaciones-cliente-2026-10-07/DECISIONES-ACEPTADAS.md:19,46 — DC-11 e invariante de payload operativo.

### R18 — cumple (confirmado) · esfuerzo S

**Estado actual:** C4.3: proyecciones, privilegios por columna y snapshot solo con ver_finanzas, según todo.md. La migración está solo local.

**Cambio mínimo:** Ninguno; candado RED antes de ampliar proyecciones.

**Pruebas afectadas:**
- supabase/tests/c4_3_confidencialidad_ordenes

**Riesgos:**
- Verificar aplicada en remoto.

**Evidencia:**
- tasks/todo.md:255-261 — pgTAP 17/17.

### R19 — parcial (confirmado) · esfuerzo S

**Estado actual:** Los 7 rótulos ya coinciden; falta la pregunta guía. D4 sobre Comentarios.

**Cambio mínimo:** Subtítulo por pestaña; casilla en C8.3.

**Evidencia:**
- docs/observaciones-cliente-2026-10-07/ordenes-revision-funcional/CONTINUIDAD.md:11 — 7 pestañas.

### R20 — parcial (confirmado) · esfuerzo S

**Estado actual:** Verificado: tasks/ no contiene CLI-15 ni Corte 8; DECISIONES llega a DC-15. Los C8.1-C8.4 solo existen como propuesta en COLA-DE-TRABAJO.md. El registro formal necesita autorización del PO.

**Cambio mínimo:** CLI-15 en plan.md; Corte 8 con 12 casillas; tres filas de Refinamientos (cola, Reactivar, Repetir) con fecha y autor PO; actualizar matriz. Sin DC-16.

**Enfoque descartado:** Crear DC-16: los ajustes siguen el patrón de Refinamientos posteriores.

**Archivos a tocar:**
- tasks/plan.md
- tasks/todo.md
- docs/observaciones-cliente-2026-10-07/DECISIONES-ACEPTADAS.md
- .ai-shared/coordination/COBERTURA_IMPLEMENTACION_ACTUAL.csv

**Impacto en otros módulos:**
- [medio] Planeación: C9 comparte Reactivar

**Riesgos:**
- Dos vocabularios CLI-NN.

**Preguntas al PO:**
- ¿Autoriza registrar CLI-15, Corte 8 y los refinamientos (reversos de Reactivar y Repetir)?
- ¿La matriz de 164 se actualiza en este PR o después?

**Evidencia:**
- tasks/plan.md:61-62 — Última CLI es CLI-14.
- docs/observaciones-cliente-2026-10-07/DECISIONES-ACEPTADAS.md:23 — Última DC es DC-15.
- docs/observaciones-cliente-2026-10-07/COLA-DE-TRABAJO.md:5-12 — C8/C9 pendientes de aprobación.

### Hallazgos extra (fuera del alcance; solo para decisión del PO)
- [media] Matriz de 164 obsoleta frente a A20 (.ai-shared/coordination/COBERTURA_IMPLEMENTACION_ACTUAL.csv): Marca ausentes PRD-15 (l.80) y CLI-08 vieja (l.23) aunque A20 los implementó localmente.
- [media] Homonimia CLI-08 (tasks/plan.md): CLI-08 es ruteo en plan.md l.56 y Repetir trabajo en la matriz vieja y en catalogo.csv.
- [baja] C4.2 con casillas sin marcar (tasks/todo.md): l.233-242 sin marcar pese a existir implementación.
- [baja] Estado de plan.md desactualizado (tasks/plan.md): Según el lector, la l.3 aún apunta a C3.2. No lo verifiqué.

### Limitaciones
- Verifiqué por grep la numeración (CLI, DC, Corte) y la presencia de Reactivar, Repetir y Folio legacy en src/modulos/ordenes.
- No releí migraciones, pgTAP ni documentos A20, CONTINUIDAD o SINTESIS: esas citas del lector se mantienen sin reverificar.
- No verifiqué por git los nombres de rama ni los PR #58-#60.
- No confirmé que Planeación importe Reactivar (acciones-tarjeta-orden.tsx), tomado del lector.
- No comprobé columnas de la cola en código; R01 se apoya en todo.md.

## Área «items-ruta» (verificada) — Ficha de Orden: Ítems/Partidas y Ruta/Operaciones

**Cómo funciona hoy:** La ficha lee partidas_orden_produccion con select('*') y mapea procesos (text[]) sin transformar (ficha-orden-servicio.ts:68,110). crear_orden_desde_revision (vigente en 20261012100000, 1277-1292) arma ese arreglo con un nombre por renglón de propuesta_item_ruteo, ordenado por secuencia, sin DISTINCT. Dos pasos de Láser CO2 dan un arreglo con el nombre repetido, y la pestaña Ítems hace join(' · '). La pestaña Ruta no usa tablas de operaciones. Recorre snapshot.items[].ruteo (ficha-orden.tsx:161-164, 385-411) y pinta una lista <ol> "n. Proceso setup X h · run Y h", sin tabla, sin Estado y con castes a Record<string, unknown>. El snapshot del ruteo solo lleva secuencia, proceso, grupos, horas y requiere_revision (sin tarifa ni costo), pero cada ítem lleva precio_unitario. El snapshot_json solo se carga con incluirFinanzas (ficha-orden-servicio.ts:55-63), así que sin ver_finanzas la Ruta (y los archivos vivos, 151-178) quedan vacíos. El informe del lector es esencialmente correcto.

### R07 — parcial (corregido) · esfuerzo XS

**Estado actual:** partida.procesos viene de la fila (ficha-orden-servicio.ts:110) y se muestra con join(' · ') (ficha-orden.tsx:376) sin deduplicar. La RPC lo llena con un nombre por renglón de ruteo (left(nombre,60), ORDER BY secuencia, etiqueta), o por operaciones si no hay ruteo. Dos pasos Láser CO2 se muestran como 'Láser CO2 · Láser CO2'. Otros sitios que unen el mismo arreglo: documento-orden-boton.tsx:156, panel-bolsa-planeacion.tsx:26 y planeacion/utilidades/desglose.ts:65-66 (etiquetaProcesos). Producción (panel-corridas-produccion.tsx:73-74) lo usa como dato, no como texto.

**Cambio mínimo:** Crear helper puro resumirProcesos(procesos: string[], separador = ' · '): string en src/modulos/ordenes/utilidades/procesos.ts (si la carpeta ya existe con indice.ts, agregarlo ahí). Agrupa por clave canónica (trim, minúsculas, sin acentos) y conserva el nombre de la primera aparición. n=1 muestra solo el nombre; n>1 muestra 'Nombre (n operaciones)'. Vacío devuelve '—'. Aplicarlo en ficha-orden.tsx:376. Solo la ficha es obligatorio para el requisito. Documento, Planeación y desglose se pueden dejar para después o migrar con el separador ', ' para no romper planeacion-desglose.test.ts, que fija el join actual. En desglose.ts hay que conservar TEXTO_POR_DEFINIR para el caso vacío.

**Enfoque descartado:** Cambiar crear_orden_desde_revision para guardar procesos únicos: rompe metas_proceso_partida (una meta por entrada, a20), exige migración y backfill. Derivar el resumen del snapshot: se pierde sin ver_finanzas.

**Archivos a tocar:**
- src/modulos/ordenes/utilidades/procesos.ts
- src/modulos/ordenes/componentes/ficha-orden.tsx
- tests/unitarias/ordenes-resumir-procesos.test.ts

**Impacto en otros módulos:**
- [medio] Planeación (src/modulos/planeacion/utilidades/desglose.ts): Solo si se unifica; planeacion-desglose.test.ts fija 'Corte, Doblez' y TEXTO_POR_DEFINIR. Pasar el separador ', ' evita el cambio.
- [bajo] Documento de orden (src/modulos/ordenes/componentes/documento-orden-boton.tsx): Columna 'Área / procesos' (opcional).
- [bajo] Producción (src/modulos/produccion/componentes/panel-corridas-produccion.tsx): Usa procesos como dato; no tocar.

**Pruebas afectadas:**
- tests/unitarias/planeacion-desglose.test.ts

**Pruebas nuevas (RED):**
- Unitaria RED resumirProcesos: ['Láser CO₂','Láser CO₂'] devuelve 'Láser CO₂ (2 operaciones)'.
- Unitaria RED: ['Corte','Doblez','Corte'] devuelve 'Corte (2 operaciones) · Doblez'.
- Unitaria RED: un proceso sin sufijo; vacío devuelve '—'; variantes de mayúsculas, acentos y espacios se agrupan.
- Componente RED en ficha-orden: partida con dos Láser CO₂ muestra el resumen.

**Riesgos:**
- Agrupar por primera aparición oculta el orden real si el proceso no es consecutivo; el detalle está en Ruta.
- La cuenta depende de partida.procesos, que la RPC a20 puede reescribir; no coincide necesariamente con el ruteo congelado.
- Varios joins propios pueden divergir si no se unifican.

**Evidencia:**
- src/modulos/ordenes/componentes/ficha-orden.tsx:375-377 — partida.procesos.join(' · ') sin deduplicar.
- src/modulos/ordenes/servicios/ficha-orden-servicio.ts:68,110 — select('*') y procesos: partida.procesos ?? [].
- supabase/migrations/20261012100000_b4_obs2_flujo_versiones.sql:1277-1292,1306-1323 — array_agg de un nombre por renglón de ruteo, sin DISTINCT, insertado en partidas.procesos.
- src/modulos/ordenes/componentes/documento-orden-boton.tsx:156 — join(', ') propio en el documento.
- src/modulos/planeacion/utilidades/desglose.ts:65-66 — etiquetaProcesos con trim/filter y join(', '); cubierta por planeacion-desglose.test.ts:36,115.
- src/modulos/planeacion/componentes/panel-bolsa-planeacion.tsx:26 — join(', ') propio en la bolsa.

**Notas de verificación:** Lo central se confirmó. Correcciones: (1) pruebasAfectadas se reduce a planeacion-desglose.test.ts, porque ficha-orden-c4-2 y c2-3-documentos-orden no tienen aserciones sobre procesos (grep en tests/ de procesos|Sin ruteo|ficha-panel-ruta solo encontró planeacion-desglose). (2) El alcance mínimo es solo la ficha, que es lo que pide la nota; unificar los otros tres sitios es opcional y debe pasar el separador para no romper la prueba de Planeación. (3) Esfuerzo bajado a XS. (4) La ficha ya recibe un arreglo ordenado por (secuencia, etiqueta), por lo que los duplicados del mismo proceso quedan casi siempre adyacentes.

### R08 — parcial (corregido) · esfuerzo M

**Estado actual:** La pestaña Ruta (ficha-orden.tsx:385-411) muestra por ítem un <ol> con 'n. Proceso setup X h · run Y h', sin tabla, sin columna Estado y con 'setup/run' en inglés. Usa ficha.snapshot.items sin es_descuento (161-164) y caster Record<string, unknown> porque el tipo declara ruteo como unknown[]. Si no hay ruteo cae a operaciones por nombre. El snapshot del ruteo (SQL 1197-1212) trae secuencia, proceso_nombre, setup_horas, run_horas, total_horas y requiere_revision, sin tarifa ni costo. Sin ver_finanzas, snapshot es null y la Ruta queda vacía ('Sin ruteo en el snapshot'). No hay entidad de operación por orden con estado.

**Cambio mínimo:** Versión mínima y segura: (a) Reemplazar el <ol> por una tabla # | Proceso | Prep. estimada | Operación estimada | Estado por ítem (encabezado ITxx), mapeando secuencia, proceso_nombre, setup_horas y run_horas; Estado fijo 'Pendiente' hasta que Producción registre por operación (la derivación desde metas_proceso_partida queda como segunda fase y como pregunta al PO). Esto cumple la nota con solo cambios en ficha-orden.tsx. (b) Para que Operación vea la ruta: proyectar en el servidor un RutaFicha con lista blanca (codigoItem, secuencia, procesoNombre, prepHoras, operacionHoras) leída del snapshot con el mismo cliente que ya lee snapshot_json con finanzas, sin llevar precio_unitario, tarifa ni costo. Hay que confirmar con qué cliente (admin/service role) llama page.tsx, porque C4.3 retiró snapshot_json a authenticated. Añadir RutaFicha tipado en tipos/ficha-orden.ts y quitar los castes. Usar 'Prep.' y 'Operación' en lugar de setup/run.

**Enfoque descartado:** Tabla nueva de operaciones por orden con estado y backfill: duplica metas_proceso_partida y el avance de Producción, y excede 'ajustar, no rehacer'. Dar ver_finanzas a operadores: expone precios. Pasar el snapshot completo al cliente: filtra precio_unitario.

**Archivos a tocar:**
- src/modulos/ordenes/tipos/ficha-orden.ts
- src/modulos/ordenes/servicios/ficha-orden-servicio.ts
- src/modulos/ordenes/componentes/ficha-orden.tsx
- tests/unitarias/ordenes-ruta-ficha.test.ts

**Impacto en otros módulos:**
- [alto] Confidencialidad C4.3 (supabase/migrations/20261010010303_c4_3_confidencialidad_ordenes.sql): snapshot_json no se concede a authenticated; la lectura para operadores debe pasar por service role tras autorización, con lista blanca.
- [medio] Producción (src/modulos/produccion/servicios/tablero-produccion-servicio.ts): Solo si se deriva el Estado en una segunda fase; lectura, sin cambios.
- [medio] Archivos vivos (R de archivos) (src/modulos/ordenes/servicios/ficha-orden-servicio.ts): Comparte la dependencia de incluirFinanzas; si otro requisito la cambia, debe coordinarse con la proyección de ruta.

**Pruebas afectadas:**
- tests/unitarias/ficha-orden-c4-2.test.ts
- tests/unitarias/ordenes-confidencialidad-c4-3.test.ts
- tests/integracion/c4-3-confidencialidad-ordenes.test.ts

**Pruebas nuevas (RED):**
- Unitaria RED: la proyección RutaFicha de un snapshot con tarifa_hora, costo_total y precio_unitario no contiene esas claves.
- Unitaria RED: ruta ordenada por ITxx y secuencia, sin es_descuento.
- Componente RED: la tabla tiene columnas # | Proceso | Prep. estimada | Operación estimada | Estado con 'Pendiente'.
- Integración RED: usuario sin ver_finanzas obtiene la ruta y la respuesta serializada no contiene precio, costo ni tarifa.

**Riesgos:**
- Si el snapshot suma campos económicos al ruteo, una lista blanca los excluye pero un spread los filtraría.
- Derivar Estado por secuencia contra metas puede desalinearse si a20 reconfigura procesos tras el snapshot.
- Abrir la lectura del snapshot a roles sin finanzas debe hacerse solo con la proyección segura.

**Evidencia:**
- src/modulos/ordenes/componentes/ficha-orden.tsx:385-411 — Lista <ol> por ítem, sin tabla ni Estado; etiquetas 'setup'/'run'.
- src/modulos/ordenes/componentes/ficha-orden.tsx:161-164 — ruta = snapshot.items sin es_descuento.
- supabase/migrations/20261012100000_b4_obs2_flujo_versiones.sql:1197-1212,1253-1269 — Ruteo del snapshot sin costos; el ítem sí lleva precio_unitario.
- src/modulos/ordenes/servicios/ficha-orden-servicio.ts:55-63,151,210 — snapshot_json solo con incluirFinanzas; si no, snapshot = null y se entrega vacío.
- src/modulos/ordenes/servicios/ficha-orden-servicio.ts:151-178 — Los archivos vivos también salen del snapshot y quedan vacíos sin finanzas.

**Notas de verificación:** Estado y evidencia confirmados. Cambios: (1) Se separa el mínimo en dos pasos. La tabla con Estado 'Pendiente' fijo cumple la nota solo en ficha-orden.tsx, por lo que es el mínimo real. La proyección servidor para operadores es una extensión que depende de verificar el cliente usado en page.tsx, y no pude comprobarlo (page.tsx no contiene referencias a 'snapshot'). (2) Se elimina del conjunto de archivos utilidades/ruta-orden.ts y la derivación de Estado desde Producción, porque no se verificó la tabla de avance de a20/prd09; queda como pregunta al PO. (3) Se quitaron supabase/tests de pruebasAfectadas, porque no se confirmó que cubran la ruta de la ficha. (4) Se confirma el defecto de que los operadores ven Ruta y Archivos vacíos.

### Hallazgos extra (fuera del alcance; solo para decisión del PO)
- [media] Operadores sin ruta ni archivos vivos por depender del snapshot (src/modulos/ordenes/servicios/ficha-orden-servicio.ts): snapshot_json se carga solo con incluirFinanzas (55-63). Sin ver_finanzas, la Ruta y la lista de archivos (151-178) quedan vacías. La nota exige que el operador vea archivos y procesos pero no precios.
- [baja] Ruta con castes sin tipado (src/modulos/ordenes/componentes/ficha-orden.tsx): Líneas 395-403 usan (x as Record<string, unknown>) porque ruteo y operaciones están tipados como unknown[].
- [baja] Etiquetas en inglés 'setup' y 'run' (src/modulos/ordenes/componentes/ficha-orden.tsx): Línea 397: texto en inglés en una UI en español; la nota pide Prep. y Operación.

### Limitaciones
- No verifiqué con qué cliente Supabase page.tsx llama a obtenerFichaOrdenServicio (grep de 'snapshot' en page.tsx sin resultados), por lo que la viabilidad de leer el snapshot para operadores queda por confirmar.
- No leí la tabla de avance de Producción (a20/prd09) ni tablero-produccion-servicio.ts; la derivación de Estado no está verificada.
- No leí el cuerpo de las pruebas de confidencialidad C4.3 ni los pgTAP.
- El comportamiento 'Láser CO₂ · Láser CO₂' se deduce del código, no de datos reales.

## Área «reactivar-repetir» (verificada) — Órdenes: acciones Reactivar y Repetir

**Cómo funciona hoy:** Ver el primer envío.

## Área «resumen» (verificada) — Ficha de Orden: Resumen, origen comercial, folio y fechas

**Cómo funciona hoy:** La ficha (src/modulos/ordenes/componentes/ficha-orden.tsx) recibe un FichaOrden desde la página servidor. El Resumen tiene tarjetas Estado SII, "Folio legacy" (ficha.orden.folio, fijo), Creada, Partidas, Compromiso comercial y Fecha operativa. El bloque "Origen (snapshot)" solo se pinta con puedeVerFinanzas y vuelca Object.entries(snapshot.origen), incluidos los UUID. El snapshot solo se carga en el servicio si incluirFinanzas. Compromiso vs operativa está resuelto en BD (columna inmutable, trigger y RPC con motivo y evento). La acción ajustarOrdenPostAceptacionAccion no tiene consumidor de UI. El informe del lector se confirma en lo esencial; solo se re-leyeron directamente ficha-orden.tsx 299-344 y ficha-orden-servicio.ts (líneas 43-63, 151-211) y un grep de la acción. El resto de las citas del lector (migraciones, páginas, tests) no se reabrió en esta pasada.

### R03 — parcial (confirmado) · esfuerzo S

**Estado actual:** El Resumen no pinta el UUID de la orden. El bloque Origen sí imprime claves crudas de snapshot.origen (rfq_id, propuesta_id, revision_id) con ver_finanzas (ficha-orden.tsx 323-332, verificado). Según el lector, Actividad muestra evento.tipo crudo y un recurso_id sin filtrar, y Archivos cae a archivoId; estos tres puntos no se re-verificaron en esta pasada.

**Cambio mínimo:** Sustituir el volcado de origen por el bloque de R04 (sin ids). Filtrar recurso_id en ResumenCambio, usar un diccionario local de etiquetas para evento.tipo y poner 'Archivo sin nombre' como fallback en Archivos. No se toca el tipo FichaOrden.

**Enfoque descartado:** Un DTO de vista separado: es más pesado y rompe las acciones que necesitan orden.id y actualizadoEn.

**Archivos a tocar:**
- src/modulos/ordenes/componentes/ficha-orden.tsx
- tests/unitarias/ficha-orden-c4-2.test.ts

**Pruebas afectadas:**
- tests/unitarias/ficha-orden-c4-2.test.ts
- tests/e2e/ordenes-estados-sii.spec.ts

**Pruebas nuevas (RED):**
- Unitaria RED: el Resumen no contiene ningún UUID ni las claves rfq_id, propuesta_id o revision_id.
- Unitaria RED: un evento con recurso_id no imprime el UUID.
- Unitaria RED: un archivo sin nombre no muestra su archivoId.

**Riesgos:**
- Los tests e2e pueden depender del texto crudo del tipo de evento.
- El diccionario de eventos necesita un fallback legible para tipos nuevos.

**Preguntas al PO:**
- ¿Los códigos de evento se muestran con etiqueta en español?

**Evidencia:**
- src/modulos/ordenes/componentes/ficha-orden.tsx:323-332 — Volcado de claves y valores de snapshot.origen, incluidos UUID (verificado).
- src/modulos/ordenes/componentes/ficha-orden.tsx:74-107, 419-421, 476 — Según el lector: ResumenCambio solo oculta programacion_id y partida_id, el fallback de Archivos usa archivoId y Actividad imprime el tipo crudo. No re-verificado.

**Notas de verificación:** Se confirmó el volcado de origen. Los puntos de Actividad y Archivos quedan como reportados por el lector.

### R04 — parcial (confirmado) · esfuerzo S

**Estado actual:** El bloque Origen es un volcado genérico de claves, visible solo con ver_finanzas (ficha-orden.tsx 319-340, verificado). No hay enlaces. El snapshot se lee solo si opciones.incluirFinanzas (ficha-orden-servicio.ts 55-63, verificado), así que quien no tiene ver_finanzas no obtiene snapshot ni origen. Según el lector, el snapshot ya trae rfq_folio, propuesta_folio, revision_folio y letra.

**Cambio mínimo:** Cargar el snapshot en servidor siempre (o en una consulta aparte), exponer solo un campo origen tipado con ids y folios y descartar totales cuando no hay ver_finanzas. Renderizar tres filas (RFQ, Propuesta, Revisión aceptada con su letra) fuera del bloque de finanzas. Dar enlace solo si la página calcula puedeVerRfq y puedeVerPropuesta con can(); si no, texto plano. Sin origen: 'Sin origen comercial'.

**Enfoque descartado:** Hacer join a rfq y propuestas en cada lectura: los folios ya están congelados en el snapshot y la orden congela lo aceptado.

**Archivos a tocar:**
- src/modulos/ordenes/componentes/ficha-orden.tsx
- src/modulos/ordenes/servicios/ficha-orden-servicio.ts
- src/modulos/ordenes/tipos/ficha-orden.ts
- src/app/(privado)/ordenes/[id]/page.tsx
- tests/unitarias/ficha-orden-c4-2.test.ts

**Impacto en otros módulos:**
- [bajo] RFQ y Propuestas (src/app/(panel)/rfq/page.tsx): Destino de los enlaces ?rfq=<id> y ?propuesta=<id>; aplican sus propios permisos

**Pruebas afectadas:**
- tests/unitarias/ficha-orden-c4-2.test.ts
- tests/unitarias/ordenes-confidencialidad-c4-3.test.ts

**Pruebas nuevas (RED):**
- Unitaria RED: folios sin UUID, con enlace solo si el permiso lo habilita.
- Unitaria RED: sin ver_finanzas se ve el origen pero no los totales.
- Unitaria RED: orden interna u OP- sin snapshot muestra 'Sin origen comercial'.

**Riesgos:**
- Cargar el snapshot completo para operadores filtraría precios al cliente: extraer solo el origen en servidor.
- El snapshot_json está revocado a authenticated (según el lector), así que debe seguir leyéndose con service role en servidor.
- Las órdenes antiguas sin rfq_folio deben caer a texto plano.

**Preguntas al PO:**
- ¿Basta enlazar la Revisión a la Propuesta, ya que no hay ruta propia de revisión?

**Evidencia:**
- src/modulos/ordenes/componentes/ficha-orden.tsx:319-340 — Origen dentro de puedeVerFinanzas, sin enlaces.
- src/modulos/ordenes/servicios/ficha-orden-servicio.ts:55-63 — snapshot_json se selecciona solo con incluirFinanzas.
- src/modulos/ordenes/servicios/ficha-orden-servicio.ts:151-211 — El snapshot alimenta archivos, ítems y totales; con finanzas desactivadas quedan vacíos.

**Notas de verificación:** La limitación del servicio por incluirFinanzas se verificó en las líneas citadas.

### R05 — contradice (corregido) · esfuerzo XS

**Estado actual:** La tarjeta se titula fija 'Folio legacy' y muestra ficha.orden.folio (ficha-orden.tsx 303, verificado). El encabezado usa folioSii ?? folio (según el lector), por lo que el mismo folio aparece dos veces con nombres distintos. Hay otros dos textos con 'legacy': línea 335 (verificado) y 526 (según el lector). En la línea 309 aparece además 'No aplica / orden legada', texto visible que el lector omitió.

**Cambio mínimo:** Rótulo 'Folio' con valor folioSii ?? folio. Mostrar 'Referencia migrada' solo si existe idHistorico o referenciaExterna. Cambiar los textos de las líneas 309, 335 y 526 por 'Orden anterior al flujo SII' u otra redacción neutra.

**Enfoque descartado:** Hacer backfill de folio_sii o renombrar columnas: viola el CHECK y altera folios históricos ya impresos.

**Archivos a tocar:**
- src/modulos/ordenes/componentes/ficha-orden.tsx
- tests/unitarias/ficha-orden-c4-2.test.ts

**Impacto en otros módulos:**
- [bajo] Documento de orden (src/modulos/ordenes/servicios/documento-orden-servicio.ts): folioCotizacion usa folio_legacy del snapshot de propuesta (según el lector); revisar si se imprime con rótulo legacy

**Pruebas afectadas:**
- tests/unitarias/ficha-orden-c4-2.test.ts
- tests/e2e/ordenes-estados-sii.spec.ts

**Pruebas nuevas (RED):**
- Unitaria RED: folioSii O-1026_01 muestra 'Folio' y la ficha no contiene 'legacy'.
- Unitaria RED: 'Referencia migrada' aparece solo con idHistorico.

**Riesgos:**
- El fixture actual usa un folioSii que no cumple el CHECK; conviene corregirlo.
- La orden heredada (a20) no se verificó a fondo.

**Preguntas al PO:**
- ¿Una orden OP-###### sin folio_sii debe mostrar su folio como 'Folio'?

**Evidencia:**
- src/modulos/ordenes/componentes/ficha-orden.tsx:303 — Tarjeta fija 'Folio legacy' con folio.
- src/modulos/ordenes/componentes/ficha-orden.tsx:309 — Texto 'No aplica / orden legada' cuando no hay compromiso comercial.
- src/modulos/ordenes/componentes/ficha-orden.tsx:335 — 'conserva sus datos legacy'.

**Notas de verificación:** Se añadió la línea 309 ('orden legada'), que el lector omitió.

### R06 — cumple (confirmado) · esfuerzo XS

**Estado actual:** La UI separa las tarjetas Compromiso comercial y Fecha operativa (ficha-orden.tsx 306-311, verificado). Según el lector, la BD protege el compromiso con un trigger y la operativa cambia solo por RPC con motivo y evento ajuste_operativo. Esa parte de BD no se re-verificó. La acción ajustarOrdenPostAceptacionAccion solo aparece en su propio archivo (grep verificado), es decir, no hay UI para reprogramar. El historial se ve en Actividad con etiquetas crudas.

**Cambio mínimo:** ninguno

**Enfoque descartado:** Crear una tabla aparte de historial de fechas: orden_eventos_cambio ya guarda anterior y nuevo.

**Impacto en otros módulos:**
- [medio] Entregas (src/modulos/entregas/servicios/obtener-entregas.ts): Según el lector ordena por fecha_compromiso (espejo de la operativa)

**Pruebas afectadas:**
- supabase/tests/c4_2_orden_comercial_operativa.test.sql
- tests/unitarias/ficha-orden-c4-2.test.ts

**Pruebas nuevas (RED):**
- pgTAP opcional: tras el ajuste, fecha_compromiso_comercial queda igual.

**Riesgos:**
- Sin UI de reprogramación, la separación se cumple pero el usuario no puede ejercerla desde la orden.

**Preguntas al PO:**
- ¿El OTD se mide contra el compromiso comercial?
- ¿Se necesita ya un botón de reprogramar en la ficha?

**Evidencia:**
- src/modulos/ordenes/componentes/ficha-orden.tsx:306-311 — Tarjetas separadas.
- supabase/migrations/20261009193327_c4_2_orden_comercial_operativa.sql:131-164, 253-347 — Según el lector: trigger inmutable y RPC con gate (no re-verificado).
- src/modulos/ordenes/acciones/ajustar-orden-post-aceptacion.ts — Sin consumidores en src/ (grep verificado).

### Hallazgos extra (fuera del alcance; solo para decisión del PO)
- [media] Origen y snapshot atados a ver_finanzas (src/modulos/ordenes/servicios/ficha-orden-servicio.ts): El snapshot se carga solo con incluirFinanzas (55-63). Origen, ruta y archivos quedan vacíos para quien no tiene ver_finanzas (afecta R04, R07 y R08).
- [baja] Fixture con folioSii inválido (tests/unitarias/ficha-orden-c4-2.test.ts): Según el lector, 'OP-1026_01-01' no cumple el CHECK de folio_sii. No re-verificado.
- [media] Entregas usa fecha_compromiso espejo (src/modulos/entregas/servicios/obtener-entregas.ts): Tras reprogramar, la promesa comercial deja de ser la referencia del orden o del KPI (según el lector, no re-verificado).

### Limitaciones
- En esta pasada solo se re-leyó ficha-orden.tsx 290-344, ficha-orden-servicio.ts por grep y el grep de la acción; las citas de migraciones, páginas, tests, documento-orden-servicio y entregas se aceptan del lector sin reabrir.
- No se revisó la RPC de orden heredada (a20).
- No se verificaron los permisos por rol de rfq_vista y propuesta_vista.
