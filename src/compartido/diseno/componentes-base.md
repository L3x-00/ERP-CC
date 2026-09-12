# Componentes base — ORCA MFG ERP v2

Guía de uso del sistema de diseño implementado en 2026-09-11. Los tokens viven en
`src/compartido/diseno/tokens.css` y se exponen a Tailwind v4 desde
`src/estilos/globals.css`. Ningún módulo debe volver a pintar con opacidades
(`text-foreground/60`) ni con colores crudos de Tailwind (`bg-amber-100`,
`bg-zinc-950`).

## Reglas rápidas

- El lienzo es `bg-fondo` (gris `#F8F9FA`); las tarjetas/paneles usan
  `bg-superficie` (blanco en claro, `#1E293B` en oscuro). Nunca `bg-background`
  en tarjetas.
- Texto: `text-texto-primario` (principal), `text-texto-secundario`
  (descripciones), `text-texto-tenue` (metadatos/hints). No usar `/60`, `/50`.
- Bordes: `border-borde` (sutil) y `border-borde-fuerte` (inputs/botones).
- Estados del negocio SIEMPRE con `<BadgeEstado>`: un solo mapa de color,
  etiqueta y punto pulsante (`en_proceso`, `vencida`, `en_uso`).
- Tamaños táctiles: en piso usar `Button tamano="piso"` (48px) o `"lg"` (44px).
- Foco visible con anillo de acento (nunca `outline-none` sin reemplazo).
- Animaciones 150–300ms; el sistema respeta `prefers-reduced-motion`.

## Primitivos

### Button — `@/compartido/componentes/ui/button`

| variante | uso | estilo |
|---|---|---|
| `primario` | acción principal | `bg-acento` + hover `bg-acento-hover` |
| `secundario` | confirmaciones de negocio | `bg-secundario` |
| `destructivo` | cancelar/eliminar | `bg-peligro-suave text-peligro-texto` |
| `contorno` | acciones neutras | borde + superficie |
| `fantasma` | acciones terciarias | solo hover |

Tamaños: `sm` 36px · `md` 40px (default) · `lg` 44px · `piso` 48px con
`min-w-12`. Deshabilitado: `disabled:opacity-50 disabled:cursor-not-allowed`.

### Input / Select / Textarea — `@/compartido/componentes/ui/input`

Fondo `bg-superficie-2`, foco `border-acento` + anillo de 3px. El `Select` nativo
lleva chevron (`.select-flecha`); `Textarea` solo redimensiona en vertical. Todo
input debe tener `Label` visible (nunca solo placeholder).

### Label — `@/compartido/componentes/ui/label`

Prop `obligatorio` agrega el asterisco en rojo y `aria-hidden`. Acompaña siempre
al `id` del campo.

### Dialog — `@/compartido/componentes/ui/dialog`

Overlay `bg-black/40 backdrop-blur`, contenido `rounded-xl bg-superficie shadow-lg`
máx. 640px, `DialogFooter` sticky. Accesible sobre Radix (`role="dialog"`, foco
atrapado, Esc). En mobile ocupar `max-h-[90vh]` con scroll interno.

### Tarjeta — `@/compartido/componentes/diseno/tarjeta`

`Tarjeta`, `TarjetaEncabezado`, `TarjetaTitulo`, `TarjetaDescripcion`,
`TarjetaContenido`, `TarjetaPie`. Padding 16–24px; separador interno con
`border-borde`, nunca `<hr>`.

### Tabla — `@/compartido/componentes/diseno/tabla`

`TablaContenedor` (scroll-x), `Tabla`, `TablaEncabezado` (sticky, fondo
`bg-superficie-2`), `TablaCuerpo` (zebra sutil), `TablaFila` (hover
`bg-acento-suave`, props `seleccionada`/`clickable`), `TablaEncabezadoCelda`,
`TablaCelda`. Filas objetivo ≥48px (`px-4 py-3`). Texto largo con `truncate` +
`title`.

### BadgeEstado — `@/compartido/componentes/diseno/badge-estado`

```
<BadgeEstado estado="en_proceso" />        // punto azul pulsante
<BadgeEstado estado="vencida" />           // rojo pulsante
<BadgeEstado estado="pagado" />            // verde
<BadgeEstado estado="cancelada" />         // neutro
<BadgeEstado estado="mi_estado" etiqueta="Personalizado" />
```

Estados soportados: órdenes (`borrador`, `programada`, `en_proceso`, `pausada`,
`completada`, `terminada`, `lista`, `entregada`, `cancelada`), cobranza
(`pendiente`, `parcial`, `pagado`, `vencida`), gastos (`pendiente`, `pagado`,
`aprobado`, `cancelado`), planeación (`en_preparacion`, `en_uso`, `bloqueada`),
clientes/pipeline (`prospecto`, `activo`, `inactivo`, `contactado`, `cotizado`,
`negociacion`, `ganada`, `perdida`), inventario (`ok`, `reorden`, `critico`,
`agotado`).

### BarraProgreso — `@/compartido/componentes/diseno/barra-progreso`

```
<BarraProgreso valor={avance} tono={vencida ? 'peligro' : 'acento'} mostrarPorcentaje />
```

Accesible (`role="progressbar"`), acota 0–100 y transiciona el ancho.

### AvatarIniciales — `@/compartido/componentes/diseno/avatar`

Iniciales deterministas con color estable por nombre. Tamaños `sm|md|lg`. Úsalo
en clientes, hilos de comentarios y pies de usuario.

### Skeleton — `@/compartido/componentes/retroalimentacion/skeleton`

`Skeleton` (bloque) y `SkeletonTabla` (encabezado + filas). La carga inicial debe
imitar la estructura real; nunca un spinner de página completa.

### EstadoVacio — `@/compartido/componentes/retroalimentacion/estado-vacio`

Título + descripción + CTA opcional. Toda tabla/lista vacía lo usa; nunca dejar
solo el encabezado.

## Colores semánticos

| Token | Uso | Clases |
|---|---|---|
| Acento | acciones, selección, info | `bg-acento`, `bg-acento-suave`, `text-acento` |
| Éxito | completado, pagado, stock ok | `bg-exito-suave text-exito-texto` |
| Advertencia | pendiente, reorden, margen medio | `bg-advertencia-suave text-advertencia-texto` |
| Peligro | vencido, cancelado, stock crítico | `bg-peligro-suave text-peligro-texto` |
| Info | en proceso, planeado | `bg-info-suave text-info-texto` |

Tiers: `bg-tier-bronce-suave text-tier-bronce` (y `plata`, `oro`, `platino`).

## Modo oscuro

El piso fuerza `.dark` en `(piso)/layout.tsx`. Los mismos tokens cambian de valor:
no escribir paletas zinc/slate/cyan/emerald hardcodeadas. Los componentes deben
verse correctos en ambos temas sin clases `dark:` adicionales salvo excepciones
de contraste.

## Errores y éxito

- Error de formulario: `role="alert"` + `text-peligro-texto`.
- Banner de error de red: `bg-peligro-suave text-peligro-texto border-peligro/30`
  con botón "Reintentar".
- Éxito: `text-exito-texto` o mensaje inline; los toasts globales quedan
  pendientes de una fase posterior.
