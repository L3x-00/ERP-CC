'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { AyudaTooltip } from '@/compartido/componentes/ui/ayuda-tooltip';
import { Button } from '@/compartido/componentes/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/compartido/componentes/ui/dialog';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { EstadoVacio } from '@/compartido/componentes/retroalimentacion/estado-vacio';
import { formatearFecha, formatearMoneda, formatearNumero } from '@/compartido/utilidades/formatear';
import {
  claseDesviacion,
  fondoDesviacion,
  formatearCambio,
  formatearHoras,
  fraseTiempo,
  nivelDesviacion,
  porcentajeDesviacion,
} from '@/modulos/cierres/utilidades/indice';
import type {
  CierreOrdenDetalle,
  CierreOrdenResumen,
  PanelCierreAdministrativo,
  TendenciaCierre,
} from '@/modulos/cierres/tipos/indice';

import { obtenerCierreOrdenAccion, obtenerPanelCierresAccion } from '../acciones/obtener-cierres';

const CLAVE_PANEL_CIERRES = ['cierres', 'panel'] as const;
const CLAVE_CIERRE_ORDEN = ['cierres', 'orden'] as const;

type OrdenTabla = 'fecha' | 'desviacion' | 'costo' | 'margen';

/** Explicaciones que aparecen al pasar el puntero por cada cifra. */
const AYUDA = {
  costoEstimado: 'Lo que se cotizó en la propuesta aprobada: material, mano de obra y otros cargos.',
  costoReal: 'Lo que realmente se gastó: consumos registrados y tiempo trabajado en producción.',
  cambioCosto: 'Compara el gasto real con el cotizado. "Más" quiere decir que se gastó más de lo previsto.',
  ganancia: 'Parte de la venta que queda después de descontar el gasto real de la orden.',
  horasPlaneadas: 'Horas por operación que se cotizaron en la propuesta aprobada.',
  horasReales: 'Horas que el operador registró en las sesiones de producción.',
  cambioTiempo: 'Compara las horas trabajadas con las horas planeadas.',
  entregado: 'Piezas entregadas al cliente frente a las piezas que pidió.',
  retrabajo: 'Tiempo y costo extra para corregir piezas que no salieron bien a la primera.',
  manoObra: 'Horas trabajadas multiplicadas por la tarifa por hora de la propuesta.',
  material: 'Consumos reales de material multiplicados por su costo vigente.',
  otros: 'Cargos distintos a material y mano de obra que se incluyeron en la cotización.',
} as const;

function moneda(valor: number): string {
  return formatearMoneda(valor, 'MXN');
}

function horas(valor: number): string {
  return formatearHoras(valor);
}

function ganancia(valor: number | null): string {
  if (valor === null || !Number.isFinite(valor)) return 'Sin dato';
  return `${formatearNumero(Math.abs(valor), 1).replace('.', ',')} % ${valor >= 0 ? 'de ganancia' : 'de pérdida'}`;
}

/** C14: panel de cierre administrativo con dashboard y tabla interactiva. */
export function PanelCierreAdministrativo() {
  const consulta = useQuery({
    queryKey: CLAVE_PANEL_CIERRES,
    queryFn: async (): Promise<PanelCierreAdministrativo> => {
      const respuesta = await obtenerPanelCierresAccion();
      if (!respuesta.exito || !respuesta.datos) {
        throw new Error(respuesta.exito ? 'La consulta no devolvió datos' : respuesta.error);
      }
      return respuesta.datos;
    },
  });
  const [cliente, setCliente] = useState('');
  const [nivel, setNivel] = useState<'todos' | 'ahorro' | 'neutro' | 'sobrecosto'>('todos');
  const [ordenTabla, setOrdenTabla] = useState<OrdenTabla>('fecha');
  const [ordenAscendente, setOrdenAscendente] = useState(false);
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<string | null>(null);

  const panel = consulta.data;
  const resumenes = useMemo(() => {
    if (!panel) return [];
    const filtrados = panel.resumenes.filter((resumen) => {
      const coincideCliente = cliente.trim().length === 0
        || resumen.cliente.toLowerCase().includes(cliente.trim().toLowerCase())
        || resumen.folio.toLowerCase().includes(cliente.trim().toLowerCase());
      const coincideNivel = nivel === 'todos' || resumen.nivel === nivel;
      return coincideCliente && coincideNivel;
    });
    const factor = ordenAscendente ? 1 : -1;
    return [...filtrados].sort((primero, segundo) => {
      if (ordenTabla === 'desviacion') {
        return ((primero.desviacionCosto ?? 0) - (segundo.desviacionCosto ?? 0)) * factor;
      }
      if (ordenTabla === 'costo') return (primero.costoReal - segundo.costoReal) * factor;
      if (ordenTabla === 'margen') return ((primero.margen ?? 0) - (segundo.margen ?? 0)) * factor;
      return ((primero.fechaCierre ?? '').localeCompare(segundo.fechaCierre ?? '')) * factor;
    });
  }, [panel, cliente, nivel, ordenTabla, ordenAscendente]);

  function alternarOrden(columna: OrdenTabla): void {
    if (ordenTabla === columna) {
      setOrdenAscendente((valor) => !valor);
      return;
    }
    setOrdenTabla(columna);
    setOrdenAscendente(false);
  }

  if (consulta.isPending) {
    return (
      <div className="flex flex-col gap-3" data-testid="cierre-administrativo-cargando">
        <p className="text-sm text-texto-secundario" role="status">Cargando cierre administrativo…</p>
      </div>
    );
  }

  if (consulta.isError) {
    return (
      <section className="rounded-lg border border-borde bg-superficie p-6">
        <h1 className="text-lg font-semibold text-texto-primario">Cierre administrativo</h1>
        <p role="alert" className="mt-2 text-sm text-peligro-texto">
          No se pudo cargar el cierre administrativo. Vuelve a intentarlo.
        </p>
        <Button type="button" className="mt-3" onClick={() => void consulta.refetch()}>
          Reintentar
        </Button>
      </section>
    );
  }

  if (!panel || panel.resumenes.length === 0) {
    return (
      <section className="rounded-lg border border-borde bg-superficie p-6" data-testid="cierre-administrativo">
        <h1 className="text-lg font-semibold text-texto-primario">Cierre administrativo</h1>
        <p className="mt-1 text-sm text-texto-secundario">
          Compara lo cotizado en la propuesta contra lo que realmente costó producir.
        </p>
        <EstadoVacio
          titulo="Aún no hay órdenes terminadas"
          descripcion="Cuando una orden termine producción aparecerá aquí con su comparativo de costo, tiempo y material."
        />
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-6" data-testid="cierre-administrativo">
      <header>
        <h1 className="text-xl font-semibold text-texto-primario">Cierre administrativo</h1>
        <p className="mt-1 text-sm text-texto-secundario">
          Lo cotizado en la propuesta contra lo que realmente costó producir. Órdenes terminadas.
        </p>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <TarjetaKpi
          etiqueta="Costo: diferencia con lo previsto"
          valor={formatearCambio(panel.promedios.desviacionCosto)}
          nivel={nivelDesviacion(panel.promedios.desviacionCosto)}
          ayuda="Promedio de las últimas 20 órdenes: compara lo que se gastó con lo que se cotizó."
        />
        <TarjetaKpi
          etiqueta="Tiempo: diferencia con lo previsto"
          valor={formatearCambio(panel.promedios.desviacionTiempo)}
          nivel={nivelDesviacion(panel.promedios.desviacionTiempo)}
          ayuda="Promedio de las últimas 20 órdenes: compara las horas trabajadas con las horas planeadas."
        />
        <TarjetaKpi
          etiqueta="Ganancia sobre la venta"
          valor={ganancia(panel.promedios.margen)}
          nivel={panel.promedios.margen !== null && panel.promedios.margen < 10 ? 'sobrecosto' : 'ahorro'}
          ayuda="Lo que queda de cada peso vendido después de pagar el costo real de la orden."
        />
        <TarjetaKpi
          etiqueta="Órdenes que costaron más"
          valor={`${panel.promedios.ordenesConSobrecosto} de ${panel.promedios.totalOrdenes}`}
          nivel={panel.promedios.ordenesConSobrecosto > 0 ? 'neutro' : 'ahorro'}
          ayuda="Órdenes cuyo gasto superó la cotización en más del 10 por ciento."
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <GraficoTendencia tendencia={panel.tendencia} />
        <GraficoDispersion resumenes={panel.resumenes} />
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-56 flex-col gap-1 text-sm text-texto-secundario">
          Buscar orden o cliente
          <Input
            value={cliente}
            onChange={(evento) => setCliente(evento.target.value)}
            placeholder="Folio o cliente"
            data-testid="cierres-buscar"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-texto-secundario">
          Semáforo
          <Select
            value={nivel}
            onChange={(evento) => setNivel(evento.target.value as typeof nivel)}
            data-testid="cierres-nivel"
          >
            <option value="todos">Todos</option>
            <option value="ahorro">Ahorro (verde)</option>
            <option value="neutro">En rango (ámbar)</option>
            <option value="sobrecosto">Sobrecosto (rojo)</option>
          </Select>
        </label>
        <p className="ml-auto text-xs text-texto-secundario">
          {resumenes.length} de {panel.resumenes.length} órdenes
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-borde bg-superficie">
        <table className="w-full min-w-[980px] border-collapse text-sm" data-testid="tabla-cierres">
          <thead>
            <tr className="bg-superficie-2 text-left text-xs uppercase tracking-wide text-texto-tenue">
              <th className="px-3 py-2 font-medium">Orden / cliente</th>
              <th className="px-3 py-2 text-right font-medium">Costo estimado</th>
              <th className="px-3 py-2 text-right font-medium">
                <BotonOrden etiqueta="Costo real" activo={ordenTabla === 'costo'} ascendente={ordenAscendente} onClick={() => alternarOrden('costo')} />
              </th>
              <th className="px-3 py-2 text-right font-medium">
                <BotonOrden etiqueta="Cambio en costo" activo={ordenTabla === 'desviacion'} ascendente={ordenAscendente} onClick={() => alternarOrden('desviacion')} />
              </th>
              <th className="px-3 py-2 text-right font-medium">Horas planeadas y reales</th>
              <th className="px-3 py-2 text-right font-medium">Cambio en tiempo</th>
              <th className="px-3 py-2 text-right font-medium">
                <BotonOrden etiqueta="Ganancia" activo={ordenTabla === 'margen'} ascendente={ordenAscendente} onClick={() => alternarOrden('margen')} />
              </th>
              <th className="px-3 py-2 text-right font-medium">Entrega</th>
            </tr>
          </thead>
          <tbody>
            {resumenes.map((resumen) => (
              <FilaCierre
                key={resumen.ordenId}
                resumen={resumen}
                onAbrir={() => setOrdenSeleccionada(resumen.ordenId)}
              />
            ))}
            {resumenes.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-sm text-texto-secundario">
                  Ninguna orden coincide con el filtro.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <DetalleCierreDialog
        ordenId={ordenSeleccionada}
        onCerrar={() => setOrdenSeleccionada(null)}
      />
    </section>
  );
}

function TarjetaKpi({
  etiqueta,
  valor,
  nivel,
  ayuda,
}: {
  etiqueta: string;
  valor: string;
  nivel: ReturnType<typeof nivelDesviacion>;
  ayuda: string;
}) {
  return (
    <article className="rounded-lg border border-borde bg-superficie p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-texto-tenue">{etiqueta}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums ${claseDesviacion(nivel)}`}>
        <AyudaTooltip texto={ayuda}>{valor}</AyudaTooltip>
      </p>
      <p className="mt-1 text-xs text-texto-secundario">{ayuda}</p>
    </article>
  );
}

function BotonOrden({
  etiqueta,
  activo,
  ascendente,
  onClick,
}: {
  etiqueta: string;
  activo: boolean;
  ascendente: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 font-medium hover:text-texto-primario focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40"
      aria-label={`Ordenar por ${etiqueta}${activo ? (ascendente ? ', de menor a mayor' : ', de mayor a menor') : ''}`}
    >
      {etiqueta}
      {activo ? (
        <span className="text-xs font-normal text-texto-secundario">
          {ascendente ? 'de menor a mayor' : 'de mayor a menor'}
        </span>
      ) : null}
    </button>
  );
}

function FilaCierre({ resumen, onAbrir }: { resumen: CierreOrdenResumen; onAbrir: () => void }) {
  return (
    <tr
      className="cursor-pointer border-t border-borde transition-colors hover:bg-superficie-2 focus-within:bg-superficie-2"
      onClick={onAbrir}
      data-testid={`cierre-fila-${resumen.folio}`}
    >
      <td className="px-3 py-2">
        <button
          type="button"
          className="text-left font-medium text-texto-primario underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40"
          onClick={(evento) => {
            evento.stopPropagation();
            onAbrir();
          }}
        >
          {resumen.folio}
          {resumen.esInterna ? ' · TI' : ''}
        </button>
        <span className="block text-xs text-texto-secundario">{resumen.cliente}</span>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        <AyudaTooltip texto={AYUDA.costoEstimado}>{moneda(resumen.costoEstimado)}</AyudaTooltip>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        <AyudaTooltip texto={AYUDA.costoReal}>{moneda(resumen.costoReal)}</AyudaTooltip>
      </td>
      <td className="px-3 py-2 text-right">
        <AyudaTooltip texto={AYUDA.cambioCosto}>
          <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${fondoDesviacion(resumen.nivel)} ${claseDesviacion(resumen.nivel)}`}>
            {formatearCambio(resumen.desviacionCosto)}
          </span>
        </AyudaTooltip>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        <AyudaTooltip texto={`${AYUDA.horasPlaneadas} ${AYUDA.horasReales}`}>
          {horas(resumen.horasEstimadas)} y {horas(resumen.horasReales)}
        </AyudaTooltip>
      </td>
      <td className={`px-3 py-2 text-right tabular-nums ${claseDesviacion(nivelDesviacion(resumen.desviacionTiempo))}`}>
        <AyudaTooltip texto={AYUDA.cambioTiempo}>{formatearCambio(resumen.desviacionTiempo)}</AyudaTooltip>
      </td>
      <td className={`px-3 py-2 text-right tabular-nums ${resumen.margen !== null && resumen.margen < 0 ? 'text-peligro-texto' : 'text-texto-primario'}`}>
        <AyudaTooltip texto={AYUDA.ganancia}>{ganancia(resumen.margen)}</AyudaTooltip>
      </td>
      <td className="px-3 py-2 text-right tabular-nums">
        <AyudaTooltip texto={AYUDA.entregado}>
          {resumen.cumplimientoEntrega === null
            ? 'Sin dato'
            : `${formatearNumero(resumen.entregado, 0)} de ${formatearNumero(resumen.solicitado, 0)}`}
        </AyudaTooltip>
      </td>
    </tr>
  );
}

function GraficoTendencia({ tendencia }: { tendencia: readonly TendenciaCierre[] }) {
  const valores = tendencia.map((punto) => punto.desviacionCosto).filter((valor): valor is number => valor !== null);
  if (valores.length < 2) {
    return (
      <article className="rounded-lg border border-borde bg-superficie p-4">
        <h2 className="text-sm font-semibold text-texto-primario">Cómo se comportó el costo</h2>
        <p className="mt-3 text-sm text-texto-secundario">
          Necesitas al menos dos órdenes cerradas con costo estimado para ver la tendencia.
        </p>
      </article>
    );
  }
  const ancho = 640;
  const alto = 220;
  const margen = 24;
  const limInf = -50;
  const limSup = 50;
  const limitar = (valor: number): number => Math.max(limInf, Math.min(limSup, valor));
  const x = (indice: number): number => margen + (indice / Math.max(valores.length - 1, 1)) * (ancho - margen * 2);
  const y = (valor: number): number => alto - margen - ((limitar(valor) - limInf) / (limSup - limInf)) * (alto - margen * 2);
  const puntos = valores.map((valor, indice) => `${x(indice)},${y(valor)}`).join(' ');
  const bandaSuperior = y(-10);
  const bandaInferior = y(10);
  const lineaCero = y(0);
  return (
    <article className="rounded-lg border border-borde bg-superficie p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-texto-primario">Cómo se comportó el costo</h2>
        <span className="text-xs text-texto-secundario">En la zona clara, el gasto salió como se planeó</span>
      </div>
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="mt-3 h-auto w-full" role="img" aria-label="Diferencia entre el gasto real y el cotizado en cada orden">
        <rect x={margen} y={bandaSuperior} width={ancho - margen * 2} height={Math.max(bandaInferior - bandaSuperior, 0)} fill="currentColor" className="text-advertencia-suave" />
        <line x1={margen} x2={ancho - margen} y1={lineaCero} y2={lineaCero} stroke="currentColor" strokeDasharray="4 4" className="text-borde-fuerte" />
        <polyline
          points={puntos}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="text-acento transition-all duration-500"
        />
        {valores.map((valor, indice) => (
          <circle
            key={`${indice}-${valor}`}
            cx={x(indice)}
            cy={y(valor)}
            r="3.5"
            className={valor > 10 ? 'fill-peligro' : valor < -10 ? 'fill-exito' : 'fill-advertencia'}
          />
        ))}
      </svg>
      <p className="mt-1 text-xs text-texto-secundario">
        Cada punto es una orden terminada. Por encima de la franja costó más de lo previsto; por debajo, costó menos.
      </p>
    </article>
  );
}

function GraficoDispersion({ resumenes }: { resumenes: readonly CierreOrdenResumen[] }) {
  const puntos = resumenes.filter((resumen) => resumen.costoEstimado > 0 || resumen.costoReal > 0);
  if (puntos.length === 0) {
    return (
      <article className="rounded-lg border border-borde bg-superficie p-4">
        <h2 className="text-sm font-semibold text-texto-primario">Lo cotizado contra lo gastado</h2>
        <p className="mt-3 text-sm text-texto-secundario">Todavía no hay costos para mostrar.</p>
      </article>
    );
  }
  const maximo = Math.max(...puntos.map((punto) => Math.max(punto.costoEstimado, punto.costoReal)), 1);
  const ancho = 360;
  const alto = 220;
  const margen = 28;
  const escala = (valor: number): number => margen + (valor / maximo) * (ancho - margen * 2);
  const escalaY = (valor: number): number => alto - margen - (valor / maximo) * (alto - margen * 2);
  return (
    <article className="rounded-lg border border-borde bg-superficie p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-texto-primario">Lo cotizado contra lo gastado</h2>
        <span className="text-xs text-texto-secundario">Sobre la línea, el gasto coincide con la cotización</span>
      </div>
      <svg viewBox={`0 0 ${ancho} ${alto}`} className="mt-3 h-auto w-full" role="img" aria-label="Dispersión de costo estimado contra costo real">
        <line x1={escala(0)} y1={escalaY(0)} x2={escala(maximo)} y2={escalaY(maximo)} stroke="currentColor" strokeDasharray="4 4" className="text-borde-fuerte" />
        {puntos.map((punto) => (
          <circle
            key={punto.ordenId}
            cx={escala(punto.costoEstimado)}
            cy={escalaY(punto.costoReal)}
            r="5"
            className={punto.nivel === 'sobrecosto' ? 'fill-peligro' : punto.nivel === 'ahorro' ? 'fill-exito' : 'fill-advertencia'}
          >
            <title>{`${punto.folio}: estimado ${moneda(punto.costoEstimado)}, real ${moneda(punto.costoReal)}`}</title>
          </circle>
        ))}
      </svg>
      <p className="mt-1 text-xs text-texto-secundario">
        Cada punto es una orden. Si queda por encima de la línea, costó más de lo cotizado.
      </p>
    </article>
  );
}

function DetalleCierreDialog({
  ordenId,
  onCerrar,
}: {
  ordenId: string | null;
  onCerrar: () => void;
}) {
  const consulta = useQuery({
    queryKey: [...CLAVE_CIERRE_ORDEN, ordenId ?? 'sin-orden'],
    queryFn: async (): Promise<CierreOrdenDetalle> => {
      if (!ordenId) throw new Error('Sin orden');
      const respuesta = await obtenerCierreOrdenAccion({ ordenId });
      if (!respuesta.exito || !respuesta.datos) {
        throw new Error(respuesta.exito ? 'La consulta no devolvió datos' : respuesta.error);
      }
      return respuesta.datos;
    },
    enabled: ordenId !== null,
  });
  const detalle = consulta.data;

  return (
    <Dialog open={ordenId !== null} onOpenChange={(abierto) => { if (!abierto) onCerrar(); }}>
      <DialogContent
        className="flex max-h-[92vh] w-[calc(100vw-1rem)] max-w-4xl flex-col gap-4 overflow-y-auto"
        data-testid="detalle-cierre-administrativo"
        aria-label="Cierre administrativo de la orden"
      >
        <DialogHeader>
          <DialogTitle>
            {detalle ? `Cierre ${detalle.folio}` : 'Cierre administrativo'}
          </DialogTitle>
          <DialogDescription>
            {detalle
              ? `${detalle.cliente} · ${detalle.fechaCierre ? formatearFecha(detalle.fechaCierre) : 'sin fecha'}`
              : 'Cargando comparativo…'}
          </DialogDescription>
        </DialogHeader>

        {consulta.isError ? (
          <p role="alert" className="text-sm text-peligro-texto">
            No se pudo cargar el cierre de la orden.
          </p>
        ) : null}

        {detalle ? (
          <>
            <div className={`grid gap-3 rounded-lg p-3 sm:grid-cols-4 ${fondoDesviacion(detalle.nivel)}`}>
              <Dato etiqueta="Costo cotizado" valor={moneda(detalle.costoEstimado)} ayuda={AYUDA.costoEstimado} />
              <Dato etiqueta="Costo gastado" valor={moneda(detalle.costoReal)} ayuda={AYUDA.costoReal} />
              <Dato
                etiqueta="Diferencia de costo"
                valor={formatearCambio(detalle.desviacionCosto)}
                clase={claseDesviacion(detalle.nivel)}
                ayuda={AYUDA.cambioCosto}
              />
              <Dato etiqueta="Ganancia" valor={ganancia(detalle.margen)} ayuda={AYUDA.ganancia} />
              <Dato etiqueta="Horas planeadas" valor={horas(detalle.horasEstimadas)} ayuda={AYUDA.horasPlaneadas} />
              <Dato etiqueta="Horas trabajadas" valor={horas(detalle.horasReales)} ayuda={AYUDA.horasReales} />
              <Dato
                etiqueta="Piezas entregadas"
                valor={`${formatearNumero(detalle.entregado, 0)} de ${formatearNumero(detalle.solicitado, 0)}`}
                ayuda={AYUDA.entregado}
              />
              <Dato
                etiqueta="Retrabajo"
                valor={`${horas(detalle.horasRetrabajo)} y ${moneda(detalle.costoRetrabajo)}`}
                ayuda={AYUDA.retrabajo}
              />
            </div>

            <p className="rounded-md border border-borde bg-superficie-2 p-3 text-sm text-texto-primario">
              {fraseTiempo(detalle.horasEstimadas, detalle.horasReales)}
            </p>

            <section>
              <h3 className="text-sm font-semibold text-texto-primario">Por ítem</h3>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="bg-superficie-2 text-left text-xs uppercase tracking-wide text-texto-tenue">
                      <th className="px-2 py-1.5 font-medium">Ítem</th>
                      <th className="px-2 py-1.5 text-right font-medium">Cantidad pedida</th>
                      <th className="px-2 py-1.5 text-right font-medium">Producido</th>
                      <th className="px-2 py-1.5 text-right font-medium">Entregado</th>
                      <th className="px-2 py-1.5 text-right font-medium">Horas planeadas y reales</th>
                      <th className="px-2 py-1.5 text-right font-medium">Costo cotizado y gastado</th>
                      <th className="px-2 py-1.5 text-right font-medium">Diferencia</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.items.map((item) => (
                      <tr key={item.codigo} className="border-t border-borde">
                        <td className="px-2 py-1.5">
                          <span className="font-medium text-texto-primario">{item.codigo}</span>
                          <span className="block max-w-56 truncate text-xs text-texto-secundario" title={item.descripcion}>
                            {item.descripcion}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatearNumero(item.cantidad, 2)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatearNumero(item.producida, 2)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{formatearNumero(item.entregada, 2)}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          <AyudaTooltip texto={`${AYUDA.horasPlaneadas} ${AYUDA.horasReales}`}>
                            {horas(item.horasEstimadas)} y {horas(item.horasReales)}
                          </AyudaTooltip>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          <AyudaTooltip texto={`${AYUDA.costoEstimado} ${AYUDA.costoReal}`}>
                            {moneda(item.costoEstimado)} y {moneda(item.costoReal)}
                          </AyudaTooltip>
                        </td>
                        <td className={`px-2 py-1.5 text-right tabular-nums ${claseDesviacion(nivelDesviacion(item.desviacionCosto))}`}>
                          <AyudaTooltip texto={AYUDA.cambioCosto}>
                            {formatearCambio(item.desviacionCosto)}
                          </AyudaTooltip>
                        </td>
                      </tr>
                    ))}
                    {detalle.items.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-2 py-3 text-center text-xs text-texto-secundario">
                          La orden no tiene ítems de propuesta congelados; se comparan los totales.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </section>

            {detalle.procesos.length > 0 ? (
              <section>
                <h3 className="text-sm font-semibold text-texto-primario">Por proceso</h3>
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {detalle.procesos.map((proceso) => (
                    <li key={proceso.nombre} className="flex flex-wrap items-center justify-between gap-2 rounded-md bg-superficie-2 px-3 py-1.5">
                      <span className="text-texto-primario">{proceso.nombre}</span>
                      <AyudaTooltip texto={`${AYUDA.horasPlaneadas} ${AYUDA.horasReales}. El cambio compara ambas cifras.`}>
                        <span className="tabular-nums text-texto-secundario">
                          {horas(proceso.horasEstimadas)} planeadas y {horas(proceso.horasReales)} trabajadas
                          {' · '}
                          <span className={claseDesviacion(nivelDesviacion(proceso.desviacionTiempo))}>
                            {formatearCambio(proceso.desviacionTiempo)}
                          </span>
                        </span>
                      </AyudaTooltip>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-borde p-3">
                <h3 className="text-sm font-semibold text-texto-primario">Costo</h3>
                <dl className="mt-2 grid gap-1 text-sm">
                  <Linea etiqueta="Mano de obra" estimado={detalle.costoManoObraEstimado} real={detalle.costoManoObraReal} ayuda={AYUDA.manoObra} />
                  <Linea etiqueta="Material" estimado={detalle.costoMaterialEstimado} real={detalle.costoMaterialReal} ayuda={AYUDA.material} />
                  <Linea etiqueta="Otros" estimado={detalle.costoOtros} real={0} ayuda={AYUDA.otros} />
                </dl>
              </div>
              <div className="rounded-md border border-borde p-3">
                <h3 className="text-sm font-semibold text-texto-primario">Material real</h3>
                {detalle.materiales.length === 0 ? (
                  <p className="mt-2 text-xs text-texto-secundario">Sin consumos registrados.</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1 text-sm">
                    {detalle.materiales.map((material) => (
                      <li key={material.clave} className="flex items-center justify-between gap-2">
                        <span className="truncate text-texto-secundario" title={material.nombre}>{material.nombre}</span>
                        <AyudaTooltip texto="Cantidad consumida en producción y su costo con el precio vigente al consumirlo.">
                          <span className="shrink-0 tabular-nums text-texto-primario">
                            {formatearNumero(material.cantidadReal, 3)}
                            {material.unidad ? ` ${material.unidad}` : ''} y {moneda(material.costoReal)}
                          </span>
                        </AyudaTooltip>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </section>

            {detalle.puntosCriticos.length > 0 ? (
              <section className="rounded-md border border-advertencia/40 bg-advertencia-suave p-3">
                <h3 className="text-sm font-semibold text-advertencia-texto">Puntos críticos</h3>
                <ul className="mt-1 list-disc pl-5 text-sm text-texto-secundario">
                  {detalle.puntosCriticos.map((punto) => (
                    <li key={punto}>{punto}</li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}

        <DialogFooter>
          <Button type="button" onClick={onCerrar}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Dato({
  etiqueta,
  valor,
  clase,
  ayuda,
}: {
  etiqueta: string;
  valor: string;
  clase?: string;
  ayuda: string;
}) {
  return (
    <div>
      <dt className="text-xs uppercase tracking-wide text-texto-tenue">{etiqueta}</dt>
      <dd className={`mt-0.5 font-semibold tabular-nums ${clase ?? 'text-texto-primario'}`}>
        <AyudaTooltip texto={ayuda}>{valor}</AyudaTooltip>
      </dd>
    </div>
  );
}

function Linea({
  etiqueta,
  estimado,
  real,
  ayuda,
}: {
  etiqueta: string;
  estimado: number;
  real: number;
  ayuda: string;
}) {
  const desviacion = porcentajeDesviacion(real, estimado);
  return (
    <div className="flex items-center justify-between gap-2">
      <dt className="text-texto-secundario">{etiqueta}</dt>
      <dd className={`tabular-nums ${claseDesviacion(nivelDesviacion(desviacion))}`}>
        <AyudaTooltip texto={ayuda}>
          {moneda(estimado)} cotizados y {moneda(real)} gastados
          {desviacion === null ? '' : ` · ${formatearCambio(desviacion)}`}
        </AyudaTooltip>
      </dd>
    </div>
  );
}
