# Manual de pruebas y resumen para el cliente — 2026-11-04

Cubre las cinco entregas de esta ronda:

| PR | Alcance | Estado |
| --- | --- | --- |
| #144 | Observaciones previas: Facturación retirada, impresión de la orden, reclamo de fechas, archivos/comentarios del operador, calidad, horas extra y multisesión | Fusionado |
| #145 | C13.1 Cierre del operador colapsable y primera pieza accionable | Listo para fusionar |
| #146 | C13.2 Retrabajo con material, tiempo y causa | Listo para fusionar |
| #147 | C13.3 Material del cliente con saldo y bloqueo | Listo para fusionar |
| #149 | C13.4 Corrida integrada con avance y tiempos por ítem | Listo para fusionar |

## 1. Antes de probar

1. Traer la rama y levantar el stack local:
   - `git fetch origin`
   - `supabase start`
   - `supabase migration up --local --include-all` (aplica C13.2 y C13.3; C13.1 no trae migración)
   - `pnpm dev`
2. Aplicar en remoto, en este orden y junto con el despliegue, cuando el PO lo decida:
   - `20261104100000_c13_2_retrabajos_produccion.sql`
   - `20261104100100_c13_2_lectura_retrabajos.sql`
   - `20261104110000_c13_3_material_cliente.sql`
3. Datos mínimos: una orden en proceso con partida programada en preparación, material del catálogo con stock, un operador con PIN y, para C13.3, una propuesta en borrador con ítems.
4. Roles: administrador para paneles y propuesta; operador para piso.

## 2. Pruebas por entrega

### #144 — Observaciones previas

**Facturación retirada**
- La barra lateral no muestra «Facturación».
- Abrir `/facturacion` redirige a `/cobranza`.
- Una entrega ya no muestra «Facturar entrega».
- Cobranza, CxC y pagos siguen funcionando.

**Impresión de la orden**
- Órdenes → abrir una orden → «Imprimir orden».
- La vista previa muestra solo la orden, con logo, color de acento y pie de la empresa.

**Reclamo de fechas**
- Operador → `/produccion-piso` → detalle del proceso → «Día de la jornada» con una fecha anterior al compromiso → «Reclamar».
- Se acepta sin doble registro.

**Archivos y comentarios**
- En la ficha del operador, «Planos y archivos» abre/descarga el adjunto de RFQ/propuesta con enlace firmado.
- Un comentario del admin en la orden aparece como «Comentarios de la orden» en la ficha del operador.

**Calidad**
- Admin: Producción → seleccionar orden → «Calidad» es solo lectura y cada inspección abre «Ver resumen».
- Operador: al cerrar, marca «Registrar inspección de cierre», elige resultado y observaciones; el resumen confirma el registro.

**Horas extra**
- Con una sesión que excede la jornada, el cierre avisa y deja la solicitud pendiente.
- Admin: Producción → «Horas extra» muestra «Pendiente de aprobación» con Aprobar/Desaprobar.
- Aprobar permite cerrar; desaprobar la rechaza.
- Para forzar el escenario en local: `update sesiones_trabajo set fecha_inicio = now() - interval '10 hours' where id = '<sesión>';`

**Procesos simultáneos**
- Con dos programaciones en preparación del mismo operador, iniciar una y luego la otra sin cerrar la primera: ambas quedan activas.
- Producir 10 de 24 en el primer proceso y verificar que el siguiente puede arrancar con esas 10.

### #145 — C13.1 Cierre del operador

- Operador → `/operador/mi-panel` → «Gestionar proceso» de un proceso con sesión activa.
- «Cerrar la sesión en marcha» aparece cerrado; al abrirlo se despliega con animación.
- Hay **un solo** bloque «Consumo de material» y el material del ítem viene preseleccionado.
- Si la corrida exige primera pieza y no está aprobada, se ve el **aviso naranja** con «Liberar primera pieza».
- Al intentar cerrar sin liberarla, se abre un **modal** con los pasos; al liberar, el cierre se reintenta solo con lo capturado.
- El campo PIN sigue presente.

### #146 — C13.2 Retrabajo

- En el cierre, marcar «Registrar retrabajo»: se despliegan material, usado, merma, minutos, causa, motivo y notas.
- Al finalizar, el resumen confirma «Retrabajo registrado…».
- Verificar en base: el stock del material baja por usado + merma; el avance del ítem no cambia.
- Admin: Producción → «Retrabajos» lista pieza, material, cantidades, minutos, causa, motivo y autor.
- Validaciones: sin minutos o sin motivo no deja cerrar; un consumidor ajeno no puede registrarlo.

### #147 — C13.3 Material del cliente

- Propuesta → Ruteo/Costeo → «Material del cliente»: elegir ítem, material del catálogo y cantidad → «Agregar».
- Solo se edita en revisión en borrador; en revisiones cerradas se ve en solo lectura.
- Operador → ficha del proceso: bloque «Material del cliente» con declarado, consumido y saldo.
- Al cerrar, marcar «Registrar consumo de material del cliente» e indicar usado/merma: el saldo baja.
- Si la cantidad excede el saldo, el cierre se bloquea con el mensaje de saldo.
- Botón «Pausar por falta de material del cliente»: cambia el resultado a pausa, selecciona el motivo de material y deja la nota lista para completar.
- Admin: Producción → «Material del cliente» muestra declarado, consumido y saldo por partida.
- Verificar que el costo de la orden y el inventario propio **no cambian**.

### #149 — C13.4 Corrida integrada

- En una corrida con más de un ítem, al finalizar la sesión aparece «Los ítems se trabajaron juntos».
- Al marcarla se capturan **piezas y minutos por ítem**; la suma de minutos no debe exceder la sesión.
- Al cerrar, cada ítem registra su avance y sus minutos en una sola transacción; si algo falla no queda avance parcial.
- Admin: Producción → «Corridas integradas» muestra la sesión, el operador y el avance/tiempo por ítem.
- Validaciones: ítem ajeno a la corrida, ítem principal ausente y minutos excedidos se rechazan.

## 3. Resumen para enviar al cliente

> Hola. Ya están implementadas y disponibles para revisión las mejoras de esta ronda:
>
> 1. **Facturación** quedó retirada del menú; los enlaces antiguos llevan a Cobranza, que conserva cuentas por cobrar y pagos.
> 2. La **orden se imprime** como documento formal, con el logo, color y pie de página de la empresa, no como captura de pantalla.
> 3. El operador puede **reclamar una fecha anterior** al compromiso sin duplicar registros.
> 4. El operador ve y **descarga los archivos de la propuesta** y los **comentarios** que administración deja en la orden.
> 5. La **inspección de calidad** ya no la captura el administrador: la registra el operador al liberar la primera pieza y al cerrar, y el administrador la consulta con un resumen.
> 6. Las **horas extra** se solicitan solas cuando el cierre excede la jornada; administración solo aprueba o desaprueba.
> 7. Un operador puede **trabajar varios procesos a la vez** cuando el proceso anterior ya dejó piezas disponibles.
> 8. El **cierre de sesión** es más compacto: inicia cerrado, usa un solo formulario de consumo, preselecciona el material y resuelve la primera pieza con un aviso y un cuadro de diálogo, sin perder lo capturado.
> 9. El operador puede declarar **retrabajos** con material, tiempo y causa; administración los ve en Producción y el avance del ítem no se altera.
> 10. Si el **material lo pone el cliente**, se declara por ítem en la propuesta; Producción descuenta el saldo real, avisa cuando no alcanza y permite pausar por falta de material sin afectar inventario ni costo propio.
> 11. Si varios ítems comparten material y proceso, el operador puede marcarlos como **corrida integrada**, declarar piezas y minutos de cada uno y administración ve el avance individual.
>
> **Cómo probarlo:** entrar como administrador para propuesta, calidad, horas extra, retrabajos, material del cliente y corridas integradas; entrar como operador con su PIN para reclamo, archivos, comentarios, cierre, retrabajo, consumo del cliente y corrida integrada. Cada punto de la lista se prueba en la pantalla indicada y debe mostrar el resultado descrito.

## 4. Pendiente informado

- La inspección no adjunta foto de evidencia (el formulario retirado era el
  único que la capturaba); si se requiere, se agrega al diálogo del operador.
- En una corrida integrada el material se imputa una vez a la partida
  principal; el costo no se reparte entre ítems.
