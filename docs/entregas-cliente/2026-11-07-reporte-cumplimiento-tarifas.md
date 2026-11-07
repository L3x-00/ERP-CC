# Reporte de cumplimiento — ajustes de tarifas, equipos y ruteo

**Cliente:** CC Manufacturing  
**Fecha:** 07/11/2026  
**Tema:** configuración de equipos, tarifas del ruteo y vínculo con los procesos

---

## 1. Resumen

Se ajustó la forma de configurar los recursos para que una persona pueda dejar todo listo **sin conocer cómo está organizado el sistema por dentro**.

Ahora el flujo es uno solo:

1. Se crea el **grupo de equipo** con su tarifa estándar y sus procesos compatibles.
2. Se crea el **equipo** con su grupo y, si realmente aplica, su tarifa propia.
3. El sistema muestra desde antes de guardar **qué tarifa va a usar**.
4. Al costear una operación, se ve **la tarifa utilizada y de dónde salió**.

Con esto, el usuario ya no tiene que recordar una secuencia de pantallas ni visitar varios formularios para completar una configuración básica.

---

## 2. Qué cambió para el usuario

### Crear un grupo de equipo

En **Configuración → Tarifas / TC → Tarifario del ruteo**:

- Se captura el **nombre** y el **código** del grupo.
- Se captura su **tarifa estándar por hora**.
- Se pueden marcar los **procesos que usarán ese grupo** en el mismo formulario.
- Si se desea, se puede elegir una estación de Tarifas / TC para **copiar su valor**; la estación ya no cambia la tarifa del grupo por su cuenta.

El grupo queda listo y vinculado a sus procesos al guardar.

### Crear un equipo

En la misma sección, con **Nuevo equipo**:

- Se captura el **código** y el **nombre**.
- Se elige el **grupo de equipo** sin salir del formulario.
- El sistema muestra la **tarifa que heredará** del grupo.
- Se responde **¿Esta máquina tiene un costo distinto al grupo?**
  - **No:** usa la tarifa del grupo.
  - **Sí:** se captura su tarifa propia y el sistema explica que solo aplica a esa máquina.
- Se elige el área de trabajo y se guarda.

El equipo queda disponible de inmediato para trabajar.

### Costear una operación

En el ruteo de la propuesta, cada operación muestra:

- **La tarifa utilizada por hora.**
- **El origen:** tarifa del grupo o tarifa propia de la máquina.
- Si no hay tarifa configurada, una **advertencia visible** con la tarifa de respaldo utilizada y el grupo que necesita configurarse.

Antes de enviar una propuesta, la ficha muestra un aviso con las operaciones que quedaron con tarifa de respaldo, para que se corrijan a tiempo.

### Desactivar un equipo

Un equipo que deja de usarse se **desactiva**, no se borra. Conserva su historial y puede reactivarse después.

---

## 3. Criterios de aceptación

| Criterio solicitado | Resultado |
| --- | --- |
| Cada proceso usado en el ruteo puede resolver un grupo de equipo válido | **Cumplido.** El ruteo no permite guardar una operación sin grupo; el proceso puede vincularse desde el alta del grupo. |
| Cada grupo utilizado para costear tiene una tarifa estándar válida | **Cumplido.** El grupo es la fuente de la tarifa; si no está configurado, el sistema no inventa un costo y muestra la excepción. |
| Una máquina sin tarifa propia hereda la del grupo | **Cumplido.** El equipo muestra la tarifa heredada y la usa automáticamente. |
| Una máquina con tarifa propia sustituye la del grupo | **Cumplido.** Solo ocurre cuando se activa la excepción y se captura el valor. |
| El costo de respaldo genera una advertencia visible | **Cumplido.** Se muestra el valor utilizado, la palabra “Advertencia” y el grupo sin tarifa. |
| El ruteo muestra tarifa y origen de la tarifa | **Cumplido.** Cada operación muestra la tarifa por hora y su origen. |
| Nuevo equipo permite asignar grupo sin abandonar el formulario | **Cumplido.** El grupo se elige dentro del mismo formulario. |
| Nuevo equipo muestra la tarifa heredada antes de guardar | **Cumplido.** Se muestra al elegir el grupo, antes de crear el equipo. |
| No es obligatorio visitar varios formularios para una configuración básica | **Cumplido.** Grupo, tarifa, procesos y equipo se resuelven en la misma sección. |
| Los grupos planeados no son requisito para el costeo/ruteo | **Cumplido.** El grupo planeado es opcional y solo organiza la planeación; no define la tarifa. |

---

## 4. Ejemplo de uso

### Caso: Láser Fibra 01

1. Se crea el grupo **Láser Fibra** con tarifa de **$512.50/h** y se marca el proceso **Corte láser fibra**.
2. Se crea el equipo **Láser Fibra 01**, se elige el grupo **Láser Fibra** y el sistema muestra **Tarifa heredada: $512.50/h**.
3. Se responde **No** a la pregunta de costo distinto.
4. Al guardar, el equipo queda listo para usarse.
5. En una propuesta, la operación de corte muestra **$512.50/h · Tarifa del grupo**.
6. Si más adelante esa máquina tiene un costo distinto, se activa la excepción, se captura su tarifa y la operación muestra **Tarifa propia de la máquina**.

### Caso: grupo sin tarifa

Si un grupo no tiene tarifa estándar:

- El sistema muestra una **advertencia visible** con la tarifa de respaldo y el nombre del grupo.
- La propuesta conserva ese aviso antes de enviarse.
- Si no existe tarifa de respaldo, el sistema **bloquea el costeo** y dice exactamente qué configurar.

Nunca se costea una operación con un valor ambiguo sin avisar.

---

## 5. Validaciones y mensajes

Los formularios revisan la información antes de guardar:

- Códigos con formato válido.
- Nombre con al menos dos caracteres.
- Grupo obligatorio.
- Tarifas numéricas, no negativas y con máximo cuatro decimales.
- Avisos en rojo junto al campo que necesita corrección.
- Mensajes claros cuando falta un dato o cuando el sistema rechaza una operación.

El usuario no tiene que adivinar qué corregir.

---

## 6. Qué se evita con este ajuste

- Tener dos tarifas distintas para el mismo grupo sin saber cuál se usa.
- Costear con una tarifa de respaldo sin darse cuenta.
- Crear un equipo y descubrir después que le falta el grupo o la tarifa.
- Obligar a configurar “Grupo planeado” para poder costear.
- Saltar entre catálogos, tarifas y equipos para completar una configuración básica.

---

## 7. Resultado

El sistema ahora guía al usuario:

- Crea el grupo con su tarifa y sus procesos.
- Crea el equipo con su grupo y ve la tarifa que heredará.
- Solo pide una tarifa propia cuando realmente aplica.
- Deja el recurso utilizable al guardar.
- Muestra la tarifa y su origen al costear.
- Advierte cualquier tarifa de respaldo antes de enviar la propuesta.

**Los ajustes solicitados quedaron implementados y disponibles.**
