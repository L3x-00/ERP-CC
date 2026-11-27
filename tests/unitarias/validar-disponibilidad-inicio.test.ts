import { beforeEach, describe, expect, it, vi } from 'vitest';

const datos = vi.hoisted(() => ({
  tablas: {} as Record<string, unknown[]>,
  filtros: [] as Array<[string, unknown]>,
}));

vi.mock('@/modulos/produccion/acciones/utilidades-acciones', () => ({
  obtenerActorProduccion: vi.fn(async () => ({ id: 'operador-1' })),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({ can: vi.fn(async () => true) }));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({
    from: (tabla: string) => {
      const cadena: Record<string, unknown> = {
        select: () => cadena,
        eq: (columna: string, valor: unknown) => {
          datos.filtros.push([columna, valor]);
          return cadena;
        },
        or: () => cadena,
        order: () => cadena,
        limit: () => cadena,
        maybeSingle: () => Promise.resolve({ data: datos.tablas[tabla]?.[0] ?? null, error: null }),
        then: (resolver: (valor: unknown) => unknown, rechazar?: (error: unknown) => unknown) =>
          Promise.resolve({ data: datos.tablas[tabla] ?? [], error: null }).then(resolver, rechazar),
      };
      return cadena;
    },
  }),
}));

import { validarDisponibilidadInicioAccion } from '@/modulos/produccion/acciones/validar-disponibilidad-inicio';
import type { ResultadoDisponibilidadInicio } from '@/modulos/produccion/acciones/validar-disponibilidad-inicio';
import { mensajeSinDisponibilidad } from '@/modulos/produccion/utilidades/mensaje-disponibilidad';

function datosDe(respuesta: { exito: boolean; datos?: ResultadoDisponibilidadInicio; error?: string }) {
  if (!respuesta.exito || !respuesta.datos) throw new Error(respuesta.error ?? 'sin datos');
  return respuesta.datos;
}

const ORDEN = 'aaaaaaaa-1111-4111-8111-111111111111';
const PARTIDA = 'aaaaaaaa-2222-4111-8111-111111111112';
const META = 'aaaaaaaa-3333-4111-8111-111111111113';
const GRUPO = 'aaaaaaaa-4444-4111-8111-111111111114';
const PROCESO = 'aaaaaaaa-5555-4111-8111-111111111115';

const BASE = {
  partidas_orden_produccion: [{
    id: PARTIDA, orden_id: ORDEN, area_trabajo_codigo: 'LASER',
  }],
  areas_trabajo_config: [
    { codigo: 'LASER', nombre: 'Corte láser', padre_codigo: null, area_planeacion: 'sheet_metal' },
    { codigo: 'sheet_metal', nombre: 'Corte y lámina', padre_codigo: null, area_planeacion: 'sheet_metal' },
  ],
  grupos_equipo: [{ id: GRUPO, codigo: 'CL1', nombre: 'CORTE LASER' }],
  metas_proceso_partida: [{ id: META, nombre: 'CORTE LASER' }],
  catalogo_procesos: [{
    id: PROCESO, grupo_equipo_id: GRUPO, nombre: 'CORTE LASER', codigo: 'CORTE_LASER', orden: 1,
  }],
};

beforeEach(() => {
  datos.tablas = structuredClone(BASE);
  datos.filtros = [];
});

describe('validarDisponibilidadInicioAccion — aviso antes del checklist', () => {
  it('reporta disponible cuando hay equipo activo del grupo en el área macro', async () => {
    datos.tablas.recursos_planeacion = [{ id: 'r1', nombre: 'LASER-01' }];
    const respuesta = await validarDisponibilidadInicioAccion({
      ordenId: ORDEN, partidaId: PARTIDA, metaProcesoId: META,
    });
    expect(respuesta.exito).toBe(true);
    expect(datosDe(respuesta)).toMatchObject({ disponible: true });
    expect(datos.filtros).toContainEqual(['grupo_equipo_id', GRUPO]);
    expect(datos.filtros).toContainEqual(['area', 'sheet_metal']);
  });

  it('reporta sin equipo con nombres legibles y sin códigos técnicos en el mensaje', async () => {
    datos.tablas.recursos_planeacion = [];
    const respuesta = await validarDisponibilidadInicioAccion({
      ordenId: ORDEN, partidaId: PARTIDA, metaProcesoId: META,
    });
    const resultado = datosDe(respuesta);
    expect(resultado).toMatchObject({
      disponible: false, motivo: 'sin_equipos', grupoNombre: 'CORTE LASER', areaNombre: 'Corte láser',
    });
    const mensaje = mensajeSinDisponibilidad(resultado);
    expect(mensaje).toContain('CORTE LASER');
    expect(mensaje).toContain('Corte láser');
    expect(mensaje).not.toContain('sheet_metal');
  });
});
