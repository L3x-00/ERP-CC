import { notFound } from 'next/navigation';
import { OperacionCobranza } from '@/modulos/cobranza/componentes/indice';
import { obtenerResumenCarteraServicio } from '@/modulos/cobranza/servicios/cobranza-servicio';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';

/** Cartera RSC: la lectura inicial pasa por RLS; cobros posteriores usan Server Actions. */
export default async function PaginaCobranza() {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario || !(await can(usuario, 'ver_finanzas'))) notFound();

  const datosIniciales = await obtenerResumenCarteraServicio(
    await crearClienteSupabaseServidor(),
    {},
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6" data-testid="pagina-cobranza">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Cuentas por cobrar</h1>
        <p className="text-sm text-foreground/70">Cartera, recibos y monedero actualizados en tiempo real.</p>
      </header>
      <OperacionCobranza datosIniciales={datosIniciales} />
    </div>
  );
}
