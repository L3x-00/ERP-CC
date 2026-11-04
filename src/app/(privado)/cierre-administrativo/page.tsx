import { notFound } from 'next/navigation';

import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { PanelCierreAdministrativo } from '@/modulos/cierres/componentes/panel-cierre-administrativo';

/**
 * C14: cierre administrativo de órdenes terminadas. La lectura pasa por Server
 * Actions con permisos de finanzas o gestión de producción.
 */
export default async function PaginaCierreAdministrativo() {
  const usuario = await obtenerUsuarioServidor();
  if (
    !usuario
    || (!(await can(usuario, 'ver_finanzas')) && !(await can(usuario, 'gestionar_produccion')))
  ) {
    notFound();
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6">
      <PanelCierreAdministrativo />
    </div>
  );
}
