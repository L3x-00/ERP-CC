# Plan de desarrollo — Elevación UX/UI a nivel profesional · ORCA MFG ERP v2

**Fecha:** 2026-09-11 · **Base:** auditoría de 190 hallazgos (`auditoria-ux-reporte.md`) · **Autor:** Claude Code (Opus 4.8)

> **Naturaleza:** propuesta de ingeniería, read-only. Es el **insumo** para que Codex
> registre encargos en `ACTIVE_TASKS.md`. Cada fase se implementa solo cuando Codex la
> delega. Este plan no integra nada por sí mismo.

---

## 1. Objetivo — qué significa "nivel superior" aquí

Un ERP que se sienta **profesional, adaptativo, responsivo, animado, interactivo y
accesible**, sobre una paleta calmada de grises pastel, con **una sola** forma de hacer
cada cosa (un botón, una tabla, un estado). Concretamente:

- **Profesional:** sistema de diseño coherente; cero colores crudos, cero blanco puro.
- **Adaptativo:** modo claro (oficina) y oscuro (piso de taller) desde el mismo token layer.
- **Responsivo:** desktop / tablet / mobile reales, con sidebar→drawer y tablas con scroll-x.
- **Animado:** micro-interacciones sobrias (150–300ms), nunca decorativas, con `prefers-reduced-motion`.
- **Interactivo:** estados de carga/vacío/error/éxito diseñados en todas las pantallas.
- **Accesible (WCAG AA):** contraste 4.5:1, foco visible, roles/labels, targets ≥44px (≥64px piso).

## 2. Diagnóstico en una frase

**El 100 % de los módulos falla por la misma raíz:** no existe la capa de tokens del
design system ni la biblioteca de primitivos compartidos, así que cada módulo improvisa con
opacidades (`text-foreground/60`) y paleta cruda de Tailwind (`bg-amber-100`, `bg-zinc-950`).
De los 190 hallazgos, **la gran mayoría de los 79 de inconsistencia se disuelven al arreglar
la raíz una sola vez.** Por eso el plan es **cimientos primero, luego cortes verticales por
módulo** — no parche por parche.

## 3. Estrategia recomendada (la más viable)

**a) Design system como producto, no como CSS suelto.**
Token layer en `globals.css` → biblioteca de primitivos en `src/compartido/componentes/` →
una **galería interna** (`/diseno`, solo dev) que renderiza cada primitivo como referencia
viva y superficie de revisión visual (Storybook-lite sin dependencia extra).

**b) Cortes verticales por módulo.** Tras los cimientos, cada módulo es un encargo cerrado:
"remapear a primitivos + añadir las piezas del alcance que faltan + estados + a11y +
responsive", con el `checklist-revision.md` como Definition of Done.

**c) Dos carriles en paralelo tras los cimientos.**
- **Carril Oficina** (claro): Dashboard, Pipeline, Clientes, Inventario, Órdenes, Planeación, Cobranza, Gastos, Configuración, Comentarios.
- **Carril Piso** (oscuro, táctil): Producción-piso + login operador + portal cliente.
El carril Piso se **prioriza** porque concentra los peores hallazgos (8 críticos) y su mal
uso tiene impacto físico real (operador con guantes, lectura a distancia).

**d) Reutilizar lo que ya está bien.** La auditoría marcó 100+ "bien implementado":
lógica de negocio, RHF+Zod, debounce, anti-doble-envío, `role="alert"`, guardias server-side,
Realtime por invalidación. **No se toca el comportamiento; se reviste.**

## 4. Decisiones de herramientas (stack cerrado → requieren visto bueno de PO/Codex)

Instalado hoy: `next-themes`, `react-hook-form`+`@hookform/resolvers`+`zod`, `clsx`+`tailwind-merge`,
`@radix-ui/react-dialog` (único Radix), Tailwind v4. **No hay** librería de iconos, de gráficas,
de animación, ni más primitivos Radix.

| Necesidad | Recomendación | Riesgo | Alternativa sin dep |
|-----------|---------------|--------|---------------------|
| Iconos (hamburguesa, cámara OCR, chevrons, estados) | **`lucide-react`** (estándar shadcn) | Bajo | SVG inline (inviable a escala) |
| Primitivos accesibles (Select, Tabs, Tooltip, Popover, DropdownMenu, ScrollArea, Sheet) | **Radix UI** por pieza, vía patrón shadcn | Bajo | Construir a mano (a11y frágil) |
| Toasts | **`sonner`** (toaster recomendado por shadcn) | Bajo | Toast propio sobre Radix |
| Animación enter/exit | **`tw-animate-css`** (sucesor de tailwindcss-animate, Tailwind v4) | Bajo | Keyframes CSS a mano |
| Tipografía Inter | **`next/font/google`** (self-host, cero runtime) | Nulo | — |
| Gráficas (tendencias dashboard, dona de gastos) | **`recharts`** (verificar compat React 19 al implementar) | Medio | SVG/CSS propio |
| Barras (aging, crédito, progreso de partidas/piezas) | **CSS puro** (sin dep) | Nulo | — |
| Drag & drop kanban (opcional) | **`@dnd-kit/core`** solo si se desea; el baseline accesible es por botones | Medio | Botones (ya exigido por el alcance) |

**Recomendación de mínimos imprescindibles:** `lucide-react` + Radix por pieza + `sonner` +
`tw-animate-css` + Inter. `recharts` es el único de riesgo medio (compat React 19) — si no
compila limpio, caer a gráficas SVG propias. DnD queda como mejora futura, no bloqueante.

## 5. Roadmap por fases

Cada fase = un encargo Codex. Tamaños relativos S/M/L/XL. Dependencias explícitas.

### F0 · Cimientos: token layer + tema + tipografía — **[L] · bloquea todo**
- **Alcance:** `src/estilos/globals.css` (base: `tokens-propuesta.css`), Inter vía `next/font`,
  verificar `.dark` de next-themes en el root del piso.
- **Cubre:** el crítico de tokens y "blanco puro" en **las 14 áreas** (raíz de ~90 hallazgos).
- **Aceptación:** existen tokens claro+oscuro; utilidades `bg-superficie`/`text-texto-secundario`/etc.
  generan; ningún fondo es `#ffffff`; contraste AA en pares de token; `pnpm build` limpio.
- **Verificación:** typecheck/lint/build + captura visual clara y oscura.

### F1 · Biblioteca de primitivos + galería `/diseno` — **[XL] · depende de F0**
- **Alcance:** `src/compartido/componentes/{ui,formularios,retroalimentacion,diseno}/`.
  Construir/remapear: `Button` (variantes+alturas 36/40/44), `Input`/`Textarea`/`Select`,
  `Dialogo` (blur, xl, bottom-sheet), `Sheet`/`Drawer`, `Tabla`, `Tarjeta`, `BadgeEstado`,
  `Skeleton`, `EstadoVacio`, `Toast` (sonner), `Tooltip`. Ruta dev `/diseno` con la galería.
- **Cubre:** ~40 inconsistencias transversales (BadgeEstado ausente, tablas <48px, inputs
  blancos, modales sin aria/blur, sin skeleton/empty/toast) — de golpe, para todos los módulos.
- **Aceptación:** cada primitivo cumple `componentes-base.md`; a11y integrada (roles, foco,
  labels); galería muestra todos los estados. **Guía viva:** `componentes-base.md`.
- **Verificación:** typecheck/lint/build + revisión de la galería en 3 breakpoints y ambos temas.

### F2 · Chasis global: layout + navegación + responsive — **[L] · depende de F1**
- **Alcance:** unificar `(panel)`/`(privado)` en un layout compartido; `src/compartido/componentes/navegacion/`
  (`barra-lateral.tsx`, `encabezado-app.tsx`, `drawer-movil.tsx`); consumir el estado Zustand
  huérfano `barraLateralContraida`; breadcrumb, búsqueda, avatar+menú, badge de notificaciones con tokens.
- **Cubre:** los 3 críticos de Layout + inconsistencias de duplicación/fuente/badge/piso; da
  navegación entre los 15 módulos (hoy inexistente).
- **Aceptación:** sidebar 240→64px colapsable, drawer <768px, header 56–64px sticky; navegación
  a todos los módulos; sin duplicación de layouts.
- **Riesgo:** colisión de rutas `(panel)` vs `(privado)` → decisión arquitectónica de Codex
  (qué grupo sobrevive). Ver §9.

### F3–F13 · Cortes verticales por módulo (tras F2)
Patrón común de cada encargo: **remapear a primitivos → añadir piezas del alcance que faltan →
estados carga/vacío/error/éxito → a11y → responsive → DoD checklist.** Piezas *nuevas* (no solo
remapeo) señaladas en negrita.

| Fase | Módulo | Piezas nuevas clave | Tamaño |
|------|--------|---------------------|--------|
| **F3** | Dashboard | **gráficas de tendencia (recharts)**, skeleton por widget, color en tendencias, banner de error+reintento | L |
| **F4** | Pipeline | **vista tabla + toggle**, **campo `monto` en tipo Oportunidad (cambio de modelo)**, tiempo en etapa, **filtros**, **fix `formatearMoneda` (bug USD→MXN)**, botón "Ganada" a `primary`+modal | L |
| **F5** | Clientes | **avatar/iniciales**, **barra crédito usado/límite**, ficha 360 como `Sheet` | M |
| **F6** | Inventario | **semáforo de stock 3 estados**, kardex entradas/salidas con color, **CPP a 4 decimales**, targets ≥44px | M |
| **F7** | Órdenes | folio `OP-` en monospace, **semáforo de fecha compromiso**, **barra de progreso por partida**, **panel detalle expandible**, **paginación** | L |
| **F8** | Planeación | **calendario semanal recursos×días con bloques de color**, **semáforo de capacidad**, tooltips de OP | L |
| **F9** | **Producción-piso (DARK)** ⚠️ | targets ≥44px / **keypad PIN ≥64px**, KCard ≥200px + folio ≥16px, **"MI OP ACTIVA"**, **modales de avance/cierre con keypad y resumen**, badge pulsante, barras de progreso, **arreglar mojibake** | XL |
| **F10** | Cobranza | **aging en barras por bucket**, vencido en rojo+tooltip de días, **selector de cuenta destino** en modal de pago | M |
| **F11** | Gastos | **dona de distribución por categoría (recharts)**, **semáforo de margen**, botón OCR con icono cámara + **estados OCR (preview/reintento)** | L |
| **F12** | Configuración | estado activo de tabs, **TC destacado + fecha + alerta >1 día**, **color swatch de áreas**, empty states, edición inline | M |
| **F13** | Comentarios/Notif. | **resaltado de menciones @usuario**, avatares en hilo, **centro como panel lateral deslizable**, skeletons, empty states | M |

### F14 · Autenticación + Portal Cliente — **[M/L] · puede ir con carril Piso**
- Login oficina sobre pastel reutilizando `Input/Label/Button`; keypad operador en dark tokens
  (comparte el keypad de F9); **construir el portal cliente `/seguimiento` (hoy inexistente)**.

### FZ · Pulido transversal y correcciones — **[M] · continuo / cierre**
- Estándares de animación (`tw-animate-css` + keyframes; `prefers-reduced-motion`).
- Barrido de a11y (contraste, teclado, lector de pantalla) por módulo.
- QA responsive (3 breakpoints) y de tema oscuro en todo el sistema.
- Correcciones no visuales detectadas de paso: **`formatearMoneda`** (si no se hizo en F4),
  **mojibake** de producción, limpieza de rutas duplicadas.

## 6. Matriz de cobertura (hallazgo → fase)

| Área (críticos) | Fase que lo resuelve |
|-----------------|----------------------|
| Tokens/blanco puro (todas, ~raíz) | **F0** |
| BadgeEstado, Tabla, Input, Modal, Skeleton, Empty, Toast (transversal) | **F1** |
| Layout/nav/responsive (3🔴) | **F2** |
| Dashboard (4🔴) | F3 · Pipeline (5🔴) F4 · Clientes (3🔴) F5 · Inventario (6🔴) F6 |
| Órdenes (5🔴) F7 · Planeación (4🔴) F8 · **Piso (8🔴) F9** · Cobranza (4🔴) F10 |
| Gastos (7🔴) F11 · Config (5🔴) F12 · Comentarios (4🔴) F13 · Auth/Portal (3🔴) F14 |
| Bugs/limpieza (formatearMoneda, mojibake, rutas) | F4 / FZ |

Los 45 hallazgos 🔵 de mejora (animación, feedback) se absorben en F1 (base) y en el
pulido de cada corte + FZ.

## 7. Calidad y verificación (Definition of Done)

Cada fase cierra solo si pasa **todo**:
1. `pnpm typecheck` · `pnpm lint` · `pnpm test` · `pnpm build` limpios.
2. **`checklist-revision.md` completo** para cada pantalla tocada.
3. **QA visual** en 3 breakpoints (≥1280 / 768–1279 / <768) **y** en tema claro+oscuro.
4. **a11y:** contraste AA, navegación por teclado, foco visible, roles/labels.
5. **`cross-review`** (skill del repo) para cambios relevantes.
6. Sin regresiones de comportamiento (Realtime, permisos, RHF/Zod intactos).
7. E2E Playwright donde el módulo ya los tenga (opt-in).

## 8. Secuenciación, paralelización y tamaño

```
F0 ─► F1 ─► F2 ─┬─► [Carril Oficina]  F3 F5 F6 F7 F8 F10 F11 F12 F13   (paralelizables entre encargos)
                └─► [Carril Piso]     F9 (prioridad) ─► F14
FZ: transversal, se aplica al cerrar cada corte y como barrido final.
```
- **Ruta crítica:** F0 → F1 → F2 (nada de módulos rinde sin cimientos).
- Tras F2, los módulos son **independientes** → Codex puede delegarlos en paralelo o por prioridad de negocio.
- **Recomendación de orden de valor:** F0, F1, F2, **F9 (piso)**, F3 (dashboard), F4 (pipeline), luego el resto.
- Tamaño total aproximado: 2 fases XL (F1, F9), ~5 L, ~5 M, 1 FZ continua.

## 9. Riesgos y mitigaciones

- **Duplicación `(panel)`/`(privado)`:** decisión arquitectónica previa a F2 (qué grupo sobrevive;
  hoy `(privado)` tiene las páginas reales, `(panel)` mezcla placeholders). → Codex decide en F2.
- **Stack cerrado:** toda dependencia nueva (§4) requiere OK explícito de PO/Codex antes de F1.
- **recharts + React 19:** verificar compat al inicio de F3; fallback a SVG propio.
- **Regresión de tema oscuro:** el piso depende de que F0 defina bien los overrides `.dark`; QA
  oscuro obligatorio en F0 y F9.
- **Cambio de modelo en Pipeline** (`monto` en Oportunidad): implica migración SQL → territorio de
  Codex, coordinar F4 con esquema.
- **Scope creep:** el DoD y el checklist acotan cada corte; no mezclar módulos en un mismo encargo.

## 10. Ejecución bajo la gobernanza del repo

1. PO aprueba este plan y las adiciones de stack (§4).
2. **Codex** registra cada fase como encargo en `ACTIVE_TASKS.md` (alcance, archivos, criterios,
   verificación, modelo).
3. **Claude Code** implementa el corte delegado y entrega evidencia (archivos, comandos, resultados, riesgos).
4. **Codex** revisa (`cross-review`), verifica y, solo entonces, integra vía Git y declara el cierre.
5. Se repite fase por fase. Ningún corte se autoaprueba ni se declara cerrado por Claude.

---

### Artefactos de soporte (misma carpeta)
`auditoria-ux-reporte.md` (los 190 hallazgos) · `hallazgos-crudos.json` (fuente estructurada) ·
`tokens-propuesta.css` (base de F0) · `componentes-base.md` (guía de F1) ·
`checklist-revision.md` (DoD) · `ESTADO.md` (reanudación).
