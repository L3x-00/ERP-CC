# Grupo de fabricación ERP SII / CC

## Documento de traspaso técnico-funcional

#### Arquitectura funcional, reglas de negocio, módulos, flujos y hoja de ruta

##### Versión de trabajo: Octubre 2026

###### Preparado para transferencia a desarrollador / equipo técnico

## 1\. Propósito y alcance del documento

##### Este documento concentra la estructura funcional acordada para el ERP interno de SII / CC

##### Grupo de fabricación. Su propósito es permitir que un desarrollador tenga la negociación, el fluido

##### entre módulos, las reglas críticas de integración y la hoja de ruta sin depender del histórico completo de

##### conversaciones.

###### Principio rector

###### Capturar la información una sola vez donde se cuenta; los módulos posteriores heredan, enriquecen y trazan

###### la información, pero no obliga a recapturarla.

### 1.1 Cómo usar este documento

##### Para entender el negocio: leer secciones 2 a 5.

##### Para construir o mantener módulos: consultar las especificaciones de las secciones 8 a 15.

##### Para no romper integrada: revisar la sección 6 antes de modificar folios, archivos, estados o revisiones.

##### Para priorizar inversión: usar la sección 16 (Go Live progresivo y backlog).

##### Los módulos marcados como “futuro” son enfermedad previo, no requisito del primer Go Live.

## 2\. Resumen ejecutivo

##### El ERP controla el flujo desde la solicitud del cliente hasta la producción, entre y administración. No

##### pretender sostener la estabilidad fiscal ni CFDI; su objetivo es el control operativo y administrativo

##### interno.

##### El negocio trabajo con fabricación de bajo y mediano volumen, órdenes que pueden durante desde

##### minutos hasta varias horas, múltiples procesos y clientes industriales. La solución debe ser simple

##### para una microempresa, pero mantener trazabilidad de nivel industrial.

Figura 1. Flujo maestro del ERP.  

## 3\. Principios de enfermedad

Principio Aplicación  
Captura única La información se captura donde nace y se reutiliza aguas  
abajo.  
Identidad estable Cada registro usa un ID interno inmutable y un folio  
humano. Los folios usados nunca se reutilizan.  
Historia antes que borrado Registros relevantes se cancelan, cierran o desactivan; no se  
eliminan silenciosamente.  
Acciones de negocio Los estados cambian mediante acciones específicas; evitar  
dropdowns genéricos de estado.  
Snapshot por etapa Una propuesta o revisión enviada debe poder reconstruirse  
sin depender de datos mutables del RFQ.  
Auditoría Cambios relevantes registran usuario, fecha, entidad, acción  
y contexto.  
Control sin micromanagement El sistema guía al usuario y genera indicadores a partir del  
trabajo normal.  
Fallo seguro El sistema puede reportar error; nunca debe fingir éxito  

perdiendo, duplicando o sobreescribiendo información.  

## 4\. Arquitectura funcional

Figura 2. Relación funcional entre áreas y módulos. 
================================================================================
                    DIAGRAMA DE ARQUITECTURA Y FLUJO DEL SISTEMA
================================================================================

[ COMERCIAL ]
├── Clientes
│   └──> RFQ
├── RFQ
│   └──> Propuestas
└── Propuestas
    └──> Órdenes ───(Conecta con OPERACIÓN)───> [ OPERACIÓN ]


[ SISTEMA ] (Control, Configuración y Auditoría Transversal)
├── 1. Usuarios / Roles
│   ├── - - - - - - - - - -> RFQ
│   ├── - - - - - - - - - -> Propuestas
│   └── - - - - - - - - - -> Producción (OPERACIÓN)
│
├── 2. Configuración / Catálogos
│   ├── - - - - - - - - - -> RFQ
│   ├── - - - - - - - - - -> Propuestas
│   ├── - - - - - - - - - -> Órdenes
│   ├── - - - - - - - - - -> Producción
│   └── - - - - - - - - - -> Facturación (FINANZAS)
│
└── 3. Actividad / Auditoría
    ├── · · · · · · · · · -> RFQ
    ├── · · · · · · · · · -> Propuestas
    ├── · · · · · · · · · -> Producción
    └── · · · · · · · · · -> Tesorería (FINANZAS)


[ OPERACIÓN ]
├── Órdenes (recibidas de Comercial)
│   └──> Planeación
├── Planeación
│   └──> Producción
├── Producción
│   └──> Calidad
└── Calidad
    └──> Entregas ───(Conecta con LOGÍSTICA)───> [ LOGÍSTICA ]


[ LOGÍSTICA ]
└── Entregas
    └──> Facturación ───(Conecta con FINANZAS)───> [ FINANZAS ]


[ FINANZAS ]
├── Facturación
│   └──> CxC (Cuentas por Cobrar)
├── CxC
│   └──> Tesorería
└── Compras / Gastos / CxP
    └──> Tesorería
================================================================================ 

### 4.1 Áreas

Área Módulos principales Responsabilidad  
Comercial Clientes, RFQ, Propuestas,  
Seguimientos  

Captura de necesidad, cotización y  
seguimiento comercial.  
Operación Órdenes, Planeación, Producción,  
Calidad  

Convertir venta en trabajo ejecutable y  
registrar avance.  
Logística Entregas Control de parciales, evidencias y  
receptor.  
Finanzas Facturación, CxC, Compras/Gastos/CxP,  
Tesorería  

Control administrativo y financiero;  
fase posterior.  
Sistema Usuarios, Configuración, Actividad Seguridad, catálogos y trazabilidad.  

## 5\. Roles y permisos

Rol Responsabilidad principal Notas  
Operator Ejecutar producción No ve precios; credencial individual;  
trazabilidad por operador.  
Customer Service Clientes, RFQ, Propuestas y  
seguimiento  

Interpreta requerimientos y estructura  
información no técnica.  
Administrative Facturación, CxC, pagos y cierres  
administrativos  

Puede consultar comercial; permisos  
separados para crédito.  
Management Supervisión, aprobaciones y acceso  
amplio  

Puede gestionar catálogos según  
permisos.  
Admin Sistema, permisos y configuración No debe eliminar su propio acceso  
crítico accidentalmente.  

##### Los permisos deben ser por accidente y aplicar del lado servidor. Ejemplos: PROPUESTA\_VISTA,

##### PROPUESTA\_EDITAR\_ARTÍCULO, PROPUESTA\_EDITAR\_PRECIO, PROPUESTA\_ENVIAR, PROPUESTA\_CREAR\_REVISIÓN.

## 6\. Integridad y reglas técnicas no negociables

##### IDs internos opacos e inmutables, separados de folios visibles.

##### Folio atómico por tipo de documento; nunca “último folio + 1” calculado en cliente.

##### Folio usado nunca se reutiliza, incluido si el registro se cancela.

##### Operaciones críticas multiregistro deben ser transaccionales/atómicas.

##### Idempotencia para crear propuesta, generar PDF, marcar enviada, crear revisión y acciones

###### equivalentes.

##### Comprobaciones optimistas de concurrencia/versión para evitar ediciones sobre datos obsoletos.

##### Archivos privados; acceso mediano conecta temporales autorizados.

##### Auditoria anexa-solamente para eventos relevantes.

##### La interfaz nunca escribe directamente datos sensibles sin validación del backend.

### 6.1 Nomenclatura principal

Entidad Formato  
RFQ RFQ-MMYY\_XX  
Propuesta CNC-MMYY\_XX-A / B / C  
Orden O-MMYY\_XX  
Orden interna OI-MMYY\_XX  
Entrega NE-O-MMYY\_XX-YY / NE-OI-MMYY\_XX-YY  

Recibo de pago RP-O-MMYY\_XX-YY / RP-OI-MMYY\_XX-YY  
Compra/Gasto CG-MMYY\_####  
Cliente CLI-  
Ítem IT01, IT02, IT03...  
Corrida LAS01, DOB01, ROU01...  

###### Regla de artículos

###### IT01/IT02 se mantienen estables RFQ Propuesta Orden. Si IT02 se cancela, no se reutiliza; el siguiente ítem→→

###### será IT04.

## 7\. Arquitectura de datos simplificada


Figura 3. Entidades y relaciones principales. 
================================================================================
            7. ARQUITECTURA DE DATOS SIMPLIFICADA (RELACIONES)
================================================================================

Customer (Cliente)
├── 1 : N ──> Customer Contact (Contacto de Cliente)
└── 1 : N ──> RFQ (Solicitud de Cotización)
              ├── 1 : N ──> RFQ Item (Ítem de RFQ)
              └── 1 : N ──> Proposal (Propuesta / Cotización)
                            └── 1 : N ──> Proposal Revision (Revisión de Propuesta)
                                          ├── 1 : N ──> Proposal Item (Ítem de Propuesta)
                                          │             └── 1 : N ──> Route Operation (Ruta Operativa / Proceso)
                                          │
                                          ├── 1 : N ──> Proposal PDF (PDF de Propuesta)
                                          │
                                          └── accepted rev (1 : N) ──> Order (Orden de Trabajo)
                                                                       ├── 1 : N ──> Delivery (Entrega)
                                                                       └── 1 : N ──> Order Item (Ítem de Orden)
                                                                                     └── 1 : N ──> Production Operation (Operación de Producción)
================================================================================ 

##### La relación exacta de tablas puede variar después de la plataforma, pero la semántica debe conservarse: la

##### orden nace de una revisión aceptada específica; los PDF pertenecen a revisiones; los artículos y

##### operaciones mantienen identidad y trazabilidad.

## 8\. Módulo Clientes

##### Cliente es una entidad independiente con contactos múltiples y condiciones comerciales. El código

##### CLI-#### es global, secuencial, atómico y nunca se reutiliza.

### 8.1 Pantallas

##### Lista / Work Queue de clientes.

##### Ficha del cliente con plagas: Resumen, Contactos, Comercial, Documentos, Historial.

##### Formulario maestro Crear/Editar reutilizable.

### 8.2 Clave de datos

Grupo Campos principales  
General Nombre comercial\*, razón social, RFC opcional, código  
automático.  
Contacto principal Nombre\*, puesto, teléfono, email.  
Comercial Moneda MXN/USD\*, crédito sí/no, días de crédito, límite de  
crédito.  
Estado Activo/Inactivo mediante acción controlada.  

### 8.3 Reglas

##### Cliente + contacto principal se crea de forma atómica.

##### Solo un contacto principal activo.

##### No eliminar clientes históricos.

##### Documentos privados y versionados lógicamente; sin borrado silencioso.

## 9\. Módulo RFQ

##### RFQ representa qué solicitud el cliente. No incluye todavía el costo interno ni la decisión de modo

##### fabricar.

### 9.1 Estados

Estado Uso  
NEW Solicitud recién capturada.  
INCOMPLETE Faltan datos técnicos/comerciales.  
WAITING\_CUSTOMER Esperando información del cliente.  
WAITING\_TECHNICAL Esperando aclaración interna/técnica.  
READY\_FOR\_PROPOSAL Cumple requisitos para generar propuesta.  
CONVERTED Ya generó propuesta.  
CLOSED Cerrado sin continuar.  
CANCELLED Cancelado, conservando historial.  

### 9.2 Campos míos

##### __Cliente, contacto, canal, fecha de solicitud, fecha requerida opcional, responsable__ y descripción

###### general.

##### Próxima acción__, fecha de próxima acción__ y responsable de próxima acción\* para RFQ activo.

##### Al menos un tema con descripción y cantidad > 0 para guardar.

##### Para LISTO: material, espesor cuando aplique, al menos una operación solicitada y archivos técnicos

###### requeridos.

### 9.3 Ítems y archivos

##### Ítems establece IT01, IT02...

##### Material y espesor desde gatos; espesor depende del material.

##### Operaciones solicitadas desde catálogo de procesos.

##### Archivos generales separados de archivos por tema.

##### Tipos: CAD, Dibujo, Imagen, Especificaciones, Otros.

##### Archivos privados, con validación de tipo y vídeo explícito al tema.

## 10\. Módulo Propuestas

##### Propuesta convenientete el RFQ en una oferta comercial: define codo se plana fabricar, tiempos

##### estimados, costo total estimado de fabricación, precio de venta, marca y documento ambiental al

##### cliente.

Figura 4. Ciclo de una propuesta y sus revisiones.  

### 10.1 Estados

Estado Descripción  
DRAFT Editable; se prepara la revisión.  
PENDING\_APPROVAL Reservado para aprobación interna futura.  
READY\_TO\_SEND Validación completa; puede generarse PDF.  
SENT Revisión enviada y congelada.  
FOLLOW\_UP Seguimiento comercial.  
ACCEPTED Revisión exacta aceptada por cliente.  
PENDING\_FINANCIAL Condición financiera pendiente; fase posterior.  
SALE\_CONFIRMED Venta confirmada; habilita Orden.  
REJECTED / CLOSED Terminales.  

### 10.2 Revisiones

##### Rev A se crea desde RFQ LISTO\_PARA\_PROPUESTA.

##### Mientras la revisión está BORRADOR, se edita la misma revisión; no crear B para correcciones internas.

##### Una revisión ENVIADA/congelada es inmutable en contenido comercial/técnico sustantivo.

##### Si el cliente pide cambios, “Crear nueva revisión” géneros B, C, D... con motivo obligatorio.

##### Cada nueva revisión copia el snapshot anterior, mantiene ITxx y queda DRAFT.

##### La revisión aceptada puede ser anterior a la última; conservar aceptadoRevisionId explícito.

### 10.3 Ítems, ruteo y costeo

Concepto Regla  
Ítems En DRAFT pueden editarse descripción, cantidad, material,  
espesor, operaciones solicitadas, acabado, notas y precio  
unitario.  
Operaciones solicitadas Alcance comercial / del cliente; no es lo mismo que ruteo.  
Ruteo estimado Por ítem: proceso, secuencia, grupo de equipo, grupo  
planeado, setup h, run h, total h automático.  
Costo total estimado de fabricación Valor interno manual por ahora; puede incluir material,  
máquina, mano de obra, gastos directos y subcontratación.  
Venta Precio unitario × cantidad = importe por línea; subtotal  
suma líneas activas.  
IVA / Total Automáticos.  
Margen (Venta - Costo) / Venta; independiente de un mínimo de  
margen aún no definido.  

### 10.4 Próxima acción

##### Próxima acción usa un catálogo configurable y se alcalena como selección controlada con instantánea

##### histórico. Opinión “Otro” habilita texto obligatorio. Se usa al crear propuesta, actualizar próxima

##### accidente, registrador seguimiento, enviar y crear nueva revisión.

Código inicial Nombre  
FOLLOW\_UP Dar seguimiento  
CONFIRM\_RECEIPT Confirmar recepción  
WAIT\_CUSTOMER\_RESPONSE Esperar respuesta del cliente  
REQUEST\_APPROVAL\_PO Solicitar aprobación / PO  
RESOLVE\_CUSTOMER\_QUESTIONS Resolver dudas del cliente  
PREPARE\_NEW\_REVISION Preparar nueva revisión  
OTHER Otro  

### 10.5 PDF y entorno

##### PDF se genera exclusivamente para revisión READY\_TO\_SEND.

##### PDF incluye datos comerciales; excepto costo interno, margen, horas, ruteo y notas internas.

##### PDF privado, ligado a revisión exacta; no se infiere por nombre de archivo.

##### Marcar como enviada requiere PDF vigente, canal, destino y proximidad accidente.

##### Enviar cambio a ENVIADO y congela la revisión de forma atómica.

##### Despuestas de SENT se permiten seguimiento y proximidad accidente, pero no cambios sustantivos.

### 10.6 Archivos

##### La pestaña Archivos deben matar: archivos heredados/referenciados del RFQ, archivos propios de la

##### propuesta, archivos por tema y PDF por revisión. Evitar duplicar estrictamente archivos del RFQ;

##### origen más, revisión y tema.

### 10.7 Mejor guía pendiente

###### Diseño aplicado, pendiente de implementar

###### Cuando un cambio en Rev B puede invalidar ruteo/costeo heredado, el sistema conserva los datos pero

###### marcará “Requiere revisión”. Cantidad/material/espesor/operaciones solicitadas dispar revisión de ruteo y

###### costeo; Validar propuesta bloqueará READY\_TO\_SEND hasta confirmar. No convertir la UI en un asistente rigido.

## 11\. Módulo Orden de trabajo - Go Live 2

##### La Orden debe nacer de la revisión exacta aceptada y conservar una instantánea suficiente para fabricar

##### sin depender de cambios futuros en RFQ o Propuesta.

### 11.1 Contenido mío

##### Folio O-MMYY\_XX.

##### Cliente y contacto.

##### aceptadoRevisionId / origen comercial.

##### Ítems ITxx cantidad, material, espesor, operaciones, archivos vivos y observaciones.

##### Fecha requerida/semana de entrega y responsable.

##### Ruta/operaciones necesarias para la producción.

### 11.2 Estados míos

##### Para MVP: Confirmado Planificado Listo En Producción Producción Completada Cerrada. Estados →→→→→

##### de riesgo/bloqueo pueden agregarse gradualmente.

### 11.3 Reglas

##### La Orden no se “inicio” manualmente; se libera una producción y su estado general deriva del avance de

###### operaciones.

##### Cambios despues de aceptación requiieren trazabilidad; no sobreescribir archivos/revisiones vigentes.

##### Producción y cierre administrativo son cierres separados.

## 12\. Producción básica - Go Live 3

Figura 5. Flujo mínimo de ejecución en producción.  

### 12.1 Unidad de ejecución

##### La unidad de ejecución son Operaciones/Corridas ligadas a la Orden. Una corrida puede agrapar

##### Ítems compatibles dentro de la misma Orden. Por ahora no agrapar órdenes distintas.

### 12.2 Reglas críticas

##### Un operador por equipo; individuo creíble.

##### Bloque por mañana/equipo: no iniciar dos operaciones simultáneas en el mismo recurso.

##### Inicio registra hora y libera archivos vivos al operador.

##### Pausa requerida causa: duda, material, falla, comida, fin de jornada u otra configurada.

##### Material/aclaración > 1 h puede liberar mañana.

##### Al terminar se registra cantidad producida.

##### Fin de jornada se cierra; no continúa automáticamente al día siguiente.

##### Horas extra requiere autorización (jornada estándar de 8 h por turno, ajustable por recurso; autoriza Management/Admin).

##### Eventos críticos música material, espesor, cantidad, revisión/archivo vigente, proceso/equipo y

###### observaciones antes de iniciar.

### 12.3 Calidad básica

##### Primera pieza debe liberarse cuando aplique.

##### Lotes 5+: referencias iniciales 1, 3 y 5; lotes grandes cada 10 o 20 según cliente/proceso.

##### Cierre puede capturar tolerancias, cantidades, fotos y material usado.

##### Perfiles de inspección por cliente quedan para una fase posterior más avanzada.

## 13\. Entregas - Go Live 4

##### Permitir entre partes parciales.

##### Generar nota de entrega NE-O-MMYY\_XX-YY / NE-OI-MMYY\_XX-YY (prefijo de la orden de origen).

##### Registrador cantidades por tema, quién entrega, quién recibe y fechá.

##### Evidencia fotográfica y firma digital cuando aplique.

##### Clientes industriales pueden solicitar hoy impresión con venta/fecha/firma y posterior digitalización.

## 14\. Finanzas - Fase posterior

##### El primer Go Live puede operar sin sustituir el proceso real de facturación/cobro. La arquitectura

##### debe permitir conectar Entrega Facturación CxC Cobranza más adelante.→→→

Módulo futuro Alcance previsto  
Facturación / CxC Borrador administrativo, saldo pendiente, términos por  
cliente, aging, promesa de pago.  
Cobranza Pagos, aplicaciones many-to-many, saldo a favor, recibos RP.  
Compras/Gastos/CxP Gastos operativos y comprometidos, vínculo a orden, CG-  
MMYY\_####.  
Tesorería 2 cuentas bancarias + efectivo; transferencias internas no  

son ingreso/gasto.  

## 15\. Configuración, catálogos, archivos y auditoría

### 15.1 Catálogos
[ GO LIVE 1 ]
└── Clientes + RFQ + Propuestas + Usuarios + Configuración + Auditoría
    └──> [ GO LIVE 2 ]

[ GO LIVE 2 ]
└── Aceptación + Orden de trabajo
    └──> [ GO LIVE 3 ]

[ GO LIVE 3 ]
└── Producción básica
    └──> [ GO LIVE 4 ]

[ GO LIVE 4 ]
└── Entrega básica
    └──> [ DESPUÉS ]

[ DESPUÉS ]
└── CxC + Compras + Tesorería + Calidad avanzada + Portal

Catálogo Ejemplos / uso  
Materiales Acero al carbón, Galvanizado, Inoxidable, Aluminio, Birch,  
MDF, Acrílico, Plástico ingeniería.  
Espesores Dependientes de material; mm normalizado + etiqueta.  
Procesos Láser fibra, Doblado CNC, Soldadura, CNC Router, Láser CO₂,  
Marcado láser, Maquinado/Fabricación, Acabado.  
Grupos de equipo Categorías de recursos: CNC Router, Láser Fibra, Press  
Brake, etc.  
Grupos planeados Corte, Doblado, Soldadura, Maquinado, Acabado, Ensamble.  
Próximas acciones Catálogo comercial controlado con opción Otro.  

##### Los catálogos deben ser configurables, activos/inactivos, versionados y auditados. Actividades en solitario se

##### seleccionan en registros nuevos; valores históricos inactivos permanentes visibles.

### 15.2 Archivos

##### Almacenamiento privado.

##### Metados separados del blob físico.

##### Nombre original + nombre ERP cuando aplique.

##### Vídeo explícito a entidad/revisión/ítem.

##### No reemplazar silenciosamente archivos históricos.

##### Cambios de archivo vigente deben quedar trazados.

### 15.3 Actividad / auditoría

##### La vista de Actividad debe permitir entender qué ocurrió sin mostrar IDs técnicos. Los eventos

##### relacionados de una misma acción pueden compartir correlationId.

## 16\. Estrategia de Go Live progresivo

##### Para controlar inversión, el ERP debe empezar a generar valor antes de completar todos los módulos.

##### La prioridad es uso real, aprendizaje operativo y desarrollo incremental.

Figura 6. Roadmap recomendado de adopción.  

### 16.1 Go Live 1 - Comercial

#####  Clientes

#####  RFQ

#####  Propuestas

#####  Usuarios / permisos

#####  Configuración

#####  Actividad / auditoría

##### Resultado: solicitud seguimiento cotización revisiones PDF envío. Puede empezar a usarse →→→→→

##### aun cuando Producción y Finanzas sigan fuera del ERP.

### 16.2 Go Live 2 - Aceptación + Orden

##### Agregar solo lo necesario para convertir una revisión aceptada en Orden de trabajo con snapshot

##### confiable.

### 16.3 Go Live 3 - Producción básica

##### Agregar ejecución por equipo, iniciar/pausar/continuar/terminar, piezas producidas, tiempo real y

##### bloqueo por máquina.

### 16.4 Go Live 4 - Entrega

##### Agregar nota de entrega, parciales, firma/evidencia y cantidades.

### 16.5 Postergar hasta justificar la inversión

##### ERP\_EXPORT / importación CSV.

##### Motor completo de costos por hora.

##### Compras/CxP avanzados.

##### Tesorería completa.

##### Cliente del portal.

##### Calidad avanzada y perfiles de inspección.

##### Capacidad instalada y planificación sofisticada.

##### Inventario, si se decide agregar.

##### Paneles de control completos.

## 17\. Estandar de UX / interacción

##### La interfaz debe ser densa, clara y escritorio-primero, con modo claro/oscuro. El estándar de interacción

##### definido es:

##### 1\. Cola de trabajo / Lista

##### 2\. Ficha / Detalle del registro

##### 3\. Formulario maestro Crear/Editar

##### 4\. Acción de negocio específico

##### 5\. CRUD de Configuración / Catálogos

##### Encabezado entidad/folio + chip de estado.

##### Pestañas contextuales.

##### Acciones de negocio cerca de la parte superior.

##### Tarjetas/resumen para contexto, no para ocultar datos críticos.

##### Formulario sirve para capturar/editar; ficha sirve para entender/operar.

##### Validaciones estructuradas deben indicar exactamente qué falta, por tema/sección.

##### La app debe “llevar de la mano” sin imponer un mago rigido.

## 18\. KPI y reportajes anteriores

##### El objetivo ejecutivo es distinguir tres conceptos diferentes: cuánto se vendió, cuánto se produjo y

##### cuánto se cobró. No deben mezclarse.

Área Indicadores previstos  
Ventas Ventas semana/mes, tasa de cierre, propuestas en  
seguimiento.  
Producción Horas reales vs estimadas, WIP, utilización por máquina,  
piezas producidas.  
Calidad Retrabajos, scrap, no conformidades.  
Rentabilidad Rentabilidad por orden / margen operativo.  
Cobranza Cobros, saldo vencido, aging, promesas.  

###### Pendiente

###### Antes de dashboards avanzados se deben cerrar un diccionario formal de KPIs y fórmulas para evitar doble

###### conteo entre vendido, producido y cobrado.

## 19\. Plataforma / arquitectura actual de implementación

##### La implementación actual en Hercules utiliza Vite + React + TypeScript, backend transaccional de

##### Hércules/Convexo, Hércules Autor y mantenimiento privado de archivos. Las reglas de negocio se

##### aplica en funciones de servicio; la base documental no depende de CHECK/FK/RLS tradicionales.

##### IDs internos generados por sistema.

##### Campos camelCase.

##### Permisos servicio por accidente.

##### Transacciones para acciones críticas.

##### Comprobación de versiones + idempotencia.

##### Archivos privados con acceso temporal.

##### Esta sección describe la plataforma actual, no una obligación de permanencia tecnológica. Si el

##### proyecto se migra a otra infraestructura, deben conservar las garantías funcionales y de integración.

## 20\. Criterios de transferencia a otro desarrollador

##### El desarrollador debe poder explicar el flujo RFQ Propuesta Orden sin consultar conversaciones →→

###### previas.

##### Debe entender la diferencia entre operación solicitada y ruteo estimado.

##### Debe entender que SENT congela una revisión y que cambios requieren una nueva revisión.

##### Debe preservar IDs internos, folios únicos, auditoría, idempotencia y archivos privados.

##### Debe distinguir “vendido”, “producido” y “cobrado”.

##### Debe respirar el Go Live progresivo y evitar construir módulos futuros antes de justificar su valor.

## 21\. Pendientes consolidados / backlog funcional

Prioridad Área Pendiente  
Alta Go Live 1 Terminar estabilización manual de  
Propuestas y uso real.  
Alta Go Live 2 Aceptación de revisión exacta + Orden  

de trabajo.  
Alta Go Live 3 Producción básica por equipo y  
operador.  
Alta Go Live 4 Entrega básica y parciales.  
Media Propuestas Pestaña Archivos completa con RFQ +  
propuesta + ítem + PDFs.  
Media Propuestas Dependencias “Requiere revisión” para  
ruteo/costeo tras cambios.  
Media Producción Perfiles de inspección configurables  
por cliente.  
Media Sistema Nomenclatura maestra de archivos  
DXF/PDF/NC/nests/revisiones.  
Media Planeación Vista de carga semanal por  
equipo/capacidad.  
Baja Finanzas Facturación/CxC/Cobranza.  
Baja Finanzas Compras/Gastos/CxP/Tesorería.  
Baja Portal Portal cliente.  

## 22\. Glosario

Término Definición  
RFQ Solicitud de cotización; describe qué pide el cliente.  
Propuesta Documento comercial que define precio y plan estimado de  
fabricación.  
Revisión Versión comercial A/B/C de una propuesta.  
Operación solicitada Proceso que forma parte del alcance solicitado/comercial.  
Ruteo estimado Secuencia interna planeada para fabricar un ítem.  
Corrida Agrupación de ejecución compatible dentro de una Orden.  
Snapshot Copia histórica suficiente para que un documento  
permanezca entendible aunque cambien datos maestros.  
Frozen Revisión enviada cuyo contenido sustantivo ya no puede  
modificarse.  
WIP Trabajo en proceso.  
CxC / CxP Cuentas por cobrar / cuentas por pagar.  

## 23\. Nota final para desarrollar

###### Objetivo de producto

###### El ERP debe simplificar el trabajo diario y prevenir errores, no trasladar burocracia al usuario. La mejor

###### implementación es la que captura información durante el flujo normal, guía cuando hay riesgo y conserva

###### trazabilidad sin obligar a administrar el sistema.

##### Este documento debe mantenerse como referencia viva. Cuando una cuenta cambie por decisión de

##### negocio, actualizar primero la especificación funcional y despues el sistema.