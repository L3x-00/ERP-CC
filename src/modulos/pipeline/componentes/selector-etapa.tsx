'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import type { RespuestaAccion } from '@/compartido/tipos/indice';
import { actualizarEtapaAccion } from '@/modulos/pipeline/acciones/actualizar-etapa';
import { marcarGanadaAccion } from '@/modulos/pipeline/acciones/marcar-ganada';
import { marcarPerdidaAccion } from '@/modulos/pipeline/acciones/marcar-perdida';
import {
  esReversion,
  esTransicionValida,
} from '@/modulos/pipeline/servicios/reglas-transicion';
import type { EtapaPipeline, Oportunidad } from '@/modulos/pipeline/tipos/indice';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Textarea } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';

type PropsSelectorEtapa = {
  oportunidad: Oportunidad;
  onCambio?: () => void;
};

const ETAPAS: { valor: EtapaPipeline; etiqueta: string }[] = [
  { valor: 'prospecto', etiqueta: 'Prospecto' },
  { valor: 'contactado', etiqueta: 'Contactado' },
  { valor: 'cotizado', etiqueta: 'Cotizado' },
  { valor: 'negociacion', etiqueta: 'Negociación' },
  { valor: 'ganada', etiqueta: 'Ganada' },
  { valor: 'perdida', etiqueta: 'Perdida' },
];

/**
 * Controles para mover una oportunidad entre etapas. Avances no terminales usan
 * `actualizarEtapaAccion`; ganar usa `marcarGanadaAccion`; perder abre un campo
 * de motivo obligatorio y usa `marcarPerdidaAccion`. Los destinos inválidos se
 * deshabilitan según `esTransicionValida`/`esReversion` (una reversión solo la
 * completará el servidor si el usuario es admin; si no, se muestra su error).
 */
export function SelectorEtapa({ oportunidad, onCambio }: PropsSelectorEtapa) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mostrarMotivo, setMostrarMotivo] = useState(false);
  const [mostrarCompromiso, setMostrarCompromiso] = useState(false);
  const [motivo, setMotivo] = useState('');
  const [notas, setNotas] = useState('');
  const [fechaCompromiso, setFechaCompromiso] = useState('');

  const desde = oportunidad.etapa;

  async function ejecutar(
    operacion: () => Promise<RespuestaAccion<unknown>>,
  ): Promise<void> {
    setError(null);
    setEnviando(true);
    try {
      const respuesta = await operacion();
      if (respuesta.exito) {
        setMostrarMotivo(false);
        setMostrarCompromiso(false);
        setMotivo('');
        setNotas('');
        setFechaCompromiso('');
        router.refresh();
        onCambio?.();
      } else {
        setError(respuesta.error);
      }
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    }
    setEnviando(false);
  }

  function manejarSeleccion(destino: EtapaPipeline): void {
    setError(null);
    if (destino === 'perdida') {
      setMostrarCompromiso(false);
      setMostrarMotivo(true);
      return;
    }
    if (destino === 'ganada') {
      setMostrarMotivo(false);
      setMostrarCompromiso(true);
      return;
    }
    void ejecutar(() =>
      actualizarEtapaAccion({ id: oportunidad.id, etapaDestino: destino }),
    );
  }

  function manejarPerdida(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
    void ejecutar(() =>
      marcarPerdidaAccion({
        id: oportunidad.id,
        motivoPerdida: motivo,
        ...(notas.trim() !== '' ? { notasPerdida: notas.trim() } : {}),
      }),
    );
  }

  function manejarGanada(evento: FormEvent<HTMLFormElement>): void {
    evento.preventDefault();
    const fecha = new Date(fechaCompromiso);
    if (Number.isNaN(fecha.getTime())) {
      setError('Ingresa una fecha de compromiso válida');
      return;
    }

    void ejecutar(() =>
      marcarGanadaAccion({
        id: oportunidad.id,
        fechaCompromiso: fecha.toISOString(),
      }),
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {ETAPAS.filter((etapa) => etapa.valor !== desde).map((etapa) => {
          const habilitado =
            esTransicionValida(desde, etapa.valor) || esReversion(desde, etapa.valor);
          return (
            <Button
              key={etapa.valor}
              type="button"
              variante="contorno"
              tamano="sm"
              disabled={!habilitado || enviando}
              onClick={() => manejarSeleccion(etapa.valor)}
            >
              {etapa.etiqueta}
            </Button>
          );
        })}
      </div>

      {mostrarMotivo && (
        <form onSubmit={manejarPerdida} className="flex flex-col gap-2" noValidate>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`motivo-perdida-${oportunidad.id}`}>Motivo de la pérdida</Label>
            <Input
              id={`motivo-perdida-${oportunidad.id}`}
              type="text"
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value)}
              placeholder="Obligatorio"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`notas-perdida-${oportunidad.id}`}>Notas adicionales (opcional)</Label>
            <Textarea
              id={`notas-perdida-${oportunidad.id}`}
              value={notas}
              onChange={(evento) => setNotas(evento.target.value)}
              rows={2}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variante="destructivo" tamano="lg" disabled={enviando}>
              {enviando ? 'Guardando…' : 'Confirmar pérdida'}
            </Button>
            <Button
              type="button"
              variante="contorno"
              tamano="lg"
              onClick={() => setMostrarMotivo(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {mostrarCompromiso && (
        <form onSubmit={manejarGanada} className="flex flex-col gap-2" noValidate>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`fecha-compromiso-${oportunidad.id}`}>
              Fecha de compromiso de producción
            </Label>
            <Input
              id={`fecha-compromiso-${oportunidad.id}`}
              type="datetime-local"
              value={fechaCompromiso}
              onChange={(evento) => setFechaCompromiso(evento.target.value)}
              required
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" variante="primario" tamano="lg" disabled={enviando}>
              {enviando ? 'Creando orden…' : 'Confirmar ganada y crear OP'}
            </Button>
            <Button
              type="button"
              variante="contorno"
              tamano="lg"
              disabled={enviando}
              onClick={() => setMostrarCompromiso(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}

      {error !== null && (
        <p role="alert" className="text-xs text-peligro-texto">
          {error}
        </p>
      )}
    </div>
  );
}
