import { randomInt, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { expect, test, type Page } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

function cargarEntornoLocal(): void {
  if (!existsSync('.env.local')) return;
  for (const linea of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
    const coincidencia = /^([A-Z0-9_]+)=(.*)$/.exec(linea.trim());
    if (!coincidencia || process.env[coincidencia[1]] !== undefined) continue;
    process.env[coincidencia[1]] = coincidencia[2].replace(/^['"]|['"]$/g, '');
  }
}

cargarEntornoLocal();

type ContextoE2E = {
  admin: SupabaseClient<Database>;
  pinOperador: string;
  administradorId: string;
  operadorId: string;
  clienteId: string;
  recursoId: string;
  ordenId: string;
  partidaId: string;
  programacionId: string;
  autorizacionId: string;
};

function requerirVariable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta ${nombre} para las pruebas E2E.`);
  return valor;
}

function crearAdmin(): SupabaseClient<Database> {
  return createClient<Database>(
    requerirVariable('NEXT_PUBLIC_SUPABASE_URL'),
    requerirVariable('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

async function crearUsuario(
  admin: SupabaseClient<Database>,
  correo: string,
  contrasena: string,
  nombreCompleto: string,
  rol: 'admin' | 'operador',
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email: correo,
    password: contrasena,
    email_confirm: true,
    user_metadata: { nombre_completo: nombreCompleto },
  });
  if (error || !data.user) throw new Error(`No se pudo crear usuario E2E: ${error?.message ?? 'sin usuario'}`);
  const { error: errorPerfil } = await admin
    .from('usuarios')
    .update({ rol, activo: true, nombre_completo: nombreCompleto })
    .eq('id', data.user.id);
  if (errorPerfil) throw new Error(`No se pudo preparar perfil E2E: ${errorPerfil.message}`);
  return data.user.id;
}

function horaLocalTaller(fecha: Date): string {
  const partes = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Tijuana',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(fecha);
  const valor = (tipo: Intl.DateTimeFormatPartTypes): string =>
    partes.find((parte) => parte.type === tipo)?.value ?? '';
  return `${valor('year')}-${valor('month')}-${valor('day')}T${valor('hour')}:${valor('minute')}`;
}

async function prepararContexto(): Promise<ContextoE2E> {
  const admin = crearAdmin();
  const sufijo = randomUUID().slice(0, 8);
  const pinOperador = String(randomInt(100000, 1000000));
  const administradorId = await crearUsuario(
    admin,
    `e2e-c20-admin-${sufijo}@orca.local`,
    `E2e!${randomUUID()}Aa9`,
    `Admin C20 ${sufijo}`,
    'admin',
  );
  const operadorId = await crearUsuario(
    admin,
    `e2e-c20-operador-${sufijo}@orca.local`,
    `E2e!${randomUUID()}Bb9`,
    `Operador C20 ${sufijo}`,
    'operador',
  );
  const { error: errorPin } = await admin
    .from('usuarios')
    .update({ pin_operador: await bcrypt.hash(pinOperador, 10) })
    .eq('id', operadorId);
  if (errorPin) throw new Error(`No se pudo configurar PIN E2E: ${errorPin.message}`);

  const { data: recurso, error: errorRecurso } = await admin.from('recursos_planeacion').insert({
    codigo: `E2EC20-${sufijo.toUpperCase()}`,
    nombre: `Recurso C20 ${sufijo}`,
    area: 'taller',
    activo: true,
  }).select('id').single();
  if (errorRecurso || !recurso) throw new Error(`No se pudo crear recurso E2E: ${errorRecurso?.message ?? 'sin recurso'}`);
  const { error: errorCapacidad } = await admin.from('capacidades_recurso_turno').insert([
    { recurso_id: recurso.id, turno: 'matutino', horas_capacidad: 8 },
    { recurso_id: recurso.id, turno: 'vespertino', horas_capacidad: 8 },
  ]);
  if (errorCapacidad) throw new Error(`No se pudo crear capacidad E2E: ${errorCapacidad.message}`);

  const { data: cliente, error: errorCliente } = await admin.from('clientes').insert({
    nombre_comercial: `Cliente C20 ${sufijo}`,
    razon_social: `Cliente C20 ${sufijo} SA de CV`,
    estado: 'activo',
  }).select('id').single();
  if (errorCliente || !cliente) throw new Error(`No se pudo crear cliente E2E: ${errorCliente?.message ?? 'sin cliente'}`);

  const { data: folio, error: errorFolio } = await admin.rpc('generar_folio_orden', { p_prefijo: 'OP' });
  if (errorFolio || !folio) throw new Error(`No se pudo generar folio E2E: ${errorFolio?.message ?? 'sin folio'}`);
  const { data: orden, error: errorOrden } = await admin.from('ordenes_produccion').insert({
    folio,
    cliente_id: cliente.id,
    estado: 'en_proceso',
    prioridad: 'alta',
    fecha_compromiso: '2099-12-31T18:00:00.000Z',
  }).select('id').single();
  if (errorOrden || !orden) throw new Error(`No se pudo crear orden E2E: ${errorOrden?.message ?? 'sin orden'}`);

  const { data: partida, error: errorPartida } = await admin.from('partidas_orden_produccion').insert({
    orden_id: orden.id,
    codigo_pieza: `C20-${sufijo}`,
    descripcion: 'Partida temporal del flujo C20',
    cantidad_solicitada: 5,
    cantidad_producida: 0,
    unidad_medida: 'pieza',
    tiempo_estimado_minutos: 120,
    tiempo_real_minutos: 0,
    operador_asignado_id: operadorId,
  }).select('id').single();
  if (errorPartida || !partida) throw new Error(`No se pudo crear partida E2E: ${errorPartida?.message ?? 'sin partida'}`);

  const { data: programacion, error: errorProgramacion } = await admin.rpc('programar_partida_recurso_auditada', {
    p_orden_id: orden.id,
    p_partida_id: partida.id,
    p_recurso_id: recurso.id,
    p_secuencia: 1,
    p_fecha_programada: '2099-12-30',
    p_turno: 'matutino',
    p_horas_estimadas: 2,
    p_orden_prioridad: 1,
    p_actor_id: administradorId,
    p_correlation_id: randomUUID(),
  });
  if (errorProgramacion || !programacion?.[0]) {
    throw new Error(`No se pudo programar partida E2E: ${errorProgramacion?.message ?? 'sin programación'}`);
  }
  const { data: preparada, error: errorPreparada } = await admin.rpc('activar_modo_preparacion', {
    p_programacion_id: programacion[0].id,
    p_actualizado_en_esperado: programacion[0].actualizado_en,
  });
  if (errorPreparada || !preparada?.[0]) {
    throw new Error(`No se pudo preparar recurso E2E: ${errorPreparada?.message ?? 'sin respuesta'}`);
  }

  // Cubre el exceso del día al reanudar: la jornada ahora es acumulada.
  const { data: autorizacion, error: errorAutorizacion } = await admin
    .from('autorizaciones_hora_extra')
    .insert({
      orden_id: orden.id,
      horas_autorizadas: 3,
      motivo: 'Prueba E2E del flujo C20',
      autorizado_por: administradorId,
      estado: 'VIGENTE',
    })
    .select('id')
    .single();
  if (errorAutorizacion || !autorizacion) {
    throw new Error(`No se pudo crear autorización E2E: ${errorAutorizacion?.message ?? 'sin autorización'}`);
  }

  return {
    admin,
    pinOperador,
    administradorId,
    operadorId,
    clienteId: cliente.id,
    recursoId: recurso.id,
    ordenId: orden.id,
    partidaId: partida.id,
    programacionId: preparada[0].id,
    autorizacionId: autorizacion.id,
  };
}

async function limpiarContexto(contexto: ContextoE2E): Promise<void> {
  const { admin } = contexto;
  await admin.from('autorizaciones_hora_extra').delete().eq('id', contexto.autorizacionId);
  await admin.from('registros_avance_partida').delete().eq('partida_id', contexto.partidaId);
  await admin.from('registros_tiempo_operador').delete().eq('partida_id', contexto.partidaId);
  await admin.from('sesiones_trabajo').delete().eq('partida_id', contexto.partidaId);
  await admin.from('orden_eventos_cambio').delete().eq('orden_id', contexto.ordenId);
  const { data: corridas } = await admin.from('corridas')
    .select('id').eq('orden_id', contexto.ordenId);
  const corridasIds = (corridas ?? []).map((corrida) => corrida.id);
  if (corridasIds.length > 0) {
    await admin.from('corrida_items').delete().in('corrida_id', corridasIds);
    await admin.from('corridas').delete().in('id', corridasIds);
  }
  await admin.from('programacion_areas').delete().eq('id', contexto.programacionId);
  await admin.from('partidas_orden_produccion').delete().eq('id', contexto.partidaId);
  await admin.from('ordenes_produccion').delete().eq('id', contexto.ordenId);
  await admin.from('capacidades_recurso_turno').delete().eq('recurso_id', contexto.recursoId);
  await admin.from('recursos_planeacion').delete().eq('id', contexto.recursoId);
  await admin.from('clientes').delete().eq('id', contexto.clienteId);
  // `logs` es append-only: borrar usuarios con auditoría puede chocar con la
  // FK de logs. El resto del contexto sí se limpia; los usuarios huérfanos son
  // inofensivos y se pueden reiniciar con `supabase db reset` en local.
  try {
    await admin.from('usuarios').delete().in('id', [contexto.administradorId, contexto.operadorId]);
    await admin.auth.admin.deleteUser(contexto.administradorId);
    await admin.auth.admin.deleteUser(contexto.operadorId);
  } catch {
    // Limpieza best-effort: no debe fallar el spec por la auditoría inmutable.
  }
}

async function entrarComoOperador(page: Page, pin: string): Promise<void> {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/operador');
  for (const digito of pin) {
    await page.getByRole('button', { name: digito, exact: true }).click();
  }
  await page.getByRole('button', { name: 'Confirmar PIN' }).click();
  await page.waitForURL('**/produccion-piso');
}

async function confirmarChecklistInicio(page: Page): Promise<void> {
  const dialogo = page.getByTestId('checklist-inicio');
  await expect(dialogo).toBeVisible();
  for (const casilla of await dialogo.getByRole('checkbox').all()) {
    await casilla.check();
  }
  await dialogo.getByTestId('confirmar-checklist-inicio').click();
}

test.describe.serial('C20: pausa, actualización de avance y hora real de conclusión', () => {
  test.skip(
    process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si para crear datos temporales en Supabase local.',
  );

  let contexto: ContextoE2E | null = null;

  test.beforeAll(async () => {
    contexto = await prepararContexto();
  });

  test.afterAll(async () => {
    if (contexto) await limpiarContexto(contexto);
  });

  test('ordena en curso, pausa por jornada, declara avance, reanuda y cierra con hora real', async ({ page }) => {
    const caso = contexto!;
    await entrarComoOperador(page, caso.pinOperador);

    const tarjeta = page.locator(`[data-testid^="proceso-${caso.partidaId}:"]`).first();
    await expect(tarjeta).toBeVisible();
    await tarjeta.getByTestId(/^abrir-detalle-/u).click();
    const detalle = page.getByTestId('detalle-proceso');
    await expect(detalle).toBeVisible();

    await detalle.getByTestId('reclamar-detalle').click();
    await detalle.getByTestId('iniciar-detalle').click();
    await confirmarChecklistInicio(page);
    await expect(page.getByTestId('columna-en_proceso')).toContainText('C20-');

    // La jornada se cumplió sin que el operador cerrara: el barrido del servidor
    // pausa la sesión al recargar y el proceso cambia de columna.
    const inicioDia = `${new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'America/Tijuana', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date()).replaceAll(' ', '-')}T00:01:00-08:00`;
    const { error: errorFecha } = await caso.admin.from('sesiones_trabajo')
      .update({ fecha_inicio: inicioDia })
      .eq('partida_id', caso.partidaId)
      .eq('estado_sesion', 'activa');
    if (errorFecha) throw new Error(`No se pudo simular el fin de jornada: ${errorFecha.message}`);
    await page.reload();
    const { data: sesionPausada } = await caso.admin.from('sesiones_trabajo')
      .select('id, estado_sesion, pendiente_actualizacion_avance')
      .eq('partida_id', caso.partidaId)
      .eq('estado_sesion', 'pausada')
      .maybeSingle();
    expect(sesionPausada, 'La sesión debe quedar pausada por jornada').not.toBeNull();
    expect(sesionPausada?.pendiente_actualizacion_avance).toBe(true);
    await expect(page.getByTestId('columna-actualizar_avance')).toContainText('C20-');

    // Declarar piezas y las horas que faltaron para la pausa.
    await page.locator('[data-testid^="actualizar-avance-proceso-"]').first().click();
    const formulario = page.getByTestId('formulario-actualizar-avance');
    await expect(formulario).toBeVisible();
    await formulario.getByTestId('avance-piezas').fill('3');
    await formulario.getByTestId('avance-horas').fill('5');
    await formulario.getByTestId('avance-pin').fill(caso.pinOperador);
    await formulario.getByTestId('actualizar-avance-detalle').click();

    await expect(page.getByTestId('columna-pausada')).toContainText('C20-');
    const { data: pausa } = await caso.admin.from('sesiones_trabajo')
      .select('piezas_producidas, pendiente_actualizacion_avance, horas_netas')
      .eq('partida_id', caso.partidaId)
      .eq('estado_sesion', 'pausada')
      .single();
    expect(Number(pausa?.piezas_producidas)).toBe(3);
    expect(pausa?.pendiente_actualizacion_avance).toBe(false);
    expect(Number(pausa?.horas_netas)).toBeLessThan(9);

    // Reanudar y cerrar indicando la hora real de conclusión.
    await page.getByTestId('reanudar-detalle').click();
    await expect(page.getByTestId('columna-en_proceso')).toContainText('C20-');

    await page.getByTestId('alternar-cierre-sesion').click();
    await page.getByTestId('piezas-cierre').fill('2');
    // Un minuto por delante: el reloj de la sesión tiene segundos y el input
    // solo minutos; la RPC tolera hasta 2 min de margen hacia el futuro.
    const horaConclusion = horaLocalTaller(new Date(Date.now() + 60_000));
    await page.getByTestId('hora-fin-cierre').fill(horaConclusion);
    await page.getByTestId('pin-cierre').fill(caso.pinOperador);
    await page.getByTestId('cerrar-sesion-detalle').click();
    // El cierre ya se registró: el refresh del tablero puede descartar el
    // diálogo de resumen, así que se verifica el estado persistido y la ficha.
    await expect(detalle).toContainText('Proceso completado');

    const { data: sesionFinal } = await caso.admin.from('sesiones_trabajo')
      .select('estado_sesion, piezas_producidas, fecha_fin, fecha_fin_declarada')
      .eq('partida_id', caso.partidaId)
      .eq('estado_sesion', 'finalizada')
      .order('fecha_inicio', { ascending: false })
      .limit(1)
      .single();
    expect(sesionFinal?.fecha_fin_declarada).not.toBeNull();
    expect(sesionFinal?.fecha_fin).toBe(sesionFinal?.fecha_fin_declarada);
    expect(Number(sesionFinal?.piezas_producidas)).toBe(2);

    const { data: partidaFinal } = await caso.admin.from('partidas_orden_produccion')
      .select('cantidad_producida')
      .eq('id', caso.partidaId)
      .single();
    expect(Number(partidaFinal?.cantidad_producida)).toBe(5);
  });
});
