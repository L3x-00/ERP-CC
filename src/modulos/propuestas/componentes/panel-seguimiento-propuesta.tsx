'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/compartido/componentes/ui/button';
import { formatearFecha } from '@/compartido/utilidades/formatear';
import type { CatalogosPropuesta } from '@/modulos/propuestas/acciones/obtener-catalogos-propuesta';
import type {
  AccionRevisionPropuesta,
  PermisosPropuesta,
  RevisionPropuesta,
} from '@/modulos/propuestas/tipos/indice';
import { claveDetallePropuesta } from './claves-consulta';
import { DialogoSeguimientoPropuesta } from './dialogo-seguimiento-propuesta';

/**
 * SII-B4.6/4.11 + obs. cliente 2026-10-11: el historial de próximas acciones
 * (append-only) se muestra aquí; la captura vive en un modal. Al validar, el
 * modal es obligatorio y el servidor registra el seguimiento antes de validar.
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
  const [modalAbierto, setModalAbierto] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  // READY_TO_SEND incluido: la próxima acción es requisito para poder enviar.
  const estadosPermitidos = ['DRAFT', 'READY_TO_SEND', 'SENT', 'FOLLOW_UP'];
  const puedeRegistrar = estadosPermitidos.includes(revision.estado) && permisos.seguimiento;

  const historial = acciones
    .filter((accion) => accion.revisionId === revision.id)
    .sort((a, b) => b.creadoEn.localeCompare(a.creadoEn));

  // El canal se guarda como código del catálogo (o el texto de «Otro»); se
  // muestra el nombre configurado cuando existe.
  const nombreCanal = (valor: string): string =>
    catalogos?.canales.find((opcion) => opcion.codigo === valor)?.nombre ?? valor;

  async function refrescar(): Promise<void> {
    await queryClient.invalidateQueries({
      queryKey: claveDetallePropuesta(revision.propuestaId),
    });
  }

  return (
    <section className="flex flex-col gap-4" data-testid="panel-seguimiento-propuesta">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-texto-primario">Próxima acción</h3>
        {puedeRegistrar && (
          <Button
            tamano="sm"
            variante="contorno"
            data-testid="abrir-registrar-seguimiento"
            onClick={() => {
              setMensaje(null);
              setModalAbierto(true);
            }}
          >
            Registrar seguimiento
          </Button>
        )}
      </div>

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
                {accion.canal ? ` · ${nombreCanal(accion.canal)}` : ''}
                {accion.nota ? ` · ${accion.nota}` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}

      {mensaje !== null && (
        <p role="status" className="text-sm text-exito-texto">
          {mensaje}
        </p>
      )}

      {!puedeRegistrar && (
        <p className="text-xs text-texto-secundario">
          {revision.estado === 'SENT' || revision.estado === 'FOLLOW_UP'
            ? 'Sin permiso para registrar seguimiento.'
            : 'El seguimiento se registra en revisiones en borrador, enviadas o en seguimiento.'}
        </p>
      )}

      {modalAbierto && (
        <DialogoSeguimientoPropuesta
          modo="registrar"
          revision={revision}
          catalogos={catalogos}
          puedeRegistrar={permisos.seguimiento}
          onCerrar={() => setModalAbierto(false)}
          onExito={() => {
            setMensaje('Seguimiento registrado.');
            void refrescar();
          }}
        />
      )}
    </section>
  );
}
