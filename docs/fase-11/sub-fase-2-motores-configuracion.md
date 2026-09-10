# Sub-fase 11.2 — Motores de configuración

## Objetivo

Centralizar la lectura y escritura de variables maestras para que cotizador,
rentabilidad y documentos consuman valores consistentes y con fallbacks.

## Implementación

`configuracion-servicio.ts` expone la lectura del singleton, fusión de valores
por defecto, tipo de cambio vigente, cuentas ordenadas y áreas ordenadas. Las
actualizaciones delegan en la RPC con lock de PostgreSQL. Las altas y ediciones
de catálogos se ejecutan con una sentencia administrativa única, protegida por
la Server Action que valida el permiso.

Las pruebas cubren fila ausente, JSONB parcial, plantilla histórica en raíz y
valores no finitos.

## Criterio contable

Cambiar una tarifa afecta cálculos futuros; las tarifas históricas que ya fueron
capturadas en sesiones u operaciones no se reescriben.
