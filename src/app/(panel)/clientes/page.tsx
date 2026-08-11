import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { TablaClientes } from '@/modulos/clientes/componentes/tabla-clientes';

/**
 * Página de Clientes. Server Component: resuelve el usuario para saber si es
 * admin (habilita la asignación de tier manual en la ficha) y delega la lista
 * interactiva —búsqueda, filtros, paginación, ficha 360°— a `TablaClientes`.
 */
export default async function PaginaClientes() {
  const usuario = await obtenerUsuarioServidor();
  const esAdmin = usuario?.rol === 'admin';

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Clientes</h1>
      <TablaClientes esAdmin={esAdmin} />
    </div>
  );
}
