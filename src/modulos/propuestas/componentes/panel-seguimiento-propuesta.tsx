'use client';

import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { formatearFecha } from '@/compartido/utilidades/formatear';
import { hoyIso } from '@/modulos/planeacion/utilidades/fechas-planeacion';
import { registrarSeguimientoPropuestaAccion } from '@/modulos/propuestas/acciones/registrar-seguimiento-propuesta';
import type { CatalogosPropuesta } from '@/modulos/propuestas/acciones/obtener-catalogos-propuesta';
import type {
  AccionRevisionPropuesta,
  PermisosPropuesta,
  RevisionPropuesta,
} from '@/modulos/propuestas/tipos/indice';
import { claveDetallePropuesta } from './claves-consulta';

/**
 * SII-B4.6/4.11: próxima acción de la revisión (catálogo B1.7 + texto si es
 * "Otro"). El histórico por revisión nunca se sobrescribe.
 */
export function PanelSeguimientoPropuesta({
  revision,
  acciones,
  catalogos,
  permisos,
}: {
  revision: RevisionPropuesta;
  acciones: AccionRevisionPropuesta[];
  catalogos: CatalogosPropuesta | null;
  permisos: PermisosPropuesta;
}) {
  const queryClient = useQueryClient();
  const [codigo, setCodigo] = useState('FOLLOW_UP');
  const [textoOtro, setTextoOtro] = useState('');
  const [fecha, setFecha] = useState(hoyIso());
  const [canal, setCanal] = useState('');
  const [nota, setNota] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  // READY_TO_SEND incluido: la próxima acción es requisito para poder enviar.
  const estadosPermitidos = ['DRAFT', 'READY_TO_SEND', 'SENT', 'FOLLOW_UP'];
  const puedeRegistrar = estadosPermitidos.includes(revision.estado) && permisos.seguimiento;
  const accionSeleccionada = (catalogos?.proximasAcciones ?? []).find(
    (accion) => accion.codigo === codigo,
  );
  const esOtro = accionSeleccionada?.esOtro ?? false;

  const historial = acciones
    .filter((accion) => accion.revisionId === revision.id)
    .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));

  async function registrar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (esOtro && textoOtro.trim().length < 3) {
      setMensaje('La acción "Otro" requiere un detalle (3 a 300 caracteres)');
      return;
    }
    setGuardando(true);
    setMensaje(null);
    const respuesta = await registrarSeguimientoPropuestaAccion({
      revisionId: revision.id,
      actualizadoEn: revision.actualizadoEn,
      codigo,
      ...(esOtro ? { textoOtro } : {}),
      fecha,
      ...(canal ? { canal } : {}),
      ...(nota ? { nota } : {}),
    });
    setGuardando(false);
    if (!respuesta.exito) {
      setMensaje(respuesta.error);
      return;
    }
    setTextoOtro('');
    setNota('');
    setMensaje('Seguimiento registrado.');
    await queryClient.invalidateQueries({ queryKey: claveDetallePropuesta(revision.propuestaId) });
  }

  return (
    <section className="flex flex-col gap-4" data-testid="panel-seguimiento-propuesta">
      <h3 className="text-sm font-semibold text-texto-primario">Próxima acción</h3>

      {historial.length === 0 ? (
        <p className="text-sm text-texto-secundario">Sin acciones registradas.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-borde">
          {historial.map((accion) => (
            <li key={accion.id} className="flex flex-col py-2 text-sm">
              <span className="font-medium">
                {accion.codigo}
                {accion.textoOtro ? ` · ${accion.textoOtro}` : ''}
              </span>
              <span className="text-xs text-texto-secundario">
                {accion.fecha ? formatearFecha(accion.fecha) : 'Sin fecha'}
                {accion.canal ? ` · ${accion.canal}` : ''}
                {accion.nota ? ` · ${accion.nota}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      {puedeRegistrar ? (
        <form onSubmit={registrar} className="flex flex-col gap-2 rounded-lg border border-borde p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Acción</span>
              <Select
                value={codigo}
                onChange={(evento) => setCodigo(evento.target.value)}
                aria-label="Acción de seguimiento"
              >
                {(catalogos?.proximasAcciones ?? []).map((accion) => (
                  <option key={accion.codigo} value={accion.codigo}>
                    {accion.nombre}
                  </option>
                ))}
              </Select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Fecha</span>
              <Input
                type="date"
                value={fecha}
                onChange={(evento) => setFecha(evento.target.value)}
                aria-label="Fecha de la próxima acción"
              />
            </label>
            {esOtro && (
              <label className="flex flex-col gap-1 text-sm sm:col-span-2">
                <span className="font-medium">Detalle (Otro)</span>
                <Input
                  value={textoOtro}
                  onChange={(evento) => setTextoOtro(evento.target.value)}
                  maxLength={300}
                  aria-label="Detalle de la acción Otro"
                />
              </label>
            )}
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Canal (opcional)</span>
              <Input
                value={canal}
                onChange={(evento) => setCanal(evento.target.value)}
                maxLength={60}
                aria-label="Canal del seguimiento"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Nota (opcional)</span>
              <Input
                value={nota}
                onChange={(evento) => setNota(evento.target.value)}
                maxLength={1000}
                aria-label="Nota del seguimiento"
              />
            </label>
          </div>
          <div className="flex items-center gap-2">
            <Button type="submit" tamano="sm" disabled={guardando}>
              {guardando ? '…' : 'Registrar seguimiento'}
            </Button>
            {mensaje && (
              <span role="status" className="text-xs text-texto-secundario">
                {mensaje}
              </span>
            )}
          </div>
        </form>
      ) : (
        <p className="text-xs text-texto-secundario">
          {revision.estado === 'SENT' || revision.estado === 'FOLLOW_UP'
            ? 'Sin permiso para registrar seguimiento.'
            : 'El seguimiento se registra en revisiones en borrador, enviadas o en seguimiento.'}
        </p>
      )}
    </section>
  );
}
