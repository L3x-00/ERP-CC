# Fase 6 — Sub-fase 6.2: Motor transaccional de capacidad

## Objetivo

Convertir la programación de recursos en una operación segura bajo concurrencia. La capacidad disponible no se decide en el navegador: PostgreSQL bloquea el recurso, calcula la carga efectiva y acepta o rechaza la solicitud dentro de la misma transacción.

## Entregado

- Tabla `excepciones_capacidad_recurso` para mantenimiento, feriados y turnos extraordinarios. Una excepción sustituye la capacidad normal del recurso para una fecha y turno determinados.
- RPCs `programar_partida_recurso`, `reprogramar_partida_recurso`, `activar_modo_preparacion` y `obtener_carga_capacidad_diaria`.
- Reprogramación con compare-and-set sobre `actualizado_en`, que rechaza una pantalla obsoleta sin sobrescribir el cambio de otro usuario.
- Servicio de dominio y cálculos puros de holgura, ocupación y cuellos de botella. Estos cálculos son solo una previsualización; no autorizan escrituras.
- Tipos Supabase regenerados, contratos/mappers de Planeación y pruebas unitarias de servicios y cálculos.

## Seguridad y concurrencia

- RLS continúa activa. Los usuarios autenticados solo pueden leer si poseen permiso de Planeación; las mutaciones no tienen acceso PostgREST directo y las RPCs solo pueden ejecutarse como `service_role` desde el servidor.
- Las RPCs fijan `search_path`, validan todos sus parámetros y bloquean recursos con `FOR UPDATE`. Cuando hay dos recursos involucrados, se bloquean por UUID en orden determinista.
- La capacidad incluye únicamente programaciones activas; las canceladas y completadas no consumen horas.
- El índice parcial de la Sub-fase 6.1 sigue siendo la segunda barrera contra dos preparaciones o ejecuciones simultáneas del mismo recurso.
- El conflicto compare-and-set devuelve `check_violation` y no `serialization_failure`: así el cliente recibe inmediatamente `programacion_conflicto` en vez de reintentar una colisión de negocio.
- `excepciones_capacidad_recurso` se publica en Realtime. Las vistas conectadas en subfases posteriores podrán invalidar datos sin refresco manual.

## Datos ficticios persistentes de desarrollo

Se conserva un conjunto idempotente y aislado para el desarrollo de Planeación. Usa el prefijo `SIM-PLN` y los folios `OP-900101` a `OP-900103`; no contiene información real ni debe ejecutarse en producción.

- Cliente ficticio, tres OP y tres partidas.
- Cuatro recursos (láser, CNC, acabados y externo), ocho capacidades por turno y una excepción de mantenimiento.
- Tres programaciones activas, incluida una en preparación para comprobar el candado de recurso.
- La semilla, su verificación y las pruebas temporales bloquean ejecución en producción. La siembra exige `CONFIRMAR_DATOS_FICTICIOS=si`; las pruebas remotas de motor y compare-and-set exigen `CONFIRMAR_PRUEBAS_FICTICIAS=si`.

## Verificación realizada

- Semilla persistente verificada: 1 cliente, 3 OP, 3 partidas, 4 recursos, 8 capacidades, 1 excepción y 3 programaciones.
- Prueba remota de capacidad: programación que cabe, rechazo por recurso ocupado, rechazo por capacidad insuficiente y limpieza de registros temporales.
- Prueba remota compare-and-set: una actualización obsoleta recibe `programacion_conflicto` de inmediato y limpia sus datos temporales.
- Permisos remotos: `authenticated` no puede programar ni activar preparación; `service_role` sí puede ejecutar las RPCs autorizadas.
- 250 pruebas unitarias y 15 de integración, tipos, lint, build, auditoría de dependencias y `db lint` ejecutados en verde.

## Límites y siguiente paso

Los datos son de desarrollo y no sustituyen el catálogo real de máquinas, calendarios ni reglas de negocio aprobadas. La Sub-fase 6.3 conectará estas RPCs con Server Actions autorizadas, auditoría y actualización en tiempo real del calendario.
