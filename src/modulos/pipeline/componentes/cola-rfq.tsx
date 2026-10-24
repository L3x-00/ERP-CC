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
import { Paginacion } from '@/compartido/componentes/diseno/paginacion';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { SkeletonTabla } from '@/compartido/componentes/retroalimentacion/skeleton';
import { Icono } from '@/compartido/componentes/navegacion/iconos';
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
import { TAMANO_PAGINA_RFQ, paginar } from '@/modulos/pipeline/servicios/paginar';
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
 *
 * La cabecera de página y el botón «Nuevo RFQ» comparten fila. La tabla pagina
 * de 15 en 15 y los filtros viven en un panel desplegable para reducir scroll.
 */
export function ColaRfq({
  responsableActual,
}: {
  responsableActual?: { id: string; nombre: string };
}) {
  const { data, isLoading, isError } = usarPipeline();
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [altaEnviando, setAltaEnviando] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosTablero>(FILTROS_TABLERO_INICIAL);
  const [pagina, setPagina] = useState(1);

  const oportunidades = useMemo(() => data ?? [], [data]);
  const filtradas = useMemo(
    () => filtrarOportunidades(oportunidades, filtros),
    [oportunidades, filtros],
  );
  const paginado = useMemo(
    () => paginar(filtradas, pagina, TAMANO_PAGINA_RFQ),
    [filtradas, pagina],
  );
  const resumen = useMemo(() => resumirPipeline(filtradas), [filtradas]);
  const etiquetas = useMemo(() => etiquetasDistintas(oportunidades), [oportunidades]);
  const areas = useMemo(() => areasDistintas(oportunidades), [oportunidades]);
  const clientes = useMemo(() => clientesDistintos(oportunidades), [oportunidades]);
  const responsables = useMemo(() => responsablesDistintos(oportunidades), [oportunidades]);

  const cambiarFiltros = (parcial: Partial<FiltrosTablero>): void => {
    setPagina(1);
    setFiltros((previo) => ({ ...previo, ...parcial }));
  };
  const limpiarFiltros = (): void => {
    setPagina(1);
    setFiltros(FILTROS_TABLERO_INICIAL);
  };

  const hayDatos = !isLoading && !isError && oportunidades.length > 0;
  const vacio = !isLoading && !isError && oportunidades.length === 0;
  const sinCoincidencias = hayDatos && filtradas.length === 0;

  return (
    <div className="flex flex-col gap-5" data-testid="cola-rfq">
      <header className="animar-contenido flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight">RFQ</h1>
            {hayDatos ? (
              <span className="rounded-full bg-acento-suave px-2.5 py-0.5 text-xs font-semibold text-acento-texto">
                {oportunidades.length} en cola
              </span>
            ) : null}
          </div>
          <p className="mt-1 max-w-2xl text-sm text-texto-secundario">
            Solicitudes de cotización: captura, ítems ITxx, archivos y gate LISTO.
          </p>
        </div>
        <Button
          type="button"
          className="w-full shrink-0 sm:w-auto"
          onClick={() => {
            setAltaEnviando(false);
            setAltaAbierta(true);
          }}
        >
          <Icono nombre="mas" className="h-4 w-4" />
          Nuevo RFQ
        </Button>
      </header>

      <Dialog
        open={altaAbierta}
        onOpenChange={(abierta) => {
          if (abierta || !altaEnviando) setAltaAbierta(abierta);
        }}
      >
        <DialogContent className="max-w-[960px]">
          <DialogHeader>
            <DialogTitle>Nuevo RFQ</DialogTitle>
            <DialogDescription>
              Captura cliente, solicitud, ítems y archivos en esta misma ventana. Al finalizar o
              dejar la captura para después, el RFQ queda como Incompleto en la cola con su próxima
              acción y sigue editable: todavía no se crea ninguna propuesta.
            </DialogDescription>
          </DialogHeader>
          <FormularioProspecto
            responsableActual={responsableActual}
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
                      ? 'flex items-center gap-1.5 rounded-full bg-acento-suave px-3 py-1.5 text-xs font-semibold text-texto-primario shadow-xs ring-1 ring-acento/25 transition-all duration-200 ease-suave'
                      : 'flex items-center gap-1.5 rounded-full bg-superficie px-3 py-1.5 text-xs font-medium text-texto-secundario shadow-xs transition-all duration-200 ease-suave hover:bg-superficie-2 hover:text-texto-primario'
                  }
                >
                  {activo ? (
                    <span className="h-1.5 w-1.5 rounded-full bg-acento" aria-hidden="true" />
                  ) : null}
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

      {hayDatos && !sinCoincidencias && (
        <>
          <div key={paginado.pagina} className="animar-contenido">
            <TablaOportunidades oportunidades={paginado.visibles} />
          </div>
          {paginado.totalPaginas > 1 ? (
            <Paginacion
              pagina={paginado.pagina}
              totalPaginas={paginado.totalPaginas}
              total={paginado.total}
              desde={paginado.desde}
              hasta={paginado.hasta}
              onCambiarPagina={setPagina}
              etiquetaElemento="RFQ"
              etiqueta="Paginación de RFQ"
            />
          ) : null}
        </>
      )}
    </div>
  );
}
