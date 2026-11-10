import { notFound } from 'next/navigation';

import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { obtenerResumenCarteraServicio, type ResumenCartera } from '@/modulos/cobranza/servicios/cobranza-servicio';
import { OperacionCobros, type SeccionCobros } from '@/modulos/finanzas/componentes/operacion-cobros';
import { TablaFlujoCuentas } from '@/modulos/tesoreria/componentes/tabla-flujo-cuentas';
import { obtenerFlujoCuentasServicio } from '@/modulos/tesoreria/servicios/flujo-cuentas-servicio';
import { obtenerTesoreria } from '@/modulos/tesoreria/servicios/obtener-tesoreria';
import type { DatosTesoreria } from '@/modulos/tesoreria/tipos/indice';

type ParametrosPaginaCobros = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const CARTERA_VACIA: ResumenCartera = {
  cuentas: [],
  agingPorCliente: [],
  totalPendienteMxn: 0,
};

const TESORERIA_VACIA: DatosTesoreria = { cuentas: [], movimientos: [] };

/**
 * Módulo único de cobros: cuentas por cobrar y tesorería comparten ruta y
 * resumen. La lectura inicial pasa por RLS; las mutaciones siguen en Server
 * Actions con sus permisos.
 */
export default async function PaginaCobros({ searchParams }: ParametrosPaginaCobros) {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) notFound();
  const [puedeVerFinanzas, puedeRegistrarPago, puedeAplicarSaldo, puedeAdministrarCuentas] = await Promise.all([
    can(usuario, 'ver_finanzas'),
    can(usuario, 'registrar_pagos'),
    can(usuario, 'aplicar_saldos'),
    can(usuario, 'configuracion'),
  ]);
  if (!puedeVerFinanzas && !puedeRegistrarPago && !puedeAdministrarCuentas) notFound();

  // Materializa promesas vencidas/cumplidas y sus recordatorios (idempotente;
  // no bloquea la vista si falla).
  try {
    await crearClienteSupabaseAdmin().rpc('procesar_recordatorios_promesas', { p_actor_id: usuario.id });
  } catch (error) {
    console.error('[COBROS] Recordatorios de promesas no procesados:', error);
  }

  const parametros = searchParams ? await searchParams : {};
  const agingInicial = typeof parametros.aging === 'string' ? parametros.aging : undefined;
  const seccion: SeccionCobros = parametros.seccion === 'tesoreria'
    ? 'tesoreria'
    : parametros.seccion === 'cuentas'
      ? 'cuentas'
      : 'cobranza';

  const servidor = await crearClienteSupabaseServidor();
  const [datosIniciales, tesoreriaInicial, flujoCuentas] = await Promise.all([
    puedeVerFinanzas ? obtenerResumenCarteraServicio(servidor, {}) : Promise.resolve(CARTERA_VACIA),
    puedeVerFinanzas || puedeRegistrarPago ? obtenerTesoreria(servidor) : Promise.resolve(TESORERIA_VACIA),
    puedeVerFinanzas || puedeRegistrarPago ? obtenerFlujoCuentasServicio(servidor) : Promise.resolve([]),
  ]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6" data-testid="pagina-cobros">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Cobros y tesorería</h1>
        <p className="text-sm text-texto-secundario">
          Cartera, recibos y saldos de tus cuentas en un solo lugar. Empieza por el resumen y entra a
          la pestaña que necesites.
        </p>
      </header>
      <OperacionCobros
        datosIniciales={datosIniciales}
        agingInicial={agingInicial}
        tesoreriaInicial={tesoreriaInicial}
        flujoCuentas={<TablaFlujoCuentas filas={flujoCuentas} />}
        puedeRegistrarPago={puedeRegistrarPago}
        puedeAplicarSaldo={puedeAplicarSaldo}
        puedeOperarTesoreria={puedeRegistrarPago}
        puedeVerTesoreria={puedeVerFinanzas || puedeRegistrarPago}
        puedeVerCobranza={puedeVerFinanzas}
        puedeAdministrarCuentas={puedeAdministrarCuentas}
        seccionInicial={seccion}
      />
    </div>
  );
}
