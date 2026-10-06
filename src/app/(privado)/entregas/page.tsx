import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { ColaEntregas } from '@/modulos/entregas/componentes/cola-entregas';
import {
  obtenerColaEntregas,
  obtenerOrdenesConPendientes,
} from '@/modulos/entregas/servicios/obtener-entregas';

type ParametrosPaginaEntregas = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

/** SII-B7.3: cola de Logística (entregas parciales/totales, evidencia y firma). */
export default async function PaginaEntregas({ searchParams }: ParametrosPaginaEntregas) {
  const parametros = searchParams ? await searchParams : {};
  const ordenInicialId = typeof parametros.orden === 'string' ? parametros.orden : undefined;

  const usuario = await obtenerUsuarioServidor();
  const [puedeGenerar, puedeEvidencia, puedeVerOrden, puedeVerFinanzas] = await Promise.all([
    usuario ? can(usuario, 'entrega_generar') : Promise.resolve(false),
    usuario ? can(usuario, 'entrega_evidencia') : Promise.resolve(false),
    usuario ? can(usuario, 'orden_vista') : Promise.resolve(false),
    usuario ? can(usuario, 'ver_finanzas') : Promise.resolve(false),
  ]);
  const puedeVer = puedeGenerar || puedeEvidencia || puedeVerOrden || puedeVerFinanzas;

  if (!puedeVer) {
    return (
      <div className="mx-auto max-w-3xl rounded-lg border border-borde p-6">
        <h1 className="text-xl font-bold">Entregas</h1>
        <p className="mt-2 text-sm text-texto-secundario">No tienes permiso para ver las entregas.</p>
      </div>
    );
  }

  const servidor = await crearClienteSupabaseServidor();
  const [pendientes, entregas] = await Promise.all([
    obtenerOrdenesConPendientes(servidor),
    obtenerColaEntregas(servidor),
  ]);

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">Entregas</h1>
        <p className="text-sm text-texto-secundario">
          Cola de Logística: registra entregas parciales o totales con folio NE, captura quién entrega
          y quién recibe, y adjunta evidencia y firma en el detalle de cada nota.
        </p>
      </header>
      <ColaEntregas
        inicial={{ pendientes, entregas }}
        puedeGenerar={puedeGenerar}
        ordenInicialId={ordenInicialId}
      />
    </div>
  );
}
