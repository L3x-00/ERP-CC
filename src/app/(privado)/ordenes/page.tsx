import { crearOrdenAccion } from '@/modulos/ordenes/acciones/crear-orden';
import { FormularioOrden } from '@/modulos/ordenes/componentes/formulario-orden';
import { ComparativaOrdenes } from '@/modulos/ordenes/componentes/comparativa-ordenes';
import { SincronizadorOrdenesRealtime } from '@/modulos/ordenes/componentes/sincronizador-ordenes-realtime';
import { TablaOrdenes, type OrdenTabla } from '@/modulos/ordenes/componentes/tabla-ordenes';
import { obtenerOrdenesConPartidasServicio } from '@/modulos/ordenes/servicios/ordenes-servicio';
import { obtenerDatosComparativaServicio } from '@/modulos/ordenes/servicios/datos-comparativa-servicio';
import { compararOrdenes } from '@/modulos/ordenes/utilidades/comparativa-ordenes';
import { fechaKpiMexico } from '@/modulos/ordenes/utilidades/fecha-kpi';
import { resumirOrdenes } from '@/modulos/ordenes/utilidades/resumen-ordenes';
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
  const ordenInicialId = typeof parametros.ordenId === 'string' ? parametros.ordenId : undefined;
  const cliente = await crearClienteSupabaseServidor();
  const [ordenesConPartidas, resultadoClientes, resultadoMateriales, usuario] = await Promise.all([
    obtenerOrdenesConPartidasServicio(cliente),
    cliente
      .from('clientes')
      .select('id, nombre_comercial, razon_social')
      .eq('estado', 'activo')
      .order('razon_social', { ascending: true }),
    cliente.from('materiales').select('id, codigo, nombre').order('nombre', { ascending: true }),
    obtenerUsuarioServidor(),
  ]);

  if (resultadoClientes.error || resultadoMateriales.error) {
    throw new Error('No se pudieron cargar las opciones para crear la orden');
  }

  const idsOrdenes = ordenesConPartidas.map(({ orden }) => orden.id);
  const mostrarVentas = usuario ? await can(usuario, 'ver_finanzas') : false;
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
    folioCotizacionCnc: orden.folioCotizacionCnc ?? null,
    estado: orden.estado,
    prioridad: orden.prioridad,
    fechaCompromiso: orden.fechaCompromiso,
    actualizadoEn: orden.actualizadoEn,
    archivadaEn: orden.archivadaEn,
    esInterna: orden.esInterna,
    partidas: partidas.map((partida) => ({
      id: partida.id,
      codigoPieza: partida.codigoPieza,
      descripcion: partida.descripcion,
      cantidadSolicitada: partida.cantidadSolicitada,
      cantidadProducida: partida.cantidadProducida,
      cantidadScrap: partida.cantidadScrap,
      unidadMedida: partida.unidadMedida,
      tiempoEstimadoMinutos: partida.tiempoEstimadoMinutos,
      maquinaAsignada: partida.maquinaAsignada,
    })),
  }));

  const clientes = (resultadoClientes.data ?? []).map((clienteActual) => ({
    id: clienteActual.id,
    nombre: clienteActual.nombre_comercial || clienteActual.razon_social,
  }));
  const materiales = (resultadoMateriales.data ?? []).map((material) => ({
    id: material.id,
    codigo: material.codigo,
    nombre: material.nombre,
  }));

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-8">
      <SincronizadorOrdenesRealtime />
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Órdenes de producción</h1>
        <p className="text-sm text-texto-secundario">
          Planeación y seguimiento operativo de órdenes. El registro de piso se opera desde
          terminales con sesión de operador.
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

      <section className="rounded-base border border-borde p-5" aria-labelledby="titulo-crear-op">
        <h2 id="titulo-crear-op" className="mb-4 text-lg font-semibold">
          Nueva orden de producción
        </h2>
        <FormularioOrden clientes={clientes} materiales={materiales} alCrearOrden={crearOrdenAccion} />
      </section>

      <section className="flex flex-col gap-4" aria-labelledby="titulo-lista-op">
        <div>
          <h2 id="titulo-lista-op" className="text-lg font-semibold">
            Órdenes registradas
          </h2>
          <p className="text-sm text-texto-secundario">
            Selecciona una orden para conservar el contexto al abrir el control de piso.
          </p>
        </div>
        <TablaOrdenes
          ordenes={ordenes}
          ordenInicialId={ordenInicialId}
          usuarioActualId={usuario?.id}
          puedeEliminarTodos={usuario?.rol === 'admin'}
        />
      </section>
    </div>
  );
}
