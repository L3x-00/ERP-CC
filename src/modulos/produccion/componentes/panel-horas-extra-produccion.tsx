'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/compartido/componentes/ui/button';
import { Input, Textarea } from '@/compartido/componentes/ui/input';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { formatearFecha, formatearHora } from '@/compartido/utilidades/formatear';
import { ETIQUETAS_ESTADO_AUTORIZACION_HORA_EXTRA } from '@/modulos/produccion/utilidades/indice';
import type { OrdenTableroProduccion } from '@/modulos/produccion/servicios/indice';

import { autorizarHorasExtraAccion } from '../acciones/indice';
import { obtenerAutorizacionesHoraExtraAccion } from '../acciones/consultas-b6';
import { CLAVE_HORAS_EXTRA_ORDEN } from './claves-consulta';


/**
 * SII-B6.2: autorizaciones de horas extra por orden (Management/Admin). El
 * cierre de sesión consume una autorización VIGENTE de la sesión u orden.
 */
export function PanelHorasExtraProduccion({
  orden,
  sesionIdActivo,
}: {
  orden: OrdenTableroProduccion | null;
  sesionIdActivo: string | null;
}) {
  const clienteConsultas = useQueryClient();
  const [horas, setHoras] = useState('2');
  const [motivo, setMotivo] = useState('');
  const [aplicaSesion, setAplicaSesion] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  const consulta = useQuery({
    queryKey: [...CLAVE_HORAS_EXTRA_ORDEN, orden?.id ?? 'sin-orden'],
    queryFn: async () => {
      if (!orden) return [];
      const resultado = await obtenerAutorizacionesHoraExtraAccion({ ordenId: orden.id });
      if (!resultado.exito || !resultado.datos) {
        throw new Error(resultado.exito ? 'La consulta no devolvi� datos' : resultado.error);
      }
      return resultado.datos;
    },
    enabled: orden !== null,
  });
  const autorizaciones = consulta.data ?? [];

  async function autorizar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (!orden) return;
    setMensaje(null);
    setProcesando(true);
    const resultado = await autorizarHorasExtraAccion({
      ordenId: orden.id,
      ...(aplicaSesion && sesionIdActivo ? { sesionId: sesionIdActivo } : {}),
      horas: Number(horas),
      motivo: motivo.trim(),
    });
    setProcesando(false);
    if (!resultado.exito) {
      setMensaje(resultado.error);
      return;
    }
    setMensaje(`Autorizadas ${resultado.datos?.horasAutorizadas ?? horas} h extra`);
    setMotivo('');
    await clienteConsultas.invalidateQueries({ queryKey: CLAVE_HORAS_EXTRA_ORDEN });
  }

  return (
    <section className="rounded-lg border border-borde bg-superficie p-4" data-testid="panel-horas-extra">
      <h2 className="text-base font-semibold text-texto-primario">Horas extra</h2>
      <p className="mt-1 text-xs text-texto-secundario">
        Solo Management/Admin. Se consumen al cerrar una sesión que exceda la jornada del turno.
      </p>
      {!orden && <p className="mt-2 text-sm text-texto-secundario">Selecciona una orden del Kanban.</p>}
      {mensaje !== null && <p role="status" className="mt-2 text-sm text-texto-primario">{mensaje}</p>}

      {orden && (
        <form className="mt-3 flex flex-col gap-3" onSubmit={autorizar}>
          <label className="flex flex-col gap-1 text-sm font-medium text-texto-secundario" htmlFor="horas-extra-horas">
            Horas (máx. 24)
            <Input
              id="horas-extra-horas"
              data-testid="horas-extra-horas"
              type="number"
              min="0.25"
              max="24"
              step="0.25"
              value={horas}
              onChange={(evento) => setHoras(evento.target.value)}
              required
            />
          </label>
          {sesionIdActivo ? (
            <label className="flex items-center gap-2 text-sm text-texto-secundario">
              <input
                type="checkbox"
                checked={aplicaSesion}
                onChange={(evento) => setAplicaSesion(evento.target.checked)}
              />
              Vincular a mi sesión activa
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-sm font-medium text-texto-secundario" htmlFor="horas-extra-motivo">
            Motivo
            <Textarea
              id="horas-extra-motivo"
              data-testid="horas-extra-motivo"
              className="min-h-11"
              maxLength={300}
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              required
            />
          </label>
          <Button
            type="submit"
            tamano="sm"
            className="self-start"
            disabled={procesando || motivo.trim().length < 3}
            data-testid="autorizar-horas-extra"
          >
            {procesando ? 'Autorizando…' : 'Autorizar horas extra'}
          </Button>
        </form>
      )}

      {orden && !consulta.isLoading && autorizaciones.length === 0 && (
        <EstadoVacio titulo="Sin autorizaciones" descripcion="Esta orden no tiene horas extra registradas." />
      )}
      {autorizaciones.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2" data-testid="lista-horas-extra">
          {autorizaciones.map((autorizacion) => (
            <li key={autorizacion.id} className="rounded-md border border-borde p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>{autorizacion.horasAutorizadas} h</strong>
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
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
