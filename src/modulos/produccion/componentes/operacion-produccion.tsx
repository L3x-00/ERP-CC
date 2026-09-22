'use client';

import { useCallback, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Select } from '@/compartido/componentes/ui/input';
import { usarTiendaProduccion } from '@/estado/uso-tienda-produccion';
import {
  cerrarSesionOperadorAccion,
  generarNotaEntregaAccion,
  iniciarSesionOperadorAccion,
  obtenerTableroProduccionAccion,
} from '@/modulos/produccion/acciones/indice';
import { CLAVE_TABLERO_PRODUCCION } from '@/modulos/produccion/componentes/claves-consulta';
import {
  CLAVE_ENTREGABLES_ORDEN,
  DocumentosOrdenPanel,
} from '@/modulos/produccion/componentes/documentos-orden-panel';
import { FormularioNotaEntrega } from '@/modulos/produccion/componentes/formulario-nota-entrega';
import { HiloComentarios } from '@/modulos/comentarios/componentes/indice';
import { KanbanProduccion } from '@/modulos/produccion/componentes/kanban-produccion';
import { PanelOperadorProduccion } from '@/modulos/produccion/componentes/panel-operador-produccion';
import { SincronizadorProduccionRealtime } from '@/modulos/produccion/componentes/sincronizador-produccion-realtime';
import type { DatosTableroProduccion } from '@/modulos/produccion/servicios/indice';
import type { MotivoPausaSesion } from '@/modulos/produccion/tipos/indice';

export interface PropsOperacionProduccion {
  datosIniciales: DatosTableroProduccion;
  operadorId: string | null;
  usuarioActualId?: string;
  esAdmin?: boolean;
}

/** Orquesta el piso de taller sin copias locales de datos de negocio. */
export function OperacionProduccion({ datosIniciales, operadorId, usuarioActualId, esAdmin = false }: PropsOperacionProduccion) {
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

  const refrescar = useCallback(async (): Promise<void> => {
    await clienteConsultas.invalidateQueries({ queryKey: CLAVE_TABLERO_PRODUCCION });
  }, [clienteConsultas]);

  const iniciar = useCallback(async (datosInicio: {
    ordenId: string;
    partidaId: string;
    programacionId: string;
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
      seleccionarOrden(resultado.datos.ordenId);
      await refrescar();
      return { exito: true };
    } finally {
      setProcesando(false);
    }
  }, [establecerSesionActiva, refrescar, seleccionarOrden]);

  const cerrar = useCallback(async (datosCierre: {
    sesionId: string;
    piezasProducidas: number;
    estadoDestino: 'pausada' | 'finalizada';
    motivoPausa?: MotivoPausaSesion;
    notas?: string;
    pinConfirmacion: string;
  }): Promise<{ exito: true } | { exito: false; error: string }> => {
    setProcesando(true);
    try {
      const resultado = await cerrarSesionOperadorAccion(datosCierre);
      if (!resultado.exito) return { exito: false, error: resultado.error };
      if (!resultado.datos) return { exito: false, error: 'El cierre no devolvió una confirmación' };
      establecerSesionActiva(null);
      await refrescar();
      return { exito: true };
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
    <div className="flex flex-col gap-6 text-texto-primario" data-testid="operacion-produccion">
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
            {(datos.areas ?? [])
              .filter((area) => area.padreCodigo === null)
              .map((area) => (
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
        onSeleccionarOrden={seleccionarOrden}
        onAlternarEstado={alternarEstado}
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <PanelOperadorProduccion
          orden={ordenSeleccionada}
          sesionActiva={sesionActiva}
          operadorDisponible={operadorId !== null}
          procesando={procesando}
          onIniciar={iniciar}
          onCerrar={cerrar}
        />
        <FormularioNotaEntrega
          key={ordenSeleccionada?.id ?? 'sin-orden'}
          orden={ordenSeleccionada}
          procesando={procesando}
          onEnviar={generarNota}
        />
      </div>
      <DocumentosOrdenPanel
        ordenId={ordenSeleccionada?.id ?? null}
        ordenFolio={ordenSeleccionada?.folio ?? null}
      />
      {ordenSeleccionada && (
        <HiloComentarios
          entidadTipo="orden"
          entidadId={ordenSeleccionada.id}
          usuarioActualId={usuarioActualId}
          puedeEliminarTodos={esAdmin}
          titulo={`Comentarios de ${ordenSeleccionada.folio}`}
        />
      )}
    </div>
  );
}
