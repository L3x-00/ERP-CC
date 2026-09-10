# Sub-fase 9.4 — Operación, fixture ficticia y gate E2E

## Operación funcional

La ruta privada `/gastos` carga su proyección inicial como Server Component y
presenta tabla, filtros, alta de gastos, cambio de estado, lectura de
rentabilidad y carga opcional de comprobante OCR. La UI es funcional-first y
no expone el cliente administrativo de Supabase.

## Datos ficticios persistentes

`supabase/semillas/gastos-ficticia.mjs` mantiene un escenario aislado `SIM-GTO`
con cliente, proveedor, material con stock/CPP, orden terminada, programación,
consumo con merma, sesión con tarifa histórica, cuenta por cobrar y gasto
pendiente. La semilla:

- bloquea `NODE_ENV=production`;
- exige `CONFIRMAR_DATOS_FICTICIOS=si` para escribir;
- usa IDs y correos de desarrollo, no datos reales;
- es idempotente y no borra ni reinicia movimientos existentes;
- tiene modo de solo verificación.

Comandos:

```text
pnpm datos:ficticios:gastos
pnpm verificar:ficticios:gastos
```

## Gate E2E

`tests/e2e/gastos-rentabilidad.spec.ts` crea registros efímeros por ID, inicia
sesión de administrador, registra un gasto desde `/gastos`, comprueba el folio
`GTO-NNNNNN`, cambia a pagado, consulta la rentabilidad, valida la bitácora y
confirma el evento en una segunda vista sin refresco manual. El cleanup elimina
gastos, AR, sesiones, consumos, kardex, programación, catálogos y usuario de
prueba.

La prueba solo se habilita con `E2E_HABILITAR_PRUEBAS_REMOTAS=si`. Mientras la
cuenta Supabase vinculada devuelva 403, no se declara una ejecución remota.
