'use client';

import { useState } from 'react';

import { actualizarDatosOportunidadAccion } from '@/modulos/pipeline/acciones/actualizar-datos-oportunidad';
import { sumarDiasHabiles } from '@/modulos/pipeline/utilidades/indice';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Textarea } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';

type DatosSolicitud = {
  poCliente: string | null;
  fechaRequerida: string | null;
  horasEstimadas: number | null;
  notas: string | null;
  fechaSeguimiento: string | null;
  fechaVencimientoCotizacion: string | null;
  proximoPaso: string | null;
};

type PropsGestorDatos = {
  oportunidadId: string;
  datos: DatosSolicitud;
  soloLectura?: boolean;
  onCambio?: (datos: DatosSolicitud) => void;
};

/** La fecha viene como timestamptz; el input `date` necesita solo YYYY-MM-DD. */
function aFechaInput(valor: string | null | undefined): string {
  return valor ? valor.slice(0, 10) : '';
}

/** Fecha de hoy (UTC) usada como base de las propuestas de días hábiles. */
function hoyISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Datos de captura de la solicitud comercial (RFQ-01/RFQ-08): PO del cliente,
 * fecha requerida, horas estimadas, notas y las fechas comerciales de
 * seguimiento (+3 días hábiles) y vencimiento (+10 días hábiles). Las fechas
 * son propuestas editables: el sistema no tiene catálogo de feriados, así que
 * `sumarDiasHabiles` solo salta sábados y domingos y el usuario decide.
 */
export function GestorDatosSolicitud({
  oportunidadId,
  datos,
  soloLectura = false,
  onCambio,
}: PropsGestorDatos) {
  const [poCliente, setPoCliente] = useState(datos.poCliente ?? '');
  const [fechaRequerida, setFechaRequerida] = useState(aFechaInput(datos.fechaRequerida));
  const [horasEstimadas, setHorasEstimadas] = useState(
    datos.horasEstimadas === null ? '' : String(datos.horasEstimadas),
  );
  const [notas, setNotas] = useState(datos.notas ?? '');
  const [fechaSeguimiento, setFechaSeguimiento] = useState(aFechaInput(datos.fechaSeguimiento));
  const [fechaVencimientoCotizacion, setFechaVencimientoCotizacion] = useState(
    aFechaInput(datos.fechaVencimientoCotizacion),
  );
  const [proximoPaso, setProximoPaso] = useState(datos.proximoPaso ?? '');
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  if (soloLectura) {
    const filas = [
      datos.poCliente ? `PO: ${datos.poCliente}` : null,
      datos.fechaRequerida ? `Fecha requerida: ${aFechaInput(datos.fechaRequerida)}` : null,
      datos.horasEstimadas !== null ? `Horas estimadas: ${datos.horasEstimadas}` : null,
      datos.fechaSeguimiento ? `Seguimiento: ${aFechaInput(datos.fechaSeguimiento)}` : null,
      datos.proximoPaso ? `Siguiente acción: ${datos.proximoPaso}` : null,
      datos.fechaVencimientoCotizacion
        ? `Vence: ${aFechaInput(datos.fechaVencimientoCotizacion)}`
        : null,
      datos.notas ? `Notas: ${datos.notas}` : null,
    ].filter((linea) => linea !== null);
    if (filas.length === 0) return null;
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-borde px-4 py-3 text-sm text-texto-secundario">
        {filas.map((linea) => (
          <span key={linea}>{linea}</span>
        ))}
      </div>
    );
  }

  async function guardar(): Promise<void> {
    setError(null);
    setMensaje(null);
    const horas = horasEstimadas.trim() === '' ? null : Number(horasEstimadas);
    if (horas !== null && !Number.isFinite(horas)) {
      setError('Horas estimadas inválidas');
      return;
    }
    if (fechaSeguimiento && !proximoPaso.trim()) {
      setError('Captura la siguiente acción concreta del seguimiento');
      return;
    }
    setGuardando(true);
    try {
      const respuesta = await actualizarDatosOportunidadAccion({
        id: oportunidadId,
        poCliente,
        fechaRequerida,
        horasEstimadas: horas,
        notas,
        fechaSeguimiento,
        fechaVencimientoCotizacion,
        proximoPaso,
      });
      if (respuesta.exito) {
        setMensaje('Datos guardados.');
        onCambio?.({
          poCliente: poCliente.trim() ? poCliente.trim() : null,
          fechaRequerida: fechaRequerida ? fechaRequerida : null,
          horasEstimadas: horas,
          notas: notas.trim() ? notas.trim() : null,
          fechaSeguimiento: fechaSeguimiento ? fechaSeguimiento : null,
          fechaVencimientoCotizacion: fechaVencimientoCotizacion
            ? fechaVencimientoCotizacion
            : null,
          proximoPaso: proximoPaso.trim() ? proximoPaso.trim() : null,
        });
      } else {
        setError(respuesta.error);
      }
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-borde px-4 py-3">
      <span className="text-sm font-medium text-texto-primario">Datos de la solicitud</span>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`po-${oportunidadId}`}>Orden de compra (PO)</Label>
          <Input
            id={`po-${oportunidadId}`}
            type="text"
            value={poCliente}
            onChange={(evento) => setPoCliente(evento.target.value)}
            maxLength={60}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`fecha-req-${oportunidadId}`}>Fecha requerida</Label>
          <Input
            id={`fecha-req-${oportunidadId}`}
            type="date"
            value={fechaRequerida}
            onChange={(evento) => setFechaRequerida(evento.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`horas-${oportunidadId}`}>Horas estimadas</Label>
          <Input
            id={`horas-${oportunidadId}`}
            type="number"
            min="0"
            step="0.5"
            value={horasEstimadas}
            onChange={(evento) => setHorasEstimadas(evento.target.value)}
          />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label htmlFor={`seguimiento-${oportunidadId}`}>Fecha de seguimiento</Label>
          <div className="flex items-center gap-2">
            <Input
              id={`seguimiento-${oportunidadId}`}
              type="date"
              value={fechaSeguimiento}
              onChange={(evento) => setFechaSeguimiento(evento.target.value)}
            />
            <Button
              type="button"
              variante="contorno"
              tamano="sm"
              onClick={() => setFechaSeguimiento(sumarDiasHabiles(hoyISO(), 3))}
            >
              +3 hábiles
            </Button>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`vencimiento-${oportunidadId}`}>Vigencia de la cotización</Label>
          <div className="flex items-center gap-2">
            <Input
              id={`vencimiento-${oportunidadId}`}
              type="date"
              value={fechaVencimientoCotizacion}
              onChange={(evento) => setFechaVencimientoCotizacion(evento.target.value)}
            />
            <Button
              type="button"
              variante="contorno"
              tamano="sm"
              onClick={() => setFechaVencimientoCotizacion(sumarDiasHabiles(hoyISO(), 10))}
            >
              +10 hábiles
            </Button>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`proximo-paso-${oportunidadId}`} obligatorio={fechaSeguimiento !== ''}>
          Siguiente acción concreta
        </Label>
        <Input
          id={`proximo-paso-${oportunidadId}`}
          value={proximoPaso}
          onChange={(evento) => setProximoPaso(evento.target.value)}
          maxLength={300}
          placeholder="p. ej. Llamar para confirmar la orden de compra"
        />
        <span className="text-xs text-texto-secundario">
          Responsable: el vendedor asignado de la oportunidad. Obligatoria si hay fecha de
          seguimiento{fechaSeguimiento && fechaSeguimiento < hoyISO() ? ' · Seguimiento atrasado' : ''}.
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor={`notas-${oportunidadId}`}>Notas</Label>
        <Textarea
          id={`notas-${oportunidadId}`}
          value={notas}
          onChange={(evento) => setNotas(evento.target.value)}
          rows={2}
          maxLength={2000}
        />
      </div>
      <div className="flex items-center gap-3">
        <Button type="button" variante="contorno" tamano="sm" onClick={() => void guardar()} disabled={guardando}>
          {guardando ? 'Guardando…' : 'Guardar datos'}
        </Button>
        {mensaje !== null && <span className="text-xs text-exito-texto">{mensaje}</span>}
      </div>
      {error !== null && (
        <p role="alert" className="text-xs text-peligro-texto">
          {error}
        </p>
      )}
    </div>
  );
}
