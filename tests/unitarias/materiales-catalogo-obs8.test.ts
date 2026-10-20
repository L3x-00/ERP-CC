// @vitest-environment jsdom
// Obs. cliente 2026-10-13 (8): alta/edición de material con grupos y
// espesores, ajuste manual de existencias y jerarquía visible del catálogo.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const {
  usuarioMock,
  adminMock,
  logMock,
  permisoGestionMock,
  permisoVerMock,
  guardarMaterialServicioMock,
  guardarEspesorServicioMock,
  mutacionesMock,
  listarSaldosMock,
  listarMovimientosMock,
} = vi.hoisted(() => ({
  usuarioMock: vi.fn(),
  adminMock: vi.fn(),
  logMock: vi.fn(),
  permisoGestionMock: vi.fn(),
  permisoVerMock: vi.fn(),
  guardarMaterialServicioMock: vi.fn(),
  guardarEspesorServicioMock: vi.fn(),
  mutacionesMock: {
    guardarMaterial: { mutateAsync: vi.fn() },
    confirmarCosto: { mutateAsync: vi.fn() },
    ajustarSaldo: { mutateAsync: vi.fn() },
  },
  listarSaldosMock: vi.fn(),
  listarMovimientosMock: vi.fn(),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => usuarioMock(),
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => adminMock(),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  nuevoCorrelationId: () => 'corr-obs8',
  registrarLog: (...args: unknown[]) => logMock(...args),
}));
vi.mock('@/modulos/inventario/servicios/permiso-inventario', () => ({
  puedeGestionarInventario: (...args: unknown[]) => permisoGestionMock(...args),
  puedeVerMaterialesCostos: (...args: unknown[]) => permisoVerMock(...args),
}));
vi.mock('@/modulos/catalogos/servicios/indice', () => ({
  guardarMaterialServicio: (...args: unknown[]) => guardarMaterialServicioMock(...args),
  guardarEspesorServicio: (...args: unknown[]) => guardarEspesorServicioMock(...args),
}));
vi.mock('@/modulos/inventario/hooks/usar-mutaciones-costos-materiales', () => ({
  usarMutacionesCostosMateriales: () => mutacionesMock,
}));
vi.mock('@/modulos/inventario/acciones/consultar-saldos-material-accion', () => ({
  listarSaldosMaterialAccion: (...args: unknown[]) => listarSaldosMock(...args),
  listarMovimientosSaldoMaterialAccion: (...args: unknown[]) => listarMovimientosMock(...args),
}));

import { ajustarSaldoMaterialAccion } from '@/modulos/inventario/acciones/ajustar-saldo-material-accion';
import { guardarMaterialCatalogoAccion } from '@/modulos/inventario/acciones/guardar-material-catalogo-accion';
import { ModalGuardarMaterial } from '@/modulos/inventario/componentes/modal-guardar-material';
import { PanelExistencias } from '@/modulos/inventario/componentes/panel-existencias';
import { TablaMaterialesCostos } from '@/modulos/inventario/componentes/tabla-materiales-costos';
import type { MaterialCosto, SaldoMaterial } from '@/modulos/inventario/tipos/materiales-costos';
import {
  esquemaAjustarSaldoMaterial,
  esquemaGuardarMaterialInventario,
} from '@/modulos/inventario/validaciones/materiales-catalogo';

const USUARIO = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'gerencia@orca.test',
  nombreCompleto: 'Gerencia',
  rol: 'gerente',
  permisos: ['gestionar_inventario'],
  activo: true,
};

const MATERIAL_ID = '22222222-2222-4222-8222-222222222222';

function material(parcial: Partial<MaterialCosto> & { id: string }): MaterialCosto {
  return {
    codigo: 'ACERO',
    nombre: 'Acero al carbón',
    activo: true,
    orden: 0,
    padreId: null,
    unidadBase: 'kg',
    anchoMm: null,
    largoMm: null,
    monedaCosto: 'MXN',
    costoVigente: 10,
    fechaVigenciaCosto: '2026-10-01',
    costoConfirmadoEn: '2026-10-01T10:00:00+00:00',
    costoConfirmadoPorNombre: 'Ana QA',
    actualizadoEn: '2026-10-01T10:00:00+00:00',
    propuestasPendientes: 0,
    espesores: [],
    ...parcial,
  };
}

function envolver(nodo: ReactNode) {
  const consultas = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return createElement(QueryClientProvider, { client: consultas }, nodo);
}

afterEach(cleanup);

describe('Obs. 8 — validaciones de material y ajuste', () => {
  it('exige código, nombre, unidad y espesores válidos', () => {
    const resultado = esquemaGuardarMaterialInventario.safeParse({
      codigo: 'acero 1018',
      nombre: 'Acero',
      unidadBase: 'kg',
      espesores: [{ etiqueta: '5 mm', espesorMm: -1, activo: true, orden: 0 }],
    });
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      const rutas = resultado.error.issues.map((issue) => issue.path.join('.'));
      expect(rutas).toContain('codigo');
      expect(rutas).toContain('espesores.0.espesorMm');
    }
  });

  it('rechaza saldo negativo o motivo corto', () => {
    const base = { materialId: MATERIAL_ID, espesorId: null };
    expect(esquemaAjustarSaldoMaterial.safeParse({ ...base, saldo: -1, motivo: 'conteo' }).success).toBe(false);
    expect(esquemaAjustarSaldoMaterial.safeParse({ ...base, saldo: 1, motivo: 'ok' }).success).toBe(false);
    expect(
      esquemaAjustarSaldoMaterial.safeParse({ ...base, saldo: 1.5, motivo: 'conteo físico' }).success,
    ).toBe(true);
  });
});

describe('Obs. 8 — guardarMaterialCatalogoAccion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usuarioMock.mockResolvedValue(USUARIO);
    permisoGestionMock.mockResolvedValue(true);
    permisoVerMock.mockResolvedValue(true);
    adminMock.mockReturnValue({});
    guardarMaterialServicioMock.mockResolvedValue({
      id: MATERIAL_ID,
      codigo: 'ACERO',
      actualizadoEn: '2026-10-13T10:00:00+00:00',
    });
    guardarEspesorServicioMock.mockResolvedValue({});
  });

  it('exige sesión y permiso de gestión', async () => {
    usuarioMock.mockResolvedValue(null);
    expect(
      await guardarMaterialCatalogoAccion({ codigo: 'ACERO', nombre: 'Acero', unidadBase: 'kg' }),
    ).toMatchObject({ exito: false, error: 'No autorizado' });

    usuarioMock.mockResolvedValue(USUARIO);
    permisoGestionMock.mockResolvedValue(false);
    const sinPermiso = await guardarMaterialCatalogoAccion({
      codigo: 'ACERO',
      nombre: 'Acero',
      unidadBase: 'kg',
    });
    expect(sinPermiso).toMatchObject({ exito: false });
  });

  it('guarda material + espesores con unidad y grupo, audita y devuelve el token CAS', async () => {
    const resultado = await guardarMaterialCatalogoAccion({
      codigo: 'aceroc_1018',
      nombre: 'Acero 1018',
      unidadBase: 'kg',
      padreId: null,
      espesores: [{ etiqueta: '5 mm', espesorMm: 5, activo: true, orden: 0 }],
    });

    expect(guardarMaterialServicioMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        codigo: 'ACEROC_1018',
        unidadBase: 'kg',
        padreId: null,
      }),
    );
    expect(guardarEspesorServicioMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ materialId: MATERIAL_ID, etiqueta: '5 mm', espesorMm: 5 }),
    );
    expect(resultado).toMatchObject({
      exito: true,
      datos: { id: MATERIAL_ID, actualizadoEn: '2026-10-13T10:00:00+00:00' },
    });
    expect(logMock).toHaveBeenCalledWith(
      USUARIO,
      'crear_material_catalogo',
      'inventario',
      MATERIAL_ID,
      expect.objectContaining({ unidadBase: 'kg' }),
      'corr-obs8',
    );
  });

  it('traduce los errores de jerarquía del trigger a mensajes claros', async () => {
    guardarMaterialServicioMock.mockRejectedValue(new Error('material_jerarquia_maxima'));
    const resultado = await guardarMaterialCatalogoAccion({
      codigo: 'ACERO',
      nombre: 'Acero',
      unidadBase: 'kg',
      padreId: MATERIAL_ID,
    });
    expect(resultado).toMatchObject({
      exito: false,
      error: 'Solo se permiten dos niveles: un grupo con subítems no puede agruparse',
    });
  });
});

describe('Obs. 8 — ajustarSaldoMaterialAccion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usuarioMock.mockResolvedValue(USUARIO);
    permisoGestionMock.mockResolvedValue(true);
    adminMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: [{ saldo_anterior: 5, saldo_nuevo: 8, actualizado_en: '2026-10-13T11:00:00+00:00' }],
        error: null,
      }),
    });
  });

  it('rechaza sin permiso y saldos inválidos sin tocar la RPC', async () => {
    permisoGestionMock.mockResolvedValue(false);
    const sinPermiso = await ajustarSaldoMaterialAccion({
      materialId: MATERIAL_ID,
      espesorId: null,
      saldo: 3,
      motivo: 'conteo físico',
    });
    expect(sinPermiso).toMatchObject({ exito: false, error: 'Sin permiso para gestionar existencias' });

    permisoGestionMock.mockResolvedValue(true);
    const invalido = await ajustarSaldoMaterialAccion({
      materialId: MATERIAL_ID,
      espesorId: null,
      saldo: -1,
      motivo: 'conteo físico',
    });
    expect(invalido).toMatchObject({ exito: false, error: 'El saldo no puede ser negativo' });
  });

  it('ajusta por RPC y deja auditoría con anterior y nuevo', async () => {
    const resultado = await ajustarSaldoMaterialAccion({
      materialId: MATERIAL_ID,
      espesorId: null,
      saldo: 8,
      motivo: 'conteo físico',
    });

    expect(resultado).toMatchObject({
      exito: true,
      datos: { saldoAnterior: 5, saldoNuevo: 8 },
    });
    expect(logMock).toHaveBeenCalledWith(
      USUARIO,
      'ajustar_saldo_material',
      'inventario',
      MATERIAL_ID,
      expect.objectContaining({ saldoAnterior: 5, saldoNuevo: 8 }),
      'corr-obs8',
    );
  });

  it('mapea el error del espesor ajeno', async () => {
    adminMock.mockReturnValue({
      rpc: vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'espesor_no_pertenece_al_material' },
      }),
    });
    const resultado = await ajustarSaldoMaterialAccion({
      materialId: MATERIAL_ID,
      espesorId: '33333333-3333-4333-8333-333333333333',
      saldo: 1,
      motivo: 'conteo físico',
    });
    expect(resultado).toMatchObject({
      exito: false,
      error: 'El espesor no pertenece al material',
    });
  });
});

describe('Obs. 8 — ModalGuardarMaterial', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutacionesMock.guardarMaterial.mutateAsync.mockResolvedValue({
      id: MATERIAL_ID,
      codigo: 'ACERO',
      actualizadoEn: '2026-10-13T10:00:00+00:00',
    });
    mutacionesMock.confirmarCosto.mutateAsync.mockResolvedValue({});
  });

  it('en alta envía el material con espesores y confirma el costo inicial', async () => {
    const onCerrar = vi.fn();
    render(
      envolver(
        createElement(ModalGuardarMaterial, {
          material: null,
          materiales: [],
          onCerrar,
        }),
      ),
    );

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'aceroc_1018' } });
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Acero 1018' } });
    fireEvent.change(screen.getByLabelText('Unidad base'), { target: { value: 'kg' } });
    fireEvent.click(screen.getByRole('button', { name: 'Agregar espesor' }));
    fireEvent.change(screen.getByLabelText('Etiqueta'), { target: { value: '5 mm' } });
    fireEvent.change(screen.getByLabelText('mm'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Costo'), { target: { value: '12.5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear material' }));

    await waitFor(() => {
      expect(mutacionesMock.guardarMaterial.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          codigo: 'ACEROC_1018',
          nombre: 'Acero 1018',
          unidadBase: 'kg',
          padreId: null,
          espesores: [expect.objectContaining({ etiqueta: '5 mm', espesorMm: 5 })],
        }),
      );
    });
    expect(mutacionesMock.confirmarCosto.mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        materialId: MATERIAL_ID,
        costo: 12.5,
        fuente: 'MANUAL',
        actualizadoEn: '2026-10-13T10:00:00+00:00',
      }),
    );
    await waitFor(() => expect(onCerrar).toHaveBeenCalled());
  });

  it('en edición no ofrece costo inicial y conserva los espesores con su estado', async () => {
    const editado = material({
      id: MATERIAL_ID,
      padreId: null,
      espesores: [{ id: 'e-1', etiqueta: '6 mm', espesorMm: 6, activo: true, orden: 0 }],
    });
    const onCerrar = vi.fn();
    render(
      envolver(
        createElement(ModalGuardarMaterial, {
          material: editado,
          materiales: [editado],
          onCerrar,
        }),
      ),
    );

    expect(screen.getByLabelText('Código')).toHaveProperty('value', 'ACERO');
    expect(screen.queryByLabelText('Costo')).toBeNull();
    // Un espesor persistido no se quita de la lista (se desactiva).
    expect(screen.queryByRole('button', { name: 'Quitar' })).toBeNull();
    expect(screen.getByLabelText('Etiqueta')).toHaveProperty('value', '6 mm');

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => {
      expect(mutacionesMock.guardarMaterial.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          id: MATERIAL_ID,
          espesores: [expect.objectContaining({ id: 'e-1', activo: true })],
        }),
      );
    });
    expect(mutacionesMock.confirmarCosto.mutateAsync).not.toHaveBeenCalled();
  });
});

describe('Obs. 8 — jerarquía y existencias en la UI', () => {
  const RAIZ = material({ id: 'm-raiz', codigo: 'ACERO_AL_CARBON', nombre: 'Acero al carbón' });
  const HIJO = material({
    id: 'm-hijo',
    codigo: 'ACERO_1018',
    nombre: 'Acero 1018',
    padreId: 'm-raiz',
  });

  it('muestra los subítems indentados con su grupo', () => {
    render(
      createElement(TablaMaterialesCostos, {
        materiales: [HIJO, RAIZ],
        puedeGestionar: false,
        onEditar: vi.fn(),
        onProponer: vi.fn(),
        onCostoManual: vi.fn(),
        onHistorial: vi.fn(),
      }),
    );

    expect(screen.getByText('Grupo: Acero al carbón')).toBeDefined();
    expect(screen.getByText(/1 subítem/)).toBeDefined();
  });

  it('lista saldos, valor estimado y permite ajustar con motivo', async () => {
    const saldo: SaldoMaterial = {
      id: 's-1',
      materialId: RAIZ.id,
      materialCodigo: RAIZ.codigo,
      materialNombre: RAIZ.nombre,
      unidadBase: 'kg',
      espesorId: null,
      espesorEtiqueta: null,
      saldo: 120,
      costoVigente: 10,
      monedaCosto: 'MXN',
      actualizadoPorNombre: 'Ana QA',
      actualizadoEn: '2026-10-12T10:00:00+00:00',
    };
    listarSaldosMock.mockResolvedValue({
      exito: true,
      datos: { saldos: [saldo], puedeGestionar: true },
    });
    listarMovimientosMock.mockResolvedValue({ exito: true, datos: [] });
    mutacionesMock.ajustarSaldo.mutateAsync.mockResolvedValue({});

    render(envolver(createElement(PanelExistencias, { materiales: [RAIZ], puedeGestionar: true })));

    await waitFor(() => expect(screen.getByText('Acero al carbón')).toBeDefined());
    // Valor estimado: 120 kg × costo vigente 10 → $1,200.00
    expect(screen.getByText('$1,200.00')).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'Ajustar Acero al carbón' }));
    const modal = await screen.findByTestId('modal-ajustar-saldo');
    fireEvent.change(modal.querySelector('#ajuste-saldo') as HTMLInputElement, {
      target: { value: '80' },
    });
    fireEvent.change(modal.querySelector('#ajuste-motivo') as HTMLInputElement, {
      target: { value: 'conteo físico' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Ajustar saldo' }));

    await waitFor(() => {
      expect(mutacionesMock.ajustarSaldo.mutateAsync).toHaveBeenCalledWith({
        materialId: RAIZ.id,
        espesorId: null,
        saldo: 80,
        motivo: 'conteo físico',
      });
    });
  });
});
