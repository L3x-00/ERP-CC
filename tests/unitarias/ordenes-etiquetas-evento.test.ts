// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen } from '@testing-library/react';

import {
  ETIQUETAS_EVENTO,
  esClaveIdentificador,
  etiquetaEvento,
  humanizarClave,
  nombreActorEvento,
} from '@/modulos/ordenes/utilidades/etiquetas-evento';
import { PanelActividadFicha } from '@/modulos/ordenes/componentes/panel-actividad-ficha';
import type { EventoFicha } from '@/modulos/ordenes/tipos/ficha-orden';
import { ID_RECURSO_ANTERIOR, ID_RECURSO_NUEVO, PATRON_UUID } from '../utilidades/ficha-orden-fixture';

afterEach(() => cleanup());

describe('etiquetas de eventos de la orden (R10, Fase 1)', () => {
  it.each([
    ['orden_creada', 'Orden creada'],
    ['orden_interna_creada', 'Orden interna creada'],
    ['orden_liberada', 'Orden liberada'],
    ['cierre_administrativo', 'Cierre administrativo'],
    ['ajuste_post_aceptacion', 'Ajuste posterior a la aceptación'],
    ['ajuste_operativo', 'Ajuste operativo'],
    ['programacion_inicial', 'Planeación inicial'],
    ['reprogramacion_operativa', 'Reprogramación operativa'],
  ])('«%s» se muestra como «%s»', (tipo, etiqueta) => {
    expect(etiquetaEvento(tipo)).toBe(etiqueta);
  });

  it('el diccionario no deja ninguna etiqueta en snake_case', () => {
    for (const etiqueta of Object.values(ETIQUETAS_EVENTO)) {
      expect(etiqueta).not.toContain('_');
    }
  });

  it('un tipo nuevo sin entrada cae en una etiqueta legible, nunca en snake_case', () => {
    expect(etiquetaEvento('produccion_iniciada')).toBe('Produccion iniciada');
    expect(etiquetaEvento('evento-raro_nuevo')).toBe('Evento raro nuevo');
    expect(etiquetaEvento('')).toBe('Evento');
    expect(etiquetaEvento('  ')).toBe('Evento');
    expect(etiquetaEvento('algo_raro')).not.toContain('_');
  });

  it('humaniza claves de cambio y reconoce las que son identificadores', () => {
    expect(humanizarClave('horas_estimadas')).toBe('Horas estimadas');
    expect(humanizarClave('turno')).toBe('Turno');
    for (const clave of ['recurso_id', 'partida_id', 'programacion_id', 'id', 'archivo_id']) {
      expect(esClaveIdentificador(clave), clave).toBe(true);
    }
    for (const clave of ['turno', 'identidad', 'fecha_programada', 'prioridad']) {
      expect(esClaveIdentificador(clave), clave).toBe(false);
    }
  });

  it('un evento sin actor se atribuye al Sistema', () => {
    expect(nombreActorEvento(null)).toBe('Sistema');
    expect(nombreActorEvento('')).toBe('Sistema');
    expect(nombreActorEvento('Ana Pérez')).toBe('Ana Pérez');
  });
});

describe('panel de Actividad (R10, Fase 1)', () => {
  const EVENTOS: EventoFicha[] = [
    {
      id: 'e1',
      tipo: 'reprogramacion_operativa',
      motivo: 'Cambio de máquina',
      actorNombre: null,
      creadoEn: '2026-10-10T12:00:00.000Z',
      detalle: {
        anterior: { recurso_id: ID_RECURSO_ANTERIOR, turno: 'matutino', horas_estimadas: 2, cambio_solicitado_por: 'planta' },
        nuevo: { recurso_id: ID_RECURSO_NUEVO, turno: 'vespertino', horas_estimadas: 2, cambio_solicitado_por: 'cliente' },
      },
    },
    {
      id: 'e2',
      tipo: 'orden_creada',
      motivo: null,
      actorNombre: 'Ana Pérez',
      creadoEn: '2026-10-09T12:00:00.000Z',
      detalle: {},
    },
    {
      id: 'e3',
      tipo: 'evento_futuro_sin_diccionario',
      motivo: null,
      actorNombre: null,
      creadoEn: '2026-10-08T12:00:00.000Z',
      detalle: {},
    },
  ];

  it('muestra etiquetas en español, el actor o «Sistema» y nada de snake_case', () => {
    render(createElement(PanelActividadFicha, { eventos: EVENTOS }));
    const texto = screen.getByTestId('ficha-panel-actividad').textContent ?? '';

    expect(texto).toContain('Reprogramación operativa');
    expect(texto).toContain('Orden creada');
    expect(texto).toContain('Evento futuro sin diccionario');
    expect(texto).toContain('Sistema');
    expect(texto).toContain('Ana Pérez');
    expect(texto).toContain('Cambio de máquina');
    expect(texto).not.toMatch(/reprogramacion_operativa|orden_creada|evento_futuro_sin_diccionario/u);
  });

  it('explica el cambio sin identificadores: omite recurso_id y conserva turno', () => {
    render(createElement(PanelActividadFicha, { eventos: EVENTOS }));
    const texto = screen.getByTestId('ficha-panel-actividad').textContent ?? '';

    expect(texto).not.toMatch(PATRON_UUID);
    expect(texto).not.toContain('recurso_id');
    expect(texto).not.toContain('Recurso');
    expect(texto).toContain('Turno:');
    expect(texto).toContain('matutino → vespertino');
    // Una clave sin etiqueta propia se humaniza; la que no cambió no se lista.
    expect(texto).toContain('Cambio solicitado por:');
    expect(texto).toContain('planta → cliente');
    expect(texto).not.toContain('cambio_solicitado_por');
    expect(texto).not.toContain('horas_estimadas');
  });
});
