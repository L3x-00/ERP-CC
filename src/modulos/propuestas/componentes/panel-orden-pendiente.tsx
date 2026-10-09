'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/compartido/componentes/ui/button';
import { formatearFecha } from '@/compartido/utilidades/formatear';
import { crearOrdenDesdeRevisionAccion } from '@/modulos/ordenes/acciones/crear-orden-desde-revision';
import { obtenerSolicitudOrdenAccion } from '@/modulos/ordenes/acciones/solicitud-orden';

/**
 * C4.1/DC-09: estado de la Orden de la revisión aceptada. Si un gate falló, la
 * aceptación sigue vigente y se muestra «Orden pendiente» con la causa y
 * Reintentar (con permiso de liberar órdenes); reintentar nunca duplica.
 */
export function PanelOrdenPendiente({ revisionId }: { revisionId: string }) {
  const queryClient = useQueryClient();
  const [procesando, setProcesando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const clave = ['solicitud-orden', revisionId] as const;
  const consulta = useQuery({
    queryKey: clave,
    queryFn: async () => {
      const respuesta = await obtenerSolicitudOrdenAccion({ revisionId });
      if (!respuesta.exito) throw new Error(respuesta.error);
      return respuesta.datos ?? null;
    },
  });
  const solicitud = consulta.data;
  if (!solicitud) return null;

  async function reintentar(): Promise<void> {
    setProcesando(true);
    setMensaje(null);
    const respuesta = await crearOrdenDesdeRevisionAccion({ revisionId });
    setProcesando(false);
    if (!respuesta.exito) setMensaje(respuesta.error);
    await queryClient.invalidateQueries({ queryKey: clave });
  }

  if (solicitud.estado === 'CREATED') {
    return (
      <p className="text-sm text-exito-texto" data-testid="propuesta-orden-creada">
        Orden creada{solicitud.folio ? ` (${solicitud.folio})` : ''} · compromiso {formatearFecha(solicitud.fechaCompromisoComercial)}
      </p>
    );
  }

  return (
    <div
      className="flex flex-col gap-2 rounded-md border border-advertencia/40 bg-advertencia-suave px-3 py-2 text-sm"
      data-testid="propuesta-orden-pendiente"
    >
      <p className="font-semibold text-advertencia-texto">
        Orden pendiente · compromiso {formatearFecha(solicitud.fechaCompromisoComercial)}
      </p>
      <p className="text-texto-primario">
        {solicitud.causa ?? 'La aceptación está registrada; la orden aún no se ha creado.'}
        {solicitud.intentos > 0 ? ` (intentos: ${solicitud.intentos})` : ''}
      </p>
      {solicitud.puedeReintentar ? (
        <div>
          <Button
            tamano="sm"
            onClick={() => void reintentar()}
            disabled={procesando}
            data-testid="propuesta-reintentar-orden"
          >
            {procesando ? 'Creando orden…' : solicitud.estado === 'BLOCKED' ? 'Reintentar' : 'Crear orden'}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-texto-secundario">Producción/Administración crea la orden con permiso de liberar órdenes.</p>
      )}
      {mensaje ? <p role="alert" className="text-sm text-peligro-texto">{mensaje}</p> : null}
    </div>
  );
}
