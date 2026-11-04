# Preguntas al cliente / decisiones del PO — Producción 2026-11-04

Solo se listan decisiones que la nota no resuelve y que cambian el diseño. Cada una bloquea una tanda.

## Q1. ¿Cómo se declara el material del cliente en Propuesta? (bloquea C13.3)

Hoy “Costeo interno → Material” es un **monto en dinero** para el costo estimado; no dice quién puso el material ni cuánto hay.

- **A (recomendada):** bloque nuevo “Material del cliente” por ítem en Ruteo/Costeo: material del catálogo + cantidad + unidad. El monto de costeo interno se conserva como está.
- **B:** reinterpretar “Costeo interno → Material” como material del cliente y añadir cantidad. Cambia el significado del dato y de los históricos.
- **C:** marcar la orden completa como “material del cliente”, sin detalle por ítem.

Con A el sistema puede descontar saldo y avisar faltantes; con C no hay control por ítem. Con B se mezcla costo con cantidad.

## Q2. ¿El material del cliente se controla con el catálogo de materiales? (bloquea C13.3)

- **A (recomendada):** sí, mismo catálogo; así se compara contra el consumo real y se descuenta el saldo.
- **B:** texto libre por ítem (no hay saldo ni descuento automático).

## Q3. ¿Qué pasa exactamente cuando el material del cliente no alcanza? (bloquea C13.3)

- **A (recomendada):** el cierre se bloquea si el consumo declarado supera el saldo; se ofrece “Pausar por falta de material” con causa (el cliente no entregó suficiente / error del operador). No se crea deuda ni se descuenta inventario propio.
- **B:** permitir cerrar con saldo negativo y solo marcarlo para revisión.
- **C:** pausa siempre manual, sin bloqueo.

También falta definir si el **operador** puede corregir el consumo declarado después de cerrar (se propone que no: se pausa y administración ajusta).

## Q4. ¿El retrabajo consume y costea material propio? (bloquea C13.2)

- **A (recomendada):** sí, descuenta inventario propio y suma su costo al costo real de la orden; el material del cliente se descuenta aparte.
- **B:** solo registro operativo (tiempo/material informativo), sin inventario ni costo.

Falta definir si el retrabajo requiere **aprobación** del administrador o solo queda registrado para control (se propone solo registro).

## Q5. ¿Cómo se captura el tiempo por ítem en la corrida integrada? (bloquea C13.4)

- **A (recomendada):** minutos declarados por ítem al cerrar, con validación de que la suma no exceda el tiempo de la sesión; se guarda hora de inicio/fin calculada.
- **B:** cronómetro por ítem (iniciar/detener por ítem) durante la sesión.
- **C:** solo inicio/fin declarado por ítem sin validar contra la sesión.

Con A el operador no depende de recordar pulsar botones; con B hay más precisión pero más clics y más estados.

## Q6. ¿Dónde se marca la integración de ítems? (bloquea C13.4)

- **A (recomendada, según la nota):** el operador marca la casilla al iniciar/gestionar el proceso.
- **B:** Planeación decide al crear la corrida.
- **C:** ambos, con la marca de Planeación por defecto y el operador confirmando.

## Q7. ¿Se elimina el PIN del cierre de sesión? (bloquea C13.1)

El PIN es la única prueba de que el operador está presente cuando la pantalla se usa desde una sesión delegada de administrador. Sin PIN, cualquier persona con esa pantalla abierta puede cerrar la sesión de otro operador.

- **A (recomendada):** quitarlo **solo** del cierre propio cuando el operador inició sesión con su PIN (cookie HMAC vigente), y mantenerlo para cierres desde vista delegada de administrador.
- **B:** quitarlo siempre, aceptando el riesgo.
- **C:** mantenerlo como está.

## Q8. ¿La inspección de calidad vuelve a permitir foto de evidencia?

El formulario retirado en la tanda anterior era el único que adjuntaba foto. Hoy quedan resultado y observaciones.

- **A (recomendada):** agregar foto opcional al diálogo del operador (primera pieza y cierre).
- **B:** dejarlo sin foto.
