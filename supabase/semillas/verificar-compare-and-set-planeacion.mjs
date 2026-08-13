import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const clienteFicticioId = '60000000-0000-4000-8000-000000000001';
const recursoPruebaId = '60000000-0000-4000-8000-000000000301';
const temporales = { ordenId: null, programacionId: null };

function cargarEntornoLocal() {
  if (!existsSync('.env.local')) return;

  for (const linea of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const coincidencia = /^([A-Z0-9_]+)=(.*)$/.exec(linea.trim());
    if (!coincidencia || process.env[coincidencia[1]] !== undefined) continue;
    process.env[coincidencia[1]] = coincidencia[2].replace(/^['"]|['"]$/g, '');
  }
}

function requerirVariable(nombre) {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre}.`);
  return valor;
}

function asegurar(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

async function limpiarTemporales(cliente) {
  if (temporales.programacionId) {
    const { error } = await cliente
      .from('programacion_areas')
      .delete()
      .eq('id', temporales.programacionId);
    if (error) throw new Error(`No se eliminó programación temporal: ${error.message}`);
  }
  if (temporales.ordenId) {
    const { error } = await cliente.from('ordenes_produccion').delete().eq('id', temporales.ordenId);
    if (error) throw new Error(`No se eliminó OP temporal: ${error.message}`);
  }
}

async function ejecutar() {
  cargarEntornoLocal();
  asegurar(process.env.NODE_ENV !== 'production', 'La prueba CAS no puede ejecutarse en producción.');
  asegurar(
    process.env.CONFIRMAR_PRUEBAS_FICTICIAS === 'si',
    'Define CONFIRMAR_PRUEBAS_FICTICIAS=si para ejecutar la prueba remota de compare-and-set.',
  );

  const cliente = createClient(
    requerirVariable('NEXT_PUBLIC_SUPABASE_URL'),
    requerirVariable('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  let limpiezaConfirmada = false;
  try {
    const { data: ordenCreada, error: errorOrden } = await cliente.rpc('crear_orden_manual', {
      p_cliente_id: clienteFicticioId,
      p_fecha_compromiso: '2026-09-30T18:00:00.000Z',
      p_prioridad: 'normal',
      p_partidas: [
        {
          codigo_pieza: `TMP-F6-CAS-${randomUUID().slice(0, 8)}`,
          descripcion: 'Partida ficticia temporal para validar compare-and-set',
          cantidad_solicitada: 1,
          unidad_medida: 'pieza',
          material_id: null,
          tiempo_estimado_minutos: 60,
          maquina_asignada: null,
        },
      ],
    });
    if (errorOrden || !ordenCreada?.[0]) {
      throw new Error(`No se creó OP temporal: ${errorOrden?.message ?? 'sin resultado'}`);
    }
    temporales.ordenId = ordenCreada[0].id;

    const { data: partida, error: errorPartida } = await cliente
      .from('partidas_orden_produccion')
      .select('id')
      .eq('orden_id', temporales.ordenId)
      .single();
    if (errorPartida || !partida) {
      throw new Error(`No se obtuvo partida temporal: ${errorPartida?.message ?? 'sin partida'}`);
    }

    const { data: programada, error: errorProgramar } = await cliente.rpc('programar_partida_recurso', {
      p_orden_id: temporales.ordenId,
      p_partida_id: partida.id,
      p_recurso_id: recursoPruebaId,
      p_secuencia: 1,
      p_fecha_programada: '2026-09-17',
      p_turno: 'matutino',
      p_horas_estimadas: 2,
      p_orden_prioridad: 1,
    });
    if (errorProgramar || !programada?.[0]) {
      throw new Error(`No se programó partida temporal: ${errorProgramar?.message ?? 'sin resultado'}`);
    }
    temporales.programacionId = programada[0].id;

    const { data: reprogramada, error: errorReprogramar } = await cliente.rpc(
      'reprogramar_partida_recurso',
      {
        p_programacion_id: temporales.programacionId,
        p_recurso_id: recursoPruebaId,
        p_fecha_programada: '2026-09-17',
        p_turno: 'vespertino',
        p_horas_estimadas: 3,
        p_orden_prioridad: 1,
        p_actualizado_en_esperado: programada[0].actualizado_en,
      },
    );
    if (errorReprogramar || !reprogramada?.[0]) {
      throw new Error(`No se reprogramó partida temporal: ${errorReprogramar?.message ?? 'sin resultado'}`);
    }
    asegurar(
      reprogramada[0].actualizado_en !== programada[0].actualizado_en,
      'La marca de actualización no cambió entre solicitudes independientes.',
    );

    const { error: errorConflicto } = await cliente.rpc('reprogramar_partida_recurso', {
      p_programacion_id: temporales.programacionId,
      p_recurso_id: recursoPruebaId,
      p_fecha_programada: '2026-09-17',
      p_turno: 'vespertino',
      p_horas_estimadas: 3,
      p_orden_prioridad: 1,
      p_actualizado_en_esperado: programada[0].actualizado_en,
    });
    asegurar(
      errorConflicto?.message.includes('programacion_conflicto'),
      'El compare-and-set no rechazó la versión obsoleta.',
    );
  } finally {
    await limpiarTemporales(cliente);
    limpiezaConfirmada = true;
  }

  console.log(JSON.stringify({ compareAndSetRechazado: true, limpiezaTemporalConfirmada: limpiezaConfirmada }));
}

ejecutar().catch((error) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : 'Fallo desconocido' }));
  process.exitCode = 1;
});
