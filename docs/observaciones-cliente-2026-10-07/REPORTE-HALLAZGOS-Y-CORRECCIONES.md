# Reporte de hallazgos y correcciones

Estado: vivo durante la implementación de `DC-01..DC-15`. Este reporte separa defectos corregidos, brechas planificadas y límites de validación. No sustituye la aceptación del Product Owner.

| ID | Severidad | Síntoma / impacto | Causa | Corrección o destino | Evidencia |
| --- | --- | --- | --- | --- | --- |
| ENV-01 | Media, entorno | El wrapper local abortaba aunque Supabase estuviera saludable, impidiendo gates seguros. | La advertencia normal de servicios opcionales detenidos llegaba por stderr y `$ErrorActionPreference='Stop'` la convertía en excepción. | Se captura salida/código de `supabase status`, se restaura la preferencia y solo se falla con código no cero. | Wrapper cargado y `validar-entorno.mjs` 1/1; loopback confirmado. Archivo local de coordinación, no producto. |
| ENV-02 | Media, coordinación IA | `sync-ai-skills.ps1 -Check` marcaba Skills sincronizadas como faltantes y el copiado intentaba escribir origen sobre sí mismo. | PowerShell no recorría junctions de `.claude/skills`. | La comprobación valida cada destino canónico por ruta/hash sin seguir recursivamente junctions desconocidos. | `-Check` final sin diferencias; Skill `orca-correcciones-cliente` disponible para ambos agentes. Archivo local de coordinación. |
| ENV-03 | Media, pruebas | El sembrador E2E fallaba con `email_exists` en entornos reutilizados con más de 100 usuarios. | Solo revisaba la primera página de GoTrue antes de intentar crear usuarios conocidos. | Búsqueda paginada hasta encontrar el correo o terminar resultados. | Ejecución local posterior correcta; commit `1ef5983`; `node --check` verde. |
| RFQ-01 | Alta, regresión de pruebas | Al retirar el tablero, tres E2E seguían buscando tarjetas `article`; los flujos de alta/Realtime/aceptación ya no podían localizar RFQ. | Selectores acoplados a la representación Kanban eliminada. | Selectores migrados a filas accesibles de tabla; una referencia residual detectada por TypeScript también se corrigió. | E2E 4/4, typecheck y lint focal verdes; commit `7bd9945`. |
| RFQ-02 | Baja, visual | El aviso de RFQ no editable mostraba `;. Marca`, con puntuación incorrecta. | Dos fragmentos JSX contenían puntuación duplicada. | Texto corregido a dos oraciones legibles. | Lint/typecheck focales del incremento donde se integre. |
| CV-01 | Media, funcional, pendiente | Un RFQ `READY_FOR_PROPOSAL` se bloquea antes de crear Rev A. | La UI/servidor usan el estado READY como frontera de edición heredada. | Resolver en C2.1: la frontera aprobada es crear Rev A, junto con snapshot y congelamiento atómico. | Hallazgo reproducido durante caracterización; documentado en `CARACTERIZACION-CORTE-0.md`. |

## Entregas funcionales

- Cola RFQ únicamente en lista, sin selector/tablero y con filtros/alta/estados conservados: `7bd9945`.
- Contratos compartidos de fechas, borrador, tarifa, Orden pendiente, Orden inmutable y Materiales/costos: `9230c3e`.
- Caracterización y baseline visual local en cuatro anchos y dos temas: `e25a863`.

## Límites actuales

- La auditoría global B1–B9 continúa pausada.
- No se han aplicado migraciones remotas, push, despliegue ni cambios en producción.
- Los flujos futuros de Orden pendiente, consumo sin stock, canal configurable, wizard y vista operador aún no están implementados; figuran en `tasks/todo.md`.
