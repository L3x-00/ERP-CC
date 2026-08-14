# Sub-fase 7.2 — Motor de sesiones y entregas

Fecha: 2026-08-14

## Resultado

La migración `20260814044158_fase_7_motor_sesiones.sql` implementa los RPCs de inicio, cierre y nota de entrega. Las correcciones `20260814050438_fase_7_corregir_horas_brutas_dst.sql` y `20260814054021_fase_7_unificar_orden_locks_entrega.sql` aseguran duración bruta correcta ante cambios de horario y un orden de locks consistente para sesiones y entregas.

## Reglas transaccionales

- `iniciar_sesion_trabajo_operador` bloquea en un orden estable partida, OP, operador, programación y recurso. Solo inicia una partida asignada a un operador activo sobre un recurso en preparación.
- `cerrar_sesion_trabajo_operador` calcula horas brutas y netas en PostgreSQL. El descuento de comida es el traslape real con el intervalo local de Tijuana `[12:00, 13:00)`; no descuenta una hora fija.
- El cierre registra un avance inmutable asociado a la sesión, actualiza cantidades y tiempo real, y libera o completa el recurso en la misma transacción.
- `generar_nota_entrega` bloquea primero las partidas por UUID ordenado y después la OP, igual que las sesiones; impide entregar más de lo producido y deriva la parcialidad desde el historial persistido.
- Las tres funciones son `SECURITY DEFINER`, con ruta de búsqueda fijada y ejecución exclusiva de `service_role`.

## Datos ficticios persistentes

`supabase/semillas/produccion-ficticia.mjs` mantiene el conjunto `SIM-PRD`: una partida preparada para piso, una entrega parcial y una total. Requiere confirmación explícita, rechaza producción y conserva los avances existentes en ejecuciones posteriores.
