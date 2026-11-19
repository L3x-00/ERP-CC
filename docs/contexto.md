# Contexto del proyecto

## Negocio

ORCA MFG ERP v2 es el sistema operativo y comercial de CC Manufacturing Group / Mi Robot Centro CNC, empresa de manufactura de precisión en Tijuana, Baja California. Atiende trabajos de corte láser, router CNC, dobladora, ensamble y fabricación; por su operación fronteriza debe soportar escenarios MXN/USD e IVA aplicable.

El producto sustituye ERP-CC v1, un SPA monolítico con lógica sensible en el navegador. La versión actual prioriza trazabilidad, permisos, validaciones server-side y operaciones seguras bajo concurrencia. Está en producción; el estado operativo vigente se mantiene en [Estado actual](estado-actual.md).

## Flujo de negocio principal

```text
Prospecto → RFQ → Propuesta → Negociación → Ganada
                                             ↓
Cliente → Orden de producción → Planeación → Producción → Entrega → Cobranza → Tesorería
```

- **Comercial:** Pipeline asigna el folio comercial; al ganar se crea o vincula al cliente y puede originar una orden de producción. RFQ y Propuestas concentran el detalle técnico y el costeo.
- **Operación:** Planeación asigna partidas a recursos y turnos; Producción ejecuta en piso con sesiones de operador, consumo de material y avance.
- **Cierre:** Entregas emite notas sin precios; el cierre por entrega cierra la orden y el cierre administrativo completa costo y margen.
- **Dinero:** Cobranza abre cuentas por cobrar desde órdenes terminadas; Tesorería, Compras y Gastos completan el flujo financiero. Inventario administra materiales, proveedores y kardex.

## Módulos

Comercial y clientes: Pipeline, RFQ, Propuestas, Clientes.
Operación: Inventario, Compras, Órdenes, Planeación, Producción y piso, Entregas.
Finanzas: Cobranza, Tesorería, Gastos y egresos, Facturación.
Soporte: Dashboard por rol, Configuración maestra, Comentarios y notificaciones, Auditoría, Cierre administrativo.

Cada módulo expone Server Actions autorizadas, servicios, tipos, validaciones Zod y UI. `portal-cliente` y `kpis` están preparados en el dominio sin flujo de producción completo.

## Reglas funcionales que no se deben romper

- Los errores que llegan a usuarios son genéricos; los detalles se registran internamente.
- Folios, límites, stock y cálculos concurrentes se resuelven en Postgres, nunca contando filas ni desde el cliente.
- La seguridad combina permisos server-side y RLS de Supabase.
- Toda actualización relevante de producción se propaga automáticamente: Realtime para usuarios autenticados y un relay sin payload para sesiones PIN.
- Los documentos de producción no muestran precios; las líneas comerciales y las actividades internas son niveles distintos.
- El PIN de piso debe identificar de forma unívoca a un operador. Una coincidencia duplicada falla cerrada y se registra como acceso no válido.
- Una cuenta por cobrar solo puede abrirse desde una OP completada con todas sus partidas producidas. Los importes comerciales se capturan explícitamente por Contabilidad; Producción no inventa precios.
- Los cobros, sobrepagos y aplicaciones de saldo se resuelven atómicamente en PostgreSQL. La misma `solicitud_id` nunca puede crear dos recibos ni tocar saldos por segunda vez.
- Los gastos guardan importes en su moneda original y tipo de cambio MXN por unidad; PostgreSQL exige subtotal + IVA = total y estados coherentes. La rentabilidad toma el ingreso únicamente de CxC explícita, valora materiales con usada + scrap al CPP histórico, usa la tarifa congelada de cada sesión y excluye gastos cancelados.
- La jornada laboral (C18/C24) se resuelve en Postgres con `privado.jornada_laboral_dia`: lunes a viernes 8 h, sábado 4 h y domingo cerrado. Matutino y vespertino son solo etiquetas visuales y no reparten la capacidad. Capacidad, planeación, producción y la jornada del operador usan la misma fuente.
- La orden pasa a `CERRADA` al entregar el 100 % y se reabre al anular la nota de entrega (C19). El cierre administrativo completa costo y margen.
- El cierre del operador puede declarar la hora real de finalización (C20); si no se declara, Postgres usa `now()` como hasta ahora. La pausa automática por jornada deja la sesión en «Actualizar avance» con `pendiente_actualizacion_avance`: el operador dueño (PIN) o un administrador con `gestionar_produccion` declara piezas y las horas que faltaron para la pausa; el sistema deriva la hora real restando esas horas de `fecha_fin`, corrige el avance y el delta de tiempo, y finaliza la sesión solo si se completa la meta. El cierre administrativo normal no cambia. La jornada es corrida de 8 horas con la comida de 12:00 a 13:00 descontada; matutino y vespertino son el mismo horario. Las horas extra se controlan con el total neto del operador en el día laboral de Tijuana, no por sesión: reanudar el mismo día no reinicia el contador, y la misma jornada acumulada dispara la pausa automática (C27). El cliente no mide el reloj bruto contra la jornada: el servidor decide con las horas netas del día y el cliente solo consulta. El formulario de cierre prellena la hora real de conclusión y solo la envía si el operador la corrige; si el proceso terminó antes y la sesión quedó abierta por olvido, esa corrección reduce las horas netas del día y evita el bloqueo de horas extra. C21 permite declarar el tiempo real de cada bloque pausado (se suma aunque sean días distintos), corregir sesiones antiguas en orden cronológico y marcar como inválidas las pausas sobrantes cuando la producción ya se completó; el operador no puede borrar sesiones. Si la operación quedó completa pero falta el consumo de material, la pausa no se reanuda (C28): se cierra asentando el consumo desde el formulario de avance, que conserva las piezas y horas ya declaradas.
- El Dashboard toma métricas agregadas únicamente desde RPCs `SECURITY DEFINER` con rangos semiabiertos y periodo anterior de igual duración. `ver_finanzas` controla CxC/CxP/utilidad/margen; `ver_pipeline_equipo` controla el embudo de equipo; el vendedor solo recibe su propio pipeline y el operador es redirigido a Producción.
- La Configuración maestra mantiene un singleton `main` con bloques JSONB normalizados y valores numéricos para TC/IVA. Una RPC con `FOR UPDATE` actualiza solo la sección solicitada y valida que el actor sea admin o tenga `configuracion`; cuentas bancarias y áreas no conceden escritura directa a `authenticated`.
- Las metas y comisiones viven en `metas_vendedor` como configuración auditable, no como constantes del cliente. RLS limita su lectura al vendedor, equipo autorizado o administrador y `service_role` concentra las escrituras. Las respuestas JSON se mapean desde `unknown`, se descartan campos extra y los números no finitos se rechazan.
- `/dashboard` usa TanStack Query para datos de servidor y `usarTiendaDashboard` solo para filtros, carga y snapshot visual. Realtime escucha las tablas de origen, agrupa ráfagas e invalida la consulta sin usar payloads como fuente de verdad. `/tablero` queda como redirección histórica.
- OCR solo recibe imágenes/PDF desde el servidor, con límite de 5 MiB, respuesta Zod estricta y sin persistir archivos ni secretos. La interfaz de Gastos actualiza sus consultas al recibir señales Realtime y nunca usa payloads como fuente contable.
- Configuración usa TanStack Query como fuente de datos de pantalla y `usarTiendaConfiguracion` únicamente como snapshot efímero. Realtime invalida la proyección autorizada; los formularios registran auditoría sin escribir números de cuenta ni CLABE en los detalles del log.
- Comentarios usan texto plano escapado, no HTML; `menciones_json` contiene únicamente UUIDs de usuarios activos y el trigger crea notificaciones en la misma transacción. Las lecturas vuelven a pasar por RLS y los enlaces del centro se validan contra rutas internas. `usarTiendaNotificaciones` solo mantiene estado efímero; Realtime invalida/refresca sin confiar en payloads.

## Documentos relacionados

- [Estado actual](estado-actual.md) · [Alcance](alcance.md) · [Arquitectura](arquitectura.md)
