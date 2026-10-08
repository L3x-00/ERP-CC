# Preguntas funcionales para el cliente

Estado: **respondidas por el cliente el 2026-10-07**. La fuente vigente es `DECISIONES-ACEPTADAS.md`; este archivo se conserva como trazabilidad de las preguntas y recomendaciones originales.

Estas preguntas se limitaron a decisiones que cambian datos, estados, permisos o flujos de otros módulos.

## Preguntas bloqueantes

### 1. Campos retirados del RFQ

¿“Orden de compra”, “Fecha requerida” y “Horas estimadas” deben retirarse solo de la ventana de alta o desaparecer por completo del RFQ?

**Recomendación:** retirarlos del alta. Las horas deben calcularse en el ruteo de Propuesta; la orden de compra debe capturarse solo cuando el cliente la entregue; la fecha compromiso debe definirse antes de aceptar la propuesta.

**Impacto:** si “Fecha requerida” desaparece de todo el flujo, necesitamos definir dónde se obtiene la fecha compromiso de la Orden.

### 2. Canales permitidos

¿La lista inicial será `WhatsApp, Correo, Teléfono, Visita, Referido, Otro` y podrá administrarse desde Configuración?

**Recomendación:** catálogo configurable; “Otro” exige un detalle. Así se evitan faltas ortográficas sin bloquear canales nuevos.

### 3. Alta de RFQ interrumpida

Si el usuario cierra el modal después de guardar cliente/ítems pero antes de terminar archivos, ¿se conserva como RFQ Incompleto o se descarta?

**Recomendación:** conservarlo como Incompleto y permitir “Continuar captura”; nunca perder datos ni archivos ya subidos.

### 4. Alcance de una versión de RFQ

¿Una versión nueva se genera por cada guardado de cabecera/ítems, mientras los archivos mantienen su propio historial separado?

**Recomendación:** sí. El snapshot de RFQ contiene cabecera e ítems; archivos y próximas acciones conservan sus historiales especializados. Evita duplicar blobs y versiones por cambios de seguimiento.

### 5. Momento de bloqueo del RFQ

¿El RFQ deja de ser editable al crear la primera Propuesta o recién cuando esa propuesta se envía al cliente?

**Recomendación:** bloquear definición del RFQ al crear la Propuesta A. Cualquier cambio comercial posterior se hace como nueva versión de Propuesta, preservando el origen.

### 6. Próxima acción en estados terminales

¿La próxima acción será obligatoria en todos los cambios salvo `Cancelado`, `Cerrado`, `Aceptado/Venta confirmada` y `Orden cerrada`?

**Recomendación:** sí. En estados terminales se exige motivo/resultado cuando corresponda, pero no una acción futura ficticia.

### 7. Nivel de la tarifa por hora

¿El costo por hora pertenece al **área/proceso**, al **grupo de equipo** o a cada **máquina/recurso**? ¿Preparación y operación tienen tarifas distintas?

**Recomendación:** reutilizar la tarifa interna por hora del área vinculada al proceso y aplicarla a preparación + operación. El sistema ya posee esa relación, por lo que evitamos mantener otra tarifa contradictoria. Si una máquina concreta tiene un costo diferente, agregar un ajuste explícito por recurso. Solo separar preparación y operación si sus tarifas son realmente distintas.

**Impacto:** esta decisión define el modelo de datos y el cálculo de cada propuesta.

### 8. Ítems nuevos dentro de una versión de Propuesta

Cuando el cliente pide agregar un ítem que no existía en el RFQ, ¿se crea un nuevo código IT consecutivo dentro de la Propuesta y queda solo allí, o debe regresar primero al RFQ?

**Recomendación:** permitir un IT nuevo en la nueva versión de Propuesta, con código consecutivo estable y referencia “agregado en revisión X”; el RFQ original permanece congelado.

### 9. Aceptación y creación automática de Orden

¿Quién registra en el ERP que el cliente recibió y aceptó la propuesta, qué fecha compromiso debe usar la Orden automática y qué debe ocurrir si en ese momento falla una validación de crédito, moneda o datos obligatorios?

**Recomendación:** un usuario comercial autorizado registra “Recibida” y después “Aceptada”; antes de aceptar confirma fecha compromiso. La aceptación no debe borrarse si la generación de la Orden queda bloqueada: el sistema mostrará “Orden pendiente”, la causa y un reintento autorizado. Al corregir el dato, se crea exactamente una Orden.

### 10. Inmutabilidad de la Orden

¿La prohibición de editar incluye prioridad, fecha compromiso y notas, o solo ítems, cantidades, precios y procesos?

**Recomendación:** congelar ítems, cantidades, precios, moneda y ruteo. Permitir que Planeación reprograme fechas/recursos operativos con historial, sin alterar la fecha comercial comprometida.

### 11. Vista administrativa como operador

¿Aceptan que el administrador elija “Ver como operador” sin conocer ni escribir el PIN del operador? ¿Esta vista será solo para comprobar lo que ve el operador o también permitirá registrar producción en su nombre?

**Recomendación:** sí, y dejarla **solo lectura** por defecto. La vista será temporal, visible y auditada. Si en el futuro se autoriza operar en nombre de otra persona, cada acción deberá registrar al operador representado y al administrador real. Mostrar o reutilizar el PIN debilitaría la trazabilidad y seguridad.

### 12. Datos existentes del Inventario

¿Confirmamos que el inventario actual se retira de la operación diaria, pero sus movimientos, existencias y kardex históricos se conservan en solo lectura?

**Recomendación:** sí; no borrar historia. Desactivar nuevas entradas/salidas/reservas y sustituir la pantalla por “Materiales y costos”.

### 13. Fuente del último costo conocido

¿El costo vigente de un material se actualiza manualmente, desde una Compra/Gasto `CG-MMYY_####`, o por ambos medios?

**Recomendación:** ambos, con prioridad explícita: una compra puede proponer el nuevo costo y un administrador lo confirma. Cada cambio guarda valor anterior, nuevo, moneda, fecha, fuente y actor.

### 14. Moneda y unidad del costo de material

¿Todos los costos unitarios base se manejarán en MXN o algunos materiales se compran/costean en USD? ¿La unidad congelada será hoja, barra, rollo, pieza, kg, m² o metro lineal según material?

**Recomendación:** permitir MXN/USD y una unidad base configurable por material; al consumir se congelan costo, moneda, tipo de cambio y unidad usados.

## Confirmación visual no bloqueante

Las capturas se usarán como referencia de jerarquía, etiquetas y simplicidad. Proponemos conservar la identidad visual actual y aumentar claridad de verdes/amarillos/ámbar mediante tokens semánticos con contraste accesible, en vez de copiar colores exactos. Indíquenos si existe una paleta corporativa obligatoria.
