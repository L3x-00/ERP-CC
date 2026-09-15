'use client';

import { useEffect, useRef, useState } from 'react';

import { FormularioCotizacion } from '@/modulos/pipeline/componentes/formulario-cotizacion';
import { usarOportunidad } from '@/modulos/pipeline/hooks/usar-oportunidad';
import type { OportunidadConLineas } from '@/modulos/pipeline/servicios/obtener-oportunidad-por-id';
import type {
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
}: {
  oportunidad: Oportunidad;
  etiqueta?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [instantanea, setInstantanea] = useState<OportunidadConLineas | null>(null);
  const [cargando, setCargando] = useState(false);
  const [fallo, setFallo] = useState(false);
  const solicitud = useRef(0);
  const { refetch } = usarOportunidad(oportunidad.id, false);

  useEffect(() => () => { solicitud.current += 1; }, []);

  async function cargar(): Promise<void> {
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
  }

  function abrir(): void {
    setAbierto(true);
    void cargar();
  }

  function cerrar(): void {
    solicitud.current += 1;
    setAbierto(false);
    setInstantanea(null);
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
    calculoTecnico: linea.calculoTecnico,
  }));

  return (
    <>
      <Button
        type="button"
        variante="contorno"
        tamano="sm"
        onClick={abrir}
        aria-haspopup="dialog"
      >
        {cotizacionEsEditable(oportunidad.etapa) ? etiqueta : `Ver ${etiqueta.toLowerCase()}`}
      </Button>

      <Dialog open={abierto} onOpenChange={(valor) => (valor ? abrir() : cerrar())}>
        <DialogContent aria-label={`Cotización de ${folio}`}>
          <DialogHeader>
            <DialogTitle>Cotización {folio}</DialogTitle>
            <DialogDescription>
              {editable
                ? 'Captura las líneas de la cotización con sus datos técnicos.'
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
            <FormularioCotizacion
              pipelineId={oportunidad.id}
              ivaPorcentaje={instantanea.oportunidad.ivaPorcentaje}
              moneda={instantanea.oportunidad.moneda}
              lineasIniciales={lineasIniciales}
              actualizadoEn={instantanea.oportunidad.actualizadoEn}
              soloLectura={!editable}
              alGuardar={cerrar}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
