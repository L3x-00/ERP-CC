'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { FormularioCotizacion } from '@/modulos/pipeline/componentes/formulario-cotizacion';
import { GestorClienteOportunidad } from '@/modulos/pipeline/componentes/gestor-cliente-oportunidad';
import { GestorDatosSolicitud } from '@/modulos/pipeline/componentes/gestor-datos-solicitud';
import { GestorEtiquetas } from '@/modulos/pipeline/componentes/gestor-etiquetas';
import { PanelAdjuntos } from '@/modulos/pipeline/componentes/panel-adjuntos';
import { actualizarOrdenInternaAccion } from '@/modulos/pipeline/acciones/actualizar-orden-interna';
import { usarOportunidad } from '@/modulos/pipeline/hooks/usar-oportunidad';
import type { OportunidadConLineas } from '@/modulos/pipeline/servicios/obtener-oportunidad-por-id';
import type {
  CondicionesPago,
  EtapaPipeline,
  LineaCotizacionEntrada,
  Oportunidad,
} from '@/modulos/pipeline/tipos/indice';
import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { Skeleton } from '@/compartido/componentes/retroalimentacion/skeleton';

/** Etapas en las que la cotización todavía admite cambios. */
const ETAPAS_EDITABLES: readonly EtapaPipeline[] = [
  'prospecto',
  'contactado',
  'cotizado',
  'negociacion',
];

/** ¿La cotización de esta etapa se puede editar, o es solo consulta? */
export function cotizacionEsEditable(etapa: EtapaPipeline): boolean {
  return ETAPAS_EDITABLES.includes(etapa);
}

/** Carga una copia fresca al abrir y conserva el borrador hasta cerrar. */
export function EditorCotizacion({
  oportunidad,
  etiqueta = 'Cotización',
  abiertoInicial = false,
}: {
  oportunidad: Oportunidad;
  etiqueta?: string;
  /** OBS-11: abrir el editor directamente (enlace profundo desde el historial). */
  abiertoInicial?: boolean;
}) {
  const [abierto, setAbierto] = useState(abiertoInicial);
  const [instantanea, setInstantanea] = useState<OportunidadConLineas | null>(null);
  const [cargando, setCargando] = useState(false);
  const [fallo, setFallo] = useState(false);
  const [guardandoInterna, setGuardandoInterna] = useState(false);
  const solicitud = useRef(0);
  const cargaInicialSolicitada = useRef(false);
  const clienteConsultas = useQueryClient();
  const { refetch } = usarOportunidad(oportunidad.id, false);

  useEffect(() => () => { solicitud.current += 1; }, []);

  const cargar = useCallback(async (): Promise<void> => {
    const intento = ++solicitud.current;
    setCargando(true);
    setFallo(false);
    setInstantanea(null);
    try {
      const respuesta = await refetch();
      if (intento !== solicitud.current) return;
      if (respuesta.isError || !respuesta.data) setFallo(true);
      else setInstantanea(respuesta.data);
    } catch {
      if (intento === solicitud.current) setFallo(true);
    } finally {
      if (intento === solicitud.current) setCargando(false);
    }
  }, [refetch]);

  // Enlace profundo: la primera carga ocurre al montar sin esperar un clic.
  useEffect(() => {
    if (!abiertoInicial || cargaInicialSolicitada.current) return;
    cargaInicialSolicitada.current = true;
    void cargar();
  }, [abiertoInicial, cargar]);

  function abrir(): void {
    setAbierto(true);
    void cargar();
  }

  function cerrar(): void {
    solicitud.current += 1;
    setAbierto(false);
    setInstantanea(null);
  }

  async function alternarInterna(valor: boolean): Promise<void> {
    if (!instantanea) return;
    setGuardandoInterna(true);
    try {
      const respuesta = await actualizarOrdenInternaAccion({ id: oportunidad.id, esOrdenInterna: valor });
      if (respuesta.exito) {
        setInstantanea({
          ...instantanea,
          oportunidad: { ...instantanea.oportunidad, esOrdenInterna: valor },
        });
      }
    } catch {
      // El estado del checkbox no cambia si la acción falla; el usuario puede reintentar.
    } finally {
      setGuardandoInterna(false);
    }
  }

  function alCambiarEtiquetas(etiquetas: string[]): void {
    if (instantanea) {
      setInstantanea({
        ...instantanea,
        oportunidad: { ...instantanea.oportunidad, etiquetas },
      });
    }
    // El listado del tablero muestra las etiquetas como chips: se invalida para
    // que se reflejen sin recargar la página.
    void clienteConsultas.invalidateQueries({ queryKey: ['pipeline'] });
    void clienteConsultas.invalidateQueries({ queryKey: ['oportunidad', oportunidad.id] });
  }

  function alCambiarDatos(datos: {
    poCliente: string | null;
    fechaRequerida: string | null;
    horasEstimadas: number | null;
    notas: string | null;
    fechaSeguimiento: string | null;
    fechaVencimientoCotizacion: string | null;
    proximoPaso: string | null;
  }): void {
    if (instantanea) {
      setInstantanea({
        ...instantanea,
        oportunidad: { ...instantanea.oportunidad, ...datos },
      });
    }
    void clienteConsultas.invalidateQueries({ queryKey: ['pipeline'] });
    void clienteConsultas.invalidateQueries({ queryKey: ['oportunidad', oportunidad.id] });
  }

  function alCambiarCliente(datos: {
    clienteId: string | null;
    condicionesPago: CondicionesPago | null;
  }): void {
    if (instantanea) {
      setInstantanea({
        ...instantanea,
        oportunidad: { ...instantanea.oportunidad, ...datos },
      });
    }
    void clienteConsultas.invalidateQueries({ queryKey: ['pipeline'] });
    void clienteConsultas.invalidateQueries({ queryKey: ['oportunidad', oportunidad.id] });
  }

  const etapa = instantanea?.oportunidad.etapa ?? oportunidad.etapa;
  const editable = cotizacionEsEditable(etapa);
  const cabecera = instantanea?.oportunidad ?? oportunidad;
  const folio = cabecera.folioCnc ?? cabecera.folioOp;

  const lineasIniciales: LineaCotizacionEntrada[] = (instantanea?.lineas ?? []).map((linea) => ({
    descripcion: linea.descripcion,
    cantidad: linea.cantidad,
    precioUnitario: linea.precioUnitario,
    material: linea.material,
    espesor: linea.espesor,
    area: linea.area,
    procesos: linea.procesos,
    areaTrabajoCodigo: linea.areaTrabajoCodigo,
    estacionCodigo: linea.estacionCodigo,
    esExterno: linea.esExterno,
    proveedorExterno: linea.proveedorExterno,
    esDescuento: linea.esDescuento,
    calculoTecnico: linea.calculoTecnico,
  }));

  return (
    <>
      {!abiertoInicial ? (
        <Button
          type="button"
          variante="contorno"
          tamano="sm"
          onClick={abrir}
          aria-haspopup="dialog"
        >
          {cotizacionEsEditable(oportunidad.etapa) ? etiqueta : `Ver ${etiqueta.toLowerCase()}`}
        </Button>
      ) : null}

      <Dialog open={abierto} onOpenChange={(valor) => (valor ? abrir() : cerrar())}>
        <DialogContent aria-label={`Cotización de ${folio}`}>
          <DialogHeader>
            <DialogTitle>Cotización {folio}</DialogTitle>
            <DialogDescription>
              {editable
                ? 'Captura las líneas de la cotización con sus datos técnicos.'
                : instantanea?.ordenVinculada
                  ? `Documento inmutable: generó la orden ${instantanea.ordenVinculada.folio}. Para cambiar el alcance, cancela esa orden desde Órdenes y crea una cotización nueva.`
                  : 'La oportunidad está cerrada: la cotización queda como consulta histórica.'}
            </DialogDescription>
          </DialogHeader>

          {cargando && (
            <div className="flex flex-col gap-2" role="status" aria-label="Cargando cotización">
              <Skeleton className="h-20 rounded-lg" />
              <Skeleton className="h-20 rounded-lg" />
            </div>
          )}

          {fallo && (
            <div
              role="alert"
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-peligro/30 bg-peligro-suave px-4 py-3 text-sm text-peligro-texto"
            >
              <span>No se pudo cargar la cotización.</span>
              <Button
                type="button"
                variante="contorno"
                tamano="sm"
                onClick={() => void cargar()}
                disabled={cargando}
              >
                {cargando ? 'Reintentando…' : 'Reintentar'}
              </Button>
            </div>
          )}

          {instantanea && (
            <>
              {editable && (
                <label htmlFor="cotizacion-orden-interna" className="flex items-start gap-2 rounded-lg border border-borde px-4 py-3">
                  <input
                    id="cotizacion-orden-interna"
                    type="checkbox"
                    className="mt-1"
                    checked={instantanea.oportunidad.esOrdenInterna}
                    disabled={guardandoInterna}
                    onChange={(evento) => void alternarInterna(evento.target.checked)}
                  />
                  <span className="text-sm">
                    <span className="font-medium text-texto-primario">Orden interna (TI)</span>
                    <span className="block text-texto-secundario">
                      Trabajo interno: al aprobar no genera cuenta por cobrar ni cuenta como venta a cliente.
                    </span>
                  </span>
                </label>
              )}
              <GestorClienteOportunidad
                oportunidadId={oportunidad.id}
                clienteId={instantanea.oportunidad.clienteId}
                condicionesPago={instantanea.oportunidad.condicionesPago}
                soloLectura={!editable}
                onCambio={alCambiarCliente}
              />
              <FormularioCotizacion
                pipelineId={oportunidad.id}
                ivaPorcentaje={instantanea.oportunidad.ivaPorcentaje}
                moneda={instantanea.oportunidad.moneda}
                lineasIniciales={lineasIniciales}
                actualizadoEn={instantanea.oportunidad.actualizadoEn}
                soloLectura={!editable}
                alGuardar={cerrar}
              />
              <GestorDatosSolicitud
                oportunidadId={oportunidad.id}
                datos={{
                  poCliente: instantanea.oportunidad.poCliente,
                  fechaRequerida: instantanea.oportunidad.fechaRequerida,
                  horasEstimadas: instantanea.oportunidad.horasEstimadas,
                  notas: instantanea.oportunidad.notas,
                  fechaSeguimiento: instantanea.oportunidad.fechaSeguimiento ?? null,
                  fechaVencimientoCotizacion: instantanea.oportunidad.fechaVencimientoCotizacion ?? null,
                  proximoPaso: instantanea.oportunidad.proximoPaso ?? null,
                }}
                soloLectura={!editable}
                onCambio={alCambiarDatos}
              />
              <GestorEtiquetas
                oportunidadId={oportunidad.id}
                etiquetas={instantanea.oportunidad.etiquetas}
                soloLectura={!editable}
                onCambio={alCambiarEtiquetas}
              />
              <PanelAdjuntos pipelineId={oportunidad.id} soloLectura={!editable} />
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
