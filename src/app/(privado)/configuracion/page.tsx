import { redirect } from 'next/navigation';
import { obtenerConfiguracionAccion } from '@/modulos/configuracion/acciones/indice';
import { OperacionConfiguracion } from '@/modulos/configuracion/componentes/indice';

export const dynamic = 'force-dynamic';

/** Página RSC protegida; la autorización se resuelve en la misma acción que usa el cliente. */
export default async function PaginaConfiguracion() {
  const respuesta = await obtenerConfiguracionAccion({ soloCuentasActivas: false });
  if (!respuesta.exito) {
    if (respuesta.error === 'No autorizado') redirect('/iniciar-sesion');
    if (respuesta.error.includes('Sin permiso')) redirect('/dashboard');
    return <p role="alert">No se pudo cargar la configuración. Vuelve a intentarlo.</p>;
  }
  if (!respuesta.datos) return <p role="alert">No se pudo cargar la configuración. Vuelve a intentarlo.</p>;
  return <OperacionConfiguracion datosIniciales={respuesta.datos} />;
}
