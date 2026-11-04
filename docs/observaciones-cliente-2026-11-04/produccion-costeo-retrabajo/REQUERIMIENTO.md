# Requerimiento — Producción: corrida integrada, material del cliente y retrabajo (nota del cliente, 2026-11-04)

> Fase: **requerimiento normalizado** (aún sin investigar el código a fondo ni tocar nada). Mismo método que Órdenes (C8), Planeación (C9) y Finanzas (C10): requerimiento → estado real verificado → cambio mínimo → impacto entre módulos → plan en tandas → el PO aprueba → ejecución.
> Regla del PO: ajustar, no rehacer; coherencia con los planes existentes; lo que la nota no define se pregunta.
> Escrito para: el PO.

## 1. Lectura del cliente

Tres temas, en este orden de dependencia:

1. **Corrida integrada de ítems** que comparten material y proceso (la nota la llama “una sola corrida de trabajo”), manteniendo avance y tiempos independientes por ítem.
2. **Material puesto por el cliente** (“costeo interno” en Propuesta): el operador declara el consumo real para descontarlo del material del cliente, sin costearlo como material propio. Si no alcanza, pausa por falta de material.
3. **Retrabajo** como registro completo de un trabajo extra (material, tiempo, causa), visible para el administrador.

Además, dos ajustes de interfaz del cierre de sesión del operador: formulario colapsable, material autocompletado, sin duplicados ni PIN; y el error de “primera pieza pendiente” como modal accionable con aviso preventivo.

## 2. Requisitos atómicos

| Tanda | ID | Requisito |
|---|---|---|
| **C13.1 UI del cierre del operador (sin reglas nuevas)** | P01 | El bloque “Cerrar la sesión en marcha” aparece **colapsado** por defecto y se despliega con animación suave; el scroll inicial se reduce. |
| | P02 | Un **solo** formulario de consumo de material en el cierre (eliminar el bloque duplicado). |
| | P03 | El campo **Material** se autocompleta con el material de la partida/orden que se está trabajando (editable solo si hay más de uno). |
| | P04 | Se elimina el campo **PIN de confirmación** del cierre (ver pregunta de seguridad). |
| | P05 | Si hay primera pieza pendiente, una **alerta inicial color naranja pastel** lo indica al abrir el proceso, con el botón para liberarla. |
| | P06 | El error “falta liberar la primera pieza” se muestra en **modal** con explicación, pasos de solución y botón que resuelve sin cerrar el formulario de finalización. |
| **C13.2 Retrabajo** | P07 | Casilla **“Retrabajo”** en el formulario de finalizar sesión; al marcarla se abre un formulario completo del ítem. |
| | P08 | El retrabajo registra **material usado, merma, tiempo, motivo, causa (operador / cliente / material) y notas**. |
| | P09 | El retrabajo **no modifica el avance declarado** del ítem; se registra como evento aparte con su propio consumo y costo. |
| | P10 | El retrabajo aparece en la vista de Producción y en Seguimiento de la orden con su resumen, y se conserva en el histórico. |
| **C13.3 Material del cliente** | P11 | En Propuesta (Ruteo/Costeo) se declara, por ítem, si el **material lo proporciona el cliente**, con material del catálogo, cantidad y unidad. |
| | P12 | Ese dato se **congela en el snapshot de la orden** al aceptar la propuesta; cambios posteriores no lo alteran. |
| | P13 | En Producción, el operador ve el **material del cliente** del ítem y su saldo disponible. |
| | P14 | Al finalizar la sesión, **solo si el ítem tiene material del cliente**, aparece el formulario de consumo real (usado y merma), sin costo propio ni descuento de inventario de la empresa. |
| | P15 | El consumo declarado **descuenta del saldo del material del cliente** por ítem/orden. |
| | P16 | Si el consumo excede el saldo, el cierre se **bloquea** y se ofrece **pausar por falta de material**, con nota y causa (cliente no entregó suficiente / error del operador). |
| | P17 | Administración ve en Producción y Seguimiento: material del cliente entregado, consumido, saldo y pausas por falta. **No** altera costos ni reportes administrativos de la orden. |
| **C13.4 Corrida integrada y tiempos** | P18 | El operador puede **marcar** que dos o más ítems con el mismo material y proceso se trabajan en una sola corrida. |
| | P19 | La corrida integrada conserva **metas, avance y calidad independientes** por ítem; el cierre declara avance y **tiempo por ítem** (inicio/fin o minutos), validando que la suma no exceda la sesión. |
| | P20 | Administración ve que “ítems 1 y 2” se trabajaron en un solo proceso y el avance individual de cada uno; se respetan las validaciones existentes (recurso, disponibilidad parcial de piezas, primera pieza, horas extra). |

## 3. Estado real a verificar antes de ejecutar (pistas, no hallazgos)

- `corridas` + `corrida_items` ya admiten **varias partidas por corrida** y validan compatibilidad; revisar si la UI y el cierre permiten declarar avance por ítem o solo por sesión.
- El cierre registra consumo en `registros_consumo_material` con **costo unitario (CPP)** y movimiento de inventario: el material del cliente **no** debe pasar por ese camino.
- El retrabajo hoy solo existe como `cantidad_retrabajo` dentro de `inspecciones_calidad`; no hay registro de material/tiempo del trabajo extra.
- “Costeo interno” de la propuesta es un **monto por categoría** (`material`, `gastos_directos`), no una cantidad de material ni una marca de “lo puso el cliente”. La nota cambia ese significado; requiere decisión explícita.
- El PIN del cierre es la prueba de presencia del operador ante una vista delegada de administrador; retirarlo es una decisión de seguridad, no solo de UI.

## 4. Fuera de alcance (salvo que el PO lo pida)

- Recepción formal de material del cliente con evidencia/firma (se propone solo cantidad comprometida y consumo).
- Costeo del material del cliente en la orden o en Finanzas.
- MRP/APS, optimización de secuencias o integración automática de ítems.
- Notificaciones al cliente por falta de material.
