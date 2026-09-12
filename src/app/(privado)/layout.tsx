import { redirect } from 'next/navigation';
import { ChasisApp } from '@/compartido/componentes/navegacion/chasis-app';
import { obtenerModulosPermitidos } from '@/compartido/componentes/navegacion/filtrar-modulos';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';

/** Zona privada de operaciones: requiere sesión Supabase y usa el chasis compartido. */
export default async function LayoutPrivado({
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
