'use client';

import Link from 'next/link';
import { useState } from 'react';

import { Button } from '@/compartido/componentes/ui/button';
import { obtenerUrlArchivoPisoAccion } from '@/modulos/ordenes/acciones/obtener-url-archivo-piso';
import { HojaTrabajoDocumento } from '@/modulos/ordenes/componentes/hoja-trabajo-documento';
import type { HojaTrabajoOrden } from '@/modulos/ordenes/tipos/ficha-orden';

/**
 * Hoja de trabajo para consultar o imprimir desde la terminal de piso (O-05 C): sin precios, con
 * observaciones del ítem y de la orden, y los archivos de la orden abiertos con URL firmada.
 */
export function HojaTrabajoPiso({ ordenId, hoja }: { ordenId: string; hoja: HojaTrabajoOrden | null }) {
  const [error, setError] = useState<string | null>(null);

  async function abrirArchivo(archivoId: string): Promise<void> {
    setError(null);
    try {
      const respuesta = await obtenerUrlArchivoPisoAccion({ ordenId, archivoId });
      if (!respuesta.exito || !respuesta.datos) {
        setError('No se pudo abrir el archivo. Intenta de nuevo.');
        return;
      }
      window.open(respuesta.datos.url, '_blank', 'noopener,noreferrer');
    } catch {
      setError('No se pudo abrir el archivo. Intenta de nuevo.');
    }
  }

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4 p-6" data-testid="hoja-trabajo-piso">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href="/produccion-piso" className="text-sm font-semibold text-acento hover:underline">
          ← Volver al piso
        </Link>
        {hoja ? (
          <Button variante="contorno" tamano="sm" onClick={() => window.print()}>
            Imprimir
          </Button>
        ) : null}
      </div>
      {error ? <p role="alert" className="text-sm text-peligro-texto print:hidden">{error}</p> : null}
      {hoja ? (
        <div className="hoja-impresion">
          <HojaTrabajoDocumento hoja={hoja} onAbrirArchivo={(archivoId) => void abrirArchivo(archivoId)} />
        </div>
      ) : (
        <p
          className="rounded-lg border border-borde bg-superficie p-4 text-sm text-texto-secundario"
          data-testid="hoja-trabajo-vacia"
        >
          Esta orden no tiene hoja de trabajo registrada. Consulta las partidas en el control de piso.
        </p>
      )}
    </div>
  );
}
