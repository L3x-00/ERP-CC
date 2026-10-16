'use client';

import { useState } from 'react';

import { obtenerUrlArchivoFichaAccion } from '@/modulos/ordenes/acciones/obtener-url-archivo-ficha';
import type { ArchivoFicha } from '@/modulos/ordenes/tipos/ficha-orden';

/** Nombre original primero; el nombre ERP solo se añade cuando aporta algo distinto. */
function nombresDe(archivo: ArchivoFicha): { principal: string | null; erp: string | null } {
  const principal = archivo.nombreOriginal ?? archivo.nombreErp;
  const erp = archivo.nombreOriginal && archivo.nombreErp && archivo.nombreErp !== archivo.nombreOriginal
    ? archivo.nombreErp
    : null;
  return { principal, erp };
}

/** Archivos de la orden: Archivo | Origen | Asociado a | Tipo. El nombre del archivo lo abre. */
export function PanelArchivosFicha({ ordenId, archivos }: { ordenId: string; archivos: ArchivoFicha[] }) {
  const [abriendo, setAbriendo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function abrir(archivoId: string): Promise<void> {
    setError(null);
    setAbriendo(archivoId);
    try {
      const respuesta = await obtenerUrlArchivoFichaAccion({ ordenId, archivoId });
      if (!respuesta.exito || !respuesta.datos) {
        setError('No se pudo abrir el archivo. Intenta de nuevo.');
        return;
      }
      window.open(respuesta.datos.url, '_blank', 'noopener,noreferrer');
    } catch {
      setError('No se pudo abrir el archivo. Intenta de nuevo.');
    } finally {
      setAbriendo(null);
    }
  }

  return (
    <section className="grid gap-2" data-testid="ficha-panel-archivos">
      {error ? <p role="alert" className="text-sm text-peligro-texto">{error}</p> : null}
      {archivos.length === 0 ? (
        <p className="text-sm text-texto-secundario">Sin archivos registrados en la orden.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-borde">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="bg-superficie-2 text-left text-texto-secundario">
                <th scope="col" className="px-3 py-2 font-semibold">Archivo</th>
                <th scope="col" className="px-3 py-2 font-semibold">Origen</th>
                <th scope="col" className="px-3 py-2 font-semibold">Asociado a</th>
                <th scope="col" className="px-3 py-2 font-semibold">Tipo</th>
              </tr>
            </thead>
            <tbody>
              {archivos.map((archivo) => {
                const { principal, erp } = nombresDe(archivo);
                return (
                  <tr key={archivo.archivoId} className="border-t border-borde align-top">
                    <td className="px-3 py-2">
                      {archivo.disponible ? (
                        <button
                          type="button"
                          disabled={abriendo === archivo.archivoId}
                          onClick={() => void abrir(archivo.archivoId)}
                          className="text-left font-medium text-acento hover:underline disabled:opacity-60"
                        >
                          {principal ?? 'Archivo sin nombre'}
                        </button>
                      ) : principal ? (
                        <span className="font-medium text-texto-primario">{principal}</span>
                      ) : null}
                      {erp ? <p className="text-xs text-texto-secundario">Nombre ERP: {erp}</p> : null}
                      {!archivo.disponible ? (
                        <p className="text-xs text-peligro-texto">No disponible</p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{archivo.origen}</td>
                    <td className="px-3 py-2 font-mono text-xs">{archivo.asociadoA}</td>
                    <td className="px-3 py-2">{archivo.tipo}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
