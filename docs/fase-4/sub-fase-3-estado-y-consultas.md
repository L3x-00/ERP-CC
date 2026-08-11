# Fase 4 · Subfase 3 — Estado y consultas

## Implementado

- Tienda Zustand de filtros y búsqueda para Inventario.
- Hooks TanStack Query para materiales, movimientos y mutaciones.
- Invalidación de la clave `['inventario']` después de una mutación exitosa.
- Sanitización compartida del término de búsqueda antes de enviarlo a consultas PostgREST.

## Criterios de calidad

Los hooks se declaran con el patrón compatible con React Hooks y consumen selectores Zustand estables. La búsqueda se aplica con debounce para evitar una consulta por cada tecla y la página vuelve al inicio cuando cambian filtros.
