'use client';

import { useMemo, useState } from 'react';

import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { SkeletonTabla } from '@/compartido/componentes/retroalimentacion/skeleton';
import { ControlesPipeline } from '@/modulos/pipeline/componentes/controles-pipeline';
import { FormularioProspecto } from '@/modulos/pipeline/componentes/formulario-prospecto';
import { TablaOportunidades } from '@/modulos/pipeline/componentes/tabla-oportunidades';
import { usarPipeline } from '@/modulos/pipeline/hooks/usar-pipeline';
import {
  FILTROS_TABLERO_INICIAL,
  areasDistintas,
  clientesDistintos,
  etiquetasDistintas,
  filtrarOportunidades,
  type FiltrosTablero,
} from '@/modulos/pipeline/servicios/filtrar-oportunidades';
import { resumirPipeline } from '@/modulos/pipeline/servicios/resumen-pipeline';
import { ESTADOS_PIPELINE, type EstadoRfq, type Oportunidad } from '@/modulos/pipeline/tipos/indice';
import { ETIQUETA_ESTADO_RFQ } from '@/modulos/pipeline/utilidades/indice';

function responsablesDistintos(
  oportunidades: readonly Oportunidad[],
): { id: string; nombre: string }[] {
  const porId = new Map<string, string>();
  for (const oportunidad of oportunidades) {
    const id = oportunidad.responsableId ?? oportunidad.vendedorId;
    if (!porId.has(id)) {
      porId.set(id, oportunidad.responsableNombre?.trim() || 'Responsable sin nombre');
    }
  }
  return [...porId.entries()]
    .map(([id, nombre]) => ({ id, nombre }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/**
 * Cola de trabajo RFQ (CLI-01): lista única en tabla, con filtros por
 * estado/cliente/responsable/próxima acción vencida, y alta de RFQ. Las
 * acciones de negocio viven en la ficha (`/rfq?rfq=<id>`), no en la cola.
 *
 * C1.2a: el alta ocurre en un `Dialog` modal guiado. Los errores conservan los
 * datos capturados y, mientras se guarda, el diálogo no puede cerrarse para
 * evitar reintentos que creen RFQ duplicados.
 */
export function ColaRfq() {
  const { data, isLoading, isError } = usarPipeline();
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [altaEnviando, setAltaEnviando] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosTablero>(FILTROS_TABLERO_INICIAL);

  const oportunidades = useMemo(() => data ?? [], [data]);
  const filtradas = useMemo(
    () => filtrarOportunidades(oportunidades, filtros),
    [oportunidades, filtros],
  );
  const resumen = useMemo(() => resumirPipeline(filtradas), [filtradas]);
  const etiquetas = useMemo(() => etiquetasDistintas(oportunidades), [oportunidades]);
  const areas = useMemo(() => areasDistintas(oportunidades), [oportunidades]);
  const clientes = useMemo(() => clientesDistintos(oportunidades), [oportunidades]);
  const responsables = useMemo(() => responsablesDistintos(oportunidades), [oportunidades]);

  const cambiarFiltros = (parcial: Partial<FiltrosTablero>): void =>
    setFiltros((previo) => ({ ...previo, ...parcial }));
  const limpiarFiltros = (): void => setFiltros(FILTROS_TABLERO_INICIAL);

  const hayDatos = !isLoading && !isError && oportunidades.length > 0;
  const vacio = !isLoading && !isError && oportunidades.length === 0;
  const sinCoincidencias = hayDatos && filtradas.length === 0;

  return (
    <div className="flex flex-col gap-4" data-testid="cola-rfq">
      <div className="flex flex-wrap items-center justify-end gap-4">
        <Button
          type="button"
          onClick={() => {
            setAltaEnviando(false);
            setAltaAbierta(true);
          }}
        >
          Nuevo RFQ
        </Button>
      </div>

      <Dialog
        open={altaAbierta}
        onOpenChange={(abierta) => {
          if (abierta || !altaEnviando) setAltaAbierta(abierta);
        }}
      >
        <DialogContent className="max-w-[760px]">
          <DialogHeader>
            <DialogTitle>Nuevo RFQ</DialogTitle>
            <DialogDescription>
              Captura el cliente y la solicitud. Al guardar, el RFQ queda como Incompleto y
              continúas con ítems y archivos en su ficha, sin perder lo capturado.
            </DialogDescription>
          </DialogHeader>
          <FormularioProspecto
            onCambioEnvio={setAltaEnviando}
            onExito={() => setAltaAbierta(false)}
          />
        </DialogContent>
      </Dialog>

      {hayDatos && (
        <>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filtro por estado">
            {ESTADOS_PIPELINE.map((estado) => {
              const activo = filtros.estadoRfq === estado;
              return (
                <button
                  key={estado}
                  type="button"
                  aria-pressed={activo}
                  onClick={() => cambiarFiltros({ estadoRfq: activo ? '' : estado })}
                  className={
                    activo
                      ? 'rounded-full border border-acento bg-acento-suave px-3 py-1 text-xs font-semibold text-acento'
                      : 'rounded-full border border-borde bg-superficie px-3 py-1 text-xs font-medium text-texto-secundario hover:bg-superficie-2'
                  }
                >
                  {ETIQUETA_ESTADO_RFQ[estado as EstadoRfq]} ({resumen.porEstado[estado]})
                </button>
              );
            })}
          </div>

          <ControlesPipeline
            filtros={filtros}
            onCambio={cambiarFiltros}
            onLimpiar={limpiarFiltros}
            resumen={resumen}
            etiquetas={etiquetas}
            areas={areas}
            clientes={clientes}
            responsables={responsables}
            totalFiltrado={filtradas.length}
            totalTotal={oportunidades.length}
          />
        </>
      )}

      {isLoading && <SkeletonTabla filas={5} columnas={8} />}

      {!isLoading && isError && (
        <p role="alert" className="text-sm text-peligro-texto">
          No se pudieron cargar los RFQ.
        </p>
      )}

      {vacio && (
        <EstadoVacio
          titulo="Sin RFQ"
          descripcion="Aún no hay solicitudes. Crea la primera con “Nuevo RFQ”."
        />
      )}

      {sinCoincidencias && (
        <EstadoVacio
          titulo="Sin coincidencias"
          descripcion="Ningún RFQ coincide con la búsqueda o los filtros aplicados."
          accion={
            <Button variante="contorno" tamano="lg" onClick={limpiarFiltros}>
              Limpiar filtros
            </Button>
          }
        />
      )}

      {hayDatos && !sinCoincidencias && <TablaOportunidades oportunidades={filtradas} />}
    </div>
  );
}
