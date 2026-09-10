# Sub-fase 12.3 — Acciones protegidas y estado cliente

## Acciones

Las Server Actions de comentarios siguen la frontera `safeParse` → sesión y
acceso a entidad → servicio → auditoría → respuesta genérica:

- crear comentario con sanitización y resolución de menciones;
- consultar hilos y usuarios mencionables;
- eliminación lógica solo por autor o administrador;
- marcar notificación propia como leída.

Los detalles técnicos de excepciones se registran en servidor sin incluir el
contenido del comentario. El cliente nunca envía el `usuario_id` destinatario
para marcar notificaciones.

## Estado y sincronización

`usarTiendaNotificaciones` conserva únicamente lista, contador, apertura y
estado de carga/error. TanStack Query sigue siendo la fuente de datos. Los
canales Realtime escuchan cambios filtrados por entidad o destinatario,
agrupan ráfagas y fuerzan invalidación/refetch; no se persisten permisos ni
copias de datos sensibles en Zustand.

## Verificación

`tests/integracion/comentarios-acciones.test.ts` cubre acceso a entidad,
sanitización/menciones, autoría de eliminación y protección contra IDOR al
marcar notificaciones.
