'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { formatearMoneda } from '@/compartido/utilidades/formatear';
import { crearCotizacionAccion } from '@/modulos/pipeline/acciones/crear-cotizacion';
import { calcularTotalesCotizacion } from '@/modulos/pipeline/servicios/calcular-totales-cotizacion';
import type {
  LineaCotizacionEntrada,
  MonedaPipeline,
} from '@/modulos/pipeline/tipos/indice';
import { Button } from '@/compartido/componentes/ui/button';
import { Input } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';

type PropsFormularioCotizacion = {
  pipelineId: string;
  ivaPorcentaje: number;
  moneda: MonedaPipeline;
  lineasIniciales?: LineaCotizacionEntrada[];
};

/**
 * Estado de una línea en el formulario. Los campos numéricos se guardan como
 * texto para no forzar valores mientras el usuario escribe; se convierten a
 * número al calcular totales y al enviar.
 */
type LineaFormulario = {
  descripcion: string;
  cantidad: string;
  precioUnitario: string;
  material: string;
  procesos: string;
};

function lineaVacia(): LineaFormulario {
  return { descripcion: '', cantidad: '1', precioUnitario: '0', material: '', procesos: '' };
}

/** Convierte una línea persistida/inicial al estado editable del formulario. */
function desdeEntrada(entrada: LineaCotizacionEntrada): LineaFormulario {
  return {
    descripcion: entrada.descripcion,
    cantidad: String(entrada.cantidad),
    precioUnitario: String(entrada.precioUnitario),
    material: entrada.material ?? '',
    procesos: (entrada.procesos ?? []).join(', '),
  };
}

/** Convierte una línea del formulario a la entrada tipada para cálculo/envío. */
function aEntrada(linea: LineaFormulario): LineaCotizacionEntrada {
  const material = linea.material.trim();
  return {
    descripcion: linea.descripcion.trim(),
    cantidad: Number(linea.cantidad) || 0,
    precioUnitario: Number(linea.precioUnitario) || 0,
    material: material === '' ? undefined : material,
    procesos: linea.procesos
      .split(',')
      .map((proceso) => proceso.trim())
      .filter((proceso) => proceso !== ''),
  };
}

/**
 * Cotizador de una oportunidad: lista dinámica de líneas con totales en vivo
 * (subtotal, IVA y total) usando `calcularTotalesCotizacion`. Al enviar guarda
 * la cotización completa con `crearCotizacionAccion` (reemplazo total de líneas).
 */
export function FormularioCotizacion({
  pipelineId,
  ivaPorcentaje,
  moneda,
  lineasIniciales,
}: PropsFormularioCotizacion) {
  const router = useRouter();
  const [lineas, setLineas] = useState<LineaFormulario[]>(() =>
    lineasIniciales !== undefined && lineasIniciales.length > 0
      ? lineasIniciales.map(desdeEntrada)
      : [lineaVacia()],
  );
  const [error, setError] = useState<string | null>(null);
  const [mensajeExito, setMensajeExito] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const totales = useMemo(
    () => calcularTotalesCotizacion(lineas.map(aEntrada), ivaPorcentaje, moneda),
    [lineas, ivaPorcentaje, moneda],
  );

  function actualizarLinea(
    indice: number,
    campo: keyof LineaFormulario,
    valor: string,
  ): void {
    setLineas((previas) =>
      previas.map((linea, i) => (i === indice ? { ...linea, [campo]: valor } : linea)),
    );
  }

  function agregarLinea(): void {
    setLineas((previas) => [...previas, lineaVacia()]);
  }

  function quitarLinea(indice: number): void {
    setLineas((previas) =>
      previas.length <= 1 ? previas : previas.filter((_, i) => i !== indice),
    );
  }

  async function manejarEnvio(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setError(null);
    setMensajeExito(null);
    setEnviando(true);

    try {
      const respuesta = await crearCotizacionAccion({
        pipelineId,
        lineas: lineas.map(aEntrada),
      });

      if (respuesta.exito) {
        setMensajeExito('Cotización guardada.');
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
      <div className="flex flex-col gap-3">
        {lineas.map((linea, indice) => (
          <div
            key={indice}
            className="flex flex-col gap-2 rounded-lg border border-borde bg-superficie p-3 shadow-sm"
          >
            <div className="flex flex-col gap-1">
              <Label htmlFor={`linea-${indice}-descripcion`}>Descripción</Label>
              <Input
                id={`linea-${indice}-descripcion`}
                type="text"
                value={linea.descripcion}
                onChange={(evento) =>
                  actualizarLinea(indice, 'descripcion', evento.target.value)
                }
                placeholder="Pieza, servicio o concepto"
              />
            </div>

            <div className="grid gap-2 sm:grid-cols-4">
              <div className="flex flex-col gap-1">
                <Label htmlFor={`linea-${indice}-cantidad`}>Cantidad</Label>
                <Input
                  id={`linea-${indice}-cantidad`}
                  type="number"
                  min="0"
                  step="1"
                  value={linea.cantidad}
                  onChange={(evento) =>
                    actualizarLinea(indice, 'cantidad', evento.target.value)
                  }
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor={`linea-${indice}-precio`}>Precio unitario</Label>
                <Input
                  id={`linea-${indice}-precio`}
                  type="number"
                  min="0"
                  step="0.01"
                  value={linea.precioUnitario}
                  onChange={(evento) =>
                    actualizarLinea(indice, 'precioUnitario', evento.target.value)
                  }
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor={`linea-${indice}-material`}>Material (opcional)</Label>
                <Input
                  id={`linea-${indice}-material`}
                  type="text"
                  value={linea.material}
                  onChange={(evento) =>
                    actualizarLinea(indice, 'material', evento.target.value)
                  }
                />
              </div>

              <div className="flex flex-col gap-1">
                <Label htmlFor={`linea-${indice}-procesos`}>Procesos (opcional)</Label>
                <Input
                  id={`linea-${indice}-procesos`}
                  type="text"
                  value={linea.procesos}
                  onChange={(evento) =>
                    actualizarLinea(indice, 'procesos', evento.target.value)
                  }
                  placeholder="corte, doblez"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs tabular-nums text-texto-secundario">
                Importe:{' '}
                {formatearMoneda(
                  (Number(linea.cantidad) || 0) * (Number(linea.precioUnitario) || 0),
                  moneda,
                )}
              </span>
              <Button
                type="button"
                variante="destructivo"
                tamano="sm"
                onClick={() => quitarLinea(indice)}
                disabled={lineas.length <= 1}
              >
                Quitar
              </Button>
            </div>
          </div>
        ))}
      </div>

      <Button type="button" variante="contorno" onClick={agregarLinea} className="self-start">
        Agregar línea
      </Button>

      <div className="flex flex-col gap-1 rounded-lg border border-borde bg-superficie-2 p-3 text-sm">
        <div className="flex items-center justify-between">
          <span className="text-texto-secundario">Subtotal</span>
          <span className="font-medium tabular-nums">{formatearMoneda(totales.subtotal, totales.moneda)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-texto-secundario">IVA ({totales.ivaPorcentaje}%)</span>
          <span className="font-medium tabular-nums">{formatearMoneda(totales.iva, totales.moneda)}</span>
        </div>
        <div className="flex items-center justify-between border-t border-borde pt-1">
          <span className="font-semibold">Total ({totales.moneda})</span>
          <span className="font-semibold tabular-nums">{formatearMoneda(totales.total, totales.moneda)}</span>
        </div>
      </div>

      {error !== null && (
        <p role="alert" className="text-sm text-peligro-texto">
          {error}
        </p>
      )}

      {mensajeExito !== null && (
        <p className="text-sm text-exito-texto">{mensajeExito}</p>
      )}

      <Button type="submit" tamano="lg" disabled={enviando}>
        {enviando ? 'Guardando…' : 'Guardar cotización'}
      </Button>
    </form>
  );
}
