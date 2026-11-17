import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, captura, registrar, dumpPantalla, escribirNota } from './driver.mjs';

const correo = process.argv[2];
const contrasena = process.argv[3];
if (!correo || !contrasena) throw new Error('Uso: node probe-admin.mjs <correo> <password>');

const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
try {
  await iniciarSesionAdmin(pagina, correo, contrasena);
  await pagina.waitForLoadState('networkidle');
  await captura(pagina, '00_sesion', 'dashboard-admin', { usuario: 'admin' });
  const pantalla = await dumpPantalla(pagina);
  console.log(JSON.stringify(pantalla, null, 2));
  escribirNota('00_sesion', 'dump-dashboard-admin', `# Dump dashboard admin\n\n\`\`\`json\n${JSON.stringify(pantalla, null, 2)}\n\`\`\`\n`);
  registrar('admin', '00_sesion', 'probe_dashboard', 'ok', { url: pagina.url() });
} catch (e) {
  registrar('admin', '00_sesion', 'probe_dashboard', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
