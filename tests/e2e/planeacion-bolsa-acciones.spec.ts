import { randomUUID } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

type Contexto = {
  admin: SupabaseClient<Database>;
  correo: string;
  contrasena: string;
  usuarioId: string;
  clienteId: string;
  recursos: string[];
  ordenes: string[];
};

function requerir(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta ${nombre} para las pruebas E2E.`);
  return valor;
}

function crearAdmin(): SupabaseClient<Database> {
  const url = requerir('NEXT_PUBLIC_SUPABASE_URL');
  if (!['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
    throw new Error('La E2E de Planeación exige loopback explícito.');
  }
  return createClient<Database>(url, requerir('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function fecha(dias: number): string {
  const instante = new Date();
  instante.setDate(instante.getDate() + dias);
  return instante.toISOString().slice(0, 10);
}

test.describe.serial('bolsa de planeación y acciones de tarjeta (PLA-05/PLA-06)', () => {
  test.skip(
    process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si para crear datos temporales en Supabase local.',
  );

  let contexto: Contexto;
  let partidaSugerida = '';
  let ordenAcciones = '';
  let ordenCompletada = '';

  test.beforeAll(async () => {
    const admin = crearAdmin();
    const sufijo = randomUUID().slice(0, 8);
    const correo = `e2e-pla5-${sufijo}@orca.local`;
    const contrasena = `E2e!${randomUUID()}Aa9`;
    const alta = await admin.auth.admin.createUser({
      email: correo, password: contrasena, email_confirm: true,
      user_metadata: { nombre_completo: `Admin planeación ${sufijo}` },
    });
    if (alta.error || !alta.data.user) throw new Error(alta.error?.message ?? 'Sin usuario');
    await admin.from('usuarios').update({ rol: 'admin', activo: true }).eq('id', alta.data.user.id);

    const { data: cliente } = await admin.from('clientes').insert({
      nombre_comercial: `PLA5 ${sufijo}`, razon_social: `PLA5 ${sufijo} SA`, estado: 'activo',
    }).select('id').single();
    const { data: recurso } = await admin.from('recursos_planeacion').insert({
      codigo: `PLA5-${sufijo.toUpperCase()}`, nombre: `Recurso PLA5 ${sufijo}`,
      area: 'taller', activo: true,
    }).select('id').single();
    await admin.from('capacidades_recurso_turno').insert({
      recurso_id: recurso!.id, turno: 'matutino', horas_capacidad: 8,
    });
    contexto = {
      admin, correo, contrasena, usuarioId: alta.data.user.id,
      clienteId: cliente!.id, recursos: [recurso!.id], ordenes: [],
    };

    async function crearOrden(
      estado: string,
      codigo: string,
      minutos: number,
      programacion?: { fecha: string; estado: string },
    ) {
      const { data: folio } = await admin.rpc('generar_folio_orden', { p_prefijo: 'OP' });
      const { data: orden } = await admin.from('ordenes_produccion').insert({
        folio: folio!, cliente_id: cliente!.id, estado,
        fecha_compromiso: '2099-12-31T18:00:00.000Z',
      }).select('id').single();
      contexto.ordenes.push(orden!.id);
      const { data: partida } = await admin.from('partidas_orden_produccion').insert({
        orden_id: orden!.id, codigo_pieza: codigo, cantidad_solicitada: 1,
        unidad_medida: 'pza', tiempo_estimado_minutos: minutos,
      }).select('id').single();
      if (programacion) {
        await admin.from('programacion_areas').insert({
          orden_id: orden!.id, partida_id: partida!.id, recurso_id: recurso!.id,
          secuencia: 1, estado_planeacion: programacion.estado,
          fecha_programada: programacion.fecha, turno: 'matutino', horas_estimadas: 1,
        });
      }
      return { ordenId: orden!.id, partidaId: partida!.id };
    }

    partidaSugerida = (await crearOrden('programada', 'PLA5-SUG', 60)).partidaId;
    await crearOrden('programada', 'PLA5-BIG', 600);
    await crearOrden('pausada', 'PLA5-PAUSA', 60);
    await crearOrden('en_proceso', 'PLA5-HOY', 30, {
      fecha: fecha(1), estado: 'programada',
    });
    const acciones = await crearOrden('programada', 'PLA5-ACC', 30, {
      fecha: fecha(0), estado: 'programada',
    });
    ordenAcciones = acciones.ordenId;
    const completada = await crearOrden('completada', 'PLA5-FIN', 30, {
      fecha: fecha(0), estado: 'completada',
    });
    ordenCompletada = completada.ordenId;
    await admin.from('cuentas_por_cobrar').insert({
      orden_id: ordenCompletada, cliente_id: cliente!.id, monto_total: 100,
      saldo_pendiente: 100, moneda: 'MXN', tipo_cambio_origen: 1, estado: 'pendiente',
    });
  });

  test.afterAll(async () => {
    const { admin } = contexto;
    for (const ordenId of contexto.ordenes) {
      const { data: partidas } = await admin.from('partidas_orden_produccion')
        .select('id').eq('orden_id', ordenId);
      const ids = (partidas ?? []).map((fila) => fila.id);
      if (ids.length > 0) {
        await admin.from('registros_avance_partida').delete().in('partida_id', ids);
      }
      await admin.from('sesiones_trabajo').delete().eq('orden_id', ordenId);
      await admin.from('programacion_areas').delete().eq('orden_id', ordenId);
      await admin.from('cuentas_por_cobrar').delete().eq('orden_id', ordenId);
      await admin.from('partidas_orden_produccion').delete().eq('orden_id', ordenId);
      await admin.from('ordenes_produccion').delete().eq('id', ordenId);
    }
    await admin.from('capacidades_recurso_turno').delete().in('recurso_id', contexto.recursos);
    await admin.from('recursos_planeacion').delete().in('id', contexto.recursos);
    await admin.from('clientes').delete().eq('id', contexto.clienteId);
    await admin.from('logs').delete().eq('usuario_id', contexto.usuarioId);
    await admin.from('usuarios').delete().eq('id', contexto.usuarioId);
    await admin.auth.admin.deleteUser(contexto.usuarioId);
  });

  test('E2E-22: bolsa, asignación por hueco y acciones por estado de la tarjeta', async ({ page }) => {
    const { admin } = contexto;
    await page.goto('/iniciar-sesion');
    await page.getByLabel('Correo electrónico').fill(contexto.correo);
    await page.getByRole('textbox', { name: 'Contraseña' }).fill(contexto.contrasena);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/tablero');
    await page.goto('/planeacion');

    const bolsa = page.getByTestId('bolsa-planeacion');
    await expect(bolsa).toBeVisible();
    await expect(page.getByTestId('bolsa-pausadas')).toContainText('PLA5-PAUSA');
    await expect(page.getByTestId('bolsa-hoy')).toContainText('PLA5-HOY');
    await expect(page.getByTestId('bolsa-sugerencias')).toContainText('PLA5-SUG');
    await expect(page.getByTestId('bolsa-sugerencias')).not.toContainText('PLA5-BIG');

    await page.getByTestId(`asignar-sugerencia-${partidaSugerida}`).click();
    await expect(page.getByTestId('bolsa-planeacion').getByRole('status')).toContainText('programada el');
    await expect.poll(async () => {
      const { data } = await admin.from('programacion_areas')
        .select('id, estado_planeacion').eq('partida_id', partidaSugerida);
      return data?.length ?? 0;
    }).toBe(1);
    const { data: asignada } = await admin.from('programacion_areas')
      .select('estado_planeacion').eq('partida_id', partidaSugerida).single();
    expect(asignada?.estado_planeacion).toBe('programada');

    // Acciones de la tarjeta en el día de hoy.
    await page.getByTestId('vista-planeacion-dia').click();
    await page.getByRole('button', { name: 'Hoy' }).click();
    const acciones = page.getByTestId(`acciones-tarjeta-${ordenAcciones}`);
    await expect(acciones).toBeVisible();
    await page.getByTestId(`accion-iniciar-${ordenAcciones}`).click();
    await expect.poll(async () => (
      await admin.from('ordenes_produccion').select('estado').eq('id', ordenAcciones).single()
    ).data?.estado).toBe('en_proceso');
    await expect(page.getByTestId(`accion-pausar-${ordenAcciones}`)).toBeVisible();
    await page.getByTestId(`accion-pausar-${ordenAcciones}`).click();
    await expect.poll(async () => (
      await admin.from('ordenes_produccion').select('estado').eq('id', ordenAcciones).single()
    ).data?.estado).toBe('pausada');
    await expect(page.getByTestId(`accion-reanudar-${ordenAcciones}`)).toBeVisible();
    await page.getByTestId(`accion-reanudar-${ordenAcciones}`).click();
    await expect.poll(async () => (
      await admin.from('ordenes_produccion').select('estado').eq('id', ordenAcciones).single()
    ).data?.estado).toBe('en_proceso');
    await expect(page.getByTestId(`accion-sesion-${ordenAcciones}`)).toBeVisible();
    await expect(page.getByTestId(`accion-entregar-${ordenAcciones}`)).toBeVisible();
    await expect(page.getByTestId(`accion-bandeja-${ordenAcciones}`)).toBeVisible();

    // Reactivar solo aparece en admin y devuelve una Lista a operación.
    await expect(page.getByTestId(`accion-reactivar-${ordenCompletada}`)).toBeVisible();
    await page.getByTestId(`accion-reactivar-${ordenCompletada}`).click();
    await page.getByTestId('confirmar-reactivar-orden').click();
    await expect(page.getByRole('dialog').getByRole('status')).toContainText('reactivada');
    await page.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).first().click();
    await expect.poll(async () => (
      await admin.from('ordenes_produccion').select('estado').eq('id', ordenCompletada).single()
    ).data?.estado).toBe('en_proceso');

    // Bandeja navega al detalle de la orden y Producción respeta ?ordenId.
    await page.getByTestId(`accion-bandeja-${ordenAcciones}`).click();
    await page.waitForURL((url) => url.pathname === '/ordenes');
    expect(page.url()).toContain(`ordenId=${ordenAcciones}`);
  });
});
