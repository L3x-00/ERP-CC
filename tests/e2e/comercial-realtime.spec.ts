import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import type { Database } from '@/compartido/tipos/supabase';

// Nunca lee .env.local: las credenciales se reciben del stack de pruebas.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
if (url && !['127.0.0.1', 'localhost'].includes(new URL(url).hostname)) {
  throw new Error('E2E de sincronización comercial: solo se permite Supabase local');
}
test.skip(
  process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si' || !url,
  'Requiere el Supabase local explícito del entorno E2E.',
);

async function ingresar(pagina: Page, correo: string, contrasena: string) {
  await pagina.goto('/iniciar-sesion');
  await pagina.getByLabel('Correo electrónico').fill(correo);
  await pagina.getByRole('textbox', { name: 'Contraseña' }).fill(contrasena);
  await pagina.getByRole('button', { name: 'Iniciar sesión' }).click();
  await pagina.waitForURL((destino) => destino.pathname === '/dashboard' || destino.pathname === '/tablero');
}

test('dos identidades comparten cambios comerciales y recuperan eventos perdidos', async ({ browser }) => {
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) throw new Error('Falta el Supabase local de pruebas');
  const admin = createClient<Database>(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const marca = `A07-${randomUUID().slice(0, 8)}`;
  const identidades: { id: string; correo: string; contrasena: string }[] = [];
  const contextos: BrowserContext[] = [];
  let clienteId = '';
  let oportunidadId = '';
  let operadorId = '';

  try {
    for (let indice = 0; indice < 2; indice++) {
      const correo = `a07-${randomUUID()}@orca.local`;
      const contrasena = `A07!${randomUUID()}`;
      const creado = await admin.auth.admin.createUser({ email: correo, password: contrasena, email_confirm: true });
      if (creado.error || !creado.data.user) throw new Error(creado.error?.message ?? 'No se creó identidad');
      const id = creado.data.user.id;
      identidades.push({ id, correo, contrasena });
      const perfil = await admin.from('usuarios').update({ rol: 'admin', activo: true }).eq('id', id);
      if (perfil.error) throw perfil.error;
    }
    const [contextoA, contextoB] = await Promise.all([browser.newContext(), browser.newContext()]);
    contextos.push(contextoA, contextoB);
    const [a, b] = await Promise.all([contextoA.newPage(), contextoB.newPage()]);
    await Promise.all([
      ingresar(a, identidades[0].correo, identidades[0].contrasena),
      ingresar(b, identidades[1].correo, identidades[1].contrasena),
    ]);

    await Promise.all([a.goto('/clientes'), b.goto('/clientes')]);
    await expect(b.getByTestId('sincronizador-clientes')).toHaveAttribute('data-conectado', 'true');
    await b.getByRole('searchbox', { name: 'Buscar clientes' }).fill(marca);
    await expect(b.getByRole('row').filter({ hasText: marca })).toHaveCount(0);
    await a.getByRole('button', { name: 'Nuevo cliente', exact: true }).click();
    await a.getByLabel('Razón social', { exact: true }).fill(marca);
    await a.getByLabel('Nombre comercial', { exact: true }).fill(marca);
    await a.getByRole('button', { name: 'Crear cliente', exact: true }).click();
    await expect(a.getByRole('heading', { name: 'Nuevo cliente', exact: true })).toBeHidden();
    const cliente = await admin.from('clientes').select('id').eq('razon_social', marca).single();
    if (cliente.error || !cliente.data) throw new Error(cliente.error?.message ?? 'Cliente no persistido');
    clienteId = cliente.data.id;
    const filaCliente = b.getByRole('row').filter({ hasText: marca });
    await expect(filaCliente).toHaveCount(1, { timeout: 6_000 });

    const edicionCliente = await admin.from('clientes').update({ nombre_comercial: `${marca} EDITADO` }).eq('id', clienteId);
    if (edicionCliente.error) throw edicionCliente.error;
    await expect(filaCliente).toContainText('EDITADO', { timeout: 6_000 });

    await filaCliente.getByRole('button', { name: marca, exact: true }).click();
    const fichaB = b.getByRole('dialog', { name: 'Ficha del cliente' });
    await fichaB.getByRole('button', { name: 'Contactos' }).click();
    const panelB = fichaB.getByTestId('panel-contactos');
    await expect(panelB).toContainText('Sin contactos adicionales.');
    await a.getByRole('row').filter({ hasText: marca }).getByRole('button', { name: marca, exact: true }).click();
    const fichaA = a.getByRole('dialog', { name: 'Ficha del cliente' });
    await fichaA.getByRole('button', { name: 'Contactos' }).click();
    const panelA = fichaA.getByTestId('panel-contactos');
    const nombreContacto = `Contacto ${marca}`;
    await panelA.getByLabel('Nombre del contacto').fill(nombreContacto);
    await panelA.getByRole('button', { name: 'Agregar contacto' }).click();
    await expect(panelA.getByRole('status')).toContainText('Contacto agregado.');
    await expect(panelB.getByTestId('lista-contactos')).toContainText(nombreContacto, { timeout: 6_000 });
    await panelA.getByRole('button', { name: `Quitar contacto ${nombreContacto}` }).click();
    await expect(panelA).toContainText('Sin contactos adicionales.');
    await expect(panelB).toContainText('Sin contactos adicionales.', { timeout: 6_000 });

    const bajaCliente = await admin.from('clientes').delete().eq('id', clienteId);
    if (bajaCliente.error) throw bajaCliente.error;
    clienteId = '';
    await expect(filaCliente).toHaveCount(0, { timeout: 6_000 });

    await Promise.all([a.goto('/pipeline'), b.goto('/pipeline')]);
    await expect(b.getByTestId('sincronizador-pipeline')).toHaveAttribute('data-conectado', 'true');
    await expect(b.getByRole('status', { name: 'Cargando oportunidades' })).toBeHidden({ timeout: 30_000 });
    const dashboardB = await contextoB.newPage();
    await dashboardB.goto('/dashboard');
    await expect(dashboardB.getByTestId('sincronizador-dashboard')).toHaveAttribute('data-conectado', 'true');
    const embudo = dashboardB.locator('section').filter({
      has: dashboardB.getByRole('heading', { name: 'Pipeline del equipo' }),
    });
    const contadorProspectos = embudo.locator('li').filter({ hasText: 'Prospecto' }).locator('span').last();
    const prospectosIniciales = Number(await contadorProspectos.textContent());
    expect(Number.isFinite(prospectosIniciales)).toBe(true);
    const tarjeta = b.locator('article').filter({ hasText: marca });
    await expect(tarjeta).toHaveCount(0);
    await a.getByRole('button', { name: 'Nueva oportunidad' }).click();
    await a.getByLabel('Nombre del contacto').fill('QA Realtime');
    await a.getByLabel('Empresa', { exact: true }).fill(marca);
    await a.getByRole('button', { name: 'Crear oportunidad', exact: true }).click();
    await expect(a.locator('article').filter({ hasText: marca })).toHaveCount(1);
    const oportunidad = await admin.from('pipeline').select('id').eq('empresa', marca).single();
    if (oportunidad.error || !oportunidad.data) throw new Error(oportunidad.error?.message ?? 'Oportunidad no persistida');
    oportunidadId = oportunidad.data.id;
    await expect(tarjeta).toHaveCount(1, { timeout: 6_000 });
    await expect(contadorProspectos).toHaveText(String(prospectosIniciales + 1), { timeout: 6_000 });

    // La identidad B pierde la conexión mientras A cambia el dato persistido.
    await contextoB.setOffline(true);
    const cambio = await admin.from('pipeline').update({ empresa: `${marca} RECONEXION` }).eq('id', oportunidadId);
    if (cambio.error) throw cambio.error;
    await contextoB.setOffline(false);
    await expect(tarjeta).toContainText('RECONEXION', { timeout: 10_000 });

    const bajaOportunidad = await admin.from('pipeline').delete().eq('id', oportunidadId);
    if (bajaOportunidad.error) throw bajaOportunidad.error;
    oportunidadId = '';
    await expect(tarjeta).toHaveCount(0, { timeout: 6_000 });
    await expect(contadorProspectos).toHaveText(String(prospectosIniciales), { timeout: 6_000 });

    // A08: una edición de áreas de operador en A se refleja en Configuración B.
    const operador = await admin.auth.admin.createUser({
      email: `a08-${randomUUID()}@orca.local`,
      password: `A08!${randomUUID()}`,
      email_confirm: true,
      user_metadata: { nombre_completo: `Operador ${marca}` },
    });
    if (operador.error || !operador.data.user) throw new Error(operador.error?.message ?? 'Sin operador');
    operadorId = operador.data.user.id;
    const perfilOperador = await admin.from('usuarios').update({
      rol: 'operador', activo: true, nombre_completo: `Operador ${marca}`,
    }).eq('id', operadorId);
    if (perfilOperador.error) throw perfilOperador.error;
    await Promise.all([a.goto('/configuracion'), b.goto('/configuracion')]);
    await Promise.all([
      a.getByRole('tab', { name: 'Áreas de trabajo' }).click(),
      b.getByRole('tab', { name: 'Áreas de trabajo' }).click(),
    ]);
    await expect(b.getByTestId('sincronizador-configuracion')).toHaveAttribute('data-conectado', 'true');
    const areaA = a.getByTestId(`areas-operador-check-${operadorId}-ACABADOS`);
    const areaB = b.getByTestId(`areas-operador-check-${operadorId}-ACABADOS`);
    await expect(areaB).not.toBeChecked();
    await areaA.check();
    await a.getByTestId(`guardar-areas-operador-${operadorId}`).click();
    await expect(a.getByTestId('configuracion-confirmacion')).toContainText('guardadas');
    await expect(areaB).toBeChecked({ timeout: 6_000 });
    await areaA.uncheck();
    await a.getByTestId(`guardar-areas-operador-${operadorId}`).click();
    await expect(a.getByTestId('configuracion-confirmacion')).toContainText('guardadas');
    await expect(areaB).not.toBeChecked({ timeout: 6_000 });
  } finally {
    for (const contexto of contextos) await contexto.close();
    if (operadorId) {
      await admin.from('operadores_areas').delete().eq('operador_id', operadorId);
      await admin.from('logs').delete().eq('usuario_id', operadorId);
      await admin.from('usuarios').delete().eq('id', operadorId);
      await admin.auth.admin.deleteUser(operadorId);
    }
    await admin.from('pipeline').delete().like('empresa', `${marca}%`);
    await admin.from('clientes').delete().eq('razon_social', marca);
    for (const identidad of identidades) {
      await admin.from('logs').delete().eq('usuario_id', identidad.id);
      await admin.from('usuarios').delete().eq('id', identidad.id);
      await admin.auth.admin.deleteUser(identidad.id);
    }
  }
});
