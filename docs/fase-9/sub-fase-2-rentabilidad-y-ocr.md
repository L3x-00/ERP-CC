# Sub-fase 9.2 — Motor de rentabilidad y lectura de comprobantes

## Rentabilidad por orden

La migración `20260909224640_fase_9_motor_rentabilidad.sql` expone la RPC
`obtener_rentabilidad_orden(uuid)`, ejecutable solo por `service_role`. El
resultado se expresa en MXN y separa:

- venta explícita de `cuentas_por_cobrar` (nunca se infiere desde Producción o
  cotizaciones);
- materiales consumidos, incluyendo `cantidad_usada + cantidad_scrap` al
  CPP capturado en cada movimiento;
- mano de obra con horas netas y `costo_hora_interno` histórico de cada sesión;
- gastos ligados a la orden, excluyendo los cancelados;
- costo total, utilidad, margen y contadores de componentes faltantes.

La capa pura `rentabilidad-servicio.ts` replica estas reglas para pruebas y
presentaciones locales, redondea a cuatro decimales, rechaza valores no finitos
y deja el margen como `null` cuando no existe ingreso válido.

## OCR de comprobantes

`ocr-servicio.ts` llama a la API de Anthropic únicamente desde el servidor. La
clave y el modelo se leen del entorno (`ANTHROPIC_API_KEY` y
`ANTHROPIC_MODEL`), el archivo se limita a 5 MiB y a imagen/PDF, la respuesta se
extrae como JSON y se valida con Zod v4 antes de regresar al formulario. No se
guardan imágenes ni secretos y los errores se convierten en códigos internos
seguros.

## Evidencia

Las pruebas unitarias cubren CPP con merma, tarifas históricas, conversión
MXN/USD, exclusión de gastos cancelados, ausencia de CxC, redondeo, valores
`NaN`/`Infinity`, cuerpo de la solicitud Anthropic, PDF, límites y respuestas
ilegibles. No se realiza ninguna llamada real al proveedor durante las pruebas.
