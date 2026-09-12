import { cn } from '@/compartido/utilidades/cn';

/** Iniciales a partir de un nombre (máximo 2, con fallback "?"). */
export function inicialesDe(nombre: string): string {
  const partes = nombre
    .trim()
    .split(/\s+/)
    .filter((parte) => parte.length > 0);
  if (partes.length === 0) return '?';
  const primera = partes[0]?.[0] ?? '';
  const segunda = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : '';
  return `${primera}${segunda}`.toUpperCase();
}

/** Avatar de iniciales determinista (color estable por nombre). */
export function AvatarIniciales({
  nombre,
  tamano = 'md',
  className,
}: {
  nombre: string;
  tamano?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const tamanos = {
    sm: 'h-8 w-8 text-xs',
    md: 'h-10 w-10 text-sm',
    lg: 'h-12 w-12 text-base',
  } as const;

  // Paleta derivada del acento con matiz estable por nombre.
  const matices = [210, 160, 275, 20, 340, 190];
  const indice = [...nombre].reduce((suma, caracter) => suma + caracter.charCodeAt(0), 0);
  const matiz = matices[indice % matices.length] ?? 210;

  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full font-semibold text-white',
        tamanos[tamano],
        className,
      )}
      style={{ backgroundColor: `hsl(${matiz} 55% 48%)` }}
    >
      {inicialesDe(nombre)}
    </span>
  );
}
