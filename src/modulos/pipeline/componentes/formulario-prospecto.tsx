'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { crearProspectoAccion } from '@/modulos/pipeline/acciones/crear-prospecto';
import type {
  CondicionesPago,
  MonedaPipeline,
  PrioridadPipeline,
} from '@/modulos/pipeline/tipos/indice';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';

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
            onChange={(evento) =>
              setCondicionesPago(evento.target.value as CondicionesPago | '')
            }
          >
            <option value="">Sin especificar</option>
            <option value="contado">Contado</option>
            <option value="15_dias">15 días</option>
            <option value="30_dias">30 días</option>
            <option value="credito">Crédito</option>
          </Select>
        </div>
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
