import { notFound } from 'next/navigation';
import { OperacionProduccion } from '@/modulos/produccion/componentes/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { obtenerOperadorConSesionActiva } from '@/nucleo/autenticacion/obtener-operador-sesion';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { nuevoCorrelationId } from '@/nucleo/auditoria/registrar-log';
import { cerrarJornadaServicio, obtenerDatosTableroProduccionServicio } from '@/modulos/produccion/servicios/indice';
import { hoyIso, sumarDias } from '@/modulos/planeacion/utilidades/fechas-planeacion';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';

/** Entrada RSC al piso: los datos llegan con RLS y las mutaciones siguen en Server Actions. */
type ParametrosPaginaProduccion = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PaginaProduccion({ searchParams }: ParametrosPaginaProduccion) {
  const parametros = searchParams ? await searchParams : {};
  const ordenInicialId = typeof parametros.ordenId === 'string' ? parametros.ordenId : undefined;
  const usuario = await obtenerUsuarioServidor();
  if (!usuario || !(await can(usuario, 'gestionar_produccion'))) notFound();

  const [cliente, operador] = await Promise.all([
    crearClienteSupabaseServidor(),
    obtenerOperadorConSesionActiva(),
  ]);
  // SII-B6.2: ninguna sesión debe cruzar de fecha. Al abrir el piso se cierra la
  // jornada de ayer si quedó trabajo activo; un fallo aquí nunca bloquea la carga.
  try {
    await cerrarJornadaServicio(crearClienteSupabaseAdmin(), {
      fecha: sumarDias(hoyIso(), -1),
      actorId: usuario.id,
      correlationId: nuevoCorrelationId(),
    });
  } catch {
    // El cierre se reintenta en la próxima apertura o con la acción manual.
  }
  const datosIniciales = await obtenerDatosTableroProduccionServicio(
    cliente,
    {},
    crearClienteSupabaseAdmin(),
  );

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6" data-testid="pagina-produccion">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold text-texto-primario">Producción y entregas</h1>
        <p className="text-sm text-texto-secundario">
          Control transaccional de piso. Los cambios de cualquier usuario se reflejan sin recargar la página.
        </p>
      </header>
      <OperacionProduccion
        datosIniciales={datosIniciales}
        operadorId={operador?.id ?? null}
        usuarioActualId={usuario.id}
        esAdmin={usuario.rol === 'admin'}
        ordenInicialId={ordenInicialId}
      />
    </div>
  );
}
