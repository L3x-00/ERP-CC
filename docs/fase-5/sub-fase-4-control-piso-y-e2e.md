# Fase 5 · Sub-fase 5.4 — Control de piso y pruebas E2E

## Resultado

La Fase 5 queda operable de punta a punta para una OP manual: administración
crea y programa la orden; el operador entra con PIN, registra tiempo, avance de
piezas, scrap y consumo de material. Los valores críticos no se acumulan en la
interfaz ni se escriben con PostgREST directo.

La migración `20260812040949_fase_5_avance_partida.sql` fue aplicada al proyecto
Supabase remoto. El modelo generado `src/compartido/tipos/supabase.ts` se
regeneró desde esa base.

## Operación de taller segura

- `registrar_avance_partida_op(...)` suma producción y scrap en PostgreSQL. La
  función bloquea primero la partida y después la OP, exige `en_proceso` y
  confirma que el operador siga activo antes de actualizar cantidades.
- La función de consumo se fortaleció con el mismo bloqueo de partida → OP →
  material. Así no puede descontar inventario si la OP fue pausada, completada
  o cancelada en una operación concurrente.
- Ambas RPC siguen sin ejecución para `PUBLIC`, `anon` o `authenticated`: solo
  `service_role` puede invocarlas desde Server Actions.
- `registrar-avance-partida.ts` y `registrarConsumoOperadorAccion` usan una
  sesión PIN HMAC vigente y toman la identidad del operador desde el servidor;
  no confían en un id enviado por el navegador. Toda aceptación o rechazo deja
  auditoría sin exponer detalles internos.

## Interfaz entregada

- `/ordenes` (zona privada) presenta `FormularioOrden` y `TablaOrdenes`.
  Permite crear OP manuales, filtrar por máquina/estado, revisar avance y usar
  acciones rápidas de programación, inicio, pausa, reanudación o terminación.
- `/produccion-piso` reemplaza el marcador anterior por `ControlPisoPanel`.
  Solo carga OP `en_proceso`, muestra su partida activa y habilita marcas de
  inicio/pausa/fin, piezas buenas, scrap de fabricación y consumo/merma de
  material.
- Los componentes reciben proyecciones serializables de Server Components y
  mutan exclusivamente mediante Server Actions. `usarTiendaOrdenes` conserva
  la orden activa y los filtros sin persistir información entre turnos.

## Evidencia E2E

Se agregó Playwright 1.62.1 y el comando `pnpm test:e2e`.
`tests/e2e/ordenes-flujo-completo.spec.ts` crea usuarios, cliente y material
temporales; realiza el flujo navegador completo y limpia esos datos al finalizar.
Por seguridad, la parte que modifica Supabase remoto solo corre con:

```powershell
$env:E2E_HABILITAR_PRUEBAS_REMOTAS = 'si'
pnpm test:e2e
```

La prueba verifica el folio OP, la transición a `en_proceso`, la marca de
tiempo, cantidades acumuladas, consumo, stock final y eventos de auditoría.

## Verificación de cierre

- `pnpm typecheck`: correcto.
- `pnpm test`: 23 archivos y 195 pruebas correctas.
- `pnpm test:integracion`: 5 archivos y 15 pruebas correctas.
- `pnpm build`: correcto; conserva únicamente la advertencia preexistente de
  migrar `middleware` a `proxy` en Next.js 16.
- E2E Playwright contra la instancia de producción local: 1 flujo correcto.
- Validación de navegador: `/operador` respondió HTTP 200, sin overlay ni
  errores de consola; se confirmó el teclado PIN hidratado y sus 12 controles.
