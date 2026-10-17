import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test, type Page } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

function cargarEntornoLocal(): void {
  const ruta = `${process.cwd()}\\.env.local`;
  if (!existsSync(ruta)) return;
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const coincidencia = /^([A-Z0-9_]+)=(.*)$/.exec(linea.trim());
    if (!coincidencia || process.env[coincidencia[1]] !== undefined) continue;
    process.env[coincidencia[1]] = coincidencia[2].replace(/^['"]|['"]$/g, '');
  }
}

cargarEntornoLocal();

type ContextoE2E = {
  admin: SupabaseClient<Database>;
  correo: string;
  contrasena: string;
  administradorId: string;
  recursoId: string;
  codigo: string;
};

function requerirVariable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable ${nombre} para E2E.`);
  return valor;
}

async function prepararContexto(): Promise<ContextoE2E> {
  const admin = createClient<Database>(
    requerirVariable('NEXT_PUBLIC_SUPABASE_URL'),
    requerirVariable('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const sufijo = randomUUID().slice(0, 8);
  const correo = `e2e-capacidad-${sufijo}@orca.local`;
  const contrasena = `E2e!${randomUUID()}Cc9`;
  const { data: usuarioAuth, error: errorAuth } = await admin.auth.admin.createUser({
    email: correo,
    password: contrasena,
    email_confirm: true,
    user_metadata: { nombre_completo: `Administrador Capacidad ${sufijo}` },
  });
  if (errorAuth || !usuarioAuth.user) throw new Error(`No se creó administrador E2E: ${errorAuth?.message ?? 'sin usuario'}`);
  const administradorId = usuarioAuth.user.id;
  const { error: errorPerfil } = await admin.from('usuarios').update({
    rol: 'admin', activo: true, nombre_completo: `Administrador Capacidad ${sufijo}`,
  }).eq('id', administradorId);
  if (errorPerfil) throw new Error(`No se preparó perfil E2E: ${errorPerfil.message}`);

  const codigo = `E2E-CNC-${sufijo.toUpperCase()}`;
  const { data: recurso, error: errorRecurso } = await admin.from('recursos_planeacion').insert({
    codigo,
    nombre: `CNC Router E2E ${sufijo}`,
    area: 'sheet_metal',
    activo: true,
  }).select('id').single();
  if (errorRecurso || !recurso) throw new Error(`No se creó recurso E2E: ${errorRecurso?.message ?? 'sin recurso'}`);
  const { error: errorCapacidad } = await admin.from('capacidades_recurso_turno').insert({
    recurso_id: recurso.id,
    turno: 'matutino',
    horas_capacidad: 8,
  });
  if (errorCapacidad) throw new Error(`No se creó capacidad E2E: ${errorCapacidad.message}`);

  return { admin, correo, contrasena, administradorId, recursoId: recurso.id, codigo };
}

async function limpiarContexto(contexto: ContextoE2E): Promise<void> {
  const { admin } = contexto;
  await admin.from('capacidades_recurso_turno').delete().eq('recurso_id', contexto.recursoId);
  await admin.from('recursos_planeacion').delete().eq('id', contexto.recursoId);
  await admin.from('logs').delete().eq('usuario_id', contexto.administradorId);
  await admin.from('usuarios').delete().eq('id', contexto.administradorId);
  await admin.auth.admin.deleteUser(contexto.administradorId);
}

test.describe.serial('capacidad instalada de Planeación (D-02)', () => {
  test.skip(
    process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si para crear datos temporales en Supabase remoto.',
  );

  let contexto: ContextoE2E | null = null;

  test.beforeAll(async () => { contexto = await prepararContexto(); });
  test.afterAll(async () => { if (contexto) await limpiarContexto(contexto); });

  test('edita equipos y jornada y la capacidad instalada se recalcula', async ({ page }) => {
    if (!contexto) throw new Error('No se preparó el contexto E2E');
    const datos = contexto;

    await page.goto('/iniciar-sesion');
    await page.getByLabel('Correo electrónico').fill(datos.correo);
    await page.getByRole('textbox', { name: 'Contraseña' }).fill(datos.contrasena);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/tablero');

    await page.goto('/planeacion');
    const panel = page.getByTestId('panel-capacidad-instalada');
    await expect(panel).toBeVisible();
    const fila = panel.getByTestId(`capacidad-recurso-${datos.codigo}`);
    await expect(fila).toContainText('Equipos × jornada = 8 h por jornada');

    // 1 equipo × 8 h → 3 equipos × 8 h = 24 h por jornada.
    await fila.getByLabel(`Equipos (${datos.codigo})`).fill('3');
    await fila.getByRole('button', { name: 'Guardar' }).click();
    await expect(fila.getByRole('status')).toContainText('Capacidad guardada.');
    await expect(fila.getByTestId(`capacidad-total-${datos.codigo}`)).toContainText('= 24 h por jornada');
    await expect.poll(async () => {
      const { data } = await datos.admin
        .from('recursos_planeacion')
        .select('cantidad_equipos, capacidad_jornada_override_horas')
        .eq('id', datos.recursoId)
        .single();
      return `${data?.cantidad_equipos}:${data?.capacidad_jornada_override_horas}`;
    }).toBe('3:null');

    // Override de jornada: 3 equipos × 6 h = 18 h por jornada.
    await fila.getByLabel(`Jornada por equipo (h, opcional)`).fill('6');
    await fila.getByRole('button', { name: 'Guardar' }).click();
    await expect(fila.getByRole('status')).toContainText('Capacidad guardada.');
    await expect(fila.getByTestId(`capacidad-total-${datos.codigo}`)).toContainText('= 18 h por jornada');
    await expect.poll(async () => {
      const { data } = await datos.admin
        .from('recursos_planeacion')
        .select('cantidad_equipos, capacidad_jornada_override_horas')
        .eq('id', datos.recursoId)
        .single();
      return `${data?.cantidad_equipos}:${data?.capacidad_jornada_override_horas}`;
    }).toBe('3:6');

    const { data: logs } = await datos.admin
      .from('logs')
      .select('accion')
      .eq('modulo', 'planeacion')
      .eq('usuario_id', datos.administradorId);
    expect((logs ?? []).some((log) => log.accion === 'actualizar_capacidad_recurso')).toBe(true);
  });
});

type ContextoCargaSemanalE2E = {
  admin: SupabaseClient<Database>;
  correo: string;
  contrasena: string;
  administradorId: string;
  clienteId: string;
  ordenId: string;
  partidaId: string;
  partidaSecundariaId: string;
  recursoId: string;
  codigo: string;
};

type RangoSemanalRelativo = { inicio: string; fin: string };

function fechaLocalIso(fecha: Date): string {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

/** Semana ISO (lunes a domingo) que contiene hoy en la fecha local del navegador. */
function semanaLocalRelativa(base: Date): RangoSemanalRelativo {
  const lunes = new Date(base);
  lunes.setDate(base.getDate() - ((base.getDay() + 6) % 7));
  const domingo = new Date(lunes);
  domingo.setDate(lunes.getDate() + 6);
  return { inicio: fechaLocalIso(lunes), fin: fechaLocalIso(domingo) };
}

/**
 * Aplica un rango relativo reintentando: mientras la consulta inicial está en
 * vuelo, un re-render puede reemplazar los inputs y perder el primer onChange.
 */
async function aplicarRangoRelativo(pagina: Page, rango: RangoSemanalRelativo): Promise<void> {
  const aviso = pagina.locator(
    'section[aria-labelledby="titulo-calendario-planeacion"] p[aria-live="polite"]',
  );
  await expect(aviso).toContainText(/programaciones ·/);
  let aplicado = false;
  for (let intento = 0; intento < 3 && !aplicado; intento += 1) {
    await pagina.getByLabel('Fecha inicial').fill(rango.inicio);
    await pagina.getByLabel('Fecha final').fill(rango.fin);
    await pagina.getByRole('button', { name: 'Aplicar rango' }).click();
    await pagina.waitForTimeout(300);
    aplicado = ((await aviso.textContent()) ?? '').includes(rango.inicio);
  }
  await expect(aviso).toContainText(rango.inicio);
}

/** Contexto mínimo para la carga semanal: un recurso con un turno de 8 h y una partida. */
async function prepararContextoCargaSemanal(): Promise<ContextoCargaSemanalE2E> {
  const admin = createClient<Database>(
    requerirVariable('NEXT_PUBLIC_SUPABASE_URL'),
    requerirVariable('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const sufijo = randomUUID().slice(0, 8);
  const correo = `e2e-semanal-${sufijo}@orca.local`;
  const contrasena = `E2e!${randomUUID()}Cs1`;
  const { data: usuarioAuth, error: errorAuth } = await admin.auth.admin.createUser({
    email: correo,
    password: contrasena,
    email_confirm: true,
    user_metadata: { nombre_completo: `Administrador Semanal ${sufijo}` },
  });
  if (errorAuth || !usuarioAuth.user) {
    throw new Error(`No se creó administrador E2E: ${errorAuth?.message ?? 'sin usuario'}`);
  }
  const administradorId = usuarioAuth.user.id;
  const { error: errorPerfil } = await admin.from('usuarios').update({
    rol: 'admin', activo: true, nombre_completo: `Administrador Semanal ${sufijo}`,
  }).eq('id', administradorId);
  if (errorPerfil) throw new Error(`No se preparó perfil E2E: ${errorPerfil.message}`);

  const { data: cliente, error: errorCliente } = await admin.from('clientes').insert({
    nombre_comercial: `Cliente Semanal E2E ${sufijo}`,
    razon_social: `Cliente Semanal E2E ${sufijo} SA de CV`,
    estado: 'activo',
  }).select('id').single();
  if (errorCliente || !cliente) {
    throw new Error(`No se creó cliente E2E: ${errorCliente?.message ?? 'sin cliente'}`);
  }

  const { data: folio, error: errorFolio } = await admin.rpc('generar_folio_orden', {
    p_prefijo: 'OP',
  });
  if (errorFolio || !folio) {
    throw new Error(`No se generó folio E2E: ${errorFolio?.message ?? 'sin folio'}`);
  }
  const { data: orden, error: errorOrden } = await admin.from('ordenes_produccion').insert({
    folio,
    cliente_id: cliente.id,
    estado: 'programada',
    prioridad: 'normal',
    fecha_compromiso: '2100-01-15T00:00:00.000Z',
  }).select('id').single();
  if (errorOrden || !orden) {
    throw new Error(`No se creó orden E2E: ${errorOrden?.message ?? 'sin orden'}`);
  }

  const { data: partida, error: errorPartida } = await admin
    .from('partidas_orden_produccion')
    .insert({
      orden_id: orden.id,
      codigo_pieza: `PZA-SEM-${sufijo}`,
      descripcion: 'Partida temporal para la carga semanal',
      cantidad_solicitada: 1,
      unidad_medida: 'pieza',
      procesos: ['Corte'],
    })
    .select('id')
    .single();
  if (errorPartida || !partida) {
    throw new Error(`No se creó partida E2E: ${errorPartida?.message ?? 'sin partida'}`);
  }

  const { data: partidaSecundaria, error: errorPartidaSecundaria } = await admin
    .from('partidas_orden_produccion')
    .insert({
      orden_id: orden.id,
      codigo_pieza: `PZA-SEM2-${sufijo}`,
      descripcion: 'Segunda partida temporal para el aviso de sobrecapacidad',
      cantidad_solicitada: 1,
      unidad_medida: 'pieza',
      procesos: ['Corte'],
    })
    .select('id')
    .single();
  if (errorPartidaSecundaria || !partidaSecundaria) {
    throw new Error(
      `No se creó la segunda partida E2E: ${errorPartidaSecundaria?.message ?? 'sin partida'}`,
    );
  }

  const codigo = `E2E-SEM-${sufijo.toUpperCase()}`;
  const { data: recurso, error: errorRecurso } = await admin.from('recursos_planeacion').insert({
    codigo,
    nombre: `Centro de maquinado E2E ${sufijo}`,
    area: 'sheet_metal',
    activo: true,
  }).select('id').single();
  if (errorRecurso || !recurso) {
    throw new Error(`No se creó recurso E2E: ${errorRecurso?.message ?? 'sin recurso'}`);
  }
  const { error: errorCapacidad } = await admin.from('capacidades_recurso_turno').insert({
    recurso_id: recurso.id,
    turno: 'matutino',
    horas_capacidad: 8,
  });
  if (errorCapacidad) throw new Error(`No se creó capacidad E2E: ${errorCapacidad.message}`);

  return {
    admin,
    correo,
    contrasena,
    administradorId,
    clienteId: cliente.id,
    ordenId: orden.id,
    partidaId: partida.id,
    partidaSecundariaId: partidaSecundaria.id,
    recursoId: recurso.id,
    codigo,
  };
}

async function limpiarContextoCargaSemanal(contexto: ContextoCargaSemanalE2E): Promise<void> {
  const { admin } = contexto;
  await admin.from('programacion_areas').delete().eq('recurso_id', contexto.recursoId);
  await admin.from('partidas_orden_produccion').delete().eq('orden_id', contexto.ordenId);
  await admin.from('ordenes_produccion').delete().eq('id', contexto.ordenId);
  await admin.from('clientes').delete().eq('id', contexto.clienteId);
  await admin.from('capacidades_recurso_turno').delete().eq('recurso_id', contexto.recursoId);
  await admin.from('recursos_planeacion').delete().eq('id', contexto.recursoId);
  await admin.from('logs').delete().eq('usuario_id', contexto.administradorId);
  await admin.from('usuarios').delete().eq('id', contexto.administradorId);
  await admin.auth.admin.deleteUser(contexto.administradorId);
}

test.describe.serial('carga semanal y semáforo de capacidad (C9.1)', () => {
  test.skip(
    process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si para crear datos temporales en Supabase remoto.',
  );

  let contexto: ContextoCargaSemanalE2E | null = null;

  test.beforeAll(async () => { contexto = await prepararContextoCargaSemanal(); });
  test.afterAll(async () => { if (contexto) await limpiarContextoCargaSemanal(contexto); });

  test('el resumen semanal refleja la carga 6/8 h y la sobrecarga se declara Sobrecargado', async ({ page }) => {
    if (!contexto) throw new Error('No se preparó el contexto E2E');
    const datos = contexto;
    const semana = semanaLocalRelativa(new Date());
    const fechaHoy = fechaLocalIso(new Date());

    await page.goto('/iniciar-sesion');
    await page.getByLabel('Correo electrónico').fill(datos.correo);
    await page.getByRole('textbox', { name: 'Contraseña' }).fill(datos.contrasena);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/tablero');

    await page.goto('/planeacion');
    await expect(page.getByTestId('pagina-planeacion')).toBeVisible();
    const resumen = page.getByTestId('resumen-carga-semanal');
    await expect(resumen).toBeVisible();

    // P-01: el resumen vive en el DOM antes de los filtros del calendario.
    const antesDeFiltros = await page.evaluate(() => {
      const bloque = document.querySelector('[data-testid="resumen-carga-semanal"]');
      const fecha = document.querySelector('input[type="date"]');
      if (!bloque || !fecha) return false;
      return (bloque.compareDocumentPosition(fecha) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
    });
    expect(antesDeFiltros).toBe(true);

    // P-01: en vista Mensual (rango > 7 días) el resumen avisa que no aplica.
    await page.getByTestId('vista-planeacion-mes').click();
    await expect(page.getByTestId('resumen-carga-semanal-aviso')).toBeVisible();
    await page.getByTestId('vista-planeacion-semana').click();

    // Semana de hoy (relativa a Date.now(), sin fechas fijas).
    await aplicarRangoRelativo(page, semana);
    await expect(resumen).toContainText(datos.codigo);

    // Programar 6 h hoy en el turno matutino: la celda pasa a 6/8 h.
    await page.getByLabel('Partida', { exact: true }).selectOption(datos.partidaId);
    await page.getByLabel('Recurso').last().selectOption(datos.recursoId);
    await page.getByLabel('Fecha programada').fill(fechaHoy);
    await page.getByLabel('Horas estimadas').fill('6');
    await page.getByTestId('guardar-asignacion-planeacion').click();
    await expect
      .poll(async () => {
        const { data } = await datos.admin
          .from('programacion_areas')
          .select('id')
          .eq('partida_id', datos.partidaId);
        return data?.length ?? 0;
      })
      .toBe(1);

    // '6/8 h' con auto-espera; no se asevera ausencia de 'Sin turnos definidos'.
    await expect(resumen).toContainText('6/8 h');
    await expect(resumen.locator('[aria-label="Cerca del límite: 6/8 h"]')).toBeVisible();

    // Si la jornada baja a 4 h, el mismo día se declara Sobrecargado con horas.
    const { error: errorCapacidad } = await datos.admin
      .from('capacidades_recurso_turno')
      .update({ horas_capacidad: 4 })
      .eq('recurso_id', datos.recursoId)
      .eq('turno', 'matutino');
    expect(errorCapacidad).toBeNull();

    await page.reload();
    await expect(page.getByTestId('pagina-planeacion')).toBeVisible();
    await aplicarRangoRelativo(page, semana);
    const resumenTrasRecarga = page.getByTestId('resumen-carga-semanal');
    await expect(resumenTrasRecarga).toContainText('6/4 h');
    await expect(
      resumenTrasRecarga.locator('[aria-label="Sobrecargado: 6/4 h"]'),
    ).toBeVisible();
  });

  test('el aviso de sobrecapacidad muestra el exceso en horas antes de guardar (C9.2/P09)', async ({
    page,
  }) => {
    if (!contexto) throw new Error('No se preparó el contexto E2E');
    const datos = contexto;
    const fechaHoy = fechaLocalIso(new Date());
    const semana = semanaLocalRelativa(new Date());

    // Base determinista: 6 h programadas hoy en matutino y jornada de 8 h. La
    // prueba anterior pudo dejar horas programadas u otra capacidad; se
    // reemplazan para que 4 h nuevas excedan la jornada por 2 h.
    const { error: errorLimpieza } = await datos.admin
      .from('programacion_areas')
      .delete()
      .eq('recurso_id', datos.recursoId);
    expect(errorLimpieza).toBeNull();
    const { error: errorCapacidad } = await datos.admin
      .from('capacidades_recurso_turno')
      .update({ horas_capacidad: 8 })
      .eq('recurso_id', datos.recursoId)
      .eq('turno', 'matutino');
    expect(errorCapacidad).toBeNull();
    const { error: errorBase } = await datos.admin.from('programacion_areas').insert({
      orden_id: datos.ordenId,
      partida_id: datos.partidaId,
      recurso_id: datos.recursoId,
      secuencia: 1,
      fecha_programada: fechaHoy,
      turno: 'matutino',
      horas_estimadas: 6,
      orden_prioridad: 1,
      estado_planeacion: 'programada',
    });
    expect(errorBase).toBeNull();

    await page.goto('/iniciar-sesion');
    await page.getByLabel('Correo electrónico').fill(datos.correo);
    await page.getByRole('textbox', { name: 'Contraseña' }).fill(datos.contrasena);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/tablero');

    await page.goto('/planeacion');
    await expect(page.getByTestId('pagina-planeacion')).toBeVisible();
    await aplicarRangoRelativo(page, semana);

    // C9.2/P09: 6 h existentes + 4 h nuevas exceden la jornada de 8 h.
    await page.getByLabel('Partida', { exact: true }).selectOption(datos.partidaSecundariaId);
    await page.getByLabel('Recurso').last().selectOption(datos.recursoId);
    await page.getByLabel('Fecha programada').fill(fechaHoy);
    await page.getByLabel('Horas estimadas').fill('4');

    const aviso = page.getByTestId('aviso-capacidad-insuficiente');
    await expect(aviso).toContainText('Excede la capacidad por 2 h (10/8 h)');
    await expect(aviso.getByTestId('insignia-saturacion-sobrecargado')).toBeVisible();
  });
});
