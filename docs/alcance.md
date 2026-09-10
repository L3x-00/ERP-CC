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
| 8.1 | Esquema AR, RLS, folios REC atómicos, tipos y validaciones Zod v4. |
| 8.2 | Pagos, monedero y apertura de AR mediante RPCs atómicas, idempotentes y multimoneda; aging y fixture `SIM-AR`. |
| 8.3 | Server Actions autorizadas, auditoría, servicios de cartera y estado cliente sin copias de saldos. |
| 8.4 | Ruta `/cobranza`, recibo funcional, Realtime sin payload y E2E remoto de pago y sincronización. |
| 9.1 | Esquema local de Gastos/CxP, folios GTO atómicos, RLS y tarifas históricas de sesiones. Pendiente de aplicar al remoto. |
| 9.2 | Motor local de rentabilidad por orden, CPP con merma y OCR server-side validado con Zod. Pendiente de gate remoto. |
| 9.3 | Server Actions, permisos financieros, auditoría, Zustand efímero y sincronización Realtime de Gastos. |
| 9.4 | Ruta `/gastos`, fixture persistente `SIM-GTO`, pruebas de integración y E2E opt-in con cleanup por ID. |
| 10.1 | RPCs de consolidación ejecutiva, vendedor, equipo y contador; metas/comisiones auditables; contratos y Zod v4. Pendiente de aplicar al remoto. |
| 10.2 | Servicio de métricas por rol, comparativos vs periodo anterior y algoritmo puro de tendencias. |
| 10.3 | Server Actions con `can()`, auditoría, filtrado server-side, Zustand y sincronización Realtime del dashboard. |
| 10.4 | Ruta `/dashboard`, widgets funcionales por rol, redirección de compatibilidad `/tablero` y E2E opt-in. |
| 11.1 | Singleton de configuración, cuentas bancarias, áreas de trabajo, RLS, privilegios mínimos, Realtime y tipos/mappers estrictos. Pendiente de aplicar al remoto. |
| 11.2 | Servicio central con actualización atómica por sección, tipo de cambio vigente y fallbacks para JSONB incompleto. |
| 11.3 | Server Actions administrativas con Zod, `can('configuracion')`, auditoría saneada y Zustand v5 efímero. |
| 11.4 | Ruta `/configuracion` por pestañas, edición de empresa/tarifas/áreas/cuentas/plantillas, Realtime y E2E opt-in. |
| 12.1 | Esquema de comentarios y notificaciones, menciones transaccionales, RLS, restricciones de texto y tipos estrictos. Pendiente de aplicar al remoto. |
| 12.2 | Parser de menciones, sanitización XSS, mappers y servicios de hilos/notificaciones. |
| 12.3 | Server Actions protegidas, auditoría, eliminación lógica, marca de lectura propia, Zustand y Realtime. |
| 12.4 | Hilos en órdenes/clientes/pipeline, centro de notificaciones en headers, navegación contextual y E2E opt-in de dos sesiones. |

## Siguiente alcance

1. **Cierre operativo de Fase 9:** recuperar el privilegio CLI de Supabase, aplicar las tres migraciones, regenerar tipos desde la base, ejecutar `db lint`, verificar `SIM-GTO` y correr la E2E remota.
2. **Cierre operativo de Fase 10:** recuperar el privilegio CLI de Supabase, aplicar la migración del dashboard, regenerar tipos, ejecutar lint/asesores y validar E2E con cuatro credenciales ficticias.
3. **Cierre operativo de Fase 11:** recuperar privilegios Supabase, aplicar `20260910011548_fase_11_configuracion_base.sql`, regenerar tipos oficiales, ejecutar `db lint`/asesores y correr la E2E remota con credenciales ficticias. Validar además la política definitiva de tarifas por recurso frente a `recursos_planeacion`.
4. **Cierre operativo de Fase 12:** recuperar privilegios Supabase, aplicar `20260910023504_fase_12_comentarios_base.sql`, regenerar tipos, ejecutar `db lint`/asesores y correr la E2E con dos credenciales ficticias.
5. **Portal y analítica avanzada:** definir después de la aceptación de dashboard, configuración, comentarios y motor financiero.

## Fuera de alcance actual

- Parser automático DXF: diferido como Fase 2b; la cotización manual es el flujo vigente.
- CFDI/PAC: no se implementa hasta definir proveedor y alcance fiscal.
- Portal de cliente, CFDI/PAC y analítica avanzada se desarrollan en sus fases dependientes. La configuración maestra ya cuenta con backend y UI funcional local; su activación operativa requiere el gate remoto.

## Decisiones de negocio pendientes

- Determinar si un vendedor puede marcar una oportunidad como Ganada sin aprobación de gerente o administrador.
- Definir el alcance de facturación electrónica mexicana.
- Confirmar tarifas de máquina, merma operativa y reglas definitivas MXN/USD antes de la configuración completa.
