// @vitest-environment jsdom
// UI-04: Usuarios y Operadores usan diálogos del sistema y muestran los permisos
// del rol sin modificar la matriz ni conceder accesos.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const {
  obtenerUsuariosMock,
  obtenerMatrizMock,
  cambiarRolMock,
  cambiarEstadoMock,
  guardarOperadorMock,
} = vi.hoisted(() => ({
  obtenerUsuariosMock: vi.fn(),
  obtenerMatrizMock: vi.fn(),
  cambiarRolMock: vi.fn(),
  cambiarEstadoMock: vi.fn(),
  guardarOperadorMock: vi.fn(),
}));

vi.mock('@/modulos/permisos/acciones/indice', () => ({
  obtenerUsuariosAccion: () => obtenerUsuariosMock(),
  obtenerMatrizPermisosAccion: () => obtenerMatrizMock(),
  cambiarRolUsuarioAccion: (...args: unknown[]) => cambiarRolMock(...args),
  cambiarEstadoUsuarioAccion: (...args: unknown[]) => cambiarEstadoMock(...args),
}));

vi.mock('@/modulos/configuracion/acciones/indice', () => ({
  guardarOperadorAccion: (...args: unknown[]) => guardarOperadorMock(...args),
}));

import { PestanaUsuarios } from '@/modulos/permisos/componentes/pestana-usuarios';
import { PestanaOperadores } from '@/modulos/configuracion/componentes/pestana-operadores';
import type { MatrizPermisos } from '@/modulos/permisos/tipos/indice';
import type { OperadorGestionConfig } from '@/modulos/configuracion/servicios/operadores-servicio';

const MATRIZ: MatrizPermisos = {
  permisos: [
    { codigo: 'ver_clientes', modulo: 'clientes', descripcion: 'Ver clientes', activo: true },
    { codigo: 'rfq_cerrar', modulo: 'rfq', descripcion: 'Cerrar RFQ', activo: true },
  ],
  asignaciones: {
    admin: ['ver_clientes', 'rfq_cerrar'],
    vendedor: ['ver_clientes'],
    gerente: ['rfq_cerrar'],
    contador: [],
    operador: [],
  },
};

const USUARIOS = {
  usuarios: [
    {
      id: 'u2',
      email: 'objetivo@orca.local',
      nombreCompleto: 'Objetivo B1',
      rol: 'vendedor' as const,
      activo: true,
      ultimoLoginEn: null,
    },
  ],
  usuarioActualId: 'u1',
};

const OPERADORES: OperadorGestionConfig[] = [
  {
    id: 'op1',
    nombre: 'Operador Piso',
    activo: true,
    pinConfigurado: true,
  } as OperadorGestionConfig,
];

function envolver(nodo: ReturnType<typeof createElement>) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(createElement(QueryClientProvider, { client: cliente }, nodo));
}

beforeEach(() => {
  vi.clearAllMocks();
  obtenerUsuariosMock.mockResolvedValue({ exito: true, datos: USUARIOS });
  obtenerMatrizMock.mockResolvedValue({ exito: true, datos: MATRIZ });
  cambiarRolMock.mockResolvedValue({ exito: true, datos: null });
  cambiarEstadoMock.mockResolvedValue({ exito: true, datos: null });
  guardarOperadorMock.mockResolvedValue({ exito: true, datos: null });
});

afterEach(cleanup);

describe('PestanaUsuarios — diálogos y vista previa de permisos (UI-04)', () => {
  it('al cambiar el rol muestra los permisos del rol destino sin guardar todavía', async () => {
    envolver(createElement(PestanaUsuarios, { onIrAPermisos: vi.fn() }));
    await screen.findByTestId('usuario-fila-u2');

    fireEvent.change(screen.getByTestId('select-rol-u2'), { target: { value: 'gerente' } });

    const dialogo = await screen.findByTestId('dialogo-rol-usuario');
    expect(dialogo.textContent).toContain('Permisos de Management');
    await waitFor(() => expect(dialogo.textContent).toContain('Cerrar RFQ'));
    expect(cambiarRolMock).not.toHaveBeenCalled();

    fireEvent.change(screen.getByTestId('motivo-cambio-rol'), { target: { value: 'ascenso aprobado' } });
    fireEvent.click(screen.getByTestId('confirmar-cambio-rol'));

    await waitFor(() =>
      expect(cambiarRolMock).toHaveBeenCalledWith({
        usuarioId: 'u2',
        rol: 'gerente',
        motivo: 'ascenso aprobado',
      }),
    );
  });

  it('«Ver permisos» abre la consulta sin ofrecer confirmación y enlaza a la matriz', async () => {
    const irAPermisos = vi.fn();
    envolver(createElement(PestanaUsuarios, { onIrAPermisos: irAPermisos }));
    await screen.findByTestId('usuario-fila-u2');

    fireEvent.click(screen.getByTestId('ver-permisos-u2'));
    await screen.findByTestId('dialogo-rol-usuario');

    expect(screen.queryByTestId('confirmar-cambio-rol')).toBeNull();
    fireEvent.click(screen.getByTestId('ir-a-permisos-desde-usuario'));
    expect(irAPermisos).toHaveBeenCalledTimes(1);
    expect(cambiarRolMock).not.toHaveBeenCalled();
  });

  it('desactivar un usuario pide motivo en un diálogo del sistema', async () => {
    envolver(createElement(PestanaUsuarios));
    await screen.findByTestId('usuario-fila-u2');

    fireEvent.click(screen.getByTestId('boton-estado-u2'));
    await screen.findByTestId('dialogo-estado-usuario');
    fireEvent.change(screen.getByTestId('motivo-cambio-estado'), { target: { value: 'baja temporal' } });
    fireEvent.click(screen.getByTestId('confirmar-cambio-estado'));

    await waitFor(() =>
      expect(cambiarEstadoMock).toHaveBeenCalledWith({
        usuarioId: 'u2',
        activo: false,
        motivo: 'baja temporal',
      }),
    );
  });
});

describe('PestanaOperadores — alta y retiro en modal (UI-04)', () => {
  it('abre el alta en modal y crea el operador con PIN', async () => {
    const onCambio = vi.fn(async () => undefined);
    envolver(createElement(PestanaOperadores, { operadores: OPERADORES, onCambio, onIrAAreas: vi.fn() }));

    fireEvent.click(screen.getByTestId('nuevo-operador-config'));
    await screen.findByTestId('dialogo-operador-config');
    fireEvent.change(screen.getByTestId('operador-config-nombre'), { target: { value: 'Nuevo Piso' } });
    fireEvent.change(screen.getByTestId('operador-config-pin'), { target: { value: '1234' } });
    fireEvent.click(screen.getByTestId('guardar-operador-config'));

    await waitFor(() =>
      expect(guardarOperadorMock).toHaveBeenCalledWith({
        nombre: 'Nuevo Piso',
        pin: '1234',
        activo: true,
      }),
    );
    expect(onCambio).toHaveBeenCalledTimes(1);
  });

  it('retirar exige confirmación en un diálogo y conserva el historial', async () => {
    const onCambio = vi.fn(async () => undefined);
    envolver(createElement(PestanaOperadores, { operadores: OPERADORES, onCambio, onIrAAreas: vi.fn() }));
    await screen.findByTestId('operador-config-op1');

    fireEvent.click(screen.getByRole('button', { name: 'Retirar' }));
    await screen.findByTestId('dialogo-retiro-operador');
    expect(guardarOperadorMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('confirmar-retiro-operador'));

    await waitFor(() =>
      expect(guardarOperadorMock).toHaveBeenCalledWith({
        id: 'op1',
        nombre: 'Operador Piso',
        pin: null,
        activo: false,
      }),
    );
  });
});
