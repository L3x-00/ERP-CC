# Fase 4 · Subfase 2 — Servicios y movimientos atómicos

## Operaciones disponibles

- Alta de material y proveedor.
- Entrada de compra con conversión de unidad y costo promedio ponderado (CPP).
- Salida de producción con validación de existencia.
- Consulta de materiales, proveedores y movimientos.

## Garantías de `registrar_movimiento_inventario`

La función SQL toma un bloqueo `FOR UPDATE` sobre el material. Dentro de la misma operación valida cantidades, rechaza un stock final negativo, calcula el CPP para compras, genera folio, inserta el movimiento de kardex y actualiza el material.

Esto evita la condición de carrera donde dos operadores consumen el mismo material simultáneamente. Los errores internos se registran y las acciones devuelven mensajes genéricos a la interfaz.
