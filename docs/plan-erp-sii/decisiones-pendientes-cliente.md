# Cuestionario de decisiones — ERP SII / CC

**Para:** dueño del software (cliente).
**Objetivo:** definir únicamente los puntos que **el documento `ERP_SII_Handoff_Tecnico_Funcional.md` no especifica** y que son necesarios para no inventar reglas de negocio.

## Instrucciones

1. Responda **solo las preguntas donde quiera cambiar la opción propuesta**; si deja una en blanco, se implementa la opción marcada como *Default*.
2. No hace falta responder sobre lo que el documento ya define. Por ejemplo, ya está resuelto: formatos de folio (`RFQ-MMYY_XX`, `CNC-MMYY_XX-A`, `O-MMYY_XX`, `NE-MMYY_XX-YY`, `CLI-####`, `ITxx`), los estados de RFQ/Propuesta/Orden, que una revisión ENVIADA se congela, que hay que crear nueva revisión con motivo, que el PDF se genera solo para revisión lista para enviar, que una orden nace de la revisión aceptada y que no se elimina historial.
3. Cada pregunta indica **en qué bloque de desarrollo se usa** para saber su urgencia.
4. Al final hay un espacio para comentarios abiertos.

---

### 1. Permisos para editar precios

**Por qué se pregunta:** el documento exige permisos por acción (menciona `PROPUESTA_EDITAR_PRECIO`) pero no dice qué rol lo tiene.
**Opciones:**
- A) El vendedor (Customer Service) edita artículos, precios y ruteo; costo y margen solo Management/Admin. **(Default)**
- B) Solo Management/Admin editan precios; el vendedor solo captura artículos.
- C) Otro: __________
**Bloque:** B1/B4. **Respuesta:** ______

### 2. Quién puede ver el costo interno y el margen

**Por qué se pregunta:** el documento dice que el PDF excluye costo/margen, pero no define quién los ve en pantalla.
**Opciones:**
- A) Solo Management y Admin. **(Default)**
- B) Management, Admin y Administrative (contador).
- C) Otro: __________
**Bloque:** B1/B4. **Respuesta:** ______

### 3. Órdenes internas (TI, folio `OI-MMYY_XX`)

**Por qué se pregunta:** el documento define el folio `OI-` pero no describe su proceso.
**Opciones:**
- A) Mismo flujo completo: propuesta → revisión aceptada → orden interna. **(Default)**
- B) Alta directa de orden interna sin propuesta (solo con autorización).
- C) Otro: __________
**Bloque:** B5. **Respuesta:** ______

### 4. Archivos técnicos mínimos para marcar un RFQ como LISTO

**Por qué se pregunta:** el documento pide "archivos técnicos requeridos" pero no define cuáles ni cuántos.
**Opciones:**
- A) Al menos un archivo técnico (CAD, Dibujo o Especificaciones), general o por ítem. **(Default)**
- B) Depende del tipo de trabajo; que sea configurable por proceso (se permite marcar listo sin archivo si el proceso no lo exige).
- C) No obligatorio; solo recomendado.
**Bloque:** B3. **Respuesta:** ______

### 5. Primera pieza: ¿en qué procesos se exige liberarla?

**Por qué se pregunta:** el documento dice "cuando aplique" sin listar procesos.
**Opciones:** marque los procesos que exigen primera pieza:
- [ ] Láser fibra  - [ ] Láser CO₂  - [ ] Doblado CNC  - [ ] Soldadura
- [ ] CNC Router  - [ ] Marcado láser  - [ ] Maquinado/Fabricación  - [ ] Acabado
- A) Que sea configurable por proceso y se active según su respuesta de arriba. **(Default: configurable, solo los que marque)**
**Bloque:** B6. **Respuesta:** ______

### 6. Inspección de lotes grandes: ¿cada 10 o cada 20 piezas?

**Por qué se pregunta:** el documento dice "cada 10 o 20 según cliente/proceso", pero los perfiles por cliente quedaron para fase posterior.
**Opciones:**
- A) Configurable por proceso (cada proceso define 10 o 20). **(Default)**
- B) Por cantidad del lote: hasta 100 piezas cada 10; más de 100 cada 20.
- C) Otro: __________
**Bloque:** B6. **Respuesta:** ______

### 7. Pausa por material/aclaración mayor a 1 hora: ¿quién libera la máquina?

**Por qué se pregunta:** el documento dice "puede liberar máquina" (no dice si es automático o requiere autorización).
**Opciones:**
- A) Automático al reclamar el recurso, con registro de quién lo tomó y cuándo. **(Default)**
- B) Requiere autorización de un supervisor cada vez.
- C) Otro: __________
**Bloque:** B6. **Respuesta:** ______

### 8. Horas extra: umbral y autorizador

**Por qué se pregunta:** el documento exige autorización, sin definir límite ni rol.
**Opciones:**
- A) Se consideran extra al exceder la jornada del turno (estándar 8 h) y las autoriza Management/Admin. **(Default)**
- B) Otro umbral: ______ h; autoriza: __________
**Bloque:** B6. **Respuesta:** ______

### 9. Cierre administrativo de la orden

**Por qué se pregunta:** el documento pide separar el cierre de producción del cierre administrativo, sin definir la condición del segundo.
**Opciones:**
- A) Se puede cerrar cuando el 100 % de las cantidades fue entregado. **(Default)**
- B) Se puede cerrar desde "Producción Completada" en cualquier momento, con motivo obligatorio (aunque falten entregas).
- C) Solo cuando la cuenta por cobrar esté totalmente pagada.
- D) Otro: __________
**Bloque:** B5. **Respuesta:** ______

### 10. Entrega: ¿firma y evidencia son obligatorias?

**Por qué se pregunta:** el documento dice "evidencia fotográfica y firma digital cuando aplique", sin definir cuándo aplica.
**Opciones:**
- A) Opcionales con recordatorio; se podrá exigir por cliente en una fase posterior. **(Default)**
- B) Obligatorias en toda entrega (foto + firma).
- C) Obligatorias solo cuando el cliente sea industrial.
- D) Otro: __________
**Bloque:** B7. **Respuesta:** ______

### 11. Margen mínimo

**Por qué se pregunta:** el documento dice que el margen es "independiente de un mínimo de margen aún no definido".
**Opciones:**
- A) Sin mínimo por ahora (no bloquea nada). **(Default)**
- B) Definir ahora un mínimo configurable; si una propuesta queda por debajo, exige autorización de Management.
- C) Definir ahora mínimo fijo de: ______ %
**Bloque:** B4. **Respuesta:** ______

---

## Comentarios abiertos (opcional)

¿Algo del documento que quiera precisar, agregar o corregir antes de empezar?

```
____________________________________________________________________________
____________________________________________________________________________
____________________________________________________________________________
```

---

**Nota para el equipo:** las respuestas se registran como decisión en `docs/plan-erp-sii/09-estrategia-y-kpis.md` (anexo) y, cuando cambien una regla del documento, se actualiza primero la especificación funcional y después el sistema (§23 del documento del cliente).
