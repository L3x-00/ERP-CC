'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

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

/**
 * Etapas del alta de RFQ (C1.2). `captura` son las que se llenan en este
 * formulario; `ficha` continúan en `/rfq?rfq=<id>` sobre el MISMO RFQ, que nace
 * `INCOMPLETE` (DC-03). No se presentan como embebidas aquí porque todavía no
 * lo están: Items/Archivos/Revisar llegan en C1.2b.
 */
const ETAPAS_ALTA_RFQ = [
  { clave: 'cliente', titulo: 'Cliente', donde: 'captura' },
  { clave: 'solicitud', titulo: 'Solicitud', donde: 'captura' },
  { clave: 'items', titulo: 'Ítems', donde: 'ficha' },
  { clave: 'archivos', titulo: 'Archivos', donde: 'ficha' },
  { clave: 'revisar', titulo: 'Revisar', donde: 'ficha' },
] as const;

/** Indicador de las cinco etapas del alta, con dónde ocurre cada una. */
function EtapasAltaRfq() {
  return (
    <div data-testid="etapas-alta-rfq" className="flex flex-col gap-2">
      <ol aria-label="Etapas del alta de RFQ" className="flex flex-wrap items-center gap-2">
        {ETAPAS_ALTA_RFQ.map((etapa, indice) => {
          const enCaptura = etapa.donde === 'captura';
          return (
            <li
              key={etapa.clave}
              className={
                enCaptura
                  ? 'flex items-center gap-1.5 rounded-full border border-acento bg-acento-suave px-3 py-1 text-xs font-semibold text-acento'
                  : 'flex items-center gap-1.5 rounded-full border border-dashed border-borde bg-superficie px-3 py-1 text-xs font-medium text-texto-secundario'
              }
            >
              <span aria-hidden="true" className="font-mono">
                {indice + 1}
              </span>
              {etapa.titulo}
              <span className="sr-only">
                {enCaptura ? ' — se captura aquí' : ' — continúa en la ficha del RFQ'}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-texto-secundario">
        Aquí capturas <strong className="font-semibold">Cliente</strong> y{' '}
        <strong className="font-semibold">Solicitud</strong>. Al guardar, el RFQ queda como{' '}
        <strong className="font-semibold">Incompleto</strong> y la captura de Ítems, Archivos y
        Revisar continúa en la ficha del RFQ: no se crea otro folio.
      </p>
    </div>
  );
}

/**
 * Formulario controlado para iniciar un RFQ recuperable. Envía los datos a
 * `crearProspectoAccion`; solo el éxito limpia los campos, avisa al contenedor
 * (`onExito`) y continúa la captura en la ficha del mismo RFQ. Campos numéricos
 * como `ivaPorcentaje` y `etiquetas` los resuelve el esquema por defecto.
 *
 * RFQ-02/03: permite elegir (o dar de alta) el cliente del catálogo sin salir
 * del formulario. Al elegirlo se heredan sus condiciones de pago y se rellenan
 * solo los campos de contacto que estén vacíos — nunca se pisa lo ya capturado.
 *
 * DC-01: el alta ya no captura Orden de compra ni Horas estimadas. `Fecha
 * requerida por cliente` se conserva como dato informativo y NO es la fecha
 * compromiso, que se confirma al aceptar una revisión.
 */
export function FormularioProspecto({
  onExito,
  onCambioEnvio,
}: {
  onExito?: (id: string) => void;
  onCambioEnvio?: (enviando: boolean) => void;
}) {
  const router = useRouter();
  const clienteConsultas = useQueryClient();
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

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>): Promise<void> {
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
        // Sin id no hay a dónde continuar la captura: se conserva el borrador
        // en el modal en vez de limpiarlo y perderlo.
        setError('No se pudo continuar la captura. Intenta de nuevo.');
      } else {
        const { id } = respuesta.datos;
        limpiar();
        // El tablero vive en una consulta de TanStack Query (`['pipeline']`):
        // navegar no la invalida por sí solo y con `refetchOnWindowFocus`
        // desactivado la fila nueva no aparecería al volver a la cola.
        await clienteConsultas.invalidateQueries({ queryKey: ['pipeline'] });
        onExito?.(id);
        // DC-03: la captura continúa en la ficha del MISMO RFQ (`INCOMPLETE`).
        // El id devuelto es el único folio del alta; no se crea un segundo RFQ.
        router.push(`/rfq?rfq=${id}`);
      }
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setEnviando(false);
      onCambioEnvio?.(false);
    }
  }

  return (
    <form onSubmit={manejarEnvio} className="flex flex-col gap-4" noValidate>
      <EtapasAltaRfq />

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
            Dato informativo de lo que pide el cliente. No es la Fecha compromiso: esa se confirma
            al aceptar una revisión de la propuesta.
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
              Trabajo interno: al aprobar no genera cuenta por cobrar ni cuenta como venta a cliente.
            </span>
          </span>
        </label>
      </div>

      {error !== null && (
        <p role="alert" className="text-sm text-peligro-texto">
          {error}
        </p>
      )}

      <Button type="submit" tamano="lg" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Crear RFQ'}
      </Button>
    </form>
  );
}
