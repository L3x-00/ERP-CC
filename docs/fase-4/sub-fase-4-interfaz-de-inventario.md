# Fase 4 · Subfase 4 — Interfaz operativa

## Pantalla `/inventario`

- Métricas de existencias y alertas de stock bajo.
- Tabla de materiales con filtros, búsqueda y paginación de 25 registros por página.
- Tabla de movimientos para consultar el kardex.
- Modal de creación de material.
- Modales de entrada y salida con bloqueo de envío mientras se procesa la solicitud.

## Calidad de formularios

Los formularios se montan dentro del contenido de cada diálogo. Al cerrar el diálogo, React Hook Form se desmonta y abre limpio la próxima vez, evitando campos sucios o estado persistente.

## Pendiente intencional

La edición de material permanece deshabilitada porque no se incluyó una acción `actualizarMaterialAccion`; se implementará como mejora acotada si el negocio la prioriza.
