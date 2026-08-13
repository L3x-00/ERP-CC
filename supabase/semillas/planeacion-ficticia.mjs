import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const identificadores = {
  cliente: '60000000-0000-4000-8000-000000000001',
  ordenes: [
    '60000000-0000-4000-8000-000000000101',
    '60000000-0000-4000-8000-000000000102',
    '60000000-0000-4000-8000-000000000103',
  ],
  partidas: [
    '60000000-0000-4000-8000-000000000201',
    '60000000-0000-4000-8000-000000000202',
    '60000000-0000-4000-8000-000000000203',
  ],
  recursos: [
    '60000000-0000-4000-8000-000000000301',
    '60000000-0000-4000-8000-000000000302',
    '60000000-0000-4000-8000-000000000303',
    '60000000-0000-4000-8000-000000000304',
  ],
};

function cargarEntornoLocal() {
  const ruta = '.env.local';
  if (!existsSync(ruta)) return;

  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
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

async function verificarDatosFicticios(cliente) {
  const [clientes, ordenes, partidas, recursos, capacidades, excepciones, programaciones] =
    await Promise.all([
      cliente.from('clientes').select('id', { count: 'exact', head: true }).eq('id', identificadores.cliente),
      cliente
        .from('ordenes_produccion')
        .select('id', { count: 'exact', head: true })
        .in('id', identificadores.ordenes),
      cliente
        .from('partidas_orden_produccion')
        .select('id', { count: 'exact', head: true })
        .in('id', identificadores.partidas),
      cliente
        .from('recursos_planeacion')
        .select('id', { count: 'exact', head: true })
        .in('id', identificadores.recursos),
      cliente
        .from('capacidades_recurso_turno')
        .select('recurso_id', { count: 'exact', head: true })
        .in('recurso_id', identificadores.recursos),
      cliente
        .from('excepciones_capacidad_recurso')
        .select('id', { count: 'exact', head: true })
        .in('recurso_id', identificadores.recursos),
      cliente
        .from('programacion_areas')
        .select('id', { count: 'exact', head: true })
        .in('partida_id', identificadores.partidas),
    ]);

  const respuestas = [clientes, ordenes, partidas, recursos, capacidades, excepciones, programaciones];
  asegurar(respuestas.every((respuesta) => !respuesta.error), 'No se pudieron verificar los datos ficticios.');

  const resultado = {
    cliente: clientes.count ?? 0,
    ordenes: ordenes.count ?? 0,
    partidas: partidas.count ?? 0,
    recursos: recursos.count ?? 0,
    capacidades: capacidades.count ?? 0,
    excepciones: excepciones.count ?? 0,
    programaciones: programaciones.count ?? 0,
  };

  asegurar(resultado.cliente === 1, 'Falta el cliente ficticio de Planeación.');
  asegurar(resultado.ordenes === 3, 'Faltan órdenes ficticias de Planeación.');
  asegurar(resultado.partidas === 3, 'Faltan partidas ficticias de Planeación.');
  asegurar(resultado.recursos === 4, 'Faltan recursos ficticios de Planeación.');
  asegurar(resultado.capacidades === 8, 'La capacidad ficticia por turno está incompleta.');
  asegurar(resultado.excepciones === 1, 'Falta la excepción ficticia de capacidad.');
  asegurar(resultado.programaciones === 3, 'Faltan programaciones ficticias de Planeación.');

  return resultado;
}

async function sembrarDatosFicticios(cliente) {
  const recursos = [
    {
      id: identificadores.recursos[0],
      codigo: 'SIM-PLN-LASER-01',
      nombre: 'Simulación láser fibra 3 kW',
      area: 'sheet_metal',
      activo: true,
    },
    {
      id: identificadores.recursos[1],
      codigo: 'SIM-PLN-CNC-01',
      nombre: 'Simulación centro CNC vertical',
      area: 'taller',
      activo: true,
    },
    {
      id: identificadores.recursos[2],
      codigo: 'SIM-PLN-ACAB-01',
      nombre: 'Simulación celda de acabados',
      area: 'acabados',
      activo: true,
    },
    {
      id: identificadores.recursos[3],
      codigo: 'SIM-PLN-EXT-01',
      nombre: 'Simulación capacidad externa',
      area: 'ext',
      activo: true,
    },
  ];

  const capacidades = [
    [identificadores.recursos[0], 'matutino', 8],
    [identificadores.recursos[0], 'vespertino', 8],
    [identificadores.recursos[1], 'matutino', 8],
    [identificadores.recursos[1], 'vespertino', 8],
    [identificadores.recursos[2], 'matutino', 6],
    [identificadores.recursos[2], 'vespertino', 6],
    [identificadores.recursos[3], 'matutino', 8],
    [identificadores.recursos[3], 'vespertino', 8],
  ].map(([recursoId, turno, horasCapacidad]) => ({
    recurso_id: recursoId,
    turno,
    horas_capacidad: horasCapacidad,
  }));

  const { error: errorCliente } = await cliente.from('clientes').upsert(
    {
      id: identificadores.cliente,
      nombre_comercial: 'SIM-PLN — Cliente ficticio de Planeación',
      razon_social: 'Datos ficticios de desarrollo Planeación SA de CV',
      rfc: 'XAXX010101000',
      estado: 'activo',
      correo: 'sim-planeacion@datos-ficticios.invalid',
    },
    { onConflict: 'id' },
  );
  if (errorCliente) throw new Error(`No se creó cliente ficticio: ${errorCliente.message}`);

  const { error: errorOrdenes } = await cliente.from('ordenes_produccion').upsert(
    [
      {
        id: identificadores.ordenes[0],
        folio: 'OP-900101',
        cliente_id: identificadores.cliente,
        estado: 'programada',
        prioridad: 'alta',
        fecha_compromiso: '2026-09-18T18:00:00.000Z',
      },
      {
        id: identificadores.ordenes[1],
        folio: 'OP-900102',
        cliente_id: identificadores.cliente,
        estado: 'programada',
        prioridad: 'normal',
        fecha_compromiso: '2026-09-19T18:00:00.000Z',
      },
      {
        id: identificadores.ordenes[2],
        folio: 'OP-900103',
        cliente_id: identificadores.cliente,
        estado: 'programada',
        prioridad: 'urgente',
        fecha_compromiso: '2026-09-17T18:00:00.000Z',
      },
    ],
    { onConflict: 'id' },
  );
  if (errorOrdenes) throw new Error(`No se crearon órdenes ficticias: ${errorOrdenes.message}`);

  const { error: errorPartidas } = await cliente.from('partidas_orden_produccion').upsert(
    [
      {
        id: identificadores.partidas[0],
        orden_id: identificadores.ordenes[0],
        codigo_pieza: 'SIM-PLN-LASER-001',
        descripcion: 'Placa ficticia para validar capacidad de láser',
        cantidad_solicitada: 12,
        unidad_medida: 'pieza',
        tiempo_estimado_minutos: 270,
      },
      {
        id: identificadores.partidas[1],
        orden_id: identificadores.ordenes[1],
        codigo_pieza: 'SIM-PLN-CNC-001',
        descripcion: 'Soporte ficticio para validar capacidad CNC',
        cantidad_solicitada: 8,
        unidad_medida: 'pieza',
        tiempo_estimado_minutos: 360,
      },
      {
        id: identificadores.partidas[2],
        orden_id: identificadores.ordenes[2],
        codigo_pieza: 'SIM-PLN-ACAB-001',
        descripcion: 'Componente ficticio urgente para validar acabados',
        cantidad_solicitada: 20,
        unidad_medida: 'pieza',
        tiempo_estimado_minutos: 120,
      },
    ],
    { onConflict: 'id' },
  );
  if (errorPartidas) throw new Error(`No se crearon partidas ficticias: ${errorPartidas.message}`);

  const { error: errorRecursos } = await cliente
    .from('recursos_planeacion')
    .upsert(recursos, { onConflict: 'id' });
  if (errorRecursos) throw new Error(`No se crearon recursos ficticios: ${errorRecursos.message}`);

  const { error: errorCapacidades } = await cliente
    .from('capacidades_recurso_turno')
    .upsert(capacidades, { onConflict: 'recurso_id,turno' });
  if (errorCapacidades) throw new Error(`No se crearon capacidades ficticias: ${errorCapacidades.message}`);

  const { error: errorExcepcion } = await cliente
    .from('excepciones_capacidad_recurso')
    .upsert(
      {
        recurso_id: identificadores.recursos[3],
        fecha: '2026-09-16',
        turno: 'matutino',
        horas_capacidad: 0,
        motivo: 'Mantenimiento ficticio de capacidad externa',
      },
      { onConflict: 'recurso_id,fecha,turno' },
    );
  if (errorExcepcion) throw new Error(`No se creó excepción ficticia: ${errorExcepcion.message}`);

  const programaciones = [
    {
      ordenId: identificadores.ordenes[0],
      partidaId: identificadores.partidas[0],
      recursoId: identificadores.recursos[0],
      fechaProgramada: '2026-09-15',
      turno: 'matutino',
      horasEstimadas: 4.5,
      ordenPrioridad: 2,
    },
    {
      ordenId: identificadores.ordenes[1],
      partidaId: identificadores.partidas[1],
      recursoId: identificadores.recursos[1],
      fechaProgramada: '2026-09-15',
      turno: 'matutino',
      horasEstimadas: 6,
      ordenPrioridad: 3,
    },
    {
      ordenId: identificadores.ordenes[2],
      partidaId: identificadores.partidas[2],
      recursoId: identificadores.recursos[2],
      fechaProgramada: '2026-09-16',
      turno: 'vespertino',
      horasEstimadas: 2,
      ordenPrioridad: 1,
    },
  ];

  for (const programacion of programaciones) {
    const { data: existente, error: errorExistente } = await cliente
      .from('programacion_areas')
      .select('id')
      .eq('partida_id', programacion.partidaId)
      .eq('recurso_id', programacion.recursoId)
      .maybeSingle();
    if (errorExistente) throw new Error(`No se verificó programación ficticia: ${errorExistente.message}`);
    if (existente) continue;

    const { error: errorProgramacion } = await cliente.rpc('programar_partida_recurso', {
      p_orden_id: programacion.ordenId,
      p_partida_id: programacion.partidaId,
      p_recurso_id: programacion.recursoId,
      p_secuencia: 1,
      p_fecha_programada: programacion.fechaProgramada,
      p_turno: programacion.turno,
      p_horas_estimadas: programacion.horasEstimadas,
      p_orden_prioridad: programacion.ordenPrioridad,
    });
    if (errorProgramacion) {
      throw new Error(`No se creó programación ficticia: ${errorProgramacion.message}`);
    }
  }
}

async function ejecutar() {
  cargarEntornoLocal();
  const soloVerificar = process.argv.includes('--verificar');

  asegurar(process.env.NODE_ENV !== 'production', 'La semilla ficticia no puede ejecutarse en producción.');

  if (!soloVerificar) {
    asegurar(
      process.env.CONFIRMAR_DATOS_FICTICIOS === 'si',
      'Define CONFIRMAR_DATOS_FICTICIOS=si para sembrar datos ficticios persistentes.',
    );
  }

  const cliente = createClient(
    requerirVariable('NEXT_PUBLIC_SUPABASE_URL'),
    requerirVariable('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );

  if (!soloVerificar) {
    await sembrarDatosFicticios(cliente);
  }

  const resultado = await verificarDatosFicticios(cliente);
  console.log(JSON.stringify({ modo: soloVerificar ? 'verificación' : 'siembra', ...resultado }));
}

ejecutar().catch((error) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : 'Fallo desconocido' }));
  process.exitCode = 1;
});
