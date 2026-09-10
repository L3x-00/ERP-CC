import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import bcrypt from 'bcryptjs';
import { createClient } from '@supabase/supabase-js';

// Fixture persistente de Fase 9. Los UUID son propios del escenario SIM-GTO y
// no se reutilizan con las semillas de Planeación, Producción o Cobranza.
const identificadores = {
  cliente: '90000000-0000-4000-8000-000000000001',
  proveedor: '90000000-0000-4000-8000-000000000002',
  material: '90000000-0000-4000-8000-000000000003',
  orden: '90000000-0000-4000-8000-000000000101',
  partida: '90000000-0000-4000-8000-000000000201',
  recurso: '90000000-0000-4000-8000-000000000301',
  programacion: '90000000-0000-4000-8000-000000000401',
  correoContador: 'sim-gastos-contador@datos-ficticios.invalid',
  correoOperador: 'sim-gastos-operador@datos-ficticios.invalid',
};

const descripcionGasto = 'Gasto ficticio de consumibles para rentabilidad SIM-GTO';

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

async function asegurarFila(cliente, tabla, fila) {
  const { data: existente, error: errorConsulta } = await cliente
    .from(tabla)
    .select('id')
    .eq('id', fila.id)
    .maybeSingle();
  if (errorConsulta) throw new Error(`No se pudo consultar ${tabla}: ${errorConsulta.message}`);
  if (existente) return false;
  const { error } = await cliente.from(tabla).insert(fila);
  if (error) throw new Error(`No se pudo crear fila ficticia en ${tabla}: ${error.message}`);
  return true;
}

async function obtenerOCrearUsuario(cliente, correo, nombre, rol, pin) {
  const { data: perfil, error: errorPerfil } = await cliente
    .from('usuarios')
    .select('id')
    .eq('email', correo)
    .maybeSingle();
  if (errorPerfil) throw new Error(`No se pudo consultar usuario ficticio: ${errorPerfil.message}`);

  let usuarioId = perfil?.id;
  if (!usuarioId) {
    const { data: usuariosAuth, error: errorUsuariosAuth } = await cliente.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (errorUsuariosAuth) throw new Error(`No se pudo consultar Auth: ${errorUsuariosAuth.message}`);
    usuarioId = usuariosAuth.users.find((usuario) => usuario.email === correo)?.id;
  }

  if (!usuarioId) {
    const { data, error } = await cliente.auth.admin.createUser({
      email: correo,
      password: randomBytes(32).toString('base64url'),
      email_confirm: true,
      user_metadata: { nombre_completo: nombre },
    });
    if (error || !data.user) throw new Error(`No se pudo crear usuario ficticio: ${error?.message ?? 'sin usuario'}`);
    usuarioId = data.user.id;
  }

  const fila = {
    id: usuarioId,
    email: correo,
    nombre_completo: nombre,
    rol,
    activo: true,
  };
  if (pin) fila.pin_operador = await bcrypt.hash(pin, 10);
  const { error: errorGuardar } = await cliente.from('usuarios').upsert(fila, { onConflict: 'id' });
  if (errorGuardar) throw new Error(`No se pudo preparar usuario ficticio: ${errorGuardar.message}`);
  return usuarioId;
}

async function asegurarConsumo(cliente) {
  const { data: consumos, error: errorConsulta } = await cliente
    .from('registros_consumo_material')
    .select('id')
    .eq('partida_id', identificadores.partida)
    .eq('material_id', identificadores.material)
    .limit(1);
  if (errorConsulta) throw new Error(`No se pudo consultar consumo ficticio: ${errorConsulta.message}`);
  if (consumos?.length) return consumos[0].id;

  const { data, error } = await cliente.rpc('registrar_consumo_material_op', {
    p_partida_id: identificadores.partida,
    p_material_id: identificadores.material,
    p_cantidad_usada: 2.5,
    p_cantidad_scrap: 0.25,
  });
  if (error || !data?.[0]) throw new Error(`No se pudo registrar consumo ficticio: ${error?.message ?? 'sin respuesta'}`);
  return data[0].id;
}

async function asegurarCapacidad(cliente) {
  const { data: existente, error: errorConsulta } = await cliente
    .from('capacidades_recurso_turno')
    .select('recurso_id')
    .eq('recurso_id', identificadores.recurso)
    .eq('turno', 'matutino')
    .maybeSingle();
  if (errorConsulta) throw new Error(`No se pudo consultar capacidad ficticia: ${errorConsulta.message}`);
  if (existente) return;
  const { error } = await cliente.from('capacidades_recurso_turno').insert({
    recurso_id: identificadores.recurso,
    turno: 'matutino',
    horas_capacidad: 8,
  });
  if (error) throw new Error(`No se pudo crear capacidad ficticia: ${error.message}`);
}

async function asegurarCuentaPorCobrar(cliente) {
  const { data: existente, error: errorConsulta } = await cliente
    .from('cuentas_por_cobrar')
    .select('id')
    .eq('orden_id', identificadores.orden)
    .maybeSingle();
  if (errorConsulta) throw new Error(`No se pudo consultar AR ficticia: ${errorConsulta.message}`);
  if (existente) return existente.id;

  const { data, error } = await cliente.rpc('abrir_cuenta_por_cobrar', {
    p_orden_id: identificadores.orden,
    p_monto_total: 10000,
    p_moneda: 'MXN',
    p_tipo_cambio_origen: 1,
    p_fecha_vencimiento: '2026-12-31T18:00:00.000Z',
    p_folio_factura_remision: 'SIM-GTO-FACT-001',
  });
  if (error || !data?.[0]) throw new Error(`No se pudo abrir AR ficticia: ${error?.message ?? 'sin respuesta'}`);
  return data[0].id;
}

async function asegurarGasto(cliente, contadorId) {
  const { data: existente, error: errorConsulta } = await cliente
    .from('gastos')
    .select('id, folio')
    .eq('orden_id', identificadores.orden)
    .eq('descripcion', descripcionGasto)
    .limit(1)
    .maybeSingle();
  if (errorConsulta) throw new Error(`No se pudo consultar gasto ficticio: ${errorConsulta.message}`);
  if (existente) return existente;

  const { data, error } = await cliente.rpc('registrar_gasto', {
    p_orden_id: identificadores.orden,
    p_proveedor_id: identificadores.proveedor,
    p_categoria: 'consumibles',
    p_descripcion: descripcionGasto,
    p_monto_subtotal: 1500,
    p_monto_iva: 240,
    p_monto_total: 1740,
    p_moneda: 'MXN',
    p_tipo_cambio: 1,
    p_fecha_gasto: '2026-09-01',
    p_fecha_vencimiento: '2026-09-30',
    p_comprobante_url: null,
    p_folio_comprobante: 'SIM-GTO-COMP-001',
    p_metodo_pago: 'transferencia',
    p_datos_ocr_json: null,
    p_notas: 'Fixture persistente para validar CxP y rentabilidad.',
    p_creado_por: contadorId,
  });
  if (error || !data?.[0]) throw new Error(`No se pudo registrar gasto ficticio: ${error?.message ?? 'sin respuesta'}`);
  return data[0];
}

async function sembrarDatosFicticios(cliente) {
  const contadorId = await obtenerOCrearUsuario(
    cliente,
    identificadores.correoContador,
    'Contador ficticio de Gastos',
    'contador',
  );
  const operadorId = await obtenerOCrearUsuario(
    cliente,
    identificadores.correoOperador,
    'Operador ficticio de Gastos',
    'operador',
    '7391',
  );

  await asegurarFila(cliente, 'clientes', {
    id: identificadores.cliente,
    razon_social: 'CC Manufacturing Cliente Ficticio Gastos SA de CV',
    nombre_comercial: 'SIM-GTO Cliente de Desarrollo',
    rfc: 'CCC260909GT0',
    contacto: 'Finanzas de desarrollo',
    correo: 'sim-gto-cliente@datos-ficticios.invalid',
    telefono: '6640000009',
    condiciones_pago: 'credito',
    limite_credito: 500000,
    saldo_a_favor: 0,
    tier: 'bronce',
    estado: 'activo',
  });

  await asegurarFila(cliente, 'proveedores', {
    id: identificadores.proveedor,
    nombre_comercial: 'SIM-GTO Proveedor de Consumibles',
    razon_social: 'Proveedor Ficticio de Consumibles SA de CV',
    rfc: 'PFC260909000',
    contacto_nombre: 'Compras de desarrollo',
    correo: 'sim-gto-proveedor@datos-ficticios.invalid',
    telefono: '6640000010',
    direccion: 'Domicilio ficticio de desarrollo',
  });

  await asegurarFila(cliente, 'materiales', {
    id: identificadores.material,
    codigo: 'SIM-GTO-MAT-001',
    nombre: 'Consumible ficticio de prueba',
    descripcion: 'Material persistente para calcular CPP y merma.',
    categoria: 'insumo',
    unidad_compra: 'pieza',
    unidad_control: 'pieza',
    factor_conversion: 1,
    costo_unitario_compra: 180,
    costo_unitario_control: 180,
    stock_actual_control: 100,
    stock_reservado_control: 0,
    stock_minimo_control: 10,
    proveedor_id: identificadores.proveedor,
    factor_merma_porcentaje: 8,
  });

  await asegurarFila(cliente, 'recursos_planeacion', {
    id: identificadores.recurso,
    codigo: 'SIM-GTO-CNC-01',
    area: 'taller',
    nombre: 'Centro CNC ficticio para costos',
    activo: true,
    costo_hora_interno: 120,
  });
  await asegurarCapacidad(cliente);

  await asegurarFila(cliente, 'ordenes_produccion', {
    id: identificadores.orden,
    folio: 'OP-990901',
    cliente_id: identificadores.cliente,
    estado: 'completada',
    prioridad: 'normal',
    fecha_compromiso: '2026-09-15T18:00:00.000Z',
    fecha_inicio: '2026-09-01T15:00:00.000Z',
    fecha_fin: '2026-09-01T22:30:00.000Z',
  });
  await asegurarFila(cliente, 'partidas_orden_produccion', {
    id: identificadores.partida,
    orden_id: identificadores.orden,
    codigo_pieza: 'SIM-GTO-PIEZA-001',
    descripcion: 'Pieza ficticia terminada para rentabilidad.',
    cantidad_solicitada: 10,
    cantidad_producida: 10,
    cantidad_scrap: 0,
    unidad_medida: 'pieza',
    material_id: identificadores.material,
    tiempo_estimado_minutos: 360,
    tiempo_real_minutos: 390,
  });
  await asegurarFila(cliente, 'programacion_areas', {
    id: identificadores.programacion,
    orden_id: identificadores.orden,
    partida_id: identificadores.partida,
    recurso_id: identificadores.recurso,
    secuencia: 1,
    estado_planeacion: 'completada',
    fecha_programada: '2026-09-01',
    turno: 'matutino',
    horas_estimadas: 6,
    orden_prioridad: 1,
  });

  await asegurarConsumo(cliente);

  const { data: sesionExistente, error: errorSesion } = await cliente
    .from('sesiones_trabajo')
    .select('id')
    .eq('programacion_id', identificadores.programacion)
    .eq('operador_id', operadorId)
    .limit(1)
    .maybeSingle();
  if (errorSesion) throw new Error(`No se pudo consultar sesión ficticia: ${errorSesion.message}`);
  if (!sesionExistente) {
    const { error } = await cliente.from('sesiones_trabajo').insert({
      orden_id: identificadores.orden,
      partida_id: identificadores.partida,
      programacion_id: identificadores.programacion,
      operador_id: operadorId,
      fecha_inicio: '2026-09-01T15:00:00.000Z',
      fecha_fin: '2026-09-01T22:30:00.000Z',
      horas_brutas: 7.5,
      horas_netas: 6.5,
      piezas_producidas: 10,
      estado_sesion: 'finalizada',
      notas: 'Sesión ficticia con descuento de comida 12:00-13:00.',
    });
    if (error) throw new Error(`No se pudo crear sesión ficticia: ${error.message}`);
  }

  await asegurarCuentaPorCobrar(cliente);
  await asegurarGasto(cliente, contadorId);
  return { contadorId, operadorId };
}

async function verificarDatosFicticios(cliente) {
  const [clienteRespuesta, ordenRespuesta, partidaRespuesta, consumoRespuesta, sesionRespuesta, gastoRespuesta, cuentaRespuesta, rentabilidadRespuesta] = await Promise.all([
    cliente.from('clientes').select('id', { count: 'exact', head: true }).eq('id', identificadores.cliente),
    cliente.from('ordenes_produccion').select('id', { count: 'exact', head: true }).eq('id', identificadores.orden),
    cliente.from('partidas_orden_produccion').select('id', { count: 'exact', head: true }).eq('id', identificadores.partida),
    cliente.from('registros_consumo_material').select('id', { count: 'exact', head: true }).eq('partida_id', identificadores.partida).eq('material_id', identificadores.material),
    cliente.from('sesiones_trabajo').select('id', { count: 'exact', head: true }).eq('programacion_id', identificadores.programacion),
    cliente.from('gastos').select('id, folio, estado_pago, monto_total', { count: 'exact' }).eq('orden_id', identificadores.orden).eq('descripcion', descripcionGasto),
    cliente.from('cuentas_por_cobrar').select('id, monto_total, moneda, estado').eq('orden_id', identificadores.orden).maybeSingle(),
    cliente.rpc('obtener_rentabilidad_orden', { p_orden_id: identificadores.orden }),
  ]);
  const respuestas = [clienteRespuesta, ordenRespuesta, partidaRespuesta, consumoRespuesta, sesionRespuesta, gastoRespuesta, cuentaRespuesta, rentabilidadRespuesta];
  const errores = respuestas.map((respuesta) => respuesta.error?.message).filter(Boolean);
  asegurar(errores.length === 0, `No se pudieron verificar los datos ficticios de Gastos: ${errores.join(' | ')}`);
  const rentabilidad = rentabilidadRespuesta.data?.[0];
  const resultado = {
    cliente: clienteRespuesta.count ?? 0,
    orden: ordenRespuesta.count ?? 0,
    partida: partidaRespuesta.count ?? 0,
    consumos: consumoRespuesta.count ?? 0,
    sesiones: sesionRespuesta.count ?? 0,
    gastos: gastoRespuesta.count ?? 0,
    cuentaPorCobrar: cuentaRespuesta.data?.id ? 1 : 0,
    rentabilidad: rentabilidad ? {
      ingresoMxn: Number(rentabilidad.monto_venta_mxn),
      costoTotalMxn: Number(rentabilidad.costo_total_mxn),
      utilidadBrutaMxn: Number(rentabilidad.utilidad_bruta_mxn),
      margenPorcentaje: rentabilidad.margen_porcentaje === null ? null : Number(rentabilidad.margen_porcentaje),
    } : null,
    foliosGasto: (gastoRespuesta.data ?? []).map((gasto) => gasto.folio),
  };
  asegurar(resultado.cliente === 1 && resultado.orden === 1 && resultado.partida === 1, 'Faltan entidades principales del fixture SIM-GTO.');
  asegurar(resultado.consumos >= 1 && resultado.sesiones >= 1 && resultado.gastos === 1, 'Faltan movimientos ficticios de costos.');
  asegurar(resultado.cuentaPorCobrar === 1 && resultado.rentabilidad !== null, 'Falta ingreso explícito o cálculo de rentabilidad.');
  asegurar((resultado.rentabilidad?.ingresoMxn ?? 0) > 0 && (resultado.rentabilidad?.costoTotalMxn ?? 0) > 0, 'La rentabilidad ficticia no tiene componentes positivos.');
  return resultado;
}

async function ejecutar() {
  cargarEntornoLocal();
  const soloVerificar = process.argv.includes('--verificar');
  asegurar(process.env.NODE_ENV !== 'production', 'La semilla ficticia no puede ejecutarse en producción.');
  if (!soloVerificar) {
    asegurar(process.env.CONFIRMAR_DATOS_FICTICIOS === 'si', 'Define CONFIRMAR_DATOS_FICTICIOS=si para sembrar datos ficticios persistentes.');
  }
  const cliente = createClient(
    requerirVariable('NEXT_PUBLIC_SUPABASE_URL'),
    requerirVariable('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  if (!soloVerificar) await sembrarDatosFicticios(cliente);
  console.log(JSON.stringify({ modo: soloVerificar ? 'verificacion' : 'siembra', ...(await verificarDatosFicticios(cliente)) }));
}

ejecutar().catch((error) => {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : 'Fallo desconocido' }));
  process.exitCode = 1;
});
