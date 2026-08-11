# Fase 2 · Subfase 1 — Pipeline comercial y cotización

## Objetivo

Implementar el flujo comercial desde prospecto hasta oportunidad ganada o perdida, con folios seguros y cotización manual.

## Implementado

- Pipeline con etapas Prospecto, Contactado, Cotizado, Negociación, Ganada y Perdida.
- Folio `OP-XXXX` al crear prospecto y `CNC-MMYY-XXXX` al llegar a Cotizado.
- Transiciones con validaciones, motivos de pérdida y permiso de aprobación para Ganada.
- Formularios de prospecto y cotización, tablero Kanban, tarjetas, alertas y cálculo de totales.
- Líneas comerciales para cliente y base preparada para actividades internas de producción.
- Adjuntos de Pipeline en Storage y servicios de descarga/eliminación.

## Pruebas destacadas

Las pruebas unitarias cubren reglas de transición, totales y alertas; las de integración validan generación concurrente de folios y promoción de oportunidad a cliente.
