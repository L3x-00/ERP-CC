import { notFound } from 'next/navigation';
import { OperacionCobranza } from '@/modulos/cobranza/componentes/indice';
import { obtenerResumenCarteraServicio } from '@/modulos/cobranza/servicios/cobranza-servicio';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';

type ParametrosPaginaCobranza = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/** Cartera RSC: la lectura inicial pasa por RLS; cobros posteriores usan Server Actions. */
export default async function PaginaCobranza({ searchParams }: ParametrosPaginaCobranza) {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario || !(await can(usuario, 'ver_finanzas'))) notFound();

  const parametros = searchParams ? await searchParams : {};
  const agingInicial = typeof parametros.aging === 'string' ? parametros.aging : undefined;

  const datosIniciales = await obtenerResumenCarteraServicio(
    await crearClienteSupabaseServidor(),
    {},
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6" data-testid="pagina-cobranza">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Cuentas por cobrar</h1>
        <p className="text-sm text-texto-secundario">Cartera, recibos y monedero actualizados en tiempo real.</p>
      </header>
      <OperacionCobranza datosIniciales={datosIniciales} agingInicial={agingInicial} puedeRegistrarPago={await can(usuario, 'registrar_pagos')} puedeAplicarSaldo={await can(usuario, 'aplicar_saldos')} />
    </div>
  );
}
