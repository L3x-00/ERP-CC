# Contexto del proyecto

## Negocio

ORCA MFG ERP v2 es el sistema operativo y comercial de CC Manufacturing Group / Mi Robot Centro CNC, empresa de manufactura de precisión en Tijuana, Baja California. Atiende trabajos de corte láser, router CNC, dobladora, ensamble y fabricación; por su operación fronteriza debe soportar escenarios MXN/USD e IVA aplicable.

El producto sustituye ERP-CC v1, un SPA monolítico con lógica sensible en el navegador. La versión actual prioriza trazabilidad, permisos, validaciones server-side y operaciones seguras bajo concurrencia.

## Flujo de negocio principal

```text
Prospecto → Cotización → Negociación → Ganada
                                      ↓
Cliente → Orden → Planeación → Producción → Entrega → Cobranza
```

El Pipeline asigna el folio comercial; al ganar, crea o vincula al cliente. Inventario administra materiales, proveedores y el kardex. Órdenes, Planeación, Producción y Cobranza continuarán el flujo en fases posteriores.

## Estado a agosto de 2026

- Fases 0, 1 y 2: confirmadas en el historial Git.
- Fase 3: módulo de Clientes implementado, incluidas reglas de tiers, crédito, documentos y promoción desde Pipeline.
- Fase 4: Inventario / Compras implementado, con catálogo, movimientos, CPP, bloqueo de stock negativo y UI operativa.
- Fase 5.1: modelo de Órdenes de Producción con folios OP atómicos, RLS de lectura, contratos TypeScript y validaciones Zod v4.
- Fase 5.2: consumo atómico de materiales por partida, salida de kardex, protección de stock, CPP histórico y cálculo de merma/desviación, aplicados y verificados en Supabase remoto.
- Fase 5.3: acciones server-side para OP, consumo y tiempo; sesión PIN contrastada con un operador activo; marcas con hora de PostgreSQL y estado de OP bloqueado; y tienda Zustand v5 de taller. Aplicada y verificada en Supabase remoto.
- Fase 5.4: control de piso funcional para tiempo, avance, scrap y consumo de material; interfaz privada de OP, RPC atómica de avance y E2E de navegador. Aplicada y verificada en Supabase remoto.
- Endurecimiento transversal de Fase 5: escritura de inventario restringida, helpers RLS privados, permisos separados de inventario/producción, asignación obligatoria de operador y sincronización automática de OP y piso. Aplicado y verificado en Supabase remoto.
- Próximo hito funcional: Fase 6 — Planeación.

## Reglas funcionales que no se deben romper

- Los errores que llegan a usuarios son genéricos; los detalles se registran internamente.
- Folios, límites, stock y cálculos concurrentes se resuelven en Postgres, nunca contando filas ni desde el cliente.
- La seguridad combina permisos server-side y RLS de Supabase.
- Toda actualización relevante de producción se propaga automáticamente: Realtime para usuarios autenticados y un relay sin payload para sesiones PIN.
- Los documentos de producción no muestran precios; las líneas comerciales y actividades internas son niveles distintos.
