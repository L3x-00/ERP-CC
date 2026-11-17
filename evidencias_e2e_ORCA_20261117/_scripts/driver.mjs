import { chromium } from '@playwright/test';
import { appendFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const BASE = 'https://erp-cc-flame.vercel.app';
export const EVID = 'evidencias_e2e_ORCA_20261117';
export const TRAZA = path.join(EVID, '_scripts', 'traza.jsonl');

export function agora() {
  const d = new Date();
  const tijuana = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Tijuana', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).format(d);
  return { iso: d.toISOString(), tijuana: `${tijuana} PT` };
}

function safe(s) {
  return String(s).replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 90);
}

export function registrar(usuario, etapa, accion, resultado, detalle = {}) {
  const entrada = { ...agora(), usuario, etapa, accion, resultado, detalle };
  mkdirSync(path.dirname(TRAZA), { recursive: true });
  appendFileSync(TRAZA, `${JSON.stringify(entrada)}\n`, 'utf8');
  console.log(`[${entrada.tijuana}] ${usuario} | ${etapa} | ${accion} => ${resultado}`);
  return entrada;
}

export async function captura(pagina, etapa, nombre, opts = {}) {
  const dir = path.join(EVID, etapa);
  mkdirSync(dir, { recursive: true });
  const s = agora();
  const archivo = path.join(dir, `${s.tijuana.replace(/[^\d]/g, '').slice(0, 14)}-${safe(nombre)}.png`);
  await pagina.screenshot({ path: archivo, fullPage: opts.fullPage ?? true, animations: 'disabled' });
  registrar(opts.usuario ?? 'sistema', etapa, `captura:${nombre}`, 'ok', { archivo, url: pagina.url() });
  return archivo;
}

export async function guardarDescarga(descarga, etapa, nombre) {
  const dir = path.join(EVID, etapa);
  mkdirSync(dir, { recursive: true });
  const sugerido = descarga.suggestedFilename();
  const archivo = path.join(dir, `${safe(nombre)}-${safe(sugerido)}`);
  await descarga.saveAs(archivo);
  registrar('sistema', etapa, `descarga:${nombre}`, 'ok', { archivo, sugerido });
  return archivo;
}

export async function abrirNavegador() {
  return chromium.launch({ headless: true, args: ['--no-sandbox'] });
}

export async function nuevoContexto(navegador) {
  return navegador.newContext({
    baseURL: BASE,
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
    locale: 'es-MX',
    timezoneId: 'America/Tijuana',
  });
}

export async function iniciarSesionAdmin(pagina, correo, contrasena) {
  await pagina.goto('/iniciar-sesion', { waitUntil: 'networkidle' });
  await pagina.locator('#email').fill(correo);
  await pagina.locator('#contrasena').fill(contrasena);
  await Promise.all([
    pagina.waitForURL((u) => /\/dashboard|\/tablero/.test(u.pathname), { timeout: 30000 }),
    pagina.getByRole('button', { name: 'Iniciar sesión' }).click(),
  ]);
  registrar('admin', '00_sesion', 'login_admin', 'ok', { url: pagina.url() });
}

export async function iniciarSesionOperador(pagina, pin) {
  await pagina.goto('/operador', { waitUntil: 'networkidle' });
  for (const d of String(pin)) await pagina.getByRole('button', { name: d, exact: true }).click();
  await pagina.getByRole('button', { name: 'Confirmar PIN' }).click();
  await pagina.waitForURL('**/produccion-piso', { timeout: 30000 });
  registrar('operador', '00_sesion', 'login_operador_pin', 'ok', { url: pagina.url() });
}

export async function dumpPantalla(pagina) {
  const titulo = await pagina.title();
  const url = pagina.url();
  const h1 = await pagina.locator('h1').allInnerTexts().catch(() => []);
  const enlaces = await pagina.locator('a').evaluateAll((ns) =>
    ns.map((n) => ({ t: n.innerText.trim().replace(/\s+/g, ' '), h: n.getAttribute('href') })).filter((x) => x.t),
  );
  const botones = await pagina.getByRole('button').evaluateAll((ns) =>
    ns.map((n) => n.innerText.trim().replace(/\s+/g, ' ')).filter(Boolean),
  );
  const testids = await pagina.locator('[data-testid]').evaluateAll((ns) =>
    ns.map((n) => n.getAttribute('data-testid')).filter(Boolean),
  );
  return { titulo, url, h1, enlaces, botones, testids };
}

export function escribirNota(etapa, nombre, contenido) {
  const dir = path.join(EVID, etapa);
  mkdirSync(dir, { recursive: true });
  const archivo = path.join(dir, `${safe(nombre)}.md`);
  writeFileSync(archivo, contenido, 'utf8');
  registrar('sistema', etapa, `nota:${nombre}`, 'ok', { archivo });
  return archivo;
}

export function yaExiste(p) {
  return existsSync(p);
}
