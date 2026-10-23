# Hallazgos parciales — área «actividad-pestanas» (R10, R19)

Rescatados del transcript del agente `leer:actividad-pestanas` (workflow cortado por límite de uso el 2026-10-13, ~176 mensajes y 60 archivos leídos; su salida estructurada completa se perdió: solo sobrevivió el inicio del resumen). **Son pistas del agente, sin verificar por un segundo revisor: confirmar con evidencia (archivo + líneas) antes de darlas por ciertas.**

- La ficha `/ordenes/[id]` (`ficha-orden.tsx`) ya tiene **7 pestañas con los rótulos que pide el cliente**: Resumen, Ítems / Partidas, Ruta / Operaciones, Archivos vivos, Entregas, Actividad, Documento (esta última oculta sin `ver_finanzas`).
- La página lee todo con el cliente `service_role` tras `can(orden_vista)`.
- La pestaña **Actividad se alimenta solo de `orden_eventos_cambio`** (últimos 50, descendente; `ficha-orden-servicio.ts` ~l.85-90). Nunca lee `comentarios_registro` ni `logs` → **Actividad y Comentarios ya están separados en datos**.
- `orden_eventos_cambio` solo la escriben RPC `SECURITY DEFINER`: `orden_creada` / `orden_interna_creada` (vía `crear_orden_desde_revision`), `orden_liberada`, `cierre_administrativo`, `ajuste_operativo`, `programacion_inicial`, `reprogramacion_operativa` (y `ajuste_post_aceptacion`, solo histórico).
- Las transiciones derivadas (`PLANIFICADA`, `EN_PRODUCCION`, `PRODUCCION_COMPLETADA`) las hacen **triggers que no dejan evento** (migración B5); **cancelación, reactivación y entrega tampoco** emiten evento de negocio (solo log técnico o nada).
- La UI pinta `evento.tipo` **crudo** (el E2E lo fija), sin hora; `ResumenCambio` muestra `recurso_id` como UUID (choca con R03).
- **Comentarios** solo existen como diálogo de la cola (`ordenComentarios`); la ficha no tiene ninguna superficie para ellos (reubicar antes de retirar de la cola, R02).
- Existe una tercera capa distinta: la **bitácora técnica** `logs` + RPC `obtener_actividad` (`/actividad` y pestaña RFQ).
- Ajuste mínimo sugerido por el agente: (1) una migración con 2 triggers que emita los eventos faltantes sin tocar Planeación/Producción/Entregas; (2) un diccionario de etiquetas y el panel de Actividad extraído a componente; (3) en pestañas, microcopy con la pregunta de cada una, Resumen sin duplicados y una 8.ª pestaña «Comentarios» con redirect del deep link existente.
