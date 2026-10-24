'use client';

import { useState } from 'react';

import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import type { Rfq } from '@/modulos/rfq/tipos/indice';
import {
  faltantesProximaAccion,
  fechaHoyLocal,
  type ProximaAccionCaptura,
} from '@/modulos/rfq/utilidades/proxima-accion';

import { actualizarDatosRfqAccion } from '../acciones/actualizar-datos-rfq';
import type { CatalogosRfq } from '../acciones/obtener-catalogos';
import { CamposProximaAccion } from './campos-proxima-accion';

/**
 * El cierre conserva únicamente la próxima acción y un resumen no editable.
 * Canal, descripción, fecha y responsable ya quedaron guardados antes de los
 * ítems; el responsable de la acción es el mismo responsable del RFQ.
 *
 * El guardado reutiliza la acción con CAS y permiso `rfq_editar`, que revalida
 * canal vigente, contacto del cliente y responsables activos; el RFQ conserva
 * su estado (Incompleto) y sigue reanudable desde su ficha. El mismo diálogo se
 * abre al pulsar «Finalizar más tarde» desde Ítems con `motivo="mas_tarde"`.
 */
export function DialogoFinalizarCapturaRfq({
  rfq,
  catalogos,
  motivo = 'finalizar',
  onCerrar,
  onExito,
  onRefrescar,
  onCambioEnvio,
}: {
  rfq: Rfq;
  catalogos: CatalogosRfq | null;
  /** `finalizar` cierra la captura completa; `mas_tarde` la deja pendiente con seguimiento. */
  motivo?: 'finalizar' | 'mas_tarde';
  onCerrar: () => void;
  onExito: () => void;
  onRefrescar?: () => void;
  onCambioEnvio?: (enviando: boolean) => void;
}) {
  const esMasTarde = motivo === 'mas_tarde';
  const hoy = fechaHoyLocal();
  const responsableId = rfq.responsableId ?? rfq.vendedorId;
  const responsableNombre =
    rfq.responsableNombre
    ?? catalogos?.usuarios.find((usuario) => usuario.id === responsableId)?.nombre
    ?? null;
  const [proxima, setProxima] = useState<ProximaAccionCaptura>(() => {
    const fecha = rfq.fechaProximaAccion?.slice(0, 10) ?? '';
    return {
      codigo: rfq.proximaAccionCodigo ?? '',
      texto: rfq.proximaAccionTexto ?? '',
      // La fecha y el responsable del seguimiento se autocompletan con quien
      // registra el RFQ; la fecha puede ajustarse antes de guardar.
      fecha: fecha && fecha >= hoy ? fecha : hoy,
      responsableId,
    };
  });
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const faltantesSeguimiento = catalogos
    ? faltantesProximaAccion(proxima, catalogos.proximasAcciones, hoy)
    : [];
  const faltantes = [
    ...faltantesSeguimiento,
  ].filter((item): item is string => item !== null);
  const formularioCompleto = catalogos !== null && faltantes.length === 0;

  async function enviar(): Promise<void> {
    if (!formularioCompleto || guardando) return;
    setGuardando(true);
    setMensaje(null);
    onCambioEnvio?.(true);
    try {
      const respuesta = await actualizarDatosRfqAccion({
        rfqId: rfq.id,
        actualizadoEn: rfq.actualizadoEn,
        canal: rfq.canal,
        canalDetalle: rfq.canalDetalle,
        fechaSolicitud: rfq.fechaSolicitud?.slice(0, 10) ?? null,
        descripcionGeneral: rfq.descripcionGeneral,
        // La acción reescribe la fila completa: se conserva el contacto ligado
        // durante el alta para no borrarlo al guardar este seguimiento.
        contactoId: rfq.contactoId ?? null,
        responsableId,
        proximaAccionCodigo: proxima.codigo,
        proximaAccionTexto: proxima.texto.trim() || null,
        fechaProximaAccion: proxima.fecha,
        responsableProximaAccionId: responsableId,
      });
      if (!respuesta.exito) {
        setMensaje(respuesta.error);
        // Un CAS vencido o un dato cambiado exige releer antes de reintentar.
        onRefrescar?.();
        return;
      }
      onExito();
    } catch {
      setMensaje('Error de conexión. Intenta de nuevo.');
    } finally {
      setGuardando(false);
      onCambioEnvio?.(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(valor) => {
        if (!valor && !guardando) onCerrar();
      }}
    >
      <DialogContent
        data-testid="dialogo-finalizar-captura"
        data-motivo={motivo}
        aria-label={esMasTarde ? 'Próxima acción del RFQ' : 'Finalizar captura del RFQ'}
      >
        <DialogHeader>
          <DialogTitle>{esMasTarde ? 'Próxima acción' : 'Finalizar captura'}</DialogTitle>
          <DialogDescription>
            {esMasTarde
              ? 'Indica qué sigue con este RFQ. La fecha y el responsable se completan con los datos de quien lo registra, y el RFQ queda Incompleto para retomarlo después.'
              : 'Confirma la acción y la fecha de seguimiento. Los datos generales ya quedaron registrados.'}
          </DialogDescription>
        </DialogHeader>

        {catalogos === null ? (
          <p className="text-sm text-texto-secundario" role="status" aria-live="polite">
            Cargando catálogos…
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <section aria-label="Resumen del RFQ" className="rounded-lg border border-borde bg-superficie-2 p-3">
              <h3 className="text-sm font-semibold text-texto-primario">Resumen del RFQ</h3>
              <dl className="mt-2 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-texto-secundario">Cliente</dt><dd>{rfq.clienteNombre ?? rfq.empresa}</dd></div>
                <div><dt className="text-texto-secundario">Canal</dt><dd>{rfq.canal ?? 'Sin canal'}</dd></div>
                <div><dt className="text-texto-secundario">Fecha de registro</dt><dd>{rfq.fechaSolicitud ?? 'Sin fecha'}</dd></div>
                <div><dt className="text-texto-secundario">Responsable</dt><dd>{responsableNombre ?? 'Usuario que registró el RFQ'}</dd></div>
                <div className="sm:col-span-2"><dt className="text-texto-secundario">Descripción</dt><dd>{rfq.descripcionGeneral ?? 'Sin descripción'}</dd></div>
              </dl>
            </section>

            <CamposProximaAccion
              idBase="rfq-finalizar-proxima"
              valor={proxima}
              onCambio={setProxima}
              catalogos={catalogos}
              hoy={hoy}
              sinResponsable
              responsableFijoNombre={responsableNombre}
            />

            {faltantes.length > 0 && (
              <p className="text-xs text-texto-secundario" data-testid="faltantes-finalizar">
                Falta: {faltantes.join(', ')}.
              </p>
            )}
          </div>
        )}

        {mensaje !== null && (
          <p role="alert" className="text-sm text-peligro-texto">
            {mensaje}
          </p>
        )}

        <DialogFooter>
          <Button variante="fantasma" onClick={onCerrar} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={!formularioCompleto || guardando}>
            {guardando
              ? 'Guardando…'
              : esMasTarde
                ? 'Guardar y finalizar más tarde'
                : 'Guardar y finalizar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
