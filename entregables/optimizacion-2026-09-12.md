# Optimización y rendimiento — 2026-09-12

Auditoría realizada sobre el despliegue `erp-cc-flame.vercel.app` y la base
Supabase `pwnecbcynnqnvfwmvrnn` (región `ca-central-1`, Montreal), con datos de
demo sembrados.

## Aplicado en esta iteración

| Mejora | Impacto |
|---|---|
| `ReactQueryDevtools` solo en desarrollo | Menos JavaScript en producción (se eliminó del bundle servido) |
| `refetchOnWindowFocus: false` en TanStack Query | Evita reconsultas redundantes; Realtime e invalidaciones explícitas mantienen frescura |
| `loading.tsx` con skeletons en 9 rutas (órdenes, pipeline, clientes, inventario, planeación, producción, cobranza, gastos, configuración) | La navegación muestra estructura inmediata en lugar de pantalla congelada |
| `whitespace-nowrap` en encabezados y celdas de folio/fecha/partidas | Sin cortes de texto en tablas y kanban |
| Bloque "Antigüedad de cartera" sin duplicar el resumen finanzas (admin) | Dashboard más limpio y menos lectura repetida |

## Recomendaciones viables (pendientes de decisión)

1. **Región de funciones de Vercel = `yul1` (Montreal)** — es la palanca más
   grande: cada página hace entre 3 y 8 consultas a Supabase; acercar la
   función al dato ahorra decenas de milisegundos por viaje. Cambio de una
   sola configuración en Vercel, sin tocar código.
2. **Plan Vercel Pro** — el plan Hobby no permite uso comercial; además habilita
   analytics y más región/observabilidad.
3. **Prefetch de módulos en la barra lateral** — los ítems ya usan `next/link`;
   activar `prefetch` reduce la latencia percibida del primer clic.
4. **Advisors de Supabase periódicos** — `supabase inspect db outliers/long-running-queries`
   no muestran consultas de aplicación problemáticas hoy (solo el slot interno de
   Realtime). Repetir tras el primer mes de uso real y antes de cada fase.
5. **Índices a vigilar con volumen**: `movimientos_inventario(material_id, creado_en)`,
   `programacion_areas(orden_id)`, `logs(creado_en)`, `notificaciones_usuario(usuario_id, leida)`.
   En el estado actual (≤ decenas de filas) no hay beneficio medible.
6. **OCR de comprobantes**: el proceso es síncrono con timeout de 30 s. Si el uso
   crece, mover a un job en segundo plano con notificación, no bloquear el formulario.
7. **Catálogos estables** (materiales, clientes, tarifas): ya cacheados 5 min;
   si se navega mucho entre módulos, ampliar `staleTime` de catálogos a 30 min.
8. **Imágenes y PDF futuros**: usar `next/image` y generación en streaming; hoy
   no hay adjuntos servidos por la app.

## Hallazgos descartados (no son problema)

- El slot de replicación lógica de Realtime aparece como consulta larga: es
  infraestructura de Supabase, no una consulta del ERP.
- Bloat de tablas e índices: marginal (fixtures recién limpiados).
- Sin errores de consola ni respuestas HTTP ≥ 400 en la navegación auditada
  (25 capturas en escritorio, móvil y modo oscuro).
