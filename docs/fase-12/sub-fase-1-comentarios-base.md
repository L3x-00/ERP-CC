# Sub-fase 12.1 — Esquema de comentarios y notificaciones

## Resultado

Se versionó `supabase/migrations/20260910023504_fase_12_comentarios_base.sql`
con el modelo contextual de comentarios y notificaciones.

- `tipo_entidad_comentario` limita el contexto a orden, cotización o cliente.
- `comentarios_registro` conserva autoría, texto plano, menciones, adjuntos y
  marcas de edición/borrado lógico.
- `notificaciones_usuario` mantiene la bandeja privada por destinatario.
- Índices por entidad, autor, estado de lectura y fecha reducen el costo de las
  lecturas frecuentes.
- El trigger `procesar_menciones_comentario()` inserta notificaciones en la
  misma transacción del comentario y omite usuarios inactivos o al autor.

## Seguridad

RLS limita la lectura y creación de comentarios al acceso efectivo a la entidad.
Las notificaciones solo pueden leerse y marcarse por su `usuario_id`. Un trigger
impide que un JWT cambie la identidad o el contexto de un comentario; las
acciones controladas del servidor usan `service_role`. El contenido rechaza
etiquetas HTML y los enlaces de notificación se limitan a rutas internas.

La publicación Realtime solo emite señales. La interfaz vuelve a consultar bajo
RLS y no utiliza el payload del socket como fuente de verdad.

## Estado de entorno

La migración está lista e idempotente en el repositorio. La aplicación y el
`migration list` remoto quedan pendientes de recuperar privilegios de Supabase;
no se declara aplicación remota en este corte.
