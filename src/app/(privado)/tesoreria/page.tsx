import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { ColaTesoreria } from '@/modulos/tesoreria/componentes/cola-tesoreria';
import { obtenerTesoreria } from '@/modulos/tesoreria/servicios/obtener-tesoreria';

/** SII-B8 F5: tesorería con saldos, transferencias internas y conciliación básica. */
export default async function PaginaTesoreria() {
  const usuario = await obtenerUsuarioServidor();
  const [puedeOperar, puedeVerFinanzas] = await Promise.all([
    usuario ? can(usuario, 'registrar_pagos') : Promise.resolve(false),
    usuario ? can(usuario, 'ver_finanzas') : Promise.resolve(false),
  ]);

  if (!puedeOperar && !puedeVerFinanzas) {
    return (
      <div className="mx-auto max-w-3xl rounded-lg border border-borde p-6">
        <h1 className="text-xl font-bold">Tesorería</h1>
        <p className="mt-2 text-sm text-texto-secundario">No tienes permiso para ver la tesorería.</p>
      </div>
    );
  }

  const servidor = await crearClienteSupabaseServidor();
  const datos = await obtenerTesoreria(servidor);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Tesorería</h1>
        <p className="text-sm text-texto-secundario">
          Saldo inicial por cuenta (banco o efectivo) más los movimientos vivos: cobros, pagos a
          proveedores y gastos pagados. Las transferencias internas solo mueven saldo entre cuentas y
          puedes conciliar cada movimiento contra tu banco.
        </p>
      </header>
      <ColaTesoreria inicial={datos} puedeOperar={puedeOperar} />
    </div>
  );
}
