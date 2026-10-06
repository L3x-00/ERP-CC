import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { ColaFacturas } from '@/modulos/facturacion/componentes/cola-facturas';
import { obtenerColaFacturas } from '@/modulos/facturacion/servicios/obtener-facturas';

type ParametrosPaginaFacturacion = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/** SII-B8 F2: cola de facturación (borradores, emisión con folio capturado y cancelación). */
export default async function PaginaFacturacion({ searchParams }: ParametrosPaginaFacturacion) {
  const parametros = searchParams ? await searchParams : {};
  const entregaInicialId = typeof parametros.entrega === 'string' ? parametros.entrega : undefined;

  const usuario = await obtenerUsuarioServidor();
  const [puedeFacturar, puedeVerFinanzas] = await Promise.all([
    usuario ? can(usuario, 'registrar_pagos') : Promise.resolve(false),
    usuario ? can(usuario, 'ver_finanzas') : Promise.resolve(false),
  ]);

  if (!puedeFacturar && !puedeVerFinanzas) {
    return (
      <div className="mx-auto max-w-3xl rounded-lg border border-borde p-6">
        <h1 className="text-xl font-bold">Facturación</h1>
        <p className="mt-2 text-sm text-texto-secundario">No tienes permiso para ver la facturación.</p>
      </div>
    );
  }

  const servidor = await crearClienteSupabaseServidor();
  const cola = await obtenerColaFacturas(servidor);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Facturación</h1>
        <p className="text-sm text-texto-secundario">
          Borrador administrativo por entrega: precarga montos de la cuenta por cobrar, emite con el folio
          fiscal capturado del PAC y vincula la CxC. Cancelar desvincula y permite re-facturar.
        </p>
      </header>
      <ColaFacturas
        inicial={cola}
        puedeFacturar={puedeFacturar}
        entregaInicialId={entregaInicialId}
      />
    </div>
  );
}
