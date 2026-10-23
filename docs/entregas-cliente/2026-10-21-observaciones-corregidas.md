# Observaciones corregidas y cómo probarlas

**Sistema ORCA MFG ERP — CC Manufacturing Group**
**Fecha de entrega:** 21 de octubre de 2026
**Última actualización:** 22 de octubre de 2026 (se agregan las observaciones 19 a 21: seguimiento, fechas y plazo comercial del RFQ, incluido en el PDF de la propuesta)

Este documento reúne las observaciones que nos compartieron, explica **qué se corrigió** en cada una y los **pasos para comprobarlo** en el sistema. Todas las correcciones ya están disponibles.

## Cómo usar este documento

- Cada observación tiene tres partes: **Qué se corrigió**, **Cómo probarlo** y **Resultado esperado**.
- Los pasos suponen que entras con un usuario que tiene permiso para ese módulo. Si no ves una pantalla o un botón, pide a administración que revise tus permisos.
- Si algo no se comporta como se describe, anota la pantalla, los pasos que seguiste y, si puedes, una captura. Con eso lo revisamos de inmediato.
- Al final de cada prueba puedes marcar la casilla de la tabla de resumen.

## Resumen

| # | Observación | Dónde | ¿Probada? |
|---|---|---|---|
| 1 | Creación de RFQ: captura demasiado extensa | RFQ | ☐ |
| 2 | RFQ: canal predeterminado WhatsApp | RFQ | ☐ |
| 3 | RFQ: detalles del acabado solo cuando se elige «Acabado» | RFQ | ☐ |
| 4 | RFQ: indicador «Listo para validar» | RFQ | ☐ |
| 5 | RFQ: contacto del cliente se completa solo | RFQ | ☐ |
| 6 | Quitar «Grupo planeado» del Ruteo/Costeo de la propuesta | Propuestas | ☐ |
| 7 | Ruteo estimado: guardado con confirmación visible | Propuestas | ☐ |
| 8 | Ítems: cálculo corregido, ahora «Utilidad estimada % sobre costo» | Propuestas | ☐ |
| 9 | Lista de propuestas: mostrar la revisión más reciente | Propuestas | ☐ |
| 10 | Lista de propuestas: «Próxima acción» en lenguaje claro | Propuestas | ☐ |
| 11 | Seguimiento y Actividad de la propuesta en lenguaje sencillo | Propuestas | ☐ |
| 12 | Historial del cliente: propuestas e importe de ventas | Clientes | ☐ |
| 13 | Identificar la propuesta de origen desde la lista de órdenes | Órdenes | ☐ |
| 14 | Dimensiones del material (ancho y largo) | Materiales y costos | ☐ |
| 15 | Catálogos base demasiado largo: secciones desplegables | Configuración | ☐ |
| 16 | Tarifas / TC demasiado largo: secciones desplegables | Configuración | ☐ |
| 17 | Cómo se agrega o edita una tarifa: flujo más fácil | Configuración | ☐ |
| 18 | Actividad: contexto difícil de entender | Actividad | ☐ |
| 19 | RFQ: seguimiento más simple al cambiar de estado | RFQ | ☐ |
| 20 | RFQ: fecha requerida por el cliente separada de la fecha compromiso | RFQ, Propuestas | ☐ |
| 21 | RFQ: plazo comercial cuando el cliente no pide una fecha | RFQ, Propuestas | ☐ |

---

## RFQ

### 1. Creación de RFQ: la captura era muy extensa

**Qué se corrigió.** Se simplificó el formulario de «Nuevo RFQ»:

- La **fecha de registro** y el **responsable** se asignan solos, con la fecha de hoy y la persona que está capturando. Ya no hay que escribirlos.
- Se pide una **descripción** de la solicitud al inicio, antes de agregar los ítems. Es obligatoria.
- Al terminar, **Finalizar captura** muestra un resumen del RFQ y solo pide la próxima acción y su fecha.

**Cómo probarlo.**

1. En **RFQ**, pulsa **Nuevo RFQ**.
2. Comprueba que **Fecha de registro** y **Responsable** ya vienen llenos (aparecen bloqueados, con la nota de que se asignan automáticamente).
3. Deja la **Descripción** vacía.
4. Escribe la descripción y pulsa **Continuar con ítems**. Agrega un ítem y pulsa **Continuar con archivos**. Sube un archivo y pulsa **Finalizar captura**.

**Resultado esperado.** Con la descripción vacía, el botón **Continuar con ítems** queda bloqueado y el sistema indica «Para continuar completa: descripción». Al pulsar **Finalizar captura** aparece el **Resumen del RFQ** (cliente, canal, fecha de registro, responsable y descripción) y los campos de la próxima acción. Al pulsar **Guardar y finalizar**, el RFQ queda como Incompleto en la lista para completarlo después.

### 2. RFQ: canal predeterminado WhatsApp

**Qué se corrigió.** Al crear un RFQ, el canal **WhatsApp** ya aparece seleccionado, porque es el canal habitual de entrada. Se puede cambiar por otro.

**Cómo probarlo.**

1. En **RFQ**, pulsa **Nuevo RFQ**.
2. Revisa el campo **Canal**.
3. Cámbialo por otro canal.

**Resultado esperado.** **Canal** muestra **WhatsApp** desde el inicio y permite elegir otro.

### 3. RFQ: detalles del acabado solo cuando se elige «Acabado»

**Qué se corrigió.** El campo **Detalles del acabado** aparece, y es obligatorio, únicamente cuando en el ítem se selecciona la operación **Acabado**. En los demás ítems no estorba.

**Cómo probarlo.**

1. Abre un RFQ y agrega o edita un ítem.
2. Sin marcar la operación **Acabado**, comprueba que no aparece el campo de detalles.
3. Marca la operación **Acabado** e intenta guardar sin llenar **Detalles del acabado**.
4. Escribe los detalles y guarda. Después quita la operación **Acabado**.

**Resultado esperado.** El campo aparece solo con «Acabado», el sistema no deja guardar sin llenarlo y desaparece al quitar la operación.

### 4. RFQ: indicador «Listo para validar»

**Qué se corrigió.** Antes un RFQ con toda la información podía seguir viéndose como incompleto. Ahora, cuando la captura está completa, el encabezado del RFQ muestra **Listo para validar** en verde. Es un aviso: el RFQ sigue como «Incompleto» hasta que lo marques como listo.

**Cómo probarlo.**

1. Abre un RFQ al que todavía le falte información: debe mostrar «Incompleto» y lo que falta.
2. Completa lo que falte.
3. Observa el indicador del encabezado.

**Resultado esperado.** El indicador cambia a **Listo para validar** en color verde cuando ya no falta nada.

### 5. RFQ: el contacto del cliente se completa solo

**Qué se corrigió.** Si el cliente ya tiene un contacto registrado, el sistema lo vincula al RFQ automáticamente. Ya no hay que elegirlo a mano. Esto funciona con usuarios que pueden editar RFQ.

**Cómo probarlo.**

1. Crea un RFQ y elige un cliente que ya tenga contacto registrado, o abre un RFQ que tenga cliente pero no contacto.
2. Revisa el contacto del RFQ.

**Resultado esperado.** El contacto vigente del cliente aparece completado sin seleccionarlo. Si quieres otro contacto, puedes elegirlo.

### 19. RFQ: seguimiento más simple al cambiar de estado

**Qué se corrigió.** Antes, cada vez que cambiabas el estado de un RFQ (por ejemplo, ponerlo en espera del cliente) el sistema te pedía capturar de nuevo una próxima acción, aunque la que ya tenía siguiera teniendo sentido. Ahora el seguimiento funciona como una cadena sencilla:

- Si el seguimiento actual sigue vigente, queda marcado **Dejarlo como está** y puedes confirmar el cambio sin capturar nada más.
- Si quieres sustituirlo, eliges **Cerrarlo y definir otro**. Antes de definir el siguiente, el sistema pregunta **¿Cómo terminó esta acción?** con cuatro opciones: **Completada**, **Sin respuesta**, **Reprogramada** o **Ya no aplica**.
- **Reprogramada** conserva la misma acción y solo pide la nueva fecha.
- Si la fecha del seguimiento **ya venció**, no se puede dejar como está: se pide cómo terminó y se define el siguiente.
- Lo mismo aplica si cambias o retiras la próxima acción directamente en el **Resumen** del RFQ. Mover solo la fecha o el responsable no pide resultado, porque la acción es la misma.
- El resultado queda registrado en la pestaña **Actividad** del RFQ (por ejemplo, «Seguimiento: sin respuesta del cliente»).

**Cómo probarlo.**

1. Abre un RFQ que ya tenga una próxima acción con fecha futura y pulsa **Poner en espera del cliente**.
2. Observa el recuadro **Seguimiento actual** y la opción **Dejarlo como está** ya seleccionada. Pulsa **Confirmar**.
3. Con el RFQ en espera, pulsa **Marcar incompleto** y elige **Cerrarlo y definir otro**. Comprueba que **Confirmar** no se habilita hasta elegir cómo terminó.
4. Elige **Sin respuesta**, define la siguiente acción con su fecha y pulsa **Confirmar**.
5. Abre la pestaña **Actividad** del RFQ.
6. En la pestaña **Resumen**, cambia la acción en **Próxima acción** y observa el aviso antes de guardar.

**Resultado esperado.** En el paso 2 el cambio se guarda sin pedir otra acción y el seguimiento sigue igual. En el paso 3, la acción nueva solo aparece después de elegir el resultado. En **Actividad** se lee «Seguimiento: sin respuesta del cliente» junto al cambio de estado. En el Resumen aparece «Vas a sustituir la acción…» y se pide cómo terminó antes de guardar.

### 20. RFQ: fecha requerida por el cliente separada de la fecha compromiso

**Qué se corrigió.** Se separaron las fechas para que no se confundan:

| Fecha | Qué es | Cómo se captura |
|---|---|---|
| **Fecha de solicitud** | Cuándo se recibe o registra el RFQ | Automática |
| **Fecha requerida por el cliente** | Cuándo quisiera recibir el trabajo el cliente. **No es un compromiso.** | Opcional, junto al canal |
| **Fecha compromiso comercial** | La fecha que nuestra empresa confirma | Se confirma al **aceptar la propuesta** |
| **Fecha operativa** | La fecha interna que define Planeación | La define Planeación; no cambia el compromiso comercial |

- En el alta y en el Resumen del RFQ hay un campo nuevo, **Fecha requerida por el cliente (opcional)**, con la nota «No representa todavía una fecha compromiso de nuestra empresa».
- El Resumen muestra **Fecha compromiso comercial: Se confirma al aceptar la propuesta**.
- Al crear la orden, la fecha compromiso sale de la que se confirmó al aceptar la propuesta y **nunca** de la fecha requerida por el cliente. Si faltara el compromiso, el sistema no inventa una fecha: avisa que falta.
- Al aceptar una propuesta, junto al campo de la fecha compromiso aparece una referencia con lo que pidió el cliente.

**Cómo probarlo.**

1. En **RFQ**, pulsa **Nuevo RFQ** y localiza **Fecha requerida por el cliente (opcional)** junto a **Canal**.
2. Captura una fecha y continúa hasta crear el RFQ. Después repite sin capturarla.
3. Abre el RFQ, entra a **Resumen** y revisa **Fecha de solicitud**, **Fecha requerida por cliente** y **Fecha compromiso comercial**.
4. En una propuesta enviada, ve a la zona de **Aceptar revisión** y lee el texto sobre el campo **Fecha compromiso comercial**.

**Resultado esperado.** El campo es opcional: se puede crear el RFQ sin llenarlo. El Resumen muestra cada fecha por separado y la fecha compromiso dice que se confirma al aceptar la propuesta. Al aceptar, se lee «El cliente pidió recibirlo el …» y el campo de la fecha compromiso sigue siendo obligatorio, a cargo de quien acepta.

### 21. RFQ: plazo comercial cuando el cliente no pide una fecha

**Qué se corrigió.** Cuando el cliente no solicita una fecha específica, el sistema ya no obliga a inventar una. Se agregó el campo **Plazo comercial (opcional)**, de texto libre, para escribir lo que se ofrece, por ejemplo «Fabricación 5-7 días». Mientras tanto, la **fecha compromiso comercial** queda pendiente hasta que se confirma al aceptar la propuesta.

- El campo está en el alta del RFQ y en el **Resumen**, debajo de la fecha requerida, con una nota que explica su uso.
- Al aceptar la propuesta se muestra «Plazo ofrecido: …» como referencia junto a la fecha compromiso.
- El **PDF de la propuesta** incluye la línea **Plazo comercial: …** cuando el RFQ lo tiene. Si no tiene plazo, el PDF queda como antes. El PDF no imprime la fecha compromiso.
- El plazo queda guardado con la versión del RFQ y aparece en su **Historial de versiones**. Como el resto de los datos del RFQ, ya no cambia una vez que se crea la propuesta.

**Cómo probarlo.**

1. En **RFQ**, pulsa **Nuevo RFQ**. Deja vacía la **Fecha requerida por el cliente** y escribe «Fabricación 5-7 días» en **Plazo comercial (opcional)**.
2. Completa el alta hasta **Finalizar captura**.
3. Abre el RFQ y entra a **Resumen**: revisa **Plazo comercial**, **Fecha requerida por cliente** y **Fecha compromiso comercial**.
4. Cambia el texto del plazo, pulsa **Guardar datos** y vuelve a mirar el Resumen.
5. Crea la propuesta de ese RFQ, valídala y pulsa **Generar PDF**. Abre el PDF con **Ver PDF**.
6. Si la propuesta ya fue enviada, abre su zona de **Aceptar revisión**.

**Resultado esperado.** El RFQ se crea sin ninguna fecha inventada. El Resumen muestra el plazo escrito, la fecha requerida vacía («—») y la fecha compromiso con «Se confirma al aceptar la propuesta». El PDF incluye debajo de los datos del cliente la línea «Plazo comercial: Fabricación 5-7 días». Al aceptar la propuesta se lee «Plazo ofrecido: Fabricación 5-7 días» y la fecha compromiso la sigue confirmando quien acepta.

---

## Propuestas

### 6. Quitar «Grupo planeado» del Ruteo/Costeo de la propuesta

**Qué se corrigió.** Se quitó el campo **Grupo planeado** de la tabla de Ruteo/Costeo, porque no hacía falta capturarlo. La información sigue llegando a Planeación automáticamente según el proceso elegido.

**Cómo probarlo.**

1. En **Propuestas**, abre una propuesta en **Borrador**.
2. Entra a la pestaña **Ruteo/Costeo**.
3. Revisa las columnas de cada fila.

**Resultado esperado.** Cada fila muestra **Proceso**, **Grupo de equipo**, **Preparación (h)**, **Operación (h)**, **Total (h)** y **Costo estimado**. **Grupo planeado** ya no aparece.

### 7. Ruteo estimado: guardado con confirmación visible

**Qué se corrigió.** Se corrigió el guardado del ruteo estimado. Ahora el sistema avisa cuando hay cambios sin guardar y confirma con un mensaje visible cuando el ruteo quedó guardado. Después de guardar, la captura queda lista para agregar el siguiente proceso.

**Cómo probarlo.**

1. Abre una propuesta en **Borrador** y entra a **Ruteo/Costeo**.
2. Cambia el tiempo de un proceso, o pulsa **Agregar fila** y elige un proceso.
3. Observa el aviso de cambios sin guardar.
4. Pulsa **Guardar ruteo**.

**Resultado esperado.** Aparece un mensaje como «Ruteo de IT01 guardado.» (con el código del ítem) y desaparece el aviso de cambios pendientes. El botón **Costear ruteo** también guarda lo pendiente antes de calcular el costo.

### 8. Ítems: cálculo corregido, ahora «Utilidad estimada % sobre costo»

**Qué se corrigió.** El cálculo de la pestaña **Ítems** no coincidía con **Ruteo/Costeo**, porque no tomaba en cuenta el costo del ruteo. Ahora las tres vistas (Ítems, Ruteo/Costeo y Resumen) usan el mismo costo, y el indicador principal pasó de «Margen %» a **Utilidad estimada % sobre costo**:

- **Utilidad** = venta sin IVA − costo total estimado de fabricación.
- **Porcentaje** = utilidad ÷ costo total estimado × 100.
- El **IVA no participa** en el cálculo.
- El **objetivo inicial es 30 %** y se puede cambiar sin ayuda técnica en **Configuración → Tarifas / TC**, campo **Utilidad objetivo de propuestas (% sobre costo)**.
- Si la utilidad queda por debajo del objetivo aparece una **alerta en rojo** (no bloquea la propuesta) y se muestra el **Precio mínimo recomendado**: costo total × 1.30 con el objetivo inicial.

**Cómo probarlo.**

1. Abre una propuesta que ya tenga el ruteo costeado.
2. En la pestaña **Ítems**, debajo de Subtotal, IVA y Total, busca **Utilidad estimada % sobre costo** y la línea con el costo total estimado, la utilidad, el objetivo y el **Precio mínimo recomendado (sin IVA)**.
3. Revisa **Ruteo/Costeo** y **Resumen** (historial de versiones): deben mostrar el mismo porcentaje.
4. Ejemplo: con una venta de $7,000 y un costo total de $7,150, el sistema debe mostrar **−2.10 %**, la alerta en rojo y un precio mínimo recomendado de **$9,295.00**.
5. En **Configuración → Tarifas / TC**, cambia el objetivo (por ejemplo a 50) y guarda. Vuelve a la propuesta.
6. Con la alerta visible, comprueba que todavía puedes validar la propuesta.

**Resultado esperado.** El porcentaje es el mismo en las tres pestañas, la alerta y el precio mínimo se actualizan al cambiar el objetivo, y la alerta no impide validar ni enviar.

*Queda para una siguiente etapa: registrar un motivo o autorización cuando se envíe una propuesta por debajo del objetivo. Todavía no está habilitado.*

### 9. Lista de propuestas: mostrar la revisión más reciente

**Qué se corrigió.** En la lista de propuestas, la columna **Revisión** podía quedarse en la versión A aunque ya existiera la B. Ahora siempre muestra la versión más reciente.

**Cómo probarlo.**

1. En **Propuestas**, localiza una propuesta que tenga versiones A y B enviadas.
2. Revisa la columna **Revisión**.

**Resultado esperado.** Muestra la versión más reciente, por ejemplo «B · Enviada».

### 10. Lista de propuestas: «Próxima acción» en lenguaje claro

**Qué se corrigió.** La columna **Próxima acción** mostraba códigos técnicos en inglés (por ejemplo `WAIT_CUSTOMER_RESPONSE · 2026-10-19`). Ahora muestra la acción en español y la fecha legible: «Esperar respuesta del cliente · 19 de octubre de 2026». Si se eligió «Otro», se muestra lo que se escribió. Si la fecha ya pasó, aparece en rojo.

**Cómo probarlo.**

1. En **Propuestas**, revisa la columna **Próxima acción**.
2. Activa la casilla **Próxima acción vencida**.

**Resultado esperado.** Todas las acciones se leen en español, sin códigos. El filtro deja solo las propuestas con fecha vencida, marcadas en rojo.

### 11. Seguimiento y Actividad de la propuesta en lenguaje sencillo

**Qué se corrigió.** Las pestañas **Seguimiento** y **Actividad** de la propuesta ya no muestran códigos técnicos.

- **Seguimiento:** cada acción se lee en español, con su fecha («Para el 19 de octubre de 2026») y el canal por su nombre. La más reciente lleva la marca **Vigente**. Un subtítulo explica para qué sirve.
- **Actividad:** cada cambio aparece como una frase clara («Propuesta enviada al cliente», «Seguimiento registrado», «El cliente aceptó esta versión»), con una explicación al inicio.

**Cómo probarlo.**

1. Abre una propuesta que ya tenga historial.
2. Entra a **Seguimiento**, pulsa **Registrar seguimiento**, guarda una acción nueva y revisa la lista.
3. Entra a **Actividad** y lee las líneas.

**Resultado esperado.** No aparecen códigos ni guiones bajos. La acción nueva queda como **Vigente** y las líneas de Actividad se entienden sin conocimientos técnicos.

---

## Clientes

### 12. Historial del cliente: propuestas e importe de ventas

**Qué se corrigió.**

- En la ficha del cliente, el **Historial** ahora incluye las **propuestas** del cliente, con sus versiones y un enlace a cada propuesta.
- Una venta convertida podía aparecer con importe de **$0.00**. Ahora el importe sale de la propuesta aceptada. Si todavía no existe o tu rol no puede verlo, el sistema lo dice con claridad («Precio pendiente», «Importe no visible para tu rol» o «Importe no disponible») en lugar de mostrar $0.00.

**Cómo probarlo.**

1. En **Clientes**, abre un cliente que tenga una venta convertida y una propuesta aceptada.
2. Entra a la pestaña **Historial**.
3. Revisa la sección **Propuestas** y el importe de la venta.
4. Pulsa el enlace de una propuesta.

**Resultado esperado.** Las propuestas aparecen con sus versiones y el enlace abre la propuesta. El importe de la venta coincide con el de la propuesta aceptada y ya no muestra $0.00 por error. La sección Propuestas se ve con permiso de propuestas.

---

## Órdenes

### 13. Identificar la propuesta de origen desde la lista de órdenes

**Qué se corrigió.** En la lista de **Órdenes**, bajo el folio de cada orden aparece la propuesta de la que nació («Propuesta CNC-…»). Con permiso de propuestas, ese folio es un enlace que abre la propuesta. Las órdenes que no vienen de una propuesta (por ejemplo, las internas) se ven igual que antes.

**Cómo probarlo.**

1. En **Órdenes**, localiza una orden creada a partir de una propuesta.
2. Revisa debajo de su folio.
3. Pulsa «Propuesta CNC-…».
4. Revisa también una orden interna.

**Resultado esperado.** La referencia aparece bajo el folio y el enlace abre la propuesta correcta. Una orden interna no muestra referencia.

---

## Materiales y costos

### 14. Dimensiones del material (ancho y largo)

**Qué se corrigió.** Al crear o editar un material ahora se pueden capturar **Ancho (mm)** y **Largo (mm)**. Son opcionales: los materiales que ya existían quedan sin medidas hasta que se editen. La tabla muestra una columna **Ancho × largo**.

**Cómo probarlo.**

1. En **Materiales y costos**, pulsa **Nuevo material**.
2. Captura los datos habituales y, en **Ancho (mm)** y **Largo (mm)**, medidas como 1219.2 y 2438.4.
3. Pulsa **Crear material** y revisa la tabla.
4. Edita un material existente, agrégale medidas y pulsa **Guardar cambios**.
5. Prueba dejar los campos vacíos y, aparte, escribir 0 o un número negativo.

**Resultado esperado.** Las medidas se guardan (hasta 3 decimales) y se ven en **Ancho × largo**. Dejarlas vacías está permitido. Un valor en cero o negativo es rechazado con un aviso.

---

## Configuración

### 15. Catálogos base demasiado largo: secciones desplegables

**Qué se corrigió.** Las tablas de **Catálogos base** se organizaron en secciones desplegables, con una transición suave. Al entrar, solo **Procesos** está abierto. **Grupos de equipo**, **Grupos planeados**, **Próximas acciones** y **Canales RFQ** inician cerradas.

**Cómo probarlo.**

1. Entra a **Configuración** y abre la pestaña **Catálogos base**.
2. Comprueba cuál sección está abierta.
3. Abre y cierra cada sección.
4. Edita un registro y guarda.

**Resultado esperado.** Solo Procesos está abierto, las demás se abren y cierran con animación suave, y editar y guardar funciona igual que antes.

### 16. Tarifas / TC demasiado largo: secciones desplegables

**Qué se corrigió.** En **Configuración → Tarifas / TC**, **Corte láser**, **Router CNC**, **Dobladora**, **Fabricación** y **Tarifario del ruteo** ahora son secciones desplegables. Inician cerradas y se abren con una animación suave.

- Cada título muestra la tarifa vigente sin necesidad de abrirlo (por ejemplo, «Máquina $950.00/h · Preparación $480.00/h»).
- El título del Tarifario avisa cuántos grupos de equipo siguen sin tarifa («6 grupos de equipo · 1 sin tarifa»).
- La forma de editar y guardar no cambió.

**Cómo probarlo.**

1. Entra a **Configuración** y abre la pestaña **Tarifas / TC**.
2. Comprueba que las secciones están cerradas y que cada título muestra su resumen.
3. Abre **Corte láser**, cambia un valor y pulsa **Guardar tarifas y TC**.
4. Actualiza la página y vuelve a abrir **Corte láser**.
5. Abre **Tarifario del ruteo**.

**Resultado esperado.** Todo inicia cerrado, el valor cambiado se conserva al guardar y el Tarifario muestra las tarifas por grupo de equipo y por máquina.

### 17. Cómo se agrega o edita una tarifa: flujo más fácil

**Qué se corrigió.** Se revisó cómo se capturan las tarifas y se hizo más fácil:

- No existe un botón de «nueva tarifa». Las tarifas de las estaciones (Corte láser, Router CNC, Dobladora y Fabricación) se editan dentro de su propia sección y se guardan con **Guardar tarifas y TC**.
- En el **Tarifario del ruteo**, cada grupo de equipo y cada máquina tiene su botón **Editar tarifa**.
- Un grupo o una máquina **nuevos** se crean en **Catálogos base** y después se les asigna su tarifa en el Tarifario.
- **Mejoras:** el botón **Guardar tarifas y TC** queda fijo en la parte inferior del formulario, para no recorrerlo completo con una sección abierta. El Tarifario incluye un acceso directo **Ir a Catálogos base**, visible para quien tiene permiso de esa pestaña.

**Cómo probarlo.**

1. En **Tarifas / TC**, abre **Corte láser** y desplázate hacia abajo.
2. Observa el botón **Guardar tarifas y TC**.
3. Abre **Tarifario del ruteo** y pulsa **Ir a Catálogos base**.

**Resultado esperado.** El botón de guardar permanece visible en la parte inferior mientras te desplazas y el acceso directo te lleva a la pestaña **Catálogos base**.

---

## Actividad

### 18. Actividad: contexto difícil de entender

**Qué se corrigió.** La columna **Contexto** de **Actividad** mostraba un bloque de texto técnico, difícil de leer. Ahora presenta descripciones claras, en palabras.

**Cómo probarlo.**

1. Entra con un usuario administrador y abre **Actividad**.
2. Revisa la columna **Contexto** en varios registros.

**Resultado esperado.** Cada registro muestra una descripción comprensible, sin llaves ni código. La columna Contexto la ven los administradores.
