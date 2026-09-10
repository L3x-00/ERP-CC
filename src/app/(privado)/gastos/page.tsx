import { notFound } from 'next/navigation';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { OperacionGastos } from '@/modulos/gastos/componentes/indice';
import { consultarGastosServicio } from '@/modulos/gastos/servicios/indice';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';

/** Gastos: lectura inicial RSC protegida; mutaciones y OCR permanecen server-side. */
export default async function PaginaGastos() {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario || !(await can(usuario, 'ver_finanzas'))) notFound();
  const datosIniciales = await consultarGastosServicio(
    await crearClienteSupabaseServidor(),
    {},
  );
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6" data-testid="pagina-gastos">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Gastos y rentabilidad</h1>
        <p className="text-sm text-foreground/70">Control de gastos, cuentas por pagar y costo real por orden.</p>
      </header>
      <OperacionGastos datosIniciales={datosIniciales} />
    </div>
  );
}
