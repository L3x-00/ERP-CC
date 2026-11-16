'use client';

import { useId, useState, type ComponentProps } from 'react';

import { cn } from '@/compartido/utilidades/cn';

type Props = Omit<ComponentProps<'input'>, 'type' | 'className'> & {
  /** Texto del botón que abre el selector de archivos. */
  textoBoton?: string;
  /** Texto cuando todavía no se eligió ningún archivo. */
  textoVacio?: string;
  /** Oculta el nombre elegido cuando la pantalla ya lo muestra por su cuenta. */
  mostrarNombre?: boolean;
  /** Clase del contenedor (por ejemplo, para ocupar el ancho disponible). */
  className?: string;
};

/**
 * Selector de archivos con textos en español.
 *
 * El control nativo `<input type="file">` muestra «Choose File / No file
 * chosen» según el idioma del navegador y del sistema: eso deja media pantalla
 * en inglés. Aquí el input queda accesible para lectores de pantalla y pruebas
 * (`sr-only`), y la persona ve un botón propio con el nombre del archivo
 * elegido. Sigue siendo el input nativo quien abre el diálogo del sistema.
 */
export function CampoArchivo({
  id,
  className,
  textoBoton = 'Elegir archivo',
  textoVacio = 'Ningún archivo seleccionado',
  mostrarNombre = true,
  onChange,
  multiple,
  ...props
}: Props) {
  const generado = useId();
  const controlId = id ?? generado;
  const [nombres, setNombres] = useState<string[]>([]);
  const invalido = props['aria-invalid'] === true || props['aria-invalid'] === 'true';

  return (
    <span className={cn('inline-flex min-w-0 max-w-full flex-wrap items-center gap-2', className)}>
      <input
        {...props}
        id={controlId}
        type="file"
        multiple={multiple}
        className="peer sr-only"
        onChange={(evento) => {
          setNombres(Array.from(evento.target.files ?? []).map((archivo) => archivo.name));
          onChange?.(evento);
        }}
      />
      <label
        htmlFor={controlId}
        className={cn(
          'inline-flex h-9 cursor-pointer items-center justify-center rounded-lg border border-borde-fuerte bg-superficie px-3 text-sm font-semibold text-texto-primario transition-colors hover:bg-superficie-2',
          'peer-focus-visible:ring-2 peer-focus-visible:ring-acento/40 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-superficie',
          'peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
          invalido && 'border-peligro/60',
        )}
      >
        {textoBoton}
      </label>
      {mostrarNombre ? (
        <span
          className={cn(
            'min-w-0 max-w-full truncate text-xs',
            invalido ? 'text-peligro-texto' : 'text-texto-secundario',
          )}
          aria-live="polite"
        >
          {nombres.length > 0 ? nombres.join(', ') : textoVacio}
        </span>
      ) : null}
    </span>
  );
}
