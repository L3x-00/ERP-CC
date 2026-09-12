# Implementación UX/UI — 2026-09-11

**Base:** auditoría de 190 hallazgos (`auditoria-ux-reporte.md`) + plan por fases
(`plan-desarrollo-ux.md`). **Estado:** implementado sobre `src/`, gates locales en
verde. **Dependencias nuevas:** ninguna (los gráficos de la propuesta se resolvieron
con CSS/SVG propios).

---

## 1. Qué se implementó

### F0 · Cimientos de diseño (resuelve la causa raíz)

- `src/compartido/diseno/tokens.css` — sistema completo: superficies, texto,
  acento, semánticos (color/suave/texto), tiers, radios, espaciado, sombras,
  transiciones y utilidades (`.foco-anillo`, `.punto-en-proceso`,
  `.animar-entrada`, `.deslizar-derecha/izquierda`, `.skeleton-brillo`,
  `.select-flecha`, `.scroll-sutil`, respeto a `prefers-reduced-motion`).
  Incluye alias históricos (`--background`, `--foreground`, `--primario`,
  `--radius`) para no romper código previo.
- `src/estilos/globals.css` — importa los tokens, los expone a Tailwind v4 con
  `@theme inline` (utilidades `bg-superficie`, `text-texto-secundario`,
  `border-borde`, `shadow-md`, etc.), bordes por defecto del sistema y body
  sobre `--fondo` (nunca blanco puro).
- `src/app/layout.tsx` — tipografía **Inter** vía `next/font` (+ Geist Mono para
  folios/cifras).

### F1 · Biblioteca de primitivos

| Primitivo | Archivo | Qué aporta |
|---|---|---|
| `BadgeEstado` | `src/compartido/componentes/diseno/badge-estado.tsx` | Mapa único de ~25 estados ERP a color/etiqueta/punto; `en_proceso`/`vencida`/`en_uso` pulsan |
| `BarraProgreso` | `.../diseno/barra-progreso.tsx` | Avance de OP, aging, crédito y capacidad con tono semántico y a11y |
| `AvatarIniciales` | `.../diseno/avatar.tsx` | Iniciales deterministas con color estable |
| `Tarjeta*` | `.../diseno/tarjeta.tsx` | Superficie/borde/sombra/separadores del sistema |
| `Tabla*` | `.../diseno/tabla.tsx` | Contenedor scroll-x, encabezado sticky, zebra, hover, filas ≥48px |
| `Skeleton` / `SkeletonTabla` | `.../retroalimentacion/skeleton.tsx` | Carga estructural con shimmer |
| `EstadoVacio` | `.../retroalimentacion/estado-vacio.tsx` | Icono + título + descripción + CTA |
| `Button` | `.../ui/button.tsx` | Variantes por token y alturas 36/40/44/**48 (piso)** |
| `Input/Select/Textarea` | `.../ui/input.tsx` | Fondo `superficie-2`, foco con anillo, chevron, resize-y |
| `Label` | `.../ui/label.tsx` | Asterisco accesible con prop `obligatorio` |
| `Dialog` | `.../ui/dialog.tsx` | Overlay con blur, `rounded-xl`, footer sticky, entrada animada |

Guía de uso: `src/compartido/diseno/componentes-base.md`.
Checklist pre-commit: `src/compartido/diseno/checklist-revision.md`.

### F2 · Chasis de navegación (crítico #1 de la auditoría)

- `src/compartido/componentes/navegacion/` — `barra-lateral.tsx` (240px → 64px
  colapsable con `barraLateralContraida`, drawer <768px, grupos, ítem activo con
  borde izquierdo de acento, pie con avatar/rol/cerrar sesión), `encabezado-app.tsx`
  (56px sticky, hamburguesa, breadcrumb del módulo, notificaciones y usuario),
  `chasis-app.tsx`, `modulos-navegacion.ts` (10 módulos en 5 grupos),
  `filtrar-modulos.ts` (filtro por permisos), `iconos.tsx` (SVG inline).
- `(panel)/layout.tsx` y `(privado)/layout.tsx` unificados sobre `ChasisApp`;
  ya existe navegación real entre módulos (antes solo por URL).

### Cortes por módulo (remapeo + piezas del alcance)

- **Producción / piso (dark, táctil):** `control-piso-panel.tsx` con tokens,
  botones de 48px, badge pulsante, barra de progreso por partida y sección
  destacada "MI OP ACTIVA"; `teclado-pin.tsx` tokenizado conservando teclas de
  80px; Kanban con tarjetas ≥200px, folio mono y progreso; corregido el mojibake
  de `(privado)/produccion/page.tsx` y de los comentarios del sincronizador;
  `(piso)/layout.tsx` y `(auth)/operador` usan tokens dark.
- **Órdenes:** folio `OP-` monoespaciado, semáforo de fecha compromiso
  (vencida/≤3 días/normal), `BarraProgreso` por OP, `BadgeEstado`, tabla del
  sistema, estado vacío con CTA.
- **Inventario:** semáforo de stock de 3 estados (`estadoStock`:
  crítico/reorden/ok), CPP a 4 decimales, cantidades del kardex en verde/rojo,
  tablas, skeletons y estados vacíos.
- **Clientes:** avatar de iniciales, `BadgeEstado`, barra de crédito
  usado/(límite+saldo), tiers con tokens de metal, ficha como drawer accesible.
- **Pipeline:** toggle Tabla/Kanban con `tabla-oportunidades.tsx` nuevo,
  `BadgeEstado` de etapa, "N días en esta etapa", botón "Ganar" en primario
  (antes rojo), formularios del sistema.
- **Dashboard:** `loading.tsx` con skeletons, tendencias con color, tarjetas
  del sistema, banner de error con "Reintentar".
- **Cobranza:** aging en barras por bucket (con tono), vencido en rojo con días
  en tooltip, `BadgeEstado`, skeleton y banner de reintento.
- **Gastos:** semáforo de margen, botón OCR con icono de cámara y estados
  (analizando/éxito/error+reintento), distribución por categoría con barras CSS.
- **Configuración:** tabs con estado activo real, TC destacado con fecha y
  alerta >24 h, swatches de áreas, tablas/empty states del sistema, mensajes
  éxito/error semánticos.
- **Comentarios:** menciones `@usuario` resaltadas en azul suave sin HTML,
  avatares, centro de notificaciones como panel lateral deslizable con overlay
  y skeletons.
- **Autenticación:** login de oficina con tarjeta del sistema; PIN de operador
  en dark tokens.
- **Transversal:** remapeo automatizado de 46 archivos desde opacidades
  (`text-foreground/60`, `border-foreground/10`) y `bg-background` a los tokens
  del sistema; `formatearMoneda(cantidad, moneda, decimales)` corregido (antes
  ignoraba USD) y nuevo `formatearNumero`.

---

## 2. Cobertura frente a la auditoría

| Área | Críticos auditados | Estado en esta entrega |
|---|---|---|
| Layout/navegación | 3 | ✅ sidebar + drawer + header + responsive |
| Tokens/primitivos | 5 | ✅ tokens completos + primitivos base |
| Dashboard | 4 | ✅ tokens, skeletons, tendencias con color, error+reintento |
| Pipeline | 5 | ✅ toggle tabla, días en etapa, botón ganada, tokens |
| Clientes | 3 | ✅ avatar, barra de crédito, tiers, drawer a11y |
| Inventario | 6 | ✅ semáforo 3 estados, CPP 4 decimales, kardex con color |
| Órdenes | 5 | ✅ mono, semáforo fecha, progreso, tabla/empty |
| Planeación | 4 | ⏳ tokens y a11y; falta calendario recursos×días |
| Producción-piso | 8 | ✅ dark tokens, táctil ≥48px, "MI OP ACTIVA", progreso |
| Cobranza | 4 | ✅ aging en barras, vencido con días, skeleton/retry |
| Gastos | 7 | ✅ margen semáforo, OCR con icono/estados, distribución CSS |
| Configuración | 5 | ✅ tabs activos, TC destacado/alerta, swatches, empty |
| Comentarios | 4 | ✅ menciones resaltadas, avatares, panel lateral |
| Auth/Portal | 3 | 🟡 login/PIN listos; portal cliente sigue sin existir |

---

## 3. Pendientes explícitos

1. **Planeación — calendario recursos×días con bloques de color, semáforo de
   capacidad y tooltips**: el módulo quedó tokenizado, pero la vista sigue
   siendo una tabla de programaciones. Es un rediseño de componente (L).
2. **Gráficas reales**: se usaron barras CSS (sin dependencias). Si se desea
   línea/dona, evaluar `recharts` con React 19 antes de instalar.
3. **Sistema de toasts global**: hoy los éxitos son mensajes inline. Requiere un
   proveedor + migrar mutaciones; se dejó fuera para no ampliar el alcance sin
   dependencia acordada.
4. **Selector de cuenta bancaria destino en Cobranza**: la RPC ya lo soporta,
   pero no existe fuente de datos de `cuentas_bancarias` en el módulo; requiere
   Server Action/servicio (fuera del alcance visual).
5. **Galería `/diseno`** (plan F1) para revisión visual viva: no incluida.
6. **Auditoría de contraste AA fina por pantalla** y QA visual real en 3
   breakpoints/2 temas: el checklist queda como DoD para esa pasada.

---

## 4. Verificación

```text
pnpm typecheck          → 0 errores
pnpm lint               → 0 errores / 0 warnings
pnpm test               → 47 archivos / 382 pruebas
pnpm test:integracion   → 11 archivos / 47 pruebas
pnpm build              → 16 rutas, Inter cargada correctamente
```

Sin cambios de lógica de negocio, Server Actions, servicios, hooks ni tipos
(salvo la utilidad pura `estadoStock` y helpers de presentación). Sin
dependencias nuevas. `data-testid` y `aria-*` existentes conservados.
