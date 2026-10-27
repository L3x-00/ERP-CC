
import { redirect } from 'next/navigation';

import { obtenerContextoSesionOperadorActiva } from '@/nucleo/autenticacion/obtener-operador-sesion';
import { sesionOperadorEsDelegada } from '@/nucleo/autenticacion/sesion';
import { crearClienteSupabaseAdmin } from '@/nucleo/supabase/admin';

import { obtenerEspacioOperadorServicio } from '@/modulos/produccion/servicios/espacio-operador-servicio';

import {
  obtenerOrdenesConPartidasDePisoServicio,
  obtenerConsumosPartidasServicio,
} from '@/modulos/ordenes/servicios/ordenes-servicio';

import { PaginaMiPanelOperador } from '@/modulos/produccion/componentes/pagina-mi-panel-operador';
import { EncabezadoTerminalOperador } from '@/modulos/produccion/componentes/encabezado-terminal-operador';
import { SincronizadorPisoRealtime } from '@/modulos/ordenes/componentes/sincronizador-piso-realtime';
import { consumoMaterialVisibleDesdeRegistro } from '@/modulos/produccion/utilidades/consumo-material-operador';
/**
 * Panel personal del operador.
 *
 * Autenticación HMAC mediante PIN.
 * Bloquea sesiones delegadas.
 * Reutiliza los servicios existentes de producción.
 *
 * Las consultas privadas se ejecutan únicamente en servidor.
 */
export default async function PaginaMiPanel() {
  // 1. Validar sesión del operador.
  const contexto = await obtenerContextoSesionOperadorActiva();

  if (!contexto) {
    redirect('/operador');
  }

  if (sesionOperadorEsDelegada(contexto.sesion)) {
    redirect('/produccion-piso');
  }

  const operadorId = contexto.operador.id;
  const nombreOperador = contexto.operador.nombreCompleto;

  // 2. Cliente privado: nunca se envía al navegador.
  const cliente = crearClienteSupabaseAdmin();

  // 3. Datos autorizados por los servicios del piso.
  const [espacio, ordenes, resultadoAreas] = await Promise.all([
    obtenerEspacioOperadorServicio(cliente, operadorId),

    obtenerOrdenesConPartidasDePisoServicio(
      cliente,
      operadorId,
    ),

    cliente
      .from('areas_trabajo_config')
      .select('codigo, nombre, padre_codigo, area_planeacion')
      .order('orden')
      .order('nombre'),
  ]);

  if (resultadoAreas.error) {
    throw new Error(
      'No se pudieron cargar las áreas de taller para el panel del operador',
    );
  }

  // 4. Identificar partidas visibles.
  const idsPartidasVisibles = [
    ...new Set(
      ordenes.flatMap(({ partidas }) =>
        partidas.map((partida) => partida.id),
      ),
    ),
  ];

  // 5. Consumos reales de las partidas visibles en una sola consulta.
  const consumos = await obtenerConsumosPartidasServicio(
    cliente,
    idsPartidasVisibles,
  );

  // 6. Materiales vinculados a las partidas visibles o a sus consumos.
  const idsMateriales = [
    ...new Set(
      [
        ...ordenes.flatMap(({ partidas }) =>
          partidas.flatMap((partida) =>
            partida.materialId ? [partida.materialId] : [],
          ),
        ),
        ...consumos.map((consumo) => consumo.materialId),
      ],
    ),
  ];

  const resultadoMateriales = idsMateriales.length > 0
    ? await cliente
        .from('catalogo_materiales')
        .select('id, codigo, nombre, unidad_base')
        .in('id', idsMateriales)
        .eq('activo', true)
        .order('nombre', { ascending: true })
    : { data: [], error: null };

  if (resultadoMateriales.error) {
    throw new Error(
      'No se pudieron cargar los materiales para el panel del operador',
    );
  }

  const materiales = (resultadoMateriales.data ?? []).map(
    (material) => ({
      id: material.id,
      codigo: material.codigo,
      nombre: material.nombre,
      unidadBase: material.unidad_base,
    }),
  );

  const areas = (resultadoAreas.data ?? []).map((area) => ({
    codigo: area.codigo,
    nombre: area.nombre,
    padreCodigo: area.padre_codigo,
    areaPlaneacion: area.area_planeacion,
  }));

  // 7. Renderizar panel personal.
  return (
    <main className="min-h-screen space-y-6 p-4 sm:p-6">
      <SincronizadorPisoRealtime
        rutaAlExpirar="/operador"
      />

      <EncabezadoTerminalOperador
        nombreOperador={nombreOperador}
        operativo
      />

      <PaginaMiPanelOperador
        nombreOperador={nombreOperador}
        operadorId={operadorId}
        procesos={espacio.procesos}
        ordenes={ordenes}
        materiales={materiales}
        areas={areas}
        hoy={espacio.hoy}
        motivosPausa={espacio.motivosPausa}
        horasReclamadasHoy={
          espacio.resumen.horasReclamadasHoy
        }
        consumos={consumos.map(consumoMaterialVisibleDesdeRegistro)}
      />
    </main>
  );
}
