import { notFound } from 'next/navigation';

import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { TablaActividad } from '@/modulos/auditoria/componentes/tabla-actividad';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';

/** Actividad operativa: requiere `actividad_vista` (admin siempre puede). */
export default async function PaginaActividad() {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario || !(await can(usuario, 'actividad_vista'))) notFound();

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6" data-testid="pagina-actividad">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Actividad</h1>
        <p className="text-sm text-texto-secundario">
          Qué ocurrió, quién lo hizo y sobre qué registro, sin identificadores técnicos. Los eventos de una
          misma acción de negocio se agrupan.
        </p>
      </header>
      <TablaActividad esAdmin={usuario.rol === 'admin'} />
    </div>
  );
}
