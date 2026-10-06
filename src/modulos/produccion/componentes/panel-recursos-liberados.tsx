'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/compartido/componentes/ui/button';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { Skeleton } from '@/compartido/componentes/retroalimentacion/skeleton';
import { formatearFecha, formatearHora } from '@/compartido/utilidades/formatear';

import { reclamarRecursoAccion } from '../acciones/indice';
import { obtenerRecursosLiberablesAccion } from '../acciones/consultas-b6';
import { CLAVE_RECURSOS_LIBERABLES } from './claves-consulta';


/**
 * SII-B6.2: máquinas liberadas ≥60 min por pausa DUDA/MATERIAL. El supervisor
 * las reclama para otra orden; PostgreSQL valida la vigencia al reclamar.
 */
export function PanelRecursosLiberados() {
  const clienteConsultas = useQueryClient();
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [reclamando, setReclamando] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: CLAVE_RECURSOS_LIBERABLES,
    queryFn: async () => {
      const resultado = await obtenerRecursosLiberablesAccion();
      if (!resultado.exito || !resultado.datos) {
        throw new Error(resultado.exito ? 'La consulta no devolvi� datos' : resultado.error);
      }
      return resultado.datos;
    },
    refetchInterval: 60_000,
  });

  async function reclamar(recursoId: string): Promise<void> {
    setMensaje(null);
    setReclamando(recursoId);
    const resultado = await reclamarRecursoAccion({ recursoId });
    setReclamando(null);
    setMensaje(resultado.exito
      ? 'Recurso reclamado: la sesión pausada quedó liberada para otra orden'
      : resultado.error);
    await clienteConsultas.invalidateQueries({ queryKey: CLAVE_RECURSOS_LIBERABLES });
  }

  const liberables = consulta.data ?? [];

  return (
    <section className="rounded-lg border border-borde bg-superficie p-4" data-testid="panel-recursos-liberados">
      <h2 className="text-base font-semibold text-texto-primario">Máquinas liberadas</h2>
      <p className="mt-1 text-xs text-texto-secundario">
        Pausas DUDA/MATERIAL de más de 60 minutos. Reclamar cierra la sesión pausada y libera la máquina.
      </p>
      {consulta.isLoading && <Skeleton className="mt-3 h-16" />}
      {consulta.isError && (
        <p role="alert" className="mt-2 text-sm text-peligro-texto">
          {consulta.error instanceof Error ? consulta.error.message : 'No se pudieron cargar los recursos'}
        </p>
      )}
      {mensaje !== null && <p role="status" className="mt-2 text-sm text-texto-primario">{mensaje}</p>}
      {!consulta.isLoading && !consulta.isError && liberables.length === 0 && (
        <EstadoVacio
          titulo="Sin recursos liberables"
          descripcion="Cuando una máquina lleve más de una hora pausada por duda o material, aparecerá aquí."
        />
      )}
      {liberables.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {liberables.map((recurso) => (
            <li
              key={recurso.recursoId}
              className="rounded-md border border-borde p-3 text-sm"
              data-testid={`recurso-liberable-${recurso.recursoCodigo}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>{recurso.recursoNombre}</strong>
                  <span className="font-mono text-xs text-texto-secundario"> ({recurso.recursoCodigo})</span>
                  {' · '}{recurso.ordenFolio} · {recurso.partidaCodigo}
                </span>
                <Button
                  type="button"
                  tamano="sm"
                  disabled={reclamando === recurso.recursoId}
                  data-testid={`reclamar-recurso-${recurso.recursoCodigo}`}
                  onClick={() => void reclamar(recurso.recursoId)}
                >
                  {reclamando === recurso.recursoId ? 'Reclamando…' : 'Reclamar'}
                </Button>
              </div>
              <p className="mt-1 text-xs text-texto-secundario">
                {recurso.motivoNombre}
                {recurso.pausadaDesde
                  ? ` · pausada el ${formatearFecha(recurso.pausadaDesde)} a las ${formatearHora(recurso.pausadaDesde)}`
                  : ''}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
