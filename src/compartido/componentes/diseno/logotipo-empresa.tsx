import Image from 'next/image';

import { LOGO_EMPRESA_RUTA, NOMBRE_EMPRESA } from '@/compartido/constantes/marca';
import { cn } from '@/compartido/utilidades/cn';

type TamanoLogotipo = 'sm' | 'md' | 'lg';

const MEDIDAS: Record<TamanoLogotipo, { caja: string; imagen: number; texto: string }> = {
  sm: { caja: 'h-8 w-8 rounded-lg p-1', imagen: 26, texto: 'text-sm' },
  md: { caja: 'h-9 w-9 rounded-xl p-1', imagen: 30, texto: 'text-sm' },
  lg: { caja: 'h-14 w-14 rounded-2xl p-2', imagen: 50, texto: 'text-lg' },
};

/**
 * Isotipo de la empresa con el nombre opcional al lado.
 *
 * El logo se coloca sobre un azulejo claro para que el verde oscuro conserve
 * contraste tanto en el tema claro como en el oscuro del ERP.
 */
export function LogotipoEmpresa({
  conTexto = false,
  tamano = 'md',
  className,
  textoClassName,
}: {
  conTexto?: boolean;
  tamano?: TamanoLogotipo;
  className?: string;
  textoClassName?: string;
}) {
  const medidas = MEDIDAS[tamano];

  return (
    <span className={cn('flex min-w-0 items-center gap-2.5', className)}>
      <span
        className={cn(
          'flex shrink-0 items-center justify-center bg-white shadow-sm ring-1 ring-black/5',
          medidas.caja,
        )}
      >
        <Image
          src={LOGO_EMPRESA_RUTA}
          alt={NOMBRE_EMPRESA}
          width={medidas.imagen}
          height={medidas.imagen}
          priority
          className="h-full w-full object-contain"
        />
      </span>
      {conTexto ? (
        <span
          className={cn(
            'min-w-0 truncate font-bold tracking-tight text-texto-primario',
            medidas.texto,
            textoClassName,
          )}
        >
          {NOMBRE_EMPRESA}
        </span>
      ) : null}
    </span>
  );
}
