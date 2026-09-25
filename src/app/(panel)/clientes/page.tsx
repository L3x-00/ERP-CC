import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { TablaClientes } from '@/modulos/clientes/componentes/tabla-clientes';
import { SincronizadorClientesRealtime } from '@/modulos/clientes/componentes/sincronizador-clientes-realtime';

/**
 * Página de Clientes. Server Component: resuelve el usuario para saber si es
 * admin (habilita la asignación de tier manual en la ficha) y delega la lista
 * interactiva —búsqueda, filtros, paginación, ficha 360°— a `TablaClientes`.
 */
type ParametrosPaginaClientes = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PaginaClientes({ searchParams }: ParametrosPaginaClientes) {
  const parametros = searchParams ? await searchParams : {};
  const clienteInicialId = typeof parametros.cliente === 'string' ? parametros.cliente : undefined;
  const usuario = await obtenerUsuarioServidor();
  const esAdmin = usuario?.rol === 'admin';

  return (
    <div className="flex flex-col gap-4">
      <SincronizadorClientesRealtime />
      <h1 className="text-2xl font-bold">Clientes</h1>
      <TablaClientes esAdmin={esAdmin} usuarioActualId={usuario?.id} clienteInicialId={clienteInicialId} />
    </div>
  );
}
