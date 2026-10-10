import { PanelInventario } from '@/modulos/inventario/componentes/panel-inventario';
import { redirect } from 'next/navigation';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';

/** Materiales y costos con acceso financiero y legado histórico restringido. */
export default async function PaginaInventario() {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) {
    redirect('/iniciar-sesion');
  }

  const esAdmin = usuario.rol === 'admin';
  const puedeVerHistorico = esAdmin || usuario.permisos.includes('gestionar_inventario');
  const puedeVerCostos = puedeVerHistorico || usuario.permisos.includes('ver_finanzas');

  if (!puedeVerCostos) {
    redirect('/dashboard');
  }

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-texto-primario">Materiales y costos</h1>
        <p className="text-sm text-texto-secundario">
          Consulta costos vigentes y, cuando tengas permiso, el inventario histórico de solo lectura.
        </p>
      </header>
      <PanelInventario puedeVerHistorico={puedeVerHistorico} />
    </div>
  );
}
