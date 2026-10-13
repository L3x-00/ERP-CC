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
import { Input, Select, Textarea } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import type { Rfq } from '@/modulos/rfq/tipos/indice';
import { CLASE_OBLIGATORIO } from '@/modulos/rfq/utilidades/faltantes';
import {
  faltantesProximaAccion,
  fechaHoyLocal,
  type ProximaAccionCaptura,
} from '@/modulos/rfq/utilidades/proxima-accion';

import { actualizarDatosRfqAccion } from '../acciones/actualizar-datos-rfq';
import type { CatalogosRfq } from '../acciones/obtener-catalogos';
import { CamposProximaAccion } from './campos-proxima-accion';

/**
 * Obs. cliente 2026-10-13: «Finalizar captura» abre este modal obligatorio con
 * canal, seguimiento y próxima acción (antes vivían en el paso Cliente y
 * solicitud del alta). Un único «Responsable» alimenta el del RFQ y el de la
 * próxima acción para eliminar el campo redundante.
 *
 * El guardado reutiliza la acción con CAS y permiso `rfq_editar`, que revalida
 * canal vigente, contacto del cliente y responsables activos; el RFQ conserva
 * su estado (Incompleto) y sigue reanudable desde su ficha.
 */
export function DialogoFinalizarCapturaRfq({
  rfq,
  catalogos,
  onCerrar,
  onExito,
  onRefrescar,
  onCambioEnvio,
}: {
  rfq: Rfq;
  catalogos: CatalogosRfq | null;
  onCerrar: () => void;
  onExito: () => void;
  onRefrescar?: () => void;
  onCambioEnvio?: (enviando: boolean) => void;
}) {
  const hoy = fechaHoyLocal();
  const [canal, setCanal] = useState(rfq.canal ?? '');
  const [canalDetalle, setCanalDetalle] = useState(rfq.canalDetalle ?? '');
  const [fechaSolicitud, setFechaSolicitud] = useState(
    rfq.fechaSolicitud?.slice(0, 10) || hoy,
  );
  const [descripcionGeneral, setDescripcionGeneral] = useState(rfq.descripcionGeneral ?? '');
  const [proxima, setProxima] = useState<ProximaAccionCaptura>(() => {
    const fecha = rfq.fechaProximaAccion?.slice(0, 10) ?? '';
    return {
      codigo: rfq.proximaAccionCodigo ?? '',
      texto: rfq.proximaAccionTexto ?? '',
      fecha: fecha && fecha >= hoy ? fecha : '',
      responsableId: rfq.responsableId ?? rfq.responsableProximaAccionId ?? '',
    };
  });
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const canalSeleccionado = (catalogos?.canales ?? []).find((opcion) => opcion.codigo === canal);
  const canalesVisibles = (catalogos?.canales ?? []).filter(
    (opcion) => opcion.activo || opcion.codigo === canal,
  );
  const canalHistoricoSinCatalogar =
    canal !== '' && !(catalogos?.canales ?? []).some((opcion) => opcion.codigo === canal);
  const faltantesSeguimiento = catalogos
    ? faltantesProximaAccion(proxima, catalogos.proximasAcciones, hoy)
    : [];
  const faltantes = [
    canal === '' ? 'canal' : null,
    canalSeleccionado?.esOtro && !canalDetalle.trim() ? 'detalle del canal Otro' : null,
    fechaSolicitud === '' ? 'fecha de solicitud' : null,
    descripcionGeneral.trim() === '' ? 'descripción general' : null,
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
        canal: canal.trim() || null,
        canalDetalle: canalSeleccionado?.esOtro ? canalDetalle.trim() : null,
        fechaSolicitud: fechaSolicitud || null,
        descripcionGeneral: descripcionGeneral.trim(),
        // La acción reescribe la fila completa: se conserva el contacto ligado
        // durante el alta para no borrarlo al guardar este seguimiento.
        contactoId: rfq.contactoId ?? null,
        responsableId: proxima.responsableId,
        proximaAccionCodigo: proxima.codigo,
        proximaAccionTexto: proxima.texto.trim() || null,
        fechaProximaAccion: proxima.fecha,
        responsableProximaAccionId: proxima.responsableId,
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
        aria-label="Finalizar captura del RFQ"
      >
        <DialogHeader>
          <DialogTitle>Finalizar captura</DialogTitle>
          <DialogDescription>
            Canal, seguimiento y próxima acción: los campos con * son obligatorios para dejar el
            RFQ listo para propuesta. El responsable elegido aplica al RFQ y a la próxima acción.
          </DialogDescription>
        </DialogHeader>

        {catalogos === null ? (
          <p className="text-sm text-texto-secundario" role="status" aria-live="polite">
            Cargando catálogos…
          </p>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label htmlFor="rfq-finalizar-canal" className={CLASE_OBLIGATORIO}>
                  Canal
                </Label>
                <Select
                  id="rfq-finalizar-canal"
                  value={canal}
                  onChange={(evento) => {
                    const codigo = evento.target.value;
                    setCanal(codigo);
                    const siguiente = catalogos.canales.find(
                      (opcion) => opcion.codigo === codigo,
                    );
                    if (!siguiente?.esOtro) setCanalDetalle('');
                  }}
                  aria-required="true"
                >
                  <option value="">Sin canal</option>
                  {canalHistoricoSinCatalogar && (
                    <option value={canal}>{canal} (histórico)</option>
                  )}
                  {canalesVisibles.map((opcion) => (
                    <option key={opcion.codigo} value={opcion.codigo}>
                      {opcion.nombre}
                      {opcion.activo ? '' : ' (inactivo)'}
                    </option>
                  ))}
                </Select>
                <span className="text-xs text-texto-secundario">Cómo llegó la solicitud.</span>
              </div>

              {canalSeleccionado?.esOtro && (
                <div className="flex flex-col gap-1">
                  <Label htmlFor="rfq-finalizar-canal-detalle" className={CLASE_OBLIGATORIO}>
                    Detalle del canal Otro
                  </Label>
                  <Input
                    id="rfq-finalizar-canal-detalle"
                    value={canalDetalle}
                    onChange={(evento) => setCanalDetalle(evento.target.value)}
                    maxLength={300}
                    aria-required="true"
                    placeholder="Ej. feria industrial o alianza comercial"
                  />
                </div>
              )}

              <div className="flex flex-col gap-1">
                <Label htmlFor="rfq-finalizar-fecha-solicitud" className={CLASE_OBLIGATORIO}>
                  Fecha de solicitud
                </Label>
                <Input
                  id="rfq-finalizar-fecha-solicitud"
                  type="date"
                  value={fechaSolicitud}
                  onChange={(evento) => setFechaSolicitud(evento.target.value)}
                  aria-required="true"
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor="rfq-finalizar-responsable" className={CLASE_OBLIGATORIO}>
                  Responsable
                </Label>
                <Select
                  id="rfq-finalizar-responsable"
                  value={proxima.responsableId}
                  onChange={(evento) =>
                    setProxima({ ...proxima, responsableId: evento.target.value })
                  }
                  aria-required="true"
                >
                  <option value="">Sin responsable</option>
                  {catalogos.usuarios.map((usuario) => (
                    <option key={usuario.id} value={usuario.id}>
                      {usuario.nombre}
                    </option>
                  ))}
                </Select>
                <span className="text-xs text-texto-secundario">
                  Se usa para el seguimiento y como responsable de la próxima acción.
                </span>
              </div>

              <div className="flex flex-col gap-1 sm:col-span-2">
                <Label htmlFor="rfq-finalizar-descripcion" className={CLASE_OBLIGATORIO}>
                  Descripción general
                </Label>
                <Textarea
                  id="rfq-finalizar-descripcion"
                  value={descripcionGeneral}
                  onChange={(evento) => setDescripcionGeneral(evento.target.value)}
                  rows={2}
                  maxLength={2000}
                  aria-required="true"
                  placeholder="Qué pide el cliente y alcance esperado"
                />
              </div>
            </div>

            <CamposProximaAccion
              idBase="rfq-finalizar-proxima"
              valor={proxima}
              onCambio={setProxima}
              catalogos={catalogos}
              hoy={hoy}
              sinResponsable
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
            {guardando ? 'Guardando…' : 'Guardar y finalizar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
