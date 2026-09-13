# PROMPT 4 · Corrección funcional basada en mis observaciones

Actúa como responsable funcional y técnico de mi versión mejorada del ERP de manufactura. Implementa las correcciones funcionales de este encargo siguiendo las instrucciones de ingeniería vigentes del proyecto donde se ejecute. Antes de editar, inspecciona el estado actual y preserva el trabajo existente. Este documento se entrega como prompt reutilizable: su creación no significa que estas correcciones ya se hayan implementado.

Objetivo: conservar las capacidades del ERP de referencia y lograr que el flujo comercial, planeación, taller, entregas, inventario, cobranza y gastos sea completo e interactivo. Trabaja sobre la versión mejorada, sin reconstruirla ni reemplazar sus capacidades adicionales.

Mis observaciones están normalizadas abajo como OBS-01 a OBS-30. Son requisitos funcionales, no diagnóstico de errores. Algunas ya tienen una parte representada en el ZIP; primero verifica su cobertura real en la mejora y completa lo necesario. No elimines funciones que ya cumplen por duplicar módulos. No confundas el texto de referencia con una orden de operar sobre clientes o producción real.

Reglas del encargo:
- Identifica todos los puntos de entrada de cada función: modal, listado, calendario, historial, tarjeta y acceso cruzado; el comportamiento debe ser consistente.
- Usa una sola fuente de verdad para cliente, oportunidad, cotización, orden, partida, avance, entrega, cobro y gasto, respetando la arquitectura existente.
- Cada alta/edición debe ser recuperable; las acciones modifican su estado, filtros, indicadores y datos vinculados. No aceptes un botón visual como corrección terminada.
- Preserva cotizador técnico, lectura asistida de DXF, captura manual EPS/AI, tiers/descuentos, crédito, seguimientos, adjuntos, sesiones, anticipos, historial, documentos y catálogos. Reubica las capacidades reemplazadas por mis observaciones sin perder su propósito.
- Distingue avance de fabricación de entrega al cliente; comentario de sesión de conformidad; cotización de orden; pago real de aplicación de saldo a favor; saldo de cartera de saldo bancario; recargo sobre costo de margen sobre venta.
- Toda decisión no especificada se registra como propuesta con impacto funcional. Continúa lo independiente; no inventes aprobaciones ni datos de negocio.
- No ejecutes migraciones destructivas, borrados de datos reales, despliegues ni envíos al cliente solo porque este prompt los describe. Sigue las autorizaciones del entorno de trabajo.

Entrega: matriz OBS → situación inicial → solución/equivalencia → archivos/pantallas afectadas → prueba → resultado; evidencia del flujo completo; decisiones pendientes; capacidades conservadas. Cierra solo los requisitos probados y explica exactamente cualquier dependencia que impida comprobar uno.

Orden propuesto de implementación: (1) catálogos/áreas/cuentas y modelo de asignación, (2) Comercial/cotizaciones/archivos, (3) Órdenes/planeación/operadores, (4) avances/entregas/consumo, (5) Cobranza/saldo a favor/documentos, (6) Gastos/rentabilidad/dashboard, (7) E2E de paridad. Ajusta el orden a dependencias reales sin omitir requisitos.

## Reglas y decisiones que se deben reconciliar

- D-01 · Alta de órdenes: el ZIP permite alta normal, repetición y migración manual en Órdenes. OBS-15 exige origen comercial para la creación ordinaria. Adoptar ese origen; decidir si se conserva una excepción administrativa de ingreso histórico, fuera del flujo cotidiano.
- D-02 · Capacidad: el ZIP calcula ocho horas globales por día y permite horas extra; OBS-19 pide horarios específicos y bloqueo. Aplicar bloqueo ordinario. Falta precisar si las ocho horas son por operador, por estación o ambos; proponer comprobación de ambos recursos cuando estén asignados y explicitar el alcance antes de implementar.
- D-03 · Estados: aprobado/bandeja no equivalen automáticamente a Programada. En el ZIP programar es fechaPlaneada. Proponer Programada como estado o condición de planificación visible, manteniendo separados estado de fabricación y estado financiero.
- D-04 · Cobranza: la base crea AR borrador al aprobar y lo activa al quedar Lista/Entregada. OBS-22 requiere visibilidad desde aprobación, lo que puede cumplirse con borrador. Si el negocio quiere exigibilidad desde aprobación, necesita una decisión de plazo distinta, no una inferencia.
- D-05 · Parciales: avances parciales por parte/proceso están representados; entregas parciales con documentos y saldo de entrega son una ampliación posible de OBS-10. No confundir fabricar cuatro con entregar cuatro.
- D-06 · Retirar trabajos: interpretar quitar de órdenes como retirar del tablero activo conservando historia. Proponer que Lista permanezca en pendientes de entrega y que Entregada se archive; si se desea retirarla al completar, mantener una bandeja de entregas separada.
- D-07 · Divisas: TC se expresa en MXN por USD. Para registrar USD se multiplica; convertir MXN a USD divide. Definir si cambiar el selector reinterpreta el número o convierte el importe. Propuesta: selector define moneda de captura; conversión explícita muestra ambos valores y preserva monto y TC históricos.
- D-08 · Referencias bancarias: OBS-24 pide quitar el campo de referencia, pero sí identificar la cuenta. Proponer ocultar referencia en captura ordinaria y conservarla en históricos; no retirar cuenta, banco, método ni folio del documento.
- D-09 · Saldo a favor: OBS-25 no detalla devoluciones, caducidad ni ajustes. Cubrir origen por excedente y aplicación identificada; cualquier devolución/ajuste adicional debe definirse aparte. Límite de crédito y saldo a favor son distintos.
- D-10 · Inventario: no hay módulo/stock/movimientos en el ZIP. OBS-12 exige consumo al terminar, compatible con un consumo previo si solo se descuenta la diferencia. Definir material, unidad, cantidad real, tratamiento de merma y evento de cierre sin imponer un segundo descuento a la versión mejorada.
- D-11 · Rentabilidad: separar recargo del cotizador, eficiencia de horas y utilidad por orden. Proponer venta neta sin IVA menos material real, horas por tarifa histórica y otros costos atribuibles; acordar costo indirecto, tarifas y tratamiento de impuestos sin duplicar conceptos.
- D-12 · Cotizador: el texto no adjunta una nueva lista de campos. Usar los campos del ZIP descritos en COT/CFG y registrar cualquier ampliación. Parámetros configurables como vida de fresa no prueban que la fórmula base los use.
- D-13 · Estructura de taller: clasificar nombres de OBS-14 como áreas/subáreas/procesos/estaciones mediante un mapa explícito. Un proceso externo registra proveedor, pero no implica orden de compra ni integración con terceros.
- D-14 · Documentos y notas: no existe portal de cliente evidenciado. Historial por cliente significa inicialmente ficha interna. Una nota operativa visible en esa ficha no autoriza enviarla al cliente ni hacer públicos planos internos.
- D-15 · Formulario de planeación: el usuario plantea quitarlo o explicarlo mejor. Proponer acción contextual con descripción y calendario; si se decide reemplazarlo, mantener la capacidad de programar sin recapturar el pedido.
- D-16 · Tasas: la base tiene IVA 16% en cotizaciones/documentos, selector 8/16/sin IVA en gastos y tasa global configurable. Registrar la regla objetivo de aplicación consistente y valores históricos; no confundir presencia de configuración con una prueba de propagación.

Las decisiones son aclaraciones necesarias para ejecutar los prompts en la mejora, no hallazgos de errores del proyecto. No bloquear la extracción o las comprobaciones independientes por una decisión todavía pendiente.

### OBS-01 · Navegación desde indicadores

Módulo: Dashboard. Fuente: observaciones, líneas 2-3. Relación: DAS-01,DAS-02,DAS-03,DAS-04,DAS-05,DAS-06,AR-12.

Requisito de corrección: Cada KPI, gráfico o segmento con datos abre el listado o proceso que explica su cifra, con filtro visible y contexto conservado.

Criterio verificable: Con dos grupos de cartera, pulsar 1-30 días muestra solo documentos/clientes con deuda vencida entre 1 y 30 días; volver conserva el contexto. Interpretar ese tramo como antigüedad, no como mes calendario.

### OBS-02 · Búsqueda de empresa y contacto

Módulo: Comercial. Fuente: observaciones, líneas 6. Relación: RFQ-02,CLI-01.

Requisito de corrección: Ofrecer búsqueda y selección de clientes/contactos vinculados y alta rápida cuando no existan, guardando en Clientes sin abandonar la oportunidad.

Criterio verificable: Buscar una empresa existente, elegir su contacto y luego crear otra desde el mismo formulario; la nueva ficha queda disponible en Clientes y seleccionada, sin duplicar la empresa al cambiar contacto.

### OBS-03 · Seguimiento del prospecto

Módulo: Comercial. Fuente: observaciones, líneas 7. Relación: RFQ-08,CLI-02.

Requisito de corrección: Registrar si el prospecto ya fue contactado, última interacción, siguiente acción concreta, responsable y fecha de próximo seguimiento.

Criterio verificable: Crear prospecto no contactado con acción de llamada; registrar contacto y nueva acción; ambas situaciones quedan claras y el seguimiento pendiente se puede consultar.

### OBS-04 · Necesidad completa y varias solicitudes

Módulo: Comercial. Fuente: observaciones, líneas 8-10. Relación: RFQ-01,RFQ-04,RFQ-05.

Requisito de corrección: La oportunidad describe qué necesita el cliente y permite varias solicitudes/partidas con cantidades, material, área, equipo o estación, procesos, condición interna y seguimiento.

Criterio verificable: Crear dos solicitudes de distinta área en una oportunidad; conservar descripción y asignación técnica de cada una y los campos generales al guardar/reabrir.

### OBS-05 · Distribución por estaciones y procesos

Módulo: Comercial a taller. Fuente: observaciones, líneas 11;55. Relación: RFQ-05,PRD-02.

Requisito de corrección: Al generar la orden, distribuir sus partidas a las áreas/subáreas/estaciones correspondientes con procesos ordenados; conservar un único vínculo al pedido original.

Criterio verificable: Una orden con corte y carpintería aparece en ambas colas con solo las actividades relevantes y permite volver a su detalle general; no duplica la venta ni la orden.

### OBS-06 · Planos múltiples utilizables en taller

Módulo: Archivos. Fuente: observaciones, líneas 12. Relación: RFQ-19,DOC-04,ORD-09.

Requisito de corrección: Permitir de uno a varios adjuntos por solicitud/orden, visualización de formatos compatibles y descarga para los operadores asignados.

Criterio verificable: Adjuntar dos planos, abrir la orden desde taller, consultar ambos y descargar una copia legible; los cambios de archivo se identifican en el contexto de la orden.

### OBS-07 · Cotizaciones integradas al pipeline

Módulo: Cotizaciones. Fuente: observaciones, líneas 13;34. Relación: RFQ-01,COT-01.

Requisito de corrección: Disponer de sección de cotizaciones vinculadas al pipeline y crear/editar desde modal en la misma ventana, manteniendo cliente, oportunidad y contexto.

Criterio verificable: Desde oportunidad crear una cotización, abrir su calculadora, guardar y verla tanto en la oportunidad como en la sección Cotizaciones sin recapturar datos.

### OBS-08 · Desglose de lo solicitado

Módulo: Planeación y materiales. Fuente: observaciones, líneas 16-19. Relación: PRD-16,ORD-07,PLA-01.

Requisito de corrección: Cada trabajo programable explica qué se solicita, descripción, materiales requeridos y desglose del estado por partida/proceso.

Criterio verificable: Abrir una partida desde Planeación y reconocer pedido, material, cantidad, proceso actual, avance y pendientes; mostrar explícitamente datos aún por definir.

### OBS-09 · Asignación inequívoca del trabajo

Módulo: Operadores. Fuente: observaciones, líneas 20-22;65-67. Relación: ACC-05,PRD-11,PRD-16.

Requisito de corrección: Mostrar a cada operador sus trabajos y procesos, identificando centro, área, estación y responsable; contrastar identidad y asignación al iniciar o registrar avance.

Criterio verificable: Un operador de corte puede actuar sobre su actividad; otro sin asignación no puede apropiársela; ambos identifican claramente qué deben hacer y quién atiende los otros procesos.

### OBS-10 · Parciales de producción y entrega

Módulo: Producción. Fuente: observaciones, líneas 23. Relación: PRD-09,PRD-13,DOC-02.

Requisito de corrección: Soportar avances parciales acumulados por parte/proceso. Separar el concepto de entrega parcial al cliente y habilitarlo si esa es la acepción confirmada de la observación.

Criterio verificable: Para meta 10, registrar 4 y luego 6 conserva el acumulado sin cerrar anticipadamente; si se activa entrega parcial, documentar 4 entregadas/6 pendientes independientemente del avance de fabricación.

### OBS-11 · Historial comercial y operativo navegable

Módulo: Clientes. Fuente: observaciones, líneas 25-27;33. Relación: CLI-07,PRD-17,AR-14.

Requisito de corrección: La ficha del cliente reúne cotizaciones anteriores, órdenes, entregas y notas generadas por operadores, con enlaces a sus registros originales; las notas aparecen automáticamente vinculadas.

Criterio verificable: Abrir cliente, entrar a una cotización histórica y su orden; guardar una nota de sesión y comprobar que se consulta en el historial sin volver a escribirla.

### OBS-12 · Descuento automático de existencias

Módulo: Inventario. Fuente: observaciones, líneas 28-29. Relación: PRD-13,TRA-02.

Requisito de corrección: Al confirmar finalización de producción, registrar consumo de material asociado a orden/partida y actualizar existencias; tratar reservas, consumos previos y parciales sin descontar dos veces.

Criterio verificable: Con stock 100 y consumo real 12, finalizar deja 88 y un movimiento trazable; repetir confirmación no vuelve a descontar; si ya se consumieron 5, al final se descuentan solo los 7 restantes. Esto es requisito adicional al ZIP.

### OBS-13 · Conformidad fiel al pedido

Módulo: Entregas. Fuente: observaciones, líneas 31-32;75. Relación: DOC-01,DOC-02,DOC-03.

Requisito de corrección: Generar nota/conformidad imprimible y descargable que refleje exactamente lo solicitado y lo efectivamente entregado, incluyendo cliente, orden, conceptos, cantidades y responsable.

Criterio verificable: Con pedido de dos partidas, la conformidad muestra ambas y sus cantidades; imprimir/guardar permite recuperar el documento; las diferencias y pendientes de una entrega parcial se distinguen.

### OBS-14 · Áreas, subáreas y procesos configurables

Módulo: Configuración de taller. Fuente: observaciones, líneas 35-52;55;103. Relación: CFG-06,CFG-11,RFQ-05.

Requisito de corrección: Configurar Metal mecánica: Corte láser, Press Brake, Soldadura, Ensamblado y pintura; Fabricación digital: CNC Router, Láser CO2, Grabado, Impresiones, Escaneo, Carpintería; Acabados: Preparado; Externo. Permitir varias operaciones y extensión del catálogo.

Criterio verificable: Crear/editar áreas y subáreas y comprobar que se ofrecen en Comercial, Planeación y Producción. La clasificación subárea/proceso/estación debe acordarse sin perder los nombres ni crear duplicados semánticos.

### OBS-15 · Origen comercial y tablero de órdenes

Módulo: Órdenes. Fuente: observaciones, líneas 56;59-60. Relación: ORD-03,ORD-04,ORD-06,CLI-08,RFQ-15.

Requisito de corrección: La creación ordinaria de OP nace en Comercial, con indicador interna/comercial. Órdenes se centra en tablero, detalles, acceso al proceso y seguimiento; la repetición también regresa a Comercial.

Criterio verificable: Aprobar oportunidad produce una OP y la muestra en el tablero; no se ofrece alta productiva ordinaria desconectada de Comercial; una orden interna queda señalizada y sin venta. El ingreso histórico requiere decisión explícita como excepción de migración.

### OBS-16 · Acciones y estados consistentes

Módulo: Órdenes. Fuente: observaciones, líneas 57-58. Relación: ORD-12,PRD-04,PRD-05,PRD-06,PRD-13.

Requisito de corrección: Pausar, reanudar, completar y cancelar producen sus efectos reales, están agrupadas en menú contextual y actualizan filtros/conteos; Programada y En proceso tienen etiquetas distintas.

Criterio verificable: Programar, iniciar, pausar y reanudar una orden cambia su pertenencia a filtros; cancelar conserva motivo/historial y la retira de activos; completar exige regla de finalización y no equivale a cancelar.

### OBS-17 · Comentarios por orden

Módulo: Órdenes. Fuente: observaciones, líneas 60. Relación: ORD-03,PRD-17.

Requisito de corrección: Cada detalle de orden dispone de comentarios con autor, fecha y contexto; se conserva relación con cliente y proceso sin confundir comentario libre con avance o entrega.

Criterio verificable: Añadir comentario a una orden y recuperarlo al abrirla desde Comercial, Órdenes y Producción según permisos; otra orden no recibe ese comentario.

### OBS-18 · Programar partida comprensible

Módulo: Planeación. Fuente: observaciones, líneas 62-63. Relación: PLA-01,PLA-02,OBS-08.

Requisito de corrección: Conservar la operación de programar pero convertirla en acción contextual desde la partida, con descripción de qué se programa, recurso, horario, duración y resultado, o sustituir el formulario por calendario equivalente.

Criterio verificable: Una persona programa sin introducir IDs internos y ve resumen previo y resultado en calendario. Se adopta como propuesta explicar la acción; eliminar definitivamente el formulario es alternativa indicada por el usuario, no una orden simultánea.

### OBS-19 · Horario, capacidad y sobrecarga

Módulo: Agenda. Fuente: observaciones, líneas 68-70. Relación: PLA-02,PLA-03,PLA-04,PLA-05.

Requisito de corrección: Programar varios trabajos con horas específicas y arrastre; capacidad ordinaria de ocho horas por día, descuento de duración y bloqueo cuando no cabe; ofrecer siguiente día con capacidad comprobada.

Criterio verificable: Asignar 5 h y 3 h deja 0 h; intentar otra hora se bloquea sin guardar; proponer siguiente día hábil con hueco y confirmar deja la orden allí. No mantener Asignar de todas formas como vía ordinaria.

### OBS-20 · Área como filtro principal y flujo completo

Módulo: Producción. Fuente: observaciones, líneas 72-74. Relación: PRD-01,PRD-02,PRD-04,PRD-13.

Requisito de corrección: Priorizar filtro por área manteniendo estado como información; Aprobado → Bandeja → Iniciar → En proceso → Cerrar sesión → Lista → Entrega, con pausas y parciales cuando correspondan.

Criterio verificable: Una orden multiárea se encuentra por cada área; cerrar una sesión incompleta no la entrega; el cierre completo habilita entrega y descarga de conformidad.

### OBS-21 · Retirar terminadas del trabajo activo

Módulo: Producción y archivo. Fuente: observaciones, líneas 75. Relación: PRD-13,CLI-07,DOC-03.

Requisito de corrección: Después de completar/entregar según el punto de archivo acordado, retirar de la cola de trabajo activa y conservar consulta histórica y conformidad descargable.

Criterio verificable: Entregar una orden deja el tablero operativo libre y permite recuperar pedido, sesiones, documentos y cuenta por cobrar desde historial. Interpretar quitar como archivar, no destruir evidencia.

### OBS-22 · Visibilidad financiera desde aprobación

Módulo: Cobranza. Fuente: observaciones, líneas 77-78. Relación: AR-01,AR-03,RFQ-15.

Requisito de corrección: La aprobación comercial crea o hace visible la orden y su registro financiero asociado inmediatamente; se puede entrar a su detalle sin duplicados.

Criterio verificable: Aprobar una cotización muestra un registro en Cobranza con su estado financiero correcto; distinguir borrador visible de saldo ya exigible conforme al momento de activación acordado.

### OBS-23 · Moneda de cobro y tipo de cambio

Módulo: Cobranza. Fuente: observaciones, líneas 79;85-87. Relación: AR-05,CFG-02.

Requisito de corrección: En MXN el TC queda en 1 y bloqueado; en USD se captura TC positivo en MXN por USD y se presenta la multiplicación, moneda original y equivalente aplicado.

Criterio verificable: Un pago de USD 100 a TC 17.50 muestra MXN 1750; cambiar a MXN interpreta el monto como pesos y usa TC 1; si se ofrece convertir un monto existente, USD→MXN multiplica y MXN→USD divide, con confirmación del importe resultante.

### OBS-24 · Cuenta destino/origen y referencias

Módulo: Cuentas. Fuente: observaciones, líneas 80-84;95. Relación: CFG-03,AR-15,GAS-01,DAS-04.

Requisito de corrección: Seleccionar cuenta en cobros y cuenta de salida en gastos; exponer catálogo en Configuración y reflejar movimientos en dashboard. Quitar referencia bancaria del formulario ordinario; preservar datos históricos y no confundir referencia con cuenta.

Criterio verificable: Cobrar 1000 en Cuenta A y pagar gasto 300 desde A produce flujo registrado neto +700 en A; Cuenta B no cambia; retirar cuenta del uso futuro conserva la lectura del historial.

### OBS-25 · Saldo a favor visible y aplicable

Módulo: Clientes y Cobranza. Fuente: observaciones, líneas 88. Relación: CLI-03,AR-05,AR-07.

Requisito de corrección: Mostrar saldo a favor en ficha del cliente y nueva columna en Cobranza, con origen y aplicaciones; si se utiliza para pagar otra orden, no registrarlo de nuevo como ingreso bancario.

Criterio verificable: Cobrar 1200 sobre deuda 1000 deja deuda 0 y crédito 200; aplicar 150 a otra deuda deja crédito 50, disminuye esa deuda 150 y no altera otra vez las cuentas de caja/banco.

### OBS-26 · Proforma o comprobante de cobro

Módulo: Documentos de cobro. Fuente: observaciones, líneas 89-90. Relación: AR-05,AR-07,DOC-03.

Requisito de corrección: Generar documento imprimible/descargable con datos del cliente, órdenes, total, importe abonado, saldo, fecha, moneda/TC y cuenta/método aplicable; precisar si se denomina proforma o recibo según momento.

Criterio verificable: Registrar pago parcial de 400 sobre 1000 y obtener documento con total 1000, abonado 400 y pendiente 600; reabrir el documento conserva esos datos y su vínculo con la operación.

### OBS-27 · Consolidado imprimible y compartible

Módulo: Estado de cuenta. Fuente: observaciones, líneas 91-92. Relación: AR-12,AR-14.

Requisito de corrección: Generar por cliente un estado de cuenta de múltiples órdenes con importes, pagos, saldos, vencimientos y días de atraso; permitir descargar/imprimir y preparar envío al destinatario elegido.

Criterio verificable: Un cliente con cinco órdenes recibe en la previsualización exactamente esas cinco, sus saldos individuales y total conciliado; generar el archivo no significa que se haya enviado. Envío real solo tras acción autorizada del usuario.

### OBS-28 · Gasto con cuenta y selección de orden

Módulo: Gastos. Fuente: observaciones, líneas 83;94-96. Relación: GAS-01,GAS-04,OBS-24.

Requisito de corrección: El formulario de gasto muestra cuenta de salida y selector de órdenes con folio/cliente/descripción; conserva opción sin orden para gasto general y se refleja en el flujo de cuentas.

Criterio verificable: Registrar un gasto ligado a una OP y otro general, elegir cuenta en ambos, y comprobar asociación, saldo/flujo y desglose posterior sin introducir manualmente un ID de orden.

### OBS-29 · Rentabilidad por orden y estación

Módulo: Rentabilidad. Fuente: observaciones, líneas 99-101. Relación: ORD-11,COT-07,COT-08,COT-09,COT-10,GAS-04.

Requisito de corrección: Comparar venta neta, horas estimadas/reales, tarifa de cada estación, materia prima consumida y gastos atribuibles; presentar costo total, utilidad y margen, con desglose y procedencia.

Criterio verificable: Venta neta 10000, material 3000, trabajo 2000 y otros costos 1000 produce costo 6000, utilidad 4000 y margen 40%. No duplicar material o mano de obra si ya están incluidos en un gasto vinculado.

### OBS-30 · Parámetros completos del cotizador

Módulo: Cotizador y configuración. Fuente: observaciones, líneas 105-106. Relación: COT-01,COT-07,COT-08,COT-09,COT-10,CFG-10.

Requisito de corrección: Ubicar en Configuración los campos del cotizador identificados en el ZIP y las tarifas por estación necesarias para rentabilidad, con unidades y efecto claro sobre nuevos cálculos.

Criterio verificable: Cambiar tarifa de una estación y realizar una nueva cotización muestra el efecto esperado; cotizaciones aceptadas e históricos conservan sus valores pactados. No inventar un anexo de campos que el texto no contiene.
