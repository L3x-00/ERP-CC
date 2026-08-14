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
| 6.3 | Server Actions de Planeación, permisos, auditoría, lectura acotada y estado cliente sin copias mutables de datos de servidor. |
| 6.4 | Ruta `/planeacion`, calendario y asignación funcionales, Realtime con refetch seguro y E2E remoto colaborativo. |
| 7.1 | Modelo seguro de sesiones de taller y notas de entrega, folios NE atómicos, RLS, tipos y Zod v4. |
| 7.2 | RPCs atómicas de inicio/cierre, cálculo horario local, avance inmutable, liberación de recurso y entrega parcial concurrente. |
| 7.3 | Server Actions seguras, HMAC y reconfirmación PIN, rate limiting, auditoría, Zustand y sincronización de tablero. |
| 7.4 | Ruta `/produccion`, Kanban derivado, panel de piso, entrega sin precios y E2E remoto de sincronización entre vistas. |

## Siguiente alcance

1. **Fase 8 — Cobranza:** AR, pagos, aging y recibos.
2. **Fase 9 — Gastos y rentabilidad:** costos, comprobantes y margen real por orden.

## Fuera de alcance actual

- Parser automático DXF: diferido como Fase 2b; la cotización manual es el flujo vigente.
- CFDI/PAC: no se implementa hasta definir proveedor y alcance fiscal.
- Portal de cliente, dashboard final, comentarios y configuración completa se desarrollan en sus fases dependientes.

## Decisiones de negocio pendientes

- Determinar si un vendedor puede marcar una oportunidad como Ganada sin aprobación de gerente o administrador.
- Definir el alcance de facturación electrónica mexicana.
- Confirmar tarifas de máquina, merma operativa y reglas definitivas MXN/USD antes de la configuración completa.
