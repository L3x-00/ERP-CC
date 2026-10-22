// Consulta informativa de disponibilidad: autorización, propiedad (IDOR), fallo
// cerrado y solo lectura. El cliente admin (RPC C9.3 + recursos mínimos) solo
// se crea tras verificar permiso, visibilidad RLS y estado de la revisión.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { canMock, obtenerUsuarioMock, clienteMock, adminMock } = vi.hoisted(() => ({
  canMock: vi.fn(),
  obtenerUsuarioMock: vi.fn(),
  clienteMock: vi.fn(),
  adminMock: vi.fn(),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => obtenerUsuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...argumentos: unknown[]) => canMock(...argumentos),
}));
vi.mock('@/nucleo/supabase/servidor', () => ({
  crearClienteSupabaseServidor: () => clienteMock(),
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => adminMock(),
}));

import { consultarDisponibilidadPropuestaAccion } from '@/modulos/propuestas/acciones/consultar-disponibilidad-propuesta';

const PROPUESTA_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const PROPUESTA_OTRA_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const REVISION_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const REVISION_OTRA_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

type Fila = Record<string, unknown>;
type Operacion = { tabla: string; metodo: string; argumentos: unknown[] };

/**
 * PostgREST mínimo: filtra por `eq`/`in`, resuelve como promesa o con
 * `maybeSingle`, y registra cada método invocado para comprobar que la
 * consulta no inserta, actualiza, borra ni llama RPC de escritura.
 */
function clienteFalso(
  tablas: Record<string, Fila[]>,
  opciones: {
    fallos?: Record<string, string>;
    rpc?: Record<string, { data: unknown; error: unknown }>;
    limitePagina?: number;
    paginaVaciaDesde?: Record<string, number>;
  } = {},
) {
  const operaciones: Operacion[] = [];
  const construirConsulta = (tabla: string, fuente: Fila[], errorInicial?: { message: string } | null) => {
      const filtros: ((fila: Fila) => boolean)[] = [];
      let inicio = 0;
      let fin = Number.MAX_SAFE_INTEGER;
      const resolver = () => {
        const fallo = opciones.fallos?.[tabla];
        if (fallo || errorInicial) return { data: null, error: errorInicial ?? { message: fallo! }, count: null };
        const filtradas = fuente.filter((fila) => filtros.every((f) => f(fila)));
        const vaciaDesde = opciones.paginaVaciaDesde?.[tabla];
        const hasta = Math.min(fin + 1, inicio + (opciones.limitePagina ?? Number.MAX_SAFE_INTEGER));
        return {
          data: vaciaDesde !== undefined && inicio >= vaciaDesde ? [] : filtradas.slice(inicio, hasta),
          error: null,
          count: filtradas.length,
        };
      };
      const registrar = (metodo: string, argumentos: unknown[]) =>
        operaciones.push({ tabla, metodo, argumentos });
      const cadena: Record<string, unknown> = {
        select: (...argumentos: unknown[]) => {
          registrar('select', argumentos);
          return cadena;
        },
        eq: (columna: string, valor: unknown) => {
          registrar('eq', [columna, valor]);
          filtros.push((fila) => fila[columna] === valor);
          return cadena;
        },
        in: (columna: string, valores: unknown[]) => {
          registrar('in', [columna, valores]);
          filtros.push((fila) => valores.includes(fila[columna]));
          return cadena;
        },
        order: (...argumentos: unknown[]) => {
          registrar('order', argumentos);
          return cadena;
        },
        range: (desde: number, hasta: number) => {
          registrar('range', [desde, hasta]);
          inicio = desde;
          fin = hasta;
          return cadena;
        },
        maybeSingle: async () => {
          const { data, error } = resolver();
          return { data: data?.[0] ?? null, error };
        },
        then: (resolve: (valor: unknown) => unknown, reject: (error: unknown) => unknown) =>
          Promise.resolve(resolver()).then(resolve, reject),
      };
      for (const metodo of ['insert', 'update', 'upsert', 'delete']) {
        cadena[metodo] = (...argumentos: unknown[]) => {
          registrar(metodo, argumentos);
          return cadena;
        };
      }
      return cadena;
  };
  const cliente = {
    from(tabla: string) {
      return construirConsulta(tabla, tablas[tabla] ?? []);
    },
    rpc: (nombre: string, argumentos: unknown) => {
      operaciones.push({ tabla: 'rpc', metodo: nombre, argumentos: [argumentos] });
      const respuesta = opciones.rpc?.[nombre] ?? { data: null, error: { message: 'rpc_no_esperada' } };
      return construirConsulta(nombre, Array.isArray(respuesta.data) ? respuesta.data : [], respuesta.error as { message: string } | null);
    },
  };
  return { cliente, operaciones };
}

function tablasComerciales(): Record<string, Fila[]> {
  return {
    propuestas: [
      { id: PROPUESTA_ID, accepted_revision_id: null },
      { id: PROPUESTA_OTRA_ID, accepted_revision_id: null },
    ],
    propuesta_revisiones: [
      { id: REVISION_ID, propuesta_id: PROPUESTA_ID, estado: 'SENT' },
      { id: REVISION_OTRA_ID, propuesta_id: PROPUESTA_OTRA_ID, estado: 'SENT' },
    ],
    propuesta_items: [
      { id: 'item-a', codigo: 'P-01', activo: true, es_descuento: false, revision_id: REVISION_ID },
      { id: 'item-b', codigo: 'P-02', activo: true, es_descuento: false, revision_id: REVISION_ID },
      { id: 'item-inactivo', codigo: 'P-09', activo: false, es_descuento: false, revision_id: REVISION_ID },
      { id: 'item-otra', codigo: 'X-01', activo: true, es_descuento: false, revision_id: REVISION_OTRA_ID },
    ],
    propuesta_item_ruteo: [
      { id: 'r1', item_id: 'item-a', proceso_id: 'p-router', grupo_equipo_id: 'g-router', setup_horas: 2, run_horas: 3, total_horas: 5 },
      { id: 'r2', item_id: 'item-b', proceso_id: 'p-router', grupo_equipo_id: null, setup_horas: 1, run_horas: 1, total_horas: 2 },
      { id: 'r3', item_id: 'item-inactivo', proceso_id: 'p-router', grupo_equipo_id: 'g-router', setup_horas: 9, run_horas: 9, total_horas: 18 },
      { id: 'r4', item_id: 'item-otra', proceso_id: 'p-router', grupo_equipo_id: 'g-router', setup_horas: 50, run_horas: 50, total_horas: 100 },
    ],
    catalogo_procesos: [{ id: 'p-router', codigo: 'ROUTER', nombre: 'CNC Router', grupo_equipo_id: 'g-router' }],
    grupos_equipo: [{ id: 'g-router', codigo: 'ROUTER', nombre: 'CNC Router', activo: true }],
  };
}

function filaCarga(parcial: Fila): Fila {
  return {
    recurso_id: 'rec-1',
    area: 'taller',
    fecha_programada: '2026-10-21',
    turno: 'matutino',
    horas_capacidad: 8,
    horas_programadas: 3,
    horas_reales: 0,
    horas_exceso: 0,
    horas_disponibles: 5,
    porcentaje_ocupacion: 37.5,
    sobrecargado: false,
    ...parcial,
  };
}

function adminFalso(opciones: { fallos?: Record<string, string>; rpcError?: string } = {}) {
  return clienteFalso(
    {
      recursos_planeacion: [
        { id: 'rec-1', grupo_equipo_id: 'g-router', activo: true },
        { id: 'rec-ajeno', grupo_equipo_id: 'g-otro', activo: true },
      ],
    },
    {
      ...(opciones.fallos ? { fallos: opciones.fallos } : {}),
      rpc: {
        obtener_carga_capacidad_diaria: opciones.rpcError
          ? { data: null, error: { message: opciones.rpcError } }
          : {
              data: [
                filaCarga({}),
                filaCarga({ recurso_id: 'rec-ajeno', horas_capacidad: 99, horas_disponibles: 99 }),
              ],
              error: null,
            },
      },
    },
  );
}

const USUARIO = { id: 'usuario-1', rol: 'vendedor', activo: true, permisos: [] };

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-21T18:00:00Z'));
  obtenerUsuarioMock.mockResolvedValue(USUARIO);
  canMock.mockResolvedValue(true);
});

function soloLectura(operaciones: Operacion[]) {
  for (const operacion of operaciones) {
    expect(['insert', 'update', 'upsert', 'delete']).not.toContain(operacion.metodo);
  }
}

describe('consultarDisponibilidadPropuestaAccion — resumen', () => {
  it('lee todos los renglones aun cuando la API limita cada página', async () => {
    const tablas = tablasComerciales();
    tablas.propuesta_item_ruteo = Array.from({ length: 1203 }, (_, indice) => ({
      id: `r-${indice}`, item_id: 'item-a', proceso_id: 'p-router', grupo_equipo_id: 'g-router',
      setup_horas: 0, run_horas: 1, total_horas: 1,
    }));
    clienteMock.mockResolvedValue(clienteFalso(tablas, { limitePagina: 200 }).cliente);
    adminMock.mockReturnValue(adminFalso().cliente);

    const respuesta = await consultarDisponibilidadPropuestaAccion({ propuestaId: PROPUESTA_ID, revisionId: REVISION_ID });
    expect(respuesta.exito).toBe(true);
    if (respuesta.exito) expect(respuesta.datos?.grupos[0]?.horasRequeridas).toBe(1203);
  });

  it('rechaza la consulta si falta una página anunciada en vez de mostrar datos parciales', async () => {
    const servidor = clienteFalso(tablasComerciales(), {
      limitePagina: 1,
      paginaVaciaDesde: { propuesta_item_ruteo: 1 },
    });
    clienteMock.mockResolvedValue(servidor.cliente);
    const respuesta = await consultarDisponibilidadPropuestaAccion({ propuestaId: PROPUESTA_ID, revisionId: REVISION_ID });
    expect(respuesta.exito).toBe(false);
    expect(adminMock).not.toHaveBeenCalled();
  });

  it('lee todas las páginas de capacidad de los recursos requeridos', async () => {
    const servidor = clienteFalso(tablasComerciales());
    const admin = clienteFalso({ recursos_planeacion: [
      { id: 'rec-1', grupo_equipo_id: 'g-router', activo: true },
      { id: 'rec-2', grupo_equipo_id: 'g-router', activo: true },
    ] }, {
      limitePagina: 1,
      rpc: { obtener_carga_capacidad_diaria: {
        data: [filaCarga({}), filaCarga({ recurso_id: 'rec-2' })], error: null,
      } },
    });
    clienteMock.mockResolvedValue(servidor.cliente);
    adminMock.mockReturnValue(admin.cliente);
    const respuesta = await consultarDisponibilidadPropuestaAccion({ propuestaId: PROPUESTA_ID, revisionId: REVISION_ID });
    expect(respuesta.exito).toBe(true);
    if (respuesta.exito) expect(respuesta.datos?.grupos[0]?.horasCapacidad).toBe(16);
    expect(admin.operaciones).toContainEqual({
      tabla: 'obtener_carga_capacidad_diaria', metodo: 'range', argumentos: [1, 500],
    });
  });

  it('agrega el ruteo real de la revisión exacta y la capacidad C9.3 del grupo', async () => {
    const servidor = clienteFalso(tablasComerciales());
    const admin = adminFalso();
    clienteMock.mockResolvedValue(servidor.cliente);
    adminMock.mockReturnValue(admin.cliente);

    const respuesta = await consultarDisponibilidadPropuestaAccion({
      propuestaId: PROPUESTA_ID,
      revisionId: REVISION_ID,
    });

    expect(respuesta.exito).toBe(true);
    if (!respuesta.exito) return;
    expect(respuesta.datos).toEqual({
      revisionId: REVISION_ID,
      fechaInicio: '2026-10-21',
      fechaFin: '2026-11-03',
      dias: 14,
      zonaHoraria: 'America/Tijuana',
      grupos: [
        {
          codigo: 'ROUTER',
          nombre: 'CNC Router',
          horasRequeridas: 7,
          estado: 'con_capacidad',
          horasCapacidad: 8,
          horasCarga: 3,
          horasDisponibles: 5,
          turnosSobrecargados: 0,
          recursosSinTurno: 0,
        },
      ],
      procesosSinGrupo: [],
      itemsSinRuteo: [],
      sinItemsActivos: false,
    });
    // Nada de recursos ni IDs de terceros en la respuesta.
    expect(JSON.stringify(respuesta.datos)).not.toMatch(/rec-1|rec-ajeno|g-router/);
  });

  it('llama la RPC C9.3 con sus parámetros reales y el horizonte de 14 días', async () => {
    const servidor = clienteFalso(tablasComerciales());
    const admin = adminFalso();
    clienteMock.mockResolvedValue(servidor.cliente);
    adminMock.mockReturnValue(admin.cliente);

    await consultarDisponibilidadPropuestaAccion({ propuestaId: PROPUESTA_ID, revisionId: REVISION_ID });

    const rpc = admin.operaciones.filter((operacion) => operacion.tabla === 'rpc');
    expect(rpc).toEqual([
      {
        tabla: 'rpc',
        metodo: 'obtener_carga_capacidad_diaria',
        argumentos: [{ p_fecha_inicio: '2026-10-21', p_fecha_fin: '2026-11-03' }],
      },
    ]);
    // Recursos: solo columnas mínimas, activos y de los grupos requeridos.
    const seleccion = admin.operaciones.find(
      (operacion) => operacion.tabla === 'recursos_planeacion' && operacion.metodo === 'select',
    );
    expect(seleccion?.argumentos[0]).toBe('id, grupo_equipo_id');
    expect(admin.operaciones).toContainEqual({
      tabla: 'recursos_planeacion',
      metodo: 'in',
      argumentos: ['grupo_equipo_id', ['g-router']],
    });
  });

  it('es solo lectura: no inserta, actualiza ni borra en ninguna tabla', async () => {
    const servidor = clienteFalso(tablasComerciales());
    const admin = adminFalso();
    clienteMock.mockResolvedValue(servidor.cliente);
    adminMock.mockReturnValue(admin.cliente);

    await consultarDisponibilidadPropuestaAccion({ propuestaId: PROPUESTA_ID, revisionId: REVISION_ID });

    soloLectura(servidor.operaciones);
    soloLectura(admin.operaciones);
    expect(servidor.operaciones.some((operacion) => operacion.tabla === 'rpc')).toBe(false);
  });

  it('acepta revisiones en seguimiento (FOLLOW_UP)', async () => {
    const tablas = tablasComerciales();
    tablas.propuesta_revisiones![0]!.estado = 'FOLLOW_UP';
    clienteMock.mockResolvedValue(clienteFalso(tablas).cliente);
    adminMock.mockReturnValue(adminFalso().cliente);

    const respuesta = await consultarDisponibilidadPropuestaAccion({
      propuestaId: PROPUESTA_ID,
      revisionId: REVISION_ID,
    });

    expect(respuesta.exito).toBe(true);
  });

  it('sin ruteo devuelve información incompleta sin crear el cliente admin', async () => {
    const tablas = tablasComerciales();
    tablas.propuesta_item_ruteo = [];
    clienteMock.mockResolvedValue(clienteFalso(tablas).cliente);

    const respuesta = await consultarDisponibilidadPropuestaAccion({
      propuestaId: PROPUESTA_ID,
      revisionId: REVISION_ID,
    });

    expect(respuesta.exito).toBe(true);
    if (!respuesta.exito) return;
    expect(respuesta.datos?.grupos).toEqual([]);
    expect(respuesta.datos?.itemsSinRuteo).toEqual(['P-01', 'P-02']);
    expect(adminMock).not.toHaveBeenCalled();
  });
});

describe('consultarDisponibilidadPropuestaAccion — autorización e IDOR', () => {
  it('rechaza una entrada inválida o con datos de capacidad del cliente sin tocar la base', async () => {
    for (const entrada of [
      { propuestaId: 'no-uuid', revisionId: REVISION_ID },
      { propuestaId: PROPUESTA_ID },
      { propuestaId: PROPUESTA_ID, revisionId: REVISION_ID, grupos: [{ codigo: 'ROUTER', horas: 1 }] },
    ]) {
      const respuesta = await consultarDisponibilidadPropuestaAccion(entrada);
      expect(respuesta.exito).toBe(false);
    }
    expect(obtenerUsuarioMock).not.toHaveBeenCalled();
    expect(clienteMock).not.toHaveBeenCalled();
    expect(adminMock).not.toHaveBeenCalled();
  });

  it('rechaza sin sesión', async () => {
    obtenerUsuarioMock.mockResolvedValue(null);

    const respuesta = await consultarDisponibilidadPropuestaAccion({
      propuestaId: PROPUESTA_ID,
      revisionId: REVISION_ID,
    });

    expect(respuesta).toEqual({ exito: false, error: 'No autorizado' });
    expect(clienteMock).not.toHaveBeenCalled();
    expect(adminMock).not.toHaveBeenCalled();
  });

  it.each(['propuesta_vista', 'propuesta_aceptar'])('exige el permiso %s', async (permiso) => {
    canMock.mockImplementation(async (_usuario: unknown, solicitado: string) => solicitado !== permiso);

    const respuesta = await consultarDisponibilidadPropuestaAccion({
      propuestaId: PROPUESTA_ID,
      revisionId: REVISION_ID,
    });

    expect(respuesta.exito).toBe(false);
    expect(clienteMock).not.toHaveBeenCalled();
    expect(adminMock).not.toHaveBeenCalled();
  });

  it('rechaza una propuesta no visible por RLS con un mensaje genérico', async () => {
    const tablas = tablasComerciales();
    tablas.propuestas = [];
    clienteMock.mockResolvedValue(clienteFalso(tablas).cliente);

    const respuesta = await consultarDisponibilidadPropuestaAccion({
      propuestaId: PROPUESTA_ID,
      revisionId: REVISION_ID,
    });

    expect(respuesta).toEqual({ exito: false, error: 'La revisión no está disponible para consultar' });
    expect(adminMock).not.toHaveBeenCalled();
  });

  it('rechaza una revisión de otra propuesta (IDOR) con el mismo mensaje', async () => {
    clienteMock.mockResolvedValue(clienteFalso(tablasComerciales()).cliente);

    const respuesta = await consultarDisponibilidadPropuestaAccion({
      propuestaId: PROPUESTA_ID,
      revisionId: REVISION_OTRA_ID,
    });

    expect(respuesta).toEqual({ exito: false, error: 'La revisión no está disponible para consultar' });
    expect(adminMock).not.toHaveBeenCalled();
  });

  it('rechaza una revisión no visible por RLS', async () => {
    const tablas = tablasComerciales();
    tablas.propuesta_revisiones = [];
    clienteMock.mockResolvedValue(clienteFalso(tablas).cliente);

    const respuesta = await consultarDisponibilidadPropuestaAccion({
      propuestaId: PROPUESTA_ID,
      revisionId: REVISION_ID,
    });

    expect(respuesta.exito).toBe(false);
    expect(adminMock).not.toHaveBeenCalled();
  });

  it.each(['DRAFT', 'READY_TO_SEND', 'ACCEPTED', 'REJECTED', 'CLOSED'])(
    'rechaza una revisión en estado %s',
    async (estado) => {
      const tablas = tablasComerciales();
      tablas.propuesta_revisiones![0]!.estado = estado;
      clienteMock.mockResolvedValue(clienteFalso(tablas).cliente);

      const respuesta = await consultarDisponibilidadPropuestaAccion({
        propuestaId: PROPUESTA_ID,
        revisionId: REVISION_ID,
      });

      expect(respuesta.exito).toBe(false);
      expect(adminMock).not.toHaveBeenCalled();
    },
  );

  it('rechaza una propuesta ya aceptada', async () => {
    const tablas = tablasComerciales();
    tablas.propuestas![0]!.accepted_revision_id = REVISION_OTRA_ID;
    clienteMock.mockResolvedValue(clienteFalso(tablas).cliente);

    const respuesta = await consultarDisponibilidadPropuestaAccion({
      propuestaId: PROPUESTA_ID,
      revisionId: REVISION_ID,
    });

    expect(respuesta.exito).toBe(false);
    expect(adminMock).not.toHaveBeenCalled();
  });
});

describe('consultarDisponibilidadPropuestaAccion — fallo cerrado', () => {
  const ERROR_GENERICO = { exito: false, error: 'No se pudo consultar la disponibilidad. Inténtalo de nuevo.' };

  it.each(['propuestas', 'propuesta_revisiones', 'propuesta_items', 'propuesta_item_ruteo', 'catalogo_procesos', 'grupos_equipo'])(
    'falla cerrado si la lectura RLS de %s falla (sin convertirla en lista vacía)',
    async (tabla) => {
      const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      clienteMock.mockResolvedValue(
        clienteFalso(tablasComerciales(), { fallos: { [tabla]: 'permission denied for table x' } }).cliente,
      );
      adminMock.mockReturnValue(adminFalso().cliente);

      const respuesta = await consultarDisponibilidadPropuestaAccion({
        propuestaId: PROPUESTA_ID,
        revisionId: REVISION_ID,
      });

      expect(respuesta).toEqual(ERROR_GENERICO);
      expect(JSON.stringify(respuesta)).not.toContain('permission denied');
      expect(consola).toHaveBeenCalled();
      consola.mockRestore();
    },
  );

  it('falla cerrado si la lectura de recursos falla', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    clienteMock.mockResolvedValue(clienteFalso(tablasComerciales()).cliente);
    adminMock.mockReturnValue(adminFalso({ fallos: { recursos_planeacion: 'boom' } }).cliente);

    const respuesta = await consultarDisponibilidadPropuestaAccion({
      propuestaId: PROPUESTA_ID,
      revisionId: REVISION_ID,
    });

    expect(respuesta).toEqual(ERROR_GENERICO);
    consola.mockRestore();
  });

  it('falla cerrado si la RPC de capacidad falla', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    clienteMock.mockResolvedValue(clienteFalso(tablasComerciales()).cliente);
    adminMock.mockReturnValue(adminFalso({ rpcError: 'rango_fechas_invalido' }).cliente);

    const respuesta = await consultarDisponibilidadPropuestaAccion({
      propuestaId: PROPUESTA_ID,
      revisionId: REVISION_ID,
    });

    expect(respuesta).toEqual(ERROR_GENERICO);
    consola.mockRestore();
  });

  it('falla cerrado si crear la sesión del servidor revienta', async () => {
    const consola = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    clienteMock.mockRejectedValue(new Error('cookies'));

    const respuesta = await consultarDisponibilidadPropuestaAccion({
      propuestaId: PROPUESTA_ID,
      revisionId: REVISION_ID,
    });

    expect(respuesta).toEqual(ERROR_GENERICO);
    expect(adminMock).not.toHaveBeenCalled();
    consola.mockRestore();
  });
});
