# Reporte de cumplimiento — ruteo y costeo: mensajes claros y tiempos válidos

**Cliente:** CC Manufacturing  
**Fecha:** 09/11/2026  
**Tema:** ruteo, costeo y avisos para el usuario final

---

## 1. Resumen

Cuando una propuesta no se podía costear o validar, la pantalla no siempre explicaba el motivo y, en un caso, mostraba dos mensajes que se contradecían. Además, se podía guardar una operación con **0 horas**, lo que producía un costo de cero sin avisar.

Ahora la pantalla:

1. Dice **por qué** no se puede continuar antes de que el usuario lo intente.
2. Indica **exactamente dónde** se corrige, con un enlace directo.
3. Marca en **rojo** el dato que falta o está mal.
4. Nunca muestra «Ruteo guardado» junto a «falta costear».
5. Impide guardar una operación con 0 horas.

---

## 2. Qué cambió para el usuario

### Ruteo de cada ítem

- La etiqueta de estado ya no es contradictoria:
  - **Verde:** «Ruteo guardado y costeado».
  - **Ámbar:** «Ruteo guardado · falta costear».
  - Si hay cambios sin guardar, se indica claramente qué botón pulsar.
- Cuando falta costear, el mensaje explica **qué hacer** y, si el problema es la
  tarifa, ofrece el enlace **Abrir Tarifas / TC**.
- Las horas de **Preparación** y **Operación** se validan al capturar:
  - La preparación puede ser 0 cuando no aplica.
  - La operación siempre debe ser mayor que 0, porque es el tiempo que genera
    el costo.
  - El campo incorrecto se marca en rojo con el motivo debajo.
- Si la tarifa no está configurada, la fila lo dice y ofrece un enlace directo
  para configurarla.

### Aviso de configuración pendiente

Antes de costear, la pantalla muestra un aviso con lo que falta y dónde se
resuelve:

- **Tarifas por hora** → Configuración → Tarifas / TC.
- **Materiales o espesores** → Configuración → Catálogos base.
- **Áreas de trabajo** → Configuración → Áreas de trabajo.
- **Procesos sin grupo de equipo** → Configuración → Catálogos base.

El aviso es informativo: permite guardar el ruteo y explica que, hasta resolver
esos puntos, el costo no será confiable.

### Material del cliente

Si no hay materiales activos en el catálogo, la sección lo avisa y enlaza
directo a **Catálogos base**, en lugar de mostrar una lista vacía sin
explicación.

### Fecha compromiso al aceptar

- La fecha no puede ser **anterior a hoy**.
- El campo se marca en rojo y el botón **Aceptar revisión** se bloquea hasta
  corregirla.
- El mensaje indica la fecha de hoy para evitar confusiones.

### Validar la propuesta

- El aviso dice **«Todavía no puedes validar: falta lo siguiente»** y aclara que
  no se perdió el trabajo.
- Cada faltante tiene su atajo (**Ítems**, **Ruteo/Costeo**, **Archivos**) y,
  cuando corresponde, un enlace directo a la configuración necesaria.

---

## 3. Criterios solicitados y resultado

| Solicitud | Resultado |
| --- | --- |
| Explicar primero por qué no puede continuar | **Cumplido.** Cada bloqueo muestra el motivo antes de intentar la acción. |
| Indicar por qué salen las observaciones | **Cumplido.** Los avisos describen el dato que falta y su efecto en el costo. |
| Ofrecer opciones de resolución | **Cumplido.** Atajos a la pestaña correcta y enlaces a la configuración exacta. |
| Eliminar la contradicción «Ruteo guardado» + «falta costear» | **Cumplido.** El estado ahora es verde solo cuando está guardado y costeado; si falta costear, es ámbar. |
| No permitir 0 en las horas | **Cumplido.** La operación exige un número mayor que 0; el sistema también lo rechaza al guardar. |
| Avisar si falta tarifa, materiales o área de trabajo | **Cumplido.** Aviso de configuración pendiente con enlaces directos. |
| Validación en rojo y colores representativos | **Cumplido.** Campos inválidos con borde rojo, mensaje debajo y `aria-invalid`. |
| No permitir fechas anteriores | **Cumplido.** La fecha compromiso se valida contra hoy y bloquea la aceptación. |
| Lenguaje sencillo y buenas prácticas de usabilidad | **Cumplido.** Mensajes en segunda persona, acciones concretas y enlaces visibles. |

---

## 4. Cómo comprobarlo

1. Abrir una propuesta en borrador y entrar a **Ruteo/Costeo**.
2. Escribir **0** en Operación de una fila y pulsar **Guardar ruteo**:
   el campo se marca en rojo y no se guarda.
3. Corregir el tiempo y guardar: la etiqueta cambia a ámbar «falta costear».
4. Pulsar **Costear ruteo**: la etiqueta cambia a verde «guardado y costeado».
5. Quitar la tarifa de un grupo (o elegir un grupo sin tarifa) y volver al
   ruteo: aparece el aviso con el enlace **Abrir Tarifas / TC**.
6. En **Aceptar revisión**, elegir una fecha anterior a hoy: el campo se marca
   en rojo y el botón queda bloqueado.

---

## 5. Nota

No se eliminó ni se borró ningún dato existente. Las propuestas ya guardadas
conservan su historial; la validación aplica al guardar o costear de nuevo.
