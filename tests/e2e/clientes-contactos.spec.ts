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
  clienteId: string;
  razonSocial: string;
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
  const correo = `e2e-contactos-${sufijo}@orca.local`;
  const contrasena = `E2e!${randomUUID()}Cc9`;
  const { data: usuarioAuth, error: errorAuth } = await admin.auth.admin.createUser({
    email: correo,
    password: contrasena,
    email_confirm: true,
    user_metadata: { nombre_completo: `Administrador Contactos ${sufijo}` },
  });
  if (errorAuth || !usuarioAuth.user) throw new Error(`No se creó administrador E2E: ${errorAuth?.message ?? 'sin usuario'}`);
  const administradorId = usuarioAuth.user.id;
  const { error: errorPerfil } = await admin.from('usuarios').update({
    rol: 'admin', activo: true, nombre_completo: `Administrador Contactos ${sufijo}`,
  }).eq('id', administradorId);
  if (errorPerfil) throw new Error(`No se preparó perfil E2E: ${errorPerfil.message}`);

  const razonSocial = `Metales Contactos ${sufijo} SA de CV`;
  const { data: cliente, error: errorCliente } = await admin.from('clientes').insert({
    razon_social: razonSocial,
    nombre_comercial: `Metales ${sufijo}`,
    estado: 'activo',
    saldo_a_favor: 0,
  }).select('id').single();
  if (errorCliente || !cliente) throw new Error(`No se creó cliente E2E: ${errorCliente?.message ?? 'sin cliente'}`);

  return { admin, correo, contrasena, administradorId, clienteId: cliente.id, razonSocial };
}

async function limpiarContexto(contexto: ContextoE2E): Promise<void> {
  const { admin } = contexto;
  await admin.from('contactos_cliente').delete().eq('cliente_id', contexto.clienteId);
  await admin.from('clientes').delete().eq('id', contexto.clienteId);
  await admin.from('logs').delete().eq('usuario_id', contexto.administradorId);
  await admin.from('usuarios').delete().eq('id', contexto.administradorId);
  await admin.auth.admin.deleteUser(contexto.administradorId);
}

test.describe.serial('contactos adicionales del cliente (OBS-02)', () => {
  test.skip(
    process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si para crear datos temporales en Supabase remoto.',
  );

  let contexto: ContextoE2E | null = null;

  test.beforeAll(async () => { contexto = await prepararContexto(); });
  test.afterAll(async () => { if (contexto) await limpiarContexto(contexto); });

  test('agrega y quita un contacto adicional desde la ficha del cliente', async ({ page }) => {
    if (!contexto) throw new Error('No se preparó el contexto E2E');
    const datos = contexto;

    await page.goto('/iniciar-sesion');
    await page.getByLabel('Correo electrónico').fill(datos.correo);
    await page.getByRole('textbox', { name: 'Contraseña' }).fill(datos.contrasena);
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await page.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/tablero');

    await page.goto('/clientes');
    await page.getByRole('button', { name: datos.razonSocial }).click();
    const ficha = page.getByRole('dialog', { name: 'Ficha del cliente' });
    await expect(ficha).toBeVisible();
    await ficha.getByRole('button', { name: 'Contactos' }).click();

    const panel = ficha.getByTestId('panel-contactos');
    await expect(panel).toContainText('Sin contactos adicionales.');

    await panel.getByLabel('Nombre del contacto').fill('Laura Compras');
    await panel.getByLabel('Puesto o área').fill('Compras');
    await panel.getByLabel('Correo del contacto').fill('laura.compras@metales.mx');
    await panel.getByLabel('Teléfono del contacto').fill('555-0101');
    await panel.getByLabel('Contacto principal del cliente').check();
    await panel.getByRole('button', { name: 'Agregar contacto' }).click();
    await expect(panel.getByRole('status')).toContainText('Contacto agregado.');

    const lista = panel.getByTestId('lista-contactos');
    await expect(lista).toContainText('Laura Compras');
    await expect(lista).toContainText('Compras');
    await expect(lista).toContainText('Principal');

    const { data: contactos } = await datos.admin
      .from('contactos_cliente')
      .select('nombre, puesto, correo, es_principal, creado_por')
      .eq('cliente_id', datos.clienteId);
    expect(contactos).toHaveLength(1);
    expect(contactos?.[0]).toMatchObject({
      nombre: 'Laura Compras',
      puesto: 'Compras',
      correo: 'laura.compras@metales.mx',
      es_principal: true,
      creado_por: datos.administradorId,
    });

    await panel.getByRole('button', { name: 'Quitar contacto Laura Compras' }).click();
    await expect(panel.getByRole('status')).toContainText('Contacto eliminado.');
    await expect(panel).toContainText('Sin contactos adicionales.');
    const { count } = await datos.admin
      .from('contactos_cliente')
      .select('id', { count: 'exact', head: true })
      .eq('cliente_id', datos.clienteId);
    expect(count).toBe(0);
  });
});
