# Errores registrados — tablero de lotes y corridas

Lectura obligatoria antes de volver a tocar el Kanban del operador, el diálogo de lotes o la creación/agrupación de corridas. Cada entrada es un caso real encontrado al investigar el ajuste del 27 de noviembre de 2026. Formato: **síntoma → causa real → regla**.

## 1. El diálogo del lote parecía vacío cuando el lote ya estaba en proceso

| Síntoma | Causa real | Regla |
| --- | --- | --- |
| Al abrir el lote LAS05 en «En proceso» solo se ve código, orden, proceso, cantidades, «Creado el…», «Día de la jornada», «Turno» y «Cerrar» | `dialogo-detalle-lote.tsx:33-129` tiene **una sola plantilla**: no hay rama por `lote.estado`. El botón «Iniciar corrida» solo se pinta si `PLANIFICADA` (`:111-120`), pero fecha y turno se pintan siempre (`:83-108`) | Un diálogo de lote debe tener dos modos explícitos: **planificado** (información + iniciar) y **en curso** (información + sesión + pausar/finalizar). Nunca dejar campos de inicio visibles sin acción útil |

## 2. El tablero de lotes no sabe nada de sesiones ni de descripciones

| Síntoma | Causa real | Regla |
| --- | --- | --- |
| El diálogo del lote no muestra descripción de ítem, hora de inicio ni tiempo acumulado, aunque la tarjeta del ítem sí los muestra | `LoteTablero` (`tipos/corridas.ts:66-80`) no tiene campos de sesión; `CorridaItem` (`:35-40`) trae solo `partidaId`, `codigoItem`, `cantidad`. `obtenerLotesTableroServicio` (`servicios/lotes-tablero-servicio.ts:36-130`) consulta corridas, ítems, procesos, clientes y partidas solo para `area_trabajo_codigo` (`:84-87`); nunca lee `sesiones_trabajo` | Toda pantalla que pretenda dar seguimiento a una corrida debe construir su proyección con descripción de partida y datos de `sesiones_trabajo` por `corrida_id`. Un resumen sin esos campos no sirve para seguimiento |

## 3. «Ver lote X e iniciar corrida» seguía apareciendo con el lote ya en marcha

| Síntoma | Causa real | Regla |
| --- | --- | --- |
| En la ficha del ítem 2 de la orden, con el lote LAS05 EN_PROCESO, el botón decía «Ver lote LAS05 e iniciar corrida» | `detalle-proceso-operador.tsx:3228-3237`: la condición es solo `proceso.loteId && onIniciarCorridaLote`. El callback se entrega en `espacio-operador.tsx:799-804` y `pagina-mi-panel-operador.tsx:640-645` siempre que exista `loteId`, sin consultar `lote.estado` | El enlace dice siempre **«Ver lote»**, en cualquier estado, y abre la ficha del lote; desde ahí se inicia solo si está PLANIFICADA. El PO revocó el criterio anterior de «Ver lote … e iniciar corrida» (PR #308). Nunca proponer «iniciar» en el texto del enlace ni en el modal de una corrida ya iniciada |

## 4. El mismo trabajo aparece dos veces: tarjeta de lote y tarjeta de ítem

| Síntoma | Causa real | Regla |
| --- | --- | --- |
| Con el lote LAS05 en «En proceso», la columna muestra la tarjeta del lote **y** la tarjeta de la orden con IT02; en Bandeja pasa igual con LAS04 e IT01 | `vista-kanban-operador.tsx:77-78` calcula `lotesDelEstado` con `columnaOperadorLote(lote.estado)` y `ordenesDelEstado` por `grupo.columna`, y pinta ambos en el mismo `<ul>` (`:115-140`). `derivarColumnaProceso` (`tipos/espacio-operador.ts:601-616`) **no recibe `loteId` ni el estado del lote** | En las columnas donde ya hay tarjeta de lote, los procesos incluidos en ese lote no deben pintarse también como tarjetas de orden. Ocultar solo esos procesos, no la orden completa: los procesos secundarios (p. ej. doblado) deben seguir visibles en «Aprobada» |

## 5. Una corrida tiene una sola sesión (dato de modelo, no suposición)

| Síntoma | Causa real | Regla |
| --- | --- | --- |
| Se esperaba un contador por ítem dentro del lote, pero solo el ítem representativo muestra tiempo | `iniciarProcesoDirectoAccion` (`acciones/espacio-operador.ts:231-261`) crea una sesión para la partida representante y pasa `corridaId`; la RPC (`20261123000000_operador_inicia_sin_liberacion.sql:280-283`) inserta **una** fila en `sesiones_trabajo` con `corrida_id` y `partida_id` | Antes de prometer «tiempo por ítem» en el modal del lote, confirmar el modelo de sesiones. Hoy el seguimiento del lote se hace sobre la sesión única de la corrida |

## 6. El cambio de estado en tiempo real ya tiene canal, pero no hay que duplicarlo

| Síntoma | Causa real | Regla |
| --- | --- | --- |
| Al iniciar un lote, la tarjeta no cambiaba de columna hasta recargar en versiones anteriores | El piso usa `SincronizadorPisoRealtime` (`sincronizador-piso-realtime.tsx:27-37`): EventSource → `router.refresh()`. El relay (`app/api/produccion-piso/sincronizacion/route.ts:12-26`) ya escucha `corridas` y `sesiones_trabajo`. Producción usa `SincronizadorProduccionRealtime` → `invalidateQueries(['produccion'])` | El realtime solo **señala** refresco; nunca se usa el payload como dato de UI. Los campos nuevos del lote deben venir de la relectura al servidor (RLS + mappers), y el contador en vivo se calcula en el cliente con `ContadorSesionVivo` |

## 7. El inicio independiente parecía crear un lote (LAS06)

| Síntoma | Causa real | Regla |
| --- | --- | --- |
| Al iniciar solo CORTE LASER de un ítem apareció «Lote LAS06, 100 piezas en 1 ítems» sin haber creado lote | La RPC `iniciar_sesion_trabajo_operador` (`20261123000000_operador_inicia_sin_liberacion.sql:202-269`) crea una corrida legacy de **un solo ítem** cuando `p_corrida_id` es NULL; es trazabilidad, no un lote. Lo nuevo fue que `obtenerLotesTableroServicio` proyectaba toda corrida activa y `mapaLotesPorOperacion` marcaba el proceso como «en lote», ocultando «Iniciar proceso» | Excluir de la proyección de lotes y del mapa las corridas con **menos de 2 ítems**. Las corridas terminadas siguen etiquetando «Trabajado en lote X». El consecutivo global (#325) solo cambió el número visible |

## 8. Los procesos secundarios se redujeron a «IT01 · DOB»

| Síntoma | Causa real | Regla |
| --- | --- | --- |
| En Bandeja, el doblado aparecía como una línea mínima sin cliente, ruta ni «Ver detalle» | PR #331 fijó «Aprobada» como columna principal siempre que existiera trabajo allí, de modo que Bandeja quedaba como réplica compacta (`tarjeta-orden-operador.tsx:312-354` muestra solo `grupo.items[0]`) | Conservar la columna principal original (`derivarColumnaOrden`). Solo si el lote ocultó esa columna se promueve la primera columna **visible** (con preferencia de Aprobada y orden del tablero), para que siempre exista una tarjeta completa |

## Regla de diseño acordada para este ajuste

- En **Aprobada** la orden sigue visible con sus ítems; el ítem agrupado muestra «En lote X» y un enlace **«Ver lote»** que abre el modal del lote.
- En **Bandeja** y **En proceso** solo se pinta la tarjeta del lote; la tarjeta es clickeable y abre un modal con el detalle completo.
- El modal del lote es análogo a la ficha de un ítem en curso: ítems agrupados con descripción/material/medidas/piezas, proceso, tiempos, orden y acciones según estado.
- El flujo detallado y su alcance están en `.ai-shared/coordination/FLUJO-LOTES-TABLERO-2026-11-27.md`.
