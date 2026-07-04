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

const CLASE_BOTON =
  'rounded-base border border-foreground/20 px-2 py-1 text-xs font-medium transition-colors hover:bg-foreground/5 disabled:cursor-not-allowed disabled:opacity-40';
const CLASE_BOTON_PELIGRO =
  'rounded-base bg-red-600 px-3 py-1.5 text-xs font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50';
const CLASE_INPUT =
  'rounded-base border border-foreground/20 bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primario focus:ring-2 focus:ring-primario/30';

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
  const [motivo, setMotivo] = useState('');
  const [notas, setNotas] = useState('');

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
        setMotivo('');
        setNotas('');
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
      setMostrarMotivo(true);
      return;
    }
    if (destino === 'ganada') {
      void ejecutar(() => marcarGanadaAccion({ id: oportunidad.id }));
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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-1">
        {ETAPAS.filter((etapa) => etapa.valor !== desde).map((etapa) => {
          const habilitado =
            esTransicionValida(desde, etapa.valor) || esReversion(desde, etapa.valor);
          return (
            <button
              key={etapa.valor}
              type="button"
              disabled={!habilitado || enviando}
              onClick={() => manejarSeleccion(etapa.valor)}
              className={CLASE_BOTON}
            >
              {etapa.etiqueta}
            </button>
          );
        })}
      </div>

      {mostrarMotivo && (
        <form onSubmit={manejarPerdida} className="flex flex-col gap-2" noValidate>
          <input
            type="text"
            value={motivo}
            onChange={(evento) => setMotivo(evento.target.value)}
            placeholder="Motivo de la pérdida (obligatorio)"
            className={CLASE_INPUT}
          />
          <textarea
            value={notas}
            onChange={(evento) => setNotas(evento.target.value)}
            placeholder="Notas adicionales (opcional)"
            rows={2}
            className={CLASE_INPUT}
          />
          <div className="flex gap-2">
            <button type="submit" disabled={enviando} className={CLASE_BOTON_PELIGRO}>
              {enviando ? 'Guardando…' : 'Confirmar pérdida'}
            </button>
            <button
              type="button"
              onClick={() => setMostrarMotivo(false)}
              className={CLASE_BOTON}
            >
              Cancelar
            </button>
          </div>
        </form>
      )}

      {error !== null && (
        <p role="alert" className="text-xs text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
