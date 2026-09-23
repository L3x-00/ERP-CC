import { randomUUID } from 'node:crypto';
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

function requerirVariable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta ${nombre} para las pruebas E2E.`);
  return valor;
}

type ContextoE2E = {
  admin: SupabaseClient<Database>;
  correoAdministrador: string;
  contrasenaAdministrador: string;
  administradorId: string;
  operadorAId: string;
  operadorBId: string;
  pinA: string;
  pinB: string;
  clienteId: string;
  recursoId: string;
  ordenCorteId: string;
  ordenCncId: string;
  partidaCorteId: string;
  partidaCncId: string;
  /** Códigos de catálogo creados por la prueba (se eliminan al final). */
  areasCreadas: string[];
};

/** Crea una subárea/proceso si no existe; devuelve `true` si la creó la prueba. */
async function asegurarArea(
  admin: SupabaseClient<Database>,
  codigo: string,
  nombre: string,
  padreCodigo: string,
  areaPlaneacion: string | null,
  tipo: 'subarea' | 'proceso' = 'proceso',
): Promise<boolean> {
  const { data } = await admin
    .from('areas_trabajo_config')
    .select('codigo')
    .eq('codigo', codigo)
    .maybeSingle();
  if (data) return false;
  const { error } = await admin.from('areas_trabajo_config').insert({
    codigo,
    nombre,
    tipo,
    padre_codigo: padreCodigo,
    area_planeacion: areaPlaneacion,
    activo: true,
    orden: 5,
  });
  if (error) throw new Error(`No se pudo preparar el área ${codigo}: ${error.message}`);
  return true;
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
  if (error || !data.user) {
    throw new Error(`No se pudo crear usuario E2E: ${error?.message ?? 'sin usuario'}`);
  }
  const { error: errorPerfil } = await admin
    .from('usuarios')
    .update({ rol, activo: true, nombre_completo: nombreCompleto })
    .eq('id', data.user.id);
  if (errorPerfil) throw new Error(`No se pudo preparar perfil E2E: ${errorPerfil.message}`);
  return data.user.id;
}

async function crearOrdenConPartida(
  admin: SupabaseClient<Database>,
  clienteId: string,
  sufijo: string,
  areaCodigo: string,
): Promise<{ ordenId: string; partidaId: string }> {
  const { data: folio, error: errorFolio } = await admin.rpc('generar_folio_orden', {
    p_prefijo: 'OP',
  });
  if (errorFolio || !folio) throw new Error(`Sin folio E2E: ${errorFolio?.message}`);
  const { data: orden, error: errorOrden } = await admin
    .from('ordenes_produccion')
    .insert({
      folio,
      cliente_id: clienteId,
      estado: 'en_proceso',
      prioridad: 'normal',
      fecha_compromiso: '2099-12-31T18:00:00.000Z',
    })
    .select('id')
    .single();
  if (errorOrden || !orden) throw new Error(`No se creó la orden E2E: ${errorOrden?.message}`);
  const { data: partida, error: errorPartida } = await admin
    .from('partidas_orden_produccion')
    .insert({
      orden_id: orden.id,
      codigo_pieza: `E2E-TAX-${sufijo}`,
      descripcion: `Partida ${areaCodigo} E2E`,
      cantidad_solicitada: 2,
      unidad_medida: 'pieza',
      area_trabajo_codigo: areaCodigo,
      procesos: ['corte'],
    })
    .select('id')
    .single();
  if (errorPartida || !partida) {
    throw new Error(`No se creó la partida E2E: ${errorPartida?.message}`);
  }
  return { ordenId: orden.id, partidaId: partida.id };
}

async function prepararContexto(): Promise<ContextoE2E> {
  const admin = createClient<Database>(
    requerirVariable('NEXT_PUBLIC_SUPABASE_URL'),
    requerirVariable('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const sufijo = randomUUID().slice(0, 8);
  const correoAdministrador = `e2e-tax-admin-${sufijo}@orca.local`;
  const contrasenaAdministrador = `E2e!${randomUUID()}Aa9`;
  const administradorId = await crearUsuario(
    admin,
    correoAdministrador,
    contrasenaAdministrador,
    `Admin Taxonomía ${sufijo}`,
    'admin',
  );
  const pinA = '4826';
  const pinB = '7319';
  const operadorAId = await crearUsuario(
    admin,
    `e2e-tax-opa-${sufijo}@orca.local`,
    `E2e!${randomUUID()}Aa1`,
    `Operador Corte ${sufijo}`,
    'operador',
  );
  const operadorBId = await crearUsuario(
    admin,
    `e2e-tax-opb-${sufijo}@orca.local`,
    `E2e!${randomUUID()}Bb2`,
    `Operador CNC ${sufijo}`,
    'operador',
  );
  await admin.from('usuarios').update({ pin_operador: await bcrypt.hash(pinA, 10) }).eq('id', operadorAId);
  await admin.from('usuarios').update({ pin_operador: await bcrypt.hash(pinB, 10) }).eq('id', operadorBId);

  const { data: cliente, error: errorCliente } = await admin
    .from('clientes')
    .insert({
      nombre_comercial: `Cliente Taxonomía ${sufijo}`,
      razon_social: `Cliente E2E Taxonomía ${sufijo} SA de CV`,
      estado: 'activo',
    })
    .select('id')
    .single();
  if (errorCliente || !cliente) {
    throw new Error(`No se creó el cliente E2E: ${errorCliente?.message}`);
  }

  const { data: recurso, error: errorRecurso } = await admin
    .from('recursos_planeacion')
    .insert({
      codigo: `E2E-TAX-${sufijo.toUpperCase()}`,
      nombre: `Recurso Taxonomía ${sufijo}`,
      area: 'taller',
      activo: true,
    })
    .select('id')
    .single();
  if (errorRecurso || !recurso) {
    throw new Error(`No se creó el recurso E2E: ${errorRecurso?.message}`);
  }

  const corte = await crearOrdenConPartida(admin, cliente.id, `${sufijo}-CORTE`, 'LASER');
  const cnc = await crearOrdenConPartida(admin, cliente.id, `${sufijo}-CNC`, 'CNC');

  const areasCreadas: string[] = [];
  if (await asegurarArea(admin, 'LASER', 'Corte láser', 'METAL_MECANICA', 'sheet_metal')) {
    areasCreadas.push('LASER');
  }
  if (await asegurarArea(admin, 'CNC', 'CNC Router', 'FABRICACION_DIGITAL', 'taller')) {
    areasCreadas.push('CNC');
  }

  // A06: el trabajo de corte recorre raíz → subárea → proceso. Solo la raíz
  // declara macroárea; la prueba de asignación y el filtro de piso ejercen la
  // herencia completa sin modificar las áreas sembradas que usan otros casos.
  const subareaCodigo = `A06_SUB_${sufijo.toUpperCase()}`;
  const procesoCodigo = `A06_PROC_${sufijo.toUpperCase()}`;
  if (await asegurarArea(admin, subareaCodigo, 'Subárea corte E2E', 'METAL_MECANICA', null, 'subarea')) {
    areasCreadas.push(subareaCodigo);
  }
  if (await asegurarArea(admin, procesoCodigo, 'Corte láser E2E', subareaCodigo, null)) {
    areasCreadas.push(procesoCodigo);
  }
  const { error: errorJerarquia } = await admin.from('partidas_orden_produccion')
    .update({ area_trabajo_codigo: procesoCodigo }).eq('id', corte.partidaId);
  if (errorJerarquia) throw new Error(`No se preparó la jerarquía A06: ${errorJerarquia.message}`);

  return {
    admin,
    correoAdministrador,
    contrasenaAdministrador,
    administradorId,
    operadorAId,
    operadorBId,
    pinA,
    pinB,
    clienteId: cliente.id,
    recursoId: recurso.id,
    ordenCorteId: corte.ordenId,
    ordenCncId: cnc.ordenId,
    partidaCorteId: corte.partidaId,
    partidaCncId: cnc.partidaId,
    areasCreadas,
  };
}

async function limpiarContexto(contexto: ContextoE2E, codigoProceso: string | null): Promise<void> {
  const { admin } = contexto;
  await admin.from('partidas_orden_produccion').delete().in('id', [contexto.partidaCorteId, contexto.partidaCncId]);
  await admin.from('ordenes_produccion').delete().in('id', [contexto.ordenCorteId, contexto.ordenCncId]);
  await admin.from('recursos_planeacion').delete().eq('id', contexto.recursoId);
  await admin.from('clientes').delete().eq('id', contexto.clienteId);
  await admin.from('logs').delete().in('usuario_id', [contexto.administradorId, contexto.operadorAId, contexto.operadorBId]);
  await admin.from('usuarios').delete().in('id', [contexto.administradorId, contexto.operadorAId, contexto.operadorBId]);
  await admin.auth.admin.deleteUser(contexto.administradorId);
  await admin.auth.admin.deleteUser(contexto.operadorAId);
  await admin.auth.admin.deleteUser(contexto.operadorBId);
  if (codigoProceso) {
    await admin.from('areas_trabajo_config').delete().eq('codigo', codigoProceso);
  }
  for (const codigo of [...contexto.areasCreadas].reverse()) {
    await admin.from('areas_trabajo_config').delete().eq('codigo', codigo);
  }
}

async function iniciarSesionAdministrador(pagina: Page, contexto: ContextoE2E): Promise<void> {
  await pagina.goto('/iniciar-sesion');
  await pagina.getByLabel('Correo electrónico').fill(contexto.correoAdministrador);
  await pagina.getByRole('textbox', { name: 'Contraseña' }).fill(contexto.contrasenaAdministrador);
  await pagina.getByRole('button', { name: 'Iniciar sesión' }).click();
  await pagina.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/tablero');
}

async function iniciarPisoConPin(pagina: Page, pin: string): Promise<void> {
  await pagina.goto('/operador');
  for (const digito of pin) {
    await pagina.getByRole('button', { name: digito, exact: true }).click();
  }
  await pagina.getByRole('button', { name: 'Confirmar PIN' }).click();
  await pagina.waitForURL('**/produccion-piso');
}

test.describe.serial('taxonomía de taller y colas por área (OBS-14/OBS-09/PRD-11)', () => {
  test.skip(
    process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si para crear datos temporales en Supabase remoto.',
  );

  let contexto: ContextoE2E | null = null;
  let codigoProcesoCreado: string | null = null;

  test.beforeAll(async () => {
    contexto = await prepararContexto();
  });

  test.afterAll(async () => {
    if (contexto) await limpiarContexto(contexto, codigoProcesoCreado);
  });

  test('configura áreas por operador, rechaza área ajena y filtra piso y tablero', async ({
    page,
    browser,
  }) => {
    if (!contexto) throw new Error('No se preparó el contexto E2E');
    const datos = contexto;
    await iniciarSesionAdministrador(page, datos);

    // OBS-09: asignación de áreas por operador desde Configuración.
    await page.goto('/configuracion');
    await page.getByRole('tab', { name: 'Áreas de trabajo' }).click();
    const panelOperadores = page.getByTestId('areas-operadores');
    await expect(panelOperadores).toBeVisible();
    await panelOperadores
      .getByTestId(`areas-operador-check-${datos.operadorAId}-METAL_MECANICA`)
      .check();
    await panelOperadores
      .getByTestId(`guardar-areas-operador-${datos.operadorAId}`)
      .click();
    await expect(page.getByTestId('configuracion-confirmacion')).toContainText('guardadas');
    await panelOperadores
      .getByTestId(`areas-operador-check-${datos.operadorBId}-FABRICACION_DIGITAL`)
      .check();
    await panelOperadores
      .getByTestId(`guardar-areas-operador-${datos.operadorBId}`)
      .click();
    await expect(page.getByTestId('configuracion-confirmacion')).toContainText('guardadas');

    await expect
      .poll(async () => {
        const { data } = await datos.admin
          .from('operadores_areas')
          .select('operador_id, area_codigo')
          .in('operador_id', [datos.operadorAId, datos.operadorBId]);
        return (data ?? []).map((fila) => `${fila.operador_id}:${fila.area_codigo}`).sort().join(',');
      })
      .toContain(`${datos.operadorAId}:METAL_MECANICA`);

    // OBS-14: una subárea creada desde la configuración queda disponible.
    await page.getByLabel('Código').last().fill(`SUELDA_${randomUUID().slice(0, 4).toUpperCase()}`);
    await page.getByLabel('Nombre').last().fill('Soldadura E2E');
    await page.getByTestId('configuracion-area-tipo').selectOption('proceso');
    await page.getByTestId('configuracion-area-padre').selectOption('METAL_MECANICA');
    const codigoProceso = await page.getByLabel('Código').last().inputValue();
    codigoProcesoCreado = codigoProceso;
    await page.getByTestId('guardar-area-trabajo').click();
    await expect(page.getByTestId(`area-fila-${codigoProceso}`)).toBeVisible();

    // A05: una asignación ya guardada sigue visible si el área se desactiva;
    // el administrador puede quitarla antes de guardar otros cambios.
    const opcionProceso = panelOperadores.getByTestId(
      `areas-operador-check-${datos.operadorAId}-${codigoProceso}`,
    );
    await opcionProceso.check();
    await panelOperadores.getByTestId(`guardar-areas-operador-${datos.operadorAId}`).click();
    await expect(page.getByTestId('configuracion-confirmacion')).toContainText('guardadas');
    const { error: errorDesactivar } = await datos.admin.from('areas_trabajo_config')
      .update({ activo: false }).eq('codigo', codigoProceso);
    expect(errorDesactivar).toBeNull();
    await page.reload();
    await page.getByRole('tab', { name: 'Áreas de trabajo' }).click();
    const filaOperador = page.getByTestId(`areas-operador-fila-${datos.operadorAId}`);
    const opcionInactiva = filaOperador.getByTestId(
      `areas-operador-check-${datos.operadorAId}-${codigoProceso}`,
    );
    await expect(opcionInactiva).toBeChecked();
    await expect(filaOperador.getByText('Desmarca las áreas inactivas o no disponibles antes de guardar.')).toBeVisible();
    await opcionInactiva.uncheck();
    await filaOperador.getByTestId(`guardar-areas-operador-${datos.operadorAId}`).click();
    await expect(page.getByTestId('configuracion-confirmacion')).toContainText('guardadas');

    // A06/PRD-11: el área del operador se aplica en la asignación aun cuando
    // la partida usa un proceso de tercer nivel sin macroárea propia.
    const rechazo = await datos.admin.rpc('asignar_operador_a_partida_op', {
      p_partida_id: datos.partidaCorteId,
      p_operador_id: datos.operadorBId,
    });
    expect(rechazo.error?.message).toContain('operador_area_no_asignada');
    const asignacionCorte = await datos.admin.rpc('asignar_operador_a_partida_op', {
      p_partida_id: datos.partidaCorteId,
      p_operador_id: datos.operadorAId,
    });
    expect(asignacionCorte.error).toBeNull();
    const asignacionCnc = await datos.admin.rpc('asignar_operador_a_partida_op', {
      p_partida_id: datos.partidaCncId,
      p_operador_id: datos.operadorBId,
    });
    expect(asignacionCnc.error).toBeNull();

    // Piso: cada operador ve su cola con área y responsable legibles.
    await iniciarPisoConPin(page, datos.pinA);
    await expect(page.getByTestId('detalle-partida-piso')).toContainText('Corte láser');
    await expect(page.getByTestId('selector-area-piso')).toBeVisible();
    // A06: el filtro de piso ofrece la familia (área raíz), no cada proceso.
    await page.getByTestId('selector-area-piso').selectOption('METAL_MECANICA');
    await expect(page.getByTestId('control-piso')).toContainText('E2E-TAX-');
    await expect(page.getByTestId('control-piso')).not.toContainText('CNC');

    const pisoB = await browser.newPage();
    await iniciarPisoConPin(pisoB, datos.pinB);
    await expect(pisoB.getByTestId('detalle-partida-piso')).toContainText('CNC Router');

    // Tablero: el filtro por área macro acota la cola visible.
    const tablero = await browser.newPage();
    await iniciarSesionAdministrador(tablero, datos);
    await tablero.goto('/produccion');
    await expect(tablero.getByTestId(`tarjeta-produccion-${datos.ordenCorteId}`)).toBeVisible();
    await tablero.getByTestId('filtro-area-produccion').selectOption('METAL_MECANICA');
    await expect(tablero.getByTestId(`tarjeta-produccion-${datos.ordenCorteId}`)).toBeVisible();
    await expect(tablero.getByTestId(`tarjeta-produccion-${datos.ordenCncId}`)).toHaveCount(0);
    await expect(tablero.getByTestId(`detalle-taller-${datos.ordenCorteId}`)).toContainText(
      'Corte láser',
    );
    await tablero.getByTestId('filtro-area-produccion').selectOption('FABRICACION_DIGITAL');
    await expect(tablero.getByTestId(`tarjeta-produccion-${datos.ordenCncId}`)).toBeVisible();
    await expect(tablero.getByTestId(`tarjeta-produccion-${datos.ordenCorteId}`)).toHaveCount(0);
  });
});
