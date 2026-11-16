# Alcance

El sistema está en producción y cubre el ciclo completo de manufactura. Este documento describe qué incluye la versión operativa, qué límites se mantienen por decisión del PO y qué decisiones de negocio siguen abiertas.

## Módulos entregados

| Área | Módulos | Alcance operativo |
| --- | --- | --- |
| Acceso | Autenticación, Permisos, Auditoría | Sesión SSR, vista de operador por PIN, matriz de permisos por rol y bitácora de acciones |
| Comercial | Pipeline, RFQ, Propuestas, Clientes | Folios comerciales atómicos, captura técnica, costeo, archivos, tiers, crédito y cliente 360° |
| Abastecimiento | Inventario, Compras | Materiales, proveedores, kardex, CPP, stock negativo bloqueado y compras con estados |
| Producción | Órdenes, Planeación, Producción y piso, Entregas | OP con folios atómicos, capacidad por turno, sesiones de operador, avance/scrap inmutables y notas de entrega sin precios |
| Finanzas | Cobranza, Tesorería, Gastos y egresos, Facturación | CxC desde OP terminada, pagos y saldo a favor atómicos, flujo por cuenta, rentabilidad por orden y facturas internas |
| Gestión | Dashboard, Cierre administrativo, Configuración, Comentarios | Métricas por rol, cierre de costo y margen, configuración maestra en seis secciones y notificaciones por mención |
| Producto | Documentación en la app | Guías operativas dentro del sistema (`content/docs`) |

## Límites actuales

- **CFDI/PAC:** el ERP emite y cancela facturas internas, pero **no timbra** comprobantes fiscales. Falta definir proveedor y alcance fiscal.
- **Portal de cliente:** el dominio y las rutas están preparados; no hay flujo operativo habilitado.
- **Ajuste manual del costo real (F10):** parcial por decisión del PO; el costo se completa en el cierre administrativo.
- **Parser automático DXF:** diferido; la cotización parte de captura manual y RFQ.
- **Analítica avanzada:** el dashboard cubre los roles actuales; no hay BI externo ni reportes configurables.
- **Migraciones:** las migraciones nuevas se crean y validan en local; el PO las aplica en Supabase remoto antes del despliegue.

## Decisiones de negocio pendientes

- Determinar si un vendedor puede marcar una oportunidad como Ganada sin aprobación de gerente o administrador.
- Definir el alcance de facturación electrónica mexicana (PAC, complementos y cancelaciones fiscales).
- Confirmar tarifas de máquina, merma operativa y reglas definitivas MXN/USD antes de cerrar la configuración de costos.
- Priorizar las observaciones de [Análisis de UI y configuración](analisis-ui-configuracion.md).

## Documentos relacionados

- [Estado actual](estado-actual.md) · [Contexto](contexto.md) · [Arquitectura](arquitectura.md)
