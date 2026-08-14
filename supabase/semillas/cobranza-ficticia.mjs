import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const identificadores = {
  cliente: '80000000-0000-4000-8000-000000000001',
  ordenes: [
    '80000000-0000-4000-8000-000000000101',
    '80000000-0000-4000-8000-000000000102',
    '80000000-0000-4000-8000-000000000103',
  ],
  partidas: [
    '80000000-0000-4000-8000-000000000201',
    '80000000-0000-4000-8000-000000000202',
    '80000000-0000-4000-8000-000000000203',
  ],
  solicitudes: {
    parcial: '80000000-0000-4000-8000-000000001001',
    sobrepago: '80000000-0000-4000-8000-000000001002',
  },
  correoContador: 'sim-cobranza@datos-ficticios.invalid',
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

async function obtenerOCrearContador(cliente) {
  const { data: perfil, error: errorPerfil } = await cliente
    .from('usuarios')
    .select('id')
    .eq('email', identificadores.correoContador)
    .maybeSingle();
  if (errorPerfil) throw new Error(`No se pudo consultar al contador ficticio: ${errorPerfil.message}`);

  let contadorId = perfil?.id;
  if (!contadorId) {
    const { data: usuariosAuth, error: errorUsuariosAuth } = await cliente.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (errorUsuariosAuth) throw new Error(`No se pudo consultar Auth: ${errorUsuariosAuth.message}`);
    contadorId = usuariosAuth.users.find((usuario) => usuario.email === identificadores.correoContador)?.id;
  }
  if (!contadorId) {
    const { data, error } = await cliente.auth.admin.createUser({
      email: identificadores.correoContador,
      password: randomBytes(32).toString('base64url'),
      email_confirm: true,
      user_metadata: { nombre_completo: 'Contador ficticio de Cobranza' },
    });
    if (error || !data.user) throw new Error(`No se pudo crear contador ficticio: ${error?.message ?? 'sin usuario'}`);
    contadorId = data.user.id;
  }

  const { error: errorActualizar } = await cliente.from('usuarios').upsert({
    id: contadorId,
    email: identificadores.correoContador,
    nombre_completo: 'Contador ficticio de Cobranza',
    rol: 'contador',
    activo: true,
  }, { onConflict: 'id' });
  if (errorActualizar) throw new Error(`No se pudo preparar contador ficticio: ${errorActualizar.message}`);
  return contadorId;
}

async function asegurarCuenta(cliente, ordenId, montoTotal, moneda, tipoCambioOrigen, fechaVencimiento) {
  const { data: existente, error: errorExistente } = await cliente
    .from('cuentas_por_cobrar')
    .select('id')
    .eq('orden_id', ordenId)
    .maybeSingle();
  if (errorExistente) throw new Error(`No se pudo consultar AR ficticia: ${errorExistente.message}`);
  if (existente) return existente.id;

  const { data, error } = await cliente.rpc('abrir_cuenta_por_cobrar', {
    p_orden_id: ordenId,
    p_monto_total: montoTotal,
    p_moneda: moneda,
    p_tipo_cambio_origen: tipoCambioOrigen,
    p_fecha_vencimiento: fechaVencimiento,
    p_folio_factura_remision: `SIM-AR-${ordenId.slice(-3)}`,
  });
  if (error || !data?.[0]) throw new Error(`No se pudo abrir AR ficticia: ${error?.message ?? 'sin respuesta'}`);
  return data[0].id;
}

async function asegurarPago(cliente, parametros) {
  const { data: existente, error: errorExistente } = await cliente
    .from('pagos_ar')
    .select('id')
    .eq('solicitud_id', parametros.solicitudId)
    .maybeSingle();
  if (errorExistente) throw new Error(`No se pudo consultar pago ficticio: ${errorExistente.message}`);
  if (existente) return;

  const { error } = await cliente.rpc('registrar_pago_ar_atomico', {
    p_ar_id: parametros.arId,
    p_monto_pagado: parametros.montoPagado,
    p_moneda_pago: parametros.monedaPago,
    p_tipo_cambio_pago: parametros.tipoCambioPago,
    p_metodo_pago: 'transferencia',
    p_referencia: parametros.referencia,
    p_usuario_id: parametros.contadorId,
    p_solicitud_id: parametros.solicitudId,
    p_notas: 'Movimiento ficticio persistente para validar Cobranza.',
    p_cuenta_bancaria_id: null,
  });
  if (error) throw new Error(`No se pudo registrar pago ficticio: ${error.message}`);
}

async function sembrarDatosFicticios(cliente) {
  const contadorId = await obtenerOCrearContador(cliente);
  const { error: errorCliente } = await cliente.from('clientes').upsert({
    id: identificadores.cliente,
    razon_social: 'CC Manufacturing Cliente Ficticio Cobranza SA de CV',
    nombre_comercial: 'SIM-AR Cobranza',
    rfc: 'CCC260814AR0',
    contacto: 'Finanzas de desarrollo',
    correo: 'sim-ar-cliente@datos-ficticios.invalid',
    telefono: '6640000008',
    condiciones_pago: 'credito',
    limite_credito: 500000,
    saldo_a_favor: 0,
    tier: 'bronce',
    estado: 'activo',
  }, { onConflict: 'id', ignoreDuplicates: true });
  if (errorCliente) throw new Error(`No se creó el cliente ficticio: ${errorCliente.message}`);

  const { error: errorOrdenes } = await cliente.from('ordenes_produccion').upsert(identificadores.ordenes.map((id, indice) => ({
    id,
    folio: `OP-98010${indice + 1}`,
    cliente_id: identificadores.cliente,
    estado: 'completada',
    prioridad: 'normal',
    fecha_compromiso: '2026-08-01T18:00:00.000Z',
  })), { onConflict: 'id', ignoreDuplicates: true });
  if (errorOrdenes) throw new Error(`No se crearon órdenes ficticias: ${errorOrdenes.message}`);

  const { error: errorPartidas } = await cliente.from('partidas_orden_produccion').upsert(identificadores.partidas.map((id, indice) => ({
    id,
    orden_id: identificadores.ordenes[indice],
    codigo_pieza: `SIM-AR-COBRO-00${indice + 1}`,
    descripcion: 'Partida ficticia completada para validar cuentas por cobrar.',
    cantidad_solicitada: 10,
    cantidad_producida: 10,
    cantidad_scrap: 0,
    unidad_medida: 'pieza',
    tiempo_estimado_minutos: 60,
    tiempo_real_minutos: 60,
  })), { onConflict: 'id', ignoreDuplicates: true });
  if (errorPartidas) throw new Error(`No se crearon partidas ficticias: ${errorPartidas.message}`);

  const [cuentaPendiente, cuentaParcial, cuentaSobrepagada] = await Promise.all([
    asegurarCuenta(cliente, identificadores.ordenes[0], 100, 'USD', 18.5, '2026-08-30T18:00:00.000Z'),
    asegurarCuenta(cliente, identificadores.ordenes[1], 100, 'USD', 18.5, '2026-08-01T18:00:00.000Z'),
    asegurarCuenta(cliente, identificadores.ordenes[2], 1000, 'MXN', 1, '2026-05-01T18:00:00.000Z'),
  ]);
  void cuentaPendiente;

  await asegurarPago(cliente, {
    arId: cuentaParcial,
    montoPagado: 40,
    monedaPago: 'USD',
    tipoCambioPago: 18.5,
    referencia: 'SIM-AR-PARCIAL-001',
    contadorId,
    solicitudId: identificadores.solicitudes.parcial,
  });
  await asegurarPago(cliente, {
    arId: cuentaSobrepagada,
    montoPagado: 1100,
    monedaPago: 'MXN',
    tipoCambioPago: 1,
    referencia: 'SIM-AR-SOBREPAGO-001',
    contadorId,
    solicitudId: identificadores.solicitudes.sobrepago,
  });
}

async function verificarDatosFicticios(cliente) {
  const [contador, cuentas, pagos, movimientos, saldo] = await Promise.all([
    cliente.from('usuarios').select('id', { count: 'exact', head: true }).eq('email', identificadores.correoContador),
    cliente.from('cuentas_por_cobrar').select('id, estado', { count: 'exact' }).in('orden_id', identificadores.ordenes),
    cliente.from('pagos_ar').select('id', { count: 'exact', head: true }).in('solicitud_id', Object.values(identificadores.solicitudes)),
    cliente.from('movimientos_saldo_favor').select('id', { count: 'exact', head: true }).eq('cliente_id', identificadores.cliente).eq('tipo', 'credito_sobrepago'),
    cliente.from('clientes').select('saldo_a_favor').eq('id', identificadores.cliente).single(),
  ]);
  asegurar(!contador.error && !cuentas.error && !pagos.error && !movimientos.error && !saldo.error, 'No se pudieron verificar los datos ficticios de Cobranza.');
  const estados = new Set((cuentas.data ?? []).map((cuenta) => cuenta.estado));
  const resultado = {
    contador: contador.count ?? 0,
    cuentas: cuentas.count ?? 0,
    pagos: pagos.count ?? 0,
    creditosSobrepago: movimientos.count ?? 0,
    saldoAFavorMxn: Number(saldo.data?.saldo_a_favor ?? 0),
    estados: [...estados].sort(),
  };
  asegurar(resultado.contador === 1, 'Falta el contador ficticio.');
  asegurar(resultado.cuentas === 3, 'Faltan cuentas AR ficticias.');
  asegurar(resultado.pagos === 2, 'Faltan pagos ficticios.');
  asegurar(resultado.creditosSobrepago >= 1 && resultado.saldoAFavorMxn >= 100, 'Falta el sobrepago ficticio o el monedero MXN.');
  asegurar(estados.has('pendiente') && estados.has('parcial') && estados.has('pagado'), 'Los estados AR ficticios están incompletos.');
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
