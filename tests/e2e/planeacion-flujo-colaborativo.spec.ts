import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

/**
 * Aplica el rango que cubre las fechas E2E. Mientras la consulta inicial del
 * calendario está en vuelo, un re-render puede reemplazar los inputs y perder
 * el primer onChange; se reintenta hasta que el rango aplicado se vea reflejado
 * (el backend rechaza rangos mayores a 31 días).
 */
async function aplicarRangoCalendario(pagina: Page): Promise<void> {
  const aviso = pagina.locator(
    'section[aria-labelledby="titulo-calendario-planeacion"] p[aria-live="polite"]',
  );
  await expect(aviso).toContainText(/programaciones ·/);
  let aplicado = false;
  for (let intento = 0; intento < 3 && !aplicado; intento += 1) {
    await pagina.getByLabel('Fecha inicial').fill('2099-12-28');
    await pagina.getByLabel('Fecha final').fill('2100-01-03');
    await pagina.getByRole('button', { name: 'Aplicar rango' }).click();
    await pagina.waitForTimeout(300);
    aplicado = ((await aviso.textContent()) ?? '').includes('2099-12-28');
  }
  await expect(aviso).toContainText('2099-12-28');
}

/** Carga únicamente valores locales de prueba; nunca muestra secretos en la salida. */
function cargarEntornoLocal(): void {
  const ruta = `${process.cwd()}\\.env.local`;
  if (!existsSync(ruta)) return;
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const coincidencia = /^([A-Z0-9_]+)=(.*)$/.exec(linea.trim());
    if (!coincidencia || process.env[coincidencia[1]] !== undefined) continue;
    process.env[coincidencia[1]] = coincidencia[2].replace(/^['\"]|['\"]$/g, '');
  }
}

cargarEntornoLocal();

function requerirVariable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable de entorno ${nombre} para las pruebas E2E.`);
  return valor;
}

function crearAdmin(): SupabaseClient<Database> {
  return createClient<Database>(
    requerirVariable('NEXT_PUBLIC_SUPABASE_URL'),
    requerirVariable('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

type ContextoPlaneacionE2E = {
  admin: SupabaseClient<Database>;
  usuarioId: string;
  correo: string;
  contrasena: string;
  clienteId: string;
  ordenId: string;
  partidaId: string;
  partidaSecundariaId: string;
  partidaTerciariaId: string;
  recursoId: string;
  programacionId: string | null;
};

type RecursosTemporalesPlaneacion = {
  usuarioId: string | null;
  clienteId: string | null;
  ordenId: string | null;
  recursoId: string | null;
  partidaIds: string[];
};

/** Borra únicamente IDs creados por la prueba, incluso si su preparación falla a mitad. */
async function limpiarRecursosTemporales(
  admin: SupabaseClient<Database>,
  recursos: RecursosTemporalesPlaneacion,
): Promise<void> {
  if (recursos.partidaIds.length > 0) {
    await admin.from('programacion_areas').delete().in('partida_id', recursos.partidaIds);
  }
  if (recursos.usuarioId) {
    await admin.from('logs').delete().eq('usuario_id', recursos.usuarioId);
  }
  if (recursos.recursoId) {
    await admin.from('capacidades_recurso_turno').delete().eq('recurso_id', recursos.recursoId);
    await admin.from('recursos_planeacion').delete().eq('id', recursos.recursoId);
  }
  if (recursos.ordenId) await admin.from('ordenes_produccion').delete().eq('id', recursos.ordenId);
  if (recursos.clienteId) await admin.from('clientes').delete().eq('id', recursos.clienteId);
  if (recursos.usuarioId) {
    await admin.from('usuarios').delete().eq('id', recursos.usuarioId);
    await admin.auth.admin.deleteUser(recursos.usuarioId);
  }
}

async function crearPartida(
  admin: SupabaseClient<Database>,
  ordenId: string,
  sufijo: string,
): Promise<string> {
  const { data, error } = await admin
    .from('partidas_orden_produccion')
    .insert({
      orden_id: ordenId,
      codigo_pieza: `PZA-${sufijo}`,
      descripcion: 'Partida temporal para sincronización de Planeación',
      cantidad_solicitada: 1,
      unidad_medida: 'pieza',
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(`No se pudo crear partida E2E: ${error?.message ?? 'sin partida'}`);
  return data.id;
}

async function prepararContexto(): Promise<ContextoPlaneacionE2E> {
  const admin = crearAdmin();
  const sufijo = randomUUID().slice(0, 8).toUpperCase();
  const correo = `e2e-planeacion-${sufijo.toLowerCase()}@orca.local`;
  const contrasena = `E2e!${randomUUID()}Aa9`;
  const recursos: RecursosTemporalesPlaneacion = {
    usuarioId: null,
    clienteId: null,
    ordenId: null,
    recursoId: null,
    partidaIds: [],
  };

  try {
    const { data: usuarioCreado, error: errorUsuario } = await admin.auth.admin.createUser({
      email: correo,
      password: contrasena,
      email_confirm: true,
      user_metadata: { nombre_completo: `Planeador E2E ${sufijo}` },
    });
    if (errorUsuario || !usuarioCreado.user) {
      throw new Error(`No se pudo crear el usuario E2E: ${errorUsuario?.message ?? 'sin usuario'}`);
    }
    recursos.usuarioId = usuarioCreado.user.id;
    const { error: errorPerfil } = await admin
      .from('usuarios')
      .update({ rol: 'admin', activo: true, nombre_completo: `Planeador E2E ${sufijo}` })
      .eq('id', recursos.usuarioId);
    if (errorPerfil) throw new Error(`No se pudo configurar el perfil E2E: ${errorPerfil.message}`);

    const { data: cliente, error: errorCliente } = await admin
      .from('clientes')
      .insert({
        nombre_comercial: `Cliente Planeación E2E ${sufijo}`,
        razon_social: `Cliente Planeación E2E ${sufijo} SA de CV`,
        estado: 'activo',
      })
      .select('id')
      .single();
    if (errorCliente || !cliente) throw new Error(`No se pudo crear cliente E2E: ${errorCliente?.message ?? 'sin cliente'}`);
    recursos.clienteId = cliente.id;

    // La prueba usa la misma secuencia atómica que producción: un folio manual
    // como `E2E-...` viola el contrato OP-NNNNNN y ocultaría una regresión real.
    const { data: folio, error: errorFolio } = await admin.rpc('generar_folio_orden', {
      p_prefijo: 'OP',
    });
    if (errorFolio || !folio) {
      throw new Error(`No se pudo generar folio E2E: ${errorFolio?.message ?? 'sin folio'}`);
    }

    const { data: orden, error: errorOrden } = await admin
      .from('ordenes_produccion')
      .insert({
        folio,
        cliente_id: cliente.id,
        estado: 'programada',
        prioridad: 'normal',
        fecha_compromiso: '2100-01-15T00:00:00.000Z',
      })
      .select('id')
      .single();
    if (errorOrden || !orden) throw new Error(`No se pudo crear orden E2E: ${errorOrden?.message ?? 'sin orden'}`);
    recursos.ordenId = orden.id;

    const partidaId = await crearPartida(admin, orden.id, `${sufijo}-A`);
    const partidaSecundariaId = await crearPartida(admin, orden.id, `${sufijo}-B`);
    const partidaTerciariaId = await crearPartida(admin, orden.id, `${sufijo}-C`);
    recursos.partidaIds = [partidaId, partidaSecundariaId, partidaTerciariaId];

    const { data: recurso, error: errorRecurso } = await admin
      .from('recursos_planeacion')
      .insert({ codigo: `E2EPLN-${sufijo}`, nombre: `Recurso E2E ${sufijo}`, area: 'taller', activo: true })
      .select('id')
      .single();
    if (errorRecurso || !recurso) throw new Error(`No se pudo crear recurso E2E: ${errorRecurso?.message ?? 'sin recurso'}`);
    recursos.recursoId = recurso.id;

    const { error: errorCapacidad } = await admin.from('capacidades_recurso_turno').insert([
      { recurso_id: recurso.id, turno: 'matutino', horas_capacidad: 8 },
      { recurso_id: recurso.id, turno: 'vespertino', horas_capacidad: 8 },
      { recurso_id: recurso.id, turno: 'nocturno', horas_capacidad: 8 },
    ]);
    if (errorCapacidad) throw new Error(`No se pudo crear capacidad E2E: ${errorCapacidad.message}`);
    if (!recursos.usuarioId || !recursos.clienteId || !recursos.ordenId || !recursos.recursoId) {
      throw new Error('La preparación E2E quedó incompleta');
    }

    return {
      admin,
      usuarioId: recursos.usuarioId,
      correo,
      contrasena,
      clienteId: recursos.clienteId,
      ordenId: recursos.ordenId,
      partidaId,
      partidaSecundariaId,
      partidaTerciariaId,
      recursoId: recursos.recursoId,
      programacionId: null,
    };
  } catch (error) {
    await limpiarRecursosTemporales(admin, recursos);
    throw error;
  }
}

async function limpiarContexto(contexto: ContextoPlaneacionE2E): Promise<void> {
  await limpiarRecursosTemporales(contexto.admin, {
    usuarioId: contexto.usuarioId,
    clienteId: contexto.clienteId,
    ordenId: contexto.ordenId,
    recursoId: contexto.recursoId,
    partidaIds: [contexto.partidaId, contexto.partidaSecundariaId, contexto.partidaTerciariaId],
  });
}

async function iniciarSesion(pagina: Page, contexto: ContextoPlaneacionE2E): Promise<void> {
  await pagina.goto('/iniciar-sesion');
  await pagina.getByLabel('Correo electrónico').fill(contexto.correo);
  await pagina.getByRole('textbox', { name: 'Contraseña' }).fill(contexto.contrasena);
  await pagina.getByRole('button', { name: 'Iniciar sesión' }).click();
  await pagina.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/tablero');
}

test.describe.serial('Planeación colaborativa completa', () => {
  const pruebasRemotasHabilitadas = process.env.E2E_HABILITAR_PRUEBAS_REMOTAS === 'si';
  test.skip(
    !pruebasRemotasHabilitadas,
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si para no crear datos en Supabase remoto.',
  );

  let contexto: ContextoPlaneacionE2E | undefined;

  test.beforeAll(async () => {
    contexto = await prepararContexto();
  });

  test.afterAll(async () => {
    if (contexto) await limpiarContexto(contexto);
  });

  test('programa, activa preparación y sincroniza una reprogramación externa sin recargar', async ({
    page,
    context,
  }) => {
    const contextoPrueba = contexto;
    if (!contextoPrueba) throw new Error('El contexto E2E no fue preparado');
    await iniciarSesion(page, contextoPrueba);

    await page.goto('/planeacion');
    await expect(page.getByTestId('pagina-planeacion')).toBeVisible();
    await aplicarRangoCalendario(page);
    await page.getByLabel('Partida', { exact: true }).selectOption(contextoPrueba.partidaId);
    await page.getByLabel('Recurso').last().selectOption(contextoPrueba.recursoId);
    await page.getByLabel('Fecha programada').fill('2099-12-30');
    await page.getByLabel('Horas estimadas').fill('4');
    await page.getByTestId('guardar-asignacion-planeacion').click();

    await expect
      .poll(async () => {
        const { data } = await contextoPrueba.admin
          .from('programacion_areas')
          .select('id, estado_planeacion, actualizado_en')
          .eq('partida_id', contextoPrueba.partidaId)
          .maybeSingle();
        if (data) contextoPrueba.programacionId = data.id;
        return data?.estado_planeacion ?? null;
      })
      .toBe('programada');
    await expect(
      page
        .getByTestId('columna-2099-12-30')
        .getByTestId(`programacion-${contextoPrueba.programacionId}`),
    ).toBeVisible();

    // La reprogramación se valida mientras la programación sigue `programada`:
    // el backend rechaza moverla en preparación/ejecución porque el recurso y la
    // sesión ya están comprometidos (regla intencional de la auditoría).
    const segundaVista = await context.newPage();
    await segundaVista.goto('/planeacion');
    await aplicarRangoCalendario(segundaVista);
    await expect(
      segundaVista
        .getByTestId('columna-2099-12-30')
        .getByTestId(`programacion-${contextoPrueba.programacionId}`),
    ).toBeVisible();

    const { data: programacionActual, error: errorProgramacion } = await contextoPrueba.admin
      .from('programacion_areas')
      .select('actualizado_en')
      .eq('id', contextoPrueba.programacionId!)
      .single();
    expect(errorProgramacion).toBeNull();
    const { error: errorReprogramacion } = await contextoPrueba.admin.rpc('reprogramar_partida_recurso', {
      p_programacion_id: contextoPrueba.programacionId!,
      p_recurso_id: contextoPrueba.recursoId,
      p_fecha_programada: '2099-12-31',
      p_turno: 'matutino',
      p_horas_estimadas: 4,
      p_orden_prioridad: 1,
      p_actualizado_en_esperado: programacionActual!.actualizado_en,
    });
    expect(errorReprogramacion).toBeNull();

    await expect(
      segundaVista
        .getByTestId('columna-2099-12-31')
        .getByTestId(`programacion-${contextoPrueba.programacionId}`),
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      segundaVista
        .getByTestId('columna-2099-12-30')
        .getByTestId(`programacion-${contextoPrueba.programacionId}`),
    ).toHaveCount(0);

    await page.getByRole('button', { name: 'Seleccionar' }).click();
    await page.getByTestId('activar-preparacion-planeacion').click();
    await expect
      .poll(async () => {
        const { data } = await contextoPrueba.admin
          .from('programacion_areas')
          .select('estado_planeacion')
          .eq('id', contextoPrueba.programacionId!)
          .single();
        return data?.estado_planeacion ?? null;
      })
      .toBe('en_preparacion');

    const { data: logs } = await contextoPrueba.admin
      .from('logs')
      .select('accion')
      .eq('modulo', 'planeacion')
      .eq('recurso_id', contextoPrueba.programacionId!);
    const acciones = new Set((logs ?? []).map((log) => log.accion));
    expect([...acciones]).toEqual(expect.arrayContaining([
      'programar_partida_recurso',
      'activar_modo_preparacion',
    ]));
  });

  test('desglose, vistas y arrastre con propuesta de hueco (OBS-08/OBS-18/OBS-19)', async ({
    page,
  }) => {
    const contextoPrueba = contexto;
    if (!contextoPrueba) throw new Error('El contexto E2E no fue preparado');
    await iniciarSesion(page, contextoPrueba);

    await page.goto('/planeacion');
    await aplicarRangoCalendario(page);

    // OBS-18: programar sin IDs internos, con desglose y resumen previos.
    await page.getByLabel('Partida', { exact: true }).selectOption(contextoPrueba.partidaSecundariaId);
    await page.getByLabel('Recurso').last().selectOption(contextoPrueba.recursoId);
    await page.getByLabel('Fecha programada').fill('2099-12-28');
    await page.getByLabel('Horas estimadas').fill('8');
    await expect(page.getByTestId('desglose-partida-planeacion')).toContainText('Por definir');
    const resumen = page.getByTestId('resumen-programacion-planeacion');
    await expect(resumen).toContainText('2099-12-28');
    await expect(resumen).toContainText('Capacidad tras guardar');
    await page.getByTestId('guardar-asignacion-planeacion').click();

    await expect
      .poll(async () => {
        const { data } = await contextoPrueba.admin
          .from('programacion_areas')
          .select('fecha_programada')
          .eq('partida_id', contextoPrueba.partidaSecundariaId);
        return (data ?? []).map((fila) => fila.fecha_programada).join(',');
      })
      .toContain('2099-12-28');

    const { data: programaciones } = await contextoPrueba.admin
      .from('programacion_areas')
      .select('id, fecha_programada')
      .eq('partida_id', contextoPrueba.partidaSecundariaId);
    const primera = (programaciones ?? []).find((fila) => fila.fecha_programada === '2099-12-28');
    expect(primera).toBeTruthy();

    // Vistas de día, semana y mes con navegación estable.
    await page.getByTestId('vista-planeacion-mes').click();
    await expect(page.getByTestId('vista-mes')).toBeVisible();
    await page.getByTestId('vista-planeacion-dia').click();
    await expect(page.getByTestId('vista-dia')).toBeVisible();
    await page.getByTestId('vista-planeacion-semana').click();
    await expect(page.getByTestId('vista-semana')).toBeVisible();
    await aplicarRangoCalendario(page);
    await expect(
      page.getByTestId('columna-2099-12-28').getByTestId(`programacion-${primera!.id}`),
    ).toBeVisible();

    // OBS-19: el turno se llena, el guardado se bloquea y se propone el
    // siguiente día hábil con hueco, que se confirma con "Usar esta fecha".
    await page.getByLabel('Partida', { exact: true }).selectOption(contextoPrueba.partidaTerciariaId);
    await page.getByLabel('Recurso').last().selectOption(contextoPrueba.recursoId);
    await page.getByLabel('Fecha programada').fill('2099-12-28');
    await page.getByLabel('Horas estimadas').fill('1');
    await expect(page.getByTestId('aviso-capacidad-insuficiente')).toBeVisible();
    await page.getByTestId('guardar-asignacion-planeacion').click();
    await expect(
      page.getByText('El recurso no tiene capacidad disponible en el turno seleccionado'),
    ).toBeVisible();
    await page.getByTestId('buscar-hueco-planeacion').click();
    await expect(page.getByTestId('hueco-sugerido-planeacion')).toContainText('2099-12-29');
    await page.getByTestId('usar-hueco-sugerido-planeacion').click();
    await expect(page.getByLabel('Fecha programada')).toHaveValue('2099-12-29');
    await page.getByTestId('guardar-asignacion-planeacion').click();

    await expect
      .poll(async () => {
        const { data } = await contextoPrueba.admin
          .from('programacion_areas')
          .select('fecha_programada')
          .eq('partida_id', contextoPrueba.partidaTerciariaId);
        return (data ?? []).map((fila) => fila.fecha_programada).join(',');
      })
      .toContain('2099-12-29');

    // PLA-02: arrastrar la tarjeta a otro día abre confirmación; recién al
    // confirmar se mueve, y la columna original queda libre.
    await page
      .getByTestId(`programacion-${primera!.id}`)
      .dragTo(page.getByTestId('columna-2099-12-30'));
    await expect(page.getByTestId('dialogo-reprogramacion-planeacion')).toBeVisible();
    await page.getByTestId('confirmar-reprogramacion-planeacion').click();
    await expect
      .poll(async () => {
        const { data } = await contextoPrueba.admin
          .from('programacion_areas')
          .select('fecha_programada')
          .eq('id', primera!.id)
          .single();
        return data?.fecha_programada ?? null;
      })
      .toBe('2099-12-30');
    await expect(
      page.getByTestId('columna-2099-12-28').getByTestId(`programacion-${primera!.id}`),
    ).toHaveCount(0);
  });
});
