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
  const pinOperador = '4826';
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

  const { data: material, error: errorMaterial } = await admin
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
  if (errorMaterial || !material) {
    throw new Error(`No se pudo crear el material E2E: ${errorMaterial?.message ?? 'sin material'}`);
  }

  return {
    admin,
    correoAdministrador,
    contrasenaAdministrador,
    pinOperador,
    administradorId,
    operadorId,
    clienteId: cliente.id,
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
  await contexto.admin.from('materiales').delete().eq('id', contexto.materialId);
  await contexto.admin.from('clientes').delete().eq('id', contexto.clienteId);
  if (recursos.length > 0) {
    await contexto.admin.from('logs').delete().in('recurso_id', recursos);
  }
  await contexto.admin
    .from('logs')
    .delete()
    .in('usuario_id', [contexto.administradorId, contexto.operadorId]);
  await contexto.admin.from('usuarios').delete().in('id', [contexto.administradorId, contexto.operadorId]);
  await contexto.admin.auth.admin.deleteUser(contexto.administradorId);
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

  test('crea, inicia y opera una OP con tiempo, avance, consumo y auditoría', async ({ page }) => {
    await page.goto('/iniciar-sesion');
    await expect(page.getByTestId('formulario-iniciar-sesion')).toHaveAttribute(
      'data-hidratado',
      'true',
    );
    await page.getByLabel('Correo electrónico').fill(contexto.correoAdministrador);
    await page.getByLabel('Contraseña').fill(contexto.contrasenaAdministrador);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL('**/tablero');

    await page.goto('/ordenes');
    await expect(page.getByTestId('crear-orden')).toHaveAttribute('data-hidratado', 'true');
    await page.getByLabel('Cliente').selectOption(contexto.clienteId);
    await page.getByLabel('Fecha compromiso').fill('2099-12-31');
    await page.getByLabel('Código de pieza').fill('PIEZA-E2E');
    await page.getByLabel('Cantidad').fill('5');
    await page.getByLabel('Material (opcional)').selectOption(contexto.materialId);
    await page.getByTestId('enviar-orden').click();

    await expect
      .poll(async () => {
        const { data } = await contexto.admin
          .from('ordenes_produccion')
          .select('id, folio')
          .eq('cliente_id', contexto.clienteId)
          .maybeSingle();
        if (data) contexto.ordenId = data.id;
        return data?.folio ?? null;
      })
      .toMatch(/^OP-\d{6}$/);

    const { data: orden, error: errorOrden } = await contexto.admin
      .from('ordenes_produccion')
      .select('id, folio')
      .eq('id', contexto.ordenId!)
      .single();
    expect(errorOrden).toBeNull();
    expect(orden).not.toBeNull();
    const folio = orden!.folio;

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

    const filaOrden = page.getByRole('row', { name: new RegExp(folio) });
    await expect(filaOrden).toBeVisible();
    await expect(page.getByTestId('tabla-ordenes')).toHaveAttribute('data-hidratado', 'true');
    await filaOrden.getByTestId('cambiar-estado-programada').click();
    await expect(filaOrden.getByText('Programada')).toBeVisible();
    await filaOrden.getByTestId('cambiar-estado-en_proceso').click();
    await expect(filaOrden.getByText('En proceso')).toBeVisible();

    await page.goto('/operador');
    await expect(page.getByTestId('teclado-pin')).toHaveAttribute('data-hidratado', 'true');
    for (const digito of contexto.pinOperador) {
      await page.getByRole('button', { name: digito, exact: true }).click();
    }
    const respuestaSincronizacion = page.waitForResponse(
      (respuesta) =>
        respuesta.url().includes('/api/produccion-piso/sincronizacion')
        && respuesta.status() === 200,
    );
    await page.getByRole('button', { name: 'Confirmar PIN' }).click();
    await page.waitForURL('**/produccion-piso');
    await expect(page.getByTestId('control-piso')).toHaveAttribute('data-hidratado', 'true');
    await respuestaSincronizacion;

    await page.getByTestId('selector-orden-piso').selectOption(contexto.ordenId!);
    await page.getByTestId('iniciar-tiempo').click();
    await expect(page.getByRole('status')).toContainText('Tiempo de inicio registrado');

    await page.getByTestId('cantidad-producida').fill('2');
    await page.getByTestId('cantidad-scrap-fabricacion').fill('1');
    await page.getByTestId('registrar-avance').click();
    await expect(page.getByRole('status')).toContainText('Avance de partida registrado');

    await page.getByTestId('material-consumo').selectOption(contexto.materialId);
    await page.getByTestId('cantidad-consumo').fill('3');
    await page.getByTestId('registrar-consumo').click();
    await expect(page.getByRole('status')).toContainText('Consumo de material registrado');

    const { data: partida, error: errorPartida } = await contexto.admin
      .from('partidas_orden_produccion')
      .select('id, cantidad_producida, cantidad_scrap, operador_asignado_id')
      .eq('orden_id', contexto.ordenId!)
      .single();
    expect(errorPartida).toBeNull();
    expect(partida).not.toBeNull();
    contexto.partidaId = partida!.id;
    expect(Number(partida!.cantidad_producida)).toBe(2);
    expect(Number(partida!.cantidad_scrap)).toBe(1);
    expect(partida!.operador_asignado_id).toBe(contexto.operadorId);

    const { data: avances, error: errorAvances } = await contexto.admin
      .from('registros_avance_partida')
      .select('cantidad_producida, cantidad_scrap, operador_id')
      .eq('partida_id', contexto.partidaId);
    expect(errorAvances).toBeNull();
    expect(avances).toContainEqual({
      cantidad_producida: 2,
      cantidad_scrap: 1,
      operador_id: contexto.operadorId,
    });

    const { data: consumo, error: errorConsumo } = await contexto.admin
      .from('registros_consumo_material')
      .select('id, cantidad_usada, cantidad_scrap')
      .eq('partida_id', contexto.partidaId)
      .single();
    expect(errorConsumo).toBeNull();
    expect(consumo).not.toBeNull();
    contexto.consumoId = consumo!.id;
    expect(Number(consumo!.cantidad_usada)).toBe(3);
    expect(Number(consumo!.cantidad_scrap)).toBe(0);

    const { data: tiempo } = await contexto.admin
      .from('registros_tiempo_operador')
      .select('id, accion')
      .eq('partida_id', contexto.partidaId);
    expect(tiempo?.some((registro) => registro.accion === 'inicio')).toBe(true);
    const registroInicio = tiempo?.find((registro) => registro.accion === 'inicio');
    expect(registroInicio).toBeDefined();

    const { data: material } = await contexto.admin
      .from('materiales')
      .select('stock_actual_control')
      .eq('id', contexto.materialId)
      .single();
    expect(Number(material?.stock_actual_control)).toBe(17);

    const { data: logs } = await contexto.admin
      .from('logs')
      .select('accion')
      .eq('modulo', 'ordenes')
      .in('recurso_id', [
        contexto.ordenId!,
        contexto.partidaId,
        contexto.consumoId,
        registroInicio!.id,
      ]);
    const acciones = new Set((logs ?? []).map((log) => log.accion));
    const accionesEsperadas = [
      'crear_orden_manual',
      'cambiar_estado_orden',
      'registrar_tiempo_operador',
      'registrar_avance_partida',
      'registrar_consumo_material',
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
