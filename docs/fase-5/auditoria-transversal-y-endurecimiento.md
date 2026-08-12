# Auditoría transversal y endurecimiento de Fase 5

Fecha: 2026-08-12

## Objetivo

Consolidar la seguridad, integridad transaccional y sincronización operativa de las órdenes de producción antes de iniciar Planeación. El trabajo evita depender de refrescos manuales y conserva el principio de mínimo privilegio.

## Correcciones aplicadas

- Se retiraron escrituras directas heredadas para usuarios autenticados en materiales, movimientos, proveedores y reservas. Las mutaciones siguen pasando por acciones de servidor y RPCs restringidas.
- Las funciones auxiliares de RLS se movieron al esquema privado, con ruta de búsqueda fija y sin ejecución para `PUBLIC`, `anon` ni `authenticated`.
- Se añadieron los permisos `gestionar_inventario` y `gestionar_produccion`; el consumo administrativo deja de depender de un permiso de aprobación comercial.
- Cada partida puede tener un operador asignado. Tiempo, avance y consumo de piso validan esa asignación, el operador activo y el estado `en_proceso` dentro de PostgreSQL.
- El avance queda trazado en `registros_avance_partida` y la producción buena no puede superar la cantidad solicitada.
- Se incorporó sincronización automática: los usuarios autenticados reciben cambios por Supabase Realtime bajo RLS; las terminales PIN usan un relay SSE sin datos sensibles, con sesión revalidada, backoff y recarga limitada al operador.
- Las notificaciones originadas por la propia terminal se agrupan para impedir refrescos concurrentes con su acción transaccional; los cambios de otros usuarios siguen actualizando la pantalla automáticamente.
- Se actualizó Next.js y dependencias de producción para eliminar vulnerabilidades conocidas y se migró el interceptor de `middleware` a `proxy`.

## Migración asociada

`20260812052820_endurecimiento_seguridad_realtime.sql` y `20260812061946_verificar_operador_activo_consumo_piso.sql` son aditivas: endurecen privilegios, agregan trazabilidad y habilitan las tablas de producción para Realtime. No eliminan datos operativos.

## Decisión operativa

La asignación de operador ya es obligatoria en la capa de datos. La interfaz de planeación para asignar operadores y máquinas corresponde a Fase 6; hasta entonces, la acción administrativa ya existe y el motor rechaza operaciones no asignadas.

## Evidencia de cierre

- Migraciones local/remoto alineadas y sin hallazgos del asesor de seguridad o rendimiento de Supabase.
- Pruebas unitarias, integración, compilación, lint y flujo E2E de creación, asignación, tiempo, avance, consumo, stock y auditoría ejecutados en verde.
- El flujo E2E comprueba también la apertura del canal de sincronización de piso y limpia sus datos temporales al finalizar.
