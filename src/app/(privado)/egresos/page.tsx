import { notFound } from 'next/navigation';

import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { obtenerColaCompras, type ColaCompras } from '@/modulos/compras/servicios/obtener-compras';
import { OperacionEgresos } from '@/modulos/finanzas/componentes/operacion-egresos';
import { consultarGastosServicio } from '@/modulos/gastos/servicios/indice';

type ParametrosPaginaEgresos = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const COLA_VACIA: ColaCompras = {
  compras: [],
  proveedores: [],
  ordenes: [],
  materiales: [],
  ultimosCostos: {},
};

/**
 * Módulo único de egresos: compras a proveedores y gastos operativos viven en
 * la misma ruta con pestañas, sin duplicar pantallas ni reglas.
 */
export default async function PaginaEgresos({ searchParams }: ParametrosPaginaEgresos) {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario) notFound();
  const [puedeVerFinanzas, puedeGestionarCompras] = await Promise.all([
    can(usuario, 'ver_finanzas'),
    can(usuario, 'registrar_gastos'),
  ]);
  if (!puedeVerFinanzas && !puedeGestionarCompras) notFound();

  const parametros = searchParams ? await searchParams : {};
  const seccion = parametros.seccion === 'compras' ? 'compras' : 'gastos';
  const servidor = await crearClienteSupabaseServidor();
  const [gastos, compras] = await Promise.all([
    puedeVerFinanzas ? consultarGastosServicio(servidor, {}) : Promise.resolve([]),
    puedeVerFinanzas || puedeGestionarCompras
      ? obtenerColaCompras(servidor)
      : Promise.resolve(COLA_VACIA),
  ]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6" data-testid="pagina-egresos">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Egresos</h1>
        <p className="text-sm text-texto-secundario">
          Compras a proveedores y gastos operativos en un solo lugar. Revisa cuánto debes y entra a
          cada pestaña para registrar, pagar o conciliar.
        </p>
      </header>
      <OperacionEgresos
        gastosIniciales={gastos}
        comprasIniciales={compras}
        puedeGestionarCompras={puedeGestionarCompras}
        puedeVerGastos={puedeVerFinanzas}
        seccionInicial={puedeVerFinanzas || seccion === 'compras' ? seccion : 'compras'}
      />
    </div>
  );
}
