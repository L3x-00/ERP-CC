'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { Button } from '@/compartido/componentes/ui/button';
import { Select } from '@/compartido/componentes/ui/input';
import { usarTiendaProduccion } from '@/estado/uso-tienda-produccion';
import {
  cerrarSesionOperadorAccion,
  generarNotaEntregaAccion,
  iniciarSesionOperadorAccion,
  reanudarSesionOperadorAccion,
  obtenerTableroProduccionAccion,
} from '@/modulos/produccion/acciones/indice';
import {
  CLAVE_CATALOGOS_PISO,
  CLAVE_CORRIDAS_ORDEN,
  CLAVE_ENTREGABLES_ORDEN,
  CLAVE_TABLERO_PRODUCCION,
} from '@/modulos/produccion/componentes/claves-consulta';
import { DocumentosOrdenPanel } from '@/modulos/produccion/componentes/documentos-orden-panel';
import { DetalleOrdenConcluida } from '@/modulos/produccion/componentes/detalle-orden-concluida';
import { FormularioNotaEntrega } from '@/modulos/produccion/componentes/formulario-nota-entrega';
import { FichaOrdenProduccion } from '@/modulos/produccion/componentes/ficha-orden-produccion';
import { HiloComentarios } from '@/modulos/comentarios/componentes/indice';
import { KanbanProduccion, ETIQUETAS_ESTADO } from '@/modulos/produccion/componentes/kanban-produccion';
import {
  ordenConcluida,
  trabajoEnPisoConcluido,
} from '@/modulos/ordenes/utilidades/conclusion-orden';
import { PanelCalidadProduccion } from '@/modulos/produccion/componentes/panel-calidad-produccion';
import { PanelCorridasProduccion } from '@/modulos/produccion/componentes/panel-corridas-produccion';
import { PanelHorasExtraProduccion } from '@/modulos/produccion/componentes/panel-horas-extra-produccion';
import { PanelOperadorProduccion } from '@/modulos/produccion/componentes/panel-operador-produccion';
import { PanelRecursosLiberados } from '@/modulos/produccion/componentes/panel-recursos-liberados';
import { HistorialSesionesProduccion } from '@/modulos/produccion/componentes/historial-sesiones-produccion';
import { SincronizadorProduccionRealtime } from '@/modulos/produccion/componentes/sincronizador-produccion-realtime';
import { opcionesFamiliaArea } from '@/modulos/produccion/utilidades/indice';
import type { DatosTableroProduccion } from '@/modulos/produccion/servicios/indice';
import type { CierreSesionRegistrado } from '@/modulos/produccion/servicios/sesiones-servicio';
import type { CatalogosPiso } from '@/modulos/produccion/acciones/consultas-b6';
import type { VerificacionInicio } from '@/modulos/produccion/tipos/indice';
import {
  obtenerCatalogosPisoAccion,
  obtenerCorridasOrdenAccion,
} from '@/modulos/produccion/acciones/consultas-b6';

export interface PropsOperacionProduccion {
  datosIniciales: DatosTableroProduccion;
  operadorId: string | null;
  usuarioActualId?: string;
  esAdmin?: boolean;
  /** PLA-06: la tarjeta de Planeación abre Producción con la orden ya elegida. */
  ordenInicialId?: string;
}

/** Orquesta el piso de taller sin copias locales de datos de negocio. */
export function OperacionProduccion({ datosIniciales, operadorId, usuarioActualId, esAdmin = false, ordenInicialId }: PropsOperacionProduccion) {
  const clienteConsultas = useQueryClient();
  const recursoId = usarTiendaProduccion((estado) => estado.recursoId);
  const areaCodigo = usarTiendaProduccion((estado) => estado.areaCodigo);
  const estados = usarTiendaProduccion((estado) => estado.estados);
  const ordenSeleccionadaId = usarTiendaProduccion((estado) => estado.ordenSeleccionadaId);
  const sesionActivaAlmacenada = usarTiendaProduccion((estado) => estado.sesionActiva);
  const establecerRecurso = usarTiendaProduccion((estado) => estado.establecerRecurso);
  const establecerAreaCodigo = usarTiendaProduccion((estado) => estado.establecerAreaCodigo);
  const alternarEstado = usarTiendaProduccion((estado) => estado.alternarEstado);
  const seleccionarOrden = usarTiendaProduccion((estado) => estado.seleccionarOrden);
  const establecerSesionActiva = usarTiendaProduccion((estado) => estado.establecerSesionActiva);
  const [procesando, setProcesando] = useState(false);
  const [corridaSeleccionadaCruda, setCorridaSeleccionadaId] = useState<string | null>(null);
  // El modo se fija al abrir: una orden que termina mientras el panel está
  // abierto conserva el flujo de operación (entrega parcial/total de los E2E).
  const [modoPanel, setModoPanel] = useState<'operar' | 'detalle' | null>(() => {
    if (!ordenInicialId) return null;
    const orden = datosIniciales.ordenes.find((actual) => actual.id === ordenInicialId);
    return orden && trabajoEnPisoConcluido(orden.estadoKanban) ? 'detalle' : 'operar';
  });
  const ordenInicialAplicada = useRef<string | null>(null);

  const filtros = useMemo(() => ({
    ...(recursoId ? { recursoId } : {}),
    ...(areaCodigo ? { areaCodigo } : {}),
    ...(estados.length > 0 ? { estados } : {}),
  }), [areaCodigo, recursoId, estados]);
  const consultaInicial = recursoId === null && areaCodigo === null && estados.length === 0;
  const consulta = useQuery({
    queryKey: [...CLAVE_TABLERO_PRODUCCION, filtros],
    queryFn: async (): Promise<DatosTableroProduccion> => {
      const resultado = await obtenerTableroProduccionAccion(filtros);
      if (!resultado.exito || !resultado.datos) {
        throw new Error(resultado.exito ? 'El tablero no devolvió datos' : resultado.error);
      }
      return resultado.datos;
    },
    ...(consultaInicial ? { initialData: datosIniciales } : {}),
  });
  const datos = consulta.data ?? datosIniciales;

  // PLA-06: llegada desde una tarjeta de Planeación; selecciona la orden pedida.
  // El modo inicial ya se fijó con los datos del servidor: si la orden estaba
  // concluida, la ficha de resultados se abre sin pasar por operación.
  useEffect(() => {
    if (!ordenInicialId || ordenInicialAplicada.current === ordenInicialId) return;
    if (!datos.ordenes.some((orden) => orden.id === ordenInicialId)) return;
    ordenInicialAplicada.current = ordenInicialId;
    seleccionarOrden(ordenInicialId);
  }, [ordenInicialId, datos.ordenes, seleccionarOrden]);

  const codigosAreaConTrabajo = [...new Set(
    [...datosIniciales.ordenes, ...datos.ordenes]
      .flatMap((orden) => orden.partidas)
      .flatMap((partida) => partida.areaTrabajoCodigo ? [partida.areaTrabajoCodigo] : []),
  )];
  const opcionesArea = opcionesFamiliaArea(datos.areas ?? datosIniciales.areas ?? [], codigosAreaConTrabajo);
  const ordenSeleccionada = datos.ordenes.find((orden) => orden.id === ordenSeleccionadaId) ?? null;
  const sesionActivaDesdeServidor = operadorId
    ? datos.ordenes.flatMap((orden) => orden.sesiones).find(
      (sesion) => sesion.operadorId === operadorId && sesion.estadoSesion === 'activa',
    )
    : null;
  const sesionActiva = sesionActivaAlmacenada ?? (sesionActivaDesdeServidor ? {
    id: sesionActivaDesdeServidor.id,
    ordenId: sesionActivaDesdeServidor.ordenId,
    partidaId: sesionActivaDesdeServidor.partidaId,
    programacionId: sesionActivaDesdeServidor.programacionId,
  } : null);

  const catalogosConsulta = useQuery({
    queryKey: [...CLAVE_CATALOGOS_PISO],
    queryFn: async (): Promise<CatalogosPiso> => {
      const resultado = await obtenerCatalogosPisoAccion();
      if (!resultado.exito || !resultado.datos) {
        throw new Error(resultado.exito ? 'La consulta no devolvió datos' : resultado.error);
      }
      return resultado.datos;
    },
    staleTime: 5 * 60_000,
  });
  const catalogosPiso = catalogosConsulta.data ?? null;

  const corridasConsulta = useQuery({
    queryKey: [...CLAVE_CORRIDAS_ORDEN, ordenSeleccionada?.id ?? 'sin-orden'],
    queryFn: async () => {
      if (!ordenSeleccionada) return [];
      const resultado = await obtenerCorridasOrdenAccion({ ordenId: ordenSeleccionada.id });
      if (!resultado.exito || !resultado.datos) {
        throw new Error(resultado.exito ? 'La consulta no devolvió datos' : resultado.error);
      }
      return resultado.datos;
    },
    enabled: ordenSeleccionada !== null,
  });
  const corridasOrden = corridasConsulta.data ?? [];
  // La corrida elegida solo vale si sigue perteneciendo a la orden seleccionada.
  const corridaSeleccionadaId = corridasOrden.some((corrida) => corrida.id === corridaSeleccionadaCruda)
    ? corridaSeleccionadaCruda
    : null;

  const refrescar = useCallback(async (): Promise<void> => {
    await clienteConsultas.invalidateQueries({ queryKey: CLAVE_TABLERO_PRODUCCION });
  }, [clienteConsultas]);

  // "Operar orden" debe dar retroalimentación inmediata: selecciona, abre la
  // ficha lateral y lleva el scroll al panel de operador de esa orden. El doble
  // RAF espera a que el panel fijo ya esté montado y sea el contenedor del scroll.
  // Si el trabajo de piso ya terminó, solo se consulta la ficha concluida.
  const seleccionarYOperar = useCallback((ordenId: string): void => {
    const orden = datos.ordenes.find((actual) => actual.id === ordenId);
    const concluida = orden ? trabajoEnPisoConcluido(orden.estadoKanban) : false;
    seleccionarOrden(ordenId);
    setModoPanel(concluida ? 'detalle' : 'operar');
    if (concluida) return;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.getElementById('panel-operador-produccion')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }, [datos.ordenes, seleccionarOrden]);

  const cerrarPanelOrden = useCallback((): void => {
    setModoPanel(null);
    seleccionarOrden(null);
  }, [seleccionarOrden]);

  const desplazarAPanelOperador = useCallback((): void => {
    requestAnimationFrame(() => {
      document.getElementById('panel-operador-produccion')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, []);

  const iniciar = useCallback(async (datosInicio: {
    ordenId: string;
    partidaId: string;
    programacionId: string;
    verificacion: VerificacionInicio;
    corridaId?: string;
  }): Promise<{ exito: true } | { exito: false; error: string }> => {
    setProcesando(true);
    try {
      const resultado = await iniciarSesionOperadorAccion(datosInicio);
      if (!resultado.exito) return { exito: false, error: resultado.error };
      if (!resultado.datos) return { exito: false, error: 'La sesión no devolvió una confirmación' };
      establecerSesionActiva({
        id: resultado.datos.id,
        ordenId: resultado.datos.ordenId,
        partidaId: resultado.datos.partidaId,
        programacionId: resultado.datos.programacionId,
      });
      setModoPanel('operar');
      seleccionarOrden(resultado.datos.ordenId);
      await refrescar();
      return { exito: true };
    } finally {
      setProcesando(false);
    }
  }, [establecerSesionActiva, refrescar, seleccionarOrden]);

  const reanudar = useCallback(async (datosReanudacion: {
    ordenId: string; partidaId: string; programacionId: string; actualizadoEnEsperado: string;
  }): Promise<{ exito: true } | { exito: false; error: string }> => {
    setProcesando(true);
    try {
      const resultado = await reanudarSesionOperadorAccion(datosReanudacion);
      if (!resultado.exito) return { exito: false, error: resultado.error };
      if (!resultado.datos) return { exito: false, error: 'La reanudación no devolvió confirmación' };
      establecerSesionActiva({
        id: resultado.datos.id, ordenId: resultado.datos.ordenId,
        partidaId: resultado.datos.partidaId, programacionId: resultado.datos.programacionId,
      });
      await refrescar();
      return { exito: true };
    } finally {
      setProcesando(false);
    }
  }, [establecerSesionActiva, refrescar]);

  const cerrar = useCallback(async (datosCierre: {
    sesionId: string;
    piezasProducidas: number;
    estadoDestino: 'pausada' | 'finalizada';
    metaProcesoId?: string;
    motivoPausa?: string;
    notas?: string;
    pinConfirmacion: string;
    consumo?: {
      materialId: string;
      cantidadUsada: number;
      cantidadScrap: number;
    };
  }): Promise<{ exito: true; datos: CierreSesionRegistrado } | { exito: false; error: string }> => {
    setProcesando(true);
    try {
      const resultado = await cerrarSesionOperadorAccion(datosCierre);
      if (!resultado.exito) return { exito: false, error: resultado.error };
      if (!resultado.datos) return { exito: false, error: 'El cierre no devolvió una confirmación' };
      establecerSesionActiva(null);
      await refrescar();
      return { exito: true, datos: resultado.datos };
    } finally {
      setProcesando(false);
    }
  }, [establecerSesionActiva, refrescar]);

  const generarNota = useCallback(async (datosNota: {
    ordenId: string;
    recibidoPor: string;
    firmaClienteUrl?: string;
    partidas: { partidaId: string; cantidadEntregada: number }[];
  }): Promise<{ exito: true; folio: string } | { exito: false; error: string }> => {
    setProcesando(true);
    try {
      const resultado = await generarNotaEntregaAccion(datosNota);
      if (!resultado.exito) return { exito: false, error: resultado.error };
      if (!resultado.datos) return { exito: false, error: 'La entrega no devolvió una confirmación' };
      await refrescar();
      await clienteConsultas.invalidateQueries({ queryKey: CLAVE_ENTREGABLES_ORDEN });
      return { exito: true, folio: resultado.datos.folio };
    } finally {
      setProcesando(false);
    }
  }, [clienteConsultas, refrescar]);

  return (
    <div className="flex flex-col gap-4 text-texto-primario" data-testid="operacion-produccion">
      <SincronizadorProduccionRealtime />
      <div className="flex flex-wrap gap-4">
        <label className="flex max-w-sm flex-1 flex-col gap-1 text-sm text-texto-secundario">
          Recurso
          <Select value={recursoId ?? ''} onChange={(evento) => establecerRecurso(evento.target.value || null)}>
            <option value="">Todos los recursos</option>
            {datos.recursos.map((recurso) => <option key={recurso.id} value={recurso.id}>{recurso.codigo} · {recurso.nombre}</option>)}
          </Select>
        </label>
        {/* OBS-09/PRD-11: cola por área del catálogo de taller. */}
        <label className="flex max-w-sm flex-1 flex-col gap-1 text-sm text-texto-secundario">
          Área de taller
          <Select
            data-testid="filtro-area-produccion"
            value={areaCodigo ?? ''}
            onChange={(evento) => establecerAreaCodigo(evento.target.value || null)}
          >
            <option value="">Todas las áreas</option>
            {opcionesArea.map((area) => (
                <option key={area.codigo} value={area.codigo}>{area.nombre}</option>
              ))}
          </Select>
        </label>
      </div>
      {consulta.isError ? <p className="text-sm font-medium text-peligro" role="alert">No se pudo actualizar el tablero; vuelve a intentarlo.</p> : null}
      <KanbanProduccion
        ordenes={datos.ordenes}
        ordenSeleccionadaId={ordenSeleccionadaId}
        estadosActivos={estados}
        actualizando={consulta.isFetching}
        areas={datos.areas ?? []}
        responsables={datos.responsables ?? {}}
        onSeleccionarOrden={seleccionarYOperar}
        onAlternarEstado={alternarEstado}
      />
      {/* Supervisión global: no depende de la orden elegida. */}
      <PanelRecursosLiberados />

      {ordenSeleccionada ? (
        <aside
          id="panel-orden-produccion"
          data-testid="panel-orden-produccion"
          aria-label="Ficha y acciones de la orden"
          className="fixed inset-y-0 right-0 z-40 flex w-full flex-col border-l border-borde bg-superficie shadow-elevada sm:max-w-3xl"
        >
          <header className="flex shrink-0 items-start justify-between gap-3 border-b border-borde px-4 py-3">
            <div className="flex min-w-0 flex-col gap-1">
              <p className="text-[11px] uppercase tracking-wide text-texto-tenue">
                {modoPanel === 'detalle' ? 'Orden concluida' : 'Orden en piso'}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-mono text-lg font-bold text-texto-primario">
                  {ordenSeleccionada.folio}
                </h2>
                <BadgeEstado
                  estado={ordenSeleccionada.estadoKanban}
                  etiqueta={ETIQUETAS_ESTADO[ordenSeleccionada.estadoKanban]}
                />
              </div>
              <p className="truncate text-xs text-texto-secundario">
                {ordenSeleccionada.clienteNombre ?? 'Cliente'} · Compromiso{' '}
                {new Date(
                  ordenSeleccionada.fechaCompromisoComercial ?? ordenSeleccionada.fechaCompromiso,
                ).toLocaleDateString('es-MX')}
              </p>
            </div>
            <Button
              type="button"
              variante="fantasma"
              tamano="sm"
              aria-label="Cerrar ficha de la orden"
              onClick={cerrarPanelOrden}
            >
              ×
            </Button>
          </header>

          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto scroll-sutil px-4 py-4">
            {modoPanel === 'detalle' ? (
              <DetalleOrdenConcluida
                orden={ordenSeleccionada}
                areas={datos.areas ?? []}
                responsables={datos.responsables ?? {}}
                recursos={datos.recursos}
                esOrdenConcluida={ordenConcluida(ordenSeleccionada)}
                // La página de Producción exige `gestionar_produccion` para entrar.
                puedeEntregar
                procesando={procesando}
                usuarioActualId={usuarioActualId}
                esAdmin={esAdmin}
                onEntregar={generarNota}
              />
            ) : (
              <>
                <FichaOrdenProduccion
                  orden={ordenSeleccionada}
                  areas={datos.areas ?? []}
                  responsables={datos.responsables ?? {}}
                  recursos={datos.recursos}
                />

                <section aria-labelledby="titulo-operacion-piso" className="flex flex-col gap-3">
                  <div>
                    <h3 id="titulo-operacion-piso" className="text-sm font-semibold text-texto-primario">
                      Operación en piso
                    </h3>
                    <p className="text-xs text-texto-secundario">
                      Corridas y sesión del operador de esta orden.
                    </p>
                  </div>
                  <PanelCorridasProduccion
                    orden={ordenSeleccionada}
                    catalogos={catalogosPiso}
                    corridaSeleccionadaId={corridaSeleccionadaId}
                    onSeleccionarCorrida={setCorridaSeleccionadaId}
                    onOperarCorrida={desplazarAPanelOperador}
                  />
                  <PanelOperadorProduccion
                    orden={ordenSeleccionada}
                    sesionActiva={sesionActiva}
                    operadorDisponible={operadorId !== null}
                    esAdmin={esAdmin}
                    procesando={procesando}
                    corridaId={corridaSeleccionadaId}
                    motivosPausa={catalogosPiso?.motivos ?? []}
                    materiales={catalogosPiso?.materiales ?? []}
                    onIniciar={iniciar}
                    onReanudar={reanudar}
                    onCerrar={cerrar}
                    responsables={datos.responsables ?? {}}
                  />
                </section>

                <PanelCalidadProduccion orden={ordenSeleccionada} corridas={corridasOrden} />
                <FormularioNotaEntrega
                  key={ordenSeleccionada.id}
                  orden={ordenSeleccionada}
                  procesando={procesando}
                  onEnviar={generarNota}
                />
                <PanelHorasExtraProduccion orden={ordenSeleccionada} sesionIdActivo={sesionActiva?.id ?? null} />
                <HistorialSesionesProduccion orden={ordenSeleccionada} responsables={datos.responsables ?? {}} />
                <DocumentosOrdenPanel
                  ordenId={ordenSeleccionada.id}
                  ordenFolio={ordenSeleccionada.folio}
                  sesionFinalId={ordenConcluida(ordenSeleccionada)
                    ? [...ordenSeleccionada.sesiones]
                      .filter((sesion) => sesion.estadoSesion === 'finalizada')
                      .sort((primera, segunda) => segunda.creadoEn.localeCompare(primera.creadoEn))[0]?.id ?? null
                    : null}
                />
                <HiloComentarios
                  entidadTipo="orden"
                  entidadId={ordenSeleccionada.id}
                  usuarioActualId={usuarioActualId}
                  puedeEliminarTodos={esAdmin}
                  titulo={`Comentarios de ${ordenSeleccionada.folio}`}
                />
              </>
            )}
          </div>
        </aside>
      ) : (
        <section
          data-testid="produccion-sin-seleccion"
          className="rounded-lg border border-dashed border-borde bg-superficie px-6 py-8 text-center"
        >
          <p className="text-sm font-semibold text-texto-primario">Selecciona una orden del tablero</p>
          <p className="mt-1 text-xs text-texto-secundario">
            Al abrirla verás su ficha, la ruta, la sesión, la calidad, la entrega, el historial y los
            documentos en un solo panel.
          </p>
        </section>
      )}
    </div>
  );
}
