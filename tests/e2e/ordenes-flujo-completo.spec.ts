import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { expect, test } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

/** Carga solo pares simples de `.env.local`; no registra ningún secreto. */
function cargarEntornoLocal(): void {
  const ruta = `${process.cwd()}\\.env.local`;
  if (!existsSync(ruta)) return;

  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const coincidencia = /^([A-Z0-9_]+)=(.*)$/.exec(linea.trim());
    if (!coincidencia || process.env[coincidencia[1]] !== undefined) continue;
    const valor = coincidencia[2].replace(/^['\"]|['\"]$/g, '');
    process.env[coincidencia[1]] = valor;
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
  materialLegacyId: string;
  materialId: string;
  ordenId: string | null;
  partidaId: string | null;
  consumoId: string | null;
};

function requerirVariable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    throw new Error(`Falta la variable de entorno ${nombre} para las pruebas E2E.`);
  }
  return valor;
}

function crearAdminE2E(): SupabaseClient<Database> {
  return createClient<Database>(
    requerirVariable('NEXT_PUBLIC_SUPABASE_URL'),
    requerirVariable('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}

async function crearUsuarioE2E(
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
    throw new Error(`No se pudo crear el usuario E2E: ${error?.message ?? 'sin usuario'}`);
  }

  const { error: errorPerfil } = await admin
    .from('usuarios')
    .update({ rol, activo: true, nombre_completo: nombreCompleto })
    .eq('id', data.user.id);
  if (errorPerfil) {
    throw new Error(`No se pudo preparar el perfil E2E: ${errorPerfil.message}`);
  }
  return data.user.id;
}

async function prepararContexto(): Promise<ContextoE2E> {
  const admin = crearAdminE2E();
  const sufijo = randomUUID().slice(0, 8);
  const contrasenaAdministrador = `E2e!${randomUUID()}Aa9`;
  // PIN aleatorio: el login de piso rechaza duplicados entre operadores activos
  // (corridas fallidas previas pudieron dejar otro operador con el PIN fijo).
  const pinOperador = String(100000 + Math.floor(Math.random() * 900000));
  const correoAdministrador = `e2e-admin-${sufijo}@orca.local`;
  const correoOperador = `e2e-operador-${sufijo}@orca.local`;

  const administradorId = await crearUsuarioE2E(
    admin,
    correoAdministrador,
    contrasenaAdministrador,
    `Administrador E2E ${sufijo}`,
    'admin',
  );
  const operadorId = await crearUsuarioE2E(
    admin,
    correoOperador,
    `E2e!${randomUUID()}Bb9`,
    `Operador E2E ${sufijo}`,
    'operador',
  );

  const { error: errorPin } = await admin
    .from('usuarios')
    .update({ pin_operador: await bcrypt.hash(pinOperador, 10) })
    .eq('id', operadorId);
  if (errorPin) {
    throw new Error(`No se pudo configurar el PIN E2E: ${errorPin.message}`);
  }

  const { data: cliente, error: errorCliente } = await admin
    .from('clientes')
    .insert({
      nombre_comercial: `Cliente E2E ${sufijo}`,
      razon_social: `Cliente de Prueba ${sufijo} SA de CV`,
      estado: 'activo',
    })
    .select('id')
    .single();
  if (errorCliente || !cliente) {
    throw new Error(`No se pudo crear el cliente E2E: ${errorCliente?.message ?? 'sin cliente'}`);
  }

  const { data: materialLegacy, error: errorMaterial } = await admin
    .from('materiales')
    .insert({
      codigo: `E2E-${sufijo}`,
      nombre: `Material E2E ${sufijo}`,
      categoria: 'materia_prima',
      unidad_compra: 'pieza',
      unidad_control: 'pieza',
      factor_conversion: 1,
      costo_unitario_compra: 50,
      costo_unitario_control: 50,
      stock_actual_control: 20,
      stock_minimo_control: 0,
      stock_reservado_control: 0,
    })
    .select('id')
    .single();
  if (errorMaterial || !materialLegacy) {
    throw new Error(`No se pudo crear el material E2E: ${errorMaterial?.message ?? 'sin material'}`);
  }

  const { data: material, error: errorCatalogo } = await admin
    .from('catalogo_materiales')
    .insert({
      codigo: `E2EC_${sufijo.toUpperCase()}`,
      nombre: `Material canónico E2E ${sufijo}`,
      unidad_base: 'pieza',
      material_legacy_id: materialLegacy.id,
    })
    .select('id, actualizado_en')
    .single();
  if (errorCatalogo || !material) {
    throw new Error(`No se creó el material canónico E2E: ${errorCatalogo?.message ?? 'sin material'}`);
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
  if (errorCosto) throw new Error(`No se confirmó el costo E2E: ${errorCosto.message}`);

  return {
    admin,
    correoAdministrador,
    contrasenaAdministrador,
    pinOperador,
    administradorId,
    operadorId,
    clienteId: cliente.id,
    materialLegacyId: materialLegacy.id,
    materialId: material.id,
    ordenId: null,
    partidaId: null,
    consumoId: null,
  };
}

async function limpiarContexto(contexto: ContextoE2E): Promise<void> {
  const recursos = [contexto.ordenId, contexto.partidaId, contexto.consumoId].filter(
    (valor): valor is string => valor !== null,
  );

  if (contexto.partidaId) {
    await contexto.admin
      .from('registros_avance_partida')
      .delete()
      .eq('partida_id', contexto.partidaId);
    await contexto.admin
      .from('registros_consumo_material')
      .delete()
      .eq('partida_id', contexto.partidaId);
    await contexto.admin
      .from('registros_tiempo_operador')
      .delete()
      .eq('partida_id', contexto.partidaId);
  }
  if (contexto.ordenId) {
    await contexto.admin.from('movimientos_inventario').delete().eq('orden_id', contexto.ordenId);
    await contexto.admin.from('ordenes_produccion').delete().eq('id', contexto.ordenId);
  }
  await contexto.admin.from('catalogo_materiales').update({ activo: false }).eq('id', contexto.materialId);
  await contexto.admin.from('clientes').delete().eq('id', contexto.clienteId);
  if (recursos.length > 0) {
    await contexto.admin.from('logs').delete().in('recurso_id', recursos);
  }
  await contexto.admin
    .from('logs')
    .delete()
    .in('usuario_id', [contexto.administradorId, contexto.operadorId]);
  await contexto.admin.from('usuarios').update({ activo: false }).eq('id', contexto.administradorId);
  await contexto.admin.from('usuarios').delete().eq('id', contexto.operadorId);
  await contexto.admin.auth.admin.deleteUser(contexto.operadorId);
}

test.describe.serial('flujo completo de órdenes de producción', () => {
  const pruebasRemotasHabilitadas = process.env.E2E_HABILITAR_PRUEBAS_REMOTAS === 'si';
  test.skip(
    !pruebasRemotasHabilitadas,
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si para no crear datos en Supabase remoto.',
  );

  let contexto: ContextoE2E;

  test.beforeAll(async () => {
    contexto = await prepararContexto();
  });

  test.afterAll(async () => {
    await limpiarContexto(contexto);
  });

  test('crea, reserva e inicia una OP y registra consumo desde el panel del operador', async ({ page }) => {
    await page.goto('/iniciar-sesion');
    await expect(page.getByTestId('formulario-iniciar-sesion')).toHaveAttribute(
      'data-hidratado',
      'true',
    );
    await page.getByLabel('Correo electrónico').fill(contexto.correoAdministrador);
    await page.getByRole('textbox', { name: 'Contraseña' }).fill(contexto.contrasenaAdministrador);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/tablero');

    // El alta directa salió de la UI (la orden comercial nace de la propuesta
    // aceptada); esta prueba crea la OP por la RPC de servicio como los demás
    // specs de órdenes.
    const { data: ordenesCreadas, error: errorCrearOrden } = await contexto.admin.rpc('crear_orden_manual', {
      p_cliente_id: contexto.clienteId,
      p_fecha_compromiso: '2099-12-31T18:00:00.000Z',
      p_prioridad: 'normal',
      p_partidas: [{
        codigo_pieza: 'PIEZA-E2E',
        cantidad_solicitada: 5,
        unidad_medida: 'pza',
        material_id: contexto.materialLegacyId,
        tiempo_estimado_minutos: 0,
      }],
    });
    expect(errorCrearOrden).toBeNull();
    const folio = ordenesCreadas![0].folio;
    contexto.ordenId = ordenesCreadas![0].id;
    expect(folio).toMatch(/^OP-\d{6}$/);

    const { data: partidaAsignada, error: errorAsignacion } = await contexto.admin
      .from('partidas_orden_produccion')
      .select('id')
      .eq('orden_id', contexto.ordenId!)
      .single();
    expect(errorAsignacion).toBeNull();
    expect(partidaAsignada).not.toBeNull();
    contexto.partidaId = partidaAsignada!.id;

    const { error: errorSinAsignacion } = await contexto.admin.rpc('registrar_tiempo_operador_op', {
      p_partida_id: contexto.partidaId,
      p_operador_id: contexto.operadorId,
      p_accion: 'inicio',
    });
    expect(errorSinAsignacion?.message).toContain('operador_no_asignado_partida');

    const { error: errorOperadorAsignado } = await contexto.admin
      .from('partidas_orden_produccion')
      .update({ operador_asignado_id: contexto.operadorId })
      .eq('id', contexto.partidaId);
    expect(errorOperadorAsignado).toBeNull();

    await page.goto('/ordenes');
    const filaOrden = page.getByRole('row', { name: new RegExp(folio) });
    await expect(filaOrden).toBeVisible();
    const resumen = page.getByRole('region', { name: 'Resumen operativo de órdenes' });
    await expect(resumen.getByText('Órdenes no canceladas')).toBeVisible();
    await expect(resumen.getByText('TI creadas este mes')).toBeVisible();
    await page.getByText('Comparativa KPI de órdenes comerciales').click();
    const filaKpi = page.getByRole('table', { name: 'Horas, eficiencia, puntualidad, sesiones, pausas y venta por orden' })
      .getByRole('row', { name: new RegExp(folio) });
    await expect(filaKpi).toContainText('Sin tiempo real');
    await expect(filaKpi).toContainText('Sin entrega final');
    await expect(filaKpi).toContainText('Sin cuenta');
    for (const [formato, ancho, alto] of [
      ['escritorio', 1440, 900], ['tableta', 768, 1024], ['movil', 390, 844],
    ] as const) {
      await page.setViewportSize({ width: ancho, height: alto });
      for (const tema of ['claro', 'oscuro'] as const) {
        await page.locator('html').evaluate((nodo, oscuro) => nodo.classList.toggle('dark', oscuro), tema === 'oscuro');
        await page.screenshot({
          path: `.ai-shared/qa/cierre-auditoria-2026-09-22/a20-ordenes-${formato}-${tema}.png`,
          fullPage: true, animations: 'disabled',
        });
      }
    }
    await page.locator('html').evaluate((nodo) => nodo.classList.remove('dark'));
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByText('Comparativa KPI de órdenes comerciales').click();
    await expect(page.getByTestId('tabla-ordenes')).toHaveAttribute('data-hidratado', 'true');
    // SII-B5: el estado deriva del avance; la cola ya no ofrece Iniciar/Completar.
    await contexto.admin.from('ordenes_produccion').update({ estado: 'programada' }).eq('id', contexto.ordenId!);
    await page.reload();
    await expect(page.getByRole('row', { name: new RegExp(folio) })).toContainText('Planificada');
    await contexto.admin.from('ordenes_produccion').update({ estado: 'en_proceso' }).eq('id', contexto.ordenId!);
    await page.reload();
    await expect(page.getByRole('row', { name: new RegExp(folio) })).toContainText('En producción');

    await page.goto('/operador');
    await expect(page.getByTestId('teclado-pin')).toHaveAttribute('data-hidratado', 'true');
    for (const digito of contexto.pinOperador) {
      await page.getByRole('button', { name: digito, exact: true }).click();
    }
    await page.getByRole('button', { name: 'Confirmar PIN' }).click();
    await page.waitForURL('**/produccion-piso');
    const espacioOperador = page.getByTestId('espacio-operador');
    await expect(espacioOperador).toBeVisible();
    const tarjetaProceso = page.locator('[data-testid^="proceso-"]', { hasText: folio });
    await expect(tarjetaProceso).toHaveCount(1);
    await tarjetaProceso.getByRole('button', { name: 'Reclamar' }).click();
    await expect(page.getByTestId('aviso-espacio')).toContainText('Proceso reservado en tu jornada');

    await tarjetaProceso.getByRole('button', { name: 'Iniciar' }).click();
    const checklist = page.getByTestId('checklist-inicio');
    await expect(checklist).toBeVisible();
    for (const casilla of await checklist.getByRole('checkbox').all()) {
      await casilla.check();
    }
    await checklist.getByTestId('confirmar-checklist-inicio').click();
    await expect(page.getByTestId('aviso-espacio')).toContainText('Sesión iniciada');

    // El control de consumo no duplica la vista principal del piso: se abre
    // desde el detalle personal del proceso reservado e iniciado.
    await page.goto('/operador/mi-panel');
    await expect(page.getByRole('button', { name: 'Gestionar proceso' })).toBeEnabled();
    await page.getByRole('button', { name: 'Gestionar proceso' }).click();
    await expect(page.getByTestId('control-piso')).toHaveAttribute('data-hidratado', 'true');

    await page.getByTestId('material-consumo').selectOption(contexto.materialId);
    await page.getByTestId('cantidad-consumo').fill('3');
    await page.getByTestId('registrar-consumo').click();
    await expect(page.getByRole('status')).toContainText('Consumo de material registrado');

    const { data: partida, error: errorPartida } = await contexto.admin
      .from('partidas_orden_produccion')
      .select('id, operador_asignado_id')
      .eq('orden_id', contexto.ordenId!)
      .single();
    expect(errorPartida).toBeNull();
    expect(partida).not.toBeNull();
    contexto.partidaId = partida!.id;
    expect(partida!.operador_asignado_id).toBe(contexto.operadorId);

    const { data: sesiones, error: errorSesiones } = await contexto.admin
      .from('sesiones_trabajo')
      .select('id, operador_id, estado_sesion')
      .eq('partida_id', contexto.partidaId)
      .eq('operador_id', contexto.operadorId);
    expect(errorSesiones).toBeNull();
    expect(sesiones).toContainEqual(expect.objectContaining({
      operador_id: contexto.operadorId,
      estado_sesion: 'activa',
    }));
    const sesionActiva = sesiones?.find((sesion) => sesion.estado_sesion === 'activa');
    expect(sesionActiva).toBeDefined();

    const { data: consumo, error: errorConsumo } = await contexto.admin
      .from('registros_consumo_material')
      .select('id, cantidad_usada, cantidad_scrap, catalogo_material_id, unidad_base, costo_unitario_origen, moneda_costo, tipo_cambio, origen')
      .eq('partida_id', contexto.partidaId)
      .single();
    expect(errorConsumo).toBeNull();
    expect(consumo).not.toBeNull();
    contexto.consumoId = consumo!.id;
    expect(Number(consumo!.cantidad_usada)).toBe(3);
    expect(Number(consumo!.cantidad_scrap)).toBe(0);
    expect(consumo).toMatchObject({
      catalogo_material_id: contexto.materialId,
      unidad_base: 'pieza',
      costo_unitario_origen: 50,
      moneda_costo: 'MXN',
      tipo_cambio: 1,
      origen: 'NUEVO',
    });

    const { data: material } = await contexto.admin
      .from('materiales')
      .select('stock_actual_control')
      .eq('id', contexto.materialLegacyId)
      .single();
    expect(Number(material?.stock_actual_control)).toBe(20);

    const { data: logs } = await contexto.admin
      .from('logs')
      .select('accion')
      .in('recurso_id', [
        contexto.ordenId!,
        contexto.partidaId,
        contexto.consumoId,
        sesionActiva!.id,
      ]);
    const acciones = new Set((logs ?? []).map((log) => log.accion));
    // La cola ya no expone el formulario operativo global: la reserva y el
    // arranque auditados se hacen desde el proceso, y el consumo desde su panel.
    const accionesEsperadas = [
      'registrar_consumo_material',
      'iniciar_proceso_reclamado',
    ];
    for (const accion of accionesEsperadas) {
      expect(acciones.has(accion)).toBe(true);
    }

    const { error: errorDesactivarOperador } = await contexto.admin
      .from('usuarios')
      .update({ activo: false })
      .eq('id', contexto.operadorId);
    expect(errorDesactivarOperador).toBeNull();

    const { error: errorConsumoOperadorInactivo } = await contexto.admin.rpc(
      'registrar_consumo_material_operador_op',
      {
        p_partida_id: contexto.partidaId,
        p_material_id: contexto.materialId,
        p_cantidad_usada: 1,
        p_cantidad_scrap: 0,
        p_operador_id: contexto.operadorId,
      },
    );
    expect(errorConsumoOperadorInactivo?.message).toContain('operador_no_activo');
  });
});
