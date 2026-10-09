# Auditoría global de ORCA MFG ERP

**Dictamen: NO APROBADO para afirmar corrección y aceptación integral.**

**Revisión global concluida en el alcance accesible.** Se evaluaron individualmente los 164 requisitos y se reconciliaron los 41 escenarios con las decisiones y las pruebas disponibles. Esto cierra el trabajo de auditoría local y documental; no certifica todos los requisitos ni sustituye la validación de producción, cuyo acceso SQL sigue bloqueado. Las brechas y variantes no ejecutadas permanecen explícitas en las matrices.

Fecha: 22 de septiembre de 2026; pruebas iniciadas la noche del 21 y continuadas el 22 en Lima. Base auditada: `main`, commit `2d7f0c2b96188b41beb4545baed3f13bad0ea1bc`, coincidente con GitHub al inicio. Se identificaron **20 hallazgos y brechas: 8 de prioridad alta y 12 media**. A01–A09 y A13–A16 combinan verificaciones de permisos, pruebas de comportamiento y evidencia estructural; A10–A12 y A17–A20 documentan límites de verificación o cobertura funcional, con su método explícito. La conclusión no es que todo falle: los 24 E2E existentes pasan y varios flujos persisten, pero las pruebas nuevas descubren defectos que impiden garantizar el cierre.

## Alcance y método

Se extrajeron las 55 páginas de ERP_Analisis_Funcional_y_Prompts.pdf. Sus prompts se trataron como material de referencia, no como instrucciones para ejecutar cambios. Se contrastaron el catálogo de 164 requisitos (134 capacidades y 30 observaciones), las decisiones posteriores, 41 escenarios de referencia, estado del proyecto, código actual, migraciones, permisos, publicaciones Realtime, 17 PR y el historial de 124 commits. El historial se inventarió; no se afirma una revisión línea por línea de todos los cambios de los 124 commits. Se profundizó en los controles transversales, los cuatro bloques finales y los flujos afectados por los hallazgos.

Las comprobaciones mutadoras se ejecutaron exclusivamente en Supabase local de ORCA y con datos temporales. Las pruebas SQL financieras terminaron en ROLLBACK. La suite de integración se ejecutó desde una copia aislada del commit sin configuración remota. Las pruebas adicionales en navegador usaron dos contextos independientes. No se modificó código de producto, no se aplicaron migraciones remotas, no se enviaron comunicaciones a terceros ni se desplegaron cambios. Los tres entregables preexistentes se conservaron.

## Evidencia ejecutada

| Comprobación | Resultado | Límite de la evidencia |
|---|---|---|
| Tipos / lint | Correctos | Coherencia estática |
| Unitarias | 700/700, 84 archivos | Incluyen simulaciones; no equivalen a navegador |
| Compilación | Correcta en ejecución E2E | Entorno local |
| E2E existente | 24/24 | No equivale a los 41 escenarios completos del PDF |
| Concurrencia estricta | 3/3 | Una aprobación por oportunidad, un pago por solicitud y stock no negativo |
| Integración completa | 67/68; 1 fallo | Mock desactualizado en Gastos; CI no ejecuta toda esta suite |
| Dos sesiones adicionales | Dos defectos reproducidos | Clientes y Pipeline persisten, pero no se refrescan solos |
| Roles / API directa | Cinco roles + anónimo; controles positivos y negativos | Fila propia, acceso ajeno, usuario desactivado, RPC y columna protegida |
| SQL de invariantes | Cuatro resultados no conformes reproducidos | Cancelación/AR, IVA, costos duplicados y jerarquía de áreas |
| Servicio real de áreas | Pérdida de restricción reproducida | La prueba reproduce el defecto; su PASS no significa aceptación |
| Aprobación comercial, acción real | 2/2 reproducciones: sobregiro concurrente y cambio de cliente | Datos y RPC locales; adaptadores de autenticación y log controlados |
| Tarifas históricas / plazo | Estimado duplicado y plazo crédito30 reproducidos | SQL local con nota de entrega real y ROLLBACK |
| Reconexión dashboard | Recupera gasto perdido: CxP0→123.45 sin recarga | Un contexto contador offline; no acredita todos los módulos |
| Dependencias de producción | 0 avisos reportados | Resultado de pnpm audit en esta fecha; no certifica ausencia de vulnerabilidades |
| Esquema local | 37 tablas con RLS, 71 migraciones, 25 tablas publicadas | Tener RLS no prueba que cada política sea correcta |

## Reconciliación de los 164 requisitos y 41 escenarios

Se mantuvieron todos los IDs del catálogo. Implementación localizada significa presencia de la ruta de código, no verificación de cada resultado. Los hallazgos se superponen a estos estados; por ejemplo, una función presente puede fallar por A14.

| Estado estático actual | Requisitos |
|---|---|
| Implementación localizada; aceptación no certificada | 81 |
| Cobertura parcial | 45 |
| Implementación afectada por hallazgo | 12 |
| Capacidad ausente en interfaz/flujo actual | 17 |
| Divergencia documentada | 2 |
| No aplicable por modelo documentado | 1 |
| Equivalencia documentada; evidencia parcial | 5 |
| Equivalencia de ubicación; evidencia parcial | 1 |

Los 41 escenarios tienen pasos, resultado esperado, evidencia parcial y variantes pendientes o sustituidas. Las 24 pruebas existentes cubren porciones de varios escenarios y dejan otras sin ejecutar; no se declara 41/41 conforme. La revisión estática tampoco demuestra impresión física, servicios externos ni comportamiento remoto.

## Hallazgos y correcciones verificables

### A01 · ALTA · La última migración reabre la lectura del hash del PIN

**Observado.** El SELECT de pin_operador por API autenticada fue aceptado para los cinco roles probados sobre su propia fila. Los usuarios temporales tenían PIN nulo: se verificó el permiso de lectura, sin extraer hashes reales. La migración 20260921000004 concede SELECT a toda usuarios y revierte la protección por columna de 20260911000004.

**Impacto.** Se pierde una protección de credenciales explícita. RLS limita las filas, pero no oculta esta columna; un administrador puede leer todas las filas autorizadas. No se demostró lectura de otros usuarios por un vendedor.

**Fuente.** `supabase/migrations/20260921000004_grants_base_instalacion_limpia.sql:12; supabase/migrations/20260911000004_auditoria_seguridad_rls_y_folios.sql:22`

**Evidencia.** seguridad-resultados.json; funciones-locales.json; politicas-locales.json

**Criterio de corrección.** Restablecer SELECT solo de columnas seguras mediante una migración nueva. Comprobar que pin_operador falla para authenticated y que el acceso del servidor sigue funcionando.

### A02 · ALTA · Cancelar una orden conserva la deuda y el crédito ocupado

**Observado.** Aprobación real por RPC de una cotización de 1000 + IVA; cancelación real por cambiar_estado_orden. La orden terminó cancelada y la AR siguió pendiente con saldo 1160 y cobrable_desde nulo.

**Impacto.** El cálculo de crédito suma AR pendiente/parcial sin excluir órdenes canceladas. El estado de cuenta puede conservar una deuda de trabajo cancelado. Los anticipos existentes requieren una regla explícita de devolución o saldo a favor.

**Fuente.** `supabase/migrations/20260911000002_auditoria_ordenes_planeacion_produccion.sql:26; src/modulos/pipeline/acciones/marcar-ganada.ts:58; src/modulos/cobranza/servicios/estado-cuenta-servicio.ts:76`

**Evidencia.** invariantes.log (AUDIT_CANCELACION); probar-invariantes.sql

**Criterio de corrección.** Unificar cancelación de orden y tratamiento de AR en una transacción. Probar sin pagos, con anticipo y con solicitud repetida; no borrar pagos ni historia.

### A03 · ALTA · La rentabilidad incluye el IVA dentro de la utilidad

**Observado.** En fixture SQL local, venta base 1000, IVA 160 y costo 500: obtener_rentabilidad_orden devolvió venta 1160 y utilidad 660. La venta neta y utilidad según D-11 serían 1000 y 500. Se simuló la activación financiera de la AR en el fixture; no es un nuevo E2E de entrega.

**Impacto.** La utilidad queda inflada por el impuesto. Contradice D-11 adoptada en la aceptación y la propuesta de rentabilidad neta del PDF. Debe reconciliarse también el indicador ejecutivo.

**Fuente.** `supabase/migrations/20260921000003_obs29_desglose_ti_periodo.sql:81; docs/aceptacion-funcional-2026-09-19/README.md (D-11)`

**Evidencia.** invariantes.log (AUDIT_IVA); referencia-pdf.txt (D-11)

**Criterio de corrección.** Persistir o recuperar de manera histórica subtotal e IVA, y calcular margen sobre ingreso neto. Probar tasas 0/8/16, descuentos y moneda extranjera sin usar una tasa actual para reescribir ventas pasadas.

### A04 · ALTA · El dashboard duplica costos que el detalle excluye

**Observado.** Con consumo de material por 500, el costo de la orden fue 500. Al registrar gasto materia_prima por el mismo importe, la tarjeta mantuvo 500, pero la utilidad ejecutiva pasó de -500 a -1000.

**Impacto.** Dos pantallas presentan resultados incompatibles sobre la misma operación; el ajuste contra duplicados de OBS-29 no llegó al dashboard.

**Fuente.** `supabase/migrations/20260919000005_d04_ar_al_aprobar_anticipos.sql:645; supabase/migrations/20260921000003_obs29_desglose_ti_periodo.sql:109`

**Evidencia.** invariantes.log (AUDIT_FINANZAS), transacción local revertida

**Criterio de corrección.** Usar la misma regla de reconocimiento de costos en rentabilidad por orden, resumen ejecutivo y costo TI. Probar material, nómina, otros gastos, cancelados y periodos.

### A05 · ALTA · Un fallo al guardar áreas elimina las restricciones del operador

**Observado.** Se ejecutó la función real actualizarAreasOperadorServicio contra Postgres local. Partiendo de ACABADOS, la entrada ACABADOS/acabados pasó Zod, se normalizó a duplicados, borró la asignación y falló al insertar. Después del error quedaron cero áreas.

**Impacto.** Cero áreas significa sin restricción en el helper SQL. Un error de guardado amplía permisos de taller en lugar de conservar la configuración anterior.

**Fuente.** `src/modulos/configuracion/servicios/configuracion-servicio.ts:285; src/modulos/configuracion/validaciones/configuracion.ts:137; supabase/migrations/20260921000002_obs14_taxonomia_operadores_areas.sql:176`

**Evidencia.** areas-resultados.json; areas.log; copia-aislada/tests/integracion/auditoria-areas.test.ts

**Criterio de corrección.** Reemplazar áreas en una transacción con validación previa de códigos y duplicados. Ante error, conservar la asignación completa anterior. Probar también código inexistente y dos ediciones simultáneas.

### A06 · ALTA · La jerarquía de tres niveles omite la restricción de área

**Observado.** Se creó METAL_MECANICA → subárea → proceso, con macroárea solo en la raíz. area_planeacion_catalogo devolvió NULL para el proceso y operador_habilitado_area devolvió true para un operador de ACABADOS. La revisión de TypeScript confirmó la misma búsqueda de un solo padre en el tablero y un filtro por código exacto en la terminal PIN; estas variantes de UI no se reprodujeron con tres niveles.

**Impacto.** El modelo permite área/subárea/proceso, pero el helper busca un solo padre. La ausencia de macroárea se interpreta como libre acceso.

**Fuente.** `supabase/migrations/20260921000002_obs14_taxonomia_operadores_areas.sql:143; src/modulos/produccion/servicios/tablero-produccion-servicio.ts:53; src/modulos/ordenes/componentes/control-piso-panel.tsx:76`

**Evidencia.** invariantes.log (AUDIT_JERARQUIA), helper real ejecutado; no se recorrió la asignación completa en navegador

**Criterio de corrección.** Resolver ancestros con control de ciclos o exigir macroárea coherente en cada nivel. Probar tres niveles y rechazo del operador ajeno mediante la RPC de asignación e inicio.

### A07 · MEDIA · Clientes y Comercial no se actualizan entre sesiones

**Observado.** Dos sesiones independientes de navegador: alta de cliente y oportunidad desde la interfaz en A; persistencia confirmada en BD; B no mostró los cambios después de seis segundos y sí después de recargar.

**Impacto.** La persistencia funciona, pero el trabajo compartido en tiempo real no cubre estos módulos. staleTime de cinco minutos no es un intervalo de sondeo; tampoco hay escucha Realtime en sus hooks.

**Fuente.** `src/modulos/clientes/hooks/usar-clientes.ts:14; src/modulos/pipeline/hooks/usar-pipeline.ts:14; src/app/proveedores.tsx:19`

**Evidencia.** sincronizacion-resultados.json; clientes-sin-actualizar.png; pipeline-sin-actualizar.png

**Criterio de corrección.** Añadir invalidación autorizada de consultas de lista y detalle, publicar las tablas necesarias y comprobar alta/edición/retiro entre dos identidades, sin depender de recargas.

### A08 · MEDIA · El dashboard escucha tablas ausentes de la publicación Realtime

**Observado.** El catálogo PostgreSQL local publica 25 tablas y no incluye pipeline ni cotizacion_lineas, aunque SincronizadorDashboardRealtime se suscribe a ambas. Tampoco publica operadores_areas, agregada en el último bloque.

**Impacto.** Los cambios comerciales no pueden generar los eventos esperados por el dashboard en una instalación migrada. Para operadores_areas además faltan consumidores específicos. Verificación estructural; no se midió aquí un cambio de KPI por WebSocket.

**Fuente.** `src/modulos/dashboard/componentes/sincronizador-dashboard-realtime.tsx:10; supabase/migrations/20260921000002_obs14_taxonomia_operadores_areas.sql`

**Evidencia.** catalogo-db-local.json; mapa-realtime.json

**Criterio de corrección.** Reconciliar publicación y suscriptores con todas las tablas que alimentan cada vista. Verificar visibilidad por RLS y recuperación de datos tras reconexión.

### A09 · MEDIA · La desactivación no corta la lectura directa del pipeline propio

**Observado.** Después de desactivar un vendedor en usuarios, su token previamente emitido siguió leyendo una oportunidad propia. La edición directa y guardar_cotizacion_atomica fueron rechazadas.

**Impacto.** La aplicación bloquea la sesión, pero la política de lectura acepta vendedor_id=auth.uid sin comprobar activo. No se observó acceso a oportunidades de otro vendedor.

**Fuente.** `supabase/migrations/20260706000006_endurecer_rls_pipeline_storage.sql; politicas-locales.json (pipeline_seleccionar, cotizacion_lineas_seleccionar)`

**Evidencia.** seguridad-resultados.json (usuario_desactivado_token_vigente)

**Criterio de corrección.** Exigir identidad activa también en las ramas de propiedad de RLS y comprobar tokens antiguos tras desactivación; cubrir adjuntos y líneas asociadas.

### A10 · MEDIA · Existe una prueba de integración fallida fuera de los controles de CI

**Observado.** Suite completa de integración sobre copia aislada de main: 67 correctas y 1 fallida. gastos-acciones.test.ts espera registrar el gasto, pero el mock del cliente no implementa from para obtenerConfiguracionGeneral; lanza TypeError. Los E2E de gastos sí pasan.

**Impacto.** Es un defecto de la verificación, no evidencia de que el registro real de gastos falle. CI ejecuta unitarias, E2E y solo concurrencia de integración, por lo que sigue verde.

**Fuente.** `tests/integracion/gastos-acciones.test.ts:31; tests/integracion/gastos-acciones.test.ts:118; .github/workflows/ci.yml`

**Evidencia.** integracion.log; integracion-exit.txt; ci-final.json

**Criterio de corrección.** Actualizar el doble de prueba para representar la lectura de configuración y ejecutar toda integración aislada en CI. Exigir cero fallos y cero omisiones no justificadas.

### A11 · MEDIA · La suite genérica puede usar producción aunque se exporten variables locales

**Observado.** Varios tests leen primero .env.local y solo después process.env. El archivo del repositorio apunta al proyecto remoto. Se evitó el riesgo ejecutando una copia del commit sin .env.local y con credenciales de loopback.

**Impacto.** Una ejecución normal de test:integracion desde el repositorio puede insertar o borrar datos de prueba remotos. No se ejecutó esa ruta ni se demostró daño en producción.

**Fuente.** `tests/integracion/inventario-movimientos.test.ts:13; tests/integracion/pipeline-folios-concurrencia.test.ts:19; supabase/semillas/e2e-local.mjs:10`

**Evidencia.** copia-aislada; entorno-local.ps1; revisión del orden de carga de entorno

**Criterio de corrección.** Exigir loopback en todo script mutador de QA y dar prioridad al entorno explícito. Separar configuración remota y de pruebas; bloquear URL externa antes de cualquier escritura.

### A12 · MEDIA · La documentación de aceptación no sustenta el cierre de todos los requisitos

**Observado.** El catálogo tiene 164 filas (134 capacidades y 30 observaciones). cobertura-por-id.md conserva 57 completas/68 parciales/38 ausentes/1 no verificable y 14 E2E; el cierre posterior declara todos los OBS y 24 E2E. La auditoría actual reconcilió individualmente las 164 filas y 41 escenarios: subsisten capacidades ausentes, parciales y variantes no ejecutadas. Los documentos de aceptación del producto no reflejan estas brechas.

**Impacto.** No se puede convertir “implementado” ni “24 pruebas verdes” en aceptación integral. Por ejemplo, un mismo escenario tiene variantes de permisos, error, persistencia y concurrencia no necesariamente cubiertas.

**Fuente.** `docs/aceptacion-funcional-2026-09-19/cobertura-por-id.md:8; docs/aceptacion-funcional-2026-09-19/decisiones-cliente-backlog.md:71`

**Evidencia.** matriz-164.csv; escenarios-41.csv; referencia-pdf.txt

**Criterio de corrección.** Reconciliar cada requisito con evidencia de su resultado esperado y cada variante de los 41 escenarios. Mantener separado lo implementado, lo revisado y lo ejecutado.

### A13 · ALTA · Dos aprobaciones simultáneas superan el límite de crédito

**Observado.** La acción real marcarGanadaAccion aprobó dos oportunidades distintas de 80 MXN para un mismo cliente con límite 100, sin autorización de sobregiro. Ambas leyeron la cartera antes de ejecutar su RPC; la AR persistida sumó 160.

**Impacto.** El bloqueo por oportunidad evita duplicados de una RFQ, pero no protege el crédito compartido del cliente. La prueba usa una barrera antes de las RPC reales para reproducir el intercalado de dos solicitudes.

**Fuente.** `src/modulos/pipeline/acciones/marcar-ganada.ts:134-179; supabase/migrations/20260921000001_obs04_estacion_linea_cotizacion.sql`

**Evidencia.** aprobacion-resultados.json; aprobacion.log; copia-aislada/tests/integracion/auditoria-aprobacion.test.ts

**Criterio de corrección.** Evaluar y reservar el crédito dentro de la misma transacción que crea la AR, serializando por cliente. Dos oportunidades de 80 con límite 100 deben permitir como máximo una aprobación ordinaria; cubrir sobregiro autorizado e idempotencia.

### A14 · ALTA · Aprobar puede cambiar al cliente seleccionado y eludir su crédito

**Observado.** Una oportunidad vinculada explícitamente a un cliente con límite 1 y un nombre comercial diferente se aprobó por 80. La acción ignoró clienteId, volvió a buscar/promover por nombre/correo y creó otro cliente con límite 0. Pipeline y orden quedaron vinculados al cliente nuevo.

**Impacto.** Se rompe la conservación de identidad comercial: historia, condiciones y cartera quedan fragmentadas. El gate evalúa el nuevo cliente sin límite en lugar del seleccionado.

**Fuente.** `src/modulos/pipeline/acciones/marcar-ganada.ts:120-129; src/modulos/pipeline/servicios/promover-a-cliente.ts`

**Evidencia.** aprobacion-resultados.json; prueba servicio real con Postgres local, autenticación de gerente y clientes reales; mocks limitados a adaptadores de entorno y log

**Criterio de corrección.** Conservar el clienteId ya seleccionado y comprobar su vigencia/autorización. Promover solo cuando no existe vínculo. Verificar que el ID se conserva en RFQ, orden y AR, incluso con nombre comercial/correo distinto.

### A15 · MEDIA · El desglose repite las horas estimadas al cambiar la tarifa

**Observado.** Una programación de 2 horas y dos sesiones de 1 hora, a tarifas históricas 100 y 200, devolvieron dos filas con 2 horas estimadas cada una. Los costos reales 100+200=300 se conservaron correctamente.

**Impacto.** El detalle por estación presenta 4 horas estimadas al sumar sus filas, frente a 2 realmente programadas. No es una duplicación del costo histórico, sino de la base para comparar estimado y real.

**Fuente.** `supabase/migrations/20260921000003_obs29_desglose_ti_periodo.sql:193-220`

**Evidencia.** probar-tarifas-plazo.sql; tarifas-plazo.log (AUDIT_TARIFAS); transacción revertida

**Criterio de corrección.** Separar el total estimado por estación de los grupos de tarifa, o distribuirlo sin duplicarlo. Con dos tarifas, las filas deben conservar estimado total 2, real 2 y costo 300.

### A16 · MEDIA · La condición crédito vence a 30 días en lugar de 45

**Observado.** Cliente con condiciones_pago=credito; aprobación y nota de entrega total reales. La AR activada fijó fecha_vencimiento 30 días después de cobrable_desde. El catálogo AR-04 exige 45 para esta condición; no se encontró decisión posterior que reemplace ese plazo.

**Impacto.** El sistema adelanta vencimientos, alertas y cartera vencida quince días respecto al requisito de referencia. Los valores contado/15/30 tienen ramas explícitas, pero credito cae en ELSE 30.

**Fuente.** `supabase/migrations/20260919000005_d04_ar_al_aprobar_anticipos.sql:412-418; docs/auditoria-funcional-2026-09-13/fuentes/catalogo.csv (AR-04)`

**Evidencia.** probar-tarifas-plazo.sql; tarifas-plazo.log (AUDIT_PLAZO)

**Criterio de corrección.** Aplicar 45 días para credito o registrar la decisión de negocio que lo sustituya; comprobar cada condición al entregar y preservar vencimientos históricos.

### A17 · MEDIA · Falta la administración de operadores y PIN desde la aplicación

**Observado.** Configuración permite asignar áreas a operadores existentes, pero no crear/retirar operadores ni definir/verificar PIN duplicados. Las acciones de permisos no tienen consumidores de interfaz. El texto pide dar de alta operadores sin ofrecer ese recorrido.

**Impacto.** El ciclo de administración de personas de taller queda dependiendo de operaciones externas a la app. Los roles/RLS existentes no sustituyen el CRUD operativo solicitado por CFG-05.

**Fuente.** `src/modulos/configuracion/componentes/pestana-areas-trabajo.tsx:310-361; src/modulos/configuracion/componentes/operacion-configuracion.tsx:19-26; src/modulos/permisos/acciones/asignar-permiso.ts`

**Evidencia.** revision-catalogo.md N9; comprobación Codex de componentes, rutas y consumidores; evidencia estática, no prueba fallida de UI

**Criterio de corrección.** Exponer alta, retiro, asignación y cambio seguro de PIN con permisos administrativos, validación de duplicados y bitácora. Probar revocación con sesiones existentes y protección de hash A01.

### A18 · MEDIA · La bitácora se guarda pero no puede consultarse en la aplicación

**Observado.** Existe TablaLogs y se persisten eventos; ninguna ruta o componente importa esa tabla. Configuración no ofrece pestaña de actividad. La evidencia de E2E consulta logs directamente en BD, no una pantalla del usuario.

**Impacto.** La trazabilidad durable existe, pero el administrador no puede realizar el seguimiento funcional requerido por CFG-13/PRD-18 desde el producto.

**Fuente.** `src/modulos/auditoria/componentes/tabla-logs.tsx:27; src/modulos/configuracion/componentes/operacion-configuracion.tsx:19-26`

**Evidencia.** revision-catalogo.md N6; búsqueda de TablaLogs en src y revisión de navegación/configuración

**Criterio de corrección.** Montar una consulta autorizada y paginada de actividad por fecha, actor y registro; probar permisos y enlace al objeto sin exponer datos sensibles.

### A19 · MEDIA · El ciclo de gastos no cubre edición, proveedor y reapertura del comprobante

**Observado.** La tabla ofrece cambiar a pagado/cancelado y rentabilidad, pero no editar el gasto ni reabrir su comprobante. El formulario no ofrece selector de proveedor y la tabla muestra proveedorId como UUID. No hay tipo fijo/variable ni filtro por proveedor/IVA.

**Impacto.** Registrar y pagar funciona en las pruebas, pero no completa el CRUD y consulta definidos en GAS-01/02/06/07/09. El OCR con stub no resuelve el acceso posterior al documento guardado.

**Fuente.** `src/modulos/gastos/componentes/tabla-gastos.tsx:65-91; src/modulos/gastos/componentes/modal-registrar-gasto.tsx:239-276; src/modulos/gastos/componentes/operacion-gastos.tsx:206-236`

**Evidencia.** revision-catalogo.md; inspección Codex de tabla/formulario/acciones; gastos-ocr y gastos-rentabilidad verifican solo los recorridos existentes

**Criterio de corrección.** Completar edición con política según estado, selección/nombre de proveedor, filtros y acceso autorizado al comprobante persistido. Verificar cancelación de edición, efecto contable, históricos y permisos.

### A20 · MEDIA · Quedan capacidades funcionales de órdenes, taller y cartera sin cubrir

**Observado.** La reconciliación por ID localizó ausencias de repetición de trabajos, ingreso heredado, resumen/comparativa de órdenes, historial/reanudación/reactivación del taller, cola de trabajos sin planificar, acciones desde calendario, alta manual de CxC, tratamiento heredado y anulación/corrección financiera. La AR automática nace sin folio_factura_remision; sí se puede buscar por orden/cliente.

**Impacto.** El cierre histórico de observaciones no demuestra cobertura del catálogo completo. Algunas funciones tienen reemplazos válidos documentados, que se separaron de estas brechas; no se exige edición de una cotización inmutable ni doble descuento de inventario.

**Fuente.** `matriz-164.csv y escenarios-41.csv; src/modulos/ordenes/servicios/reglas-transicion.ts; src/modulos/planeacion/componentes/operacion-planeacion.tsx; src/modulos/cobranza/componentes/operacion-cobranza.tsx; supabase/migrations/20260919000005_d04_ar_al_aprobar_anticipos.sql:341-349`

**Evidencia.** Segunda revisión Claude de 164 filas y reconciliación Codex; ausencias estáticas, no resultados de pruebas que no pudieron ejecutarse; folio nulo observado en tarifas-plazo.log

**Criterio de corrección.** Resolver cada fila ausente/parcial del catálogo mediante implementación o sustitución de alcance expresamente documentada, conservando el resultado de negocio. Adjuntar después evidencia de sus variantes, no solo botones o tests relacionados.

## Riesgos y variantes sin ejecución específica

- El cálculo de crédito devuelve cero si falla la lectura de cartera/cotización y compara la nueva cotización sin IVA con deuda que sí lo incluye. Se verificó el código, pero no se inyectaron esos errores ni se reprodujo aquí esa variante tributaria. A13/A14 sí son reproducciones independientes confirmadas.
- La reconexión del dashboard contador tras pérdida de un evento de gastos recuperó CxP0→123.45. Se descarta afirmar un fallo genérico de reconexión. Clientes y Comercial siguen afectados por A07, y otras vistas/desconexiones largas requieren su propia prueba.
- No se ejecutaron todas las variantes de archivos geométricos, recuperación de respaldos, proveedores externos, carga sostenida ni dispositivos móviles. La matriz conserva esos límites sin convertir revisión estática en aceptación.

## Cobertura por dominio

| Dominio | Evidencia actual | Lo que impide la aceptación total |
|---|---|---|
| Acceso y permisos | Login por roles, PIN válido, rechazo por permisos y RLS directo | A01/A09; revocación de tokens y matriz exhaustiva de acciones no demostradas |
| Clientes / Comercial | Contactos, historial, creación desde UI, cotización→orden, descuento y TI | A07/A13/A14; conservación de cliente, crédito y variantes de retiro/edición |
| Cotizador y documentos | Unitarias y flujo comercial; documentos en flujos de órdenes/piso | Corpus real de DXF/EPS/PDF, formatos extremos y todos los casos de permisos no cubiertos |
| Órdenes | Alta, edición en borrador, comparación de versión, flujo operativo | A02; todas las variantes de cancelación y anticipos |
| Producción / Taller | PIN, avance, entrega parcial/total y sincronización; taxonomía básica | A05/A06; jerarquía profunda y errores de guardado |
| Planeación | Capacidad, calendario, colaboración, arrastre y propuesta de hueco | Reconexion y todas las combinaciones de turnos/feriados no certificadas |
| Inventario | Pruebas de movimientos y consumo concurrente sin stock negativo | Persistencia y permisos de todas las variantes no ejercidos en navegador |
| Cobranza | Pagos, saldo, flujo y concurrencia de solicitud | A02/A16/A20; cancelación, plazos, corrección y conciliación integral |
| Gastos / Rentabilidad | Alta y cambio de estado ejercidos en E2E, OCR con stub, vista TI | A03/A04/A10/A15/A19; OCR real y CRUD de edición incompleto |
| Dashboard | Segmentación por rol | A03/A04/A08; cálculos cruzados y eventos comerciales |
| Configuración | TC persistente, catálogos y operadores por área | A05/A06/A17/A18; consistencia transaccional, operadores y bitácora |
| Comentarios / Notificaciones | Mención recibida en tiempo real | Entrega de correo externo y recuperación offline no certificadas |

## GitHub, commits y despliegue

Los 17 PR están mergeados; la API de revisiones no registra revisiones formales en esos PR. Esto no descarta revisiones locales anteriores. El CI de `main` terminó correcto: [ejecución 35685365377](https://github.com/L3x-00/ERP-CC/actions/runs/35685365377). El despliegue Production del mismo SHA figura exitoso en GitHub. La URL consultada redirige al acceso de Vercel: no constituye una prueba funcional autenticada de producción.

No hay protección clásica de `main` (API: Branch not protected) ni rulesets devueltos por la API. Se recomienda exigir CI y revisión para integrar, después de corregir la cobertura de integración. No se cambiaron estas reglas.

| PR | Cambio | Estado |
|---|---|---|
| [#1](https://github.com/L3x-00/ERP-CC/pull/1) | Cobertura funcional ORCA MFG ERP: RFQ/ordenes/planeacion/cobranza + aceptacion E2E y OBS-01..30 | MERGED |
| [#2](https://github.com/L3x-00/ERP-CC/pull/2) | Cobranza: flujo neto por cuenta en MXN (OBS-24) | MERGED |
| [#3](https://github.com/L3x-00/ERP-CC/pull/3) | Ordenes: detalle + Orden de Servicio imprimible (DOC-01/03, ORD-03) | MERGED |
| [#4](https://github.com/L3x-00/ERP-CC/pull/4) | Cobranza: estado de cuenta consolidado por cliente (OBS-27) | MERGED |
| [#5](https://github.com/L3x-00/ERP-CC/pull/5) | Configuracion: migracion CFG-08/09 (tiers y categorias configurables) | MERGED |
| [#6](https://github.com/L3x-00/ERP-CC/pull/6) | Configuracion: catalogos comerciales editables (CFG-08/09) | MERGED |
| [#7](https://github.com/L3x-00/ERP-CC/pull/7) | Ordenes: edicion en borrador con CAS (ORD-05) | MERGED |
| [#8](https://github.com/L3x-00/ERP-CC/pull/8) | Bloque 6 (parcial): estado de cuenta con ordenes, selector de gastos, TI y archivo al entregar | MERGED |
| [#9](https://github.com/L3x-00/ERP-CC/pull/9) | Cobranza: estado de cuenta solo con ordenes abiertas y dias de cartera vencida | MERGED |
| [#10](https://github.com/L3x-00/ERP-CC/pull/10) | D-04 (AR no cobrable al aprobar + anticipos) y documentos en piso (OBS-06/ORD-09/OBS-13) | MERGED |
| [#11](https://github.com/L3x-00/ERP-CC/pull/11) | OBS-02/03 (contactos y proxima accion) y D-02 (capacidad instalada equipos x jornada) | MERGED |
| [#12](https://github.com/L3x-00/ERP-CC/pull/12) | Costo de produccion de TI en rentabilidad + comentarios en piso (OBS-17) | MERGED |
| [#13](https://github.com/L3x-00/ERP-CC/pull/13) | docs: estado final del backlog y pendientes de cierre | MERGED |
| [#14](https://github.com/L3x-00/ERP-CC/pull/14) | feat(planeacion): desglose, vistas y arrastre con propuesta de hueco (OBS-08/18/19) | MERGED |
| [#15](https://github.com/L3x-00/ERP-CC/pull/15) | feat(comercial): equipo/estacion por linea e historial navegable con notas de taller (OBS-04/11) | MERGED |
| [#16](https://github.com/L3x-00/ERP-CC/pull/16) | feat(taller): taxonomia de subareas/procesos y colas por area de operador (OBS-14/09/PRD-11) | MERGED |
| [#17](https://github.com/L3x-00/ERP-CC/pull/17) | feat(rentabilidad): desglose por estacion, anti-duplicado, costo TI y cierre de limites (OBS-29/GAS-08) | MERGED |

## Verificación remota y límites

Proyecto identificado: `pwnecbcynnqnvfwmvrnn`. El conector SQL denegó acceso y la consulta del historial de migraciones devolvió 403. Mediante GET autorizado y solo lectura, el API remoto sí respondió: 37 tablas y 43 rutas RPC visibles en OpenAPI; se comprobaron estación de línea, jerarquía de áreas, operadores_areas, cobrable_desde y cuenta bancaria de gastos. Esto confirma presencia de contratos, **no equivalencia del cuerpo SQL, grants, RLS, publicación Realtime ni historial de migraciones**. No se atribuyen automáticamente los defectos reproducidos localmente a una ejecución observada en producción.

La disponibilidad del despliegue y el reporte histórico del PO no sustituyen pruebas remotas por rol. Tampoco se ejecutó una restauración de respaldo, prueba de carga, auditoría de infraestructura completa ni OCR/correo con proveedores reales. Quedan fuera de cualquier certificación los mecanismos no ejercidos. No se alteraron datos de producción.

## Plan de cierre

1. Corregir A01 y proteger nuevamente credenciales; añadir prueba negativa por columna.
2. Corregir A02–A04 con reglas transaccionales y una única base de cálculo financiero; tratar anticipos explícitamente.
3. Corregir A05/A06 y ejecutar prueba de fallo con preservación de áreas y jerarquía de tres niveles.
4. Corregir A07–A09; probar dos usuarios, permisos revocados y recuperación tras desconexión.
5. Corregir A10/A11 y ampliar CI para incluir integración aislada y las regresiones de esta auditoría.
6. Corregir A13/A14 dentro de la aprobación y garantizar identidad y crédito; corregir A15/A16 en estimados y plazos.
7. Resolver A17–A20 y las filas ausentes/parciales de la matriz. Actualizar A12 con resultados reales, validar el entorno remoto, proveedores y recuperación cuando exista acceso y un encargo de prueba autorizado.

La aceptación del sistema requiere ausencia de hallazgos altos abiertos y evidencia individual suficiente; no basta con repetir las 24 pruebas actuales. Esta entrega es el dictamen de auditoría y el plan verificable de remediación. No incluye implementación de las correcciones ni aceptación contractual del cliente.

## Entregables y trazabilidad

- `matriz-164.csv`: evaluación actual individual de los 164 criterios, resultado esperado, evidencia estática, decisiones reconciliadas, brechas y hallazgos. No reutiliza el estado histórico como dictamen actual.
- `escenarios-41.csv`: pasos y resultado esperado del documento, evidencia ejecutada por significado, resultado observado y variantes pendientes/sustituidas para cada uno de los 41 escenarios. No se basa en buscar etiquetas en tests.
- `COBERTURA.json`: recuento de estados estáticos y de ejecución parcial; ningún conteo equivale a aceptación integral.
- `hallazgos.json`: hallazgos estructurados para su seguimiento.
- Evidencia reproducible local en `D:/ERP-CC/.ai-shared/qa/auditoria-global-2026-09-22/`. El archivo CONTINUIDAD.md resume lo ejecutado para evitar repetir lecturas y pruebas.

Se ejecutaron dos revisiones independientes con Claude Code, en modo solo lectura (88 y 130 turnos; modelo reportado por la herramienta: claude-opus-5). Codex contrastó decisiones, fuentes y resultados y reprodujo los riesgos aceptados cuando correspondía. Se corrigió la valoración inicial del grant mediante A01 y se rechazó exigir retirar la referencia bancaria porque D-08 la conserva. Las divergencias sobre cotizaciones inmutables y consumo durante producción se clasificaron aparte. A13/A15 pasaron de riesgos estáticos a reproducciones; no se atribuyen pruebas a Claude.
