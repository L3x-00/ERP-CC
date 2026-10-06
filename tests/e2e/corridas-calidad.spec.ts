import { randomInt, randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { expect, test } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

type ContextoE2E = {
  admin: SupabaseClient<Database>;
  correoAdministrador: string;
  contrasenaAdministrador: string;
  pinOperador: string;
  administradorId: string;
  operadorId: string;
  clienteId: string;
  recursoId: string;
  ordenId: string;
  partidaId: string;
  programacionId: string;
};

function requerirVariable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta ${nombre} para las pruebas E2E.`);
  return valor;
}

function crearAdmin(): SupabaseClient<Database> {
  const url = requerirVariable('NEXT_PUBLIC_SUPABASE_URL');
  if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
    throw new Error('La E2E de corridas y calidad exige loopback explícito.');
  }
  return createClient<Database>(url, requerirVariable('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
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

async function prepararContexto(): Promise<ContextoE2E> {
  const admin = crearAdmin();
  const sufijo = randomUUID().slice(0, 8);
  const correoAdministrador = `e2e-b6c-admin-${sufijo}@orca.local`;
  const contrasenaAdministrador = `E2e!${randomUUID()}Aa9`;
  const pinOperador = String(randomInt(100000, 1000000));
  const administradorId = await crearUsuario(
    admin, correoAdministrador, contrasenaAdministrador, `Administrador B6C ${sufijo}`, 'admin',
  );
  const operadorId = await crearUsuario(
    admin, `e2e-b6c-operador-${sufijo}@orca.local`, `E2e!${randomUUID()}Bb9`, `Operador B6C ${sufijo}`, 'operador',
  );
  const { error: errorPin } = await admin
    .from('usuarios')
    .update({ pin_operador: await bcrypt.hash(pinOperador, 10) })
    .eq('id', operadorId);
  if (errorPin) throw new Error(`No se pudo configurar PIN E2E: ${errorPin.message}`);

  const { data: recurso, error: errorRecurso } = await admin.from('recursos_planeacion').insert({
    codigo: `E2E-B6C-${sufijo.toUpperCase()}`,
    nombre: `Recurso E2E B6C ${sufijo}`,
    area: 'taller',
    activo: true,
  }).select('id').single();
  if (errorRecurso || !recurso) throw new Error(`No se pudo crear recurso E2E: ${errorRecurso?.message ?? 'sin fila'}`);
  const { error: errorCapacidad } = await admin.from('capacidades_recurso_turno').insert({
    recurso_id: recurso.id, turno: 'matutino', horas_capacidad: 8,
  });
  if (errorCapacidad) throw new Error(`No se pudo crear capacidad E2E: ${errorCapacidad.message}`);

  const { data: cliente, error: errorCliente } = await admin.from('clientes').insert({
    nombre_comercial: `Cliente B6C ${sufijo}`,
    razon_social: `Cliente E2E B6C ${sufijo} SA de CV`,
    estado: 'activo',
  }).select('id').single();
  if (errorCliente || !cliente) throw new Error(`No se pudo crear cliente E2E: ${errorCliente?.message ?? 'sin fila'}`);

  const { data: folio, error: errorFolio } = await admin.rpc('generar_folio_orden', { p_prefijo: 'OP' });
  if (errorFolio || !folio) throw new Error(`No se pudo generar folio E2E: ${errorFolio?.message ?? 'sin folio'}`);
  const { data: orden, error: errorOrden } = await admin.from('ordenes_produccion').insert({
    folio,
    cliente_id: cliente.id,
    estado: 'programada',
    prioridad: 'alta',
    fecha_compromiso: '2099-12-31T18:00:00.000Z',
  }).select('id').single();
  if (errorOrden || !orden) throw new Error(`No se pudo crear orden E2E: ${errorOrden?.message ?? 'sin fila'}`);

  const { data: partida, error: errorPartida } = await admin.from('partidas_orden_produccion').insert({
    orden_id: orden.id,
    codigo_pieza: `E2E-B6C-${sufijo}`,
    descripcion: 'Partida E2E para corridas y calidad',
    cantidad_solicitada: 2,
    cantidad_producida: 0,
    cantidad_scrap: 0,
    unidad_medida: 'pieza',
    procesos: ['Láser fibra'],
    operador_asignado_id: operadorId,
  }).select('id').single();
  if (errorPartida || !partida) throw new Error(`No se pudo crear partida E2E: ${errorPartida?.message ?? 'sin fila'}`);

  const { data: programacion, error: errorProgramacion } = await admin.rpc('programar_partida_recurso', {
    p_orden_id: orden.id,
    p_partida_id: partida.id,
    p_recurso_id: recurso.id,
    p_secuencia: 1,
    p_fecha_programada: '2099-12-30',
    p_turno: 'matutino',
    p_horas_estimadas: 2,
    p_orden_prioridad: 1,
  });
  if (errorProgramacion || !programacion?.[0]) {
    throw new Error(`No se pudo programar partida E2E: ${errorProgramacion?.message ?? 'sin respuesta'}`);
  }
  const { data: preparada, error: errorPreparada } = await admin.rpc('activar_modo_preparacion', {
    p_programacion_id: programacion[0].id,
    p_actualizado_en_esperado: programacion[0].actualizado_en,
  });
  if (errorPreparada || !preparada?.[0]) {
    throw new Error(`No se pudo preparar recurso E2E: ${errorPreparada?.message ?? 'sin respuesta'}`);
  }

  return {
    admin,
    correoAdministrador,
    contrasenaAdministrador,
    pinOperador,
    administradorId,
    operadorId,
    clienteId: cliente.id,
    recursoId: recurso.id,
    ordenId: orden.id,
    partidaId: partida.id,
    programacionId: preparada[0].id,
  };
}

async function limpiarContexto(contexto: ContextoE2E): Promise<void> {
  const { admin } = contexto;
  const { data: inspecciones } = await admin.from('inspecciones_calidad')
    .select('id').eq('orden_id', contexto.ordenId);
  const inspeccionIds = (inspecciones ?? []).map((inspeccion) => inspeccion.id);
  if (inspeccionIds.length > 0) {
    const { data: archivos } = await admin.from('archivos')
      .select('id, ruta_storage').eq('entidad', 'inspeccion_calidad').in('entidad_id', inspeccionIds);
    const rutas = (archivos ?? []).map((archivo) => archivo.ruta_storage);
    if (archivos?.length) await admin.from('archivos').delete().in('id', archivos.map((archivo) => archivo.id));
    if (rutas.length) await admin.storage.from('adjuntos-cotizacion').remove(rutas);
    await admin.from('inspecciones_calidad').delete().in('id', inspeccionIds);
  }
  await admin.from('registros_avance_partida').delete().eq('partida_id', contexto.partidaId);
  await admin.from('registros_tiempo_operador').delete().eq('partida_id', contexto.partidaId);
  await admin.from('sesiones_trabajo').delete().eq('partida_id', contexto.partidaId);
  const { data: corridas } = await admin.from('corridas').select('id').eq('orden_id', contexto.ordenId);
  const corridaIds = (corridas ?? []).map((corrida) => corrida.id);
  if (corridaIds.length > 0) {
    await admin.from('corrida_items').delete().in('corrida_id', corridaIds);
    await admin.from('corridas').delete().in('id', corridaIds);
  }
  await admin.from('programacion_areas').delete().eq('id', contexto.programacionId);
  await admin.from('partidas_orden_produccion').delete().eq('id', contexto.partidaId);
  await admin.from('ordenes_produccion').delete().eq('id', contexto.ordenId);
  await admin.from('capacidades_recurso_turno').delete().eq('recurso_id', contexto.recursoId);
  await admin.from('recursos_planeacion').delete().eq('id', contexto.recursoId);
  await admin.from('clientes').delete().eq('id', contexto.clienteId);
  await admin.from('logs').delete().in('usuario_id', [contexto.administradorId, contexto.operadorId]);
  await admin.from('usuarios').delete().in('id', [contexto.administradorId, contexto.operadorId]);
  await admin.auth.admin.deleteUser(contexto.administradorId);
  await admin.auth.admin.deleteUser(contexto.operadorId);
}

async function iniciarSesionAdministrador(
  page: import('@playwright/test').Page,
  contexto: ContextoE2E,
): Promise<void> {
  await page.goto('/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(contexto.correoAdministrador);
  await page.getByRole('textbox', { name: 'Contraseña' }).fill(contexto.contrasenaAdministrador);
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/tablero');
}

/** SII-B6 ola 2: el inicio exige el checklist de eventos críticos completo. */
async function confirmarChecklistInicio(page: import('@playwright/test').Page): Promise<void> {
  const dialogo = page.getByTestId('checklist-inicio');
  await expect(dialogo).toBeVisible();
  for (const etiqueta of [
    'Material verificado',
    'Espesor verificado',
    'Cantidad verificada',
    'Revisión / archivo vigente',
    'Proceso / equipo correcto',
  ]) {
    await dialogo.getByLabel(etiqueta, { exact: true }).check();
  }
  await dialogo.getByTestId('confirmar-checklist-inicio').click();
}

test.describe.serial('corridas y calidad de producción (SII-B6 ola 2)', () => {
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

  test('crea corrida, libera primera pieza con foto, produce y completa', async ({ page, browser }) => {
    test.setTimeout(300_000);
    if (!contexto) throw new Error('No se preparó el contexto E2E');
    const caso = contexto;
    await iniciarSesionAdministrador(page, caso);
    await page.goto(`/produccion?ordenId=${caso.ordenId}`);
    const panelCorridas = page.getByTestId('panel-corridas');
    await expect(panelCorridas).toBeVisible();
    const { data: procesoLaser } = await caso.admin.from('catalogo_procesos')
      .select('id').eq('codigo', 'LASER_FIBRA').single();
    if (!procesoLaser) throw new Error('Falta el proceso LASER_FIBRA sembrado en el catálogo');

    // Alta de corrida: el proceso Láser fibra es compatible con la partida.
    const botonCrear = panelCorridas.getByTestId('crear-corrida');
    await expect(botonCrear).toBeEnabled();
    await botonCrear.click();
    const dialogoCrear = page.getByTestId('dialogo-crear-corrida');
    await expect(dialogoCrear).toBeVisible();
    await dialogoCrear.getByTestId('proceso-corrida').selectOption(procesoLaser.id);
    const casillaPartida = dialogoCrear.getByTestId(`partida-corrida-${caso.partidaId}`);
    await expect(casillaPartida).toBeEnabled();
    await casillaPartida.check();
    await dialogoCrear.getByTestId('confirmar-crear-corrida').click();

    await expect.poll(async () => {
      const { data } = await caso.admin.from('corridas').select('codigo').eq('orden_id', caso.ordenId).maybeSingle();
      return data?.codigo ?? '';
    }).not.toBe('');
    const { data: corrida } = await caso.admin.from('corridas')
      .select('id, codigo, estado').eq('orden_id', caso.ordenId).single();
    expect(corrida?.estado).toBe('PLANIFICADA');
    const filaCorrida = panelCorridas.getByTestId(`corrida-${corrida?.codigo}`);
    await expect(filaCorrida).toContainText('Láser fibra');

    // Inicio de corrida con checklist de eventos críticos.
    await panelCorridas.getByTestId(`iniciar-corrida-${corrida?.codigo}`).click();
    await confirmarChecklistInicio(page);
    await expect(panelCorridas.getByRole('status')).toContainText('Corrida iniciada');
    await expect.poll(async () => {
      const { data } = await caso.admin.from('corridas').select('estado').eq('id', corrida?.id ?? '').single();
      return data?.estado;
    }).toBe('EN_PROCESO');

    // Calidad: primera pieza aprobada con foto de evidencia.
    const panelCalidad = page.getByTestId('panel-calidad');
    await panelCalidad.getByTestId('registrar-inspeccion').click();
    const dialogoInspeccion = page.getByTestId('dialogo-inspeccion');
    await expect(dialogoInspeccion).toBeVisible();
    await expect(dialogoInspeccion.getByTestId('tipo-inspeccion')).toHaveValue('PRIMERA_PIEZA');
    await dialogoInspeccion.getByTestId('fotos-inspeccion').setInputFiles({
      name: 'primera-pieza.png',
      mimeType: 'image/png',
      buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
    });
    await dialogoInspeccion.getByTestId('confirmar-inspeccion').click();
    await expect(panelCalidad.getByRole('status')).toContainText('primera pieza');
    const { data: inspecciones } = await caso.admin.from('inspecciones_calidad')
      .select('id, tipo, resultado').eq('orden_id', caso.ordenId);
    expect(inspecciones ?? []).toHaveLength(1);
    expect(inspecciones?.[0]?.tipo).toBe('PRIMERA_PIEZA');
    expect(inspecciones?.[0]?.resultado).toBe('APROBADA');
    const { data: fotos } = await caso.admin.from('archivos')
      .select('id, nombre_original').eq('entidad', 'inspeccion_calidad').eq('entidad_id', inspecciones?.[0]?.id ?? '');
    expect(fotos ?? []).toHaveLength(1);
    expect(fotos?.[0]?.nombre_original).toBe('primera-pieza.png');
    await expect(panelCalidad.getByTestId('lista-inspecciones')).toContainText('Primera pieza');

    if (process.env.E2E_CAPTURAR_VISUAL === 'si') {
      await page.screenshot({ path: '.ai-shared/qa/sii-b6-ola2/visual/corridas-calidad-escritorio.png', fullPage: true });
    }

    // Sesión de operador vinculada a la corrida (contexto aparte con auth de
    // admin + PIN de operador; el admin conserva su página sin HMAC para
    // completar la corrida, que exige gestionar_produccion).
    const paginaOperador = await browser.newPage();
    await iniciarSesionAdministrador(paginaOperador, caso);
    await paginaOperador.goto('/operador');
    for (const digito of caso.pinOperador) {
      await paginaOperador.getByRole('button', { name: digito, exact: true }).click();
    }
    await paginaOperador.getByRole('button', { name: 'Confirmar PIN' }).click();
    await paginaOperador.waitForURL('**/produccion-piso');
    await paginaOperador.goto(`/produccion?ordenId=${caso.ordenId}`);
    await paginaOperador.getByTestId(`operar-corrida-${corrida?.codigo}`).click();
    await paginaOperador.getByTestId('iniciar-sesion-produccion').click();
    await confirmarChecklistInicio(paginaOperador);
    await expect(paginaOperador.getByRole('status')).toContainText('Sesión iniciada');
    await paginaOperador.getByLabel('Piezas producidas ahora').fill('2');
    await paginaOperador.getByLabel('Confirmar PIN').fill(caso.pinOperador);
    await paginaOperador.getByTestId('cerrar-sesion-produccion').click();
    await expect(paginaOperador.getByRole('status')).toContainText('Sesión registrada');
    await paginaOperador.close();

    await expect.poll(async () => {
      const { data } = await caso.admin.from('sesiones_trabajo')
        .select('corrida_id').eq('partida_id', caso.partidaId).order('creado_en', { ascending: false }).limit(1)
        .maybeSingle();
      return data?.corrida_id ?? '';
    }).toBe(corrida?.id);
    const { data: partida } = await caso.admin.from('partidas_orden_produccion')
      .select('cantidad_producida').eq('id', caso.partidaId).single();
    expect(Number(partida?.cantidad_producida)).toBe(2);

    // Al completar sus ítems, el cierre de sesión deja la corrida COMPLETADA.
    await page.reload();
    await expect(page.getByTestId(`corrida-${corrida?.codigo}`)).toContainText('Completada');
    await expect.poll(async () => {
      const { data } = await caso.admin.from('corridas').select('estado').eq('id', corrida?.id ?? '').single();
      return data?.estado;
    }).toBe('COMPLETADA');

    if (process.env.E2E_CAPTURAR_VISUAL === 'si') {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.locator('html').evaluate((nodo) => nodo.classList.add('dark'));
      await page.waitForTimeout(200);
      await page.screenshot({ path: '.ai-shared/qa/sii-b6-ola2/visual/corridas-calidad-movil-oscuro.png', fullPage: true });
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.locator('html').evaluate((nodo) => nodo.classList.remove('dark'));
    }

    const { data: logs } = await caso.admin.from('logs')
      .select('accion').eq('modulo', 'produccion')
      .in('usuario_id', [caso.administradorId, caso.operadorId]);
    const acciones = new Set((logs ?? []).map((log) => log.accion));
    for (const accion of ['crear_corrida', 'iniciar_corrida', 'registrar_inspeccion', 'iniciar_sesion_trabajo', 'cerrar_sesion_trabajo']) {
      expect(acciones.has(accion)).toBe(true);
    }
  });
});
