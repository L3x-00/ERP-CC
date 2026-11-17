import { abrirNavegador, nuevoContexto, iniciarSesionAdmin, dumpPantalla, escribirNota, registrar } from './driver.mjs';

const correo = process.argv[2];
const contrasena = process.argv[3];
const rutas = process.argv.slice(4);
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
const salida = {};
try {
  await iniciarSesionAdmin(pagina, correo, contrasena);
  const masTarde = pagina.getByTestId('tipo-cambio-diario-mas-tarde');
  if (await masTarde.count()) {
    await masTarde.click();
    registrar('admin', '00_sesion', 'descartar_modal_tipo_cambio', 'ok', { motivo: 'No modificar configuración global' });
  }
  for (const ruta of rutas) {
    await pagina.goto(ruta, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    await pagina.waitForTimeout(700);
    const dato = await dumpPantalla(pagina);
    salida[ruta] = dato;
    console.log(`\n=== ${ruta} -> ${dato.url} ===`);
    console.log('H1:', JSON.stringify(dato.h1));
    console.log('BOTONES:', JSON.stringify(dato.botones.slice(0, 80)));
    console.log('TESTIDS:', JSON.stringify(dato.testids.slice(0, 120)));
  }
  escribirNota('00_sesion', 'dump-rutas', `# Dump de rutas (solo lectura)\n\n\`\`\`json\n${JSON.stringify(salida, null, 2)}\n\`\`\`\n`);
} catch (e) {
  registrar('admin', '00_sesion', 'probe_rutas', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  await ctx.close();
  await navegador.close();
}
