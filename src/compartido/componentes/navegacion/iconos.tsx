import { cn } from '@/compartido/utilidades/cn';

/** Iconos de línea del menú (sin dependencia externa de iconos). */
const RUTAS: Record<string, string[]> = {
  panel: ['M4 4h7v7H4z', 'M13 4h7v7h-7z', 'M4 13h7v7H4z', 'M13 13h7v7h-7z'],
  embudo: ['M3 4h18l-7 8v6l-4 2v-8L3 4Z'],
  personas: [
    'M16 19v-1.5A3.5 3.5 0 0 0 12.5 14h-5A3.5 3.5 0 0 0 4 17.5V19',
    'M10 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
    'M20 19v-1.4a3.4 3.4 0 0 0-2.6-3.3M15.5 3.2a3.5 3.5 0 0 1 0 6.6',
  ],
  caja: [
    'M21 8.5 12 3 3 8.5v7L12 21l9-5.5v-7Z',
    'M3 8.5 12 14l9-5.5M12 14v7',
  ],
  documento: [
    'M7 3h7l5 5v13H7z',
    'M14 3v5h5',
    'M10 12h6M10 16h6',
  ],
  calendario: [
    'M5 5h14v15H5z',
    'M5 9h14M9 3v4M15 3v4',
    'M9 13h2v2H9z',
  ],
  fabrica: [
    'M4 20V9l5 3V9l5 3V9l6 3v8H4Z',
    'M8 20v-4h3v4M17 20v-3',
  ],
  moneda: [
    'M12 3v18',
    'M16.5 7.5A4 4 0 0 0 13 6h-2a3.5 3.5 0 0 0 0 7h2a3.5 3.5 0 0 1 0 7h-2a4 4 0 0 1-3.5-1.5',
  ],
  recibo: [
    'M6 3h12v18l-3-2-3 2-3-2-3 2V3Z',
    'M9 8h6M9 12h6',
  ],
  engrane: [
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z',
    'M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z',
  ],
  menu: ['M4 7h16M4 12h16M4 17h16'],
  cerrar: ['M6 6l12 12M18 6 6 18'],
  contraer: ['M9 6l6 6-6 6'],
  campana: [
    'M15 17H9m9-2V10a6 6 0 0 0-12 0v5l-2 2h16l-2-2Z',
    'M10 21a2 2 0 0 0 4 0',
  ],
};

export function Icono({
  nombre,
  className,
}: {
  nombre: keyof typeof RUTAS | string;
  className?: string;
}) {
  const rutas = RUTAS[nombre] ?? RUTAS.panel ?? [];
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={cn('h-5 w-5 fill-none stroke-current', className)}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {rutas.map((ruta, indice) => (
        <path key={indice} d={ruta} />
      ))}
    </svg>
  );
}
