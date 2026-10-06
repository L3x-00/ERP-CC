import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { ColaCompras } from '@/modulos/compras/componentes/cola-compras';
import { obtenerColaCompras } from '@/modulos/compras/servicios/obtener-compras';

/** SII-B8 F4: compras/CxP con folio CG y pagos a proveedores. */
export default async function PaginaCompras() {
  const usuario = await obtenerUsuarioServidor();
  const [puedeGestionar, puedeVerFinanzas] = await Promise.all([
    usuario ? can(usuario, 'registrar_gastos') : Promise.resolve(false),
    usuario ? can(usuario, 'ver_finanzas') : Promise.resolve(false),
  ]);

  if (!puedeGestionar && !puedeVerFinanzas) {
    return (
      <div className="mx-auto max-w-3xl rounded-lg border border-borde p-6">
        <h1 className="text-xl font-bold">Compras</h1>
        <p className="mt-2 text-sm text-texto-secundario">No tienes permiso para ver las compras.</p>
      </div>
    );
  }

  const servidor = await crearClienteSupabaseServidor();
  const cola = await obtenerColaCompras(servidor);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Compras</h1>
        <p className="text-sm text-texto-secundario">
          Órdenes de compra con folio CG-MMYY_####, cuenta por pagar por saldo y pagos parciales a
          proveedores. Las compras no entran a la rentabilidad de las órdenes.
        </p>
      </header>
      <ColaCompras inicial={cola} puedeGestionar={puedeGestionar} />
    </div>
  );
}
