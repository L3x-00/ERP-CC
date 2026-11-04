# Plan en tandas — Producción C13

Cada tanda deja el PR en verde, con migración solo local y pgTAP/e2e proporcional. El orden va de menor riesgo a mayor dependencia.

## C13.1 — UI del cierre del operador (sin migración)

**Alcance:** bloque de cierre colapsado con despliegue animado; un único formulario de consumo; material autocompletado desde la partida; alerta naranja preventiva cuando falta liberar la primera pieza; error de primera pieza en modal con acción inline. El PIN se mantiene.

**Archivos:** `detalle-proceso-operador.tsx`, `panel-operador-produccion.tsx`, estilos de animación; e2e de corridas y piso.

**Aceptación:** se reduce el scroll inicial; no hay consumo duplicado; el material aparece preseleccionado; el error bloqueante se resuelve sin cambiar de pantalla y sin cerrar el formulario; el aviso preventivo aparece antes de capturar.

**Riesgo:** bajo. No toca reglas ni base.

## C13.2 — Retrabajo (migración + UI + administración)

**Alcance:** casilla “Retrabajo” en el cierre; formulario completo (material, usado, merma, minutos, motivo, causa operador/cliente/material, notas); registro aparte que **no altera el avance**; descuenta inventario propio con costo CPP; visible en Producción y Seguimiento.

**Diseño propuesto:** tabla `retrabajos_produccion` (orden, partida, sesión, material, cantidades, minutos, causa, motivo, notas, actor, creado_en) + RPC `registrar_retrabajo_sesion` (SECURITY DEFINER, service_role) que valida sesión activa/permiso, aplica el consumo con la función de inventario existente y registra auditoría. Sin cambios al avance ni a las metas.

**Aceptación:** el retrabajo no mueve piezas producidas; el inventario baja exactamente lo declarado; el costo real sube; el administrador lo ve con causa y tiempo; pgTAP cubre permiso, avance intacto y descuento.

## C13.3 — Material del cliente (migración + Propuesta + Producción + Seguimiento)

**Alcance:** bloque “Material del cliente” por ítem en Ruteo/Costeo (catálogo + cantidad + unidad); congelado en el snapshot al aceptar; saldo por ítem en Producción; formulario de consumo **solo si aplica**; descuento del saldo del cliente sin costo ni inventario propio; bloqueo del cierre al exceder el saldo y pausa por falta de material con causa; seguimiento administrativo (entregado, consumido, saldo, pausas).

**Diseño propuesto:** tabla `material_cliente_item` ligada a la revisión de propuesta y copiada al snapshot de la orden; RPC `registrar_consumo_material_cliente` que valida saldo y registra el consumo sin tocar `registros_consumo_material` ni `movimientos_inventario`; reutiliza la pausa existente con un motivo nuevo o nota obligatoria.

**Aceptación:** los reportes y el costo de la orden no cambian; el saldo cuadra; el exceso bloquea; la pausa distingue cliente vs operador; pgTAP de saldo, bloqueo y aislamiento de inventario.

## C13.4 — Corrida integrada y tiempos por ítem (migración + UI + administración)

**Alcance:** casilla del operador para integrar 2+ ítems compatibles (mismo proceso y material) en una corrida; avance y tiempos por ítem al cerrar (minutos declarados, suma validada contra la sesión); metas y calidad independientes; vista administrativa que indique “ítems 1 y 2 en un solo proceso” con avance individual.

**Diseño propuesto:** reutilizar `corridas` + `corrida_items`; nueva tabla de tiempos por ítem por sesión (`sesion_tiempos_item`) o columnas en `corrida_items`; RPC de cierre extendida para recibir el desglose por ítem y escribir `registros_avance_partida` por partida.

**Aceptación:** no se pueden integrar ítems incompatibles ni saltarse primera pieza/disponibilidad; la suma de minutos no excede la sesión; el avance por ítem queda correcto; el administrador ve la integración y el avance individual; reglas de recurso y horas extra intactas.

## Orden de ejecución propuesto

1. **C13.1** (rápida, sin migración, valor inmediato).
2. **C13.2** (independiente).
3. **C13.3** (depende de Propuesta).
4. **C13.4** (reutiliza el material del cliente de C13.3).
