'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { crearProspectoAccion } from '@/modulos/pipeline/acciones/crear-prospecto';
import type {
  CondicionesPago,
  MonedaPipeline,
  PrioridadPipeline,
} from '@/modulos/pipeline/tipos/indice';

const CLASE_INPUT =
  'rounded-base border border-foreground/20 bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primario focus:ring-2 focus:ring-primario/30';
const CLASE_ETIQUETA = 'text-sm font-medium';
const CLASE_BOTON_PRIMARIO =
  'rounded-base bg-primario px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';

/**
 * Formulario controlado para crear una nueva oportunidad (prospecto). Envía los
 * datos a `crearProspectoAccion`; en éxito limpia los campos y refresca la ruta
 * para que el tablero muestre la oportunidad recién creada. Campos numéricos
 * como `ivaPorcentaje` y `etiquetas` los resuelve el esquema por defecto.
 */
export function FormularioProspecto() {
  const router = useRouter();
  const [nombreContacto, setNombreContacto] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [correo, setCorreo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [moneda, setMoneda] = useState<MonedaPipeline>('MXN');
  const [prioridad, setPrioridad] = useState<PrioridadPipeline>('normal');
  const [condicionesPago, setCondicionesPago] = useState<CondicionesPago | ''>('');
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  function limpiar(): void {
    setNombreContacto('');
    setEmpresa('');
    setCorreo('');
    setTelefono('');
    setMoneda('MXN');
    setPrioridad('normal');
    setCondicionesPago('');
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
        ...(condicionesPago !== '' ? { condicionesPago } : {}),
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
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor="prospecto-contacto" className={CLASE_ETIQUETA}>
            Nombre del contacto
          </label>
          <input
            id="prospecto-contacto"
            type="text"
            value={nombreContacto}
            onChange={(evento) => setNombreContacto(evento.target.value)}
            className={CLASE_INPUT}
            placeholder="Nombre y apellido"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="prospecto-empresa" className={CLASE_ETIQUETA}>
            Empresa
          </label>
          <input
            id="prospecto-empresa"
            type="text"
            value={empresa}
            onChange={(evento) => setEmpresa(evento.target.value)}
            className={CLASE_INPUT}
            placeholder="Razón social o nombre comercial"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="prospecto-correo" className={CLASE_ETIQUETA}>
            Correo (opcional)
          </label>
          <input
            id="prospecto-correo"
            type="email"
            value={correo}
            onChange={(evento) => setCorreo(evento.target.value)}
            className={CLASE_INPUT}
            placeholder="contacto@empresa.com"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="prospecto-telefono" className={CLASE_ETIQUETA}>
            Teléfono (opcional)
          </label>
          <input
            id="prospecto-telefono"
            type="tel"
            value={telefono}
            onChange={(evento) => setTelefono(evento.target.value)}
            className={CLASE_INPUT}
            placeholder="664 000 0000"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="prospecto-moneda" className={CLASE_ETIQUETA}>
            Moneda
          </label>
          <select
            id="prospecto-moneda"
            value={moneda}
            onChange={(evento) => setMoneda(evento.target.value as MonedaPipeline)}
            className={CLASE_INPUT}
          >
            <option value="MXN">MXN — Peso mexicano</option>
            <option value="USD">USD — Dólar estadounidense</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label htmlFor="prospecto-prioridad" className={CLASE_ETIQUETA}>
            Prioridad
          </label>
          <select
            id="prospecto-prioridad"
            value={prioridad}
            onChange={(evento) => setPrioridad(evento.target.value as PrioridadPipeline)}
            className={CLASE_INPUT}
          >
            <option value="baja">Baja</option>
            <option value="normal">Normal</option>
            <option value="alta">Alta</option>
            <option value="urgente">Urgente</option>
          </select>
        </div>

        <div className="flex flex-col gap-1 sm:col-span-2">
          <label htmlFor="prospecto-condiciones" className={CLASE_ETIQUETA}>
            Condiciones de pago (opcional)
          </label>
          <select
            id="prospecto-condiciones"
            value={condicionesPago}
            onChange={(evento) =>
              setCondicionesPago(evento.target.value as CondicionesPago | '')
            }
            className={CLASE_INPUT}
          >
            <option value="">Sin especificar</option>
            <option value="contado">Contado</option>
            <option value="15_dias">15 días</option>
            <option value="30_dias">30 días</option>
            <option value="credito">Crédito</option>
          </select>
        </div>
      </div>

      {error !== null && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <button type="submit" disabled={enviando} className={CLASE_BOTON_PRIMARIO}>
        {enviando ? 'Guardando…' : 'Crear oportunidad'}
      </button>
    </form>
  );
}
