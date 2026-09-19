'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

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
 * Formulario controlado para crear una nueva oportunidad (prospecto). Envía los
 * datos a `crearProspectoAccion`; en éxito limpia los campos y refresca la ruta
 * para que el tablero muestre la oportunidad recién creada. Campos numéricos
 * como `ivaPorcentaje` y `etiquetas` los resuelve el esquema por defecto.
 *
 * RFQ-02/03: permite elegir (o dar de alta) el cliente del catálogo sin salir
 * del formulario. Al elegirlo se heredan sus condiciones de pago y se rellenan
 * solo los campos de contacto que estén vacíos — nunca se pisa lo ya capturado.
 */
export function FormularioProspecto() {
  const router = useRouter();
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
  const [poCliente, setPoCliente] = useState('');
  const [fechaRequerida, setFechaRequerida] = useState('');
  const [horasEstimadas, setHorasEstimadas] = useState('');
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
    setPoCliente('');
    setFechaRequerida('');
    setHorasEstimadas('');
    setNotas('');
  }

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);
    setEnviando(true);

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
        ...(poCliente.trim() ? { poCliente: poCliente.trim() } : {}),
        ...(fechaRequerida ? { fechaRequerida } : {}),
        ...(horasEstimadas.trim() !== '' && Number.isFinite(Number(horasEstimadas))
          ? { horasEstimadas: Number(horasEstimadas) }
          : {}),
        ...(notas.trim() ? { notas: notas.trim() } : {}),
      });

      if (respuesta.exito) {
        limpiar();
        router.refresh();
      } else {
        setError(respuesta.error);
      }
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    }

    setEnviando(false);
  }

  return (
    <form onSubmit={manejarEnvio} className="flex flex-col gap-4" noValidate>
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

        <div className="flex flex-col gap-1">
          <Label htmlFor="prospecto-po">Orden de compra (PO, opcional)</Label>
          <Input
            id="prospecto-po"
            type="text"
            value={poCliente}
            onChange={(evento) => setPoCliente(evento.target.value)}
            maxLength={60}
            placeholder="PO del cliente"
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="prospecto-fecha-requerida">Fecha requerida (opcional)</Label>
          <Input
            id="prospecto-fecha-requerida"
            type="date"
            value={fechaRequerida}
            onChange={(evento) => setFechaRequerida(evento.target.value)}
          />
        </div>

        <div className="flex flex-col gap-1">
          <Label htmlFor="prospecto-horas">Horas estimadas (opcional)</Label>
          <Input
            id="prospecto-horas"
            type="number"
            min="0"
            step="0.5"
            value={horasEstimadas}
            onChange={(evento) => setHorasEstimadas(evento.target.value)}
          />
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
        {enviando ? 'Guardando…' : 'Crear oportunidad'}
      </Button>
    </form>
  );
}
