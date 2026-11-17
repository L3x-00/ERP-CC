'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/compartido/componentes/ui/button';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { formatearFecha, formatearHora, formatearNumero } from '@/compartido/utilidades/formatear';
import { ETIQUETAS_ESTADO_AUTORIZACION_HORA_EXTRA } from '@/modulos/produccion/utilidades/indice';
import type { OrdenTableroProduccion } from '@/modulos/produccion/servicios/indice';

import { resolverSolicitudHorasExtraAccion } from '../acciones/indice';
import { obtenerAutorizacionesHoraExtraAccion } from '../acciones/consultas-b6';
import { CLAVE_HORAS_EXTRA_ORDEN } from './claves-consulta';

type MensajeHorasExtra = { texto: string; tipo: 'error' | 'estado' };

/**
 * C12: solicitudes de horas extra. El sistema las genera cuando el cierre del
 * operador excede la jornada; Admin/Management solo aprueba o desaprueba y ve
 * el resumen, sin capturar horas ni motivo.
 */
export function PanelHorasExtraProduccion({
  orden,
}: {
  orden: OrdenTableroProduccion | null;
  sesionIdActivo?: string | null;
}) {
  const clienteConsultas = useQueryClient();
  const [mensaje, setMensaje] = useState<MensajeHorasExtra | null>(null);
  const [resolviendo, setResolviendo] = useState<string | null>(null);
  const [rechazando, setRechazando] = useState<string | null>(null);
  const [notasRechazo, setNotasRechazo] = useState<Record<string, string>>({});

  const consulta = useQuery({
    queryKey: [...CLAVE_HORAS_EXTRA_ORDEN, orden?.id ?? 'sin-orden'],
    queryFn: async () => {
      if (!orden) return [];
      const resultado = await obtenerAutorizacionesHoraExtraAccion({ ordenId: orden.id });
      if (!resultado.exito || !resultado.datos) {
        throw new Error(resultado.exito ? 'La consulta no devolvió datos' : resultado.error);
      }
      return resultado.datos;
    },
    enabled: orden !== null,
    refetchInterval: 15_000,
  });
  const autorizaciones = consulta.data ?? [];
  const pendientes = autorizaciones.filter((autorizacion) => autorizacion.estado === 'SOLICITADA');
  const historial = autorizaciones.filter((autorizacion) => autorizacion.estado !== 'SOLICITADA');

  async function resolver(id: string, aprobar: boolean, nota?: string): Promise<void> {
    setMensaje(null);
    setResolviendo(id);
    try {
      const resultado = await resolverSolicitudHorasExtraAccion({
        id,
        aprobar,
        ...(nota ? { nota } : {}),
      });
      if (!resultado.exito) {
        setMensaje({ texto: resultado.error, tipo: 'error' });
        return;
      }
      setMensaje({
        texto: aprobar
          ? 'Solicitud aprobada: el operador ya puede cerrar su sesión.'
          : 'Solicitud rechazada con nota. El operador puede volver a solicitar al intentar cerrar la sesión.',
        tipo: 'estado',
      });
      if (!aprobar) {
        setRechazando(null);
        setNotasRechazo((previo) => ({ ...previo, [id]: '' }));
      }
      await clienteConsultas.invalidateQueries({ queryKey: CLAVE_HORAS_EXTRA_ORDEN });
    } catch {
      setMensaje({ texto: 'No se pudo resolver la solicitud. Vuelve a intentarlo.', tipo: 'error' });
    } finally {
      setResolviendo(null);
    }
  }

  return (
    <section className="rounded-lg border border-borde bg-superficie p-4" data-testid="panel-horas-extra">
      <div>
        <h2 className="text-base font-semibold text-texto-primario">Horas extra</h2>
        <p className="mt-1 text-xs text-texto-secundario">
          El operador puede justificar el exceso de su sesión o solicitar aprobación. Management/Admin
          aprueba o rechaza; el rechazo exige nota, queda en la auditoría y se muestra en el historial.
        </p>
      </div>
      {!orden && <p className="mt-2 text-sm text-texto-secundario">Selecciona una orden del Kanban.</p>}
      {mensaje !== null && (
        <p
          role={mensaje.tipo === 'error' ? 'alert' : 'status'}
          className={mensaje.tipo === 'error' ? 'mt-2 text-sm text-peligro-texto' : 'mt-2 text-sm text-exito-texto'}
        >
          {mensaje.texto}
        </p>
      )}

      {orden && consulta.isError ? (
        <p role="alert" className="mt-3 text-sm text-peligro-texto">
          No se pudieron cargar las solicitudes de horas extra.
        </p>
      ) : null}

      {orden && !consulta.isLoading && autorizaciones.length === 0 && (
        <EstadoVacio
          titulo="Sin solicitudes"
          descripcion="Esta orden no tiene horas extra solicitadas ni autorizadas."
        />
      )}

      {pendientes.length > 0 ? (
        <ul className="mt-3 flex flex-col gap-2" data-testid="solicitudes-horas-extra-pendientes">
          {pendientes.map((solicitud) => (
            <li key={solicitud.id} className="rounded-md border border-advertencia/50 bg-advertencia-suave p-3 text-sm">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-texto-primario">
                    {formatearNumero(solicitud.horasAutorizadas, 2)} h extra
                    {solicitud.sesionId ? ' · sesión en curso' : ''}
                  </p>
                  <p className="text-xs text-texto-secundario">
                    {solicitud.motivo}
                  </p>
                  <p className="mt-1 text-xs text-texto-tenue">
                    Solicitada {formatearFecha(solicitud.creadoEn)} {formatearHora(solicitud.creadoEn)}
                    {solicitud.autorizadoPorNombre ? ` · ${solicitud.autorizadoPorNombre}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <Button
                    type="button"
                    tamano="sm"
                    disabled={resolviendo === solicitud.id}
                    onClick={() => void resolver(solicitud.id, true)}
                    data-testid={`aprobar-horas-extra-${solicitud.id}`}
                  >
                    Aprobar
                  </Button>
                  {rechazando === solicitud.id ? (
                    <div className="flex flex-col gap-1">
                      <label className="text-xs text-texto-secundario">
                        Motivo del rechazo
                        <textarea
                          rows={2}
                          maxLength={300}
                          value={notasRechazo[solicitud.id] ?? ''}
                          onChange={(evento) =>
                            setNotasRechazo((previo) => ({
                              ...previo,
                              [solicitud.id]: evento.target.value,
                            }))
                          }
                          data-testid={`nota-rechazo-horas-extra-${solicitud.id}`}
                          className="mt-1 w-full rounded-md border border-borde-fuerte bg-superficie-2 px-2 py-1 text-sm"
                        />
                      </label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          tamano="sm"
                          variante="destructivo"
                          disabled={resolviendo === solicitud.id}
                          onClick={() =>
                            void resolver(solicitud.id, false, notasRechazo[solicitud.id])
                          }
                          data-testid={`confirmar-rechazo-horas-extra-${solicitud.id}`}
                        >
                          Confirmar rechazo
                        </Button>
                        <Button
                          type="button"
                          tamano="sm"
                          variante="contorno"
                          onClick={() => setRechazando(null)}
                        >
                          Cancelar
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <Button
                      type="button"
                      tamano="sm"
                      variante="contorno"
                      disabled={resolviendo === solicitud.id}
                      onClick={() => setRechazando(solicitud.id)}
                      data-testid={`rechazar-horas-extra-${solicitud.id}`}
                    >
                      Desaprobar
                    </Button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {historial.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2" data-testid="lista-horas-extra">
          {historial.map((autorizacion) => (
            <li key={autorizacion.id} className="rounded-md border border-borde p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>{formatearNumero(autorizacion.horasAutorizadas, 2)} h</strong>
                  {' · '}{ETIQUETAS_ESTADO_AUTORIZACION_HORA_EXTRA[autorizacion.estado]}
                  {autorizacion.sesionId ? ' · vinculada a sesión' : ' · de la orden'}
                </span>
                <span className="text-xs text-texto-secundario">
                  {formatearFecha(autorizacion.creadoEn)} {formatearHora(autorizacion.creadoEn)}
                </span>
              </div>
              <p className="mt-1 text-xs text-texto-secundario">
                {autorizacion.motivo}
                {autorizacion.autorizadoPorNombre ? ` · ${autorizacion.autorizadoPorNombre}` : ''}
              </p>
              {autorizacion.notaRechazo ? (
                <p
                  className="mt-1 text-xs text-peligro-texto"
                  data-testid={`nota-rechazo-historial-${autorizacion.id}`}
                >
                  Motivo del rechazo: {autorizacion.notaRechazo}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
