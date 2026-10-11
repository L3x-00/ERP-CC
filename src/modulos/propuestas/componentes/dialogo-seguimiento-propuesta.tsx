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
import { Input, Select } from '@/compartido/componentes/ui/input';
import { hoyIso } from '@/modulos/planeacion/utilidades/fechas-planeacion';
import { registrarSeguimientoPropuestaAccion } from '@/modulos/propuestas/acciones/registrar-seguimiento-propuesta';
import {
  validarRevisionConSeguimientoAccion,
  type ResultadoValidarConSeguimiento,
} from '@/modulos/propuestas/acciones/validar-revision-con-seguimiento';
import type { CatalogosPropuesta } from '@/modulos/propuestas/acciones/obtener-catalogos-propuesta';
import type { RevisionPropuesta } from '@/modulos/propuestas/tipos/indice';

export type ResultadoSeguimientoPropuestaUi = {
  seguimientoRegistrado: boolean;
};

/**
 * Obs. cliente 2026-10-11: la próxima acción de la Propuesta se captura en un
 * modal. En modo `validar` el servidor registra el seguimiento y valida la
 * revisión en el mismo flujo (la acción es obligatoria para poder enviar); en
 * modo `registrar` solo agrega un seguimiento al historial.
 *
 * El componente se monta únicamente cuando el modal está abierto, así que los
 * campos arrancan limpios en cada apertura.
 */
export function DialogoSeguimientoPropuesta({
  modo,
  revision,
  catalogos,
  puedeRegistrar,
  onCerrar,
  onExito,
}: {
  modo: 'validar' | 'registrar';
  revision: RevisionPropuesta;
  catalogos: CatalogosPropuesta | null;
  puedeRegistrar: boolean;
  onCerrar: () => void;
  onExito?: (resultado: ResultadoSeguimientoPropuestaUi) => void;
}) {
  const [codigo, setCodigo] = useState('FOLLOW_UP');
  const [textoOtro, setTextoOtro] = useState('');
  const [fecha, setFecha] = useState(hoyIso());
  const [canal, setCanal] = useState('');
  const [nota, setNota] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [procesando, setProcesando] = useState(false);

  const accionSeleccionada = (catalogos?.proximasAcciones ?? []).find(
    (accion) => accion.codigo === codigo,
  );
  const esOtro = accionSeleccionada?.esOtro ?? false;
  const catalogoListo = catalogos !== null && (catalogos.proximasAcciones ?? []).length > 0;
  const detalleValido = !esOtro || textoOtro.trim().length >= 3;
  const formularioValido =
    puedeRegistrar && catalogoListo && codigo !== '' && fecha !== '' && detalleValido;

  async function enviar(): Promise<void> {
    if (!formularioValido || procesando) return;
    setProcesando(true);
    setMensaje(null);
    try {
      const comun = {
        revisionId: revision.id,
        actualizadoEn: revision.actualizadoEn,
        codigo,
        ...(esOtro ? { textoOtro: textoOtro.trim() } : {}),
        fecha,
        ...(canal.trim() ? { canal: canal.trim() } : {}),
        ...(nota.trim() ? { nota: nota.trim() } : {}),
      };
      if (modo === 'validar') {
        const respuesta = await validarRevisionConSeguimientoAccion(comun);
        if (!respuesta.exito) {
          setMensaje(respuesta.error);
          return;
        }
        const datos = respuesta.datos as ResultadoValidarConSeguimiento | undefined;
        onExito?.({ seguimientoRegistrado: datos?.seguimientoRegistrado ?? true });
      } else {
        const respuesta = await registrarSeguimientoPropuestaAccion(comun);
        if (!respuesta.exito) {
          setMensaje(respuesta.error);
          return;
        }
        onExito?.({ seguimientoRegistrado: true });
      }
      onCerrar();
    } catch {
      setMensaje('No se pudo completar la acción. Revisa la conexión e inténtalo de nuevo.');
    } finally {
      setProcesando(false);
    }
  }

  return (
    <Dialog
      open
      onOpenChange={(valor) => {
        if (!valor && !procesando) onCerrar();
      }}
    >
      <DialogContent
        data-testid="dialogo-seguimiento-propuesta"
        aria-label={modo === 'validar' ? 'Validar propuesta' : 'Registrar seguimiento'}
      >
        <DialogHeader>
          <DialogTitle>
            {modo === 'validar' ? 'Validar propuesta' : 'Registrar seguimiento'}
          </DialogTitle>
          <DialogDescription>
            {modo === 'validar'
              ? 'La próxima acción es obligatoria: se registra ahora y la revisión queda lista para enviar. Sin ella no se puede enviar la propuesta.'
              : 'La próxima acción queda en el historial de la versión; no sobrescribe registros anteriores.'}
          </DialogDescription>
        </DialogHeader>

        {!catalogoListo ? (
          <p className="text-sm text-texto-secundario" role="status" aria-live="polite">
            Cargando catálogos…
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
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
        )}

        {!puedeRegistrar && (
          <p role="alert" className="text-sm text-peligro-texto">
            Necesitas permiso de seguimiento para registrar la próxima acción.
          </p>
        )}

        {mensaje !== null && (
          <p role="alert" className="text-sm text-peligro-texto">
            {mensaje}
          </p>
        )}

        <DialogFooter>
          <Button variante="fantasma" onClick={onCerrar} disabled={procesando}>
            Cancelar
          </Button>
          <Button onClick={() => void enviar()} disabled={!formularioValido || procesando}>
            {procesando
              ? 'Guardando…'
              : modo === 'validar'
                ? 'Registrar y validar'
                : 'Registrar seguimiento'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
