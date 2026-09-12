import { redirect } from 'next/navigation';
import { ChasisApp } from '@/compartido/componentes/navegacion/chasis-app';
import { obtenerModulosPermitidos } from '@/compartido/componentes/navegacion/filtrar-modulos';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';

/**
 * Layout del panel administrativo (admin, ventas, gerentes, contador).
 * Server Component: exige un usuario Supabase autenticado — si no existe,
 * redirige a `/iniciar-sesion` (guardia adicional a la del middleware).
 * Monta el chasis compartido con sidebar, encabezado y contenido.
 */
export default async function LayoutPanel({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const usuario = await obtenerUsuarioServidor();

  if (!usuario) {
    redirect('/iniciar-sesion');
  }

  return (
    <ChasisApp
      usuario={{ id: usuario.id, nombreCompleto: usuario.nombreCompleto, rol: usuario.rol }}
      modulos={obtenerModulosPermitidos(usuario)}
    >
      {children}
    </ChasisApp>
  );
}
