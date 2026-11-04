# Decisiones pendientes — Cierre administrativo y entregas

Cada respuesta cambia el cálculo o la pantalla. Recomendación marcada.

## Q1. Base del estimado
¿Contra qué se compara lo real?
- **A (recomendada):** la **revisión aceptada de la propuesta** (`ordenes_produccion.propuesta_revision_id`), que conserva ruteo, horas, tarifas y costos del momento de aceptar.
- B: el snapshot de la orden (puede no traer costos).
- C: los datos actuales de la propuesta (puede haber cambiado después).

## Q2. Costo real de mano de obra
No se guarda un costo por sesión; solo horas netas.
- **A (recomendada):** horas reales por proceso × la **tarifa congelada** de la fila de ruteo del mismo proceso. Estable y comparable.
- B: horas reales × la tarifa vigente del grupo (cambia si el tarifario se actualiza).
- C: no costear mano de obra; mostrar solo horas.

## Q3. Retrabajo en el comparativo
- **A (recomendada):** sumar sus **minutos** al tiempo real y su **material** al costo real. Es trabajo y material que la orden consumió.
- B: mostrarlo aparte, sin afectar los porcentajes.
- C: excluirlo.

## Q4. Significado de “estuviste al %”
- **A (recomendada):** **desviación de costo** (real vs estimado) como indicador principal, y el **margen real** como KPI separado.
- B: margen sobre la venta como indicador único.
- C: cumplimiento de piezas/entrega.

## Q5. Umbrales de color
- **A (recomendada):** verde ≤ −10 %, ámbar entre −10 % y +10 %, rojo ≥ +10 % (en margen, invertido).
- B: ±5 %.
- C: ±15 %.

## Q6. Ventana de tendencia
- **A (recomendada):** **últimas 20 órdenes cerradas**, sin importar la fecha.
- B: últimos 90 días.
- C: último año fiscal.

## Q7. Entregas: alcance
- **A (recomendada):** historial por orden + pendiente en tiempo real + descarga de cada nota; botón deshabilitado con motivo si no hay piezas producidas.
- B: solo historial y pendiente (sin descarga).
- C: además permitir anular una nota desde el historial (requiere reglas nuevas).

## Q8. Exportación del cierre
- **A (recomendada):** PDF de una página por orden (comparativo y puntos críticos) para administración.
- B: CSV de la tabla.
- C: ambas.
