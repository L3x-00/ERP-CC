import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
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

function requerirVariable(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) throw new Error(`Falta la variable ${nombre} para E2E.`);
  return valor;
}

type ContextoE2E = {
  admin: SupabaseClient<Database>;
  correo: string;
  contrasena: string;
  administradorId: string;
  sufijo: string;
  razonSocial: string;
  nombreComercial: string;
  correoCliente: string;
};

async function prepararContexto(): Promise<ContextoE2E> {
  const admin = createClient<Database>(
    requerirVariable('NEXT_PUBLIC_SUPABASE_URL'),
    requerirVariable('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const sufijo = randomUUID().slice(0, 8);
  const correo = `e2e-ficha-${sufijo}@orca.local`;
  const contrasena = `E2e!${randomUUID()}Ff9`;
  const { data: usuarioAuth, error: errorAuth } = await admin.auth.admin.createUser({
    email: correo,
    password: contrasena,
    email_confirm: true,
    user_metadata: { nombre_completo: `Administrador Ficha ${sufijo}` },
  });
  if (errorAuth || !usuarioAuth.user) {
    throw new Error(`No se creó administrador E2E: ${errorAuth?.message ?? 'sin usuario'}`);
  }
  const administradorId = usuarioAuth.user.id;
  const { error: errorPerfil } = await admin
    .from('usuarios')
    .update({ rol: 'admin', activo: true, nombre_completo: `Administrador Ficha ${sufijo}` })
    .eq('id', administradorId);
  if (errorPerfil) throw new Error(`No se preparó perfil E2E: ${errorPerfil.message}`);

  return {
    admin,
    correo,
    contrasena,
    administradorId,
    sufijo,
    razonSocial: `Metales Ficha ${sufijo} SA de CV`,
    nombreComercial: `Metales Ficha ${sufijo}`,
    correoCliente: `contacto-${sufijo}@metalesficha.mx`,
  };
}

async function limpiarContexto(contexto: ContextoE2E): Promise<void> {
  const { admin } = contexto;
  const { data: clientes } = await admin
    .from('clientes')
    .select('id')
    .ilike('razon_social', `%${contexto.sufijo}%`);
  for (const cliente of clientes ?? []) {
    await admin.from('archivos').delete().eq('entidad', 'cliente').eq('entidad_id', cliente.id);
    await admin.from('contactos_cliente').delete().eq('cliente_id', cliente.id);
    await admin.from('clientes').delete().eq('id', cliente.id);
  }
  await admin.from('logs').delete().eq('usuario_id', contexto.administradorId);
  await admin.from('usuarios').delete().eq('id', contexto.administradorId);
  await admin.auth.admin.deleteUser(contexto.administradorId);
}

async function iniciarSesion(pagina: Page, contexto: ContextoE2E): Promise<void> {
  await pagina.goto('/iniciar-sesion');
  await pagina.getByLabel('Correo electrónico').fill(contexto.correo);
  await pagina.getByRole('textbox', { name: 'Contraseña' }).fill(contexto.contrasena);
  await pagina.getByRole('button', { name: 'Iniciar sesión' }).click();
  await pagina.waitForURL((url) => url.pathname === '/dashboard' || url.pathname === '/tablero');
}

/** Capturas de evidencia 1440/768 × claro/oscuro (SII-B2). */
async function capturar(pagina: Page, nombre: string): Promise<void> {
  if (process.env.E2E_CAPTURAR_VISUAL !== 'si') return;
  const directorio = `.ai-shared/qa/sii-b2/visual`;
  mkdirSync(directorio, { recursive: true });
  for (const [vista, ancho, alto] of [
    ['1440', 1440, 900],
    ['768', 768, 1024],
  ] as const) {
    await pagina.setViewportSize({ width: ancho, height: alto });
    for (const tema of ['claro', 'oscuro'] as const) {
      await pagina
        .locator('html')
        .evaluate(
          (elemento, oscuro) => elemento.classList.toggle('dark', oscuro),
          tema === 'oscuro',
        );
      await pagina.screenshot({
        path: `${directorio}/${nombre}-${vista}-${tema}.png`,
        fullPage: true,
        animations: 'disabled',
      });
    }
  }
  await pagina.setViewportSize({ width: 1440, height: 900 });
  await pagina.locator('html').evaluate((elemento) => elemento.classList.remove('dark'));
}

test.describe.serial('ficha de cliente B2: alta atómica, comercial y estado', () => {
  test.skip(
    process.env.E2E_HABILITAR_PRUEBAS_REMOTAS !== 'si',
    'Requiere E2E_HABILITAR_PRUEBAS_REMOTAS=si para crear datos temporales en un Supabase de pruebas.',
  );

  let contexto: ContextoE2E | null = null;

  test.beforeAll(async () => {
    contexto = await prepararContexto();
  });
  test.afterAll(async () => {
    if (contexto) await limpiarContexto(contexto);
  });

  test('alta atómica, folio, comercial, estado y principal único', async ({ page }) => {
    if (!contexto) throw new Error('No se preparó el contexto E2E');
    const datos = contexto;
    await iniciarSesion(page, datos);

    // --- Alta atómica desde la UI: cliente + contacto principal ---------------
    await page.goto('/clientes');
    await page.getByRole('button', { name: 'Nuevo cliente' }).click();
    await page.getByLabel('Razón social').fill(datos.razonSocial);
    await page.getByLabel('Nombre comercial').fill(datos.nombreComercial);
    await page.getByLabel('Correo (opcional)').fill(datos.correoCliente);
    await page.getByRole('button', { name: 'Contacto principal' }).click();
    await page.getByLabel('Nombre del contacto').fill('Ana Compras');
    await page.getByLabel('Puesto o área (opcional)').fill('Compras');
    await page.getByLabel('Correo del contacto (opcional)').fill(`ana-${datos.sufijo}@metalesficha.mx`);
    await page.getByRole('button', { name: 'Crear cliente' }).click();

    // La lista paginada puede contener datos de otras corridas: acota por búsqueda.
    await page.getByRole('searchbox', { name: 'Buscar clientes' }).fill(datos.razonSocial);
    const fila = page.getByRole('row', { name: new RegExp(datos.razonSocial) });
    await expect(fila).toBeVisible();

    const { data: creado } = await datos.admin
      .from('clientes')
      .select('id, folio, moneda, credito_habilitado, dias_credito')
      .eq('razon_social', datos.razonSocial)
      .single();
    expect(creado?.id).toBeTruthy();
    expect(creado?.folio).toMatch(/^CLI-[0-9]{4,}$/);
    expect(creado?.moneda).toBe('MXN');
    expect(creado?.credito_habilitado).toBe(false);
    const clienteId = creado!.id;

    const { data: contactos } = await datos.admin
      .from('contactos_cliente')
      .select('nombre, es_principal, activo')
      .eq('cliente_id', clienteId);
    expect(contactos).toHaveLength(1);
    expect(contactos?.[0]).toMatchObject({
      nombre: 'Ana Compras',
      es_principal: true,
      activo: true,
    });

    // --- Ficha: folio visible y pestaña Comercial -----------------------------
    await page.getByRole('button', { name: datos.razonSocial }).click();
    const ficha = page.getByRole('dialog', { name: 'Ficha del cliente' });
    await expect(ficha).toBeVisible();
    await expect(ficha.getByTestId('folio-cliente')).toHaveText(creado!.folio ?? '');

    await ficha.getByRole('button', { name: 'Comercial' }).click();
    const panelComercial = ficha.getByTestId('panel-comercial');
    await expect(panelComercial).toBeVisible();
    await panelComercial.getByLabel('Moneda').selectOption('USD');
    await panelComercial.getByLabel('Habilitar crédito').check();
    await panelComercial.getByLabel('Días de crédito').fill('30');
    await panelComercial.getByLabel('Límite de crédito').fill('50000');
    await panelComercial.getByRole('button', { name: 'Guardar comercial' }).click();
    await expect(panelComercial.getByRole('status')).toContainText(
      'Condiciones comerciales actualizadas.',
    );

    await expect
      .poll(async () => {
        const { data } = await datos.admin
          .from('clientes')
          .select('moneda, credito_habilitado, dias_credito, limite_credito, condiciones_pago')
          .eq('id', clienteId)
          .single();
        return data;
      })
      .toMatchObject({
        moneda: 'USD',
        credito_habilitado: true,
        dias_credito: 30,
        condiciones_pago: '30_dias',
      });

    await capturar(page, 'ficha-comercial');

    // --- Estado por acción: inactivar con motivo y reactivar ------------------
    await ficha.getByRole('button', { name: 'Inactivar' }).click();
    await ficha.getByLabel('Motivo de la inactivación').fill('cliente sin compras en el año');
    await ficha.getByRole('button', { name: 'Confirmar inactivación' }).click();
    await expect
      .poll(async () => {
        const { data } = await datos.admin
          .from('clientes')
          .select('estado')
          .eq('id', clienteId)
          .single();
        return data?.estado;
      })
      .toBe('inactivo');
    await expect(ficha.getByRole('button', { name: 'Activar' })).toBeVisible();

    await ficha.getByRole('button', { name: 'Activar' }).click();
    await expect
      .poll(async () => {
        const { data } = await datos.admin
          .from('clientes')
          .select('estado')
          .eq('id', clienteId)
          .single();
        return data?.estado;
      })
      .toBe('activo');

    // --- Contacto principal único ---------------------------------------------
    await ficha.getByRole('button', { name: 'Contactos' }).click();
    const panelContactos = ficha.getByTestId('panel-contactos');
    await panelContactos.getByLabel('Nombre del contacto').fill('Beto Finanzas');
    await panelContactos.getByLabel('Puesto o área').fill('Finanzas');
    await panelContactos.getByLabel('Contacto principal del cliente').check();
    await panelContactos.getByRole('button', { name: 'Agregar contacto' }).click();
    await expect(panelContactos.getByRole('status')).toContainText('Contacto agregado.');

    await expect
      .poll(async () => {
        const { data } = await datos.admin
          .from('contactos_cliente')
          .select('nombre, es_principal, activo')
          .eq('cliente_id', clienteId)
          .eq('es_principal', true)
          .eq('activo', true);
        return data;
      })
      .toMatchObject([{ nombre: 'Beto Finanzas' }]);

    const { data: todos } = await datos.admin
      .from('contactos_cliente')
      .select('nombre, es_principal')
      .eq('cliente_id', clienteId)
      .order('creado_en');
    expect(todos).toHaveLength(2);
    expect(todos?.[0]).toMatchObject({ nombre: 'Ana Compras', es_principal: false });

    await capturar(page, 'ficha-contactos');

    // --- Lista con folio (captura) --------------------------------------------
    await page.goto('/clientes');
    await page.getByRole('searchbox', { name: 'Buscar clientes' }).fill(datos.razonSocial);
    await expect(page.getByRole('row', { name: new RegExp(creado!.folio ?? '') })).toBeVisible();
    await capturar(page, 'lista-clientes');
  });
});
