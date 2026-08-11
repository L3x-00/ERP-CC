# Fase 3 · Subfase 1 — Modelo de clientes y seguridad

## Objetivo

Expandir la tabla mínima de Clientes creada por Pipeline a una ficha comercial, fiscal y de crédito.

## Implementado

- Campos de razón social, condiciones de pago, estado, límite de crédito, saldo a favor y direcciones fiscal/envío.
- Tiers Bronce, Plata, Oro y Platino, con tier manual y vencimiento obligatorio.
- Restricciones de crédito no negativo, estado, condiciones de pago y coherencia de tier manual.
- Índices de consulta por estado/tier y deduplicación por razón social sin distinguir mayúsculas.
- Tabla `documentos_cliente` para metadatos y bucket privado `documentos-cliente` para CSF, contratos e identificaciones.

## Seguridad

La lectura requiere el permiso `ver_clientes` o administración. No se habilitan mutaciones directas por PostgREST: las escrituras se ejecutan mediante acciones de servidor autorizadas.
