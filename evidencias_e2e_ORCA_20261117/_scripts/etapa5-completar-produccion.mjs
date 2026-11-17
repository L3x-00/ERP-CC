import { abrirNavegador, nuevoContexto, iniciarSesionOperador, captura, registrar, escribirNota } from './driver.mjs';
const IT01 = '71c7d593-0caf-4f93-bfd7-0b1aa3fa8d82:42bd2e46-fe32-4a9b-856a-5cb8384b78f7';
const IT02 = '7e4f4d78-f9d9-4e5d-b3cd-a93b3c357789:57f072fa-51f2-4e34-a6de-4551111604c1';
const navegador = await abrirNavegador();
const ctx = await nuevoContexto(navegador);
const pagina = await ctx.newPage();
pagina.setDefaultTimeout(12000);
const resultados = [];
async function paso(nombre, fn, critico = true) {
  try {
    const r = await fn();
    resultados.push({ paso: nombre, resultado: 'ok', detalle: r ?? null });
    registrar('operador', '07_entrega_cobro', nombre, 'ok', r ?? {});
    return r;
  } catch (e) {
    const msg = String(e && e.message || e).slice(0, 1600);
    resultados.push({ paso: nombre, resultado: 'error', detalle: msg });
    registrar('operador', '07_entrega_cobro', nombre, 'error', { mensaje: msg });
    await captura(pagina, '07_entrega_cobro', `error5-${nombre}`, { usuario: 'operador' }).catch(() => {});
    if (critico) throw new Error(`${nombre}: ${msg}`);
    return null;
  }
}
async function abrir(id) {
  await pagina.locator(`[data-testid="abrir-detalle-${id}"]`).first().dispatchEvent('click');
  const d = pagina.getByTestId('detalle-proceso');
  await d.waitFor();
  await pagina.waitForTimeout(500);
  return d;
}
async function cerrarFicha(d) {
  const b = d.getByRole('button', { name: 'Cerrar ficha' });
  if (await b.count()) { await b.dispatchEvent('click'); await pagina.waitForTimeout(500); }
}
try {
  await paso('finalizar-IT01', async () => {
    await iniciarSesionOperador(pagina, process.env.E2E_OPERADOR_PIN ?? '');
    let d = await abrir(IT01);
    const reanudar = d.getByTestId('reanudar-detalle');
    if (await reanudar.count()) { await reanudar.dispatchEvent('click'); await pagina.waitForTimeout(1600); }
    await cerrarFicha(d);
    d = await abrir(IT01);
    const alternar = d.getByTestId('alternar-cierre-sesion');
    if (await alternar.count()) await alternar.dispatchEvent('click');
    await pagina.waitForTimeout(500);
    await d.getByLabel('Resultado').selectOption('finalizada');
    await d.getByTestId('piezas-cierre').fill('50');
    const usado = d.getByTestId('usado-cierre');
    if (await usado.count()) await usado.fill('5');
    const merma = d.getByTestId('merma-cierre');
    if (await merma.count()) await merma.fill('0.2');
    const motivo = d.getByLabel('Motivo del consumo');
    if (await motivo.count()) await motivo.fill('Corte laser piezas QA1711');
    await d.getByTestId('pin-cierre').fill(process.env.E2E_OPERADOR_PIN ?? '');
    await captura(pagina, '07_entrega_cobro', '01-cierre-IT01-50-piezas', { usuario: 'operador' });
    await d.getByTestId('cerrar-sesion-detalle').dispatchEvent('click');
    await pagina.waitForTimeout(2200);
    const mensaje = (await pagina.locator('body').innerText()).replace(/\s+/g, ' ');
    await captura(pagina, '07_entrega_cobro', '02-resultado-cierre-IT01', { usuario: 'operador' });
    return { mensaje: mensaje.slice(0, 700) };
  });

  await paso('completar-IT02', async () => {
    let d = await abrir(IT02);
    const reclaim = d.getByTestId('reclamar-detalle');
    if (await reclaim.count()) { await reclaim.dispatchEvent('click'); await pagina.waitForTimeout(1800); }
    await cerrarFicha(d);
    d = await abrir(IT02);
    let iniciar = d.getByTestId('iniciar-detalle');
    if (!(await iniciar.count())) throw new Error('IT02 no muestra Iniciar tras reclamar');
    await iniciar.dispatchEvent('click');
    const checklist = pagina.getByTestId('checklist-inicio');
    await checklist.waitFor({ timeout: 10000 });
    for (const c of await checklist.getByRole('checkbox').all()) await c.check();
    await checklist.getByTestId('confirmar-checklist-inicio').dispatchEvent('click');
    await pagina.waitForTimeout(1800);
    await cerrarFicha(d);
    d = await abrir(IT02);
    const alternar = d.getByTestId('alternar-cierre-sesion');
    if (await alternar.count()) await alternar.dispatchEvent('click');
    await pagina.waitForTimeout(500);
    await d.getByLabel('Resultado').selectOption('finalizada');
    await d.getByTestId('piezas-cierre').fill('25');
    const usado = d.getByTestId('usado-cierre');
    if (await usado.count()) await usado.fill('3');
    const motivo = d.getByLabel('Motivo del consumo');
    if (await motivo.count()) await motivo.fill('Router CNC panel MDF QA1711');
    await d.getByTestId('pin-cierre').fill(process.env.E2E_OPERADOR_PIN ?? '');
    await captura(pagina, '07_entrega_cobro', '03-cierre-IT02-25-piezas', { usuario: 'operador' });
    await d.getByTestId('cerrar-sesion-detalle').dispatchEvent('click');
    await pagina.waitForTimeout(2200);
    await captura(pagina, '07_entrega_cobro', '04-resultado-cierre-IT02', { usuario: 'operador' });
    const lista = (await pagina.getByTestId('columna-lista').innerText().catch(() => '')).replace(/\s+/g, ' ').slice(0, 600);
    return { lista };
  }, false);
} catch (e) {
  registrar('operador', '07_entrega_cobro', 'etapa5_fatal', 'error', { mensaje: String(e && e.message || e) });
  console.error(e);
  process.exitCode = 1;
} finally {
  escribirNota('07_entrega_cobro', 'completar-produccion', `# Completar producción\n\n\`\`\`json\n${JSON.stringify(resultados, null, 2)}\n\`\`\`\n`);
  await ctx.close();
  await navegador.close();
  console.log('RESPUESTA:', JSON.stringify(resultados, null, 2).slice(0, 9000));
}
