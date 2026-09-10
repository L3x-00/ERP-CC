# Sub-fase 11.3 — Server Actions, auditoría y Zustand

## Implementación

Se añadieron acciones para guardar empresa, tarifas, tipo de cambio, cuentas,
áreas y plantilla T1. Todas siguen el borde `safeParse → sesión → can() →
servicio → registrarLog() → respuesta genérica`; los detalles técnicos quedan
solo en consola y auditoría interna.

La auditoría de cuentas registra identificador, moneda, estado y presencia de
CLABE, nunca los números completos. `usarTiendaConfiguracion` mantiene un
snapshot efímero para formularios y consumidores visuales, sin localStorage ni
uso como autorización.

Las pruebas de integración verifican el rechazo de vendedor, contador y
operador, además de actualización autorizada por admin/gerente y creación de
log.
