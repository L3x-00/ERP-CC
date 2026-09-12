# Auditoría UX/UI — estado para reanudar

> **ACTUALIZACIÓN 2026-09-11 (implementación):** el plan descrito abajo fue
> ejecutado sobre `src/`: tokens + primitivos + chasis de navegación + cortes por
> módulo. Ver `implementacion-2026-09-11.md` para alcance, pendientes y gates.
> Las secciones siguientes conservan el diagnóstico original como referencia
> histórica.

**Corte:** 2026-09-11 · **Agente:** Claude Code (Opus 4.8) · **Tipo:** read-only, sin tocar `src/`.

## Qué se hizo

Auditoría UX/UI visual completa contra el sistema de diseño pastel pedido por el
Product Owner. 14 auditores paralelos (uno por área) leyeron el código real.
**Resultado: 190 hallazgos — 66 🔴 críticos, 79 🟡 inconsistencias, 45 🔵 mejoras.**

## Entregables (todos en `entregables/auditoria-ux/`)

- `plan-desarrollo-ux.md` — **plan de desarrollo por fases** (cimientos → primitivos → chasis → cortes por módulo), matriz de cobertura, decisiones de stack, DoD y gobernanza. Insumo para que Codex registre encargos.
- `auditoria-ux-reporte.md` — reporte categorizado completo (🔴/🟡/🔵/✅) con código a aplicar.
- `hallazgos-crudos.json` — los 14 resultados estructurados sin procesar. **Fuente de verdad
  para reanudar** (área, archivos_revisados, resumen_estado, hallazgos[], bien_implementado[]).
- `tokens-propuesta.css` — sistema de diseño completo, Tailwind v4 `@theme inline` + `.dark`
  de next-themes, nombres de token en español.
- `componentes-base.md` — guía de uso de componentes fundamentales.
- `checklist-revision.md` — checklist pre-commit por pantalla.

## Hallazgo raíz (causa de la mayoría)

`src/estilos/globals.css` define solo 5 variables (`--background:#ffffff` blanco puro
prohibido, `--foreground`, `--primario`, `--secundario`, `--radius`). **No existe ninguno
de los tokens del sistema** (surface, border, text-*, semánticos, espaciado, sombras), así
que ningún módulo puede cumplir el design system: todos pintan con opacidades
(`text-foreground/60`) y colores crudos de Tailwind (`bg-amber-100`). Además faltan los
primitivos compartidos: solo hay `badge/button/input/label/dialog`; no hay
`Table/Card/Select/Textarea/Sheet/Toast/Tooltip/Skeleton/EstadoVacio/BadgeEstado`.

## Orden de implementación recomendado

1. Cablear tokens en `globals.css` (base de `tokens-propuesta.css`).
2. Construir/remapear primitivos compartidos contra los tokens.
3. Remapear módulo por módulo en orden de flujo: Layout/Nav → Dashboard → Pipeline →
   Clientes → Inventario → Órdenes → Planeación → Producción(piso, dark) → Cobranza →
   Gastos → Configuración → Comentarios → Auth/Portal.

## Áreas más urgentes

- **Layout global:** no existe sidebar/navegación entre módulos (estado Zustand
  `barraLateralContraida` huérfano, ningún componente lo consume). 0 responsive.
- **Producción-piso (dark):** 8 críticos — la pantalla más importante para el operador.
- **Gastos:** 7 críticos. **Inventario:** 6 críticos.

## Bug de correctness detectado de paso (fuera de lo visual)

`src/compartido/utilidades/formatear.ts` — `formatearMoneda` ignora la moneda y siempre
formatea en MXN; una cotización USD se muestra con símbolo/formato MXN. Reportar a Codex.

## Gobernanza / pendiente

- **Nada se integró.** No es un encargo registrado por Codex en `ACTIVE_TASKS.md`.
- Para implementar: Codex debe registrar el encargo (alcance, archivos, criterios) y
  recién entonces se toca `src/`. Este paquete es insumo para ese encargo.
- No se modificó `.ai-shared/` ni configuración ni Git.
