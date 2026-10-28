// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import { FormularioNotaEntrega } from '@/modulos/produccion/componentes/formulario-nota-entrega';

const ORDEN = {
  id: '11111111-1111-4111-8111-111111111111',
  folio: 'OP-001171',
  partidas: [{
    id: '22222222-2222-4222-8222-222222222222',
    codigoPieza: 'ECM-BOR-201',
    cantidadProducida: 10,
    cantidadEntregada: 2,
  }],
} as never;

afterEach(cleanup);

describe('FormularioNotaEntrega', () => {
  it('mantiene el formulario fuera de la vista y lo abre en un diálogo accesible', async () => {
    const onEnviar = vi.fn().mockResolvedValue({ exito: true, folio: 'NE-0001' });
    render(createElement(FormularioNotaEntrega, { orden: ORDEN, procesando: false, onEnviar }));

    expect(screen.queryByTestId('formulario-nota-entrega')).toBeNull();
    fireEvent.click(screen.getByTestId('abrir-nota-entrega'));
    expect(screen.getByRole('dialog', { name: 'Generar nota de entrega' })).toBeDefined();

    fireEvent.change(screen.getByLabelText('Recibido por'), { target: { value: 'Almacén cliente' } });
    fireEvent.change(screen.getByLabelText('Cantidad entregada ECM-BOR-201'), { target: { value: '3' } });
    fireEvent.click(screen.getByTestId('generar-nota-entrega'));

    await waitFor(() => expect(onEnviar).toHaveBeenCalledWith({
      ordenId: '11111111-1111-4111-8111-111111111111',
      recibidoPor: 'Almacén cliente',
      partidas: [{ partidaId: '22222222-2222-4222-8222-222222222222', cantidadEntregada: 3 }],
    }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Generar nota de entrega' })).toBeNull());
    expect(screen.getByRole('status').textContent).toContain('Nota NE-0001 generada');
  });
});
