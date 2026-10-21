'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { Button } from '@/compartido/componentes/ui/button';
import { formatearFechaCalendario } from '@/modulos/ordenes/utilidades/formato-ficha';
import type { CatalogosPropuesta } from '@/modulos/propuestas/acciones/obtener-catalogos-propuesta';
import type {
  AccionRevisionPropuesta,
  PermisosPropuesta,
  RevisionPropuesta,
} from '@/modulos/propuestas/tipos/indice';
import { textoProximaAccion } from '@/modulos/propuestas/utilidades/cola-propuestas';
import { claveDetallePropuesta } from './claves-consulta';
import { DialogoSeguimientoPropuesta } from './dialogo-seguimiento-propuesta';

/**
 * SII-B4.6/4.11 + obs. cliente 2026-10-11: el historial de próximas acciones
 * (append-only) se muestra aquí; la captura vive en un modal. Al validar, el
 * modal es obligatorio y el servidor registra el seguimiento antes de validar.
 *
 * Obs. cliente 2026-10-20: el usuario no debe ver códigos internos; cada acción
 * se lee en español, con su fecha de calendario y un subtítulo que explica para
 * qué sirve el historial.
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
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <h3 className="text-sm font-semibold text-texto-primario">Próxima acción</h3>
          <p className="max-w-prose text-xs text-texto-secundario">
            Anota qué sigue con esta propuesta (por ejemplo, esperar la respuesta del cliente) y para
            cuándo. Cada anotación se guarda en el historial; la más reciente es la que vale.
          </p>
        </div>
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
        <p className="text-sm text-texto-secundario">
          Todavía no hay acciones anotadas.
          {puedeRegistrar ? ' Usa «Registrar seguimiento» para anotar la primera.' : ''}
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-borde">
          {historial.map((accion, indice) => (
            <li key={accion.id} className="flex flex-col py-2 text-sm">
              <span className="flex flex-wrap items-center gap-2 font-medium">
                {textoProximaAccion(accion.codigo, accion.textoOtro)}
                {indice === 0 && (
                  <span className="rounded-full bg-acento-suave px-2 py-0.5 text-xs font-medium text-acento">
                    Vigente
                  </span>
                )}
              </span>
              <span className="text-xs text-texto-secundario">
                {accion.fecha ? `Para el ${formatearFechaCalendario(accion.fecha)}` : 'Sin fecha definida'}
                {accion.canal ? ` · Canal: ${nombreCanal(accion.canal)}` : ''}
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
            ? 'No tienes permiso para anotar seguimiento.'
            : 'El seguimiento se puede anotar mientras la versión está en borrador, enviada o en seguimiento.'}
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
