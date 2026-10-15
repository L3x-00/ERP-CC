// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { FichaOrden as DatosFichaOrden } from '@/modulos/ordenes/tipos/ficha-orden';
import type { PermisosFichaOrden } from '@/modulos/ordenes/componentes/ficha-orden';
import {
  PATRON_UUID,
  PERMISOS_BASE,
  fichaCompleta,
  fichaConSnapshot,
} from '../utilidades/ficha-orden-fixture';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock('@/modulos/ordenes/acciones/cambiar-estado-orden', () => ({ cambiarEstadoOrdenAccion: vi.fn() }));
vi.mock('@/modulos/ordenes/acciones/cerrar-orden-administrativa', () => ({ cerrarOrdenAdministrativaAccion: vi.fn() }));
vi.mock('@/modulos/ordenes/acciones/liberar-orden', () => ({ liberarOrdenAccion: vi.fn() }));
vi.mock('@/modulos/comentarios/componentes/indice', () => ({
  HiloComentarios: () => createElement('div', { 'data-testid': 'hilo-comentarios' }),
}));
vi.mock('@/modulos/ordenes/componentes/adjuntos-orden-dialog', () => ({ AdjuntosOrdenDialog: () => null }));

import { FichaOrden } from '@/modulos/ordenes/componentes/ficha-orden';

const PESTANAS = [
  'resumen', 'partidas', 'ruta', 'archivos', 'entregas', 'actividad', 'documento', 'comentarios',
] as const;

/** Texto visible de cada pestaña disponible (los atributos href/data-* no cuentan). */
function textoPorPestana(ficha: DatosFichaOrden, permisos: PermisosFichaOrden): Record<string, string> {
  render(createElement(FichaOrden, { ficha, permisos, usuarioActualId: 'u-sin-ids' }));
  const textos: Record<string, string> = {};
  for (const id of PESTANAS) {
    const pestana = screen.queryByTestId(`ficha-pestana-${id}`);
    if (!pestana) continue;
    fireEvent.click(pestana);
    textos[id] = document.body.textContent ?? '';
  }
  return textos;
}

const ESCENARIOS: readonly [string, () => DatosFichaOrden, PermisosFichaOrden][] = [
  ['sin ver_finanzas ni enlaces', () => fichaCompleta(), PERMISOS_BASE],
  [
    'con ver_finanzas y snapshot',
    () => fichaConSnapshot(),
    { ...PERMISOS_BASE, puedeVerFinanzas: true },
  ],
  [
    'con todos los permisos',
    () => fichaConSnapshot(),
    {
      ...PERMISOS_BASE,
      puedeVerFinanzas: true,
      puedeVerRfq: true,
      puedeVerPropuesta: true,
      puedeAdjuntar: true,
    },
  ],
];

afterEach(() => cleanup());

describe('ficha de Orden C8.2 · sin identificadores internos en pantalla', () => {
  it.each(ESCENARIOS)('%s: ninguna pestaña muestra un UUID', (_caso, construir, permisos) => {
    const textos = textoPorPestana(construir(), permisos);

    expect(Object.keys(textos).length).toBeGreaterThanOrEqual(7);
    for (const [pestana, texto] of Object.entries(textos)) {
      expect(texto, `UUID visible en la pestaña ${pestana}`).not.toMatch(PATRON_UUID);
    }
  });

  it.each(ESCENARIOS)('%s: ninguna pestaña muestra las claves rfq_id, propuesta_id ni revision_id', (_caso, construir, permisos) => {
    const textos = textoPorPestana(construir(), permisos);

    for (const [pestana, texto] of Object.entries(textos)) {
      expect(texto, `clave interna visible en la pestaña ${pestana}`)
        .not.toMatch(/\b(rfq_id|propuesta_id|revision_id|recurso_id|partida_id|programacion_id|archivo_id)\b/u);
    }
  });

  it('un evento con recurso_id no imprime el UUID ni la clave', () => {
    textoPorPestana(fichaCompleta(), PERMISOS_BASE);
    fireEvent.click(screen.getByTestId('ficha-pestana-actividad'));

    const panel = screen.getByTestId('ficha-panel-actividad');
    expect(panel.textContent).not.toMatch(PATRON_UUID);
    expect(panel.textContent).not.toContain('recurso_id');
    expect(panel.textContent).not.toContain('Recurso:');
    // El resto del cambio sí se explica.
    expect(panel.textContent).toContain('matutino');
    expect(panel.textContent).toContain('vespertino');
  });

  it('un archivo sin nombre no muestra su archivoId', () => {
    textoPorPestana(fichaCompleta(), PERMISOS_BASE);
    fireEvent.click(screen.getByTestId('ficha-pestana-archivos'));

    const panel = screen.getByTestId('ficha-panel-archivos');
    expect(panel.textContent).toContain('Archivo sin nombre');
    expect(panel.textContent).not.toMatch(PATRON_UUID);
  });
});
