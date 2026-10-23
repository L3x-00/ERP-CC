# Punto de control — Planeación (investigación en oleadas)

Estado a las 12:50 (2026-10-14), uso 53 %: **oleada 1 en curso** (carga-semanal, pantalla, programacion).

- Script armado y validado: `C:\Users\Usuario\.claude\checkpoints\planeacion-revision-cliente-2026-10-14\investigacion-planeacion.js` (config: `C:\Users\Usuario\.claude\usage-guard\wf\config-planeacion.part.js`; se reensambla con `wf\armar-workflow.ps1`).
- **Run ID: `wf_0fa78410-b68`** (task `wlbbe3kpd`). Journal: `C:\Users\Usuario\.claude\projects\d--ERP-CC\ab50e759-8577-45ee-8fa3-9b78b22de680\subagents\workflows\wf_0fa78410-b68\journal.jsonl`.
- Coherencia: los agentes leen `../ordenes-revision-funcional/PLAN-ORDENES-RESUMEN.md` (plan final de Órdenes: T1 cola+ficha destino · T2 identidad/origen/actividad · T3 ítems/ruta/archivos/hoja · T4 entrega/cierre/aceptación; orden estricto).

## Siguiente paso exacto
1. Al terminar la oleada 1: `node C:\Users\Usuario\.claude\usage-guard\informe-journal.js <journal.jsonl> D:\ERP-CC\docs\observaciones-cliente-2026-10-07\planeacion-revision-funcional\hallazgos\HALLAZGOS-wf_0fa78410-b68.md`; sonda de uso (`probe.js`); si < 65 %:
2. Oleada 2: `Workflow({scriptPath: <script>, resumeFromRunId: "wf_0fa78410-b68", args: {"fase":"olas","olas":[1,2]}})`.
3. Fase final (impacto, BD, pre-mortem, coherencia, plan, crítico) solo con uso < 55 %: mismo `resumeFromRunId`, **sin** args. Luego `node ...\informe-plan.js <journal.jsonl> <PLAN-PLANEACION.md> --digest`.
4. Presentar al PO ambos planes y esperar aprobación. SOLO investigación y plan: sin código ni ramas.

## Avance 12:58 (uso 74 %)
- Oleadas 1 y 2 HECHAS: 6/6 areas verificadas (12 agentes, sin errores, ~8 min). Informe: hallazgos/HALLAZGOS-wf_0fa78410-b68.md (regenerable con informe-journal.js).
- Falta SOLO la fase final (impacto, BD, pre-mortem, coherencia, plan, critico, plan final): requiere uso < 55 %, aviso programado 16:46. Comando: Workflow con el mismo scriptPath, resumeFromRunId wf_0fa78410-b68 y SIN args. Luego informe-plan.js --digest.
- ALERTA de coherencia: Ordenes (evento opcional) y Planeacion P10 (compatibilidad recurso-grupo) proponen la MISMA marca de migracion 20261014120000; deben escalonarse. P14 (capacidad real al cerrar) tambien requiere migracion.
