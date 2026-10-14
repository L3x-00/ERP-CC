'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { crearProspectoAccion } from '@/modulos/pipeline/acciones/crear-prospecto';
import { SelectorCliente } from '@/modulos/pipeline/componentes/selector-cliente';
import { ResumenClienteRfq } from '@/modulos/pipeline/componentes/resumen-cliente-rfq';
import type {
  ClienteRfq,
  CondicionesPago,
  MonedaPipeline,
  PrioridadPipeline,
} from '@/modulos/pipeline/tipos/indice';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select, Textarea } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import {
  obtenerCatalogosRfqAccion,
  obtenerContactosClienteRfqAccion,
} from '@/modulos/rfq/acciones/obtener-catalogos';
import { listarArchivosRfqAccion } from '@/modulos/rfq/acciones/archivos-rfq';
import { obtenerRfqAccion } from '@/modulos/rfq/acciones/obtener-rfq';
import { DialogoFinalizarCapturaRfq } from '@/modulos/rfq/componentes/dialogo-finalizar-captura-rfq';
import { PanelArchivosRfq } from '@/modulos/rfq/componentes/panel-archivos-rfq';
import { TablaItemsRfq } from '@/modulos/rfq/componentes/tabla-items-rfq';
import {
  CLASE_CAMPO_FALTANTE,
  CLASE_MENSAJE_FALTANTE,
  CLASE_OBLIGATORIO,
} from '@/modulos/rfq/utilidades/faltantes';

/** Mismo faltante que reporta `validar_rfq_listo`; reutiliza el estado vacío rojo de la tabla. */
const FALTANTE_ITEM_ACTIVO = ['al menos un ítem activo'] as const;

/**
 * Pasos del alta guiada (DC-03): todo se captura dentro del mismo modal, sin
 * abandonar la pantalla de la cola. El RFQ se crea al continuar a Ítems y
 * queda `INCOMPLETE`; si la captura se interrumpe, se reanuda sobre el MISMO
 * RFQ desde la cola («Continuar captura»).
 */
const PASOS_ALTA = [
  { clave: 'solicitud', titulo: 'Cliente y solicitud' },
  { clave: 'items', titulo: 'Ítems' },
  { clave: 'archivos', titulo: 'Archivos' },
] as const;

type PasoAltaRfq = (typeof PASOS_ALTA)[number]['clave'];

/** Indicador de los tres pasos del alta; marca el actual y los completados. */
function PasosAltaRfq({ paso }: { paso: PasoAltaRfq }) {
  const indiceActual = PASOS_ALTA.findIndex((opcion) => opcion.clave === paso);
  return (
    <div data-testid="etapas-alta-rfq" className="flex flex-col gap-2">
      <ol aria-label="Etapas del alta de RFQ" className="flex flex-wrap items-center gap-2">
        {PASOS_ALTA.map((opcion, indice) => {
          const actual = opcion.clave === paso;
          const completado = indice < indiceActual;
          return (
            <li
              key={opcion.clave}
              aria-current={actual ? 'step' : undefined}
              className={
                actual
                  ? 'flex items-center gap-1.5 rounded-full border border-acento bg-acento-suave px-3 py-1 text-xs font-semibold text-acento'
                  : 'flex items-center gap-1.5 rounded-full border border-dashed border-borde bg-superficie px-3 py-1 text-xs font-medium text-texto-secundario'
              }
            >
              <span aria-hidden="true" className="font-mono">
                {completado ? '✓' : indice + 1}
              </span>
              {opcion.titulo}
              <span className="sr-only">
                {actual ? ' — en curso' : completado ? ' — completado' : ' — pendiente'}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-texto-secundario">
        Captura todo sin salir de esta ventana. Al continuar, el RFQ se guarda como{' '}
        <strong className="font-semibold">Incompleto</strong> y sigue editable desde su ficha.
      </p>
    </div>
  );
}

/**
 * Alta de RFQ en un solo asistente: Cliente y solicitud → Ítems → Archivos.
 * Reutiliza las mismas Server Actions de la ficha (crear prospecto, guardar
 * ítem, subir archivo); nunca navega ni crea la Propuesta: eso solo ocurre con
 * la acción explícita «Crear propuesta» en la ficha de un RFQ listo.
 *
 * Obs. cliente 2026-10-13: canal, seguimiento y próxima acción (con un único
 * responsable) se capturan en el modal obligatorio de «Finalizar captura»;
 * «Finalizar más tarde» sigue cerrando la captura sin modal.
 *
 * DC-01: no captura Orden de compra ni Horas estimadas; `Fecha requerida por
 * cliente` es informativa y no la Fecha compromiso.
 * RFQ-02/03: el cliente del catálogo (o el alta rápida) se elige sin salir.
 */
export function FormularioProspecto({
  onExito,
  onCambioEnvio,
}: {
  onExito?: (id?: string) => void;
  onCambioEnvio?: (enviando: boolean) => void;
}) {
  const clienteConsultas = useQueryClient();
  const [paso, setPaso] = useState<PasoAltaRfq>('solicitud');
  const [rfqId, setRfqId] = useState<string | null>(null);
  const [cliente, setCliente] = useState<ClienteRfq | null>(null);
  const [condicionesHeredadas, setCondicionesHeredadas] = useState(false);
  const [nombreContacto, setNombreContacto] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [correo, setCorreo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [moneda, setMoneda] = useState<MonedaPipeline>('MXN');
  const [prioridad, setPrioridad] = useState<PrioridadPipeline>('normal');
  const [condicionesPago, setCondicionesPago] = useState<CondicionesPago | ''>('');
  const [esOrdenInterna, setEsOrdenInterna] = useState(false);
  const [fechaRequerida, setFechaRequerida] = useState('');
  const [notas, setNotas] = useState('');
  // Obs. cliente 2026-10-13: canal, seguimiento y próxima acción se capturan en
  // el modal obligatorio de «Finalizar captura», no en este paso.
  const [finalizarAbierto, setFinalizarAbierto] = useState(false);
  const [contactoId, setContactoId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [subiendoArchivo, setSubiendoArchivo] = useState(false);

  const rfqConsulta = useQuery({
    queryKey: ['rfq', rfqId ?? ''],
    queryFn: () => obtenerRfqAccion({ rfqId: rfqId ?? '' }),
    enabled: rfqId !== null,
  });
  const catalogosConsulta = useQuery({
    queryKey: ['rfq-catalogos'],
    queryFn: () => obtenerCatalogosRfqAccion(),
    staleTime: 60_000,
  });
  const contactosConsulta = useQuery({
    queryKey: ['rfq-contactos-alta', cliente?.id ?? ''],
    queryFn: () => obtenerContactosClienteRfqAccion({ clienteId: cliente!.id }),
    enabled: cliente !== null,
  });

  // Misma clave que `PanelArchivosRfq`: comparten caché y la subida invalida ambos.
  const archivosConsulta = useQuery({
    queryKey: ['rfq-archivos', rfqId ?? ''],
    queryFn: () => listarArchivosRfqAccion({ rfqId: rfqId ?? '' }),
    enabled: rfqId !== null && paso === 'archivos',
  });

  const rfq = rfqConsulta.data?.exito ? rfqConsulta.data.datos : undefined;
  const catalogos = catalogosConsulta.data?.exito ? (catalogosConsulta.data.datos ?? null) : null;
  const contactos = contactosConsulta.data?.exito ? (contactosConsulta.data.datos ?? []) : [];
  // Autocompletado (observación del cliente): con un cliente ligado se
  // preselecciona su contacto principal; el usuario puede cambiarlo.
  const contactoEfectivoId =
    contactoId || (cliente && contactos.length > 0 ? contactos[0].id : '');

  // Lo capturado a mano manda; el contacto elegido (o el principal del cliente)
  // completa lo vacío. La validación del paso usa estos mismos valores finales.
  const contactoEfectivo = contactos.find((candidato) => candidato.id === contactoEfectivoId);
  const nombreContactoFinal = nombreContacto.trim()
    ? nombreContacto
    : (contactoEfectivo?.nombre ?? '');
  const correoFinal = correo.trim() ? correo : (contactoEfectivo?.correo ?? '');
  const telefonoFinal = telefono.trim() ? telefono : (contactoEfectivo?.telefono ?? '');

  // Obs. cliente 2026-10-13: nombre del contacto y teléfono son obligatorios para
  // crear el RFQ; ítem y archivo, para avanzar de paso. El servidor lo revalida.
  const faltaNombreContacto = nombreContactoFinal.trim().length < 2;
  const faltaTelefono = telefonoFinal.trim() === '';
  const faltantesCliente = [
    faltaNombreContacto ? 'nombre del contacto' : null,
    faltaTelefono ? 'teléfono' : null,
  ].filter((item): item is string => item !== null);
  // Con un cliente elegido el contacto principal se liga al crear el RFQ; si el alta
  // se enviara antes de que carguen sus contactos, el RFQ nacería sin contacto
  // vigente («Cliente: faltan datos»). Un error de carga no bloquea el alta.
  const cargandoContactos = cliente !== null && contactosConsulta.isPending;
  const sinItemsActivos = rfq !== undefined && !rfq.items.some((item) => item.estado === 'activo');
  const sinArchivos =
    !archivosConsulta.data?.exito || (archivosConsulta.data.datos ?? []).length === 0;

  function elegirContacto(valor: string): void {
    setContactoId(valor);
    const contacto = contactos.find((candidato) => candidato.id === valor);
    if (!contacto) return;
    setNombreContacto((actual) => (actual.trim() ? actual : contacto.nombre));
    setCorreo((actual) => (actual.trim() ? actual : contacto.correo ?? ''));
    setTelefono((actual) => (actual.trim() ? actual : contacto.telefono ?? ''));
  }
  const errorRfq =
    rfqConsulta.isError || (rfqConsulta.data && !rfqConsulta.data.exito)
      ? 'No se pudo cargar el RFQ capturado.'
      : null;

  /**
   * Aplica el cliente elegido a la captura: hereda sus condiciones de pago y
   * rellena los datos de contacto que aún estén vacíos. Al quitarlo no se borra
   * nada de lo capturado (la RFQ sigue siendo válida sin cliente del catálogo).
   */
  function aplicarCliente(elegido: ClienteRfq | null): void {
    setCliente(elegido);
    setContactoId('');
    if (!elegido) {
      setCondicionesHeredadas(false);
      return;
    }
    if (elegido.condicionesPago !== null) {
      setCondicionesPago(elegido.condicionesPago);
      setCondicionesHeredadas(true);
    }
    setEmpresa((actual) => (actual.trim() ? actual : elegido.razonSocial));
    setNombreContacto((actual) => (actual.trim() ? actual : elegido.contacto ?? ''));
    setCorreo((actual) => (actual.trim() ? actual : elegido.correo ?? ''));
    setTelefono((actual) => (actual.trim() ? actual : elegido.telefono ?? ''));
  }

  function limpiar(): void {
    setCliente(null);
    setCondicionesHeredadas(false);
    setNombreContacto('');
    setEmpresa('');
    setCorreo('');
    setTelefono('');
    setMoneda('MXN');
    setPrioridad('normal');
    setCondicionesPago('');
    setEsOrdenInterna(false);
    setFechaRequerida('');
    setNotas('');
    setContactoId('');
  }

  function reiniciarCaptura(): void {
    limpiar();
    setRfqId(null);
    setPaso('solicitud');
    setError(null);
    setFinalizarAbierto(false);
  }

  async function crearRfqYContinuar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    if (faltantesCliente.length > 0 || cargandoContactos) return;
    setError(null);
    setEnviando(true);
    onCambioEnvio?.(true);

    try {
      const respuesta = await crearProspectoAccion({
        nombreContacto: nombreContactoFinal,
        empresa,
        correo: correoFinal,
        telefono: telefonoFinal,
        moneda,
        prioridad,
        esOrdenInterna,
        ...(cliente ? { clienteId: cliente.id } : {}),
        ...(condicionesPago !== '' ? { condicionesPago } : {}),
        ...(fechaRequerida ? { fechaRequerida } : {}),
        ...(notas.trim() ? { notas: notas.trim() } : {}),
        ...(contactoEfectivoId ? { contactoId: contactoEfectivoId } : {}),
      });

      if (!respuesta.exito) {
        setError(respuesta.error);
      } else if (!respuesta.datos) {
        // Sin id no hay a dónde continuar: se conserva el borrador en el modal
        // en vez de limpiarlo y perderlo.
        setError('No se pudo continuar la captura. Intenta de nuevo.');
      } else {
        setRfqId(respuesta.datos.id);
        // La cola vive en una consulta de TanStack Query (`['pipeline']`):
        // navegar no la invalida por sí solo y con `refetchOnWindowFocus`
        // desactivado la fila nueva no aparecería al volver a la cola.
        await clienteConsultas.invalidateQueries({ queryKey: ['pipeline'] });
        setPaso('items');
      }
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setEnviando(false);
      onCambioEnvio?.(false);
    }
  }

  function refrescarRfq(): void {
    void rfqConsulta.refetch();
  }

  /**
   * Una subida directa a Storage no debe abandonarse al cerrar: mientras haya
   * una en vuelo, el modal queda bloqueado (mismo mecanismo del alta) y los
   * botones de paso se deshabilitan.
   */
  function manejarSubidaArchivo(subiendo: boolean): void {
    setSubiendoArchivo(subiendo);
    onCambioEnvio?.(subiendo);
  }

  function finalizar(): void {
    if (subiendoArchivo) return;
    const id = rfqId ?? undefined;
    void clienteConsultas.invalidateQueries({ queryKey: ['pipeline'] });
    if (id) {
      // El RFQ se leyó durante el alta y `staleTime` (5 min) lo daría por fresco:
      // sin invalidar, la ficha abriría con el Resumen previo al modal de
      // «Finalizar captura» (canal, fecha, descripción y próxima acción vacíos).
      void clienteConsultas.invalidateQueries({ queryKey: ['rfq', id] });
      void clienteConsultas.invalidateQueries({ queryKey: ['rfq-validacion-listo', id] });
    }
    reiniciarCaptura();
    onExito?.(id);
  }

  return (
    <div className="flex flex-col gap-4">
      <PasosAltaRfq paso={paso} />

      {paso === 'solicitud' && (
        <form onSubmit={crearRfqYContinuar} className="flex flex-col gap-4" noValidate>
          <h3 className="text-sm font-semibold text-texto-primario">1. Cliente</h3>

          <div className="flex flex-col gap-2">
            <SelectorCliente
              seleccionado={cliente}
              onSeleccionar={aplicarCliente}
              sugerencias={{ empresa, contacto: nombreContacto, correo, telefono }}
            />
            {cliente && (
              <ResumenClienteRfq
                clienteId={cliente.id}
                condicionesPago={condicionesPago === '' ? null : condicionesPago}
              />
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {cliente && contactos.length > 0 && (
              <div className="flex flex-col gap-1 sm:col-span-2">
                <Label htmlFor="prospecto-contacto-registrado">Contacto del cliente</Label>
                <Select
                  id="prospecto-contacto-registrado"
                  value={contactoEfectivoId}
                  onChange={(evento) => elegirContacto(evento.target.value)}
                >
                  <option value="">Sin contacto registrado</option>
                  {contactos.map((contacto) => (
                    <option key={contacto.id} value={contacto.id}>
                      {contacto.correo
                        ? `${contacto.nombre} · ${contacto.correo}`
                        : contacto.nombre}
                    </option>
                  ))}
                </Select>
                <span className="text-xs text-texto-secundario">
                  Se autocompleta con los contactos registrados del cliente.
                </span>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <Label htmlFor="prospecto-contacto" className={CLASE_OBLIGATORIO}>
                Nombre del contacto
              </Label>
              <Input
                id="prospecto-contacto"
                type="text"
                value={nombreContacto}
                onChange={(evento) => setNombreContacto(evento.target.value)}
                placeholder="Nombre y apellido"
                aria-required="true"
                aria-invalid={faltaNombreContacto}
                aria-describedby={faltaNombreContacto ? 'prospecto-contacto-error' : undefined}
                className={faltaNombreContacto ? CLASE_CAMPO_FALTANTE : undefined}
              />
              {faltaNombreContacto && (
                <span id="prospecto-contacto-error" className={CLASE_MENSAJE_FALTANTE}>
                  Completa el nombre del contacto.
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="prospecto-empresa">Empresa</Label>
              <Input
                id="prospecto-empresa"
                type="text"
                value={empresa}
                onChange={(evento) => setEmpresa(evento.target.value)}
                placeholder="Razón social o nombre comercial"
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="prospecto-correo">Correo (opcional)</Label>
              <Input
                id="prospecto-correo"
                type="email"
                value={correo}
                onChange={(evento) => setCorreo(evento.target.value)}
                placeholder="contacto@empresa.com"
              />
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="prospecto-telefono" className={CLASE_OBLIGATORIO}>
                Teléfono
              </Label>
              <Input
                id="prospecto-telefono"
                type="tel"
                value={telefono}
                onChange={(evento) => setTelefono(evento.target.value)}
                placeholder="664 000 0000"
                aria-required="true"
                aria-invalid={faltaTelefono}
                aria-describedby={faltaTelefono ? 'prospecto-telefono-error' : undefined}
                className={faltaTelefono ? CLASE_CAMPO_FALTANTE : undefined}
              />
              {faltaTelefono && (
                <span id="prospecto-telefono-error" className={CLASE_MENSAJE_FALTANTE}>
                  Completa el teléfono del contacto.
                </span>
              )}
            </div>
          </div>

          <h3 className="text-sm font-semibold text-texto-primario">2. Solicitud</h3>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="prospecto-moneda">Moneda</Label>
              <Select
                id="prospecto-moneda"
                value={moneda}
                onChange={(evento) => setMoneda(evento.target.value as MonedaPipeline)}
              >
                <option value="MXN">MXN — Peso mexicano</option>
                <option value="USD">USD — Dólar estadounidense</option>
              </Select>
            </div>

            <div className="flex flex-col gap-1">
              <Label htmlFor="prospecto-prioridad">Prioridad</Label>
              <Select
                id="prospecto-prioridad"
                value={prioridad}
                onChange={(evento) => setPrioridad(evento.target.value as PrioridadPipeline)}
              >
                <option value="baja">Baja</option>
                <option value="normal">Normal</option>
                <option value="alta">Alta</option>
                <option value="urgente">Urgente</option>
              </Select>
            </div>

            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label htmlFor="prospecto-condiciones">Condiciones de pago (opcional)</Label>
              <Select
                id="prospecto-condiciones"
                value={condicionesPago}
                onChange={(evento) => {
                  setCondicionesPago(evento.target.value as CondicionesPago | '');
                  setCondicionesHeredadas(false);
                }}
              >
                <option value="">Sin especificar</option>
                <option value="contado">Contado</option>
                <option value="15_dias">15 días</option>
                <option value="30_dias">30 días</option>
                <option value="credito">Crédito</option>
              </Select>
              {condicionesHeredadas && (
                <span className="text-xs text-texto-secundario">
                  Heredadas del cliente seleccionado. Puedes cambiarlas para esta RFQ.
                </span>
              )}
            </div>

            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label htmlFor="prospecto-fecha-requerida">
                Fecha requerida por cliente (opcional)
              </Label>
              <Input
                id="prospecto-fecha-requerida"
                type="date"
                value={fechaRequerida}
                onChange={(evento) => setFechaRequerida(evento.target.value)}
                aria-describedby="prospecto-ayuda-fecha-requerida"
              />
              <span
                id="prospecto-ayuda-fecha-requerida"
                data-testid="ayuda-fecha-requerida"
                className="text-xs text-texto-secundario"
              >
                Dato informativo de lo que pide el cliente. No es la Fecha compromiso: esa se
                confirma al aceptar una revisión de la propuesta.
              </span>
            </div>

            <div className="flex flex-col gap-1 sm:col-span-2">
              <Label htmlFor="prospecto-notas">Notas (opcional)</Label>
              <Textarea
                id="prospecto-notas"
                value={notas}
                onChange={(evento) => setNotas(evento.target.value)}
                rows={2}
                maxLength={2000}
              />
            </div>

            <label
              htmlFor="prospecto-orden-interna"
              className="flex items-start gap-2 sm:col-span-2"
            >
              <input
                id="prospecto-orden-interna"
                type="checkbox"
                className="mt-1"
                checked={esOrdenInterna}
                onChange={(evento) => setEsOrdenInterna(evento.target.checked)}
              />
              <span className="text-sm">
                <span className="font-medium text-texto-primario">Orden interna (TI)</span>
                <span className="block text-texto-secundario">
                  Trabajo interno: al aprobar no genera cuenta por cobrar ni cuenta como venta a
                  cliente.
                </span>
              </span>
            </label>
          </div>

          {error !== null && (
            <p role="alert" className="text-sm text-peligro-texto">
              {error}
            </p>
          )}

          <div className="flex flex-wrap items-center justify-end gap-3">
            {cargandoContactos && (
              <p role="status" aria-live="polite" className="text-xs text-texto-secundario">
                Cargando los contactos del cliente…
              </p>
            )}
            {faltantesCliente.length > 0 && (
              <p data-testid="alta-rfq-faltantes-cliente" className={CLASE_MENSAJE_FALTANTE}>
                Para continuar completa: {faltantesCliente.join(' y ')}.
              </p>
            )}
            <Button
              type="submit"
              tamano="lg"
              disabled={enviando || faltantesCliente.length > 0 || cargandoContactos}
            >
              {enviando ? 'Creando RFQ…' : 'Continuar con ítems'}
            </Button>
          </div>
        </form>
      )}

      {paso === 'items' && (
        <section className="flex flex-col gap-3" data-testid="alta-rfq-items">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-texto-primario">Ítems de la solicitud</h3>
            <p className="text-sm text-texto-secundario">
              Agrega los ítems con material y espesor del catálogo. Se guardan en este mismo RFQ.
            </p>
          </div>

          {errorRfq !== null ? (
            <div className="flex flex-col gap-2">
              <p role="alert" className="text-sm text-peligro-texto">
                {errorRfq}
              </p>
              <Button
                type="button"
                variante="contorno"
                tamano="sm"
                className="self-start"
                onClick={refrescarRfq}
              >
                Reintentar
              </Button>
            </div>
          ) : rfq ? (
            <TablaItemsRfq
              rfq={rfq}
              catalogos={catalogos}
              onCambio={refrescarRfq}
              faltantes={sinItemsActivos ? FALTANTE_ITEM_ACTIVO : undefined}
            />
          ) : (
            <p role="status" aria-live="polite" className="text-sm text-texto-secundario">
              Cargando el RFQ…
            </p>
          )}

          {sinItemsActivos && (
            <p data-testid="alta-rfq-items-requerido" className={CLASE_MENSAJE_FALTANTE}>
              Crea al menos un ítem para continuar con los archivos.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borde pt-4">
            <Button type="button" variante="contorno" tamano="sm" onClick={finalizar}>
              Finalizar más tarde
            </Button>
            <Button
              type="button"
              tamano="sm"
              disabled={!rfq || sinItemsActivos}
              onClick={() => setPaso('archivos')}
            >
              Continuar con archivos
            </Button>
          </div>
        </section>
      )}

      {paso === 'archivos' && (
        <section className="flex flex-col gap-3" data-testid="alta-rfq-archivos">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-texto-primario">Archivos del RFQ</h3>
            <p className="text-sm text-texto-secundario">
              Sube al menos un plano, dibujo o especificación para finalizar la captura. El binario
              sube directo a Storage.
            </p>
          </div>

          {errorRfq !== null ? (
            <div className="flex flex-col gap-2">
              <p role="alert" className="text-sm text-peligro-texto">
                {errorRfq}
              </p>
              <Button
                type="button"
                variante="contorno"
                tamano="sm"
                className="self-start"
                onClick={refrescarRfq}
              >
                Reintentar
              </Button>
            </div>
          ) : rfq ? (
            <PanelArchivosRfq
              rfq={rfq}
              onCambio={refrescarRfq}
              onSubiendo={manejarSubidaArchivo}
              archivoRequerido
            />
          ) : (
            <p role="status" aria-live="polite" className="text-sm text-texto-secundario">
              Cargando el RFQ…
            </p>
          )}

          {subiendoArchivo && (
            <p role="status" aria-live="polite" className="text-sm font-medium text-acento">
              Subiendo archivo… espera a que termine antes de finalizar.
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borde pt-4">
            <Button
              type="button"
              variante="contorno"
              tamano="sm"
              disabled={subiendoArchivo}
              onClick={() => setPaso('items')}
            >
              Volver a ítems
            </Button>
            <Button
              type="button"
              tamano="sm"
              disabled={subiendoArchivo || !rfq || sinArchivos}
              onClick={() => setFinalizarAbierto(true)}
            >
              Finalizar captura
            </Button>
          </div>

          <p className="text-xs text-texto-secundario">
            El RFQ queda como Incompleto; podrás marcarlo Listo desde su ficha cuando esté
            completo. Crear propuesta solo ocurre con esa acción explícita.
          </p>
        </section>
      )}

      {finalizarAbierto && rfq && (
        <DialogoFinalizarCapturaRfq
          rfq={rfq}
          catalogos={catalogos}
          onCerrar={() => setFinalizarAbierto(false)}
          onExito={() => {
            setFinalizarAbierto(false);
            finalizar();
          }}
          onRefrescar={refrescarRfq}
          onCambioEnvio={onCambioEnvio}
        />
      )}
    </div>
  );
}
