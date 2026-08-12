import { redirect } from 'next/navigation';
import { IndicadorSesion } from '@/modulos/autenticacion/componentes/indicador-sesion';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';

/** Zona privada de operaciones: requiere una sesión Supabase activa. */
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
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-foreground/10 px-6 py-4">
        <span className="text-lg font-bold">ORCA MFG ERP</span>
        <IndicadorSesion nombreUsuario={usuario.nombreCompleto} />
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
