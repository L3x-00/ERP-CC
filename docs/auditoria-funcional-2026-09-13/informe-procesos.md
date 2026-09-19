# Informe de cobertura funcional — ORCA MFG ERP

Fecha: 13 de septiembre de 2026. Corte de producto: `9209de8`. Fuentes: catálogo de 164 IDs, Prompts 2/3/4 y extracción original de `ERP-CC-main/src/App.jsx` conservada en el directorio de referencia del escritorio. La revisión cubre únicamente este ERP.

## Dictamen y alcance de aceptación

La paridad funcional integral **no está demostrada**. Se completó el inventario documental de **164/164 requisitos**, con 115 coberturas parciales, 34 no cubiertas en el alcance revisado, 8 no verificables, 3 sustituidas por observaciones y 4 pendientes de decisión histórica. No se asignó una etiqueta de verificación integral a partir de un botón, una función o una prueba simulada.

Se ejecutaron **390 pruebas unitarias y 37 de acciones con dependencias simuladas: 427 aprobadas, cero fallidas, cero omitidas dentro de la selección**. No se ejecutaron los 41 E2E del catálogo ni pruebas con datos de producción. Las cuatro suites de integración que cargan `.env.local` y escriben en la BD fueron excluidas deliberadamente. Docker local no respondió y no se confirmó otro entorno aislado. El alcance no autoriza aplicar migraciones para construirlo.

Cobertura verificada: **(0 conservadas + 0 equivalentes verificadas) / 157 requisitos aplicables decididos = 0 %**. Denominador: 164 − 3 sustituidos − 4 decisiones que afectan la aplicabilidad histórica completa. Los ocho no verificables permanecen en el denominador. Las 16 aclaraciones D-01..D-16 se registran por separado: las que afectan variantes o detalles de un requisito parcial no eliminan toda su obligación base ni se restan nuevamente. Este porcentaje expresa falta de evidencia integral, no que el ERP carezca de funciones.

La auditoría y sus entregables quedan terminados dentro del alcance comprobable. La aceptación de los procesos y la ejecución E2E permanecen abiertas con dependencias expresas; no constituyen un cierre funcional de producción.

## Mapa de la referencia al objetivo

| Referencia | Objetivo y puntos de entrada | Actores y datos | Resultado de la inspección |
|---|---|---|---|
| Acceso/panel/PIN | `/iniciar-sesion`, `/operador`, chasis administrativo, `/produccion-piso` | Usuario administrativo y operador PIN tienen sesiones diferentes | Identificación representada; falta navegación ejecutada por rol y comprobación de conservación/cierre |
| Dashboard | `/dashboard`; `/tablero` redirige | Proyección diferenciada admin/vendedor/gerente/contador | KPI no siempre mide el universo base; revisar fecha de emisión, creación y corte |
| Clientes | `/clientes`: tabla → modal alta/edición → ficha general/documentos/oportunidades/comentarios | `clientes`, crédito desde CxC, documentos | Historial de oportunidades/órdenes es un placeholder; no hay repetir trabajo |
| RFQ/cotización | `/pipeline`: alta prospecto → Kanban/tarjeta/selector; tabla de lectura | `pipeline`, `cotizacion_lineas`, cliente y OP | FormularioCotizacion existe sin consumidor en una ruta; no hay calculadora técnica contextual |
| Órdenes | `/ordenes`: alta manual, selección de partidas, transiciones y comentarios | OP, partidas y asignación | Alta ordinaria manual contradice OBS-15; falta edición/detalle/historial documental completo |
| Calendario | `/planeacion`: rango/filtros → tabla → panel programar/reprogramar/preparar | Recurso, turno, capacidad, secuencia, partida | Tabla por rango puede conservar parte de la consulta; no ofrece agenda semana/mes ni detalle integral |
| Taller | `/produccion`: Kanban → panel sesión y nota; `/produccion-piso`: acciones de partida asignada | Sesión, programaciones, avance, consumo | Dos accesos con políticas y operaciones distintas; cantidad fabricada solo en última secuencia |
| Entrega/documentos | Formulario de nota en `/produccion`; recibo en `/cobranza`; ficha documental cliente | Notas y renglones, pagos, documentos cliente | Nota transaccional no es conformidad imprimible; recibo imprime pero no se recupera tras recargar |
| CxC/cobranza | `/cobranza`: tabla → modal pago/monedero → recibo | CxC, pagos, movimientos de saldo | Apertura solo en acción de servidor; no CxC temprana ni anticipo antes de completar OP |
| Gastos/CxP | `/gastos`: filtros, formulario/OCR, tabla/estado, consulta rentabilidad | Gasto, OP por UUID, proveedor en contrato, costos | Falta cuenta origen, edición y comprobante recuperable; gráfico no usa el subconjunto filtrado |
| Configuración | `/configuracion`: Empresa, Tarifas/TC, Áreas, Cuentas, Plantillas | Configuración, áreas y cuentas bancarias | Tiers/etiquetas/categorías/usuarios/folios no tienen CRUD equivalente; plantillas sin documentos completos |
| Capacidad adicional | `/inventario`, comentarios, permisos por rol, planeación por recurso, monedero | Stock/kardex/CPP, recursos y registros propios | Preservar; no reducir el producto a los módulos o constantes de la versión anterior |

Referencias de entrada: `src/compartido/componentes/navegacion/modulos-navegacion.ts:16`, páginas bajo `src/app/`, `src/modulos/pipeline/componentes/tablero-kanban.tsx:34`, `src/modulos/clientes/componentes/ficha-cliente.tsx:112`. Todas las referencias de la matriz cuentan con huella de archivo en `evidencias/referencias-codigo.json`.

## Acceso funcional por actor

Se inspeccionaron los permisos definidos por las migraciones locales y sus consumidores. **No se consultó la matriz real de usuarios/permisos de producción.** Los overrides por usuario pueden cambiar el acceso efectivo y requieren casos ejecutados en el entorno de prueba.

| Actor base → objetivo | Capacidad definida en código | Acción local permitida/rechazada y límite |
|---|---|---|
| Administrador → admin | Menú completo y acciones administrativas; configurar, comercial, operación y finanzas | Permisos/acciones probados aisladamente; acceso de navegador completo pendiente |
| Operador → operador PIN | `/produccion-piso` carga OP en proceso con partidas asignadas; registra tiempo/avance/consumo | Identidad coincidente registra tiempo; identidad ajena rechazada. Servicios/identidad simulados, no prueba de asignación persistida |
| Confirmante → operador de sesión | Cierre exige PIN del mismo operador HMAC; no acepta ID arbitrario del navegador | PIN coincidente acepta cierre, PIN no confirmado lo rechaza; no se ejecutó relevo entre operadores reales |
| Gerente → gerente | Clientes/equipo/órdenes, inventario/producción/planeación; finanzas no por defecto | Nota de entrega permitida con permiso, rechazada sin él en pruebas de acción |
| Vendedor → vendedor | Clientes y aprobación; pipeline de alcance propio según reglas | No se asume acceso a finanzas; pruebas de proyección de Dashboard usan dependencias simuladas |
| Contador → contador | Ver finanzas, registrar pagos/gastos, aplicar saldos | Pruebas locales de acciones financieras; lectura y mutación real permitida/fuera de alcance pendiente |
| Cliente externo → entidad comercial | Destinatario del documento, sin portal de cliente localizado | No se exige login externo ni se atribuye autorización para enviar planos/notas |

Fuentes: `supabase/migrations/20260703000002_crear_tabla_permisos_rol.sql:54`, `20260812052820_endurecimiento_seguridad_realtime.sql:152`, `20260813201729_fase_6_planeacion_base.sql:33`; `src/app/(privado)/produccion/page.tsx:10`, `src/app/(piso)/produccion-piso/page.tsx:13`.

Un menú visible no garantiza que la ruta se pueda usar: Producción exige permiso administrativo y las sesiones operativas requieren además identidad PIN. El operador que entra únicamente por PIN llega a otro panel. Debe probarse el recorrido del usuario con cada sesión real, sin sustituir esta prueba por un mapa del menú.

## Estados y acciones por cada acceso

| Entrada | Acción/estado comprobado en código | Efecto y límite funcional |
|---|---|---|
| Pipeline, tarjeta | Prospecto → Contactado → Cotizado → Negociación → Ganada; pérdida y reversión con reglas | Ganada crea OP, pero no CxC; tabla comercial es de lectura. Cotizado no prueba que el usuario haya capturado una cotización |
| Órdenes, acción rápida Programar | Borrador → Programada | Cambia estado de OP; no asigna recurso/fecha/turno en agenda |
| Planeación, panel Programar | Crea programación por partida/recurso/fecha/turno | Es un hecho diferente del estado Programada de OP; ambos deben mostrarse de forma coherente |
| Órdenes, Pausar/Reanudar | En proceso ↔ Pausada | No recorre el cierre motivado de sesión ni resuelve por sí mismo la agenda del recurso |
| Producción, Pausar sesión | Guarda piezas/notas/motivo, cierra tiempo y deja programación bloqueada | Libera recurso; conserva fecha programada. Falta devolución documental y resumen de relevo |
| Producción, Finalizar sesión | Acumula piezas solo si es última secuencia | En procesos previos rechaza piezas positivas; no cubre metas por pareja parte/proceso |
| Órdenes, Completar | Requiere cantidades de partidas alcanzadas | Completada es terminal; falta reactivación administrativa de base |
| Producción, Generar nota | Registra entrega por cantidades producidas disponibles | Fabricación y entrega son distintas; no produce documento imprimible completo |
| Kanban, filtros | Lista y Entregada derivadas de cantidades y notas | Entregadas siguen incluidas por defecto; falta retiro automático a un historial operativo separado |
| Cobranza, Registrar cobro/Aplicar saldo | Actualiza CxC y monedero por servicios | No hay selector de cuenta bancaria ni historial navegable de pagos; recibo vive en estado local |
| Gastos, Marcar pagado/Cancelar | Cambio de estado con estado esperado | No sustituye edición de datos ni identifica cuenta de salida |
| Historial cliente y documentos | Sin acción operativa conectada | No fue posible verificar desde historial, repetir, reimprimir o navegar al pedido; se registra ausencia de entrada |

Fuentes precisas: `src/modulos/ordenes/componentes/tabla-ordenes.tsx:94`, `src/modulos/ordenes/servicios/reglas-transicion.ts:12`, `supabase/migrations/20260911000002_auditoria_ordenes_planeacion_produccion.sql:674`, `src/modulos/produccion/componentes/formulario-nota-entrega.tsx:26`, `src/modulos/cobranza/componentes/recibo-pago-vista.tsx:14`.

## Cadena comercial → taller → entrega → cobro y variantes

Recorrido estático completo, **sin afirmar ejecución E2E**:

1. El vendedor puede abrir Nueva oportunidad y capturar empresa/contacto; no puede llegar al formulario multilínea desde esa pantalla.
2. Ganar desde Negociación llama la RPC que crea la OP y sus partidas. La prueba local confirma la llamada y devolución de la cadena, pero no ejecuta esa transacción.
3. Planeación permite seleccionar partida, recurso y turno; capacidad y secuencia se resuelven en SQL. No se acredita planificación simultánea de operador y recurso.
4. Producción usa preparación/sesión; el panel PIN separado opera las partidas asignadas. No se ve todo el pedido ni sus planos en ambos accesos.
5. La última secuencia acumula fabricación. Nota de entrega registra cantidades despachadas, pero no ofrece conformidad imprimible/reabrible.
6. Apertura de CxC requiere OP completada y solo tiene acción de servidor sin interfaz. No puede recorrerse la cadena ordinaria completa desde la UI actual. Con CxC ya preparada como fixture se podría ensayar pago y monedero, pero eso no demostraría origen comercial ni apertura automática.

| Variante obligatoria | Escenario de referencia | Evidencia faltante y brecha previa |
|---|---|---|
| Orden interna | TI con fabricación/entrega, cero venta comercial y sin AR | No hay marcador TI ni exclusión financiera; E2E-09 pendiente |
| Multicentro | Una solicitud con corte y carpintería, sin duplicar pedido/venta | Falta distribución/consulta por procesos y asignación diferenciada; E2E-07/17/35 pendientes |
| Parcial | Meta 10: fabricar 4+6; entregar 4 y luego 6 independientemente | Cantidad por última secuencia, sin metas por proceso ni documento descargable; E2E-19/23/37 pendientes |
| Pausa/relevo | Pausar con motivo y notas; continuar con contexto sin perder tiempo/avance | Dos mecanismos de pausa y falta historial de relevo visible; E2E-18/21 pendientes |
| Anticipo | Cobrar antes de completar, mantener saldo y luego liquidar | No hay CxC temprana ni apertura por UI; E2E-24 pendiente |
| Consumo final | Stock 100; real 12, previo 5 → descuento final 7, saldo 88 | Consumo separado no se reconcilia al cierre; E2E-38 pendiente |
| Divisas | USD 100 a 17.50 → MXN 1750; MXN requiere TC 1 | Motor de conversión presente, selector de cobro no fuerza TC 1 ni muestra conversión; E2E-39 pendiente |
| Monedero | Pago 1200/deuda1000 → 200; aplicación150 → 50 sin nuevo flujo bancario | Modelado y pruebas simuladas; falta historial de aplicaciones y E2E-40 |

Los **41 casos** y sus requisitos están inventariados en `registro-e2e.csv`; los pasos/datos completos están preservados en `fuentes/03_Prompt_flujos_E2E.md`. Ningún caso se declaró omitido por el ejecutor como si hubiera sido intentado: todos figuran **no ejecutados**.

## Indicadores, importes y reglas que requieren conciliación

| Indicador/cálculo | Fuente objetivo | Diferencia funcional que debe medirse |
|---|---|---|
| Ventas del período | Total CxC por fecha de emisión | Venta aprobada sin fabricación terminada no aparece; no es venta desde aprobación ni cobro recibido |
| Activas/atrasadas | OP creadas dentro del período; atraso contra ahora | Una OP antigua pendiente puede desaparecer al seleccionar Hoy |
| Margen global | Ingresos, consumo material, horas históricas y gastos del período | No es solo ventas menos gastos de la base; universo temporal y gasto atribuible necesitan acuerdo |
| CxC pendiente/vencida | Saldo pendiente de cuentas vigentes | Correcto concepto de saldo; comparativo ejecutivo no reconstruye cartera anterior |
| Aging filtrado | Tarjeta usa cartera completa; tabla usa filtrado local | Elegir un cliente no reduce las barras al mismo conjunto |
| Distribución de gastos | Todas las filas cargadas, no `filtrados` | Tabla y gráfico pueden representar conjuntos distintos |
| Tier | CxC creada en tres meses; manual vigente siempre manda | Base usa órdenes entregadas y descuento más beneficioso; no son reglas equivalentes |
| Horas netas | Solapamiento real 12:00–13:00 America/Tijuana | Cinco casos locales aprobados; acumulado visible y SQL real siguen pendientes |
| Rentabilidad OP | Venta neta, material/scrap con CPP, horas con tarifa histórica y gastos vinculados | Evitar contabilizar dos veces el mismo material/mano de obra; falta desglose por estación |
| Movimiento bancario | Pagos y gastos agregados globalmente | No hay saldo inicial ni flujo completo por cuenta; no denominarlo saldo bancario |

IVA y tipos de cambio se evalúan como reglas del proyecto. No se ha emitido opinión fiscal ni se ha asumido que una configuración global propague valores a todas las operaciones históricas.

## Decisiones de negocio D-01..D-16

Las propuestas siguientes no son aprobaciones. No se implementó ninguna.

| ID | Regla explícita y situación objetivo | Decisión/propuesta y prueba de aceptación |
|---|---|---|
| D-01 | OBS-15 fija origen comercial ordinario. Alta manual sigue visible; soporte histórico no resuelto | Mantener pendiente una excepción administrativa aislada con ID previo y reconciliación de saldo. ORD-04 sustituido; ORD-06/PRD-10/AR-09/CFG-12 pendientes, no borrados del inventario |
| D-02 | OBS-19 bloquea sobrecarga; objetivo controla recurso/fecha/turno | Acordar ocho horas por operador/recurso y horarios reales. Propuesta: comprobar ambos si están asignados; 5+3 acepta, +1 rechaza y siguiente hueco exige confirmación |
| D-03 | OP Programada y programación en agenda son hechos separados | Hacer visible condición de agenda real; no equiparar aprobación, borrador o cambio de estado con reserva de capacidad |
| D-04 | OBS-22 exige visibilidad desde aprobación; hoy CxC solo tras completar | Borrador visible cumple visibilidad sin deuda exigible. Negocio fija evento y plazo de exigibilidad; probar anticipo conservado en activación |
| D-05 | Entrega parcial tiene entidad propia; avance por proceso no | Preservar cantidades fabricadas/entregadas independientes y documentos parciales. Acordar alcance de entregas sin confundir 4 fabricadas con 4 entregadas |
| D-06 | Cancelación conserva OP, Entregada permanece en Kanban | Propuesta: Lista en pendientes de entrega; Entregada fuera del activo, recuperable con su historia. No autoriza borrado de negocio |
| D-07 | TC MXN por USD; captura y conversión no equivalen | Propuesta: selector define moneda; MXN fuerza1. Conversión explícita multiplica/divide y conserva monto/TC históricos. Caso USD100×17.50=1750 |
| D-08 | Referencia sigue visible, cuenta de pago opcional sin UI y gasto sin cuenta | Ocultar referencia ordinaria conservando historia; mantener cuenta/banco/método/folio. Probar +1000−300 en A y B sin cambio |
| D-09 | Monedero por sobrepago y aplicación ya existen | Preservar origen y aplicación identificados; no inventar devolución/caducidad. Mostrar crédito comercial y saldo a favor por separado |
| D-10 | Inventario y consumo explícito previos ya implementados | Acordar unidad/material/merma y evento final. Consumir solo diferencia: previo5, real12 → final7, sin segundo descuento por confirmación repetida |
| D-11 | Existen costos reales y tarifas históricas; cotizador no tiene motor | Acordar venta neta, indirectos e impuestos; evitar duplicar consumos con gastos. Caso 10000−3000−2000−1000=4000, margen40 %. Recargo técnico es otro cálculo |
| D-12 | No se adjunta nueva lista de campos | Usar COT/CFG del catálogo; no sustituir por cinco parámetros generales ni asumir que la fórmula usa toda configuración |
| D-13 | Áreas dinámicas, áreas fijas de planeación y procesos libres conviven | Validar mapa propuesto abajo; conservar nombres y distinguir proceso/estación/proveedor sin inventar compras externas |
| D-14 | Cliente tiene ficha interna, no portal | Conectar documentos/notas internos por entidad y permiso. Imprimir/descargar no autoriza envío a clientes ni publicación de planos |
| D-15 | Panel usa etiquetas, pero falta contexto del pedido | Propuesta: explicar acción y mostrar resumen/calendario sin recaptura; retirar formulario solo si se conserva programación contextual equivalente |
| D-16 | IVA en contratos y configuración no garantiza propagación | Acordar tasa por operación y snapshots históricos; probar 0/8/16 donde aplique, nuevas capturas y documentos ya aceptados |

### Mapa de taller propuesto para D-13

| Área solicitada | Subáreas/procesos a conservar | Relación candidata en objetivo |
|---|---|---|
| Metal mecánica | Corte láser, Press Brake, Soldadura, Ensamblado, Pintura | `sheet_metal` como familia candidata; cada actividad necesita proceso explícito y recurso asignable cuando aplique |
| Fabricación digital | CNC Router, Láser CO2, Grabado, Impresiones, Escaneo, Carpintería | `taller` como familia candidata; nombres de equipos no sustituyen proceso ni responsable |
| Acabados | Preparado | `acabados`; resolver si pintura pertenece aquí o mantiene referencia Metal mecánica sin duplicar actividad |
| Externo | Actividad/proceso contratado e identificación de proveedor | `ext`/área externa; no implica orden de compra ni envío automático a terceros |

Este mapa es una propuesta explícita de reconciliación, pendiente del Product Owner; no es configuración aplicada. Cada estación física debe conservar su identidad y capacidad propia, y un proceso puede usar más de una estación.

## Backlog priorizado por impacto en procesos

El CSV contiene una entrada por cada requisito no sustituido, con actor, dependencias, siguiente prueba y criterio completo. Estas son las prioridades agrupadas:

| Prioridad | Resultado de negocio requerido | IDs principales | Criterio y dependencia |
|---|---|---|---|
| Alta | Capturar y recuperar cotización desde oportunidad con calculadora técnica | RFQ-01..06, COT-01..11, OBS-02/04/07/30 | Dos líneas, material/espesor/procesos/costos, persistidas y recuperadas; tarifas por estación y descuento acordado |
| Alta | Conservar una cadena comercial única, sin alta productiva ordinaria paralela | RFQ-09/15/16, OBS-15, ORD-04/06 | Aprobación única genera pedido/partidas, controla crédito y diferencia TI; D-01/D-04 |
| Alta | Hacer visible la deuda en su etapa correcta y admitir anticipos | AR-01..06, OBS-22 | Borrador desde aprobación y plazo exigible definido; apertura desde UI y anticipo conciliado; D-04 |
| Alta | Distribuir y registrar avance por proceso y responsable | PRD-02/09/11/16, OBS-05/09/10/20 | Un pedido multicentro con metas por actividad, 4+6 sin cierre prematuro; D-02/D-05/D-13 |
| Alta | Recuperar historial, planos y documentos operativos | CLI-07/08, ORD-03/08/09, DOC-01..04, OBS-06/11/13 | Cliente→cotización→OP→sesión→documentos; reimpresión y archivos utilizables; D-14 |
| Alta | Conciliar entrada/salida por cuenta identificada | AR-15, OBS-24/28 | A +1000−300=+700; B intacta; conservar cuentas históricas; D-08 |
| Alta | Consumir material real al cerrar sin duplicación | OBS-12 | Stock100→88 con previo5 y ajuste7; segundo cierre no descuenta; D-10 |
| Alta | Explicar utilidad con costos atribuibles sin duplicar | OBS-29, DAS-02, ORD-11 | Caso margen40 %; desglose por estación y tarifas históricas; D-11 |
| Media | Conciliar filtros, KPI y períodos con el mismo universo | DAS-01..06, AR-10/12/13, GAS-06/07, TRA-01, OBS-01 | Datos de prueba dentro/fuera del período; tabla, gráfico y navegación de aging coinciden |
| Media | Conservar tiers y catálogos editables de la base | CLI-04..06, CFG-04..10 | Máximo beneficio vigente, consumo elegible, CRUD y propagación verificable; no eliminar capacidades históricas |
| Media | Alinear agenda, pausa, reactivación y archivo operativo | PLA-01..07, PRD-05/06/15, OBS-16/18/19/21 | Estado y agenda visibles; sobrecarga rechazada y siguiente hueco confirmado; D-02/D-03/D-06 |
| Media | Recuperar pagos, correcciones y estados de cuenta | AR-07..09/14/16, OBS-25..27 | Movimientos/reimpresión tras recarga, consolidado de cinco órdenes y aplicación trazada; D-01/D-09/D-14 |
| Media | Operar gasto completo con comprobante recuperable | GAS-01..05/08/09 | Proveedor, clasificación, edición, vencimiento y adjunto; OCR es ayuda revisable, no aceptación del servicio |

## Capacidades adicionales de la mejora que deben preservarse

| Capacidad | Evidencia de implementación | Condición de conservación |
|---|---|---|
| Inventario, compras/movimientos, CPP y scrap | `src/modulos/inventario/`, consumo por partida y kardex | No introducir segundo descuento al agregar cierre automático |
| Roles vendedor/gerente/contador y permisos específicos | Migraciones de permisos y proyecciones de Dashboard | Mantener política propia; no volver a dos roles ni al PIN antiguo |
| Planeación por recurso/turno, excepciones, secuencia y capacidad | `src/modulos/planeacion/` y RPC de programación | No reemplazar por ocho horas globales ni perder reservas existentes |
| Sesiones con identidad, tiempos de servidor y auditoría durable | Acciones de Producción y sesiones SQL | Preservar autoría y tiempos al añadir relevo/archivos/historial |
| Entregas parciales independientes | `notas_entrega`/`partidas_nota_entrega` y formulario de despacho | No fusionar piezas producidas con entregadas |
| Monedero y pagos con identificación de solicitud | Servicios/RPC de Cobranza | Preservar saldo y trazabilidad; aplicar monedero no crea ingreso bancario nuevo |
| Tarifas históricas y costos reales por OP | Sesiones/consumos y motor rentabilidad | Nuevas tarifas no reescriben contratos ni costo histórico |
| Direcciones fiscales/envío y documentos de cliente | Formulario/ficha de cliente | Mantener estructura adicional al conectar historial |
| Comentarios, menciones y notificaciones por entidad | `src/modulos/comentarios/` | Conservar contexto/roles; cualquier envío real requiere autorización propia |
| Actualización entre sesiones y control de edición concurrente | Sincronizadores y estado esperado en acciones | Verificar con dos sesiones reales al aceptar; tests simulados no prueban propagación |
| OCR asistido de imágenes | `src/modulos/gastos/servicios/ocr-servicio.ts` | Mantener revisión manual y documentar dependencia; no inferir precisión ni soporte PDF |

## Revisión y cierre documental

Claude Code ejecutó una delegación de solo lectura sobre 40 IDs de Dashboard/Cobranza/Gastos y observaciones asociadas. El CLI resolvió `opus` como `claude-opus-5`; terminó sin denegaciones, sin herramientas mutantes y sin subagentes. Codex comprobó referencias y corrigió el borrador de evaluación: folio AR sin enlace, apertura AR sin UI, gráfico/aging fuera del subconjunto filtrado, recibo imprimible pero no recuperable y monedero ya visible en ficha/modal. No se adoptaron como hechos ejecutados las conjeturas del revisor ni se suprimió soporte histórico como «no aplica».

La evidencia interna de delegación se conserva en `.ai-shared/coordination/`; no se incluye configuración ni material de agentes en el commit del producto. La documentación entregada no contiene credenciales ni datos de clientes reales.

Próximo paso necesario para aceptación: entorno de pruebas aislado confirmado, fixtures del Prompt 3 y decisiones de variantes. Ejecutar los casos alcanzables, documentar los bloqueados por brechas y conservar evidencia de rol, dato, pantalla, persistencia y segunda sesión. Corregir el producto requiere un encargo posterior: esta auditoría explícitamente prohíbe implementación.
