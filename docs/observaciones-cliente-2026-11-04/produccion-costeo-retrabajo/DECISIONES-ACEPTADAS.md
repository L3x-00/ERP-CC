# Decisiones aceptadas — Producción 2026-11-04

| Pregunta | Decisión del PO |
|---|---|
| Q1. Declaración de material del cliente | **A.** Bloque nuevo por ítem en Ruteo/Costeo: material del catálogo + cantidad + unidad. El costeo interno monetario se conserva intacto. |
| Q2. Catálogo del material del cliente | Implícita en A: se usa el catálogo de materiales para comparar consumo y descontar saldo. |
| Q3. Material del cliente insuficiente | **A.** El cierre se bloquea si el consumo supera el saldo; se ofrece pausar por falta de material con causa (cliente no entregó suficiente / error del operador). No toca inventario propio ni crea deuda. |
| Q4. Costo del retrabajo | **A.** Descuenta inventario propio y suma al costo real de la orden. Queda registrado; sin aprobación previa (solo control administrativo). |
| Q5. Tiempo por ítem en corrida integrada | **A.** Minutos declarados por ítem al cerrar, validando que la suma no exceda la duración de la sesión. |
| Q6. Quién integra los ítems | **A.** El operador al gestionar el proceso (casilla marcable). |
| Q7. PIN del cierre | **C.** Se mantiene como está. |
| Q8. Foto de evidencia en inspecciones | Pendiente: por ahora queda sin foto (no se implementa). |
