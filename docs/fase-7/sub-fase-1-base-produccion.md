# Sub-fase 7.1 — Base de Producción

Fecha: 2026-08-14

## Resultado

Se incorporó el modelo transaccional de sesiones de taller y notas de entrega. La migración `20260814044151_fase_7_produccion_base.sql` crea `sesiones_trabajo`, `notas_entrega` y `partidas_nota_entrega` con relaciones explícitas a OP, partida, programación y operador.

## Controles aplicados

- Las sesiones solo pueden relacionar una OP, partida y programación coherentes; un trigger comprueba la pertenencia antes de cada escritura.
- Cada operador y cada programación admiten como máximo una sesión activa mediante índices únicos parciales.
- Las notas de entrega usan la secuencia y función `generar_folio_nota_entrega`, que produce `NE-NNNNNN` de forma atómica.
- Las tablas nuevas tienen RLS activa. `authenticated` dispone solamente de lectura autorizada; las escrituras y las funciones de folio quedan limitadas a `service_role`.
- Las notas y sus partidas no incluyen columnas de precio, importe ni costo.
- Los contratos de TypeScript, mappers puros y esquemas Zod v4 rechazan UUID, enumeraciones y cargas no permitidas antes de llegar al servicio.

## Pruebas cubiertas

Las pruebas unitarias validan inicio, cierre, pausa con motivo obligatorio, PIN, cantidades, notas de entrega y mappers de filas PostgreSQL.
