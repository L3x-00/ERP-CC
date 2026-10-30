'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge } from '@/compartido/componentes/ui/badge';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Select } from '@/compartido/componentes/ui/input';
import { cn } from '@/compartido/utilidades/cn';
import {
  iniciarProcesoReclamadoAccion,
  liberarReclamoAccion,
  moverReclamoAccion,
  reclamarProcesoAccion,
} from '@/modulos/produccion/acciones/espacio-operador';
import { reanudarSesionOperadorAccion } from '@/modulos/produccion/acciones/reanudar-sesion-operador';
import { cerrarSesionOperadorAccion } from '@/modulos/produccion/acciones/cerrar-sesion-operador';
import type { MotivoPausaCatalogo } from '@/modulos/produccion/servicios/consultas-b6-servicio';
import {
  HORAS_JORNADA_OPERADOR,
  VISTAS_ESPACIO_OPERADOR,
  agruparProcesosPorArea,
  capacidadRestanteDia,
  type AreaEspacioOperador,
  type DiaCalendarioOperador,
  type ProcesoEspacioOperador,
  type ResumenEspacioOperador,
  type TipoAccionTarjeta,
  type VerificacionInicio,
  type VistaEspacioOperador,
} from '@/modulos/produccion/tipos/indice';
import { horasLegibles } from '@/modulos/produccion/utilidades/formato-operador';
import { DialogoChecklistInicio } from './dialogo-checklist-inicio';
import {
  DetalleProcesoOperador,
  type AccionesDetalleProceso,
  type ResultadoOperacion,
} from './detalle-proceso-operador';
import { VistaAreasOperador } from './vista-areas-operador';
import { VistaCalendarioOperador } from './vista-calendario-operador';
import { VistaKanbanOperador } from './vista-kanban-operador';
import { MiPanelOperador } from './mi-panel-operador';
import type { MaterialPiso } from '@/modulos/ordenes/componentes/control-piso-panel';
import type { ConsumoMaterialVisible } from '@/modulos/produccion/utilidades/consumo-material-operador';
const ETIQUETAS_VISTA: Record<VistaEspacioOperador, string> = {
  kanban: 'Kanban',
  calendario: 'Calendario',
  areas: 'Por área',
};

export interface PropsEspacioOperador {
  procesos: ProcesoEspacioOperador[];
  areas: AreaEspacioOperador[];
  resumen: ResumenEspacioOperador;
  motivosPausa: MotivoPausaCatalogo[];
  hoy: string;
  /** Semana en curso con la carga reclamada por día. */
  dias: DiaCalendarioOperador[];
  operadorId: string | null;
  soloLectura: boolean;
  nombreOperador: string;
  materiales: MaterialPiso[];
  consumos: ConsumoMaterialVisible[];
  /** Cierre de acceso al terminal, proporcionado por su contenedor. */
  onSalir?: () => void;
}

type Aviso = { tipo: 'ok' | 'error'; texto: string };

const RESUMEN = [
  { clave: 'aprobadas', etiqueta: 'Aprobadas', clase: 'text-info-texto' },
  { clave: 'enBandeja', etiqueta: 'Bandeja', clase: 'text-texto-primario' },
  { clave: 'enProceso', etiqueta: 'En proceso', clase: 'text-exito-texto' },
  { clave: 'pausadas', etiqueta: 'Pausadas', clase: 'text-advertencia-texto' },
  { clave: 'listas', etiqueta: 'Listas', clase: 'text-exito-texto' },
] as const;

/**
 * C10: espacio de operador. Reúne, en un solo tablero, las órdenes aprobadas y
 * liberadas con todo lo capturado en Propuestas/Planeación: cliente, pieza,
 * material, ruta de procesos, avances, archivos y sesiones. La reserva del día
 * y la capacidad de 8 h las valida PostgreSQL; la UI solo las refleja.
 */
export function EspacioOperador({
  procesos,
  areas,
  resumen,
  motivosPausa,
  hoy,
  dias,
  operadorId,
  soloLectura,
  nombreOperador,
  materiales,
  consumos,
}: PropsEspacioOperador) {
  const enrutador = useRouter();
  const [vista, setVista] = useState<VistaEspacioOperador>('kanban');
  const [miPanelAbierto, setMiPanelAbierto] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [soloUrgentes, setSoloUrgentes] = useState(false);
  const [areaFiltro, setAreaFiltro] = useState('');
  const [offsetSemana, setOffsetSemana] = useState(0);
  const [detalle, setDetalle] = useState<ProcesoEspacioOperador | null>(null);
  const [inicioPendiente, setInicioPendiente] = useState<ProcesoEspacioOperador | null>(null);
  const [procesando, setProcesando] = useState<string | null>(null);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const operativo = !soloLectura && operadorId !== null;

  const filtrados = useMemo(() => {
    const termino = busqueda.trim().toLowerCase();
    return procesos.filter((proceso) => {
      if (soloUrgentes && proceso.urgencia !== 'urgente' && proceso.urgencia !== 'vencida') {
        return false;
      }
      if (areaFiltro && (proceso.areaMacro ?? '') !== areaFiltro) return false;
      if (!termino) return true;
      return [
        proceso.folioOrden,
        proceso.folioSii,
        proceso.clienteNombre,
        proceso.codigoPieza,
        proceso.descripcion,
        proceso.procesoNombre,
        proceso.areaNombre,
        proceso.material?.codigo,
      ].some((valor) => (valor ?? '').toLowerCase().includes(termino));
    });
  }, [procesos, busqueda, soloUrgentes, areaFiltro]);

  const grupos = useMemo(() => agruparProcesosPorArea(filtrados, areas), [filtrados, areas]);

  const areasMacro = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const area of areas) {
      if (!area.padreCodigo) mapa.set(area.codigo, area.nombre);
    }
    return [...mapa.entries()].sort((primero, segundo) => primero[1].localeCompare(segundo[1], 'es'));
  }, [areas]);

  /** Carga del día propia; no descuenta reservas de otros operadores. */
  function cargaDelDia(fecha: string, proceso: ProcesoEspacioOperador): number {
    return procesos.reduce((total, actual) => {
      if (actual.id === proceso.id) return total;
      if (actual.reclamo?.fecha !== fecha) return total;
      if (!soloLectura && !actual.reclamadoPorMi) return total;
      return total + actual.reclamo.horasEstimadas;
    }, 0);
  }

  async function ejecutar(
    proceso: ProcesoEspacioOperador,
    accion: () => Promise<ResultadoOperacion>,
    mensajeExito: string,
  ): Promise<ResultadoOperacion> {
    setProcesando(proceso.id);
    setAviso(null);
    try {
      const resultado = await accion();
      if (resultado.exito) {
        setAviso({ tipo: 'ok', texto: mensajeExito });
        enrutador.refresh();
      } else {
        setAviso({ tipo: 'error', texto: resultado.error });
      }
      return resultado;
    } finally {
      setProcesando(null);
    }
  }

  async function reclamar(
    proceso: ProcesoEspacioOperador,
    fecha: string,
    turno: string,
  ): Promise<ResultadoOperacion> {
    if (soloLectura) return { exito: false, error: 'Vista de solo lectura' };
    return ejecutar(proceso, async () => {
      const respuesta = await reclamarProcesoAccion({
        ordenId: proceso.ordenId,
        partidaId: proceso.partidaId,
        metaProcesoId: proceso.metaProcesoId,
        fecha,
        turno,
      });
      return respuesta.exito ? { exito: true } : { exito: false, error: respuesta.error };
    }, 'Proceso reservado en tu jornada');
  }

  async function mover(
    proceso: ProcesoEspacioOperador,
    fecha: string,
    turno: string,
  ): Promise<ResultadoOperacion> {
    if (!proceso.reclamo) return reclamar(proceso, fecha, turno);
    if (soloLectura) return { exito: false, error: 'Vista de solo lectura' };
    return ejecutar(proceso, async () => {
      const respuesta = await moverReclamoAccion({
        reclamoId: proceso.reclamo!.id,
        fecha,
        turno,
      });
      return respuesta.exito ? { exito: true } : { exito: false, error: respuesta.error };
    }, 'Reserva movida al nuevo día');
  }

  async function liberar(proceso: ProcesoEspacioOperador): Promise<ResultadoOperacion> {
    if (!proceso.reclamo) return { exito: false, error: 'El proceso no tiene reserva' };
    return ejecutar(proceso, async () => {
      const respuesta = await liberarReclamoAccion({ reclamoId: proceso.reclamo!.id });
      return respuesta.exito ? { exito: true } : { exito: false, error: respuesta.error };
    }, 'Reserva liberada');
  }

  async function reanudar(proceso: ProcesoEspacioOperador): Promise<ResultadoOperacion> {
    if (!proceso.programacion) {
      return { exito: false, error: 'El proceso no tiene programación para reanudar' };
    }
    return ejecutar(proceso, async () => {
      const respuesta = await reanudarSesionOperadorAccion({
        ordenId: proceso.ordenId,
        partidaId: proceso.partidaId,
        programacionId: proceso.programacion!.id,
        actualizadoEnEsperado: proceso.programacion!.actualizadoEn,
      });
      return respuesta.exito ? { exito: true } : { exito: false, error: respuesta.error };
    }, 'Sesión reanudada y recurso reservado');
  }

  async function cerrar(
    proceso: ProcesoEspacioOperador,
    datos: {
      sesionId: string;
      piezasProducidas: number;
      estadoDestino: 'pausada' | 'finalizada';
      motivoPausa?: string;
      notas?: string;
      pinConfirmacion: string;
      consumo?: {
        materialId: string;
        cantidadUsada: number;
        cantidadScrap: number;
      };
    },
  ): Promise<ResultadoOperacion> {
    return ejecutar(proceso, async () => {
      const datosCierre = {
        sesionId: datos.sesionId,
        piezasProducidas: datos.piezasProducidas,
        estadoDestino: datos.estadoDestino,
        ...(datos.motivoPausa ? { motivoPausa: datos.motivoPausa } : {}),
        ...(datos.notas ? { notas: datos.notas } : {}),
        ...(datos.consumo ? { consumo: datos.consumo } : {}),
        pinConfirmacion: datos.pinConfirmacion,
      };

      const respuesta = await cerrarSesionOperadorAccion({
        ...datosCierre,
        ...(proceso.metaProcesoId ? { metaProcesoId: proceso.metaProcesoId } : {}),
      });
      if (!respuesta.exito) {
        return {
          exito: false,
          error: respuesta.error,
          ...(respuesta.codigo ? { codigo: respuesta.codigo } : {}),
        };
      }
      if (!respuesta.datos) {
        return { exito: false, error: 'El cierre no devolvió una confirmación' };
      }
      return { exito: true, datos: respuesta.datos };
    }, 'Sesión registrada y recurso liberado');
  }

  async function confirmarInicio(
    verificacion: VerificacionInicio,
  ): Promise<ResultadoOperacion> {
    if (!inicioPendiente?.reclamo) {
      return { exito: false, error: 'Reclama el proceso antes de iniciarlo' };
    }
    const proceso = inicioPendiente;
    return ejecutar(proceso, async () => {
      const respuesta = await iniciarProcesoReclamadoAccion({
        reclamoId: proceso.reclamo!.id,
        verificacion,
      });
      if (respuesta.exito) setDetalle(null);
      return respuesta.exito ? { exito: true } : { exito: false, error: respuesta.error };
    }, 'Sesión iniciada');
  }

  function accionRapida(proceso: ProcesoEspacioOperador, tipo: TipoAccionTarjeta): void {
    if (tipo === 'reclamar') {
      void reclamar(proceso, hoy, 'matutino');
      return;
    }
    if (tipo === 'iniciar') {
      setInicioPendiente(proceso);
      return;
    }
    if (tipo === 'reanudar') {
      void reanudar(proceso);
      return;
    }
    setDetalle(proceso);
  }

  function soltarEnDia(proceso: ProcesoEspacioOperador, fecha: string): void {
    const libre = capacidadRestanteDia(cargaDelDia(fecha, proceso));
    if (proceso.horasEstimadas > libre) {
      setAviso({
        tipo: 'error',
        texto: `Ese día solo tiene ${horasLegibles(libre)} libres y el proceso requiere ${horasLegibles(proceso.horasEstimadas)}. Elige otro día.`,
      });
      return;
    }
    void (proceso.reclamo ? mover(proceso, fecha, proceso.reclamo.turno) : reclamar(proceso, fecha, 'matutino'));
  }

  const accionesDetalle: AccionesDetalleProceso = {
    reclamar,
    mover,
    liberar,
    iniciar: (proceso) => {
      setDetalle(null);
      setInicioPendiente(proceso);
    },
    reanudar,
    cerrar,
  };

  return (
    <section className="flex flex-col gap-4" aria-label="Espacio de operador" data-testid="espacio-operador">
      <header className="flex flex-col gap-3 rounded-lg border border-borde bg-superficie p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variante="info">
              Hoy {horasLegibles(resumen.horasReclamadasHoy)} / {HORAS_JORNADA_OPERADOR} h
            </Badge>

            {resumen.urgentes > 0 ? (
              <Badge variante="peligro">
                {resumen.urgentes} urgente{resumen.urgentes === 1 ? '' : 's'}
              </Badge>
            ) : null}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7" data-testid="resumen-espacio">
          <div className="rounded-md bg-superficie-2 p-2">
            <dt className="text-xs text-texto-tenue">Total</dt>
            <dd className="text-lg font-bold tabular-nums">{resumen.total}</dd>
          </div>
          {RESUMEN.map((item) => (
            <div key={item.clave} className="rounded-md bg-superficie-2 p-2">
              <dt className="text-xs text-texto-tenue">{item.etiqueta}</dt>
              <dd className={cn('text-lg font-bold tabular-nums', item.clase)}>
                {resumen[item.clave]}
              </dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div
            className="inline-flex w-full rounded-lg border border-borde-fuerte p-1 lg:w-auto"
            role="group"
            aria-label="Vista del espacio de operador"
          >
            {VISTAS_ESPACIO_OPERADOR.map((valor) => (
              <button
                key={valor}
                type="button"
                aria-pressed={vista === valor}
                onClick={() => setVista(valor)}
                data-testid={`vista-${valor}`}
                className={cn(
                  'flex-1 rounded-md px-3 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acento/40 lg:flex-none',
                  vista === valor
                    ? 'bg-acento-hover text-white dark:bg-acento dark:text-fondo'
                    : 'text-texto-secundario hover:bg-superficie-2',
                )}
              >
                {ETIQUETAS_VISTA[valor]}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input
              className="min-h-11 sm:w-64"
              type="search"
              placeholder="Buscar folio, cliente, pieza…"
              aria-label="Buscar proceso"
              value={busqueda}
              onChange={(evento) => setBusqueda(evento.target.value)}
            />
            <Select
              className="min-h-11 sm:w-48"
              aria-label="Filtrar por área"
              value={areaFiltro}
              onChange={(evento) => setAreaFiltro(evento.target.value)}
            >
              <option value="">Todas las áreas</option>
              {areasMacro.map(([codigo, nombre]) => (
                <option key={codigo} value={codigo}>{nombre}</option>
              ))}
            </Select>
            <Button
              variante={soloUrgentes ? 'destructivo' : 'contorno'}
              tamano="lg"
              aria-pressed={soloUrgentes}
              onClick={() => setSoloUrgentes((valor) => !valor)}
              data-testid="filtro-urgentes"
            >
              Solo urgentes
            </Button>
          </div>
        </div>
      </header>

      {aviso ? (
        <p
          role={aviso.tipo === 'error' ? 'alert' : 'status'}
          className={cn(
            'rounded-md p-3 text-sm',
            aviso.tipo === 'error'
              ? 'bg-peligro-suave text-peligro-texto'
              : 'bg-exito-suave text-exito-texto',
          )}
          data-testid="aviso-espacio"
        >
          {aviso.texto}
        </p>
      ) : null}

      {filtrados.length === 0 ? (
        <p className="rounded-lg border border-borde bg-superficie p-8 text-center text-sm text-texto-secundario">
          No hay procesos que coincidan con el filtro.
        </p>
      ) : vista === 'kanban' ? (
        <VistaKanbanOperador
          procesos={filtrados}
          hoy={hoy}
          soloLectura={soloLectura}
          onAbrir={setDetalle}
        />
      ) : vista === 'calendario' ? (
        <VistaCalendarioOperador
          procesos={procesos}
          disponibles={filtrados}
          hoy={hoy}
          offsetSemana={offsetSemana}
          soloLectura={soloLectura}
          procesando={procesando !== null}
          onCambiarSemana={setOffsetSemana}
          onAbrir={setDetalle}
          onAccion={accionRapida}
          onSoltar={soltarEnDia}
        />
      ) : (
        <VistaAreasOperador
          grupos={grupos}
          hoy={hoy}
          soloLectura={soloLectura}
          onAbrir={setDetalle}
        />
      )}

      <section aria-label="Días de la semana" className="sr-only">
        <h3>Carga de la jornada</h3>
        <ul>
          {dias.map((dia) => (
            <li key={dia.fecha}>
              {dia.fecha}: {horasLegibles(dia.horasReclamadas)} de {HORAS_JORNADA_OPERADOR} h
            </li>
          ))}
        </ul>
      </section>

      {vista !== 'calendario' && operativo ? (
        <p className="text-xs text-texto-tenue">
          «Reclamar» reserva el proceso para hoy en turno matutino. Para otro día, abre la ficha y
          elige fecha y turno, o arrástralo en el calendario.
        </p>
      ) : null}

      <DetalleProcesoOperador
        key={detalle?.id ?? 'sin-detalle'}
        proceso={detalle}
        hoy={hoy}
        soloLectura={soloLectura}
        procesando={procesando !== null}
        motivosPausa={motivosPausa}
        acciones={accionesDetalle}
        materiales={materiales}
        consumos={consumos}
        onCerrar={() => setDetalle(null)}
      />

      <DialogoChecklistInicio
        abierto={inicioPendiente !== null}
        procesando={procesando !== null}
        titulo={inicioPendiente
          ? `${inicioPendiente.folioOrden} · ${inicioPendiente.codigoPieza} · ${inicioPendiente.procesoNombre}`
          : 'Inicio de proceso'}
        onAbiertoCambiar={(abierto) => {
          if (!abierto) setInicioPendiente(null);
        }}
        onConfirmar={confirmarInicio}
      />
            {operadorId !== null ? (
        <MiPanelOperador
          abierto={miPanelAbierto}
          onCerrar={() => setMiPanelAbierto(false)}
          nombreOperador={nombreOperador}
          operadorId={operadorId}
          procesos={procesos}
          hoy={hoy}
          onAbrirProceso={setDetalle}
        />
      ) : null}
    </section>
  );
}
