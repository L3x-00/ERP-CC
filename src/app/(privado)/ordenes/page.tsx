import { notFound, redirect } from 'next/navigation';

import { PanelOrdenInterna } from '@/modulos/ordenes/componentes/panel-orden-interna';
import { ComparativaOrdenes } from '@/modulos/ordenes/componentes/comparativa-ordenes';
import { SincronizadorOrdenesRealtime } from '@/modulos/ordenes/componentes/sincronizador-ordenes-realtime';
import { TablaOrdenes, type OrdenTabla } from '@/modulos/ordenes/componentes/tabla-ordenes';
import { obtenerOrdenesConPartidasServicio } from '@/modulos/ordenes/servicios/ordenes-servicio';
import { obtenerDatosComparativaServicio } from '@/modulos/ordenes/servicios/datos-comparativa-servicio';
import { compararOrdenes } from '@/modulos/ordenes/utilidades/comparativa-ordenes';
import { fechaKpiMexico } from '@/modulos/ordenes/utilidades/fecha-kpi';
import { resumirOrdenes } from '@/modulos/ordenes/utilidades/resumen-ordenes';
import { esquemaIdOrdenEnlace } from '@/modulos/ordenes/validaciones/ficha-orden';
import { obtenerCatalogosRfqAccion } from '@/modulos/rfq/acciones/obtener-catalogos';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';

type ParametrosPaginaOrdenes = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/** Centro administrativo de OP; la lectura se resuelve en un Server Component. */
export default async function PaginaOrdenes({ searchParams }: ParametrosPaginaOrdenes) {
  const parametros = searchParams ? await searchParams : {};
  const usuario = await obtenerUsuarioServidor();
  if (!usuario || !(await can(usuario, 'orden_vista'))) notFound();

  // Enlaces profundos antiguos (correo de menciones, bitácora, historial, Planeación):
  // van DESPUÉS de orden_vista para que quien no puede ver órdenes reciba 404 y no
  // un 307 que delate qué ids existen.
  const idEnlazado = esquemaIdOrdenEnlace.safeParse(parametros.ordenId);
  if (idEnlazado.success) redirect(`/ordenes/${idEnlazado.data}?pestana=comentarios`);

  const [mostrarVentas, puedeAdministrar, puedeCrearInterna, puedeLiberar] = await Promise.all([
    can(usuario, 'ver_finanzas'),
    can(usuario, 'aprobar_ordenes'),
    can(usuario, 'orden_crear_interna'),
    can(usuario, 'orden_liberar'),
  ]);
  const cliente = await crearClienteSupabaseServidor();
  const puedeVerAltas = puedeAdministrar || puedeCrearInterna;
  const [ordenesConPartidas, resultadoAreas, catalogosRfq] = await Promise.all([
    obtenerOrdenesConPartidasServicio(cliente),
    puedeVerAltas
      ? cliente
        .from('areas_trabajo_config')
        .select('codigo, nombre')
        .eq('activo', true)
        .order('orden', { ascending: true })
        .order('nombre', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    puedeCrearInterna ? obtenerCatalogosRfqAccion() : Promise.resolve(null),
  ]);

  if (resultadoAreas.error) {
    throw new Error('No se pudieron cargar las áreas para el alta interna');
  }

  const idsOrdenes = ordenesConPartidas.map(({ orden }) => orden.id);
  const datosComparativa = await obtenerDatosComparativaServicio(
    crearClienteSupabaseAdmin(), idsOrdenes, mostrarVentas,
  );
  const hoy = fechaKpiMexico(new Date().toISOString());
  const resumen = resumirOrdenes(ordenesConPartidas,
    new Set(datosComparativa.entregas.map((nota) => nota.orden_id)), hoy);
  const comparativa = compararOrdenes(ordenesConPartidas,
    datosComparativa.sesiones, datosComparativa.entregas, datosComparativa.cuentas);

  const ordenes: OrdenTabla[] = ordenesConPartidas.map(({ orden, partidas }) => ({
    id: orden.id,
    folio: orden.folio,
    folioSii: orden.folioSii,
    folioCotizacionCnc: orden.folioCotizacionCnc ?? null,
    estado: orden.estado,
    estadoSii: orden.estadoSii,
    prioridad: orden.prioridad,
    fechaCompromiso: orden.fechaCompromiso,
    fechaCompromisoComercial: orden.fechaCompromisoComercial ?? null,
    fechaOperativa: orden.fechaOperativa,
    actualizadoEn: orden.actualizadoEn,
    archivadaEn: orden.archivadaEn,
    esInterna: orden.esInterna,
    idHistorico: orden.idHistorico,
    partidas: partidas.map((partida) => ({
      id: partida.id,
      codigoPieza: partida.codigoPieza,
      descripcion: partida.descripcion,
      cantidadSolicitada: partida.cantidadSolicitada,
      cantidadProducida: partida.cantidadProducida,
      cantidadScrap: partida.cantidadScrap,
      cantidadEntregada: datosComparativa.entregadaPorPartida[partida.id] ?? 0,
      unidadMedida: partida.unidadMedida,
      tiempoEstimadoMinutos: partida.tiempoEstimadoMinutos,
      maquinaAsignada: partida.maquinaAsignada,
      metasProceso: partida.metasProceso ?? [],
    })),
  }));

  const areas = (resultadoAreas.data ?? []).map((area) => ({
    codigo: area.codigo,
    nombre: area.nombre,
  }));

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8">
      <SincronizadorOrdenesRealtime />
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Órdenes de producción</h1>
        <p className="text-sm text-texto-secundario">
          Las órdenes nacen al aceptar una propuesta y se siguen aquí por estado y proceso. El
          trabajo interno se registra con «Nueva orden interna» (no cobrable).
        </p>
      </header>

      <section aria-label="Resumen operativo de órdenes" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ['Órdenes no canceladas', resumen.total],
          ['En proceso', resumen.enProceso],
          ['Atrasadas sin entrega final', resumen.atrasadas],
          ['Entregadas', resumen.entregadas],
          ['TI creadas este mes', resumen.tiMes],
          ['TI en proceso', resumen.tiEnProceso],
          ['Horas acumuladas en TI', resumen.tiHorasAcumuladas.toFixed(2)],
        ].map(([titulo, valor]) => (
          <div key={titulo} className="rounded-base border border-borde bg-superficie p-4">
            <p className="text-sm text-texto-secundario">{titulo}</p>
            <p className="text-xl font-semibold tabular-nums">{valor}</p>
          </div>
        ))}
      </section>

      <ComparativaOrdenes filas={comparativa} mostrarVentas={mostrarVentas} />

      {puedeCrearInterna ? (
        <PanelOrdenInterna
          catalogos={catalogosRfq?.exito ? (catalogosRfq.datos ?? null) : null}
          areas={areas}
        />
      ) : null}

      <section className="flex flex-col gap-4" aria-labelledby="titulo-lista-op">
        <div>
          <h2 id="titulo-lista-op" className="text-lg font-semibold">
            Órdenes registradas
          </h2>
          <p className="text-sm text-texto-secundario">
            Consulta el detalle, los comentarios y el seguimiento operativo de cada orden.
          </p>
        </div>
        <TablaOrdenes ordenes={ordenes} puedeLiberar={puedeLiberar} />
      </section>
    </div>
  );
}
