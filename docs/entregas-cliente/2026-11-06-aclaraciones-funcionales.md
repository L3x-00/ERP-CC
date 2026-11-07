# Respuesta a las aclaraciones funcionales del ERP
**Cliente:** CC Manufacturing  
**Documento base:** Aclaraciones funcionales del ERP — versión 06/11/2026  
**Fecha de respuesta:** 07/11/2026  
**Alcance:** órdenes, corridas de producción, costos reales, materiales, calidad y entregas  

---

## 1. Resumen ejecutivo

Se atendieron las seis decisiones funcionales y las nueve pruebas de aceptación del documento. Los cambios se concentraron en cuatro frentes:

1. **Consumo real de materiales** con material, cantidad, costo, corrida u operación, fecha y motivo, registrado una sola vez.
2. **Cierre de operaciones sin material** cuando la ruta no lo exige, sin inventar consumos para servicios con material del cliente.
3. **Corrida compartida** con consumo y tiempo registrados una vez a nivel de corrida, sin prorrateo obligatorio por ítem.
4. **Recosteo controlado** para sustituir el costo provisional por el comprobado, sin duplicar el consumo y con auditoría.

Adicionalmente se retiró del ERP cualquier pantalla o cálculo de **existencias, kardex o saldos físicos**, y se conservaron las reglas de **entregas parciales**, **anulación auditada de notas** y **retrabajo simplificado**.

**Resultado:** las nueve pruebas de aceptación del documento quedan cumplidas. No se agregaron funciones fuera de alcance.

---

## 2. Correcciones y ajustes realizados

### 2.1 Modelo operativo: una orden, varios ítems

- Se conserva **una sola orden principal** con un folio y uno o varios ítems `ITxx`.
- Cada ítem mantiene su cantidad, avance, calidad y ruta.
- Una corrida puede agrupar varias operaciones/ítems compatibles de la misma orden.
- No se crea una orden nueva por cada ítem.

### 2.2 Materiales: catálogo, precio y consumo real (sin inventario)

- El módulo de materiales conserva **descripción, unidad, precio de referencia e historial de precios**.
- El consumo real registra: **material, cantidad, costo congelado, corrida u operación, fecha y motivo**.
- El consumo se registra **una sola vez**.
- **No** se administran existencias físicas, reservas, ubicaciones, kardex, compras de almacén ni descuentos automáticos de stock.
- Se retiró la subpestaña **Existencias** del módulo de materiales. Las tablas históricas no se destruyen; simplemente dejan de exponerse y no participan en cálculos.

### 2.3 Sustitución de costo provisional por costo comprobado

- Administración puede **revaluar** el costo de los consumos y retrabajos ya registrados.
- La revaluación **actualiza el costo congelado existente**; no crea un segundo consumo ni suma dos veces el importe.
- Exige **motivo obligatorio** y permiso de administración.
- Cada revaluación deja **auditoría append-only** con costo anterior, costo nuevo, importe anterior e importe nuevo por registro.
- El reintento es **idempotente**: repetir la misma solicitud no duplica la auditoría ni el ajuste.

**Ejemplo del documento:** dos hojas a $850 cada una = $1,700 provisional. Si la compra real fue $1,760, el sistema corrige el costo asociado a **$1,760**, nunca a $3,460.

### 2.4 Procesos sin consumo de material

- Se permite **cerrar operaciones sin material** cuando el ruteo/costeo no lo requiere.
- Si la ruta sí exige material propio, el sistema solicita la captura correspondiente.
- Si una pieza se daña, se registra **scrap, material adicional y tiempo extra con causa**, asociados a la misma orden/ítem.
- Para servicios con material aportado por el cliente **no se inventa un consumo**.

### 2.5 Defectos y retrabajo simplificado

- Defecto recuperable: actividad de **retrabajo** ligada al mismo ítem y orden, con tiempo, material extra, responsable y resultado.
- Defecto irrecuperable: se registra **scrap**.
- No se crea una nueva orden comercial ni un módulo avanzado de órdenes de retrabajo.
- Las piezas corregidas **solo cuentan como conformes después de su validación**.

### 2.6 Corrida compartida: consumo y tiempo una sola vez

- En una corrida compartida se registra el **consumo total una vez** a nivel de corrida.
- El costo se acumula **una sola vez** a la orden.
- Se registra el **100% del tiempo real a nivel de corrida**, sin obligación de repartirlo entre los ítems para poder cerrar.
- No se inventan porcentajes ni superficies individuales.
- En operaciones individuales, como doblado pieza por pieza, **sí se registra tiempo y costo por ítem**.

### 2.7 Setup identificable

- Cuando aplica, se identifican los **minutos de setup** dentro del tiempo real de la sesión.
- El setup **no se suma otra vez** al costo: ya está incluido en el tiempo real de la sesión.
- Si el setup es compartido y no se puede atribuir razonablemente, queda como costo de la operación/corrida común, **sin duplicarse**.

### 2.8 Entregas parciales y anulación de notas

- Se conservan las **entregas parciales** por ítem.
- Cerrar producción **no equivale** a cerrar administrativamente la orden.
- Solo un **administrador** puede anular una nota de entrega.
- La anulación exige **motivo obligatorio, fecha, usuario y auditoría**.
- La nota **no se borra**: queda marcada como **ANULADA**, se revierten las cantidades documentales y se vincula la nota sustituta cuando aplica.

---

## 3. Cómo se resolvieron los escenarios del documento

### Escenario A — Dos ítems de corte láser en una lámina

| Dato | Registro en el ERP |
|---|---|
| Orden | `O-1126_01`, un único folio |
| Ítems | IT01: 40 piezas A; IT02: 20 piezas B |
| Corrida | C01, vincula IT01 + IT02 |
| Material real | 1 hoja de acero a $900, **un solo consumo** |
| Tiempo real | 90 minutos de corrida total, sin repartir 60/30 |
| Resultado | 40 A y 20 B conformes, con cantidades individualizadas por ítem |
| Costo interno | Máquina: 1.5 h × $512.50 = $768.75; material $900; costo base C01 = **$1,668.75** |
| Rentabilidad | El costo C01 se suma **una sola vez** a los costos reales de la orden |

**Lo que el sistema evita:** otra orden para IT02, duplicar la lámina o contabilizar 90 minutos en cada ítem.

### Escenario B — Doblado con tiempo identificable por ítem

- IT01 trabaja 35 minutos y IT02 trabaja 25 minutos, en sesiones separadas.
- A la tarifa interna ilustrativa de $512.50/h:
  - IT01 = **$298.96**
  - IT02 = **$213.54**
  - Total de máquina = **$512.50**
- El costo se atribuye al ítem porque el tiempo es identificable y se consolida también a la orden.
- Si hay setup compartido, se identifica dentro del tiempo real y **no se duplica**.
- Las pausas se distinguen del tiempo efectivo costeable.

### Escenario C — Servicio sin aporte de materia prima

- El cliente entrega 30 piezas ya cortadas; se doblan en 45 minutos.
- Se registran **30 piezas conformes, 45 minutos y cero material propio**.
- **Se permite el cierre** sin consumo.
- Si el proceso daña piezas, se registra la incidencia y su disposición, **sin consumo ficticio**.

### Escenario D — Retrabajo y reposición

- IT01 requiere 100 piezas conformes.
- Se producen 100: **4 recuperables** y **2 irrecuperables**.
- Se registra retrabajo para las 4, con tiempo, material y responsable.
- Si se reponen las 2, se registra material y tiempo adicionales **dentro del mismo ítem/orden**.
- Las piezas recuperadas **no aumentan los conformes hasta aprobar la inspección**.

### Escenario E — Entrega parcial con nota anulada

- De IT01 se entregan 60 de 100 con una nota de entrega.
- Si la nota se emitió por error, **solo administración** puede anularla con causa.
- La nota queda **visible como ANULADA**, el saldo documental se corrige y la nueva nota se **vincula a la anulada**.
- No se borra evidencia ni se pierde trazabilidad.

---

## 4. Pruebas de aceptación del cliente

| # | Criterio del documento | Resultado |
|---|---|---|
| 1 | Una orden con tres ítems conserva un solo folio, con avances y cantidades por ítem | **Cumplido** |
| 2 | Una corrida láser permite dos ítems y cierre sin distribuir los 90 minutos | **Cumplido** |
| 3 | Una lámina compartida se consume una vez; costo y tiempo se reflejan una vez en la orden | **Cumplido** |
| 4 | Una dobladora registra tiempo real por ítem, sin duplicar setups compartidos | **Cumplido** |
| 5 | La orden consolida costos compartidos e individuales, incluidos scrap, reposiciones y retrabajos | **Cumplido** |
| 6 | Una operación sin material puede finalizar cuando el ruteo no lo exige | **Cumplido** |
| 7 | Solo un administrador anula notas de entrega, conservando evidencia y trazabilidad | **Cumplido** |
| 8 | No existen pantallas o cálculos de existencias, kardex ni saldos físicos administrados | **Cumplido** |
| 9 | Cerrar producción no equivale a cerrar administrativamente la orden; existen entregas parciales | **Cumplido** |

**Resultado global: 9 de 9 pruebas de aceptación cumplidas.**

---

## 5. Reglas de consolidación de rentabilidad

El costo real total de la orden se calcula como:

> **Costos de corridas compartidas + costos de operaciones individuales + materiales y procesos externos no contabilizados previamente + retrabajos y reposiciones + otros costos aplicables.**

Reglas aplicadas:

- Cada evento/costo se suma **una sola vez**.
- La **utilidad de la orden** = venta neta de la orden − costo real total.
- La **rentabilidad global de la orden** es la referencia obligatoria.
- El análisis por ítem solo se muestra cuando existen registros identificables.
- Nunca se inventan costos de corridas compartidas ni se prorratean automáticamente.

---

## 6. Fuera de alcance respetado

No se desarrolló:

- Reparto automático de tiempos o materiales de nesting por ítem.
- Rentabilidad completa por ítem para procesos compartidos.
- Inventario formal, kardex o saldos físicos.
- Órdenes principales de retrabajo.
- Agrupación de órdenes distintas en una corrida.
- Planeación avanzada.
- Cualquier distribución de costos no solicitada de forma explícita.

Si en el futuro se requiere distribuir costos para análisis, será una función separada y explícita, sin alterar el consumo físico ni los tiempos reales históricos.

---

## 7. Verificación técnica realizada

- **Pruebas de base de datos (pgTAP):** suite completa en verde, incluida una prueba específica de consumo, setup y recosteo con **26 aserciones**.
- **Pruebas unitarias:** **295 archivos / 2,502 pruebas**, todas en verde.
- **Pruebas de integración:** **40 archivos / 302 pruebas**, todas en verde.
- **Pruebas E2E de navegador:** pipeline `e2e-local` en verde.
- **Verificación de tipos, lint y build:** sin errores.
- **Migraciones aplicadas y verificadas en el proyecto remoto:** historial reconciliado y objetos nuevos confirmados (consumo con motivo, setup, recosteo y auditoría).

---

## 8. Estado de entrega

- Los cambios están organizados en **siete bloques** (B1 a B7), **fusionados en `main`**.
- Las migraciones están **aplicadas y verificadas en el entorno remoto**.
- El código quedó alineado con la base de datos y el proyecto principal quedó limpio, sin worktrees adicionales.

Orden de fusión aplicado:

1. **B1** — Reconciliación del esquema remoto
2. **B5** — Costos y finanzas
3. **B2** — Producción y calidad
4. **B4** — Corridas integradas
5. **B3** — Órdenes y entregas
6. **B6** — Fechas, Realtime y seguridad
7. **B7** — Consumo con motivo, recosteo y setup

> Se resolvieron los conflictos de B3 con los cambios de B2/B4 y se actualizó B7 sobre B6 antes de fusionarlo.

---

## 9. Conclusión

El ERP queda alineado con las aclaraciones del 06/11/2026:

- Una orden y varios ítems, sin duplicar órdenes.
- Consumo real una sola vez, con motivo y trazabilidad.
- Corridas compartidas sin prorrateo obligatorio.
- Operaciones individuales con tiempo y costo identificables.
- Setup identificado sin doble costo.
- Recosteo provisional → comprobado sin duplicar consumos.
- Sin inventario físico, kardex ni saldos administrados.
- Entregas parciales y anulación auditada.
- Rentabilidad consolidada por orden como referencia.

**Entrega cerrada: cambios fusionados en `main` y migraciones aplicadas en remoto.**
