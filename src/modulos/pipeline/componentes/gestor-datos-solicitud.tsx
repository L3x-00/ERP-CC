'use client';

import { useState } from 'react';

import { actualizarDatosOportunidadAccion } from '@/modulos/pipeline/acciones/actualizar-datos-oportunidad';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Textarea } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';

type DatosSolicitud = {
  poCliente: string | null;
  fechaRequerida: string | null;
  horasEstimadas: number | null;
  notas: string | null;
};

type PropsGestorDatos = {
  oportunidadId: string;
  datos: DatosSolicitud;
  soloLectura?: boolean;
  onCambio?: (datos: DatosSolicitud) => void;
};

/** La fecha viene como timestamptz; el input `date` necesita solo YYYY-MM-DD. */
function aFechaInput(valor: string | null): string {
  return valor ? valor.slice(0, 10) : '';
}

/**
 * Datos de captura de la solicitud comercial (RFQ-01): PO del cliente, fecha
 * requerida, horas estimadas y notas. En `soloLectura` muestra los valores; si
 * no, permite editarlos y guardarlos juntos con `actualizarDatosOportunidadAccion`.
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
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  if (soloLectura) {
    const filas = [
      datos.poCliente ? `PO: ${datos.poCliente}` : null,
      datos.fechaRequerida ? `Fecha requerida: ${aFechaInput(datos.fechaRequerida)}` : null,
      datos.horasEstimadas !== null ? `Horas estimadas: ${datos.horasEstimadas}` : null,
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
    setGuardando(true);
    try {
      const respuesta = await actualizarDatosOportunidadAccion({
        id: oportunidadId,
        poCliente,
        fechaRequerida,
        horasEstimadas: horas,
        notas,
      });
      if (respuesta.exito) {
        setMensaje('Datos guardados.');
        onCambio?.({
          poCliente: poCliente.trim() ? poCliente.trim() : null,
          fechaRequerida: fechaRequerida ? fechaRequerida : null,
          horasEstimadas: horas,
          notas: notas.trim() ? notas.trim() : null,
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
