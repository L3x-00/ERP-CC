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
| 5.2 | Motor transaccional de consumo de materiales por OP, kardex atómico, protección de stock, costo CPP histórico y cálculos de merma/desviación. Aplicado y validado en Supabase remoto. |
| 5.3 | Server Actions seguras para creación, estado, consumo y tiempo; sesión PIN validada; RPC de tiempo con hora de PostgreSQL; y tienda Zustand v5 para el taller. Aplicado y validado en Supabase remoto. |
| 5.4 | Control de piso funcional, avance y scrap atómicos, consumo restringido a OP en proceso, interfaz de OP y flujo E2E completo con Playwright. Aplicado y validado en Supabase remoto. |
| 5 transversal | Auditoría y endurecimiento: RLS de mínimo privilegio, asignación obligatoria de operador, trazabilidad de avance y sincronización automática segura. |
| 6.1 | Esquema seguro de Planeación: recursos, capacidad por turno, programación secuenciada, candado concurrente por recurso, permisos/RLS y Realtime. Aplicado y validado remotamente solo con datos ficticios temporales. |
| 6.2 | Motor transaccional de capacidad: excepciones de calendario, programación/reprogramación atómicas, compare-and-set, preparación exclusiva por recurso, servicios de capacidad y fixtures `SIM-PLN` persistentes. Aplicado y validado remotamente con datos ficticios. |

## Siguiente alcance

1. **Fase 6.3 — Planeación:** Server Actions autorizadas, auditoría, calendario y sincronización de cambios en tiempo real.
2. **Fase 6.4 — Planeación:** pruebas de integración/E2E de la programación colaborativa y controles operativos.
3. **Fase 7 — Producción:** Kanban, sesiones con PIN, avances, consumo real y entrega.
4. **Fase 8 — Cobranza:** AR, pagos, aging y recibos.
5. **Fase 9 — Gastos y rentabilidad:** costos, comprobantes y margen real por orden.

## Fuera de alcance actual

- Parser automático DXF: diferido como Fase 2b; la cotización manual es el flujo vigente.
- CFDI/PAC: no se implementa hasta definir proveedor y alcance fiscal.
- Portal de cliente, dashboard final, comentarios y configuración completa se desarrollan en sus fases dependientes.

## Decisiones de negocio pendientes

- Determinar si un vendedor puede marcar una oportunidad como Ganada sin aprobación de gerente o administrador.
- Definir el alcance de facturación electrónica mexicana.
- Confirmar tarifas de máquina, merma operativa y reglas definitivas MXN/USD antes de la configuración completa.
