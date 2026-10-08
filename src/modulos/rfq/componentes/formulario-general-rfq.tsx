'use client';

import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';

import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select, Textarea } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import type { Rfq } from '@/modulos/rfq/tipos/indice';
import { esEstadoTerminal } from '@/modulos/rfq/utilidades/estados';

import { actualizarDatosRfqAccion } from '../acciones/actualizar-datos-rfq';
import {
  obtenerContactosClienteRfqAccion,
  type CatalogosRfq,
} from '../acciones/obtener-catalogos';

function resolverCanalInicial(rfq: Rfq, catalogos: CatalogosRfq): string {
  if (!rfq.canal) return '';
  const opcion = catalogos.canales.find(
    (canal) =>
      canal.codigo.localeCompare(rfq.canal!, 'es', { sensitivity: 'base' }) === 0 ||
      canal.nombre.localeCompare(rfq.canal!, 'es', { sensitivity: 'base' }) === 0,
  );
  return opcion?.codigo ?? rfq.canal;
}

/**
 * Formulario de datos generales y seguimiento del RFQ (pestaña Resumen).
 * Solo se habilita en estados donde el RFQ sigue capturándose; en READY debe
 * volver a Incompleto para editar (el servidor lo revalida).
 */
export function FormularioGeneralRfq({
  rfq,
  catalogos,
  onGuardado,
}: {
  rfq: Rfq;
  catalogos: CatalogosRfq;
  onGuardado: () => void;
}) {
  const [canal, setCanal] = useState(() => resolverCanalInicial(rfq, catalogos));
  const [canalDetalle, setCanalDetalle] = useState(rfq.canalDetalle ?? '');
  const [fechaSolicitud, setFechaSolicitud] = useState(rfq.fechaSolicitud ?? '');
  const [descripcionGeneral, setDescripcionGeneral] = useState(rfq.descripcionGeneral ?? '');
  const [contactoId, setContactoId] = useState(rfq.contactoId ?? '');
  const [responsableId, setResponsableId] = useState(rfq.responsableId ?? '');
  const [proximaAccionCodigo, setProximaAccionCodigo] = useState(rfq.proximaAccionCodigo ?? '');
  const [proximaAccionTexto, setProximaAccionTexto] = useState(rfq.proximaAccionTexto ?? '');
  const [fechaProximaAccion, setFechaProximaAccion] = useState(rfq.fechaProximaAccion ?? '');
  const [responsableProximaAccionId, setResponsableProximaAccionId] = useState(
    rfq.responsableProximaAccionId ?? '',
  );
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const contactos = useQuery({
    queryKey: ['rfq-contactos', rfq.clienteId],
    queryFn: () => obtenerContactosClienteRfqAccion({ clienteId: rfq.clienteId }),
    enabled: Boolean(rfq.clienteId),
  });

  const editable =
    !esEstadoTerminal(rfq.estadoRfq) && rfq.estadoRfq !== 'READY_FOR_PROPOSAL';
  const accionSeleccionada = catalogos.proximasAcciones.find(
    (accion) => accion.codigo === proximaAccionCodigo,
  );
  const canalSeleccionado = catalogos.canales.find((opcion) => opcion.codigo === canal);
  const canalesVisibles = catalogos.canales.filter(
    (opcion) => opcion.activo || opcion.codigo === canal,
  );
  const canalHistoricoSinCatalogar =
    canal !== '' && !catalogos.canales.some((opcion) => opcion.codigo === canal);

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (canalSeleccionado?.esOtro && !canalDetalle.trim()) {
      setGuardado(false);
      setMensaje('Escribe el detalle del canal Otro');
      return;
    }
    setEnviando(true);
    setMensaje(null);
    setGuardado(false);

    const respuesta = await actualizarDatosRfqAccion({
      rfqId: rfq.id,
      actualizadoEn: rfq.actualizadoEn,
      canal: canal.trim() || null,
      canalDetalle: canalSeleccionado?.esOtro ? canalDetalle.trim() || null : null,
      fechaSolicitud: fechaSolicitud || null,
      descripcionGeneral: descripcionGeneral.trim() || null,
      contactoId: contactoId || null,
      responsableId: responsableId || null,
      proximaAccionCodigo: proximaAccionCodigo || null,
      proximaAccionTexto: proximaAccionTexto.trim() || null,
      fechaProximaAccion: fechaProximaAccion || null,
      responsableProximaAccionId: responsableProximaAccionId || null,
    });
    setEnviando(false);

    if (!respuesta.exito) {
      setMensaje(respuesta.error);
      return;
    }
    setGuardado(true);
    onGuardado();
  }

  return (
    <form onSubmit={manejarEnvio} className="flex flex-col gap-4" noValidate data-testid="resumen-rfq">
      {!editable && (
        <p className="rounded-md bg-superficie-2 px-3 py-2 text-sm text-texto-secundario">
          El RFQ está en {rfq.estadoRfq === 'READY_FOR_PROPOSAL' ? 'Listo para propuesta' : 'estado terminal'}.
          Marca Incompleto para editar los datos generales.
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="rfq-canal">Canal</Label>
          <Select
            id="rfq-canal"
            value={canal}
            onChange={(evento) => {
              const codigo = evento.target.value;
              setCanal(codigo);
              const siguiente = catalogos.canales.find((opcion) => opcion.codigo === codigo);
              if (!siguiente?.esOtro) setCanalDetalle('');
            }}
            disabled={!editable}
          >
            <option value="">Sin canal</option>
            {canalHistoricoSinCatalogar && (
              <option value={canal}>{canal} (histórico)</option>
            )}
            {canalesVisibles.map((opcion) => (
              <option key={opcion.codigo} value={opcion.codigo}>
                {opcion.nombre}{opcion.activo ? '' : ' (inactivo)'}
              </option>
            ))}
          </Select>
          <p className="text-xs text-texto-secundario">
            Selecciona cómo llegó la solicitud del cliente.
          </p>
        </div>
        {canalSeleccionado?.esOtro && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="rfq-canal-detalle">Detalle del canal Otro</Label>
            <Input
              id="rfq-canal-detalle"
              value={canalDetalle}
              onChange={(evento) => setCanalDetalle(evento.target.value)}
              maxLength={300}
              disabled={!editable}
              aria-required="true"
              placeholder="Ej. feria industrial o alianza comercial"
            />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <Label htmlFor="rfq-fecha-solicitud">Fecha de solicitud</Label>
          <Input
            id="rfq-fecha-solicitud"
            type="date"
            value={fechaSolicitud}
            onChange={(evento) => setFechaSolicitud(evento.target.value)}
            disabled={!editable}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="rfq-responsable">Responsable</Label>
          <Select
            id="rfq-responsable"
            value={responsableId}
            onChange={(evento) => setResponsableId(evento.target.value)}
            disabled={!editable}
          >
            <option value="">Sin responsable</option>
            {catalogos.usuarios.map((usuario) => (
              <option key={usuario.id} value={usuario.id}>
                {usuario.nombre}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3">
          <Label htmlFor="rfq-descripcion">Descripción general</Label>
          <Textarea
            id="rfq-descripcion"
            value={descripcionGeneral}
            onChange={(evento) => setDescripcionGeneral(evento.target.value)}
            rows={2}
            maxLength={2000}
            disabled={!editable}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="rfq-contacto">Contacto del cliente</Label>
          <Select
            id="rfq-contacto"
            value={contactoId}
            onChange={(evento) => setContactoId(evento.target.value)}
            disabled={!editable || !rfq.clienteId}
          >
            <option value="">
              {rfq.clienteId ? 'Sin contacto' : 'El RFQ no tiene cliente ligado'}
            </option>
            {(contactos.data?.exito ? (contactos.data.datos ?? []) : []).map((contacto) => (
              <option key={contacto.id} value={contacto.id}>
                {contacto.nombre}
                {contacto.correo ? ` · ${contacto.correo}` : ''}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <fieldset className="grid gap-4 rounded-lg border border-borde p-3 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="px-1 text-sm font-semibold">Próxima acción</legend>
        <div className="flex flex-col gap-1">
          <Label htmlFor="rfq-proxima-accion">Acción</Label>
          <Select
            id="rfq-proxima-accion"
            value={proximaAccionCodigo}
            onChange={(evento) => setProximaAccionCodigo(evento.target.value)}
            disabled={!editable}
          >
            <option value="">Sin próxima acción</option>
            {catalogos.proximasAcciones.map((accion) => (
              <option key={accion.codigo} value={accion.codigo}>
                {accion.nombre}
              </option>
            ))}
          </Select>
        </div>
        {accionSeleccionada?.esOtro && (
          <div className="flex flex-col gap-1">
            <Label htmlFor="rfq-proxima-texto">Detalle (Otro)</Label>
            <Input
              id="rfq-proxima-texto"
              value={proximaAccionTexto}
              onChange={(evento) => setProximaAccionTexto(evento.target.value)}
              maxLength={300}
              disabled={!editable}
            />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <Label htmlFor="rfq-proxima-fecha">Fecha</Label>
          <Input
            id="rfq-proxima-fecha"
            type="date"
            value={fechaProximaAccion}
            onChange={(evento) => setFechaProximaAccion(evento.target.value)}
            disabled={!editable}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="rfq-proxima-responsable">Responsable de la acción</Label>
          <Select
            id="rfq-proxima-responsable"
            value={responsableProximaAccionId}
            onChange={(evento) => setResponsableProximaAccionId(evento.target.value)}
            disabled={!editable}
          >
            <option value="">Sin responsable</option>
            {catalogos.usuarios.map((usuario) => (
              <option key={usuario.id} value={usuario.id}>
                {usuario.nombre}
              </option>
            ))}
          </Select>
        </div>
      </fieldset>

      {mensaje !== null && (
        <p role="alert" className="text-sm text-peligro-texto">
          {mensaje}
        </p>
      )}
      {guardado && <p className="text-sm font-medium text-exito-texto">Datos guardados.</p>}

      <div className="flex justify-end">
        <Button type="submit" tamano="lg" disabled={!editable || enviando}>
          {enviando ? 'Guardando…' : 'Guardar datos'}
        </Button>
      </div>
    </form>
  );
}
