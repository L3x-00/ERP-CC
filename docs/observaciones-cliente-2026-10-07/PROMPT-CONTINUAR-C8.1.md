Eres un desarrollador delegado en el repo ORCA MFG ERP (D:\ERP-CC; Next.js 16 + TypeScript + Supabase; código y nombres 100 % en español). Vas a ejecutar la tanda C8.1 de las correcciones del cliente sobre el módulo Órdenes. NO releas el sistema ni el historial de otro chat: todo el contexto está en archivos.

CONTEXTO (ya hecho; NO se ha tocado código)
- El cliente envió 3 notas de revisión funcional (Órdenes, Planeación y Capacidad, Finanzas/Tesorería). Se investigaron en oleadas verificadas y se planificaron en 12 tandas de 5 requisitos (C8.1–C8.4 Órdenes, C9.1–C9.4 Planeación, C10.1–C10.4 Finanzas). Principio: AJUSTAR, no rehacer (MVP del propio cliente).
- Orden global: C8.1 → C8.2 → C9.1 → C8.3 → C9.2 → C8.4 → C10.1 → C10.2 → C9.3 → C9.4 → C10.3 → C10.4. Un PR por tanda; el PO fusiona; tú nunca mergeas.
- Todo está en docs/observaciones-cliente-2026-10-07/ (sin versionar): LEEME-EJECUCION.md (punto de entrada), fichas-de-tanda/ (una ficha por tanda), PREGUNTAS-CLIENTE-2026-10-14.md y MAPA-RESPUESTAS-A-PLAN.md (preguntas abiertas al cliente), ordenes-/planeacion-/finanzas-revision-funcional/ (requerimiento y planes; NO los leas completos), COLA-DE-TRABAJO.md.

TU ENCARGO: C8.1 «Cola mínima y ficha como destino» (R01, R02, R14, R15, R19). Autorizado por el PO el 2026-10-15.
- Lee en este orden: AGENTS.md, CLAUDE.md, docs/CUELLOS-DE-BOTELLA.md (obligatorio), docs/observaciones-cliente-2026-10-07/LEEME-EJECUCION.md y la ficha docs/observaciones-cliente-2026-10-07/fichas-de-tanda/C8.1-cola-minima-y-ficha-como-destino.md (trae evidencia archivo:líneas, 9 pasos, pruebas y comandos focales, riesgos y criterios de aceptación). No explores el módulo más allá de esos rangos.
- Usa la skill orca-ejecutar-tanda (apoyo: orca-correcciones-cliente, orca-testing, orca-ui-review) y cierra con cerrar-tanda (PR verde, sin mergear).
- Resumen de la tanda (el detalle y el orden exacto están en la ficha):
  1. Primer commit mecánico: extraer los paneles de ficha-orden.tsx (581 líneas) a componentes pequeños SIN cambiar data-testid.
  2. Ficha como destino: Comentarios como 8.ª pestaña (HiloComentarios, entidadTipo 'orden'), botón Adjuntos para órdenes con idHistorico, y en /ordenes/page.tsx redirect de ?ordenId={uuid} a /ordenes/{id} DESPUÉS del notFound() de orden_vista y validando con z.uuid() (5 enlaces profundos dependen de esa URL).
  3. Cola: columnas Folio/Estado/Prioridad/Compromiso/Partidas/Avance + Abrir + UNA acción contextual (Liberar). Retirar de la fila Cerrar, Comentarios, Documento, Adjuntos y Cancelar SOLO después de reubicarlos en la ficha.
  4. Retirar Reactivar y Repetir: botones, diálogos, Server Actions, servicios y esquemas Zod, en la cola y en la tarjeta de Planeación (podar la cadena de la prop puedeAdministrar en sus 6 archivos). Conservar las RPC, las migraciones y sus pruebas pgTAP/integración.
  5. Constante PREGUNTAS_PESTANA con la pregunta de cada pestaña (R19).
  6. Migrar las pruebas que fijan testids/URL retirados (ordenes-estados-sii.spec.ts, clientes-historial.spec.ts, planeacion-bolsa-acciones.spec.ts:195-207, ordenes-heredadas-reactivacion, tabla-ordenes-c4-3, etc.; la ficha las lista).
  Cada paso: caracterización verde → RED → GREEN. C8.1 NO lleva migraciones.

DECISIONES (el cliente aún NO respondió; el PO autoriza avanzar con estos defaults del plan)
- O-03 Repetir → retirar sin reemplazo. O-07 Reactivar → retirar sin reemplazo (la nota del cliente pide retirar o deshabilitar). Comentarios: 8.ª pestaña.
- No registres nada en DECISIONES-ACEPTADAS.md hasta el PR de cierre y con autorización del PO.
- No asumas nada más: si una duda de negocio no está en la ficha, repórtala en vez de decidir.

REGLAS NO NEGOCIABLES
- Ajustar, no rehacer; cambio mínimo; reubicar antes de retirar; nunca any; Zod para entradas; can() antes de mutar; hooks con alias en español.
- Confidencialidad: ninguna proyección nueva expone precios/costos/IVA/totales; nada de select('*') ni spread del snapshot.
- Pruebas: solo las focales de lo editado + pnpm typecheck + eslint focal; pnpm typecheck ANTES de cualquier E2E; E2E con loopback (script de cerrar-tanda); .env.local es PRODUCCIÓN: ninguna prueba mutante lo usa. Fechas relativas, PIN aleatorio, limpiar residuales E2E.
- Git: la rama actual (fix/propuesta-tarifario-unico-costos-item-plegable) está una detrás de origin/main (950b7a6, PR #62). Crea la rama así: git fetch origin && git switch -c feat/ordenes-cola-minima-ficha-destino origin/main. Añade archivos por ruta (nunca git add -A). NO incluyas en el PR: los docs sin versionar (docs/observaciones-cliente-2026-10-07/), las skills nuevas (.agents/skills/orca-ejecutar-tanda y orca-revision-modulo), ni el bloque de estado añadido a tasks/todo.md, salvo que el PO lo pida. NO toques supabase/migrations/20261014110000_tarifario_unico_estacion_grupo.sql (tiene un typo local en un comentario; el PO dijo no restaurarlo) ni lo agregues. Nada remoto: sin supabase db push/repair y sin merge.

AL TERMINAR reporta: archivos cambiados, pruebas y typecheck con resultado, E2E ejecutados, riesgos, pendientes y nivel alcanzado (local / remoto / despliegue / aceptación del cliente). Actualiza el estado de C8.1 en docs/observaciones-cliente-2026-10-07/COLA-DE-TRABAJO.md.
