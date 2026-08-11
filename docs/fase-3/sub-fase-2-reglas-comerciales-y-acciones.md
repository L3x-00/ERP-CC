# Fase 3 · Subfase 2 — Reglas comerciales y acciones

## Tiers y crédito

- El consumo de los últimos tres meses determina el tier base: Bronce desde $0, Plata desde $50,000, Oro desde $150,000 y Platino desde $300,000.
- Los descuentos asociados son 0%, 3%, 5% y 8%.
- Un administrador puede asignar un tier manual válido por 90 días; al vencer vuelve a aplicar la evaluación automática.
- El crédito disponible se calcula con límite + saldo a favor − saldo usado. El módulo prepara el bloqueo de órdenes cuando se excede.

## Acciones implementadas

- Crear y actualizar cliente con Zod v4 y validaciones de RFC, correo, dirección y condiciones de pago.
- Asignar tier manual con autorización administrativa.
- Subir y registrar documentos del cliente.
- Vincular un cliente desde Pipeline.

## Promoción desde Pipeline

Al ganar una oportunidad, `promoverAClienteSiNoExiste()` busca por RFC, razón social y correo. Si encuentra un cliente, solo completa campos vacíos; si existe una carrera, vuelve a consultar tras el conflicto único. Así evita perder información o crear duplicados.
