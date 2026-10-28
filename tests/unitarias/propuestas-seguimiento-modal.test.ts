// @vitest-environment jsdom
// Obs. cliente 2026-10-11: la próxima acción de la propuesta se captura en un
// modal; en modo validar el resultado depende de la acción combinada del
// servidor y el formulario exige acción, fecha y detalle cuando es «Otro».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const { validarMock, registrarMock } = vi.hoisted(() => ({
  validarMock: vi.fn(),
  registrarMock: vi.fn(),
}));

vi.mock('@/modulos/propuestas/acciones/validar-revision-con-seguimiento', () => ({
  validarRevisionConSeguimientoAccion: (...args: unknown[]) => validarMock(...args),
}));
vi.mock('@/modulos/propuestas/acciones/registrar-seguimiento-propuesta', () => ({
  registrarSeguimientoPropuestaAccion: (...args: unknown[]) => registrarMock(...args),
}));

import { DialogoSeguimientoPropuesta } from '@/modulos/propuestas/componentes/dialogo-seguimiento-propuesta';
import type { CatalogosPropuesta } from '@/modulos/propuestas/acciones/obtener-catalogos-propuesta';
import type { RevisionPropuesta } from '@/modulos/propuestas/tipos/indice';

const REV_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const TOKEN = '2026-10-11T00:00:00+00:00';

const REVISION = {
  id: REV_ID,
  propuestaId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  letra: 'A',
  folioRevision: 'CNC-0001-A',
  estado: 'DRAFT',
  actualizadoEn: TOKEN,
} as unknown as RevisionPropuesta;

const CATALOGOS = {
  procesos: [],
  gruposEquipo: [],
  gruposPlaneados: [],
  recursos: [],
  proximasAcciones: [
    { codigo: 'FOLLOW_UP', nombre: 'Seguimiento', esOtro: false },
    { codigo: 'WAIT_CUSTOMER_RESPONSE', nombre: 'Esperar respuesta del cliente', esOtro: false },
    { codigo: 'OTRO', nombre: 'Otro', esOtro: true },
  ],
  canales: [
    { codigo: 'WHATSAPP', nombre: 'WhatsApp', esOtro: false, activo: true },
    { codigo: 'OTRO', nombre: 'Otro', esOtro: true, activo: true },
    { codigo: 'FAX', nombre: 'Fax', esOtro: false, activo: false },
  ],
  materiales: [],
  espesores: [],
  areasTrabajo: [],
  errorItems: null,
} as CatalogosPropuesta;

function montar(parcial: {
  modo?: 'validar' | 'registrar';
  puedeRegistrar?: boolean;
  catalogos?: CatalogosPropuesta | null;
  canalRfq?: { canal: string; canalDetalle: string | null } | null;
  onExito?: (resultado: { seguimientoRegistrado: boolean }) => void;
  onCerrar?: () => void;
}) {
  return render(
    createElement(DialogoSeguimientoPropuesta, {
      modo: parcial.modo ?? 'validar',
      revision: REVISION,
      catalogos: parcial.catalogos === undefined ? CATALOGOS : parcial.catalogos,
      puedeRegistrar: parcial.puedeRegistrar ?? true,
      canalRfq: parcial.canalRfq,
      onCerrar: parcial.onCerrar ?? (() => {}),
      onExito: parcial.onExito,
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  validarMock.mockResolvedValue({
    exito: true,
    datos: { revisionId: REV_ID, estado: 'READY_TO_SEND', seguimientoRegistrado: true },
  });
  registrarMock.mockResolvedValue({
    exito: true,
    datos: { revisionId: REV_ID, accionId: 'accion-1', estado: 'DRAFT' },
  });
});

afterEach(() => {
  cleanup();
});

describe('DialogoSeguimientoPropuesta (obs. cliente)', () => {
  it('en modo validar exige la próxima acción y llama a la acción combinada', async () => {
    const onExito = vi.fn();
    const onCerrar = vi.fn();
    montar({ modo: 'validar', onExito, onCerrar });

    expect(screen.getByText('Validar propuesta')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar y validar' }));

    await waitFor(() =>
      expect(validarMock).toHaveBeenCalledWith(
        expect.objectContaining({
          revisionId: REV_ID,
          actualizadoEn: TOKEN,
          codigo: 'WAIT_CUSTOMER_RESPONSE',
          fecha: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        }),
      ),
    );
    await waitFor(() =>
      expect(onExito).toHaveBeenCalledWith({ seguimientoRegistrado: true }),
    );
    expect(onCerrar).toHaveBeenCalled();
  });

  it('en modo registrar solo agrega el seguimiento', async () => {
    const onExito = vi.fn();
    montar({ modo: 'registrar', onExito });

    fireEvent.click(screen.getByRole('button', { name: 'Registrar seguimiento' }));

    await waitFor(() =>
      expect(registrarMock).toHaveBeenCalledWith(
        expect.objectContaining({ revisionId: REV_ID, codigo: 'FOLLOW_UP' }),
      ),
    );
    expect(validarMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(onExito).toHaveBeenCalledWith({ seguimientoRegistrado: true }),
    );
  });

  it('la acción «Otro» exige detalle antes de confirmar', () => {
    montar({});

    fireEvent.change(screen.getByLabelText('Acción de seguimiento'), {
      target: { value: 'OTRO' },
    });
    const confirmar = screen.getByRole('button', {
      name: 'Registrar y validar',
    }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Detalle de la acción Otro'), {
      target: { value: 'Feria industrial' },
    });
    expect(confirmar.disabled).toBe(false);
  });

  it('al validar preselecciona «Esperar respuesta del cliente» y no admite una fecha pasada', () => {
    montar({ modo: 'validar' });

    expect((screen.getByLabelText('Acción de seguimiento') as HTMLSelectElement).value).toBe(
      'WAIT_CUSTOMER_RESPONSE',
    );
    const fecha = screen.getByLabelText('Fecha de la próxima acción') as HTMLInputElement;
    fireEvent.change(fecha, { target: { value: '2000-01-01' } });
    expect(screen.getByText('La fecha no puede ser anterior a hoy.')).toBeDefined();
    expect((screen.getByRole('button', { name: 'Registrar y validar' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('el canal es un desplegable del catálogo y envía el código configurado', async () => {
    montar({ modo: 'registrar' });

    const canalSelect = screen.getByLabelText('Canal del seguimiento') as HTMLSelectElement;
    const opciones = Array.from(canalSelect.options).map((opcion) => opcion.value);
    expect(opciones).toContain('WHATSAPP');
    expect(opciones).not.toContain('FAX');

    fireEvent.change(canalSelect, { target: { value: 'WHATSAPP' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar seguimiento' }));

    await waitFor(() =>
      expect(registrarMock).toHaveBeenCalledWith(
        expect.objectContaining({ canal: 'WHATSAPP' }),
      ),
    );
  });

  it('el canal «Otro» exige detalle y envía el texto capturado', async () => {
    montar({ modo: 'registrar' });

    fireEvent.change(screen.getByLabelText('Canal del seguimiento'), {
      target: { value: 'OTRO' },
    });
    const confirmar = screen.getByRole('button', {
      name: 'Registrar seguimiento',
    }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Detalle del canal Otro'), {
      target: { value: 'Feria industrial' },
    });
    expect(confirmar.disabled).toBe(false);

    fireEvent.click(confirmar);
    await waitFor(() =>
      expect(registrarMock).toHaveBeenCalledWith(
        expect.objectContaining({ canal: 'Feria industrial' }),
      ),
    );
  });

  it('sin permiso de seguimiento avisa y no permite confirmar', () => {
    montar({ puedeRegistrar: false });

    expect(screen.getByRole('alert').textContent).toContain('permiso de seguimiento');
    const confirmar = screen.getByRole('button', {
      name: 'Registrar y validar',
    }) as HTMLButtonElement;
    expect(confirmar.disabled).toBe(true);
  });

  it('muestra el error del servidor sin cerrar', async () => {
    validarMock.mockResolvedValue({ exito: false, error: 'Confirma ruteo antes de validar' });
    const onCerrar = vi.fn();
    montar({ onCerrar });

    fireEvent.click(screen.getByRole('button', { name: 'Registrar y validar' }));

    await waitFor(() =>
      expect(screen.getByText('Confirma ruteo antes de validar')).toBeDefined(),
    );
    expect(onCerrar).not.toHaveBeenCalled();
  });
});

describe('DialogoSeguimientoPropuesta — canal prellenado desde el RFQ (obs. cliente 2026-10-13)', () => {
  function selectCanal(): HTMLSelectElement {
    return screen.getByLabelText('Canal del seguimiento') as HTMLSelectElement;
  }

  it('al validar, el canal arranca con el capturado en el RFQ y se envía', async () => {
    montar({ modo: 'validar', canalRfq: { canal: 'WHATSAPP', canalDetalle: null } });

    expect(selectCanal().value).toBe('WHATSAPP');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar y validar' }));

    await waitFor(() =>
      expect(validarMock).toHaveBeenCalledWith(expect.objectContaining({ canal: 'WHATSAPP' })),
    );
  });

  it('el canal «Otro» del RFQ trae también su detalle', async () => {
    montar({ modo: 'validar', canalRfq: { canal: 'OTRO', canalDetalle: 'Feria industrial' } });

    expect(selectCanal().value).toBe('OTRO');
    expect((screen.getByLabelText('Detalle del canal Otro') as HTMLInputElement).value).toBe(
      'Feria industrial',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Registrar y validar' }));

    await waitFor(() =>
      expect(validarMock).toHaveBeenCalledWith(
        expect.objectContaining({ canal: 'Feria industrial' }),
      ),
    );
  });

  it('reconoce un canal histórico guardado con el nombre en vez del código', () => {
    montar({ canalRfq: { canal: 'whatsapp', canalDetalle: null } });

    expect(selectCanal().value).toBe('WHATSAPP');
  });

  it('un canal del RFQ que ya no existe en el catálogo deja el campo vacío', () => {
    montar({ canalRfq: { canal: 'Telegrama', canalDetalle: null } });

    expect(selectCanal().value).toBe('');
  });

  it('sin canal en el RFQ el campo queda vacío y no envía canal', async () => {
    montar({ modo: 'validar', canalRfq: null });

    expect(selectCanal().value).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Registrar y validar' }));

    await waitFor(() => expect(validarMock).toHaveBeenCalled());
    expect(validarMock.mock.calls[0]?.[0]).not.toHaveProperty('canal');
  });

  it('lo que la persona elija manda sobre el canal del RFQ', async () => {
    montar({ modo: 'validar', canalRfq: { canal: 'OTRO', canalDetalle: 'Feria industrial' } });

    fireEvent.change(selectCanal(), { target: { value: 'WHATSAPP' } });
    expect(screen.queryByLabelText('Detalle del canal Otro')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Registrar y validar' }));

    await waitFor(() =>
      expect(validarMock).toHaveBeenCalledWith(expect.objectContaining({ canal: 'WHATSAPP' })),
    );

    // Volver al canal del RFQ recupera su detalle.
    cleanup();
    montar({ modo: 'validar', canalRfq: { canal: 'OTRO', canalDetalle: 'Feria industrial' } });
    fireEvent.change(selectCanal(), { target: { value: 'WHATSAPP' } });
    fireEvent.change(selectCanal(), { target: { value: 'OTRO' } });
    expect((screen.getByLabelText('Detalle del canal Otro') as HTMLInputElement).value).toBe(
      'Feria industrial',
    );
  });

  it('si el catálogo llega después de abrir el modal, igual se prellena', () => {
    const vista = montar({
      modo: 'validar',
      catalogos: null,
      canalRfq: { canal: 'WHATSAPP', canalDetalle: null },
    });
    expect(screen.queryByLabelText('Canal del seguimiento')).toBeNull();

    vista.rerender(
      createElement(DialogoSeguimientoPropuesta, {
        modo: 'validar',
        revision: REVISION,
        catalogos: CATALOGOS,
        puedeRegistrar: true,
        canalRfq: { canal: 'WHATSAPP', canalDetalle: null },
        onCerrar: () => {},
      }),
    );

    expect(selectCanal().value).toBe('WHATSAPP');
  });
});
