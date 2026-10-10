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
import { obtenerCatalogosRfqAccion } from '@/modulos/rfq/acciones/obtener-catalogos';
import { obtenerRfqAccion } from '@/modulos/rfq/acciones/obtener-rfq';
import { PanelArchivosRfq } from '@/modulos/rfq/componentes/panel-archivos-rfq';
import { TablaItemsRfq } from '@/modulos/rfq/componentes/tabla-items-rfq';

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
    enabled: rfqId !== null,
  });

  const rfq = rfqConsulta.data?.exito ? rfqConsulta.data.datos : undefined;
  const catalogos = catalogosConsulta.data?.exito ? (catalogosConsulta.data.datos ?? null) : null;
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
  }

  function reiniciarCaptura(): void {
    limpiar();
    setRfqId(null);
    setPaso('solicitud');
    setError(null);
  }

  async function crearRfqYContinuar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);
    setEnviando(true);
    onCambioEnvio?.(true);

    try {
      const respuesta = await crearProspectoAccion({
        nombreContacto,
        empresa,
        correo,
        telefono,
        moneda,
        prioridad,
        esOrdenInterna,
        ...(cliente ? { clienteId: cliente.id } : {}),
        ...(condicionesPago !== '' ? { condicionesPago } : {}),
        ...(fechaRequerida ? { fechaRequerida } : {}),
        ...(notas.trim() ? { notas: notas.trim() } : {}),
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
            <div className="flex flex-col gap-1">
              <Label htmlFor="prospecto-contacto">Nombre del contacto</Label>
              <Input
                id="prospecto-contacto"
                type="text"
                value={nombreContacto}
                onChange={(evento) => setNombreContacto(evento.target.value)}
                placeholder="Nombre y apellido"
              />
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
              <Label htmlFor="prospecto-telefono">Teléfono (opcional)</Label>
              <Input
                id="prospecto-telefono"
                type="tel"
                value={telefono}
                onChange={(evento) => setTelefono(evento.target.value)}
                placeholder="664 000 0000"
              />
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

          <div className="flex justify-end">
            <Button type="submit" tamano="lg" disabled={enviando}>
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
            <TablaItemsRfq rfq={rfq} catalogos={catalogos} onCambio={refrescarRfq} />
          ) : (
            <p role="status" aria-live="polite" className="text-sm text-texto-secundario">
              Cargando el RFQ…
            </p>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borde pt-4">
            <Button type="button" variante="contorno" tamano="sm" onClick={finalizar}>
              Finalizar más tarde
            </Button>
            <Button type="button" tamano="sm" disabled={!rfq} onClick={() => setPaso('archivos')}>
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
              Sube planos, dibujos o especificaciones ahora o déjalos para después. El binario sube
              directo a Storage.
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
            <PanelArchivosRfq rfq={rfq} onCambio={refrescarRfq} onSubiendo={manejarSubidaArchivo} />
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
              disabled={subiendoArchivo}
              onClick={finalizar}
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
    </div>
  );
}
