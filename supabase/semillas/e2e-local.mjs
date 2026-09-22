// Provisiona credenciales y fixture para los E2E que requieren variables
// explícitas (dashboard por rol, configuración, comentarios y OCR) contra el
// stack LOCAL de Supabase. No toca producción ni imprime secretos.
//
// Uso local:
//   node supabase/semillas/e2e-local.mjs [ruta-salida.json] [--exports]
//
// CI: con `--exports` imprime `CLAVE=valor` para anexar a $GITHUB_ENV.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

const URL_BASE = (
  process.env.SUPABASE_URL_LOCAL
  ?? process.env.NEXT_PUBLIC_SUPABASE_URL
  ?? 'http://127.0.0.1:54321'
).replace(/\/$/, '');
const SERVICE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY_LOCAL ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SERVICE_KEY) {
  throw new Error('Define SUPABASE_SERVICE_ROLE_KEY_LOCAL (o SUPABASE_SERVICE_ROLE_KEY) para provisionar');
}
const PASSWORD = 'E2e!Local2026';
const rutaSalida = process.argv[2] ?? 'e2e-local-fixture.json';
const imprimirExports = process.argv.includes('--exports');

async function peticion(ruta, metodo, cuerpo) {
  const respuesta = await fetch(`${URL_BASE}${ruta}`, {
    method: metodo,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await respuesta.text();
  let datos = null;
  try {
    datos = texto ? JSON.parse(texto) : null;
  } catch {
    datos = texto;
  }
  if (!respuesta.ok) {
    throw new Error(
      `${metodo} ${ruta} → ${respuesta.status}: ${typeof datos === 'string' ? datos : JSON.stringify(datos)}`,
    );
  }
  return datos;
}

async function crearUsuario(correo, nombre, rol) {
  const existentes = await peticion('/auth/v1/admin/users?page=1&per_page=100', 'GET');
  const yaExiste = (existentes?.users ?? []).find((usuario) => usuario.email === correo);
  let usuario = yaExiste;
  if (!usuario) {
    usuario = await peticion('/auth/v1/admin/users', 'POST', {
      email: correo,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { nombre_completo: nombre },
    });
  }
  await peticion(`/rest/v1/usuarios?id=eq.${usuario.id}`, 'PATCH', {
    rol,
    activo: true,
    nombre_completo: nombre,
  });
  return usuario;
}

/** Reutiliza el cliente de comentarios si una corrida anterior lo creó. */
async function clienteComentarios() {
  const razonSocial = 'Cliente E2E Comentarios SA de CV';
  const existentes = await peticion(
    `/rest/v1/clientes?razon_social=eq.${encodeURIComponent(razonSocial)}&select=id`,
    'GET',
  );
  if (existentes.length > 0) return existentes[0];
  const creados = await peticion('/rest/v1/clientes', 'POST', {
    razon_social: razonSocial,
    nombre_comercial: 'Cliente E2E Comentarios',
    estado: 'activo',
  });
  return creados[0];
}

const usuarioAutor = await crearUsuario('e2e-comentarios-autor@orca.local', 'Autor E2E', 'vendedor');
const usuarioMencion = await crearUsuario('e2e-comentarios-mencion@orca.local', 'MencionE2E', 'vendedor');

const cliente = await clienteComentarios();
const folio = await peticion('/rest/v1/rpc/generar_folio_orden', 'POST', { p_prefijo: 'OP' });
const ordenes = await peticion('/rest/v1/ordenes_produccion', 'POST', {
  folio,
  cliente_id: cliente.id,
  estado: 'borrador',
  prioridad: 'normal',
  fecha_compromiso: '2100-12-31T00:00:00.000Z',
});
const orden = ordenes[0];

await crearUsuario('e2e-config-admin@orca.local', 'Admin Config E2E', 'admin');
await crearUsuario('e2e-config-vendedor@orca.local', 'Vendedor Config E2E', 'vendedor');
await crearUsuario('e2e-dashboard-vendedor@orca.local', 'Vendedor Dashboard E2E', 'vendedor');
await crearUsuario('e2e-dashboard-contador@orca.local', 'Contador Dashboard E2E', 'contador');
await crearUsuario('e2e-dashboard-admin@orca.local', 'Admin Dashboard E2E', 'admin');
await crearUsuario('e2e-dashboard-operador@orca.local', 'Operador Dashboard E2E', 'operador');

const variables = {
  E2E_CONFIGURACION_ADMIN_EMAIL: 'e2e-config-admin@orca.local',
  E2E_CONFIGURACION_ADMIN_PASSWORD: PASSWORD,
  E2E_CONFIGURACION_VENDEDOR_EMAIL: 'e2e-config-vendedor@orca.local',
  E2E_CONFIGURACION_VENDEDOR_PASSWORD: PASSWORD,
  E2E_DASHBOARD_VENDEDOR_EMAIL: 'e2e-dashboard-vendedor@orca.local',
  E2E_DASHBOARD_VENDEDOR_PASSWORD: PASSWORD,
  E2E_DASHBOARD_CONTADOR_EMAIL: 'e2e-dashboard-contador@orca.local',
  E2E_DASHBOARD_CONTADOR_PASSWORD: PASSWORD,
  E2E_DASHBOARD_ADMIN_EMAIL: 'e2e-dashboard-admin@orca.local',
  E2E_DASHBOARD_ADMIN_PASSWORD: PASSWORD,
  E2E_DASHBOARD_OPERADOR_EMAIL: 'e2e-dashboard-operador@orca.local',
  E2E_DASHBOARD_OPERADOR_PASSWORD: PASSWORD,
  E2E_COMENTARIOS_EMAIL: 'e2e-comentarios-autor@orca.local',
  E2E_COMENTARIOS_PASSWORD: PASSWORD,
  E2E_COMENTARIOS_MENCION_EMAIL: 'e2e-comentarios-mencion@orca.local',
  E2E_COMENTARIOS_MENCION_PASSWORD: PASSWORD,
  E2E_COMENTARIOS_ORDEN_ID: orden.id,
  E2E_COMENTARIOS_ORDEN_FOLIO: orden.folio,
  E2E_COMENTARIOS_MENCION_USUARIO_ID: usuarioMencion.id,
  E2E_COMENTARIOS_MENCION_USUARIO_NOMBRE: 'MencionE2E',
};

writeFileSync(
  rutaSalida,
  JSON.stringify(
    {
      ordenId: orden.id,
      folio: orden.folio,
      autor: usuarioAutor.id,
      mencion: usuarioMencion.id,
      variables,
    },
    null,
    2,
  ),
  'utf8',
);
// Los avisos van a stderr para que stdout quede limpio cuando se usa
// `--exports` y el job de CI lo anexa a $GITHUB_ENV.
console.error(`OK: fixture local creado en ${rutaSalida}`);
console.error('orden:', orden.folio, orden.id);

if (imprimirExports) {
  for (const [clave, valor] of Object.entries(variables)) {
    console.log(`${clave}=${valor}`);
  }
}

if (existsSync('.env.local')) {
  const contenido = readFileSync('.env.local', 'utf8');
  if (contenido.includes('SUPABASE_SERVICE_ROLE_KEY=') && !contenido.includes('127.0.0.1')) {
    console.warn('Aviso: .env.local parece apuntar a un Supabase remoto; este fixture es solo local.');
  }
}
