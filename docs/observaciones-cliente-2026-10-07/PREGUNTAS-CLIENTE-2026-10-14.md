# Preguntas para el cliente — Órdenes, Planeación y Finanzas

**CC Manufacturing Group · ERP SII · 14 de octubre de 2026**

Con sus tres notas de revisión funcional ya tenemos un plan de **ajustes** (no de rehacer los módulos). Para desarrollar **sin suposiciones**, necesitamos que nos confirmen lo que las notas no definen. Cada pregunta dice qué cambia según su respuesta.

**Cómo responder**
- Marque con **X** una opción. Si ninguna aplica, escriba su regla en *Otra*.
- Las **Confirmaciones rápidas** traen nuestra propuesta: responda **Sí** o escriba la corrección.
- Las preguntas marcadas con ⭐ **bloquean** el inicio de una etapa de desarrollo (se indica cuál). Las demás pueden responderse después, pero sin respuesta no podremos cerrar esa parte.
- Puede devolvernos este mismo archivo con las respuestas.

---

## PARTE 1 — ÓRDENES

### Decisiones

**O-01 ⭐ (bloquea el cierre administrativo)** Una orden de 50 piezas termina con 48 buenas y 2 de merma (scrap), y se entregaron las 48. ¿Cuándo se puede hacer el **cierre administrativo**?
- ☐ **A.** Solo cuando se entregó el 100 % de lo **pedido** (50). Si faltan piezas, la orden sigue abierta hasta resolverlo. *(Es como funciona hoy.)*
- ☐ **B.** Cuando se entregó el 100 % de lo **producido** (48), aceptando el faltante.
- ☐ **C.** Se puede cerrar con faltante si un usuario autorizado registra el motivo (queda en el historial).
- ☐ Otra: ______________________________

**O-02** ¿Se puede cerrar administrativamente una orden entregada al 100 % aunque Producción **todavía no la haya marcado como terminada**?
- ☐ Sí  ☐ No, Producción debe terminarla primero

**O-03 ⭐ (bloquea simplificar la cola de órdenes)** El botón **Repetir trabajo** hoy crea una orden nueva copiando partidas, **precios** y la cuenta por cobrar. Su nota pide retirarlo hasta tener una regla clara. ¿Qué regla desean?
- ☐ **A.** Retirarlo por ahora, sin reemplazo.
- ☐ **B.** Dejarlo como *«Nueva orden basada en la anterior»*: nuevo folio, referencia a la original y copia solo de datos **técnicos** (sin precios ni cuenta por cobrar; el precio se vuelve a cotizar).
- ☐ **C.** Igual que B pero copiando también los precios.
- ¿Debe poder usarse sobre órdenes viejas importadas de otro sistema?  ☐ Sí  ☐ No

**O-04 ⭐ (bloquea la hoja de trabajo y el documento comercial)** Puestos y permisos. Hoy solo el administrador y el contador ven precios y totales. Para **cada puesto real** de su empresa, indique:

| Puesto / personas | ¿Ve precios, descuento, IVA y total? | ¿Ve el documento comercial de la orden? | ¿Ve la hoja de trabajo (sin precios)? |
|---|---|---|---|
| Customer Service (¿quiénes?) | ☐ Sí ☐ No | ☐ Sí ☐ No | ☐ Sí ☐ No |
| Administrative (¿quiénes?) | ☐ Sí ☐ No | ☐ Sí ☐ No | ☐ Sí ☐ No |
| Management (¿quiénes?) | ☐ Sí ☐ No | ☐ Sí ☐ No | ☐ Sí ☐ No |
| Operator (piso) | ☐ Sí ☐ No | ☐ Sí ☐ No | ☐ Sí ☐ No |
| Otro: ________ | ☐ Sí ☐ No | ☐ Sí ☐ No | ☐ Sí ☐ No |

**O-05** La **hoja de trabajo** (cliente, orden, ítems, descripción, cantidad, material, espesor, procesos, observaciones y archivos, **sin precios**): ¿quién la usa?
- ☐ **A.** El operador la consulta o imprime en el piso con su PIN.
- ☐ **B.** La imprime Planeación o el gerente y se la entrega.
- ☐ **C.** Ambos.
- Observaciones que debe ver:  ☐ las del ítem  ☐ las de la orden  ☐ ambas
- Los archivos (DXF, planos):  ☐ se abren/descargan desde ahí  ☐ solo se listan

**O-06** ¿Contra qué fecha se mide si una orden llegó **a tiempo**?
- ☐ **A.** La fecha de compromiso comercial (la promesa original).
- ☐ **B.** La fecha operativa (la reprogramada por Planeación).
- ☐ **C.** Mostrar ambas.

### Confirmaciones rápidas (nuestra propuesta)

| # | Propuesta | Respuesta |
|---|---|---|
| O-07 | **Reactivar** se retira sin reemplazo en esta fase; el retrabajo se definirá más adelante. | ☐ Sí ☐ Corrección: |
| O-08 | Se puede entregar **parcialmente** aunque la orden siga en producción. | ☐ Sí ☐ No |
| O-09 | Las entregas son **exactas** (sin tolerancia de más o de menos). | ☐ Sí ☐ Tolerancia de ___ % |
| O-10 | La columna **Avance** de la cola sigue midiendo producción; se agrega una etiqueta aparte: *«Pendiente de entrega»* o *«Entrega parcial 30/50»*. | ☐ Sí ☐ Corrección: |
| O-11 | Folios con formato **OP-######** son de un sistema anterior y se rotulan *«Folio anterior»*; las órdenes creadas en el ERP muestran *«Folio: O-MMYY_XX»*. | ☐ Sí ☐ Corrección: |
| O-12 | **Archivos vivos:** se muestran también los subidos directamente a la orden (Origen *Orden*); se ocultan los retirados de la propuesta; se muestra el nombre original; tipos: *CAD, Plano, Especificación, Imagen, Otro* (CAD se reconoce por extensión: dxf, dwg, step, igs). | ☐ Sí ☐ Corrección: |
| O-13 | Antes de arrancar Producción, ¿necesitan en **Actividad** los eventos *planificada, producción iniciada, producción completada, cancelada y entregada*? (implica un cambio en la base de datos) | ☐ Sí, antes de Producción ☐ No, basta con los actuales con nombres claros |
| O-14 | Subtotal, descuento, IVA y total se ven **solo en la pestaña Documento**, no en el Resumen de la orden. | ☐ Sí ☐ También en el Resumen |

---

## PARTE 2 — PLANEACIÓN

### Decisiones

**P-01 ⭐ (bloquea el diseño de la programación)** Hoy se programa **por ítem y equipo**: una asignación con fecha, turno y horas, aunque el ítem tenga varios procesos (corte, doblez, etc.). ¿Necesitan programar **cada operación por separado**?
- ☐ **A.** Por ítem y equipo, como hoy; los procesos del ítem se muestran como lista. *(Es un ajuste.)*
- ☐ **B.** Por **operación**: cada proceso del ruteo con su propio equipo, fecha, turno y horas. *(Es un cambio mayor y también afecta a Producción.)*
- Si eligió B, ¿es indispensable para la primera puesta en marcha?  ☐ Sí  ☐ No, puede ser una etapa posterior

**P-02 ⭐ (bloquea las validaciones de programación)** Si una asignación **excede la capacidad** del equipo en ese turno:
- ☐ **A.** Se avisa el exceso en horas y **no se permite guardar**. *(Es como funciona hoy.)*
- ☐ **B.** Se avisa y **se permite guardar** si un usuario confirma y escribe el motivo (queda registrado quién y por qué).

**P-03 ⭐ (bloquea el cálculo de capacidad real)** Cuando una operación termina **antes o después** de lo estimado:
- ☐ **A.** Al completarse, el bloque libera todas sus horas; si se pasó del tiempo, el exceso **solo se muestra** como horas reales, sin ocupar capacidad adicional.
- ☐ **B.** La capacidad se **recalcula con horas reales**: se libera lo que sobró y se suma el exceso.

Y en una **pausa prolongada por material o aclaración** (hoy el equipo puede liberarse después de 60 minutos, de forma manual), la programación pausada:
- ☐ sigue ocupando sus horas  ☐ libera las horas restantes del día

**P-04** **Compatibilidad** equipo–proceso:
- ¿Un equipo es compatible con un proceso solo por su **grupo** (por ejemplo, Láser Fibra)?  ☐ Sí  ☐ No: ______________
- Si se asigna a un equipo de otro grupo:  ☐ solo advertir  ☐ impedir
- Si hay varias unidades del mismo equipo (por ejemplo, 2 dobladoras):  ☐ pueden trabajar operaciones simultáneas  ☐ no

**P-05** **Responsable de la programación:**
- ☐ **A.** Quien captura la programación (se registra automáticamente).
- ☐ **B.** Una persona responsable que se elige al programar.

### Confirmaciones rápidas (nuestra propuesta)

| # | Propuesta | Respuesta |
|---|---|---|
| P-06 | **Semáforo:** *Disponible* hasta 70 % de ocupación; *Cerca del límite* de 70 % a 100 %; *Sobrecargado* por encima de 100 %. | ☐ Sí ☐ Otros umbrales: |
| P-07 | **Resumen semanal:** lunes a viernes (sábado: ☐ no ☐ sí); los turnos de un día se **suman**; un día sobrecargado cuenta como 0 h libres (no resta a los demás); un equipo sin turnos aparece como *«sin capacidad definida»*. | ☐ Sí ☐ Corrección: |
| P-08 | Al hacer **clic en un bloque** se abre la **ficha completa de la orden**. | ☐ Sí ☐ Solo un resumen dentro de Planeación |
| P-09 | En la tarjeta de Planeación se conservan **Liberar** y **Bandeja**; *Sesión, Entregar e Imprimir* se hacen desde Producción, Entregas y Órdenes. | ☐ Sí ☐ Corrección: |
| P-10 | El bloque **oculta** *Avance* y *Tiempo estimado de la partida* (pertenecen a Producción). | ☐ Sí ☐ No |
| P-11 | *Buscar hueco* y las sugerencias de la bolsa se mantienen como **ayuda básica** (sugieren la primera fecha libre y el usuario confirma). No habrá programación automática. | ☐ Sí ☐ Retirarlas |

---

## PARTE 3 — FINANZAS Y TESORERÍA

### Decisiones

**F-01 ⭐ (bloquea la conciliación por orden)** Una orden puede tener **compras de material** y también **consumo de material registrado por Producción**. Describen lo mismo y **no se pueden sumar**. ¿Cuál es el **Material real** de la orden?
- ☐ **A.** Siempre el **consumo** de Producción; la compra solo cuenta como comprometido.
- ☐ **B.** Siempre la **compra recibida**; el consumo es solo referencia.
- ☐ **C.** Una sola fuente por orden: la **compra recibida o pagada** si existe; si no hay compra, el consumo. La pantalla indica cuál se usó.

**F-02 ⭐ (bloquea la conciliación por orden)** ¿En qué momento una compra vinculada a una orden pasa a:
- **Costo comprometido:** ☐ al **confirmar** la compra  ☐ otro: __________
- **Costo real:** ☐ al **recibir** el material  ☐ al **confirmar el costo/factura** del proveedor  ☐ al **pagarla**
- Una compra **pagada pero no marcada como recibida**, ¿cuenta como real?  ☐ Sí  ☐ No

**F-03 ⭐ (decide la etapa de Facturación)** Su nota pide *«factura por entrega»*. Hoy el sistema solo permite **una factura emitida por orden**. Si una orden se entrega en 3 partes, ¿emiten 3 facturas?
- ☐ **A.** Sí, una factura por entrega; la cuenta por cobrar de la orden se va facturando por partes. *(Requiere una etapa propia, de mayor riesgo.)*
- ☐ **B.** No, una sola factura por orden (al final o por el total entregado).
- ☐ **C.** Depende del cliente: ______________________________

**F-04** **Base de venta** para calcular el margen estimado y el real (siempre sin IVA):
- ☐ **A.** La venta de la **Propuesta aceptada**.
- ☐ **B.** La venta **realmente facturada**.

**F-05 ⭐** Clasificación de costos en la conciliación (Material · Fabricación/operación · Subcontratación · Gastos directos). Confirme o corrija:

| Origen | Se clasifica como | ¿Correcto? |
|---|---|---|
| Propuesta: *Material* | Material (estimado) | ☐ Sí ☐ No: |
| Propuesta: *Máquina* + *Mano de obra* | Fabricación/operación (estimado) | ☐ Sí ☐ No: |
| Propuesta: *Otros* | Gastos directos (estimado) | ☐ Sí ☐ No: |
| Propuesta: Subcontratación (hoy **no existe** como categoría) | ☐ No se estima (queda en 0) ☐ Sí se estima; dónde: ________ | |
| Gasto: *materia prima* ligada a una orden | Material (real) | ☐ Sí ☐ No: |
| Gasto: *maquila externa* o servicio externo (p. ej. pintura) | Subcontratación (real) | ☐ Sí ☐ No: |
| Gasto: *flete dedicado* y otros directos | Gastos directos (real) | ☐ Sí ☐ No: |

**F-06** **Fabricación real** (horas reales de Producción): ¿las tarifas por hora de cada equipo ya están calibradas?
- ☐ **A.** Sí: Fabricación real = horas reales × tarifa del equipo.
- ☐ **B.** No todavía: mostrar las horas reales y dejar el costo de fabricación real como *pendiente* hasta calibrar las tarifas.

**F-07** ¿Dónde quieren ver la **conciliación de costos por orden**?
- ☐ **A.** Solo en *Gastos y rentabilidad* (con filtro por orden).
- ☐ **B.** Además, una pestaña *Costos* dentro de la Orden (visible solo para quienes ven finanzas).

### Confirmaciones rápidas (nuestra propuesta)

| # | Propuesta | Respuesta |
|---|---|---|
| F-08 | El **Dashboard** y los gastos de TI (órdenes internas) también se calculan **sin IVA**, y los **históricos se recalculan sin IVA** (algunas cifras pasadas cambiarán). | ☐ Sí ☐ Corrección: |
| F-09 | Las **compras anteriores sin categoría** las clasifica una persona (no se asume «material»). | ☐ Sí ☐ Corrección: |
| F-10 | En compras de material se captura *material, cantidad, unidad y costo unitario*; al recibir, el sistema **propone** actualizar el último costo y lo **confirma una persona autorizada**. | ☐ Sí ☐ Solo capturar los datos |
| F-11 | El **ajuste manual autorizado** del costo real se pospone. Si lo necesitan ahora: | ☐ Posponer ☐ Solo Administrador ☐ Puestos: |
| F-12 | **Cancelar una factura que ya tiene cobros aplicados:** | ☐ No se permite (primero revertir los cobros) ☐ Se permite (el cobro queda como saldo a favor) |
| F-13 | El **«flujo por cuenta»** dentro de Cobranza: | ☐ Se retira (se ve en Tesorería) ☐ Se queda como informativo y rotulado |
| F-14 | Al **reversar un cobro**, en Tesorería: | ☐ Desaparece el movimiento ☐ Se muestran el cobro y su reverso |

---

## Qué haremos con sus respuestas
Cada respuesta se aplica a la etapa indicada y se registra con fecha y autor. Lo que no se responda **no se desarrollará con una suposición**: esa parte quedará en espera hasta recibir su regla.
