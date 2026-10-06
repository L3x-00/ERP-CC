'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { Button } from '@/compartido/componentes/ui/button';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { Skeleton } from '@/compartido/componentes/retroalimentacion/skeleton';
import { crearPropuestaAccion } from '@/modulos/propuestas/acciones/crear-propuesta';
import { obtenerPropuestasAccion } from '@/modulos/propuestas/acciones/obtener-propuestas';
import { ETIQUETA_ESTADO_PROPIESTA } from '@/modulos/propuestas/utilidades/indice';
import { claveRfqPropuestas } from './claves-consulta';

/**
 * SII-B4.11: pestaña "Propuestas" de la ficha del RFQ. Lista las propuestas del
 * RFQ y permite crear la primera desde un RFQ listo para propuesta.
 */
export function ListaPropuestasRfq({
  rfqId,
  estadoRfq,
}: {
  rfqId: string;
  estadoRfq: string;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [creando, setCreando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: claveRfqPropuestas(rfqId),
    queryFn: () => obtenerPropuestasAccion({ rfqId }),
  });

  const filas = (consulta.data?.exito ? consulta.data.datos : []) ?? [];

  async function crear(): Promise<void> {
    setCreando(true);
    setMensaje(null);
    const respuesta = await crearPropuestaAccion({ rfqId });
    setCreando(false);
    if (!respuesta.exito) {
      setMensaje(respuesta.error);
      return;
    }
    await queryClient.invalidateQueries({ queryKey: ['propuestas'] });
    const propuestaId = respuesta.datos?.propuestaId;
    if (propuestaId) {
      router.push(`/propuestas?propuesta=${propuestaId}`);
    }
  }

  return (
    <section className="flex flex-col gap-3" data-testid="lista-propuestas-rfq">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-texto-primario">Propuestas del RFQ</h3>
        {estadoRfq === 'READY_FOR_PROPOSAL' && (
          <Button tamano="sm" onClick={() => void crear()} disabled={creando}>
            {creando ? 'Creando…' : 'Crear propuesta'}
          </Button>
        )}
      </div>

      {consulta.isLoading && <Skeleton className="h-24 w-full" />}

      {consulta.isError && (
        <p role="alert" className="text-sm text-peligro-texto">
          No se pudieron cargar las propuestas del RFQ.
        </p>
      )}

      {!consulta.isLoading && filas.length === 0 && (
        <EstadoVacio
          titulo="Sin propuestas"
          descripcion={
            estadoRfq === 'READY_FOR_PROPOSAL'
              ? 'Crea la propuesta A desde este RFQ listo.'
              : 'El RFQ debe estar listo para propuesta para crear la primera propuesta.'
          }
        />
      )}

      {filas.length > 0 && (
        <ul className="flex flex-col divide-y divide-borde">
          {filas.map((fila) => (
            <li key={fila.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <div className="flex flex-col">
                <Link
                  href={`/propuestas?propuesta=${fila.id}`}
                  className="font-mono font-semibold text-acento hover:underline"
                >
                  {fila.folioCnc}
                </Link>
                <span className="text-xs text-texto-secundario">
                  {fila.ultimaRevision
                    ? `Revisión ${fila.ultimaRevision.letra} · ${ETIQUETA_ESTADO_PROPIESTA[fila.ultimaRevision.estado]}`
                    : 'Sin revisiones'}
                </span>
              </div>
              <BadgeEstado estado={fila.estado} etiqueta={ETIQUETA_ESTADO_PROPIESTA[fila.estado]} />
            </li>
          ))}
        </ul>
      )}

      {mensaje && (
        <p role="alert" className="text-sm text-peligro-texto">
          {mensaje}
        </p>
      )}
    </section>
  );
}
