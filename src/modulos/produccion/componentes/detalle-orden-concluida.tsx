'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BadgeEstado } from '@/compartido/componentes/diseno/badge-estado';
import { BarraProgreso } from '@/compartido/componentes/diseno/barra-progreso';
import { Button } from '@/compartido/componentes/ui/button';
import { formatearFecha, formatearNumero } from '@/compartido/utilidades/formatear';
import { HiloComentarios } from '@/modulos/comentarios/componentes/indice';
import { obtenerConsumosMaterialOrdenAccion } from '@/modulos/produccion/acciones/indice';
import { AccesosRapidosOrden } from '@/modulos/produccion/componentes/accesos-rapidos-orden';
import { CLAVE_CONSUMOS_ORDEN } from '@/modulos/produccion/componentes/claves-consulta';
import { DocumentosOrdenPanel } from '@/modulos/produccion/componentes/documentos-orden-panel';
import { FichaOrdenProduccion } from '@/modulos/produccion/componentes/ficha-orden-produccion';
import { FormularioNotaEntrega } from '@/modulos/produccion/componentes/formulario-nota-entrega';
import { HistorialSesionesProduccion } from '@/modulos/produccion/componentes/historial-sesiones-produccion';
import { ETIQUETAS_ESTADO } from '@/modulos/produccion/componentes/kanban-produccion';
import type {
  AreaCatalogoProduccion,
  OrdenTableroProduccion,
} from '@/modulos/produccion/servicios/indice';
import type { RecursoPlaneacion } from '@/modulos/planeacion/tipos/indice';

type ResultadoEntrega = { exito: true; folio: string } | { exito: false; error: string };

export interface PropsDetalleOrdenConcluida {
  orden: OrdenTableroProduccion;
  areas: readonly AreaCatalogoProduccion[];
  responsables: Readonly<Record<string, string>>;
  recursos: readonly RecursoPlaneacion[];
  /** La orden completa terminó. Si solo terminó una operación, no se ofrece entrega. */
  esOrdenConcluida: boolean;
  puedeEntregar: boolean;
  procesando: boolean;
  usuarioActualId?: string;
  esAdmin?: boolean;
  onEntregar: (datos: {
    ordenId: string;
    recibidoPor: string;
    firmaClienteUrl?: string;
    partidas: { partidaId: string; cantidadEntregada: number }[];
  }) => Promise<ResultadoEntrega>;
}

function sumar(valores: readonly number[]): number {
  return valores.reduce((total, valor) => total + valor, 0);
}

/**
 * Ficha de una orden ya concluida. Reutiliza los componentes de Producción para
 * mostrar el mismo avance, ruta, material, documentos y sesiones que se vieron
 * durante el trabajo, pero sin ofrecer operación ni reprogramación.
 */
export function DetalleOrdenConcluida({
  orden,
  areas,
  responsables,
  recursos,
  esOrdenConcluida,
  puedeEntregar,
  procesando,
  usuarioActualId,
  esAdmin = false,
  onEntregar,
}: PropsDetalleOrdenConcluida) {
  const [mostrarFormulario, setMostrarFormulario] = useState(false);

  const totales = useMemo(() => {
    const producidas = sumar(orden.partidas.map((partida) => partida.cantidadProducida));
    const solicitadas = sumar(orden.partidas.map((partida) => partida.cantidadSolicitada));
    const scrap = sumar(orden.partidas.map((partida) => partida.cantidadScrap));
    const entregadas = sumar(orden.partidas.map((partida) => partida.cantidadEntregada));
    const pendientes = sumar(
      orden.partidas.map((partida) => Math.max(partida.cantidadSolicitada - partida.cantidadEntregada, 0)),
    );
    const minutosEstimados = sumar(
      orden.partidas.map((partida) => partida.tiempoEstimadoMinutos),
    );
    return {
      producidas,
      solicitadas,
      scrap,
      entregadas,
      pendientes,
      horasEstimadas: minutosEstimados / 60,
      horasTrabajadas: sumar(orden.sesiones.map((sesion) => sesion.horasNetas)),
    };
  }, [orden.partidas, orden.sesiones]);

  const sesionesFinalizadas = useMemo(
    () => [...orden.sesiones]
      .filter((sesion) => sesion.estadoSesion === 'finalizada')
      .sort((primera, segunda) => (
        (segunda.fechaFin ?? segunda.actualizadoEn).localeCompare(
          primera.fechaFin ?? primera.actualizadoEn,
        )
      )),
    [orden.sesiones],
  );
  const ultimaSesion = sesionesFinalizadas[0];
  const concluidaEn = ultimaSesion?.fechaFin ?? orden.fechaFin;
  const concluidaPor = ultimaSesion
    ? responsables[ultimaSesion.operadorId] ?? 'Operador histórico'
    : null;
  const sesionFinalId = ultimaSesion?.id ?? null;
  const porcentaje = totales.solicitadas > 0
    ? (totales.producidas / totales.solicitadas) * 100
    : 0;
  const notasEntrega = useMemo(
    () => [...orden.notasEntrega].sort(
      (primera, segunda) => segunda.creadoEn.localeCompare(primera.creadoEn),
    ),
    [orden.notasEntrega],
  );

  const consumosConsulta = useQuery({
    queryKey: [...CLAVE_CONSUMOS_ORDEN, orden.id],
    queryFn: async () => {
      const respuesta = await obtenerConsumosMaterialOrdenAccion({ ordenId: orden.id });
      if (!respuesta.exito || !respuesta.datos) {
        throw new Error(respuesta.exito ? 'La consulta no devolvió datos' : respuesta.error);
      }
      return respuesta.datos;
    },
    staleTime: 30_000,
  });

  return (
    <div className="flex flex-col gap-4" data-testid="detalle-orden-concluida">
      <section
        aria-labelledby="titulo-resumen-orden-concluida"
        className="rounded-lg border border-exito/30 bg-exito-suave/40 p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="titulo-resumen-orden-concluida" className="text-base font-semibold text-texto-primario">
              {esOrdenConcluida ? 'Orden concluida' : 'Operación concluida'}
            </h2>
            <p className="mt-1 text-sm text-texto-secundario">
              {esOrdenConcluida
                ? 'El trabajo de piso terminó. Consulta el avance, los consumos y los archivos; la entrega se registra aquí.'
                : 'Esta operación ya terminó, pero la orden aún tiene trabajo pendiente en otras operaciones.'}
            </p>
          </div>
          <BadgeEstado
            estado={orden.estadoKanban}
            etiqueta={ETIQUETAS_ESTADO[orden.estadoKanban]}
          />
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-texto-secundario">Piezas producidas</dt>
            <dd className="font-mono text-lg font-semibold tabular-nums text-texto-primario">
              {formatearNumero(totales.producidas)}/{formatearNumero(totales.solicitadas)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-texto-secundario">Entregadas</dt>
            <dd className="font-mono text-lg font-semibold tabular-nums text-texto-primario">
              {formatearNumero(totales.entregadas)}/{formatearNumero(totales.solicitadas)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-texto-secundario">Horas registradas</dt>
            <dd className="font-mono text-lg font-semibold tabular-nums text-texto-primario">
              {formatearNumero(totales.horasTrabajadas)} h
            </dd>
          </div>
          <div>
            <dt className="text-xs text-texto-secundario">Tiempo estimado</dt>
            <dd className="font-mono text-lg font-semibold tabular-nums text-texto-primario">
              {formatearNumero(totales.horasEstimadas)} h
            </dd>
          </div>
        </dl>

        <BarraProgreso
          className="mt-4"
          valor={porcentaje}
          tono="exito"
          mostrarPorcentaje
          etiqueta={`Avance de ${orden.folio}`}
        />

        <dl className="mt-4 grid gap-2 border-t border-exito/20 pt-3 text-sm sm:grid-cols-3">
          <div>
            <dt className="text-xs text-texto-secundario">Concluyó</dt>
            <dd className="font-medium text-texto-primario">
              {concluidaPor ?? 'Sin sesión de operador registrada'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-texto-secundario">Fecha de conclusión</dt>
            <dd className="font-medium text-texto-primario">
              {concluidaEn ? formatearFecha(concluidaEn) : 'Por definir'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-texto-secundario">Scrap acumulado</dt>
            <dd className="font-mono font-medium tabular-nums text-texto-primario">
              {formatearNumero(totales.scrap)}
            </dd>
          </div>
        </dl>
      </section>

      <AccesosRapidosOrden ordenId={orden.id} />

      <FichaOrdenProduccion
        orden={orden}
        areas={areas}
        responsables={responsables}
        recursos={recursos}
      />

      <section
        aria-labelledby="titulo-material-utilizado"
        className="rounded-lg border border-borde bg-superficie p-4"
        data-testid="material-utilizado-orden"
      >
        <h2 id="titulo-material-utilizado" className="text-base font-semibold text-texto-primario">
          Material utilizado
        </h2>
        <p className="mt-1 text-sm text-texto-secundario">
          Consumos registrados al cerrar las sesiones de trabajo.
        </p>
        {consumosConsulta.isPending ? (
          <p className="mt-3 text-sm text-texto-secundario" role="status">Cargando consumos…</p>
        ) : consumosConsulta.isError ? (
          <div className="mt-3 flex flex-col items-start gap-2" role="alert">
            <p className="text-sm text-peligro-texto">No se pudo cargar el material utilizado.</p>
            <Button
              type="button"
              variante="contorno"
              tamano="sm"
              onClick={() => void consumosConsulta.refetch()}
            >
              Reintentar
            </Button>
          </div>
        ) : (consumosConsulta.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-texto-secundario">
            La orden no tiene consumos de material registrados.
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-texto-secundario">
                <tr>
                  <th className="py-2 pr-3 font-medium">Pieza</th>
                  <th className="py-2 pr-3 font-medium">Material</th>
                  <th className="py-2 pr-3 text-right font-medium">Usado</th>
                  <th className="py-2 pr-3 text-right font-medium">Scrap</th>
                  <th className="py-2 font-medium">Fecha</th>
                </tr>
              </thead>
              <tbody>
                {(consumosConsulta.data ?? []).map((consumo) => (
                  <tr key={consumo.id} className="border-t border-borde">
                    <td className="py-2 pr-3 font-mono text-xs">{consumo.codigoPieza}</td>
                    <td className="py-2 pr-3">{consumo.materialNombre}</td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">
                      {formatearNumero(consumo.cantidadUsada)} {consumo.unidadBase ?? ''}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">
                      {formatearNumero(consumo.cantidadScrap)} {consumo.unidadBase ?? ''}
                    </td>
                    <td className="py-2 text-texto-secundario">{formatearFecha(consumo.creadoEn)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {esOrdenConcluida ? (
        <section
          aria-labelledby="titulo-entrega-concluida"
          className="rounded-lg border border-borde bg-superficie p-4"
          data-testid="entrega-orden-concluida"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 id="titulo-entrega-concluida" className="text-base font-semibold text-texto-primario">
                Entrega
              </h2>
              <p className="mt-1 text-sm text-texto-secundario">
                {totales.pendientes > 0
                  ? `Pendiente por entregar: ${formatearNumero(totales.pendientes)} piezas.`
                  : 'La orden está entregada por completo.'}
              </p>
            </div>
            {puedeEntregar && totales.pendientes > 0 ? (
              <Button
                type="button"
                tamano="lg"
                data-testid="abrir-entrega-orden-concluida"
                onClick={() => setMostrarFormulario((visible) => !visible)}
              >
                {mostrarFormulario ? 'Ocultar entrega' : 'Entrega'}
              </Button>
            ) : null}
          </div>

          {notasEntrega.length > 0 ? (
            <ul className="mt-3 flex flex-col gap-1 text-sm" data-testid="notas-entrega-concluida">
              {notasEntrega.map((nota) => (
                <li key={nota.id} className="rounded-md border border-borde bg-superficie-2/50 px-3 py-2">
                  <span className="font-mono text-xs font-semibold">{nota.folio}</span>
                  {' · '}
                  <span className="text-texto-secundario">
                    {formatearFecha(nota.creadoEn)} · {nota.recibidoPor}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          {!puedeEntregar && totales.pendientes > 0 ? (
            <p className="mt-3 text-sm text-texto-secundario">
              Tu perfil puede consultar la orden, pero no registrar entregas.
            </p>
          ) : null}

          {mostrarFormulario ? (
            <div className="mt-4">
              <FormularioNotaEntrega
                orden={orden}
                procesando={procesando}
                onEnviar={onEntregar}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      <HistorialSesionesProduccion orden={orden} responsables={responsables} soloLectura />
      <DocumentosOrdenPanel
        ordenId={orden.id}
        ordenFolio={orden.folio}
        sesionFinalId={esOrdenConcluida ? sesionFinalId : null}
        soloLectura
      />
      <HiloComentarios
        entidadTipo="orden"
        entidadId={orden.id}
        usuarioActualId={usuarioActualId}
        puedeEliminarTodos={esAdmin}
        titulo={`Comentarios de ${orden.folio}`}
        compositorModal
      />
    </div>
  );
}
