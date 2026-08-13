# Sub-fase 6.1 — Esquema seguro de Planeación

Estado: completada el 2026-08-13 y aplicada al proyecto Supabase remoto.

## Objetivo

Crear una base de datos de planeación que sea segura bajo concurrencia sin asumir datos operativos reales. La unidad programable es un recurso identificado, no el texto histórico `maquina_asignada` de una partida.

## Entrega

- `recursos_planeacion`: máquina, celda o capacidad externa con código único, área, estado activo y marcas de tiempo.
- `capacidades_recurso_turno`: capacidad normal por recurso y turno, con llave compuesta y horas entre 0 y 24.
- `programacion_areas`: asignación secuenciada de una partida a recurso, fecha, turno, horas, prioridad y estado de planeación.
- Integridad: el trigger `validar_partida_corresponde_orden_programacion` rechaza una partida asociada a una OP distinta.
- Concurrencia: el índice parcial `idx_programacion_areas_candado_recurso_activo` permite una sola fila en `en_preparacion` o `en_proceso` por recurso.
- Seguridad: se agregaron `ver_planeacion` y `gestionar_planeacion`. Las tres tablas tienen RLS; el navegador solo puede leer con permiso y no posee privilegios SQL de escritura. Las mutaciones quedan reservadas para `service_role` y las RPC de la Sub-fase 6.2.
- Sincronización: las tres tablas se publicaron en `supabase_realtime`; RLS sigue filtrando los cambios por usuario.
- Contratos: tipos de dominio y mappers puros en `src/modulos/planeacion/tipos/`, con entradas Zod v4 estrictas en `src/modulos/planeacion/validaciones/`.

## Migraciones

- `20260813201729_fase_6_planeacion_base.sql`: modelo, permisos, restricciones, RLS, privilegios y Realtime.
- `20260813202745_fase_6_corregir_descripciones_planeacion.sql`: corrige únicamente las descripciones SQL, sin cambiar datos ni estructura.

## Datos de prueba

No se insertó ningún catálogo ficticio persistente. La validación remota creó dos OP, sus partidas, un recurso, capacidad por turno y una cuenta sin permiso de planeación. Comprobó el candado, la integridad OP-partida, RLS y la prohibición de escritura directa. Después confirmó el borrado de cada registro temporal.

## Siguiente paso

La Sub-fase 6.2 implementará RPCs transaccionales para programar, reprogramar, calcular capacidad y activar preparación. Esas RPCs validarán capacidad dentro de PostgreSQL y usarán el candado de esta sub-fase como defensa final de concurrencia.
