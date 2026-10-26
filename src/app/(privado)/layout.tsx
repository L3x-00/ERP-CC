import { redirect } from 'next/navigation';
import { ChasisApp } from '@/compartido/componentes/navegacion/chasis-app';
import { obtenerModulosPermitidos } from '@/compartido/componentes/navegacion/filtrar-modulos';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { obtenerEstadoTipoCambioDiario } from '@/modulos/configuracion/servicios/indice';

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
  let estadoTipoCambio = null;
  try {
    estadoTipoCambio = await obtenerEstadoTipoCambioDiario();
  } catch (error) {
    console.error('[CONFIGURACION] No se pudo obtener el tipo de cambio del encabezado:', error);
  }

  return (
    <ChasisApp
      usuario={{ id: usuario.id, nombreCompleto: usuario.nombreCompleto, rol: usuario.rol }}
      modulos={obtenerModulosPermitidos(usuario)}
      estadoTipoCambio={estadoTipoCambio}
      puedeActualizarTipoCambio={usuario.rol === 'admin'}
    >
      {children}
    </ChasisApp>
  );
}
