import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

const identificadores = {
  ordenes: [
    '60000000-0000-4000-8000-000000000104',
    '60000000-0000-4000-8000-000000000105',
    '60000000-0000-4000-8000-000000000106',
  ],
  partidas: [
    '60000000-0000-4000-8000-000000000204',
    '60000000-0000-4000-8000-000000000205',
    '60000000-0000-4000-8000-000000000206',
  ],
  cliente: '60000000-0000-4000-8000-000000000001',
  recurso: '60000000-0000-4000-8000-000000000302',
  correoOperador: 'sim-produccion@datos-ficticios.invalid',
};

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

async function obtenerOCrearOperadorFicticio(cliente) {
  const { data: perfil, error: errorPerfil } = await cliente
    .from('usuarios')
    .select('id')
    .eq('email', identificadores.correoOperador)
    .maybeSingle();
  if (errorPerfil) throw new Error(`No se pudo consultar al operador ficticio: ${errorPerfil.message}`);

  let operadorId = perfil?.id;
  if (!operadorId) {
    const { data: usuariosAuth, error: errorUsuariosAuth } = await cliente.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (errorUsuariosAuth) throw new Error(`No se pudo consultar Auth: ${errorUsuariosAuth.message}`);
    operadorId = usuariosAuth.users.find((usuario) => usuario.email === identificadores.correoOperador)?.id;
  }
  if (!operadorId) {
    const { data, error } = await cliente.auth.admin.createUser({
      email: identificadores.correoOperador,
      password: randomBytes(32).toString('base64url'),
      email_confirm: true,
      user_metadata: { nombre_completo: 'Operador ficticio de Producción' },
    });
    if (error || !data.user) throw new Error(`No se pudo crear operador ficticio: ${error?.message ?? 'sin usuario'}`);
    operadorId = data.user.id;
  }

  const { error: errorActualizar } = await cliente
    .from('usuarios')
    .upsert({
      id: operadorId,
      email: identificadores.correoOperador,
      nombre_completo: 'Operador ficticio de Producción',
      rol: 'operador',
      activo: true,
      pin_operador: await bcrypt.hash('7391', 10),
    }, { onConflict: 'id' });
  if (errorActualizar) throw new Error(`No se pudo preparar operador ficticio: ${errorActualizar.message}`);
  return operadorId;
}

async function asegurarProgramacionPreparada(cliente, operadorId) {
  const { data: programacion, error: errorProgramacion } = await cliente
    .from('programacion_areas')
    .select('id, recurso_id, estado_planeacion, actualizado_en')
    .eq('partida_id', identificadores.partidas[0])
    .order('creado_en')
    .limit(1)
    .maybeSingle();
  if (errorProgramacion) throw new Error(`No se pudo consultar programación ficticia: ${errorProgramacion.message}`);

  let actual = programacion;
  if (!actual) {
    const { error } = await cliente.rpc('programar_partida_recurso', {
      p_orden_id: identificadores.ordenes[0],
      p_partida_id: identificadores.partidas[0],
      p_recurso_id: identificadores.recurso,
      p_secuencia: 1,
      p_fecha_programada: '2026-09-22',
      p_turno: 'matutino',
      p_horas_estimadas: 3,
      p_orden_prioridad: 1,
    });
    if (error) throw new Error(`No se pudo crear programación de Producción: ${error.message}`);
    const { data, error: errorRelectura } = await cliente
      .from('programacion_areas')
      .select('id, recurso_id, estado_planeacion, actualizado_en')
      .eq('partida_id', identificadores.partidas[0])
      .eq('recurso_id', identificadores.recurso)
      .single();
    if (errorRelectura || !data) throw new Error(`No se pudo releer programación ficticia: ${errorRelectura?.message ?? 'sin programación'}`);
    actual = data;
  }

  if (actual.estado_planeacion === 'programada' && actual.recurso_id !== identificadores.recurso) {
    const { error } = await cliente.rpc('reprogramar_partida_recurso', {
      p_programacion_id: actual.id,
      p_recurso_id: identificadores.recurso,
      p_fecha_programada: '2026-09-22',
      p_turno: 'matutino',
      p_horas_estimadas: 3,
      p_orden_prioridad: 1,
      p_actualizado_en_esperado: actual.actualizado_en,
    });
    if (error) throw new Error(`No se pudo recuperar programación ficticia: ${error.message}`);
    const { data, error: errorRelectura } = await cliente
      .from('programacion_areas')
      .select('id, recurso_id, estado_planeacion, actualizado_en')
      .eq('id', actual.id)
      .single();
    if (errorRelectura || !data) throw new Error(`No se pudo releer programación recuperada: ${errorRelectura?.message ?? 'sin programación'}`);
    actual = data;
  }
  if (actual.estado_planeacion === 'programada') {
    const { error } = await cliente.rpc('activar_modo_preparacion', {
      p_programacion_id: actual.id,
      p_actualizado_en_esperado: actual.actualizado_en,
    });
    if (error) throw new Error(`No se pudo preparar recurso ficticio: ${error.message}`);
  }

  const { error: errorAsignar } = await cliente.rpc('asignar_operador_a_partida_op', {
    p_partida_id: identificadores.partidas[0],
    p_operador_id: operadorId,
  });
  if (errorAsignar) throw new Error(`No se pudo asignar operador ficticio: ${errorAsignar.message}`);
}

async function asegurarNota(cliente, ordenId, partidaId, operadorId, cantidad) {
  const { count, error: errorExistente } = await cliente
    .from('notas_entrega')
    .select('id', { count: 'exact', head: true })
    .eq('orden_id', ordenId);
  if (errorExistente) throw new Error(`No se pudo consultar nota ficticia: ${errorExistente.message}`);
  if ((count ?? 0) > 0) return;

  const { error } = await cliente.rpc('generar_nota_entrega', {
    p_orden_id: ordenId,
    p_recibido_por: 'Recepción ficticia de desarrollo',
    p_firma_cliente_url: '',
    p_creado_por: operadorId,
    p_partidas: [{ partida_id: partidaId, cantidad_entregada: cantidad }],
  });
  if (error) throw new Error(`No se pudo generar nota ficticia: ${error.message}`);
}

async function sembrarDatosFicticios(cliente) {
  const { data: recurso, error: errorRecurso } = await cliente
    .from('recursos_planeacion')
    .select('id')
    .eq('id', identificadores.recurso)
    .maybeSingle();
  if (errorRecurso || !recurso) {
    throw new Error('Primero ejecuta la semilla de Planeación: faltan los recursos SIM-PLN.');
  }
  const operadorId = await obtenerOCrearOperadorFicticio(cliente);
  const { error: errorOrdenes } = await cliente.from('ordenes_produccion').upsert([
    {
      id: identificadores.ordenes[0], folio: 'OP-900104', cliente_id: identificadores.cliente,
      estado: 'programada', prioridad: 'alta', fecha_compromiso: '2026-09-22T18:00:00.000Z',
    },
    {
      id: identificadores.ordenes[1], folio: 'OP-900105', cliente_id: identificadores.cliente,
      estado: 'completada', prioridad: 'normal', fecha_compromiso: '2026-09-12T18:00:00.000Z',
    },
    {
      id: identificadores.ordenes[2], folio: 'OP-900106', cliente_id: identificadores.cliente,
      estado: 'completada', prioridad: 'normal', fecha_compromiso: '2026-09-10T18:00:00.000Z',
    },
  ], { onConflict: 'id', ignoreDuplicates: true });
  if (errorOrdenes) throw new Error(`No se crearon órdenes ficticias de Producción: ${errorOrdenes.message}`);

  const { error: errorPartidas } = await cliente.from('partidas_orden_produccion').upsert([
    {
      id: identificadores.partidas[0], orden_id: identificadores.ordenes[0], codigo_pieza: 'SIM-PRD-OPERAR-001',
      descripcion: 'Pieza ficticia preparada para iniciar sesión de piso', cantidad_solicitada: 6,
      cantidad_producida: 0, cantidad_scrap: 0, unidad_medida: 'pieza', tiempo_estimado_minutos: 180,
      tiempo_real_minutos: 0, operador_asignado_id: operadorId,
    },
    {
      id: identificadores.partidas[1], orden_id: identificadores.ordenes[1], codigo_pieza: 'SIM-PRD-PARCIAL-001',
      descripcion: 'Pieza ficticia con entrega parcial persistente', cantidad_solicitada: 10, cantidad_producida: 10,
      cantidad_scrap: 0, unidad_medida: 'pieza', tiempo_estimado_minutos: 240, tiempo_real_minutos: 225,
    },
    {
      id: identificadores.partidas[2], orden_id: identificadores.ordenes[2], codigo_pieza: 'SIM-PRD-ENTREGADA-001',
      descripcion: 'Pieza ficticia entregada totalmente', cantidad_solicitada: 4, cantidad_producida: 4,
      cantidad_scrap: 0, unidad_medida: 'pieza', tiempo_estimado_minutos: 90, tiempo_real_minutos: 80,
    },
  ], { onConflict: 'id', ignoreDuplicates: true });
  if (errorPartidas) throw new Error(`No se crearon partidas ficticias de Producción: ${errorPartidas.message}`);

  await asegurarProgramacionPreparada(cliente, operadorId);
  await asegurarNota(cliente, identificadores.ordenes[1], identificadores.partidas[1], operadorId, 4);
  await asegurarNota(cliente, identificadores.ordenes[2], identificadores.partidas[2], operadorId, 4);
}

async function verificarDatosFicticios(cliente) {
  const [operador, ordenes, partidas, programacion, notas, renglones] = await Promise.all([
    cliente.from('usuarios').select('id', { count: 'exact', head: true }).eq('email', identificadores.correoOperador),
    cliente.from('ordenes_produccion').select('id', { count: 'exact', head: true }).in('id', identificadores.ordenes),
    cliente.from('partidas_orden_produccion').select('id', { count: 'exact', head: true }).in('id', identificadores.partidas),
    cliente.from('programacion_areas').select('id', { count: 'exact', head: true }).eq('partida_id', identificadores.partidas[0]).eq('recurso_id', identificadores.recurso),
    cliente.from('notas_entrega').select('id', { count: 'exact', head: true }).in('orden_id', identificadores.ordenes.slice(1)),
    cliente.from('partidas_nota_entrega').select('id', { count: 'exact', head: true }).in('partida_id', identificadores.partidas.slice(1)),
  ]);
  const respuestas = [operador, ordenes, partidas, programacion, notas, renglones];
  asegurar(respuestas.every((respuesta) => !respuesta.error), 'No se pudieron verificar los datos ficticios de Producción.');
  const resultado = {
    operador: operador.count ?? 0, ordenes: ordenes.count ?? 0, partidas: partidas.count ?? 0,
    programaciones: programacion.count ?? 0, notas: notas.count ?? 0, renglonesEntrega: renglones.count ?? 0,
  };
  asegurar(resultado.operador === 1, 'Falta el operador ficticio de Producción.');
  asegurar(resultado.ordenes === 3 && resultado.partidas === 3, 'Las órdenes o partidas ficticias de Producción están incompletas.');
  asegurar(resultado.programaciones === 1, 'Falta la programación ficticia preparada.');
  asegurar(resultado.notas === 2 && resultado.renglonesEntrega === 2, 'Faltan las notas ficticias parcial y total.');
  return resultado;
}

async function ejecutar() {
  cargarEntornoLocal();
  const soloVerificar = process.argv.includes('--verificar');
  asegurar(process.env.NODE_ENV !== 'production', 'La semilla ficticia no puede ejecutarse en producción.');
  if (!soloVerificar) {
    asegurar(process.env.CONFIRMAR_DATOS_FICTICIOS === 'si', 'Define CONFIRMAR_DATOS_FICTICIOS=si para sembrar datos ficticios persistentes.');
  }
  const cliente = createClient(requerirVariable('NEXT_PUBLIC_SUPABASE_URL'), requerirVariable('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  if (!soloVerificar) await sembrarDatosFicticios(cliente);
  console.log(JSON.stringify({ modo: soloVerificar ? 'verificacion' : 'siembra', ...(await verificarDatosFicticios(cliente)) }));
}

ejecutar().catch((error) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : 'Fallo desconocido' }));
  process.exitCode = 1;
});
