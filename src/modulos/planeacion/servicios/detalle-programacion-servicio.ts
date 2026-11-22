import type { SupabaseClient } from '@supabase/supabase-js';

import { ZONA_HORARIA_NEGOCIO } from '@/compartido/utilidades/fecha-negocio';
import type { Database, Json, Tables } from '@/compartido/tipos/supabase';
import { horasTranscurridasSesion } from '@/modulos/produccion/utilidades/horas-extra';
import { ErrorPlaneacion } from '@/modulos/planeacion/servicios/planeacion-servicio';
import type {
  DetalleProgramacion,
  EstadoHistorialProgramacion,
} from '@/modulos/planeacion/tipos/indice';

type EventoProgramacion = Pick<
  Tables<'orden_eventos_cambio'>,
  'actor_id' | 'creado_en' | 'detalle' | 'motivo' | 'tipo'
>;

type CambioCrudo = {
  creadoEn: string;
  actorId: string | null;
  motivo: string;
  anterior: EstadoCrudo;
  nuevo: EstadoCrudo;
};

type EstadoCrudo = Omit<EstadoHistorialProgramacion, 'recurso'> & {
  recursoId: string | null;
};

function esRegistro(valor: Json | undefined): valor is { [key: string]: Json | undefined } {
  return typeof valor === 'object' && valor !== null && !Array.isArray(valor);
}

function texto(registro: { [key: string]: Json | undefined }, clave: string): string {
  const valor = registro[clave];
  return typeof valor === 'string' ? valor : '';
}

function numero(registro: { [key: string]: Json | undefined }, clave: string): number {
  const valor = registro[clave];
  return typeof valor === 'number'
    ? valor
    : typeof valor === 'string' && valor.trim() !== ''
      ? Number(valor)
      : 0;
}

function estadoCrudo(valor: Json | undefined): EstadoCrudo | null {
  if (!esRegistro(valor)) return null;
  const recursoId = texto(valor, 'recurso_id');
  const fechaProgramada = texto(valor, 'fecha_programada');
  const turno = texto(valor, 'turno');
  if (!fechaProgramada || !turno) return null;
  return {
    recursoId: recursoId || null,
    fechaProgramada,
    turno,
    horasEstimadas: numero(valor, 'horas_estimadas'),
    ordenPrioridad: numero(valor, 'orden_prioridad'),
  };
}

function cambioCrudo(evento: EventoProgramacion): CambioCrudo | null {
  if (!esRegistro(evento.detalle)) return null;
  const anterior = estadoCrudo(evento.detalle.anterior);
  const nuevo = estadoCrudo(evento.detalle.nuevo);
  if (!anterior || !nuevo) return null;
  return {
    creadoEn: evento.creado_en,
    actorId: evento.actor_id,
    motivo: evento.motivo?.trim() || 'Sin motivo registrado',
    anterior,
    nuevo,
  };
}

function nombreActor(actorId: string | null, nombres: ReadonlyMap<string, string>): string {
  if (actorId === null) return 'Sistema';
  return nombres.get(actorId) ?? 'Usuario no disponible';
}

function nombreRecurso(recursoId: string | null, nombres: ReadonlyMap<string, string>): string {
  if (recursoId === null) return 'Recurso no registrado';
  return nombres.get(recursoId) ?? 'Recurso no disponible';
}

function fallar(error: { message: string } | null): void {
  if (error) throw new ErrorPlaneacion('desconocido', error.message);
}

/** Hora mural del taller, nunca la zona del dispositivo (AUD-12/CRIT-1). */
function horaTaller(fecha: string): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA_HORARIA_NEGOCIO,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(fecha));
}

/**
 * C9.3: compone el detalle operativo desde tablas internas y devuelve únicamente
 * campos de negocio aprobados. La acción llamadora debe autorizar antes de usar
 * este cliente privilegiado.
 */
export async function obtenerDetalleProgramacionServicio(
  admin: SupabaseClient<Database>,
  programacionId: string,
): Promise<DetalleProgramacion> {
  const programacionResp = await admin
    .from('programacion_areas')
    .select('orden_id, recurso_id, horas_estimadas, meta_proceso_id')
    .eq('id', programacionId)
    .maybeSingle();
  fallar(programacionResp.error);
  if (!programacionResp.data) throw new ErrorPlaneacion('programacion_inexistente');

  const filtroProgramacion =
    `detalle->>programacion_id.eq.${programacionId},detalle->nuevo->>programacion_id.eq.${programacionId}`;
  const [recursoResp, sesionesResp, inicialResp, historialResp] = await Promise.all([
    admin
      .from('recursos_planeacion')
      .select('codigo, nombre, grupo_equipo_id')
      .eq('id', programacionResp.data.recurso_id)
      .maybeSingle(),
    admin
      .from('sesiones_trabajo')
      .select('id, creado_en, fecha_inicio, estado_sesion, motivo_pausa_codigo, horas_netas, recurso_liberado, operador_id, piezas_producidas')
      .eq('programacion_id', programacionId),
    admin
      .from('orden_eventos_cambio')
      .select('actor_id, creado_en, detalle, motivo, tipo')
      .eq('orden_id', programacionResp.data.orden_id)
      .eq('tipo', 'programacion_inicial')
      .or(filtroProgramacion)
      .order('creado_en', { ascending: true })
      .limit(1)
      .maybeSingle(),
    admin
      .from('orden_eventos_cambio')
      .select('actor_id, creado_en, detalle, motivo, tipo')
      .eq('orden_id', programacionResp.data.orden_id)
      .eq('tipo', 'reprogramacion_operativa')
      .or(filtroProgramacion)
      .order('creado_en', { ascending: false })
      .limit(10),
  ]);

  fallar(recursoResp.error);
  fallar(sesionesResp.error);
  fallar(inicialResp.error);
  fallar(historialResp.error);
  if (!recursoResp.data) throw new ErrorPlaneacion('recurso_inexistente');

  const sesionesOrdenadas = [...(sesionesResp.data ?? [])].sort((a, b) =>
    new Date(b.creado_en).getTime() - new Date(a.creado_en).getTime()
    || String(b.id).localeCompare(String(a.id)));
  const sesionActiva = sesionesOrdenadas.find((sesion) => sesion.estado_sesion === 'activa') ?? null;

  const cambios = (historialResp.data ?? [])
    .map(cambioCrudo)
    .filter((cambio): cambio is CambioCrudo => cambio !== null);
  const actorIds = [
    inicialResp.data?.actor_id ?? null,
    sesionActiva?.operador_id ?? null,
    ...cambios.map((cambio) => cambio.actorId),
  ].filter((id): id is string => id !== null);
  const recursoIds = cambios.flatMap((cambio) => [
    cambio.anterior.recursoId,
    cambio.nuevo.recursoId,
  ]).filter((id): id is string => id !== null);

  const [actoresResp, recursosResp, grupoResp] = await Promise.all([
    actorIds.length > 0
      ? admin.from('usuarios').select('id, nombre_completo').in('id', [...new Set(actorIds)])
      : Promise.resolve({ data: [], error: null }),
    recursoIds.length > 0
      ? admin.from('recursos_planeacion').select('id, codigo, nombre').in('id', [...new Set(recursoIds)])
      : Promise.resolve({ data: [], error: null }),
    recursoResp.data.grupo_equipo_id
      ? admin
        .from('grupos_equipo')
        .select('codigo, nombre')
        .eq('id', recursoResp.data.grupo_equipo_id)
        .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);
  fallar(actoresResp.error);
  fallar(recursosResp.error);
  fallar(grupoResp.error);

  const actores = new Map(
    (actoresResp.data ?? []).map((actor) => [actor.id, actor.nombre_completo]),
  );
  const recursos = new Map(
    (recursosResp.data ?? []).map((recurso) => [
      recurso.id,
      `${recurso.codigo} · ${recurso.nombre}`,
    ]),
  );
  const horasReales = (sesionesResp.data ?? []).reduce(
    (total, sesion) => total + Number(sesion.horas_netas),
    0,
  );
  const horasEstimadas = Number(programacionResp.data.horas_estimadas);
  // Misma regla que reanudar_sesion_trabajo_a20: solo cuenta la última sesión.
  // Una pausa administrativa ya aprobada sigue en el historial con el motivo
  // limpio, y al reanudar aparece una sesión más reciente: en ambos casos el
  // botón de aprobación debe desaparecer.
  const ultimaSesion = sesionesOrdenadas[0];
  const pausaAdministrativaPendiente = ultimaSesion?.estado_sesion === 'pausada'
    && ultimaSesion?.motivo_pausa_codigo === 'PAUSA_ADMIN';

  // Cierre del módulo: la sesión en marcha ya trae quién la opera y desde cuándo;
  // la meta y sus avances acumulados dan el porcentaje. No se inventa ningún dato.
  let operacionEnCurso: DetalleProgramacion['operacionEnCurso'] = null;
  if (sesionActiva && programacionResp.data.meta_proceso_id
    && Number.isFinite(new Date(sesionActiva.fecha_inicio).getTime())) {
    const [metaResp, avancesResp] = await Promise.all([
      admin
        .from('metas_proceso_partida')
        .select('meta_piezas')
        .eq('id', programacionResp.data.meta_proceso_id)
        .maybeSingle(),
      admin
        .from('registros_avance_partida')
        .select('cantidad_producida')
        .eq('meta_proceso_id', programacionResp.data.meta_proceso_id),
    ]);
    fallar(metaResp.error);
    fallar(avancesResp.error);
    const metaPiezas = Number(metaResp.data?.meta_piezas ?? 0);
    const piezasProducidas = (avancesResp.data ?? []).reduce(
      (total, avance) => total + Number(avance.cantidad_producida),
      0,
    );
    operacionEnCurso = {
      operadorNombre: nombreActor(sesionActiva.operador_id, actores),
      horaInicio: horaTaller(sesionActiva.fecha_inicio),
      horasTranscurridas: horasTranscurridasSesion(sesionActiva.fecha_inicio, new Date()),
      piezasProducidas,
      metaPiezas,
      porcentajeAvance: metaPiezas > 0
        ? Math.min((piezasProducidas / metaPiezas) * 100, 100)
        : 0,
    };
  }

  return {
    responsableNombre: inicialResp.data
      ? nombreActor(inicialResp.data.actor_id, actores)
      : 'Responsable no disponible',
    recursoNombre: `${recursoResp.data.codigo} · ${recursoResp.data.nombre}`,
    grupoEquipoNombre: grupoResp.data
      ? `${grupoResp.data.codigo} · ${grupoResp.data.nombre}`
      : null,
    horasEstimadas,
    horasReales,
    horasExceso: Math.max(horasReales - horasEstimadas, 0),
    recursoLiberado: (sesionesResp.data ?? []).some((sesion) => sesion.recurso_liberado),
    pausaAdministrativaPendiente,
    operacionEnCurso,
    historial: cambios.map((cambio) => ({
      creadoEn: cambio.creadoEn,
      actorNombre: nombreActor(cambio.actorId, actores),
      motivo: cambio.motivo,
      anterior: {
        recurso: nombreRecurso(cambio.anterior.recursoId, recursos),
        fechaProgramada: cambio.anterior.fechaProgramada,
        turno: cambio.anterior.turno,
        horasEstimadas: cambio.anterior.horasEstimadas,
        ordenPrioridad: cambio.anterior.ordenPrioridad,
      },
      nuevo: {
        recurso: nombreRecurso(cambio.nuevo.recursoId, recursos),
        fechaProgramada: cambio.nuevo.fechaProgramada,
        turno: cambio.nuevo.turno,
        horasEstimadas: cambio.nuevo.horasEstimadas,
        ordenPrioridad: cambio.nuevo.ordenPrioridad,
      },
    })),
  };
}
