# Auditoría funcional y paridad — ORCA MFG ERP

## Continuidad de implementación — 15 de septiembre de 2026

La auditoría y sus conteos inferiores conservan el corte original. Después se autorizó implementar sus 164 requisitos. El avance de código está confirmado localmente en `codex/cobertura-funcional` hasta `3a6cd4e`:

| Commit | Avance local |
|---|---|
| `010eedf` | Tier vigente más favorable para el cliente |
| `f5a636c` | Editor de cotizaciones y guardado atómico con control de concurrencia |
| `8fe5e0d` | Historial de clientes y filtros comerciales |
| `8b0e586` | Historial y recibos de cobranza, selección bancaria y protección de reintentos |
| `3a6cd4e` | Cotizador por procesos, lectura DXF/EPS y cálculo versionado por partida |

**La implementación y aceptación completas siguen pendientes.** El cotizador todavía necesita tarifas centrales configuradas y adjuntar/recuperar planos, además del resto de brechas del catálogo. La matriz inicial no se ha reclasificado como evidencia de aceptación de estos cambios.

El cierre local del 14/09 registró tipos, lint y build de 17 rutas aprobados; pruebas en corridas separadas (64 archivos/536 casos, 8 archivos/40 casos con repeticiones y 2 archivos/7 casos tras correcciones finales). SQL aislado con PGlite: 30 casos de cotización y 24 de pagos/bancos. La navegación se comprobó con componentes reales y datos ficticios. Estos resultados no equivalen a E2E autenticado, concurrencia multiconexión ni aceptación contractual. El 15/09 se sincronizó documentación, sin volver a ejecutar pruebas de aplicación.

Las migraciones `20260914044042`, `20260914185720` y `20260915000539` permanecen locales en esta tarea. Su publicación necesita validación aislada y coordinación con el frontend; no se aplicaron a producción. Para continuar, contrastar cada ID del catálogo y sus criterios contra el código actual, completar brechas y registrar evidencia antes de declarar cobertura total.

## Corte histórico de auditoría

Corte: 13 de septiembre de 2026. Versión objetivo: `9209de8`. Auditoría documental y pruebas locales terminadas; aceptación funcional E2E pendiente.

**164/164 requisitos inventariados y clasificados**, con evidencia de código separada de evidencia ejecutada. No se modificó el producto ni se operó producción.

| Clasificación | Requisitos |
|---|---:|
| conservada verificada | 0 |
| equivalente verificada | 0 |
| cobertura parcial | 115 |
| no cubierta en el alcance revisado | 34 |
| no verificable por datos/acceso/servicio | 8 |
| sustituida por observación | 3 |
| decisión pendiente | 4 |

**Cobertura funcional verificada: 0/157 = 0 %.** Hay capacidades implementadas y 427 pruebas locales aprobadas; ninguna demuestra por sí sola todos los puntos de entrada, guardado, recuperación y dependencias de un requisito completo.

Se excluyen solo requisitos clasificados sustituidos o decisión pendiente; las dependencias no verificables permanecen dentro. Las 16 decisiones tienen inventario separado y no se restan de nuevo.

Las 41 pruebas E2E del catálogo siguen sin ejecución. No se certifica la cadena comercial → taller → entrega → cobro. Se localizaron brechas de acceso, cálculo, documentos y continuidad antes de intentar pruebas mutantes.

- [Informe navegable y buscador por ID](informe.html)
- [Matriz completa para Excel](matriz-cobertura.csv)
- [Informe de procesos, accesos, decisiones y capacidades adicionales](informe-procesos.md)
- [Backlog por requisito y criterio de aceptación](backlog-cobertura.csv)
- [Registro de los 41 casos E2E](registro-e2e.csv)
- [Evidencia ejecutada y límites](evidencias/ejecucion.md)
- [427 casos locales y resultados](evidencias/casos-locales.csv)
- [Referencias de código con huella de archivo](evidencias/referencias-codigo.json)
- [Conteos reproducibles](resumen.json)

Para reproducir los documentos: `python docs/auditoria-funcional-2026-09-13/generar-informe.py`. Solo procesa los archivos locales de auditoría. Las evaluaciones TSV son los juicios por ID; la matriz resultante es la entrega consolidada. El informe de procesos explica las decisiones y el cierre.
