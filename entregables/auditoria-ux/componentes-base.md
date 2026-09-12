# Componentes base — guía de uso · ORCA MFG ERP v2

> **PROPUESTA.** Documenta cómo deben usarse los componentes fundamentales una vez
> cableada la capa de tokens (`tokens-propuesta.css`). Nombres de token en español
> (ver mapa al pie de `tokens-propuesta.css`). Utilidades Tailwind v4 derivadas:
> `bg-superficie`, `bg-superficie-2`, `border-borde`, `text-texto-primario`,
> `text-texto-secundario`, `text-texto-tenue`, `bg-acento`, `bg-acento-suave`,
> `bg-exito-suave`, `text-exito-texto`, `rounded-lg`, `shadow-md`, etc.
>
> **Estado actual (auditoría 2026-09-11):** de estos primitivos solo existen
> `badge`, `button`, `input`, `label`, `dialog` en `src/compartido/componentes/ui/`,
> y usan clases crudas de Tailwind, no los tokens. `Table`, `Card`, `Select`,
> `Textarea`, `Sheet`, `Toast`, `Tooltip`, `Skeleton`, `EstadoVacio` y `BadgeEstado`
> **no existen** (carpetas `diseno/`, `formularios/`, `retroalimentacion/` solo con
> `.gitkeep`). Cada módulo pinta sus estados a mano → inconsistencia sistémica.
> Orden de implementación recomendado: **1) tokens → 2) primitivos → 3) remapear módulos.**

---

## Principios

1. **Nunca blanco puro de fondo.** Página = `bg-fondo` (#F8F9FA). Tarjeta = `bg-superficie` (#FFFFFF).
2. **Nunca colores crudos de Tailwind** (`bg-red-100`, `bg-zinc-950`, `text-foreground/60`).
   Usar siempre tokens semánticos.
3. **Un solo componente por concepto.** Un estado del negocio = `<BadgeEstado>`, no diez
   implementaciones a mano. Una tabla = `<Tabla>`, un modal = `<Dialogo>`.
4. **Accesible por defecto:** `label[for]`/`aria-label`, `role="dialog"`, foco visible,
   `role="alert"` en errores, touch target ≥44px (≥64px en el piso).
5. **Español 100%, kebab-case en archivos, sin `any`.**

---

## Tabla de datos (`<Tabla>`) — POR CREAR

**Uso:** listados de todos los módulos (clientes, órdenes, inventario, cobranza…).

- Header fijo `bg-superficie-2 text-texto-secundario`, `sticky top-0`.
- Fila `min-h-12` (48px), alternancia `odd:bg-superficie even:bg-superficie-2`.
- Hover `hover:bg-acento-suave`, `cursor-pointer` solo si la fila es clickable.
- Texto largo con `truncate` + `title=` (tooltip nativo) o `<Tooltip>`.
- Columna de acciones `sticky right-0 bg-inherit` (no se pierde en scroll-x).
- **Vacío:** renderizar `<EstadoVacio>` (no una tabla con solo el header).
- **Carga:** `<Skeleton>` de filas, no spinner de página.
- Paginación inferior: `Mostrando {a}–{b} de {total}`.
- Responsive: envolver en `<div class="overflow-x-auto">`; en tablet no truncar
  columnas sin aviso.

```tsx
<div className="overflow-x-auto rounded-lg border border-borde bg-superficie shadow-sm">
  <table className="w-full text-sm">
    <thead className="sticky top-0 bg-superficie-2 text-texto-secundario">
      <tr><th className="px-4 py-3 text-left font-medium">Folio</th>…</tr>
    </thead>
    <tbody>
      <tr className="min-h-12 border-t border-borde odd:bg-superficie even:bg-superficie-2 hover:bg-acento-suave">
        <td className="truncate px-4 py-3" title={folio}>{folio}</td>…
      </tr>
    </tbody>
  </table>
</div>
```

## BadgeEstado (`<BadgeEstado estado="en_proceso" />`) — POR CREAR

**Uso obligatorio en TODOS los módulos** para estados del negocio. Reemplaza los
`bg-amber-100/bg-green-100/bg-red-100` dispersos hoy en pipeline, órdenes, cobranza, etc.

| estado | fondo | texto | punto |
|--------|-------|-------|-------|
| `borrador` | `bg-superficie-2` | `text-texto-tenue` | gris |
| `pendiente` | `bg-advertencia-suave` | `text-advertencia-texto` | amarillo |
| `en_proceso` | `bg-info-suave` | `text-info-texto` | azul **pulsante** |
| `programada` / `planeada` | `bg-info-suave` | `text-info-texto` | azul |
| `lista`/`terminada`/`entregada`/`pagado` | `bg-exito-suave` | `text-exito-texto` | verde (✓ en entregada/pagado) |
| `cancelada` | `bg-superficie-2` | `text-texto-tenue` | gris — |
| `vencida` | `bg-peligro-suave` | `text-peligro-texto` | rojo |

```tsx
<span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium bg-info-suave text-info-texto">
  <span className="size-1.5 rounded-full bg-info punto-en-proceso" aria-hidden /> {/* .punto-en-proceso solo en_proceso */}
  En proceso
</span>
```

## Botón (`<Button>`) — EXISTE, remapear a tokens

Jerarquía única en todo el sistema:

| variante | uso | estilo |
|----------|-----|--------|
| `primary` | acción principal | `bg-acento text-white hover:bg-acento-hover` |
| `secondary` | secundaria | `bg-superficie-2 text-texto-primario border border-borde` |
| `ghost` | terciaria | `bg-transparent text-texto-secundario hover:bg-superficie-2` |
| `danger` | destructiva | `bg-peligro-suave text-peligro-texto border border-peligro/30` |

- Alturas `h-9`/`h-10`/`h-11` (36/40/44). `rounded-md`. `transition` 150ms.
- `disabled:opacity-50 disabled:cursor-not-allowed`. Loading = spinner inline + `disabled`.
- **Regla:** una acción positiva ("Marcar ganada", "Confirmar pago") **nunca** usa `danger`.
  (Hallazgo real en Pipeline: "Confirmar ganada" pintado en rojo.)

## Input / campos (`<Input>`, `<Textarea>`, `<Select>`) — Input existe, resto POR CREAR

- **Label siempre visible** (`<Label htmlFor>`), nunca solo placeholder.
- Fondo `bg-superficie-2` (no blanco), `border-borde`.
- Focus: usar `.foco-anillo` (border-acento + ring 3px `--acento-anillo`).
- Error: `border-peligro` + mensaje debajo con `role="alert"` en `text-peligro-texto`.
- Requerido: `*` en el label, no en el placeholder.
- Fechas DD/MM/YYYY. Montos con prefijo MXN/USD visible.
- `<Textarea>`: `resize-y` únicamente. `<Select>`: chevron alineado, sobre Radix.

```tsx
<div className="flex flex-col gap-1.5">
  <Label htmlFor="monto">Monto <span className="text-peligro">*</span></Label>
  <div className="relative">
    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-texto-tenue">MXN</span>
    <input id="monto" className="foco-anillo w-full rounded-md border border-borde bg-superficie-2 py-2 pl-12 pr-3 text-texto-primario" />
  </div>
  {error && <p role="alert" className="text-xs text-peligro-texto">{error}</p>}
</div>
```

## Modal / Diálogo (`<Dialogo>`) — EXISTE (Radix), remapear a tokens

- Overlay `bg-black/40 backdrop-blur-sm`.
- Panel `bg-superficie shadow-lg rounded-xl`, `max-w-[640px]` desktop; mobile bottom-sheet.
- Header título + botón X (`aria-label="Cerrar"`); footer sticky con acciones.
- Entrada `animate-in fade-in zoom-in-95 duration-200`; salida `fade-out zoom-out-95`.
- `role="dialog"` + `aria-labelledby`. Foco atrapado + Esc (Radix ya lo da).
- **Confirmaciones críticas** (ganar oportunidad, registrar pago, cerrar sesión de taller)
  van en modal, no inline.

## Card / Panel (`<Tarjeta>`) — POR CREAR

- `bg-superficie border border-borde shadow-sm rounded-lg`, padding `p-6` (desktop) / `p-4`.
- Header: título `text-texto-primario`, subtítulo `text-texto-secundario`.
- Separador interno `border-t border-borde` (no `<hr>` con margen negativo).
- Hover (si es clickable): `hover:-translate-y-px hover:shadow-md transition`.

## Estado vacío (`<EstadoVacio>`) — POR CREAR

Toda lista/tabla vacía: icono + título + subtítulo del porqué + CTA si aplica.
Nunca una tabla con solo el header.

## Toast (`<Toast>`) — POR CREAR

Éxito en esquina superior derecha, verde, `✓`, auto-dismiss 3s (5s en acciones críticas).
Error de red → banner "Sin conexión" + "Reintentar".

## Skeleton (`<Skeleton>`) — POR CREAR

Imita la estructura real (filas de tabla, tarjetas KPI). `animate-pulse`.
No spinner de página completa que bloquee toda la interacción.

---

## Piso de taller — reglas propias (modo oscuro)

La vista `/produccion-piso` fuerza `.dark` y se rige por los overrides oscuros de
`tokens-propuesta.css`. Requisitos extra sobre los primitivos:

- Tarjetas Kanban ≥200px de alto; folio ≥16px; datos secundarios ≥14px.
- Botones de acción ≥44px; teclado PIN ≥64px por tecla.
- `BadgeEstado` usa los semánticos oscuros (`--exito`, `--info`… ya flipeados en `.dark`).
- Alto contraste; nada de grises por opacidad.
