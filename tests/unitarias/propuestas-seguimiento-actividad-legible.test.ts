// @vitest-environment jsdom
// Obs. cliente 2026-10-20: el usuario no debe ver códigos internos. El
// seguimiento y la bitácora de la propuesta se leen en español sencillo, con un
// subtítulo que explica para qué sirven.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/modulos/propuestas/componentes/dialogo-seguimiento-propuesta', () => ({
  DialogoSeguimientoPropuesta: () => null,
}));

import { ActividadPropuesta } from '@/modulos/propuestas/componentes/actividad-propuesta';
import { PanelSeguimientoPropuesta } from '@/modulos/propuestas/componentes/panel-seguimiento-propuesta';
import { etiquetaEventoPropuesta } from '@/modulos/propuestas/utilidades/etiquetas-eventos';
import type { CatalogosPropuesta } from '@/modulos/propuestas/acciones/obtener-catalogos-propuesta';
import type {
  AccionRevisionPropuesta,
  EventoRevisionPropuesta,
  PermisosPropuesta,
  RevisionPropuesta,
} from '@/modulos/propuestas/tipos/indice';

const REVISION = {
  id: 'rev-b',
  propuestaId: 'prop-1',
  letra: 'B',
  estado: 'SENT',
} as unknown as RevisionPropuesta;

const CATALOGOS = {
  canales: [{ codigo: 'EMAIL', nombre: 'Correo electrónico', activo: true, esOtro: false }],
} as unknown as CatalogosPropuesta;

const PERMISOS = { seguimiento: true } as unknown as PermisosPropuesta;

function accion(parcial: Partial<AccionRevisionPropuesta> & { id: string }): AccionRevisionPropuesta {
  return {
    revisionId: 'rev-b',
    codigo: 'FOLLOW_UP',
    textoOtro: null,
    fecha: null,
    responsableId: null,
    canal: null,
    nota: null,
    creadoPor: 'u-1',
    creadoEn: '2026-10-19T10:00:00+00:00',
    ...parcial,
  };
}

function montarSeguimiento(acciones: AccionRevisionPropuesta[], permisos = PERMISOS) {
  const consultas = new QueryClient();
  return render(
    createElement(
      QueryClientProvider,
      { client: consultas },
      createElement(PanelSeguimientoPropuesta, {
        revision: REVISION,
        acciones,
        catalogos: CATALOGOS,
        permisos,
      }),
    ),
  );
}

afterEach(() => {
  cleanup();
});

describe('PanelSeguimientoPropuesta — lenguaje sencillo', () => {
  it('explica para qué sirve la sección en un subtítulo', () => {
    montarSeguimiento([]);

    expect(screen.getByText(/Anota qué sigue con esta propuesta/)).toBeDefined();
  });

  it('muestra la acción en español, la fecha de calendario y el canal por su nombre', () => {
    montarSeguimiento([
      accion({ id: 'a1', codigo: 'WAIT_CUSTOMER_RESPONSE', fecha: '2026-10-19', canal: 'EMAIL', nota: 'Llamar el lunes' }),
    ]);

    const panel = within(screen.getByTestId('panel-seguimiento-propuesta'));
    expect(panel.getByText('Esperar respuesta del cliente')).toBeDefined();
    expect(panel.getByText(/Para el 19 de octubre de 2026 · Canal: Correo electrónico · Llamar el lunes/)).toBeDefined();
    expect(screen.getByTestId('panel-seguimiento-propuesta').textContent).not.toContain('WAIT_CUSTOMER_RESPONSE');
  });

  it('para «Otro» muestra lo que escribió el usuario y marca solo la más reciente como vigente', () => {
    montarSeguimiento([
      accion({ id: 'a1', codigo: 'FOLLOW_UP', creadoEn: '2026-10-01T10:00:00+00:00' }),
      accion({ id: 'a2', codigo: 'OTHER', textoOtro: 'Enviar muestra física', creadoEn: '2026-10-19T10:00:00+00:00' }),
    ]);

    expect(screen.getByText('Enviar muestra física')).toBeDefined();
    expect(screen.getAllByText('Vigente')).toHaveLength(1);
    const filas = screen.getAllByRole('listitem');
    expect(filas[0]?.textContent).toContain('Enviar muestra física');
    expect(filas[0]?.textContent).toContain('Vigente');
    expect(filas[1]?.textContent).toContain('Seguimiento');
    expect(filas[1]?.textContent).toContain('Sin fecha definida');
  });

  it('sin acciones invita a registrar la primera cuando se puede', () => {
    montarSeguimiento([]);

    expect(screen.getByText(/Todavía no hay acciones anotadas/).textContent).toContain('Registrar seguimiento');
  });

  it('sin permiso lo dice con palabras claras', () => {
    montarSeguimiento([], { seguimiento: false } as unknown as PermisosPropuesta);

    expect(screen.getByText('No tienes permiso para anotar seguimiento.')).toBeDefined();
  });
});

function evento(parcial: Partial<EventoRevisionPropuesta> & { id: string }): EventoRevisionPropuesta {
  return {
    revisionId: 'rev-b',
    estadoAnterior: null,
    estadoNuevo: null,
    accion: 'enviar_revision',
    motivo: null,
    canal: null,
    destino: null,
    actorId: 'u-1',
    correlationId: null,
    creadoEn: '2026-10-19T10:00:00+00:00',
    ...parcial,
  };
}

describe('ActividadPropuesta — lenguaje sencillo', () => {
  it('traduce cada código interno a una frase y no lo muestra', () => {
    render(
      createElement(ActividadPropuesta, {
        revision: REVISION,
        catalogos: CATALOGOS,
        eventos: [
          evento({ id: 'e1', accion: 'enviar_revision', estadoAnterior: 'READY_TO_SEND', estadoNuevo: 'SENT', canal: 'EMAIL', destino: 'compras@cliente.mx' }),
          evento({ id: 'e2', accion: 'registrar_seguimiento', creadoEn: '2026-10-18T10:00:00+00:00' }),
        ],
      }),
    );

    const lista = within(screen.getByTestId('actividad-propuesta'));
    expect(lista.getByText('Propuesta enviada al cliente')).toBeDefined();
    expect(lista.getByText('Seguimiento registrado')).toBeDefined();
    expect(lista.getByText(/Lista para enviar → Enviada · Por Correo electrónico · A compras@cliente.mx/)).toBeDefined();
    expect(screen.getByTestId('actividad-propuesta').textContent).not.toMatch(/enviar_revision|registrar_seguimiento/);
  });

  it('explica la sección y el vacío en lenguaje claro', () => {
    render(createElement(ActividadPropuesta, { revision: REVISION, eventos: [] }));

    expect(screen.getByText('Actividad de la versión B')).toBeDefined();
    expect(screen.getByText(/Aquí queda anotado cada cambio importante/)).toBeDefined();
    expect(screen.getByText(/Todavía no hay actividad en esta versión/)).toBeDefined();
  });
});

describe('etiquetaEventoPropuesta', () => {
  it('conoce todos los eventos que registra el sistema', () => {
    for (const codigo of [
      'crear_propuesta', 'crear_nueva_revision', 'agregar_item_propuesta', 'costear_ruteo',
      'validar_revision', 'reabrir_revision', 'enviar_revision', 'registrar_seguimiento',
      'aceptar_revision', 'confirmar_venta', 'confirmar_venta_desde_orden', 'rechazar_propuesta',
      'cerrar_propuesta', 'backfill_legacy',
    ]) {
      expect(etiquetaEventoPropuesta(codigo)).not.toContain('_');
    }
  });

  it('un código nuevo sin traducción se muestra sin guiones bajos', () => {
    expect(etiquetaEventoPropuesta('generar_documento_pdf')).toBe('Generar documento pdf');
    expect(etiquetaEventoPropuesta('')).toBe('Actividad registrada');
  });
});
