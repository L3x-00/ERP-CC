import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const BASE = 'https://erp-cc-flame.vercel.app';
const OUT = 'evidencias_e2e_ORCA_20261117/_scripts';
mkdirSync(OUT, { recursive: true });

const navegador = await chromium.launch({ headless: true });
const pagina = await navegador.newPage({ viewport: { width: 1440, height: 900 } });
await pagina.goto(`${BASE}/iniciar-sesion`, { waitUntil: 'networkidle' });
console.log('TITULO:', await pagina.title());
console.log('URL:', pagina.url());
const campos = await pagina.locator('input').evaluateAll((nodos) =>
  nodos.map((n) => ({ type: n.type, name: n.name, id: n.id, placeholder: n.placeholder, aria: n.getAttribute('aria-label') })),
);
console.log('INPUTS:', JSON.stringify(campos, null, 2));
const botones = await pagina.getByRole('button').evaluateAll((nodos) => nodos.map((n) => n.innerText.trim()).filter(Boolean));
console.log('BOTONES:', JSON.stringify(botones));
const enlaces = await pagina.locator('a').evaluateAll((nodos) => nodos.map((n) => ({ texto: n.innerText.trim(), href: n.getAttribute('href') })).filter((x) => x.texto));
console.log('ENLACES:', JSON.stringify(enlaces));
await pagina.screenshot({ path: `${OUT}/smoke-login.png`, fullPage: true, animations: 'disabled' });
await navegador.close();
console.log('OK');
