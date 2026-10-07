import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { formatearMoneda } from '@/compartido/utilidades/formatear';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { obtenerKpisSiiServicio } from '@/modulos/kpis/servicios/obtener-kpis';
import {
  areasKpisVisibles,
  ETIQUETA_AREA_KPIS,
  type AreaKpis,
  type KpisSii,
} from '@/modulos/kpis/tipos/indice';

type MetricaKpi = { etiqueta: string; valor: string; testid: string };

const porcentaje = (valor: number | null): string =>
  valor === null ? 'No calculable' : `${valor.toFixed(2)} %`;
const numero = (valor: number): string => valor.toLocaleString('es-MX', { maximumFractionDigits: 2 });

function metricasPorArea(area: AreaKpis, kpis: KpisSii): MetricaKpi[] {
  switch (area) {
    case 'ventas':
      return [
        { etiqueta: 'Vendido del periodo (sin IVA)', valor: formatearMoneda(kpis.ventas.vendidoMxn, 'MXN'), testid: 'kpi-vendido' },
        { etiqueta: 'Tasa de cierre', valor: porcentaje(kpis.ventas.tasaCierrePorcentaje), testid: 'kpi-tasa-cierre' },
        { etiqueta: 'Propuestas en seguimiento', valor: numero(kpis.ventas.propuestasEnSeguimiento), testid: 'kpi-seguimiento' },
      ];
    case 'produccion':
      return [
        { etiqueta: 'Horas reales', valor: numero(kpis.produccion.horasReales), testid: 'kpi-horas-reales' },
        { etiqueta: 'Horas estimadas (ruteo)', valor: numero(kpis.produccion.horasEstimadas), testid: 'kpi-horas-estimadas' },
        { etiqueta: 'Utilización de máquinas (aprox.)', valor: porcentaje(kpis.produccion.utilizacionPorcentaje), testid: 'kpi-utilizacion' },
        { etiqueta: 'WIP: órdenes en proceso (aprox.)', valor: numero(kpis.produccion.wipOrdenes), testid: 'kpi-wip' },
        { etiqueta: 'WIP a costo estimado (aprox.)', valor: formatearMoneda(kpis.produccion.wipCostoEstimadoMxn, 'MXN'), testid: 'kpi-wip-costo' },
        { etiqueta: 'Piezas producidas (final)', valor: numero(kpis.produccion.piezasProducidas), testid: 'kpi-piezas' },
      ];
    case 'calidad':
      return [
        { etiqueta: 'Retrabajos', valor: numero(kpis.calidad.retrabajos), testid: 'kpi-retrabajos' },
        { etiqueta: 'Scrap (aprox.)', valor: numero(kpis.calidad.scrap), testid: 'kpi-scrap' },
        { etiqueta: 'No conformidades', valor: numero(kpis.calidad.noConformidades), testid: 'kpi-no-conformidades' },
      ];
    case 'rentabilidad':
      return [
        { etiqueta: 'Margen estimado (revisión aceptada)', valor: porcentaje(kpis.rentabilidad.margenEstimadoPorcentaje), testid: 'kpi-margen-estimado' },
        { etiqueta: 'Margen real (AR cobrable)', valor: porcentaje(kpis.rentabilidad.margenRealPorcentaje), testid: 'kpi-margen-real' },
        { etiqueta: 'Venta neta reconocida', valor: formatearMoneda(kpis.rentabilidad.ventaNetaMxn, 'MXN'), testid: 'kpi-venta-neta' },
        { etiqueta: 'Utilidad neta', valor: formatearMoneda(kpis.rentabilidad.utilidadNetaMxn, 'MXN'), testid: 'kpi-utilidad' },
      ];
    case 'cobranza':
      return [
        { etiqueta: 'Cobros del periodo', valor: formatearMoneda(kpis.cobranza.cobrosPeriodoMxn, 'MXN'), testid: 'kpi-cobros' },
        { etiqueta: 'Vencido 0-30 días', valor: formatearMoneda(kpis.cobranza.aging.dias0a30, 'MXN'), testid: 'kpi-aging-0-30' },
        { etiqueta: 'Vencido 31-60 días', valor: formatearMoneda(kpis.cobranza.aging.dias31a60, 'MXN'), testid: 'kpi-aging-31-60' },
        { etiqueta: 'Vencido 61-90 días', valor: formatearMoneda(kpis.cobranza.aging.dias61a90, 'MXN'), testid: 'kpi-aging-61-90' },
        { etiqueta: 'Vencido 90+ días', valor: formatearMoneda(kpis.cobranza.aging.dias90mas, 'MXN'), testid: 'kpi-aging-90-mas' },
        { etiqueta: 'Promesas vigentes / cumplidas / vencidas',
          valor: `${kpis.cobranza.promesas.vigentes} / ${kpis.cobranza.promesas.cumplidas} / ${kpis.cobranza.promesas.vencidas}`,
          testid: 'kpi-promesas' },
      ];
    default:
      return [];
  }
}

/**
 * SII-B9: sección “KPIs” del dashboard con el diccionario §9.3 filtrado por
 * permiso del área (producción/calidad, ventas y finanzas) y TI aparte en las
 * fórmulas del RPC. D5-A: utilización, WIP y scrap se presentan como
 * estimaciones operativas del MVP, no como cifras contables exactas.
 */
export async function SeccionKpisSii() {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) return null;

  const [verClientes, verPipeline, verProduccion, verPlaneacion, verFinanzas, verCalidad] =
    await Promise.all([
      can(usuario, 'ver_clientes'),
      can(usuario, 'ver_pipeline_equipo'),
      can(usuario, 'gestionar_produccion'),
      can(usuario, 'ver_planeacion'),
      can(usuario, 'ver_finanzas'),
      can(usuario, 'gestionar_produccion'),
    ]);

  const areas = areasKpisVisibles({
    verVentas: verClientes || verPipeline,
    verProduccion: verProduccion || verPlaneacion,
    verCalidad,
    verFinanzas,
  });
  if (areas.length === 0) return null;

  const ahora = new Date();
  const inicio = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth(), 1));
  const fin = new Date(Date.UTC(ahora.getUTCFullYear(), ahora.getUTCMonth() + 1, 1));
  const kpis = await obtenerKpisSiiServicio(crearClienteSupabaseAdmin(), {
    inicio: inicio.toISOString(),
    fin: fin.toISOString(),
    actorId: usuario.id,
  }).catch(() => null);
  if (!kpis) return null;

  return (
    <section aria-labelledby="titulo-kpis" className="flex flex-col gap-3" data-testid="seccion-kpis">
      <div>
        <h2 id="titulo-kpis" className="text-lg font-semibold">KPIs del mes</h2>
        <p className="text-sm text-texto-secundario">
          Diccionario §9.3: vendido ≠ producido ≠ cobrado; TI aparte y sin doble conteo. Periodo del
          mes en curso.
        </p>
        <p className="text-xs text-texto-secundario">
          Utilización, WIP y scrap son estimaciones operativas del MVP con las fórmulas documentadas
          en el plan (§9.3); no son cifras contables exactas.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {areas.map((area) => (
          <article key={area} data-testid={`kpi-${area}`}
            className="rounded-lg border border-borde bg-superficie p-4">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-texto-secundario">
              {ETIQUETA_AREA_KPIS[area]}
            </h3>
            <dl className="mt-2 grid gap-1.5">
              {metricasPorArea(area, kpis).map((metrica) => (
                <div key={metrica.testid} className="flex items-baseline justify-between gap-3 text-sm">
                  <dt className="text-texto-secundario">{metrica.etiqueta}</dt>
                  <dd className="tabular-nums font-semibold" data-testid={metrica.testid}>{metrica.valor}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
