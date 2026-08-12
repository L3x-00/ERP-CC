import { redirect } from 'next/navigation';
import { IndicadorSesion } from '@/modulos/autenticacion/componentes/indicador-sesion';
import { ControlPisoPanel } from '@/modulos/ordenes/componentes/control-piso-panel';
import { SincronizadorPisoRealtime } from '@/modulos/ordenes/componentes/sincronizador-piso-realtime';
import { obtenerOrdenesConPartidasDeOperadorServicio } from '@/modulos/ordenes/servicios/ordenes-servicio';
import { obtenerOperadorConSesionActiva } from '@/nucleo/autenticacion/obtener-operador-sesion';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

/**
 * Página de producción en piso. Revalida la cookie HMAC y la cuenta de operador
 * antes de cargar solo OP en proceso mediante un cliente privado de servidor.
 */
export default async function PaginaProduccionPiso() {
  const operador = await obtenerOperadorConSesionActiva();
  if (!operador) {
    redirect('/operador');
  }

  const admin = crearClienteSupabaseAdmin();
  const ordenes = await obtenerOrdenesConPartidasDeOperadorServicio(admin, operador.id);
  const idsMateriales = [
    ...new Set(
      ordenes.flatMap(({ partidas }) =>
        partidas.flatMap((partida) => (partida.materialId ? [partida.materialId] : [])),
      ),
    ),
  ];
  const resultadoMateriales = idsMateriales.length
    ? await admin
        .from('materiales')
        .select('id, codigo, nombre, stock_actual_control, unidad_control')
        .in('id', idsMateriales)
        .order('nombre', { ascending: true })
    : { data: [], error: null };

  if (resultadoMateriales.error) {
    throw new Error('No se pudieron cargar los materiales para el control de piso');
  }

  const materiales = (resultadoMateriales.data ?? []).map((material) => ({
    id: material.id,
    codigo: material.codigo,
    nombre: material.nombre,
    stockActualControl: Number(material.stock_actual_control),
    unidadControl: material.unidad_control,
  }));

  return (
    <div className="flex flex-col gap-6 p-6">
      <SincronizadorPisoRealtime />
      <IndicadorSesion nombreUsuario={operador.nombreCompleto} esOperador />
      <ControlPisoPanel operadorId={operador.id} ordenes={ordenes} materiales={materiales} />
    </div>
  );
}
