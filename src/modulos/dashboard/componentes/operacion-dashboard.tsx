'use client';

import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { usarTiendaDashboard } from '@/estado/uso-tienda-dashboard';
import { cambiarPeriodoDashboard, obtenerMetricasInicioAccion } from '@/modulos/dashboard/acciones/indice';
import { CLAVE_DASHBOARD } from '@/modulos/dashboard/componentes/claves-consulta';
import { FiltroPeriodoGlobal } from '@/modulos/dashboard/componentes/filtro-periodo-global';
import { SeccionFinanciera } from '@/modulos/dashboard/componentes/seccion-financiera';
import { SeccionProduccionAlertas } from '@/modulos/dashboard/componentes/seccion-produccion-alertas';
import { SeccionVentasPipeline } from '@/modulos/dashboard/componentes/seccion-ventas-pipeline';
import { SincronizadorDashboardRealtime } from '@/modulos/dashboard/componentes/sincronizador-dashboard-realtime';
import { WidgetMetricaKPI } from '@/modulos/dashboard/componentes/widget-metrica-kpi';
import { Button } from '@/compartido/componentes/ui/button';
import type { DashboardConsolidado, FiltroPeriodoDashboard } from '@/modulos/dashboard/tipos/indice';

export function OperacionDashboard({ datosIniciales }: { datosIniciales: DashboardConsolidado }) {
  const filtro = usarTiendaDashboard((estado) => estado.filtroActivo);
  const establecerFiltro = usarTiendaDashboard((estado) => estado.establecerFiltro);
  const establecerError = usarTiendaDashboard((estado) => estado.establecerError);
  const revision = usarTiendaDashboard((estado) => estado.revisionDashboard);

  useEffect(() => {
    establecerFiltro(datosIniciales.filtro);
  }, [datosIniciales, establecerFiltro]);

  const consulta = useQuery({
    queryKey: [...CLAVE_DASHBOARD, filtro, revision],
    queryFn: async (): Promise<DashboardConsolidado> => {
      const respuesta = revision === 0 && filtro.fechaInicio === datosIniciales.filtro.fechaInicio
        ? await obtenerMetricasInicioAccion(filtro)
        : await cambiarPeriodoDashboard(filtro);
      if (!respuesta.exito || !respuesta.datos) throw new Error(respuesta.exito ? 'Métricas ausentes' : respuesta.error);
      return respuesta.datos;
    },
    initialData: datosIniciales,
    staleTime: 0,
  });

  useEffect(() => {
    if (consulta.error) establecerError('No se pudieron actualizar las métricas');
  }, [consulta.error, establecerError]);

  const datos = consulta.data ?? datosIniciales;
  const tarjetas = useMemo(() => datos.tarjetas, [datos.tarjetas]);
  const cambiarFiltro = (nuevoFiltro: FiltroPeriodoDashboard): void => establecerFiltro(nuevoFiltro);

  if (datos.redireccion) return <p>Redirigiendo a Producción…</p>;
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6" data-testid="pagina-dashboard">
      <SincronizadorDashboardRealtime />
      <header><h1 className="text-2xl font-bold">Dashboard operativo</h1><p className="text-sm text-texto-secundario">Indicadores visibles según tu rol y permisos vigentes.</p></header>
      <FiltroPeriodoGlobal filtro={filtro} onChange={cambiarFiltro} disabled={consulta.isFetching} />
      {consulta.isError ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-peligro/30 bg-peligro-suave px-4 py-3 text-sm text-peligro-texto"
        >
          <span>No se pudieron actualizar las métricas. Vuelve a intentarlo.</span>
          <Button variante="contorno" tamano="sm" onClick={() => void consulta.refetch()}>
            Reintentar
          </Button>
        </div>
      ) : null}
      <section aria-label="Indicadores clave" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">{tarjetas.map((item) => <WidgetMetricaKPI key={item.id} tarjeta={item} />)}</section>
      {datos.ejecutivas ? <SeccionFinanciera finanzas={datos.ejecutivas.actual.finanzas} /> : null}
      {datos.contador ? (
        <SeccionFinanciera
          contador={datos.contador.actual}
          titulo={datos.ejecutivas ? 'Antigüedad de cartera' : 'CxC, CxP y flujo de caja'}
          identificador="contador"
          soloAging={datos.ejecutivas !== undefined}
        />
      ) : null}
      {datos.vendedor ? <SeccionVentasPipeline pipeline={datos.vendedor.actual.pipelinePorEtapa} cotizacionesSinSeguimiento={datos.vendedor.actual.cotizacionesSinSeguimiento} titulo="Mi pipeline" /> : null}
      {datos.equipo ? <SeccionVentasPipeline pipeline={datos.equipo.actual.pipelinePorEtapa} cotizacionesSinSeguimiento={datos.equipo.actual.cotizacionesSinSeguimiento} titulo="Pipeline del equipo" /> : null}
      {datos.produccion ? <SeccionProduccionAlertas ordenes={datos.produccion} /> : null}
    </div>
  );
}
