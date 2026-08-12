import { crearOrdenAccion } from '@/modulos/ordenes/acciones/crear-orden';
import { FormularioOrden } from '@/modulos/ordenes/componentes/formulario-orden';
import { TablaOrdenes, type OrdenTabla } from '@/modulos/ordenes/componentes/tabla-ordenes';
import { obtenerOrdenesConPartidasServicio } from '@/modulos/ordenes/servicios/ordenes-servicio';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';

/** Centro administrativo de OP; la lectura se resuelve en un Server Component. */
export default async function PaginaOrdenes() {
  const cliente = await crearClienteSupabaseServidor();
  const [ordenesConPartidas, resultadoClientes, resultadoMateriales] = await Promise.all([
    obtenerOrdenesConPartidasServicio(cliente),
    cliente
      .from('clientes')
      .select('id, nombre_comercial, razon_social')
      .eq('estado', 'activo')
      .order('razon_social', { ascending: true }),
    cliente.from('materiales').select('id, codigo, nombre').order('nombre', { ascending: true }),
  ]);

  if (resultadoClientes.error || resultadoMateriales.error) {
    throw new Error('No se pudieron cargar las opciones para crear la orden');
  }

  const ordenes: OrdenTabla[] = ordenesConPartidas.map(({ orden, partidas }) => ({
    id: orden.id,
    folio: orden.folio,
    estado: orden.estado,
    prioridad: orden.prioridad,
    fechaCompromiso: orden.fechaCompromiso,
    partidas: partidas.map((partida) => ({
      id: partida.id,
      codigoPieza: partida.codigoPieza,
      cantidadSolicitada: partida.cantidadSolicitada,
      cantidadProducida: partida.cantidadProducida,
      cantidadScrap: partida.cantidadScrap,
      unidadMedida: partida.unidadMedida,
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
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Órdenes de producción</h1>
        <p className="text-sm text-foreground/70">
          Planeación y seguimiento operativo de órdenes. El registro de piso se opera desde
          terminales con sesión de operador.
        </p>
      </header>

      <section className="rounded-base border border-foreground/10 p-5" aria-labelledby="titulo-crear-op">
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
          <p className="text-sm text-foreground/70">
            Selecciona una orden para conservar el contexto al abrir el control de piso.
          </p>
        </div>
        <TablaOrdenes ordenes={ordenes} />
      </section>
    </div>
  );
}
