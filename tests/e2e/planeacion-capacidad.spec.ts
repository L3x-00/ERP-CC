import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { expect, test } from '@playwright/test';
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
