# Sub-fase 10.2 — Métricas por rol y tendencias

`src/modulos/dashboard/servicios/dashboard-servicio.ts` llama exclusivamente
RPCs privilegiadas y construye tarjetas con variación frente al periodo
anterior. La respuesta se discrimina por rol:

- administrador: ejecutivas, pipeline de equipo, producción y contabilidad;
- gerente: pipeline de equipo, aprobaciones/alertas de producción, sin finanzas globales;
- vendedor: pipeline propio, seguimientos, meta y comisión;
- contador: CxC, aging, CxP y flujo de caja, sin margen ejecutivo;
- operador: redirección a `/produccion`.

`calcularVariacionPorcentaje` es una función pura. Normaliza entradas no
finitas, usa el denominador absoluto para utilidades negativas, redondea a dos
decimales y devuelve siempre `subio`, `bajo` o `neutro`; el caso de periodo
anterior cero no produce `Infinity`.
