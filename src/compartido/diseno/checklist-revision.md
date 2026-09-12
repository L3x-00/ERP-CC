# Checklist de revisión visual — pre-commit

Validar cada pantalla nueva o modificada antes de confirmar cambios. Un módulo no
se considera listo si falla cualquiera de los puntos marcados como obligatorios.

## Tokens y color

- [ ] No hay `bg-background` en tarjetas/paneles (usar `bg-superficie`).
- [ ] No hay opacidades `text-foreground/XX`, `border-foreground/XX` ni
      `bg-foreground/XX` (usar tokens `texto-*`, `borde`, `superficie-2`).
- [ ] No hay colores crudos de Tailwind (`bg-amber-100`, `bg-zinc-950`,
      `text-red-600`) donde exista un token semántico.
- [ ] El fondo de página es `bg-fondo`; ninguna pantalla pinta `#ffffff` de
      lienzo.
- [ ] Probado en modo claro y oscuro (especialmente piso).

## Estados del negocio

- [ ] Todo estado visible usa `<BadgeEstado>` (no texto plano ni badges a mano).
- [ ] `en_proceso`/`vencida` muestran el punto pulsante.
- [ ] Colores semánticos coherentes: éxito=completado/pagado/ok,
      advertencia=pendiente/reorden, peligro=vencido/cancelado/crítico.

## Componentes

- [ ] Botones con `Button` del sistema; acciones principales `primario`; en piso
      `tamano="piso"` (≥48px) o `lg` (44px).
- [ ] Inputs con `Label` visible (`obligatorio` si aplica); sin labels fantasma.
- [ ] Modales con `Dialog` (overlay blur, footer sticky, cierre accesible).
- [ ] Tablas con primitivos `Tabla*` (header sticky, hover, filas ≥48px).
- [ ] Vacíos con `EstadoVacio` (título + descripción + CTA si aplica).
- [ ] Carga con `Skeleton`/`SkeletonTabla` que imita la estructura; no spinner
      de página completa.
- [ ] Error con `role="alert"` y, si es de red, banner + "Reintentar".

## Accesibilidad (WCAG AA)

- [ ] Contraste ≥4.5:1 en texto normal (usar `texto-secundario`, no `/50`).
- [ ] Iconos interactivos con `aria-label`; inputs con `id` + `label[for]`.
- [ ] Foco visible (anillo de acento); no se elimina el outline sin reemplazo.
- [ ] Objetivos táctiles ≥44px en pantallas táctiles.
- [ ] Modales/paneles con `role="dialog"`, `aria-modal` y cierre con Esc.
- [ ] Tab order lógico y `aria-live`/`role="status"` donde cambie contenido.

## Responsive

- [ ] Probado en 3 breakpoints: móvil (<768), tablet (768–1279), escritorio
      (≥1280).
- [ ] Tablas con `TablaContenedor` (scroll horizontal, sin truncar columnas).
- [ ] Formularios >3 columnas colapsan a 1–2 en tablet/móvil.
- [ ] Navegación: sidebar expandida/colapsada en escritorio y drawer en móvil.

## Movimiento y feedback

- [ ] Transiciones 150–300ms; sin rebotes ni parallax.
- [ ] Hover de tarjetas/filas sutil (`shadow-md`, `bg-acento-suave`).
- [ ] Acciones con estado de envío (texto "Guardando…" y botón deshabilitado).
- [ ] `prefers-reduced-motion` respetado (las utilidades del sistema ya lo hacen).

## Integración

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` y `pnpm build` en verde.
- [ ] Sin `any`; sin lógica de negocio movida a componentes visuales.
- [ ] `data-testid` y `aria-*` existentes conservados (E2E depende de ellos).
- [ ] Sin secuencias `\uXXXX` literales ni texto corrupto (`grep` de `\u00` y
      `�`).
