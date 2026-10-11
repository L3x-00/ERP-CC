import { PanelInventario } from '@/modulos/inventario/componentes/panel-inventario';
import { redirect } from 'next/navigation';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';

/**
 * Materiales y costos: catálogo maestro con costo vigente e historial.
 * El consumo y su costo congelado viven en las órdenes; sin inventario formal.
 */
export default async function PaginaInventario() {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    redirect('/iniciar-sesion');
  }

  const puedeVerCostos =
    usuario.rol === 'admin' ||
    usuario.permisos.includes('gestionar_inventario') ||
    usuario.permisos.includes('ver_finanzas');

  if (!puedeVerCostos) {
    redirect('/dashboard');
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-texto-primario">Materiales y costos</h1>
        <p className="text-sm text-texto-secundario">
          Catálogo maestro de materiales con unidad base, costo vigente e historial. El consumo se
          registra en las órdenes y su costo queda congelado ahí; sin existencias ni operación de
          almacén.
        </p>
      </header>
      <PanelInventario />
    </div>
  );
}
