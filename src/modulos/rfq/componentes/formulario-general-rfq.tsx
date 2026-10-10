'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select, Textarea } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import type { Rfq } from '@/modulos/rfq/tipos/indice';
import { esDefinicionRfqEditable, motivoDefinicionRfqBloqueada } from '@/modulos/rfq/utilidades/estados';
import {
  CLASE_CAMPO_FALTANTE,
  CLASE_OBLIGATORIO,
  analizarFaltantesCliente,
  analizarFaltantesGenerales,
  analizarFaltantesSeguimiento,
} from '@/modulos/rfq/utilidades/faltantes';
import {
  VALOR_CONTACTO_PRINCIPAL,
  opcionesContactoRfq,
} from '@/modulos/rfq/utilidades/contacto-rfq';

import { actualizarDatosRfqAccion } from '../acciones/actualizar-datos-rfq';
import {
  asegurarContactoRfqAccion,
  obtenerContactoPrincipalRfqAccion,
} from '../acciones/contactos-rfq';
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
  faltantes,
}: {
  rfq: Rfq;
  catalogos: CatalogosRfq;
  onGuardado: () => void;
  faltantes?: {
    cliente?: readonly string[];
    general?: readonly string[];
    seguimiento?: readonly string[];
  };
}) {
  const [canal, setCanal] = useState(() => resolverCanalInicial(rfq, catalogos));
  const [canalDetalle, setCanalDetalle] = useState(rfq.canalDetalle ?? '');
  const [fechaSolicitud, setFechaSolicitud] = useState(rfq.fechaSolicitud ?? '');
  const [descripcionGeneral, setDescripcionGeneral] = useState(rfq.descripcionGeneral ?? '');
  const [contactoId, setContactoId] = useState(rfq.contactoId ?? '');
  const [contactoLibre, setContactoLibre] = useState('');
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
  const principalConsulta = useQuery({
    queryKey: ['rfq-contacto-principal', rfq.clienteId],
    queryFn: () => obtenerContactoPrincipalRfqAccion({ clienteId: rfq.clienteId }),
    enabled: Boolean(rfq.clienteId),
  });
  const clienteConsultas = useQueryClient();

  const contactosLista = contactos.data?.exito ? (contactos.data.datos ?? []) : [];
  const principal = principalConsulta.data?.exito ? (principalConsulta.data.datos ?? null) : null;
  const opcionesContacto = opcionesContactoRfq(contactosLista, principal);
  const consultasContactoListas = !contactos.isLoading && !principalConsulta.isLoading;
  const contactoSinDatos =
    Boolean(rfq.clienteId) && consultasContactoListas && opcionesContacto.length === 0;
  const ayudaContacto = !rfq.clienteId
    ? 'Liga un cliente para elegir su contacto.'
    : contactoSinDatos
      ? 'El cliente no tiene datos de contacto; se creará al guardar.'
      : 'Sugerido con los datos del cliente; puedes elegirlo o cambiarlo.';

  const editable = esDefinicionRfqEditable(rfq.estadoRfq);
  const fCliente = analizarFaltantesCliente(faltantes?.cliente ?? []);
  const fGeneral = analizarFaltantesGenerales(faltantes?.general ?? []);
  const fSeguimiento = analizarFaltantesSeguimiento(faltantes?.seguimiento ?? []);
  const faltaSeguimiento =
    fSeguimiento.proximaAccion ||
    fSeguimiento.detalleProximaAccion ||
    fSeguimiento.fechaProximaAccion ||
    fSeguimiento.responsableProximaAccion;
  const accionSeleccionada = catalogos.proximasAcciones.find(
    (accion) => accion.codigo === proximaAccionCodigo,
  );
  const canalSeleccionado = catalogos.canales.find((opcion) => opcion.codigo === canal);
  const canalesVisibles = catalogos.canales.filter(
    (opcion) => opcion.activo || opcion.codigo === canal,
  );
  const canalHistoricoSinCatalogar =
    canal !== '' && !catalogos.canales.some((opcion) => opcion.codigo === canal);

  /**
   * Resuelve el `contacto_id` a guardar: los contactos existentes se usan tal
   * cual; el contacto propio del cliente o el nombre escrito se materializan en
   * `contactos_cliente` (el gate LISTO exige un contacto vigente del cliente).
   */
  async function resolverContactoId(): Promise<string | null> {
    if (!rfq.clienteId) return null;

    if (contactoSinDatos) {
      const nombre = contactoLibre.trim();
      if (!nombre) return rfq.contactoId ?? null;
      const respuesta = await asegurarContactoRfqAccion({ clienteId: rfq.clienteId, nombre });
      if (!respuesta.exito) throw new Error(respuesta.error);
      return respuesta.datos?.id ?? null;
    }

    if (contactoId === VALOR_CONTACTO_PRINCIPAL && principal) {
      const respuesta = await asegurarContactoRfqAccion({
        clienteId: rfq.clienteId,
        nombre: principal.nombre?.trim() || 'Contacto del cliente',
        ...(principal.correo ? { correo: principal.correo } : {}),
        ...(principal.telefono ? { telefono: principal.telefono } : {}),
      });
      if (!respuesta.exito) throw new Error(respuesta.error);
      return respuesta.datos?.id ?? null;
    }

    return contactoId || null;
  }

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

    try {
      const contactoIdFinal = await resolverContactoId();
      const respuesta = await actualizarDatosRfqAccion({
        rfqId: rfq.id,
        actualizadoEn: rfq.actualizadoEn,
        canal: canal.trim() || null,
        canalDetalle: canalSeleccionado?.esOtro ? canalDetalle.trim() || null : null,
        fechaSolicitud: fechaSolicitud || null,
        descripcionGeneral: descripcionGeneral.trim() || null,
        contactoId: contactoIdFinal,
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
      void clienteConsultas.invalidateQueries({ queryKey: ['rfq-contactos', rfq.clienteId] });
      void clienteConsultas.invalidateQueries({
        queryKey: ['rfq-contacto-principal', rfq.clienteId],
      });
      setGuardado(true);
      onGuardado();
    } catch (error) {
      setEnviando(false);
      setMensaje(error instanceof Error ? error.message : 'No se pudo guardar el contacto');
    }
  }

  return (
    <form onSubmit={manejarEnvio} className="flex flex-col gap-4" noValidate data-testid="resumen-rfq">
      {!editable && (
        <p className="rounded-md bg-superficie-2 px-3 py-2 text-sm text-texto-secundario">
          {motivoDefinicionRfqBloqueada(rfq.estadoRfq)}
        </p>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="rfq-canal" className={CLASE_OBLIGATORIO}>Canal</Label>
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
            aria-required="true"
            aria-invalid={fGeneral.canal}
            className={fGeneral.canal ? CLASE_CAMPO_FALTANTE : undefined}
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
          <Label htmlFor="rfq-fecha-solicitud" className={CLASE_OBLIGATORIO}>Fecha de solicitud</Label>
          <Input
            id="rfq-fecha-solicitud"
            type="date"
            value={fechaSolicitud}
            onChange={(evento) => setFechaSolicitud(evento.target.value)}
            disabled={!editable}
            aria-required="true"
            aria-invalid={fGeneral.fechaSolicitud}
            className={fGeneral.fechaSolicitud ? CLASE_CAMPO_FALTANTE : undefined}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="rfq-responsable" className={CLASE_OBLIGATORIO}>Responsable</Label>
          <Select
            id="rfq-responsable"
            value={responsableId}
            onChange={(evento) => setResponsableId(evento.target.value)}
            disabled={!editable}
            aria-required="true"
            aria-invalid={fGeneral.responsable}
            className={fGeneral.responsable ? CLASE_CAMPO_FALTANTE : undefined}
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
          <Label htmlFor="rfq-descripcion" className={CLASE_OBLIGATORIO}>Descripción general</Label>
          <Textarea
            id="rfq-descripcion"
            value={descripcionGeneral}
            onChange={(evento) => setDescripcionGeneral(evento.target.value)}
            rows={2}
            maxLength={2000}
            disabled={!editable}
            aria-required="true"
            aria-invalid={fGeneral.descripcionGeneral}
            className={fGeneral.descripcionGeneral ? CLASE_CAMPO_FALTANTE : undefined}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="rfq-contacto" className={CLASE_OBLIGATORIO}>Contacto del cliente</Label>
          {!rfq.clienteId ? (
            <Select
              id="rfq-contacto"
              value=""
              disabled
              aria-invalid={fCliente.contacto}
              className={fCliente.contacto ? CLASE_CAMPO_FALTANTE : undefined}
              aria-describedby="rfq-contacto-ayuda"
            >
              <option value="">El RFQ no tiene cliente ligado</option>
            </Select>
          ) : contactoSinDatos ? (
            <Input
              id="rfq-contacto"
              value={contactoLibre}
              onChange={(evento) => setContactoLibre(evento.target.value)}
              maxLength={120}
              placeholder="Nombre del contacto"
              disabled={!editable}
              aria-required="true"
              aria-invalid={fCliente.contacto}
              aria-describedby="rfq-contacto-ayuda"
              className={fCliente.contacto ? CLASE_CAMPO_FALTANTE : undefined}
            />
          ) : (
            <Select
              id="rfq-contacto"
              value={contactoId}
              onChange={(evento) => setContactoId(evento.target.value)}
              disabled={!editable || !consultasContactoListas}
              aria-required="true"
              aria-invalid={fCliente.contacto}
              aria-describedby="rfq-contacto-ayuda"
              className={fCliente.contacto ? CLASE_CAMPO_FALTANTE : undefined}
            >
              <option value="">Sin contacto</option>
              {opcionesContacto.map((opcion) => (
                <option key={opcion.valor} value={opcion.valor}>
                  {opcion.etiqueta}
                </option>
              ))}
            </Select>
          )}
          <span id="rfq-contacto-ayuda" className="text-xs text-texto-secundario">
            {ayudaContacto}
          </span>
        </div>
      </div>

      <fieldset
        data-faltante={faltaSeguimiento ? 'si' : 'no'}
        className="grid gap-4 rounded-lg border border-borde p-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <legend className={`px-1 text-sm font-semibold ${CLASE_OBLIGATORIO}`}>
          Próxima acción
        </legend>
        <div className="flex flex-col gap-1">
          <Label htmlFor="rfq-proxima-accion" className={CLASE_OBLIGATORIO}>Acción</Label>
          <Select
            id="rfq-proxima-accion"
            value={proximaAccionCodigo}
            onChange={(evento) => setProximaAccionCodigo(evento.target.value)}
            disabled={!editable}
            aria-required="true"
            aria-invalid={fSeguimiento.proximaAccion}
            className={fSeguimiento.proximaAccion ? CLASE_CAMPO_FALTANTE : undefined}
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
            <Label htmlFor="rfq-proxima-texto" className={CLASE_OBLIGATORIO}>Detalle (Otro)</Label>
            <Input
              id="rfq-proxima-texto"
              value={proximaAccionTexto}
              onChange={(evento) => setProximaAccionTexto(evento.target.value)}
              maxLength={300}
              disabled={!editable}
              aria-required="true"
              aria-invalid={fSeguimiento.detalleProximaAccion}
              className={fSeguimiento.detalleProximaAccion ? CLASE_CAMPO_FALTANTE : undefined}
            />
          </div>
        )}
        <div className="flex flex-col gap-1">
          <Label htmlFor="rfq-proxima-fecha" className={CLASE_OBLIGATORIO}>Fecha</Label>
          <Input
            id="rfq-proxima-fecha"
            type="date"
            value={fechaProximaAccion}
            onChange={(evento) => setFechaProximaAccion(evento.target.value)}
            disabled={!editable}
            aria-required="true"
            aria-invalid={fSeguimiento.fechaProximaAccion}
            className={fSeguimiento.fechaProximaAccion ? CLASE_CAMPO_FALTANTE : undefined}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="rfq-proxima-responsable" className={CLASE_OBLIGATORIO}>
            Responsable de la acción
          </Label>
          <Select
            id="rfq-proxima-responsable"
            value={responsableProximaAccionId}
            onChange={(evento) => setResponsableProximaAccionId(evento.target.value)}
            disabled={!editable}
            aria-required="true"
            aria-invalid={fSeguimiento.responsableProximaAccion}
            className={fSeguimiento.responsableProximaAccion ? CLASE_CAMPO_FALTANTE : undefined}
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
