# Fase 4 · Subfase 1 — Esquema, RLS y validaciones

## Objetivo

Crear el modelo de Inventario / Compras y garantizar que sus datos no puedan mutarse directamente desde clientes autenticados.

## Entidades

- `proveedores`: datos comerciales y de contacto.
- `materiales`: catálogo, doble unidad de medida, conversión, proveedor, merma, costo y existencias.
- `movimientos_inventario`: kardex inmutable de entradas, salidas, ajustes y devoluciones.
- `reservas_material`: disponibilidad comprometida por orden, preparada para Fase 5.

## Seguridad y datos

- RLS activa en las cuatro tablas; usuarios autenticados solo pueden leer referencias del taller.
- No hay políticas de escritura directa ni `WITH CHECK (true)`; las mutaciones se realizan por Server Actions con permiso.
- `generar_folio_inventario()` usa secuencia atómica y solo puede ejecutarla `service_role`.
- Las migraciones reconcilian timestamps de despliegues anteriores y regeneran tipos Supabase para las nuevas tablas.
