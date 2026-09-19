'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

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
  const clienteConsultas = useQueryClient();
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [mostrarMotivo, setMostrarMotivo] = useState(false);
  const [mostrarCompromiso, setMostrarCompromiso] = useState(false);
  const [sobrecreditoMxn, setSobrecreditoMxn] = useState<number | null>(null);
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
        // La tarjeta y el editor leen de TanStack Query: `router.refresh()` no
        // invalida esa caché y, con `refetchOnWindowFocus` desactivado, el
        // tablero seguiría mostrando la etapa anterior tras el cambio.
        await clienteConsultas.invalidateQueries({ queryKey: ['pipeline'] });
        await clienteConsultas.invalidateQueries({ queryKey: ['oportunidad', oportunidad.id] });
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
    void aprobarGanada(false);
  }

  /**
   * RFQ-16: la aprobación puede volver pidiendo autorización cuando el cliente
   * alcanzó su límite de crédito. El reintento con `autorizarSobregiro` solo lo
   * acepta el servidor para administradores; aquí se muestra el excedente.
   */
  async function aprobarGanada(autorizarSobregiro: boolean): Promise<void> {
    const fecha = new Date(fechaCompromiso);
    if (Number.isNaN(fecha.getTime())) {
      setError('Ingresa una fecha de compromiso válida');
      return;
    }
    setError(null);
    setEnviando(true);
    try {
      const respuesta = await marcarGanadaAccion({
        id: oportunidad.id,
        fechaCompromiso: fecha.toISOString(),
        autorizarSobregiro,
      });
      if (respuesta.exito) {
        setMostrarCompromiso(false);
        setFechaCompromiso('');
        setSobrecreditoMxn(null);
        await clienteConsultas.invalidateQueries({ queryKey: ['pipeline'] });
        await clienteConsultas.invalidateQueries({ queryKey: ['oportunidad', oportunidad.id] });
        router.refresh();
        onCambio?.();
      } else if (respuesta.requiereAutorizacionCredito) {
        setSobrecreditoMxn(respuesta.excedenteMxn ?? 0);
        setError(respuesta.error);
      } else {
        setError(respuesta.error);
      }
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    }
    setEnviando(false);
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
              onClick={() => {
                setMostrarCompromiso(false);
                setSobrecreditoMxn(null);
              }}
            >
              Cancelar
            </Button>
          </div>
          {sobrecreditoMxn !== null && (
            <div
              role="alert"
              className="flex flex-col gap-2 rounded-lg border border-borde bg-advertencia-suave px-4 py-3 text-sm text-advertencia-texto"
            >
              <p>
                El cliente alcanzó su límite de crédito; el excedente es{' '}
                <span className="font-semibold tabular-nums">
                  MXN {sobrecreditoMxn.toFixed(2)}
                </span>
                . Solo un administrador puede autorizar la aprobación.
              </p>
              <Button
                type="button"
                variante="primario"
                tamano="sm"
                disabled={enviando}
                onClick={() => void aprobarGanada(true)}
              >
                Autorizar sobrepaso y crear OP
              </Button>
            </div>
          )}
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
