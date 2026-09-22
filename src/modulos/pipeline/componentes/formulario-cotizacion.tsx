'use client';

import { useMemo, useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { formatearMoneda } from '@/compartido/utilidades/formatear';
import { actualizarCotizacionAccion } from '@/modulos/pipeline/acciones/actualizar-cotizacion';
import { crearCotizacionAccion } from '@/modulos/pipeline/acciones/crear-cotizacion';
import { obtenerAreasTrabajoAccion } from '@/modulos/pipeline/acciones/obtener-areas-trabajo';
import { obtenerEquiposEstacionesAccion } from '@/modulos/pipeline/acciones/obtener-equipos-estaciones';
import { obtenerTipoCambioAccion } from '@/modulos/pipeline/acciones/obtener-tipo-cambio';
import {
  calcularTotalesCotizacion,
  equivalenteMxn,
} from '@/modulos/pipeline/servicios/calcular-totales-cotizacion';
import type {
  LineaCotizacionEntrada,
  MonedaPipeline,
} from '@/modulos/pipeline/tipos/indice';
import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import { CotizadorTecnico } from '@/modulos/cotizador/componentes/cotizador-tecnico';
import { obtenerCatalogoTarifasAccion } from '@/modulos/cotizador/acciones/obtener-catalogo-tarifas';
import { agregarArchivoAdjuntoAccion } from '@/modulos/pipeline/acciones/agregar-archivo-adjunto';
import { claveAdjuntos } from '@/modulos/pipeline/componentes/panel-adjuntos';
import type { CotizacionTecnicaCalculada } from '@/modulos/cotizador/tipos/indice';

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
  calculoTecnico?: CotizacionTecnicaCalculada;
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
  /** RFQ-05: código de área/departamento del catálogo. */
  areaTrabajoCodigo: string;
  /** OBS-04: código del equipo/estación del catálogo de Planeación. */
  estacionCodigo: string;
  /** RFQ-06: trabajo externo (EXT). */
  esExterno: boolean;
  /** RFQ-06: proveedor externo (texto libre). */
  proveedorExterno: string;
  /** RFQ-03: la línea es un descuento del cliente, no una partida fabricable. */
  esDescuento: boolean;
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
    areaTrabajoCodigo: '',
    estacionCodigo: '',
    esExterno: false,
    proveedorExterno: '',
    esDescuento: false,
  };
}

/** Línea de descuento (RFQ-03): concepto removible que resta del subtotal. */
function lineaDescuento(): LineaFormulario {
  return { ...lineaVacia(), descripcion: 'Descuento', esDescuento: true };
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
    calculoTecnico: entrada.calculoTecnico,
    areaTrabajoCodigo: entrada.areaTrabajoCodigo ?? '',
    estacionCodigo: entrada.estacionCodigo ?? '',
    esExterno: entrada.esExterno ?? false,
    proveedorExterno: entrada.proveedorExterno ?? '',
    esDescuento: entrada.esDescuento ?? false,
  };
}

/** Convierte una línea del formulario a la entrada tipada para cálculo/envío. */
function aEntrada(linea: LineaFormulario): LineaCotizacionEntrada {
  // El descuento es un concepto comercial: no arrastra datos técnicos ni de
  // producción aunque el formulario los tuviera de un estado anterior.
  if (linea.esDescuento) {
    return {
      descripcion: linea.descripcion.trim(),
      cantidad: Number(linea.cantidad) || 0,
      precioUnitario: Number(linea.precioUnitario) || 0,
      esDescuento: true,
    };
  }
  const material = linea.material.trim();
  const espesor = linea.espesor.trim();
  const area = linea.area.trim();
  const proveedor = linea.proveedorExterno.trim();
  const procesosSinTocar = linea.procesos === linea.procesosOriginales.join(', ');
  return {
    descripcion: linea.descripcion.trim(),
    ...(linea.calculoTecnico ? { calculoTecnico: linea.calculoTecnico } : {}),
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
    areaTrabajoCodigo: linea.areaTrabajoCodigo === '' ? undefined : linea.areaTrabajoCodigo,
    estacionCodigo: linea.estacionCodigo === '' ? undefined : linea.estacionCodigo,
    esExterno: linea.esExterno,
    proveedorExterno: linea.esExterno && proveedor !== '' ? proveedor : undefined,
    esDescuento: false,
  };
}

/** Campos de texto/número de la línea que edita `actualizarLinea`. */
type CampoLinea =
  | 'descripcion'
  | 'cantidad'
  | 'precioUnitario'
  | 'material'
  | 'espesor'
  | 'area'
  | 'procesos'
  | 'areaTrabajoCodigo'
  | 'estacionCodigo'
  | 'proveedorExterno';

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
  // Catálogo central de tarifas (CFG-10/OBS-30): precarga el cotizador. Se
  // consulta una sola vez y se comparte entre todas las líneas.
  const { data: catalogoTarifas } = useQuery({
    queryKey: ['cotizador', 'catalogo-tarifas'],
    queryFn: async () => {
      const respuesta = await obtenerCatalogoTarifasAccion();
      return respuesta.exito ? respuesta.datos : null;
    },
    staleTime: 5 * 60 * 1000,
  });
  // RFQ-11: tipo de cambio para el equivalente MXN de cotizaciones en USD. Solo
  // se consulta cuando la moneda es USD; en MXN no hace falta.
  const { data: tipoCambioUsd } = useQuery({
    queryKey: ['cotizador', 'tipo-cambio'],
    queryFn: async () => {
      const respuesta = await obtenerTipoCambioAccion();
      return respuesta.exito ? (respuesta.datos?.tipoCambioUsd ?? null) : null;
    },
    enabled: moneda === 'USD',
    staleTime: 5 * 60 * 1000,
  });
  // RFQ-05: catálogo de áreas/departamento para etiquetar cada línea. Se
  // consulta una sola vez y se comparte entre todas las líneas.
  const { data: areasTrabajo } = useQuery({
    queryKey: ['pipeline', 'areas-trabajo'],
    queryFn: async () => {
      const respuesta = await obtenerAreasTrabajoAccion();
      return respuesta.exito ? respuesta.datos : null;
    },
    staleTime: 5 * 60 * 1000,
  });
  // OBS-04: catálogo de equipos/estaciones (recursos de Planeación) para indicar
  // qué equipo atenderá cada línea. Solo activos y sin datos de capacidad.
  const { data: equiposEstaciones } = useQuery({
    queryKey: ['pipeline', 'equipos-estaciones'],
    queryFn: async () => {
      const respuesta = await obtenerEquiposEstacionesAccion();
      return respuesta.exito ? respuesta.datos : null;
    },
    staleTime: 5 * 60 * 1000,
  });
  // OBS-14: agrupa el catálogo por área padre para leer la jerarquía.
  const areasDisponibles = areasTrabajo ?? [];
  const codigosDeArea = new Set(areasDisponibles.map((area) => area.codigo));
  const areasRaiz = areasDisponibles.filter(
    (area) => !area.padreCodigo || !codigosDeArea.has(area.padreCodigo),
  );
  const hijosDeArea = (codigo: string) =>
    areasDisponibles.filter((area) => area.padreCodigo === codigo);
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
  // Una cotización debe conservar al menos una línea fabricable (RFQ-03): las
  // de descuento no cuentan y se pueden quitar siempre.
  const fabricables = lineas.filter((linea) => !linea.esDescuento).length;

  function actualizarLinea(indice: number, campo: CampoLinea, valor: string): void {
    // Editar el área o el proveedor externo no invalida el cálculo técnico; el
    // resto de los campos comerciales sí lo desvinculan.
    const preservaCalculo =
      campo === 'descripcion' ||
      campo === 'area' ||
      campo === 'areaTrabajoCodigo' ||
      campo === 'estacionCodigo' ||
      campo === 'proveedorExterno';
    setLineas((previas) =>
      previas.map((linea, i) =>
        i === indice
          ? { ...linea, [campo]: valor, calculoTecnico: preservaCalculo ? linea.calculoTecnico : undefined }
          : linea,
      ),
    );
  }

  function alternarExterno(indice: number, activo: boolean): void {
    setLineas((previas) =>
      previas.map((linea, i) =>
        i === indice
          ? { ...linea, esExterno: activo, proveedorExterno: activo ? linea.proveedorExterno : '' }
          : linea,
      ),
    );
  }

  function agregarLinea(): void {
    setLineas((previas) => [...previas, lineaVacia()]);
  }

  function agregarDescuento(): void {
    setLineas((previas) => [...previas, lineaDescuento()]);
  }

  /** Adjunta a la oportunidad el plano leído en el cotizador (COT-04/05/06, RFQ-19). */
  async function adjuntarPlano(archivo: File): Promise<boolean> {
    const formData = new FormData();
    formData.set('pipelineId', pipelineId);
    formData.set('archivo', archivo);
    const respuesta = await agregarArchivoAdjuntoAccion(formData);
    if (respuesta.exito) await clienteConsultas.invalidateQueries({ queryKey: claveAdjuntos(pipelineId) });
    return respuesta.exito;
  }

  function aplicarCalculo(indice: number, calculo: CotizacionTecnicaCalculada): void {
    setLineas(previas => previas.map((linea, i) => i !== indice ? linea : {
      ...linea, cantidad: String(calculo.entrada.cantidad), precioUnitario: String(calculo.precioUnitario),
      material: calculo.entrada.material ?? calculo.entrada.laser?.material ?? linea.material,
      espesor: `${calculo.entrada.espesorMm ?? calculo.entrada.laser?.espesorMm} mm`,
      procesos: calculo.procesos.map(p => p.proceso).join(', '), procesosOriginales: calculo.procesos.map(p => p.proceso), calculoTecnico: calculo,
    }));
  }

  function quitarLinea(indice: number): void {
    setLineas((previas) => {
      const linea = previas[indice];
      if (!linea) return previas;
      // Quitar la última línea fabricable dejaría una cotización sin producción.
      if (!linea.esDescuento && previas.filter((l) => !l.esDescuento).length <= 1) return previas;
      return previas.filter((_, i) => i !== indice);
    });
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
                  className={`flex flex-col gap-1 rounded-lg border bg-superficie p-3 text-sm ${
                    entrada.esDescuento ? 'border-dashed' : 'border-borde'
                  }`}
                >
                  <span className="flex items-center gap-2 font-medium text-texto-primario">
                    {entrada.descripcion}
                    {entrada.esDescuento && <Badge variante="info">Descuento</Badge>}
                  </span>
                  {linea.calculoTecnico && <CotizadorTecnico moneda={moneda} cantidad={entrada.cantidad} inicial={linea.calculoTecnico} soloLectura onAplicar={() => {}} />}
                  <span className="text-xs text-texto-secundario">
                    {entrada.esDescuento ? (
                      <>
                        −
                        {formatearMoneda(
                          entrada.cantidad * entrada.precioUnitario,
                          moneda,
                        )}{' '}
                        (se resta del subtotal)
                      </>
                    ) : (
                      <>
                        {entrada.cantidad} × {formatearMoneda(entrada.precioUnitario, moneda)} ={' '}
                        <span className="tabular-nums">
                          {formatearMoneda(entrada.cantidad * entrada.precioUnitario, moneda)}
                        </span>
                      </>
                    )}
                  </span>
                  {!entrada.esDescuento && (
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
                        entrada.areaTrabajoCodigo
                          ? `Área/departamento: ${entrada.areaTrabajoCodigo}`
                          : null,
                        entrada.estacionCodigo
                          ? `Equipo/estación: ${entrada.estacionCodigo}`
                          : null,
                        entrada.esExterno
                          ? `Externo (EXT)${entrada.proveedorExterno ? `: ${entrada.proveedorExterno}` : ''}`
                          : null,
                      ]
                        .filter((dato) => dato !== null)
                        .join(' · ') || 'Sin datos técnicos capturados'}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <ResumenTotales totales={totales} tipoCambioUsd={tipoCambioUsd ?? null} />
      </div>
    );
  }

  return (
    <form onSubmit={manejarEnvio} className="flex flex-col gap-4" noValidate>
      <div className="flex flex-col gap-3">
        {lineas.map((linea, indice) => (
          <div
            key={indice}
            className={`flex flex-col gap-2 rounded-lg border bg-superficie p-3 shadow-sm ${
              linea.esDescuento ? 'border-dashed' : ''
            }`}
          >
            {linea.esDescuento ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variante="info">Descuento</Badge>
                  <span className="flex-1 text-xs text-texto-secundario">
                    Se resta del subtotal de la cotización.
                  </span>
                  <Button
                    type="button"
                    variante="destructivo"
                    tamano="sm"
                    onClick={() => quitarLinea(indice)}
                  >
                    Quitar
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`linea-${indice}-descripcion`}>Concepto</Label>
                    <Input
                      id={`linea-${indice}-descripcion`}
                      type="text"
                      value={linea.descripcion}
                      onChange={(evento) =>
                        actualizarLinea(indice, 'descripcion', evento.target.value)
                      }
                      placeholder="Descuento comercial"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label htmlFor={`linea-${indice}-precio`}>Monto del descuento</Label>
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
                </div>
              </>
            ) : (
              <>
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
                  step="0.01"
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
                  step="0.0001"
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

              <div className="flex flex-col gap-1">
                <Label htmlFor={`linea-${indice}-area-trabajo`}>
                  Área / departamento (opcional)
                </Label>
                <Select
                  id={`linea-${indice}-area-trabajo`}
                  value={linea.areaTrabajoCodigo}
                  onChange={(evento) =>
                    actualizarLinea(indice, 'areaTrabajoCodigo', evento.target.value)
                  }
                >
                  <option value="">Sin asignar</option>
                  {areasRaiz.map((raiz) => {
                    const hijos = hijosDeArea(raiz.codigo);
                    if (hijos.length === 0) {
                      return (
                        <option key={raiz.codigo} value={raiz.codigo}>
                          {raiz.nombre}
                        </option>
                      );
                    }
                    return (
                      <optgroup key={raiz.codigo} label={raiz.nombre}>
                        <option value={raiz.codigo}>{raiz.nombre}</option>
                        {hijos.map((hijo) => (
                          <option key={hijo.codigo} value={hijo.codigo}>
                            {hijo.nombre}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </Select>
              </div>

              {/* OBS-04: equipo/estación del taller que atenderá la línea. */}
              <div className="flex flex-col gap-1">
                <Label htmlFor={`linea-${indice}-estacion`}>
                  Equipo / estación (opcional)
                </Label>
                <Select
                  id={`linea-${indice}-estacion`}
                  value={linea.estacionCodigo}
                  onChange={(evento) =>
                    actualizarLinea(indice, 'estacionCodigo', evento.target.value)
                  }
                >
                  <option value="">Por definir</option>
                  {(equiposEstaciones ?? []).map((equipo) => (
                    <option key={equipo.codigo} value={equipo.codigo}>
                      {equipo.codigo} · {equipo.nombre}
                    </option>
                  ))}
                </Select>
                <span className="text-xs text-texto-secundario">
                  Del catálogo de Planeación; se hereda a la orden.
                </span>
              </div>

              <div className="flex flex-col gap-1 sm:col-span-3">
                <label
                  htmlFor={`linea-${indice}-externo`}
                  className="flex items-center gap-2 text-sm text-texto-primario"
                >
                  <input
                    id={`linea-${indice}-externo`}
                    type="checkbox"
                    checked={linea.esExterno}
                    onChange={(evento) => alternarExterno(indice, evento.target.checked)}
                  />
                  Trabajo externo (EXT)
                </label>
                {linea.esExterno && (
                  <Input
                    type="text"
                    value={linea.proveedorExterno}
                    onChange={(evento) =>
                      actualizarLinea(indice, 'proveedorExterno', evento.target.value)
                    }
                    placeholder="Proveedor externo (texto libre)"
                    aria-label="Proveedor externo"
                  />
                )}
              </div>
            </div>

            <CotizadorTecnico moneda={moneda} cantidad={Number(linea.cantidad)} inicial={linea.calculoTecnico} catalogo={catalogoTarifas ?? undefined} onAdjuntarPlano={adjuntarPlano} onAplicar={calculo=>aplicarCalculo(indice,calculo)} />
            <p className="text-xs text-texto-secundario">
              {linea.calculoTecnico
                ? `Cálculo técnico vinculado${
                    linea.calculoTecnico.tiempoEstimadoMinutos
                      ? ` · Tiempo estimado: ${linea.calculoTecnico.tiempoEstimadoMinutos} min (lo hereda la orden)`
                      : ''
                  }; se guardará junto con la cotización.`
                : 'Precio manual. Modificar cantidad, precio, material, espesor o procesos desvincula el cálculo anterior.'}
            </p>
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
                disabled={fabricables <= 1}
              >
                Quitar
              </Button>
            </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variante="contorno" onClick={agregarLinea} className="self-start">
          Agregar línea
        </Button>
        <Button
          type="button"
          variante="contorno"
          onClick={agregarDescuento}
          className="self-start"
        >
          Agregar descuento
        </Button>
      </div>

      <ResumenTotales totales={totales} tipoCambioUsd={tipoCambioUsd ?? null} />

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

/**
 * Bloque de subtotal, IVA y total; se comparte entre edición y consulta.
 *
 * RFQ-11: el IVA es opcional en la vista — un interruptor permite ver el total
 * con o sin IVA (el porcentaje persistido de la oportunidad no cambia; es una
 * ayuda de presentación). Para cotizaciones en USD, si hay tipo de cambio, se
 * muestra además el equivalente en MXN de la cifra mostrada.
 */
function ResumenTotales({
  totales,
  tipoCambioUsd = null,
}: {
  totales: ReturnType<typeof calcularTotalesCotizacion>;
  tipoCambioUsd?: number | null;
}) {
  const [incluirIva, setIncluirIva] = useState(true);
  const totalMostrado = incluirIva ? totales.total : totales.subtotal;

  const equivalente = tipoCambioUsd !== null ? equivalenteMxn(totales, tipoCambioUsd) : null;
  const equivalenteMostrado = equivalente
    ? incluirIva
      ? equivalente.total
      : equivalente.subtotal
    : null;

  return (
    <div className="flex flex-col gap-1 rounded-lg border border-borde bg-superficie-2 p-3 text-sm">
      <div className="flex items-center justify-between">
        <span className="text-texto-secundario">Subtotal</span>
        <span className="font-medium tabular-nums">
          {formatearMoneda(totales.subtotal + totales.descuento, totales.moneda)}
        </span>
      </div>
      {totales.descuento > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-texto-secundario">Descuento</span>
          <span className="font-medium tabular-nums text-peligro-texto">
            −{formatearMoneda(totales.descuento, totales.moneda)}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-1.5 text-texto-secundario">
          <input
            type="checkbox"
            checked={incluirIva}
            onChange={(evento) => setIncluirIva(evento.target.checked)}
          />
          IVA ({totales.ivaPorcentaje}%)
        </label>
        <span className={`font-medium tabular-nums ${incluirIva ? '' : 'text-texto-tenue line-through'}`}>
          {formatearMoneda(totales.iva, totales.moneda)}
        </span>
      </div>
      <div className="flex items-center justify-between border-t border-borde pt-1">
        <span className="font-semibold">
          Total ({totales.moneda}){incluirIva ? '' : ' sin IVA'}
        </span>
        <span className="font-semibold tabular-nums">
          {formatearMoneda(totalMostrado, totales.moneda)}
        </span>
      </div>
      {equivalenteMostrado !== null && (
        <div className="flex items-center justify-between text-xs text-texto-secundario">
          <span>Equivalente MXN (TC {formatearMoneda(tipoCambioUsd ?? 0, 'MXN', 4)})</span>
          <span className="tabular-nums">{formatearMoneda(equivalenteMostrado, 'MXN')}</span>
        </div>
      )}
    </div>
  );
}
