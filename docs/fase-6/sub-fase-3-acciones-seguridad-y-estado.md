# Fase 6 — Sub-fase 6.3: Acciones seguras, auditoría y estado de cliente

## Entregado

- Acciones `programar-partida-recurso`, `reprogramar-partida-recurso`, `activar-modo-preparacion` y `obtener-calendario-planeacion`.
- Secuencia homogénea para mutaciones: `safeParse` Zod v4, sesión, `can(gestionar_planeacion)`, servicio/RPC con `service_role`, bitácora y respuesta saneada.
- La lectura valida `ver_planeacion` o `gestionar_planeacion`, limita el rango de calendario y compone recursos, carga y programaciones en una sola proyección.
- `actualizado_en` acepta el offset que PostgreSQL devuelve (`+00:00`) y mantiene compare-and-set al reprogramar o activar preparación.
- `usarTiendaPlaneacion` contiene únicamente rango, filtros y selección. No persiste ni duplica programaciones o carga de servidor.

## Seguridad y sincronización

- El servicio de calendario filtra la carga calculada con el conjunto de recursos que RLS permitió leer; una futura política más restrictiva no filtrará solo las filas visuales dejando metadatos de capacidad expuestos.
- Las acciones no entregan el detalle de errores PostgreSQL al navegador. La bitácora conserva solo los códigos y metadatos necesarios para trazabilidad.
- El sincronizador escucha las cuatro tablas propias de Planeación y agrupa ráfagas durante 350 ms para invalidar `['planeacion', 'calendario']`. Los cambios de OP o partidas también disparan un refresco RSC ligero para renovar opciones de asignación. Ignora por completo los payloads de Realtime y vuelve a leer por Server Action/RLS.

## Verificación

- Pruebas de acciones: permiso, entrada inválida, CAS, actor no controlado por navegador y rango acotado.
- Pruebas de tienda: filtros, copias defensivas y ausencia intencional de datos de servidor.
- Pruebas de Realtime: suscripción a las cuatro tablas, invalidación agrupada y cleanup de canal/Auth.
