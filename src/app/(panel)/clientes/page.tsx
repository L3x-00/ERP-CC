import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { TablaClientes } from '@/modulos/clientes/componentes/tabla-clientes';
import { SincronizadorClientesRealtime } from '@/modulos/clientes/componentes/sincronizador-clientes-realtime';

/**
 * Página de Clientes. Server Component: resuelve el usuario y sus permisos
 * (editar / comercial / finanzas) para habilitar las acciones de la lista y de
 * la ficha; delega la lista interactiva a `TablaClientes`.
 */
type ParametrosPaginaClientes = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PaginaClientes({ searchParams }: ParametrosPaginaClientes) {
  const parametros = searchParams ? await searchParams : {};
  const clienteInicialId = typeof parametros.cliente === 'string' ? parametros.cliente : undefined;
  const usuario = await obtenerUsuarioServidor();
  const esAdmin = usuario?.rol === 'admin';
  const permisos = usuario?.permisos ?? [];

  return (
    <div className="flex flex-col gap-4">
      <SincronizadorClientesRealtime />
      <h1 className="text-2xl font-bold">Clientes</h1>
      <TablaClientes
        esAdmin={esAdmin}
        usuarioActualId={usuario?.id}
        clienteInicialId={clienteInicialId}
        puedeEditar={esAdmin || permisos.includes('cliente_editar')}
        puedeComercial={esAdmin || permisos.includes('cliente_comercial')}
        puedeFinanzas={esAdmin || permisos.includes('ver_finanzas')}
      />
    </div>
  );
}
