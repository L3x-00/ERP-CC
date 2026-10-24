// @vitest-environment jsdom
// Nota de convención: el componente usa JSX, pero `vitest.config.ts` solo
// incluye `tests/**/*.test.ts` (sin `.tsx`), así que este archivo usa
// `createElement` en vez de JSX para mantener la extensión `.test.ts`.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';

import type { EstadoRfq, Oportunidad } from '@/modulos/pipeline/tipos/indice';
import type { ValidacionRfqListo } from '@/modulos/rfq/tipos/indice';

const { validarLoteMock } = vi.hoisted(() => ({ validarLoteMock: vi.fn() }));

vi.mock('next/link', () => ({
  default: ({ href, children, ...resto }: { href: string; children: ReactNode }) =>
    createElement('a', { href, ...resto }, children),
}));
vi.mock('@/modulos/rfq/acciones/validar-rfqs-listo-lote', () => ({
  validarRfqsListoLoteAccion: (...args: unknown[]) => validarLoteMock(...args),
}));
vi.mock('@/modulos/rfq/componentes/dialogo-historial-rfq', () => ({
  DialogoHistorialRfq: () => null,
}));

import { TablaOportunidades } from '@/modulos/pipeline/componentes/tabla-oportunidades';

const SECCIONES_VACIAS: ValidacionRfqListo['secciones'] = {
  cliente: [],
  general: [],
  items: [],
  archivos: [],
  seguimiento: [],
};

const COMPLETA: ValidacionRfqListo = { listo: true, secciones: SECCIONES_VACIAS };
const CON_FALTANTES: ValidacionRfqListo = {
  listo: false,
  secciones: { ...SECCIONES_VACIAS, items: ['Falta al menos un ítem'] },
};

function oportunidad(id: string, estadoRfq: EstadoRfq): Oportunidad {
  return {
    id,
    folioOp: `OP-${id}`,
    folioCnc: null,
    folioRfq: `RFQ-${id}`,
    estadoRfq,
    nombreContacto: 'Ana Pérez',
    empresa: `Empresa ${id}`,
    correo: 'ana@metanor.mx',
    telefono: '664 000 0000',
    clienteId: null,
    contactoId: null,
    vendedorId: 'vend-1',
    responsableId: null,
    canal: null,
    fechaSolicitud: '2026-10-01',
    descripcionGeneral: null,
    moneda: 'MXN',
    condicionesPago: null,
    prioridad: 'normal',
    ivaPorcentaje: 16,
    etiquetas: [],
    esOrdenInterna: false,
    poCliente: null,
    fechaRequerida: null,
    horasEstimadas: null,
    notas: null,
    proximaAccionCodigo: null,
    proximaAccionTexto: null,
    fechaProximaAccion: null,
    responsableProximaAccionId: null,
    motivoPerdida: null,
    notasPerdida: null,
    fechaUltimoContacto: null,
    fechaEnvioCotizacion: null,
    creadoEn: '2026-10-01T00:00:00Z',
    actualizadoEn: '2026-10-01T00:00:00Z',
  };
}

function nuevoCliente() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function tabla(cliente: QueryClient, oportunidades: readonly Oportunidad[]) {
  return createElement(
    QueryClientProvider,
    { client: cliente },
    createElement(TablaOportunidades, { oportunidades }),
  );
}

function indicador(folio: string) {
  const fila = screen.getByText(`RFQ-${folio}`).closest('tr');
  if (!fila) throw new Error(`Sin fila para ${folio}`);
  return within(fila).getByTestId('indicador-estado-rfq');
}

afterEach(() => {
  cleanup();
});

describe('Cola RFQ — indicación «Listo para validar» en la tabla', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('un Incompleto con validación completa muestra «Listo para validar» sin cambiar su estado', async () => {
    validarLoteMock.mockResolvedValue({ exito: true, datos: { 'a-1': COMPLETA } });
    render(tabla(nuevoCliente(), [oportunidad('a-1', 'INCOMPLETE')]));

    await waitFor(() => expect(indicador('a-1').getAttribute('data-captura')).toBe('lista'));
    expect(within(indicador('a-1')).getByText('Listo para validar')).toBeDefined();
    // El estado de negocio no se movió y sigue disponible para lectores de pantalla.
    expect(indicador('a-1').getAttribute('data-estado-rfq')).toBe('INCOMPLETE');
    expect(indicador('a-1').textContent).toContain('Estado del RFQ: Incompleto.');
  });

  it('con faltantes sigue «Incompleto» y nunca se declara lista', async () => {
    validarLoteMock.mockResolvedValue({ exito: true, datos: { 'a-1': CON_FALTANTES } });
    render(tabla(nuevoCliente(), [oportunidad('a-1', 'INCOMPLETE')]));

    await waitFor(() => expect(validarLoteMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByText('Listo para validar')).toBeNull());
    expect(indicador('a-1').getAttribute('data-captura')).toBe('incompleta');
    expect(within(indicador('a-1')).getByText('Incompleto')).toBeDefined();
  });

  it('mientras la validación está pendiente no afirma que la captura esté lista', async () => {
    validarLoteMock.mockReturnValue(new Promise(() => undefined));
    render(tabla(nuevoCliente(), [oportunidad('a-1', 'INCOMPLETE')]));

    await waitFor(() => expect(validarLoteMock).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Listo para validar')).toBeNull();
    expect(within(indicador('a-1')).getByText('Incompleto')).toBeDefined();
  });

  it('si la validación falla (respuesta con error o excepción) conserva «Incompleto»', async () => {
    validarLoteMock.mockResolvedValueOnce({ exito: false, error: 'No se pudo validar el RFQ' });
    const conErrorDeAccion = render(tabla(nuevoCliente(), [oportunidad('a-1', 'INCOMPLETE')]));
    await waitFor(() => expect(validarLoteMock).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(within(indicador('a-1')).getByText('Incompleto')).toBeDefined(),
    );
    expect(screen.queryByText('Listo para validar')).toBeNull();
    conErrorDeAccion.unmount();

    validarLoteMock.mockRejectedValueOnce(new Error('red'));
    render(tabla(nuevoCliente(), [oportunidad('a-1', 'INCOMPLETE')]));
    await waitFor(() => expect(validarLoteMock).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(within(indicador('a-1')).getByText('Incompleto')).toBeDefined(),
    );
    expect(screen.queryByText('Listo para validar')).toBeNull();
  });

  it('un RFQ que el servidor no pudo validar no se marca aunque otros de la cola sí', async () => {
    validarLoteMock.mockResolvedValue({ exito: true, datos: { 'a-1': COMPLETA } });
    render(
      tabla(nuevoCliente(), [oportunidad('a-1', 'INCOMPLETE'), oportunidad('a-2', 'INCOMPLETE')]),
    );

    await waitFor(() => expect(indicador('a-1').getAttribute('data-captura')).toBe('lista'));
    expect(indicador('a-2').getAttribute('data-captura')).toBe('incompleta');
  });

  it('los estados comerciales distintos de Incompleto conservan su etiqueta y no se consultan', async () => {
    const estados: [string, EstadoRfq, string][] = [
      ['n', 'NEW', 'Nuevo'],
      ['c', 'WAITING_CUSTOMER', 'En espera del cliente'],
      ['t', 'WAITING_TECHNICAL', 'En espera técnica'],
      ['l', 'READY_FOR_PROPOSAL', 'Listo para propuesta'],
      ['v', 'CONVERTED', 'Convertido'],
      ['x', 'CLOSED', 'Cerrado'],
      ['y', 'CANCELLED', 'Cancelado'],
    ];
    // Aunque el servidor devolviera «completo» para cualquiera, no aplica fuera de INCOMPLETE.
    validarLoteMock.mockResolvedValue({
      exito: true,
      datos: Object.fromEntries(estados.map(([id]) => [id, COMPLETA])),
    });
    render(tabla(nuevoCliente(), estados.map(([id, estado]) => oportunidad(id, estado))));

    for (const [id, estado, etiqueta] of estados) {
      expect(indicador(id).getAttribute('data-estado-rfq')).toBe(estado);
      expect(indicador(id).getAttribute('data-captura')).toBe('no-aplica');
      expect(within(indicador(id)).getByText(etiqueta)).toBeDefined();
    }
    expect(screen.queryByText('Listo para validar')).toBeNull();
    expect(validarLoteMock).not.toHaveBeenCalled();
  });

  it('con muchas filas hace UNA sola solicitud acotada, solo con los Incompletos', async () => {
    const incompletos = Array.from({ length: 30 }, (_, i) => oportunidad(`i-${i}`, 'INCOMPLETE'));
    const otros = [oportunidad('n-1', 'NEW'), oportunidad('v-1', 'CONVERTED')];
    validarLoteMock.mockResolvedValue({ exito: true, datos: {} });
    render(tabla(nuevoCliente(), [...incompletos, ...otros]));

    await waitFor(() => expect(validarLoteMock).toHaveBeenCalledTimes(1));
    const { rfqIds } = validarLoteMock.mock.calls[0][0] as { rfqIds: string[] };
    expect(rfqIds).toHaveLength(30);
    expect(rfqIds.every((id) => id.startsWith('i-'))).toBe(true);
    expect(rfqIds).not.toContain('n-1');
    expect(rfqIds).not.toContain('v-1');
  });

  it('con más de 100 Incompletos valida TODOS en lotes de a lo más 100, sin truncar', async () => {
    // 101 filas bastan para cruzar el límite (lotes de 100 + 1) con un render mucho más barato.
    const filas = Array.from({ length: 101 }, (_, i) => oportunidad(`i-${String(i).padStart(3, '0')}`, 'INCOMPLETE'));
    validarLoteMock.mockImplementation(async ({ rfqIds }: { rfqIds: string[] }) => ({
      exito: true,
      datos: Object.fromEntries(rfqIds.map((id) => [id, COMPLETA])),
    }));
    render(tabla(nuevoCliente(), filas));

    await waitFor(() => expect(validarLoteMock).toHaveBeenCalledTimes(2));
    const lotes = validarLoteMock.mock.calls.map(([entrada]) => (entrada as { rfqIds: string[] }).rfqIds);
    expect(lotes.map((lote) => lote.length)).toEqual([100, 1]);
    expect(lotes.flat().sort()).toEqual(filas.map((fila) => fila.id).sort());

    // La fila 101 (la que habría truncado un tope de 100) también muestra la indicación.
    await waitFor(() => expect(indicador('i-100').getAttribute('data-captura')).toBe('lista'));
    expect(indicador('i-000').getAttribute('data-captura')).toBe('lista');
    expect(indicador('i-099').getAttribute('data-captura')).toBe('lista');
  });

  it('con más de 100 Incompletos y un lote fallido, solo ese lote queda sin declarar completo', async () => {
    // 101 filas: el primer lote (i-000…i-099) falla y el segundo (i-100, pasado el límite) sí valida.
    const filas = Array.from({ length: 101 }, (_, i) => oportunidad(`i-${String(i).padStart(3, '0')}`, 'INCOMPLETE'));
    validarLoteMock.mockImplementation(async ({ rfqIds }: { rfqIds: string[] }) => {
      if (rfqIds[0] === 'i-000') throw new Error('red');
      return { exito: true, datos: Object.fromEntries(rfqIds.map((id) => [id, COMPLETA])) };
    });
    render(tabla(nuevoCliente(), filas));

    await waitFor(() => expect(validarLoteMock).toHaveBeenCalledTimes(2));
    // El lote 2 sí se validó aunque el 1 falló, y es el que un tope de 100 habría dejado fuera.
    await waitFor(() => expect(indicador('i-100').getAttribute('data-captura')).toBe('lista'));
    // El lote 1 falló: sus filas conservan «Incompleto».
    expect(indicador('i-000').getAttribute('data-captura')).toBe('incompleta');
    expect(indicador('i-099').getAttribute('data-captura')).toBe('incompleta');
  });

  it('un Incompleto que el servidor omitió (no visible o fallo de RPC) no se marca aunque el resto sí', async () => {
    const filas = Array.from({ length: 120 }, (_, i) => oportunidad(`i-${String(i).padStart(3, '0')}`, 'INCOMPLETE'));
    validarLoteMock.mockImplementation(async ({ rfqIds }: { rfqIds: string[] }) => ({
      exito: true,
      datos: Object.fromEntries(rfqIds.filter((id) => id !== 'i-110').map((id) => [id, COMPLETA])),
    }));
    render(tabla(nuevoCliente(), filas));

    await waitFor(() => expect(indicador('i-119').getAttribute('data-captura')).toBe('lista'));
    expect(indicador('i-110').getAttribute('data-captura')).toBe('incompleta');
    expect(indicador('i-000').getAttribute('data-captura')).toBe('lista');
  });

  it('al regresar a la cola vuelve a validar y refleja lo capturado en la ficha', async () => {
    const cliente = nuevoCliente();
    const fila = [oportunidad('a-1', 'INCOMPLETE')];

    // Primera visita: aún faltaban datos.
    validarLoteMock.mockResolvedValueOnce({ exito: true, datos: { 'a-1': CON_FALTANTES } });
    const primera = render(tabla(cliente, fila));
    await waitFor(() => expect(validarLoteMock).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(indicador('a-1').getAttribute('data-captura')).toBe('incompleta'));
    await waitFor(() => expect(cliente.isFetching()).toBe(0));
    primera.unmount();

    // La persona completó la captura en la ficha y regresa a la cola (mismo caché).
    validarLoteMock.mockResolvedValueOnce({ exito: true, datos: { 'a-1': COMPLETA } });
    render(tabla(cliente, fila));

    await waitFor(() => expect(validarLoteMock).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(indicador('a-1').getAttribute('data-captura')).toBe('lista'));
  });

  it('al regresar nunca muestra en verde la validación vieja mientras revalida', async () => {
    const cliente = nuevoCliente();
    const fila = [oportunidad('a-1', 'INCOMPLETE')];

    validarLoteMock.mockResolvedValueOnce({ exito: true, datos: { 'a-1': COMPLETA } });
    const primera = render(tabla(cliente, fila));
    await waitFor(() => expect(indicador('a-1').getAttribute('data-captura')).toBe('lista'));
    await waitFor(() => expect(cliente.isFetching()).toBe(0));
    primera.unmount();

    // Se editó la ficha (p. ej. se retiró un archivo) y la nueva validación tarda.
    validarLoteMock.mockReturnValueOnce(new Promise(() => undefined));
    render(tabla(cliente, fila));

    await waitFor(() => expect(validarLoteMock).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Listo para validar')).toBeNull();
    expect(indicador('a-1').getAttribute('data-captura')).toBe('incompleta');
  });

  it('conserva «Continuar captura» hacia el mismo RFQ aunque la captura esté lista', async () => {
    validarLoteMock.mockResolvedValue({ exito: true, datos: { 'a-1': COMPLETA } });
    render(tabla(nuevoCliente(), [oportunidad('a-1', 'INCOMPLETE')]));

    await waitFor(() => expect(indicador('a-1').getAttribute('data-captura')).toBe('lista'));
    expect(screen.getByRole('link', { name: 'Continuar captura' }).getAttribute('href')).toBe(
      '/rfq?rfq=a-1&continuar=1',
    );
  });

  it('muestra la próxima acción, su fecha y su responsable en la fila del RFQ', async () => {
    validarLoteMock.mockResolvedValue({ exito: true, datos: { 'a-1': CON_FALTANTES } });
    render(
      tabla(nuevoCliente(), [{
        ...oportunidad('a-1', 'INCOMPLETE'),
        proximaAccionCodigo: 'REQUEST_MISSING_INFO',
        fechaProximaAccion: '2026-10-30',
        responsableProximaAccionNombre: 'Vendedor Uno',
      }]),
    );

    await waitFor(() => expect(validarLoteMock).toHaveBeenCalledTimes(1));
    const fila = screen.getByText('RFQ-a-1').closest('tr');
    expect(fila?.textContent).toContain('Solicitar información faltante');
    expect(fila?.textContent).toContain('30 de octubre de 2026');
    expect(fila?.textContent).toContain('Vendedor Uno');
  });

  it('muestra la acción aunque falte la fecha y conserva el detalle de «Otro»', async () => {
    validarLoteMock.mockResolvedValue({ exito: true, datos: { 'a-1': CON_FALTANTES } });
    render(
      tabla(nuevoCliente(), [{
        ...oportunidad('a-1', 'INCOMPLETE'),
        proximaAccionCodigo: 'OTHER',
        proximaAccionTexto: 'Visita a planta',
        fechaProximaAccion: null,
        responsableProximaAccionNombre: 'Vendedor Dos',
      }]),
    );

    await waitFor(() => expect(validarLoteMock).toHaveBeenCalledTimes(1));
    const fila = screen.getByText('RFQ-a-1').closest('tr');
    expect(fila?.textContent).toContain('Otro: Visita a planta');
    expect(fila?.textContent).toContain('Sin fecha');
    expect(fila?.textContent).toContain('Vendedor Dos');
  });
});
