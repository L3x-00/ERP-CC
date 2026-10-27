
'use client';

import { useRouter } from 'next/navigation';
import { cerrarVistaOperadorAccion } from '@/modulos/autenticacion/acciones/cerrar-vista-operador';
import { MenuCuentaOperador } from './menu-cuenta-operador';

interface PropsEncabezadoTerminalOperador {
  nombreOperador: string;
  operativo: boolean;
}

export function EncabezadoTerminalOperador({
  nombreOperador,
  operativo,
}: PropsEncabezadoTerminalOperador) {
  const router = useRouter();

  return (
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-borde py-3">
      <div>
        <h1 className="text-xl font-bold text-texto-primario">
          Producción
        </h1>
        <p className="text-xs text-texto-secundario">
          Terminal de operaciones
        </p>
      </div>

      <MenuCuentaOperador
        nombreOperador={nombreOperador}
        operativo={operativo}
        onVerMiPanel={() => router.push('/operador/mi-panel')}
        onSalir={
          operativo
            ? () => void cerrarVistaOperadorAccion()
            : undefined
        }
      />
    </header>
  );
}
