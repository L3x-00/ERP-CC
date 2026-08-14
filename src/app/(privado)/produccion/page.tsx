import { notFound } from 'next/navigation';
import { OperacionProduccion } from '@/modulos/produccion/componentes/indice';
import { obtenerUsuarioServidor } from '@/modulos/autenticacion/servicios/obtener-usuario-servidor';
import { obtenerOperadorConSesionActiva } from '@/nucleo/autenticacion/obtener-operador-sesion';
import { can } from '@/nucleo/autenticacion/verificar-permiso';
import { obtenerDatosTableroProduccionServicio } from '@/modulos/produccion/servicios/indice';
import { crearClienteSupabaseServidor } from '@/nucleo/supabase/servidor';

/** Entrada RSC al piso: los datos llegan con RLS y las mutaciones siguen en Server Actions. */
export default async function PaginaProduccion() {
  const usuario = await obtenerUsuarioServidor();
  if (!usuario || !(await can(usuario, 'gestionar_produccion'))) notFound();

  const [cliente, operador] = await Promise.all([
    crearClienteSupabaseServidor(),
    obtenerOperadorConSesionActiva(),
  ]);
  const datosIniciales = await obtenerDatosTableroProduccionServicio(cliente, {});

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6" data-testid="pagina-produccion">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold">ProducciÃ³n y entregas</h1>
        <p className="text-sm text-foreground/70">
          Control transaccional de piso. Los cambios de cualquier usuario se reflejan sin recargar la pÃ¡gina.
        </p>
      </header>
      <OperacionProduccion datosIniciales={datosIniciales} operadorId={operador?.id ?? null} />
    </div>
  );
}
