# Evidencias E2E ORCA MFG — 2026-11-17

Carpeta de evidencias de la prueba de punta a punta ejecutada en **producción** (`https://erp-cc-flame.vercel.app`).
Reporte único: `../REPORTE_E2E_ORCA_20261117.md`.

## Estructura

| Carpeta | Qué demuestra |
|---|---|
| `00_sesion/` | Login admin y operador (PIN), menús, intentos de logout y volcados de rutas. `traza.jsonl` está en `_scripts/`. |
| `01_rfq/` | Alta rápida de cliente (prospecto → activo), captura de RFQ `RFQ-1126_08`, ítems, archivos DXF/PDF, validación y edición. Incluye `catalogo-produccion.md` con materiales/procesos reales. |
| `02_oportunidad/` | Verificación de que `/pipeline` redirige a `/rfq` (no existe pantalla de oportunidad). |
| `03_costeo/` | Ruteo por operación, origen de tarifa, costeo interno (Material/Otros), desglose de fabricación y persistencia tras recarga. |
| `04_propuesta_versiones/` | Creación de `CNC-1126_08`, versiones A/B/C, precios, PDFs, envíos, aceptación de B, historial y solo lectura de A/C. |
| `05_produccion/` | Asignación en Planeación, liberación de `O-1126_07`, tablero del operador, detalle de proceso, pausas y sesiones. |
| `06_horas_extra/` | Sin archivos: no se generó exceso de jornada en el caso; el flujo existe en código pero no se pudo provocar (ver incidencia M-4 del reporte). |
| `07_entrega_cobro/` | Cierre de piezas, consumo y error de MDF-12, entrega `NE-O-1126_07-01`, cobro `INVCNC-0000033`, cierre administrativo. |
| `08_documentos/` | Capturas del panel de PDF de la propuesta aprobada, ficha de orden y cierre. Tras B-2 se guardan además los binarios `propuesta-CNC-1126_08-B-Propuesta_CNC-1126_08-B.pdf` y `acta-entrega-NE-O-1126_07-01-Nota_de_entrega_NE-O-1126_07-01.pdf` (descarga directa, sin popup). |
| `09_ultimo_cambio/` | Pruebas C20/C21: textos de jornada, cierre en marcha ×2, formulario «Tiempo real de proceso», modal con soluciones, dos sesiones pausadas, enlace «ver el proceso anterior», sin borrado de sesiones, badge «Proceso completado». |
| `10_validacion_tecnica/` | Verificación de catálogo/costos y registro del cambio global de catálogo (MDF-12 $320). |
| `11_reverificacion/` | Re-verificación en producción tras el despliegue: aviso M-1, adjuntos M-2, estado terminal y bundle de M-5, y horas reales 0,01 h de B-1 (`resultado.md` + capturas). |
| `_scripts/` | Scripts Playwright ejecutados, `estado-caso.json` y `traza.jsonl` (eventos con ISO + hora Tijuana, usuario, etapa, acción, resultado y detalle). |

## Convención de nombres

Las capturas siguen `YYYYMMDDHHmmss-<descripción>.png`. Cada captura quedó registrada en `traza.jsonl` con su ruta y la URL exacta en el momento de la toma. Los `*.md` de cada carpeta son notas estructuradas con el resultado crudo de cada paso (incluye errores y mensajes literales de la UI).

## Datos ficticios del caso

Cliente `CLI-0038` · RFQ `RFQ-1126_08` · Propuesta `CNC-1126_08` (A/B/C, aprobada B) · Orden `O-1126_07` · Entrega `NE-O-1126_07-01` · CxC `INVCNC-0000033`. Todos los importes son ficticios y fueron creados únicamente para esta prueba; no se borraron datos de otros usuarios.
