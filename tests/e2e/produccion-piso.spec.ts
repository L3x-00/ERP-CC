import { randomInt, randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { expect, test } from '@playwright/test';
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
  correoAdministrador: string;
  contrasenaAdministrador: string;
  pinOperador: string;
  administradorId: string;
  operadorId: string;
  clienteId: string;
  materialId: string;
  materialLegacyId: string;
  recursoId: string;
  ordenId: string;
  partidaId: string;
  programacionId: string;
  archivoOrigenId: string;
  rutaArchivoOrigen: string;
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

async function prepararContexto(): Promise<ContextoE2E> {
  const admin = crearAdmin();
  const sufijo = randomUUID().slice(0, 8);
  const correoAdministrador = `e2e-prd-admin-${sufijo}@orca.local`;
  const contrasenaAdministrador = `E2e!${randomUUID()}Aa9`;
  const pinOperador = String(randomInt(100000, 1000000));
  const administradorId = await crearUsuario(
    admin, correoAdministrador, contrasenaAdministrador, `Administrador Producción ${sufijo}`, 'admin',
  );
  const operadorId = await crearUsuario(
    admin, `e2e-prd-operador-${sufijo}@orca.local`, `E2e!${randomUUID()}Bb9`, `Operador Producción ${sufijo}`, 'operador',
  );
  const { error: errorPin } = await admin
    .from('usuarios')
    .update({ pin_operador: await bcrypt.hash(pinOperador, 10) })
    .eq('id', operadorId);
  if (errorPin) throw new Error(`No se pudo configurar PIN E2E: ${errorPin.message}`);

  // El cierre finalizado registra consumo transaccional: el fixture mantiene
  // su propio material confirmado para que CI no dependa de semillas.
  const { data: materialLegacy, error: errorMaterialLegacy } = await admin.from('materiales').insert({
    codigo: `E2E-PRD-${sufijo.toUpperCase()}`,
    nombre: `Material E2E Producción ${sufijo}`,
    categoria: 'materia_prima',
    unidad_compra: 'pieza',
    unidad_control: 'pieza',
    factor_conversion: 1,
    costo_unitario_compra: 50,
    costo_unitario_control: 50,
    stock_actual_control: 20,
    stock_minimo_control: 0,
    stock_reservado_control: 0,
  }).select('id').single();
  if (errorMaterialLegacy || !materialLegacy) {
    throw new Error(`No se pudo crear material E2E: ${errorMaterialLegacy?.message ?? 'sin material'}`);
  }
  const { data: material, error: errorMaterial } = await admin.from('catalogo_materiales').insert({
    codigo: `E2EC-PRD-${sufijo.toUpperCase()}`,
    nombre: `Material canónico E2E Producción ${sufijo}`,
    unidad_base: 'pieza',
    material_legacy_id: materialLegacy.id,
  }).select('id, actualizado_en').single();
  if (errorMaterial || !material) {
    throw new Error(`No se pudo crear material canónico E2E: ${errorMaterial?.message ?? 'sin material'}`);
  }
  const { error: errorCosto } = await admin.rpc('confirmar_costo_material', {
    p_material_id: material.id,
    p_costo: 50,
    p_moneda: 'MXN',
    p_fecha_efectiva: '2099-01-01',
    p_fuente: 'MANUAL',
    p_referencia: '',
    p_actor_id: administradorId,
    p_actualizado_en: material.actualizado_en,
  });
  if (errorCosto) throw new Error(`No se confirmó costo de material E2E: ${errorCosto.message}`);

  const { data: recurso, error: errorRecurso } = await admin.from('recursos_planeacion').insert({
    codigo: `E2E-PRD-${sufijo.toUpperCase()}`,
    nombre: `Recurso E2E Producción ${sufijo}`,
    area: 'taller',
    activo: true,
  }).select('id').single();
  if (errorRecurso || !recurso) throw new Error(`No se pudo crear recurso E2E: ${errorRecurso?.message ?? 'sin recurso'}`);
  const { data: cliente, error: errorCliente } = await admin.from('clientes').insert({
    nombre_comercial: `Cliente Producción ${sufijo}`,
    razon_social: `Cliente E2E Producción ${sufijo} SA de CV`,
    estado: 'activo',
  }).select('id').single();
  if (errorCliente || !cliente) throw new Error(`No se pudo crear cliente E2E: ${errorCliente?.message ?? 'sin cliente'}`);

  const { error: errorCapacidad } = await admin.from('capacidades_recurso_turno').insert([
    { recurso_id: recurso.id, turno: 'matutino', horas_capacidad: 8 },
    { recurso_id: recurso.id, turno: 'vespertino', horas_capacidad: 8 },
  ]);
  if (errorCapacidad) throw new Error(`No se pudo crear capacidad E2E: ${errorCapacidad.message}`);

  const { data: folio, error: errorFolio } = await admin.rpc('generar_folio_orden', { p_prefijo: 'OP' });
  if (errorFolio || !folio) throw new Error(`No se pudo generar folio E2E: ${errorFolio?.message ?? 'sin folio'}`);
  const { data: orden, error: errorOrden } = await admin.from('ordenes_produccion').insert({
    folio,
    cliente_id: cliente.id,
    estado: 'programada',
    prioridad: 'alta',
    fecha_compromiso: '2099-12-31T18:00:00.000Z',
  }).select('id').single();
  if (errorOrden || !orden) throw new Error(`No se pudo crear orden E2E: ${errorOrden?.message ?? 'sin orden'}`);

  const rfqItemId = randomUUID();
  const rutaArchivoOrigen = `rfq_item/${rfqItemId}/${randomUUID()}.dxf`;
  const planoOrigen = Buffer.alloc(2 * 1024 * 1024 + 128, 0x20);
  planoOrigen.write('0\nSECTION\n2\nHEADER\n');
  const { error: errorObjetoOrigen } = await admin.storage
    .from('adjuntos-cotizacion')
    .upload(rutaArchivoOrigen, planoOrigen, { contentType: 'application/dxf' });
  if (errorObjetoOrigen) throw new Error(`No se pudo subir plano origen E2E: ${errorObjetoOrigen.message}`);
  const { data: archivoOrigen, error: errorArchivoOrigen } = await admin.from('archivos').insert({
    entidad: 'rfq_item',
    entidad_id: rfqItemId,
    clase: 'CAD',
    nombre_original: 'plano-it01-e2e.dxf',
    nombre_erp: 'plano-it01-e2e.dxf',
    bucket: 'adjuntos-cotizacion',
    ruta_storage: rutaArchivoOrigen,
    mime: 'application/dxf',
    tamano_bytes: planoOrigen.byteLength,
  }).select('id').single();
  if (errorArchivoOrigen || !archivoOrigen) {
    throw new Error(`No se pudo registrar plano origen E2E: ${errorArchivoOrigen?.message ?? 'sin archivo'}`);
  }
  const { error: errorSnapshot } = await admin.from('ordenes_produccion').update({
    snapshot_json: {
      version: 1,
      orden_id: orden.id,
      origen: {},
      cabecera: {},
      items: [],
      archivos: [{ archivo_id: archivoOrigen.id }],
    },
  }).eq('id', orden.id);
  if (errorSnapshot) throw new Error(`No se pudo congelar plano E2E: ${errorSnapshot.message}`);

  const { data: partida, error: errorPartida } = await admin.from('partidas_orden_produccion').insert({
    orden_id: orden.id,
    codigo_pieza: `E2E-PRD-${sufijo}`,
    descripcion: 'Partida temporal para comprobar sesiones y entregas',
    cantidad_solicitada: 5,
    cantidad_producida: 0,
    cantidad_scrap: 0,
    catalogo_material_id: material.id,
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
  if (errorProgramacion || !programacion?.[0]) throw new Error(`No se pudo programar partida E2E: ${errorProgramacion?.message ?? 'sin programación'}`);
  const { data: preparada, error: errorPreparada } = await admin.rpc('activar_modo_preparacion', {
    p_programacion_id: programacion[0].id,
    p_actualizado_en_esperado: programacion[0].actualizado_en,
  });
  if (errorPreparada || !preparada?.[0]) throw new Error(`No se pudo preparar recurso E2E: ${errorPreparada?.message ?? 'sin respuesta'}`);

  return {
    admin, correoAdministrador, contrasenaAdministrador, pinOperador, administradorId, operadorId,
    clienteId: cliente.id, recursoId: recurso.id, ordenId: orden.id, partidaId: partida.id,
    materialId: material.id, materialLegacyId: materialLegacy.id,
    programacionId: preparada[0].id, archivoOrigenId: archivoOrigen.id, rutaArchivoOrigen,
  };
}

async function limpiarContexto(contexto: ContextoE2E): Promise<void> {
  const { admin } = contexto;
  const { data: documentosOrden } = await admin.from('archivos')
    .select('id, ruta_storage, bucket')
    .eq('entidad', 'orden')
    .eq('entidad_id', contexto.ordenId);
  for (const documento of documentosOrden ?? []) {
    await admin.storage.from(documento.bucket).remove([documento.ruta_storage]);
  }
  if (documentosOrden?.length) {
    await admin.from('archivos').delete().in('id', documentosOrden.map((documento) => documento.id));
  }
  await admin.from('archivos').delete().eq('id', contexto.archivoOrigenId);
  await admin.storage.from('adjuntos-cotizacion').remove([contexto.rutaArchivoOrigen]);
  const { data: archivos } = await admin.from('archivos_sesion_produccion')
    .select('id, ruta, sesiones_trabajo!inner(orden_id)')
    .eq('sesiones_trabajo.orden_id', contexto.ordenId);
  const rutas = (archivos ?? []).map((archivo) => archivo.ruta);
  if (archivos?.length) await admin.from('archivos_sesion_produccion').delete().in('id', archivos.map((archivo) => archivo.id));
  if (rutas.length) await admin.storage.from('archivos-sesion-produccion').remove(rutas);
  const { data: notas } = await admin.from('notas_entrega').select('id').eq('orden_id', contexto.ordenId);
  const notasIds = (notas ?? []).map((nota) => nota.id);
  if (notasIds.length > 0) await admin.from('partidas_nota_entrega').delete().in('nota_entrega_id', notasIds);
  await admin.from('notas_entrega').delete().eq('orden_id', contexto.ordenId);
  await admin.from('registros_avance_partida').delete().eq('partida_id', contexto.partidaId);
  await admin.from('registros_consumo_material').delete().eq('partida_id', contexto.partidaId);
  await admin.from('registros_tiempo_operador').delete().eq('partida_id', contexto.partidaId);
  await admin.from('sesiones_trabajo').delete().eq('partida_id', contexto.partidaId);
  await admin.from('programacion_areas').delete().eq('id', contexto.programacionId);
  await admin.from('ordenes_produccion').delete().eq('id', contexto.ordenId);
  await admin.from('capacidades_recurso_turno').delete().eq('recurso_id', contexto.recursoId);
  await admin.from('recursos_planeacion').delete().eq('id', contexto.recursoId);
  await admin.from('catalogo_materiales').update({ activo: false }).eq('id', contexto.materialId);
  await admin.from('materiales').delete().eq('id', contexto.materialLegacyId);
  await admin.from('clientes').delete().eq('id', contexto.clienteId);
  await admin.from('logs').delete().in('usuario_id', [contexto.administradorId, contexto.operadorId]);
  await admin.from('usuarios').delete().in('id', [contexto.administradorId, contexto.operadorId]);
  await admin.auth.admin.deleteUser(contexto.administradorId);
  await admin.auth.admin.deleteUser(contexto.operadorId);
}

async function iniciarSesionAdministrador(page: import('@playwright/test').Page, contexto: ContextoE2E): Promise<void> {
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

test.describe.serial('piso de Producción y entregas', () => {
  test.skip(
    process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si para crear datos temporales en Supabase remoto.',
  );

  let contexto: ContextoE2E | null = null;

  test.beforeAll(async () => {
    contexto = await prepararContexto();
  });

  test.afterAll(async () => {
    if (contexto) await limpiarContexto(contexto);
  });

  test('C5 permite un flujo tactil continuo de PIN, seleccion y salida', async ({ page }) => {
    const caso = await prepararContexto();
    try {
      const { error: errorEstado } = await caso.admin.from('ordenes_produccion')
        .update({ estado: 'en_proceso' }).eq('id', caso.ordenId);
      if (errorEstado) throw new Error(`No se pudo abrir el trabajo C5: ${errorEstado.message}`);
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto('/operador');
      for (const digito of caso.pinOperador) {
        await page.getByRole('button', { name: digito, exact: true }).click();
      }
      await page.getByRole('button', { name: 'Confirmar PIN' }).click();
      await page.waitForURL('**/produccion-piso');

      // El piso concentra la cola y el detalle de procesos. El registro operativo
      // vive en el detalle/panel personal para no duplicar una tabla extensa al final.
      await expect(page.getByTestId('espacio-operador')).toBeVisible();
      await expect(page.getByTestId('control-piso')).toHaveCount(0);
      await expect(
        page.getByRole('button', { name: /^Opciones de / })
      ).toBeVisible();

      // C8.3c (O-05 C): el operador con PIN abre la hoja de trabajo sin precios y sus archivos.
      await page.goto(`/produccion-piso/hoja/${caso.ordenId}`);
      await page.waitForURL(`**/produccion-piso/hoja/${caso.ordenId}`);
      const hoja = page.getByTestId('hoja-trabajo-piso');
      await expect(hoja).toContainText('Orden de servicio');
      await expect(hoja).toContainText('plano-it01-e2e.dxf');
      expect(await hoja.textContent()).not.toMatch(/\$|\bMXN\b|\bUSD\b|Subtotal|\bIVA\b|snapshot/u);
      // Un .dxf se descarga: la ventana nueva queda en blanco, así que se comprueba la petición firmada.
      const peticionFirmada = page.context().waitForEvent(
        'request',
        (peticion) => peticion.url().includes('/storage/v1/object/sign/'),
      );
      const [ventanaArchivo] = await Promise.all([
        page.waitForEvent('popup'),
        hoja.getByRole('button', { name: /plano-it01-e2e\.dxf/u }).click(),
      ]);
      expect((await peticionFirmada).url()).toContain('/storage/v1/object/sign/');
      await ventanaArchivo.close();
      // Una orden que no está en su piso no se abre ni revela si existe.
      const ajena = await page.goto(`/produccion-piso/hoja/${randomUUID()}`);
      expect(ajena?.status()).toBe(404);
      await page.goto('/produccion-piso');
      await expect(page.getByTestId('espacio-operador')).toBeVisible();

      // Abrir el menú de cuenta del operador.
      await page.getByRole('button', { name: /^Opciones de / }).click();

      // Comprobar que aparecen el panel personal, tema y cierre de sesión.
      const menuOperador = page.getByRole('menu', {
        name: 'Menú del operador',
      });

      await expect(menuOperador).toBeVisible();
      await expect(menuOperador.getByRole('menuitem', { name: 'Ver mi panel' })).toBeVisible();

      const temaInicial = (await page.locator('html').getAttribute('class'))?.includes('dark')
        ? 'dark'
        : 'light';
      const temaDestino = temaInicial === 'dark' ? 'light' : 'dark';
      await menuOperador.getByRole('menuitem', {
        name: `Cambiar a tema ${temaDestino === 'dark' ? 'oscuro' : 'claro'}`,
      }).click();
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${temaDestino}\\b`));

      await page.getByRole('button', { name: /^Opciones de / }).click();
      await page.getByRole('menuitem', { name: 'Ver mi panel' }).click();
      await page.waitForURL('**/operador/mi-panel');
      await expect(page.getByTestId('jornada-diaria-operador')).toBeVisible();
      await expect(page.locator('html')).toHaveClass(new RegExp(`\\b${temaDestino}\\b`));

      await page.getByRole('button', { name: /^Opciones de / }).click();
      const opcionSalir = page.getByRole('menu', { name: 'Menú del operador' }).getByRole('menuitem', {
        name: 'Salir',
        exact: true,
      });
      await expect(opcionSalir).toBeVisible();

      // Cerrar sesión y regresar al acceso PIN.
      await opcionSalir.click();
      await page.waitForURL('**/operador');
      await expect(page.getByTestId('teclado-pin')).toBeVisible();
    } finally {
      await limpiarContexto(caso);
    }
  });

  test('C10 muestra el espacio de operador con Kanban, calendario y areas, y permite reclamar', async ({ page }) => {
    const caso = await prepararContexto();
    try {
      await page.setViewportSize({ width: 1920, height: 1080 });
      await page.goto('/operador');
      for (const digito of caso.pinOperador) {
        await page.getByRole('button', { name: digito, exact: true }).click();
      }
      await page.getByRole('button', { name: 'Confirmar PIN' }).click();
      await page.waitForURL('**/produccion-piso');

      const espacio = page.getByTestId('espacio-operador');
      await expect(espacio).toBeVisible();
      await expect(page.getByTestId('resumen-espacio')).toBeVisible();
      for (const columna of ['aprobada', 'bandeja', 'en_proceso', 'pausada', 'lista']) {
        await expect(page.getByTestId(`columna-${columna}`)).toBeVisible();
      }

      // La orden agrupa sus ítems y procesos; la tarjeta correcta se localiza
      // por su id, no por posición, para no depender del orden de las columnas.
      const tarjetaOrden = page.getByTestId(`orden-operador-${caso.ordenId}`);
      await expect(tarjetaOrden).toBeVisible();
      await expect(tarjetaOrden).toContainText('Cliente Producción');

      // La tarjeta completa abre el resumen de la orden con todos sus ítems.
      await tarjetaOrden.getByTestId(`abrir-orden-operador-${caso.ordenId}`).click();
      const detalleOrden = page.getByTestId('detalle-orden-operador');
      await expect(detalleOrden).toBeVisible();
      await expect(detalleOrden).toContainText('Qué fabricar');
      await expect(detalleOrden).toContainText('E2E-PRD-');
      await page.getByRole('button', { name: 'Cerrar orden' }).click();

      // La fila del proceso conserva cantidad, horas y acciones.
      const tarjeta = page.locator(`[data-testid^="proceso-${caso.partidaId}:"]`).first();
      await expect(tarjeta).toBeVisible();
      await expect(tarjeta).toContainText('0/5');
      await expect(tarjeta).toContainText('2 h');

      // Las tres vistas del espacio existen y comparten los mismos datos.
      await page.getByTestId('vista-calendario').click();
      await expect(page.getByTestId('vista-calendario-operador')).toBeVisible();
      await expect(page.locator('[data-testid^="dia-"]')).toHaveCount(7);
      await page.getByTestId('vista-areas').click();
      await expect(page.getByTestId('vista-areas-operador')).toBeVisible();
      await expect(page.getByTestId('area-sin-area')).toBeVisible();
      await page.getByTestId('vista-kanban').click();

      // La tarjeta abre el detalle; desde ahí se reclama y se inicia.
      await tarjeta.getByTestId(/^abrir-detalle-/u).click();
      const detalle = page.getByTestId('detalle-proceso');
      await expect(detalle).toBeVisible();
      await detalle.getByTestId('reclamar-detalle').click();
      await expect(page.getByTestId('aviso-espacio')).toContainText('reservado', { ignoreCase: true });
      const tarjetaReservada = page.locator(`[data-testid^="proceso-${caso.partidaId}:"]`).first();
      await expect(tarjetaReservada).toContainText('Reservado por ti');

      // La ficha muestra la ruta, el material y los archivos de la orden.
      await expect(detalle).toContainText('Ruta de fabricación');
      await expect(detalle).toContainText('Fabricación');
      await expect(detalle).toContainText('Planos y archivos');
      await expect(detalle).toContainText('Reserva: tuya');

      // Iniciar desde el espacio reserva el recurso y abre la sesión real.
      await detalle.getByTestId('iniciar-detalle').click();
      await confirmarChecklistInicio(page);
      await expect(page.getByTestId('aviso-espacio')).toContainText('Sesión iniciada');
      await expect(page.getByTestId('columna-en_proceso')).toContainText('Fabricación');
    } finally {
      // Mi panel: mostrar los procesos mediante tarjetas.
await page.goto('/operador/mi-panel');

await expect(
  page.getByRole('heading', { name: 'Mis procesos' }),
).toBeVisible();

const tarjetaPersonal = page
  .locator('article')
  .filter({ hasText: 'E2E-PRD-' })
  .first();

await expect(tarjetaPersonal).toBeVisible();
await expect(tarjetaPersonal).toContainText('Fabricación');
await expect(tarjetaPersonal).toContainText('Área');
await expect(tarjetaPersonal).toContainText('Tiempo trabajado');
await expect(tarjetaPersonal).toContainText('Producidas');
await expect(tarjetaPersonal).toContainText('Pendientes');
await expect(tarjetaPersonal).toContainText('Avance del proceso');

await expect(
  tarjetaPersonal.getByRole('progressbar'),
).toBeVisible();

// Los filtros deben conservar el proceso correspondiente.
await page
  .getByLabel('Filtrar mis procesos por estado')
  .selectOption('en_proceso');

await expect(tarjetaPersonal).toBeVisible();

await page
  .getByLabel('Filtrar mis procesos por estado')
  .selectOption('todos');

// Una sesión activa no permite liberar la reserva.
await expect(
  tarjetaPersonal.getByRole('button', { name: 'Liberar reserva' }),
).toHaveCount(0);

// El detalle no debe aparecer debajo de las tarjetas.
await expect(
  page.getByTestId('detalle-proceso-integrado'),
).toHaveCount(0);

// Gestionar proceso debe abrir un modal.
await tarjetaPersonal
  .getByRole('button', { name: 'Gestionar proceso' })
  .click();

const modalGestion = page.getByRole('dialog').filter({
  has: page.getByTestId('detalle-proceso-integrado'),
});

await expect(modalGestion).toBeVisible();
await expect(
  modalGestion.getByRole('heading', { name: /Gestionar proceso/ }),
).toBeVisible();

await expect(
  modalGestion.getByTestId('detalle-proceso-integrado'),
).toBeVisible();

await expect(modalGestion).toContainText('Ruta de fabricación');
await expect(modalGestion).toContainText('Cerrar la sesión en marcha');
await expect(modalGestion).toContainText('Consumo de material');

// Cerrar el modal debe regresar a las tarjetas.
await modalGestion
  .getByRole('button', { name: 'Cerrar ficha' })
  .click();

await expect(modalGestion).toBeHidden();
await expect(tarjetaPersonal).toBeVisible();

await expect(
  page.getByTestId('detalle-proceso-integrado'),
).toHaveCount(0);
      await limpiarContexto(caso);
    }
  });

  test('el admin entra directo a la vista de producción y vuelve a administración', async ({ page }) => {
    const caso = await prepararContexto();
    try {
      const { error: errorEstado } = await caso.admin.from('ordenes_produccion')
        .update({ estado: 'en_proceso' }).eq('id', caso.ordenId);
      if (errorEstado) throw new Error(`No se pudo abrir el trabajo admin: ${errorEstado.message}`);
      await page.setViewportSize({ width: 768, height: 1024 });
      await iniciarSesionAdministrador(page, caso);
      await page.goto('/produccion');

      // El formulario de operador/motivo ya no existe: un solo botón.
      await expect(page.getByTestId('selector-vista-operador')).toHaveCount(0);
      await page.getByTestId('abrir-vista-produccion').click();
      await page.waitForURL('**/produccion-piso');

      await expect(page.getByTestId('banner-vista-admin')).toContainText('Vista de administrador');
      await expect(page.getByTestId('espacio-operador')).toBeVisible();
      await expect(page.getByTestId('iniciar-tiempo')).toHaveCount(0);
      await expect(page.getByTestId('registrar-avance')).toHaveCount(0);
      await expect(page.getByTestId('registrar-consumo')).toHaveCount(0);

      // El botón de regreso está en el mismo lugar y devuelve a Producción.
      await page.getByTestId('volver-a-admin').click();
      await page.waitForURL('**/produccion');
      await expect(page.getByTestId('abrir-vista-produccion')).toBeVisible();
    } finally {
      await limpiarContexto(caso);
    }
  });

  test('el administrador ve el piso completo en solo lectura sin PIN', async ({ page }) => {
    const caso = await prepararContexto();
    try {
      const { error: errorEstado } = await caso.admin
        .from('ordenes_produccion')
        .update({ estado: 'en_proceso' })
        .eq('id', caso.ordenId);
      if (errorEstado) throw new Error(`No se pudo abrir el trabajo admin: ${errorEstado.message}`);
      await page.setViewportSize({ width: 1440, height: 900 });
      await iniciarSesionAdministrador(page, caso);

      // Sin sesión de operador ni delegación: el admin entra directo al piso.
      await page.goto('/produccion-piso');
      await expect(page.getByTestId('banner-vista-admin')).toContainText('Vista de administrador');
      await expect(page.getByTestId('volver-a-admin')).toBeVisible();
      await expect(page.getByTestId('espacio-operador')).toBeVisible();
      await expect(page.getByTestId('control-piso')).toHaveCount(0);
      await expect(page.getByTestId('iniciar-tiempo')).toHaveCount(0);
      await expect(page.getByTestId('registrar-avance')).toHaveCount(0);
      await expect(page.getByTestId('registrar-consumo')).toHaveCount(0);
    } finally {
      await limpiarContexto(caso);
    }
  });

  test('inicia con PIN, completa la partida y genera entregas parcial y total sincronizadas', async ({ page, browser }) => {
    if (!contexto) throw new Error('No se preparó el contexto E2E');
    const contextoPrueba = contexto;
    await iniciarSesionAdministrador(page, contextoPrueba);
    const observador = await browser.newPage();
    await iniciarSesionAdministrador(observador, contextoPrueba);
    await observador.goto('/produccion');
    await expect(observador.getByTestId(`tarjeta-produccion-${contextoPrueba.ordenId}`)).toContainText('Bandeja');
    await expect(observador.getByTestId('sincronizador-produccion')).toHaveAttribute('data-conectado', 'true');

    await page.goto('/operador');
    for (const digito of contextoPrueba.pinOperador) {
      await page.getByRole('button', { name: digito, exact: true }).click();
    }
    await page.getByRole('button', { name: 'Confirmar PIN' }).click();
    await page.waitForURL('**/produccion-piso');
    await page.goto('/produccion');
    await expect(page.getByTestId('operacion-produccion')).toBeVisible();

    const tarjeta = page.getByTestId(`tarjeta-produccion-${contextoPrueba.ordenId}`);
    await tarjeta.getByRole('button', { name: 'Operar orden' }).click();
    await expect(page.getByTestId('orden-seleccionada-panel')).toContainText('Orden seleccionada:');
    await expect(page.getByTestId('panel-operador-produccion')).toBeInViewport();
    await page.getByTestId('iniciar-sesion-produccion').click();
    await confirmarChecklistInicio(page);
    await expect(page.getByRole('status')).toContainText('Sesión iniciada');
    await expect(observador.getByTestId(`tarjeta-produccion-${contextoPrueba.ordenId}`)).toContainText('En proceso');

    await page.getByLabel('Piezas producidas ahora').fill('5');
    await page.getByLabel('Material').selectOption(contextoPrueba.materialId);
    await page.getByLabel('Usado').fill('5');
    await page.getByLabel('Confirmar PIN').fill(contextoPrueba.pinOperador);
    await page.getByTestId('cerrar-sesion-produccion').click();
    await expect(page.getByTestId('resumen-cierre-sesion')).toContainText('Material usado');
    await page.getByRole('button', { name: 'Entendido' }).click();

    await expect.poll(async () => {
      const { data } = await contextoPrueba.admin
        .from('partidas_orden_produccion')
        .select('cantidad_producida')
        .eq('id', contextoPrueba.partidaId)
        .single();
      return Number(data?.cantidad_producida ?? 0);
    }).toBe(5);
    const { data: programacion } = await contextoPrueba.admin
      .from('programacion_areas')
      .select('estado_planeacion')
      .eq('id', contextoPrueba.programacionId)
      .single();
    expect(programacion?.estado_planeacion).toBe('completada');

    await page.getByTestId('abrir-nota-entrega').click();
    await page.getByLabel('Recibido por').fill('Almacén E2E');
    await page.getByLabel(/Cantidad entregada E2E-PRD-/).fill('2');
    await page.getByTestId('generar-nota-entrega').click();
    await expect(page.getByTestId('panel-nota-entrega').getByRole('status')).toContainText(/^Nota NE-\d{6} generada$/);
    await expect(observador.getByTestId(`tarjeta-produccion-${contextoPrueba.ordenId}`)).toContainText('Lista');

    await page.getByTestId('abrir-nota-entrega').click();
    await page.getByLabel('Recibido por').fill('Almacén E2E');
    await page.getByLabel(/Cantidad entregada E2E-PRD-/).fill('3');
    await page.getByTestId('generar-nota-entrega').click();
    await expect(page.getByTestId('panel-nota-entrega').getByRole('status')).toContainText(/^Nota NE-\d{6} generada$/);
    await expect(observador.getByTestId(`tarjeta-produccion-${contextoPrueba.ordenId}`)).toContainText('Entregada');

    // OBS-13: la nota generada queda como entregable imprimible con su confirmación.
    const mensajeNota = await page.getByTestId('panel-nota-entrega').getByRole('status').textContent();
    const folioNota = /NE-\d{6}/.exec(mensajeNota ?? '')?.[0] ?? '';
    expect(folioNota).not.toBe('');
    const panelEntregables = page.getByTestId('panel-documentos-orden');
    await expect(panelEntregables).toBeVisible();
    await panelEntregables.getByTestId('alternar-entregables-orden').click();
    const listaNotas = panelEntregables.getByTestId('lista-notas-entrega');
    await expect(listaNotas).toContainText(folioNota);
    await expect(listaNotas).toContainText('Almacén E2E');
    await panelEntregables.getByTestId(`imprimir-nota-${folioNota}`).click();
    const dialogoNota = page.getByRole('dialog', { name: `Nota de entrega ${folioNota}` });
    await expect(dialogoNota.getByTestId('documento-nota-entrega')).toContainText('Recibido por (confirmación)');
    await expect(dialogoNota.getByTestId('documento-nota-entrega')).toContainText('Almacén E2E');
    await page.keyboard.press('Escape');
    await expect(dialogoNota).toBeHidden();
    // C2.3: el plano exacto congelado en la Orden llega al piso sin copiar el blob.
    const planoOrigen = panelEntregables.locator('li').filter({ hasText: 'plano-it01-e2e.dxf' });
    await expect(planoOrigen).toContainText('RFQ · ítem');
    await expect(planoOrigen).toContainText('versión aceptada');
    const [planoLectura] = await Promise.all([
      page.waitForEvent('popup'),
      planoOrigen.getByRole('button', { name: /^Abrir plano-it01-e2e\.dxf/ }).click(),
    ]);
    await expect.poll(async () => (await page.request.get(planoLectura.url())).status()).toBe(200);
    await planoLectura.close();
    const dwgOrden = Buffer.alloc(2 * 1024 * 1024 + 64, 0x20);
    dwgOrden.write('AC1032');
    await panelEntregables.getByLabel('Archivo de la orden').setInputFiles({
      name: 'ajuste-en-piso.dwg',
      mimeType: 'image/vnd.dwg',
      buffer: dwgOrden,
    });
    await panelEntregables.getByRole('button', { name: 'Subir', exact: true }).click();
    await expect(panelEntregables).toContainText('Documento ajuste-en-piso.dwg subido');
    const documentoOrden = panelEntregables.locator('li').filter({ hasText: 'ajuste-en-piso.dwg' });
    await expect(documentoOrden).toContainText('agregado a la orden');
    const dwgOrdenV2 = Buffer.alloc(2 * 1024 * 1024 + 96, 0x20);
    dwgOrdenV2.write('AC1032-V2');
    await panelEntregables.getByLabel('Archivo de la orden').setInputFiles({
      name: 'ajuste-en-piso.dwg',
      mimeType: 'image/vnd.dwg',
      buffer: dwgOrdenV2,
    });
    await panelEntregables.getByRole('button', { name: 'Subir', exact: true }).click();
    await expect(panelEntregables.getByRole('button', { name: 'Ver versiones (1)' })).toBeVisible();
    await panelEntregables.getByRole('button', { name: 'Ver versiones (1)' }).click();
    await expect(panelEntregables.getByText('histórica', { exact: false })).toBeVisible();
    const [dwgHistorico] = await Promise.all([
      page.waitForEvent('popup'),
      panelEntregables
        .getByRole('button', { name: /Abrir ajuste-en-piso\.dwg, Orden, versión 1/ })
        .click(),
    ]);
    await expect.poll(async () => (await page.request.get(dwgHistorico.url())).status()).toBe(200);
    await dwgHistorico.close();
    await observador.getByTestId(`tarjeta-produccion-${contextoPrueba.ordenId}`)
      .getByRole('button', { name: 'Ver en producción' }).click();
    const detalleConcluido = observador.getByTestId('detalle-orden-concluida');
    await expect(detalleConcluido).toBeVisible();
    await expect(detalleConcluido).toContainText('Material utilizado');
    await expect(detalleConcluido).toContainText('Historial de sesiones');
    await expect(detalleConcluido).toContainText('La orden está entregada por completo.');
    await expect(observador.getByTestId('panel-documentos-orden')).toContainText('Sin archivos de salida final');
    await panelEntregables.getByLabel('Archivo de salida final').setInputFiles({
      name: 'archivo-no-permitido.exe', mimeType: 'application/octet-stream', buffer: Buffer.from('E2E'),
    });
    await panelEntregables.getByRole('button', { name: 'Subir salida' }).click();
    await expect(panelEntregables).toContainText('Tipo de archivo no permitido');
    await expect(observador.getByTestId('panel-documentos-orden')).toContainText('Sin archivos de salida final');
    await panelEntregables.getByLabel('Archivo de salida final').setInputFiles({
      name: 'salida-final.pdf',
      mimeType: 'application/pdf',
      buffer: Buffer.from('%PDF-1.4\nSalida final E2E\n'),
    });
    await panelEntregables.getByRole('button', { name: 'Subir salida' }).click();
    await expect(panelEntregables).toContainText('Archivo de salida final asociado');
    await expect(panelEntregables).toContainText('salida-final.pdf');
    await expect(observador.getByTestId('panel-documentos-orden')).toContainText('salida-final.pdf');
    await page.screenshot({ path: '.ai-shared/qa/cierre-auditoria-2026-09-22/a20-prd17-salida-final.png', fullPage: true });
    const [salidaLectura] = await Promise.all([
      page.waitForEvent('popup'),
      panelEntregables.getByRole('button', { name: 'Abrir en lectura' }).click(),
    ]);
    await expect.poll(async () => (await page.request.get(salidaLectura.url())).status()).toBe(200);
    await salidaLectura.close();

    // OBS-17: hilo de comentarios del trabajo dentro del piso.
    const hilo = page.getByTestId('hilo-comentarios');
    await expect(hilo).toBeVisible();
    await hilo.getByRole('button', { name: 'Nuevo comentario' }).click();
    const dialogoComentario = page.getByRole('dialog', { name: 'Nuevo comentario' });
    await expect(dialogoComentario).toBeVisible();
    await dialogoComentario.getByLabel('Nuevo comentario').fill('Entrega revisada en piso');
    await dialogoComentario.getByRole('button', { name: 'Comentar' }).click();
    await expect(hilo).toContainText('Entrega revisada en piso');

    const { data: notas, error: errorNotas } = await contextoPrueba.admin
      .from('notas_entrega')
      .select('*')
      .eq('orden_id', contextoPrueba.ordenId)
      .order('creado_en');
    expect(errorNotas).toBeNull();
    expect(notas).toHaveLength(2);
    expect(notas?.map((nota) => nota.es_parcial)).toEqual([true, false]);
    expect(Object.keys(notas?.[0] ?? {})).not.toContain('precio');

    const { data: logs } = await contextoPrueba.admin
      .from('logs')
      .select('accion')
      .eq('modulo', 'produccion')
      .in('usuario_id', [contextoPrueba.administradorId, contextoPrueba.operadorId]);
    const acciones = new Set((logs ?? []).map((log) => log.accion));
    for (const accion of ['iniciar_sesion_trabajo', 'cerrar_sesion_trabajo', 'generar_nota_entrega', 'asociar_archivo_sesion']) {
      expect(acciones.has(accion)).toBe(true);
    }
    await observador.close();
  });

  test('reanuda una pausa con confirmación e historial persistido', async ({ page }) => {
    const caso = await prepararContexto();
    try {
      await iniciarSesionAdministrador(page, caso);
      await page.goto('/operador');
      for (const digito of caso.pinOperador) await page.getByRole('button', { name: digito, exact: true }).click();
      await page.getByRole('button', { name: 'Confirmar PIN' }).click();
      await page.waitForURL('**/produccion-piso');
      await page.goto('/produccion');
      await page.getByTestId(`tarjeta-produccion-${caso.ordenId}`).getByRole('button', { name: 'Operar orden' }).click();
      await page.getByTestId('iniciar-sesion-produccion').click();
      await confirmarChecklistInicio(page);
      await expect(page.getByRole('status')).toContainText('Sesión iniciada');

      await page.getByLabel('Piezas producidas ahora').fill('2');
      await page.getByLabel('Resultado').selectOption('pausada');
      await page.getByLabel('Motivo de pausa').selectOption('MATERIAL');
      await page.getByLabel('Notas operativas').fill('Esperando insumo para continuar');
      await page.getByLabel('Confirmar PIN').fill(caso.pinOperador);
      await page.getByTestId('cerrar-sesion-produccion').click();
      await expect(page.getByRole('status')).toContainText('Sesión registrada');
      await expect(page.getByRole('region', { name: 'Historial de sesiones' })).toContainText('Esperando insumo para continuar');

      const historial = page.getByRole('region', { name: 'Historial de sesiones' });
      const binario = Buffer.alloc(2 * 1024 * 1024 + 128, 0x20);
      binario.write('%PDF-1.4\n');
      await historial.locator('input[type="file"]').first().setInputFiles({
        name: 'registro-turno.pdf', mimeType: 'application/pdf', buffer: binario,
      });
      await historial.getByRole('button', { name: 'Subir archivo' }).first().click();
      await expect(historial).toContainText('Archivo asociado a la sesión');
      await expect(historial).toContainText('registro-turno.pdf');
      await expect(page.getByTestId('panel-documentos-orden')).toContainText('Planos y documentos del cliente/orden');
      await expect(page.getByTestId('panel-documentos-orden')).toContainText('Salida y notas de entrega');
      await page.screenshot({ path: '.ai-shared/qa/cierre-auditoria-2026-09-22/a20-prd17-escritorio-claro.png', fullPage: true });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.screenshot({ path: '.ai-shared/qa/cierre-auditoria-2026-09-22/a20-prd17-movil-oscuro.png', fullPage: true });
      await page.setViewportSize({ width: 1280, height: 720 });
      await page.emulateMedia({ colorScheme: 'light' });
      const [lectura] = await Promise.all([
        page.waitForEvent('popup'),
        historial.getByRole('button', { name: 'Abrir en lectura' }).first().click(),
      ]);
      await expect.poll(async () => (await page.request.get(lectura.url())).status()).toBe(200);
      await lectura.close();

      await page.getByRole('button', { name: 'Continuar sesión pausada' }).click();
      const dialogo = page.getByRole('dialog', { name: /Reanudar OP-/ });
      await expect(dialogo).toContainText('Falta de material');
      await expect(dialogo).toContainText(/2(?:\.00)? piezas/);
      await page.screenshot({ path: '.ai-shared/qa/cierre-auditoria-2026-09-22/a20-reanudacion-escritorio.png' });
      await page.setViewportSize({ width: 390, height: 844 });
      await page.emulateMedia({ colorScheme: 'dark' });
      await page.screenshot({ path: '.ai-shared/qa/cierre-auditoria-2026-09-22/a20-reanudacion-movil-oscuro.png' });
      await dialogo.getByRole('button', { name: 'Cancelar' }).click();
      const { data: antes } = await caso.admin.from('sesiones_trabajo').select('id').eq('orden_id', caso.ordenId);
      expect(antes).toHaveLength(1);

      await page.getByRole('button', { name: 'Continuar sesión pausada' }).click();
      await dialogo.getByRole('button', { name: 'Continuar', exact: true }).click();
      await expect(page.getByTestId('panel-operador-produccion').getByRole('status')).toContainText('Sesión reanudada');
      await expect.poll(async () => {
        const { data } = await caso.admin.from('sesiones_trabajo').select('id').eq('orden_id', caso.ordenId);
        return data?.length;
      }).toBe(2);
      await expect(page.getByRole('region', { name: 'Historial de sesiones' })).toContainText('Esperando insumo para continuar');
      await expect(historial.getByText('registro-turno.pdf')).toHaveCount(1);
      await expect(historial.getByText('Sin archivos asociados.')).toHaveCount(1);
      const { data: programacion } = await caso.admin.from('programacion_areas')
        .select('estado_planeacion').eq('id', caso.programacionId).single();
      expect(programacion?.estado_planeacion).toBe('en_proceso');
    } finally {
      await limpiarContexto(caso);
    }
  });
});
