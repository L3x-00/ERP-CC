'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/compartido/componentes/ui/button';

/**
 * Entrada directa del administrador a la vista de producción (solo lectura).
 * No pide operador ni motivo: el piso se ve completo y sin PIN.
 */
export function BotonVistaProduccion() {
  const enrutador = useRouter();
  return (
    <Button
      type="button"
      tamano="lg"
      className="shrink-0"
      data-testid="abrir-vista-produccion"
      onClick={() => enrutador.push('/produccion-piso')}
    >
      Vista producción <span aria-hidden>→</span>
    </Button>
  );
}

/** Regreso de la vista de administrador en piso al módulo de Producción. */
export function BotonVolverAdmin() {
  const enrutador = useRouter();
  return (
    <Button
      type="button"
      variante="contorno"
      tamano="lg"
      className="shrink-0"
      data-testid="volver-a-admin"
      onClick={() => enrutador.push('/produccion')}
    >
      <span aria-hidden>←</span> Admin
    </Button>
  );
}
