# Checklist de revisión UX/UI — antes de cada commit de pantalla

> **PROPUESTA.** Marca cada punto antes de dar por terminada una pantalla nueva o
> modificada. Referencias: `tokens-propuesta.css`, `componentes-base.md`.

## 1. Tokens y color (bloqueante)

- [ ] Cero blanco puro de fondo: página `bg-fondo`, tarjeta `bg-superficie`.
- [ ] Cero colores crudos de Tailwind (`bg-red-100`, `bg-zinc-*`, `text-foreground/60`).
      Solo tokens (`bg-exito-suave`, `text-texto-secundario`, `border-borde`…).
- [ ] Estados del negocio con `<BadgeEstado>`, no colores a mano.
- [ ] Contraste texto ≥4.5:1 (≥3:1 en texto grande).

## 2. Componentes

- [ ] Tablas: `<Tabla>` (header `bg-superficie-2`, filas ≥48px, hover `bg-acento-suave`,
      acciones sticky, scroll-x en tablet).
- [ ] Botones: variante correcta (`primary/secondary/ghost/danger`); acción positiva
      **nunca** en `danger`; loading + `disabled` anti-doble-envío.
- [ ] Inputs: `<Label htmlFor>` visible, fondo `bg-superficie-2`, `.foco-anillo`,
      requerido con `*` en label, error con `role="alert"`.
- [ ] Modales: `<Dialogo>` con `role="dialog"` + `aria-labelledby`, overlay blur,
      footer sticky, bottom-sheet en mobile. Confirmaciones críticas en modal.
- [ ] Cards: `<Tarjeta>` con `shadow-sm rounded-lg`, padding 24/16.

## 3. Estados (no dejar ninguno sin diseñar)

- [ ] Carga inicial: `<Skeleton>` estructural (no spinner de página completa).
- [ ] Acción en curso: botón `loading` + `disabled`.
- [ ] Error de red: banner "Sin conexión" + "Reintentar"; error al usuario genérico.
- [ ] Vacío: `<EstadoVacio>` (icono + título + subtítulo + CTA), nunca tabla solo-header.
- [ ] Éxito: `<Toast>` verde ✓ (3s; 5s en acciones críticas).

## 4. Responsive

- [ ] Desktop ≥1280 / tablet 768–1279 / mobile <768 verificados.
- [ ] Tablas con scroll-x en tablet, sin truncar columnas sin aviso.
- [ ] Formularios >3 columnas colapsan a 1–2 en tablet/mobile.
- [ ] Modales = bottom sheet en mobile; botones de acción full-width en mobile.
- [ ] El body nunca hace scroll horizontal.

## 5. Accesibilidad (WCAG AA)

- [ ] Iconos interactivos con `aria-label`.
- [ ] Inputs con `id` + `label[for]` o `aria-label`.
- [ ] Foco visible (no ocultar el ring).
- [ ] Errores con `role="alert"` / `aria-live="polite"`.
- [ ] Tab order lógico.

## 6. Animación

- [ ] Transiciones 150/200/300ms `cubic-bezier(.4,0,.2,1)`.
- [ ] Sin bounce/spring/parallax/gradientes agresivos; nada >300ms en interacción frecuente.
- [ ] `en_proceso` con punto pulsante sutil (`.punto-en-proceso`); respeta
      `prefers-reduced-motion`.

## 7. Piso de taller (solo `/produccion-piso`, modo oscuro)

- [ ] `.dark` forzado; usa los overrides oscuros de los tokens.
- [ ] Tarjetas Kanban ≥200px alto; folio ≥16px.
- [ ] Botones ≥44px; teclado PIN ≥64px por tecla.
- [ ] Alto contraste; sin grises por opacidad.

## 8. Convenciones del repo

- [ ] Español 100% (variables, tipos, archivos kebab-case).
- [ ] Sin `any`. Imports con alias `@/`.
- [ ] `pnpm typecheck` y `pnpm lint` limpios.
