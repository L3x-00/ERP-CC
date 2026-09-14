'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';

import { formatearMoneda } from '@/compartido/utilidades/formatear';
import { actualizarCotizacionAccion } from '@/modulos/pipeline/acciones/actualizar-cotizacion';
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
  /** Token de concurrencia (`actualizado_en` de la oportunidad al cargarla). */
  actualizadoEn?: string;
  /** Consulta sin edición (oportunidad ganada/perdida o sin permiso de edición). */
  soloLectura?: boolean;
  /** Aviso al contenedor tras un guardado correcto (cerrar panel, etc.). */
  alGuardar?: () => void;
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
  espesor: string;
  area: string;
  procesos: string;
  /**
   * Procesos tal como vinieron de la base. El campo de texto los separa por
   * coma, así que un proceso que contenga una coma no sobrevive al viaje de
   * ida y vuelta: si el usuario no tocó el campo se reenvía el arreglo
   * original en vez del texto reparseado.
   */
  procesosOriginales: readonly string[];
};

function lineaVacia(): LineaFormulario {
  return {
    descripcion: '',
    cantidad: '1',
    precioUnitario: '0',
    material: '',
    espesor: '',
    area: '',
    procesos: '',
    procesosOriginales: [],
  };
}

/** Convierte una línea persistida/inicial al estado editable del formulario. */
function desdeEntrada(entrada: LineaCotizacionEntrada): LineaFormulario {
  const procesos = entrada.procesos ?? [];
  return {
    descripcion: entrada.descripcion,
    cantidad: String(entrada.cantidad),
    precioUnitario: String(entrada.precioUnitario),
    material: entrada.material ?? '',
    espesor: entrada.espesor ?? '',
    area: entrada.area === null || entrada.area === undefined ? '' : String(entrada.area),
    procesos: procesos.join(', '),
    procesosOriginales: procesos,
  };
}

/** Convierte una línea del formulario a la entrada tipada para cálculo/envío. */
function aEntrada(linea: LineaFormulario): LineaCotizacionEntrada {
  const material = linea.material.trim();
  const espesor = linea.espesor.trim();
  const area = linea.area.trim();
  const procesosSinTocar = linea.procesos === linea.procesosOriginales.join(', ');
  return {
    descripcion: linea.descripcion.trim(),
    cantidad: Number(linea.cantidad) || 0,
    precioUnitario: Number(linea.precioUnitario) || 0,
    material: material === '' ? undefined : material,
    espesor: espesor === '' ? undefined : espesor,
    area: area === '' || !Number.isFinite(Number(area)) ? undefined : Number(area),
    procesos: procesosSinTocar
      ? [...linea.procesosOriginales]
      : linea.procesos
          .split(',')
          .map((proceso) => proceso.trim())
          .filter((proceso) => proceso !== ''),
  };
}

/**
 * Cotizador de una oportunidad: lista dinámica de líneas (con los datos
 * técnicos material/espesor/área/procesos) y totales en vivo. Al enviar guarda
 * la cotización completa en una sola transacción — `actualizarCotizacionAccion`
 * si ya había líneas, `crearCotizacionAccion` si es la primera — enviando el
 * token `actualizadoEnEsperado` para no pisar el trabajo de otra pantalla.
 *
 * En modo `soloLectura` muestra las líneas y los totales sin controles de
 * edición: es la vista de consulta de una oportunidad ganada o perdida.
 */
export function FormularioCotizacion({
  pipelineId,
  ivaPorcentaje,
  moneda,
  lineasIniciales,
  actualizadoEn,
  soloLectura = false,
  alGuardar,
}: PropsFormularioCotizacion) {
  const router = useRouter();
  const clienteConsultas = useQueryClient();
  const teniaLineas = lineasIniciales !== undefined && lineasIniciales.length > 0;
  // En consulta no se inventa una línea en blanco: una cotización sin líneas se
  // muestra vacía, no como una partida ficticia con cantidad 1 y precio 0.
  const [lineas, setLineas] = useState<LineaFormulario[]>(() => {
    if (teniaLineas) {
      return (lineasIniciales ?? []).map(desdeEntrada);
    }
    return soloLectura ? [] : [lineaVacia()];
  });
  const [tokenConcurrencia, setTokenConcurrencia] = useState<string | undefined>(actualizadoEn);
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

    const guardar = teniaLineas ? actualizarCotizacionAccion : crearCotizacionAccion;

    try {
      const respuesta = await guardar({
        pipelineId,
        lineas: lineas.map(aEntrada),
        ...(tokenConcurrencia ? { actualizadoEnEsperado: tokenConcurrencia } : {}),
      });

      if (respuesta.exito) {
        setTokenConcurrencia(respuesta.datos?.actualizadoEn ?? tokenConcurrencia);
        setMensajeExito('Cotización guardada.');
        await clienteConsultas.invalidateQueries({ queryKey: ['oportunidad', pipelineId] });
        await clienteConsultas.invalidateQueries({ queryKey: ['pipeline'] });
        router.refresh();
        alGuardar?.();
      } else {
        setError(respuesta.error);
      }
    } catch {
      setError('Error de conexión. Intenta de nuevo.');
    }

    setEnviando(false);
  }

  if (soloLectura) {
    return (
      <div className="flex flex-col gap-3">
        {lineas.length === 0 ? (
          <p className="text-sm text-texto-secundario">Esta oportunidad no tiene cotización.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {lineas.map((linea, indice) => {
              const entrada = aEntrada(linea);
              return (
                <li
                  key={indice}
                  className="flex flex-col gap-1 rounded-lg border border-borde bg-superficie p-3 text-sm"
                >
                  <span className="font-medium text-texto-primario">{entrada.descripcion}</span>
                  <span className="text-xs text-texto-secundario">
                    {entrada.cantidad} × {formatearMoneda(entrada.precioUnitario, moneda)} ={' '}
                    <span className="tabular-nums">
                      {formatearMoneda(entrada.cantidad * entrada.precioUnitario, moneda)}
                    </span>
                  </span>
                  <span className="text-xs text-texto-secundario">
                    {[
                      entrada.material ? `Material: ${entrada.material}` : null,
                      entrada.espesor ? `Espesor: ${entrada.espesor}` : null,
                      entrada.area !== undefined && entrada.area !== null
                        ? `Área geométrica: ${entrada.area}`
                        : null,
                      (entrada.procesos ?? []).length > 0
                        ? `Procesos: ${(entrada.procesos ?? []).join(', ')}`
                        : null,
                    ]
                      .filter((dato) => dato !== null)
                      .join(' · ') || 'Sin datos técnicos capturados'}
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <ResumenTotales totales={totales} />
      </div>
    );
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

            <div className="grid gap-2 sm:grid-cols-3">
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
                <Label htmlFor={`linea-${indice}-espesor`}>Espesor (opcional)</Label>
                <Input
                  id={`linea-${indice}-espesor`}
                  type="text"
                  value={linea.espesor}
                  onChange={(evento) =>
                    actualizarLinea(indice, 'espesor', evento.target.value)
                  }
                  placeholder="1/8&quot;, 3 mm"
                />
              </div>

              <div className="flex flex-col gap-1">
                {/*
                  El esquema guarda `area` como número sin unidad declarada: es
                  el área geométrica de la pieza en la unidad con que se captura
                  históricamente. No es el área (taller) de Planeación y no se
                  le inventa un símbolo de unidad.
                */}
                <Label htmlFor={`linea-${indice}-area`}>Área geométrica (opcional)</Label>
                <Input
                  id={`linea-${indice}-area`}
                  type="number"
                  min="0"
                  step="0.0001"
                  value={linea.area}
                  onChange={(evento) => actualizarLinea(indice, 'area', evento.target.value)}
                  aria-describedby={`linea-${indice}-area-ayuda`}
                />
                <span id={`linea-${indice}-area-ayuda`} className="text-xs text-texto-secundario">
                  Sin unidad declarada en el catálogo.
                </span>
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

      <ResumenTotales totales={totales} />

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

/** Bloque de subtotal, IVA y total; se comparte entre edición y consulta. */
function ResumenTotales({
  totales,
}: {
  totales: ReturnType<typeof calcularTotalesCotizacion>;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-borde bg-superficie-2 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-texto-secundario">Subtotal</span>
        <span className="font-medium tabular-nums">
          {formatearMoneda(totales.subtotal, totales.moneda)}
        </span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-texto-secundario">IVA ({totales.ivaPorcentaje}%)</span>
        <span className="font-medium tabular-nums">
          {formatearMoneda(totales.iva, totales.moneda)}
        </span>
      </div>
      <div className="flex items-center justify-between border-t border-borde pt-1">
        <span className="font-semibold">Total ({totales.moneda})</span>
        <span className="font-semibold tabular-nums">
          {formatearMoneda(totales.total, totales.moneda)}
        </span>
      </div>
    </div>
  );
}
