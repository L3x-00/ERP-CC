# Alcance y roadmap

## Entregado

| Fase | Resultado |
| --- | --- |
| 0 | Base Next.js, estructura modular, proveedores de estado y pruebas. |
| 1 | Autenticación, sesión de operador por PIN, permisos, rate limiting y auditoría. |
| 2 | Pipeline comercial, cotización manual, folios atómicos, adjuntos y hardening adversarial. |
| 3 | Cliente 360°, tiers, crédito, documentos y vinculación con oportunidades ganadas. |
| 4 | Proveedores, materiales, kardex, entradas/salidas, CPP y control de stock. |
| 5.1 | Esquema de órdenes de producción, folios OP atómicos, RLS de lectura, contratos TypeScript y validaciones Zod v4. |
| 5.2 | Órdenes manuales y automáticas desde Pipeline, transacciones SQL, transiciones controladas, cancelación autorizada y auditoría. |

## Siguiente alcance

1. **Fase 6 — Planeación:** calendario, modo preparación y candado por área.
2. **Fase 7 — Producción:** Kanban, sesiones con PIN, avances, consumo real y entrega.
3. **Fase 8 — Cobranza:** AR, pagos, aging y recibos.
4. **Fase 9 — Gastos y rentabilidad:** costos, comprobantes y margen real por orden.

## Fuera de alcance actual

- Parser automático DXF: diferido como Fase 2b; la cotización manual es el flujo vigente.
- CFDI/PAC: no se implementa hasta definir proveedor y alcance fiscal.
- Portal de cliente, dashboard final, comentarios y configuración completa se desarrollan en sus fases dependientes.

## Decisiones de negocio pendientes

- Determinar si un vendedor puede marcar una oportunidad como Ganada sin aprobación de gerente o administrador.
- Definir el alcance de facturación electrónica mexicana.
- Confirmar tarifas de máquina, merma operativa y reglas definitivas MXN/USD antes de la configuración completa.
