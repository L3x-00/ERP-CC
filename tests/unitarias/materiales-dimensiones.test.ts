// @vitest-environment jsdom
// Ancho y largo opcionales (mm) del material: validación, guardado conservador
// desde ambos editores del catálogo, lectura y formulario de «Materiales y costos».
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/compartido/tipos/supabase';

const {
  usuarioMock,
  adminMock,
  logMock,
  permisoGestionMock,
  canMock,
  guardarMaterialServicioMock,
  guardarEspesorServicioMock,
  mutacionesMock,
} = vi.hoisted(() => ({
  usuarioMock: vi.fn(),
  adminMock: vi.fn(),
  logMock: vi.fn(),
  permisoGestionMock: vi.fn(),
  canMock: vi.fn(),
  guardarMaterialServicioMock: vi.fn(),
  guardarEspesorServicioMock: vi.fn(),
  mutacionesMock: {
    guardarMaterial: { mutateAsync: vi.fn() },
    confirmarCosto: { mutateAsync: vi.fn() },
  },
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => usuarioMock(),
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => adminMock(),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  nuevoCorrelationId: () => 'corr-dim',
  registrarLog: (...args: unknown[]) => logMock(...args),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...args: unknown[]) => canMock(...args),
}));
vi.mock('@/modulos/inventario/servicios/permiso-inventario', () => ({
  puedeGestionarInventario: (...args: unknown[]) => permisoGestionMock(...args),
  puedeVerMaterialesCostos: () => Promise.resolve(true),
}));
// Las acciones importan el barril; el servicio real se prueba por su ruta directa.
vi.mock('@/modulos/catalogos/servicios/indice', () => ({
  guardarMaterialServicio: (...args: unknown[]) => guardarMaterialServicioMock(...args),
  guardarEspesorServicio: (...args: unknown[]) => guardarEspesorServicioMock(...args),
}));
vi.mock('@/modulos/inventario/hooks/usar-mutaciones-costos-materiales', () => ({
  usarMutacionesCostosMateriales: () => mutacionesMock,
}));

import { guardarMaterialAccion } from '@/modulos/catalogos/acciones/guardar-material';
import { guardarMaterialServicio } from '@/modulos/catalogos/servicios/catalogos-servicio';
import { dimensionMmDesdeFila, filaAMaterial } from '@/modulos/catalogos/tipos/indice';
import { esquemaGuardarMaterial } from '@/modulos/catalogos/validaciones/indice';
import { guardarMaterialCatalogoAccion } from '@/modulos/inventario/acciones/guardar-material-catalogo-accion';
import { ModalGuardarMaterial } from '@/modulos/inventario/componentes/modal-guardar-material';
import { TablaMaterialesCostos } from '@/modulos/inventario/componentes/tabla-materiales-costos';
import { listarMaterialesCostos } from '@/modulos/inventario/servicios/materiales-costos-servicio';
import type { MaterialCosto } from '@/modulos/inventario/tipos/materiales-costos';
import {
  formatearDimensionesMm,
  interpretarDimensionMm,
} from '@/modulos/inventario/utilidades/materiales-costos';
import { esquemaGuardarMaterialInventario } from '@/modulos/inventario/validaciones/materiales-catalogo';

const USUARIO = {
  id: '11111111-1111-4111-8111-111111111111',
  email: 'gerencia@orca.test',
  nombreCompleto: 'Gerencia',
  rol: 'gerente',
  permisos: ['gestionar_inventario', 'catalogo_editar'],
  activo: true,
};

const MATERIAL_ID = '22222222-2222-4222-8222-222222222222';

const BASE_INVENTARIO = { codigo: 'AL5052', nombre: 'Aluminio 5052', unidadBase: 'hoja' };
const BASE_CATALOGO = { codigo: 'AL5052', nombre: 'Aluminio 5052', activo: true, orden: 0 };

function material(parcial: Partial<MaterialCosto> = {}): MaterialCosto {
  return {
    id: MATERIAL_ID,
    codigo: 'AL5052',
    nombre: 'Aluminio 5052',
    activo: true,
    orden: 0,
    padreId: null,
    unidadBase: 'hoja',
    anchoMm: null,
    largoMm: null,
    monedaCosto: 'MXN',
    costoVigente: null,
    fechaVigenciaCosto: null,
    costoConfirmadoEn: null,
    costoConfirmadoPorNombre: null,
    actualizadoEn: '2026-10-20T10:00:00+00:00',
    propuestasPendientes: 0,
    espesores: [],
    ...parcial,
  };
}

afterEach(cleanup);

describe('Dimensiones de material — validación', () => {
  const invalidas: [string, unknown, string][] = [
    ['cero', 0, 'El ancho debe ser mayor que cero'],
    ['negativo', -5, 'El ancho debe ser mayor que cero'],
    ['sobre el máximo', 100_000, 'El ancho excede el máximo soportado'],
    ['cuatro decimales', 1.2345, 'El ancho admite máximo 3 decimales'],
    ['redondeo a cero', 0.0004, 'El ancho admite máximo 3 decimales'],
    ['texto', '1200', 'El ancho debe ser numérico'],
  ];

  it.each(invalidas)('inventario rechaza ancho %s', (_caso, valor, mensaje) => {
    const resultado = esquemaGuardarMaterialInventario.safeParse({
      ...BASE_INVENTARIO,
      anchoMm: valor,
    });
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]?.path).toEqual(['anchoMm']);
      expect(resultado.error.issues[0]?.message).toBe(mensaje);
    }
  });

  it('rechaza NaN e infinito en ancho y largo', () => {
    for (const valor of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(
        esquemaGuardarMaterialInventario.safeParse({ ...BASE_INVENTARIO, anchoMm: valor }).success,
      ).toBe(false);
      expect(
        esquemaGuardarMaterialInventario.safeParse({ ...BASE_INVENTARIO, largoMm: valor }).success,
      ).toBe(false);
    }
  });

  it('nombra el largo en sus mensajes', () => {
    const resultado = esquemaGuardarMaterialInventario.safeParse({
      ...BASE_INVENTARIO,
      largoMm: 0,
    });
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]?.message).toBe('El largo debe ser mayor que cero');
    }
  });

  it('acepta los límites 0.001 y 99999.999, omitidos y null', () => {
    const limites = esquemaGuardarMaterialInventario.safeParse({
      ...BASE_INVENTARIO,
      anchoMm: 0.001,
      largoMm: 99_999.999,
    });
    expect(limites.success).toBe(true);

    const omitidas = esquemaGuardarMaterialInventario.safeParse(BASE_INVENTARIO);
    expect(omitidas.success).toBe(true);
    if (omitidas.success) {
      expect(omitidas.data.anchoMm).toBeUndefined();
      expect(omitidas.data.largoMm).toBeUndefined();
    }

    const limpiadas = esquemaGuardarMaterialInventario.safeParse({
      ...BASE_INVENTARIO,
      anchoMm: null,
      largoMm: null,
    });
    expect(limpiadas.success).toBe(true);
    if (limpiadas.success) {
      expect(limpiadas.data.anchoMm).toBeNull();
      expect(limpiadas.data.largoMm).toBeNull();
    }
  });

  it('el editor de Configuración aplica las mismas reglas y conserva las omitidas', () => {
    const invalida = esquemaGuardarMaterial.safeParse({ ...BASE_CATALOGO, largoMm: -1 });
    expect(invalida.success).toBe(false);

    const valida = esquemaGuardarMaterial.safeParse({
      ...BASE_CATALOGO,
      anchoMm: 1219.2,
      largoMm: null,
    });
    expect(valida.success).toBe(true);
    if (valida.success) {
      expect(valida.data.anchoMm).toBe(1219.2);
      expect(valida.data.largoMm).toBeNull();
    }

    const sinDimensiones = esquemaGuardarMaterial.safeParse(BASE_CATALOGO);
    expect(sinDimensiones.success).toBe(true);
    if (sinDimensiones.success) {
      expect(sinDimensiones.data.anchoMm).toBeUndefined();
      expect(sinDimensiones.data.largoMm).toBeUndefined();
    }
  });
});

describe('Dimensiones de material — utilidades de formulario y listado', () => {
  it('interpreta vacío como sin dato y valida lo capturado con el mismo esquema', () => {
    expect(interpretarDimensionMm('', 'ancho')).toEqual({ valor: null });
    expect(interpretarDimensionMm('   ', 'largo')).toEqual({ valor: null });
    expect(interpretarDimensionMm(' 1219.2 ', 'ancho')).toEqual({ valor: 1219.2 });
    expect(interpretarDimensionMm('0', 'ancho')).toEqual({
      error: 'El ancho debe ser mayor que cero',
    });
    expect(interpretarDimensionMm('2.0005', 'largo')).toEqual({
      error: 'El largo admite máximo 3 decimales',
    });
    expect(interpretarDimensionMm('abc', 'largo')).toHaveProperty('error');
    expect(interpretarDimensionMm('1e400', 'ancho')).toHaveProperty('error');
  });

  it('formatea ancho × largo, una sola dimensión o ninguna', () => {
    expect(formatearDimensionesMm(1219.2, 2438.4)).toBe('1,219.2 × 2,438.4 mm');
    expect(formatearDimensionesMm(0.001, null)).toBe('Ancho 0.001 mm');
    expect(formatearDimensionesMm(null, 6000)).toBe('Largo 6,000 mm');
    expect(formatearDimensionesMm(null, null)).toBe('—');
  });
});

describe('Dimensiones de material — lectura (mappers y servicio de listado)', () => {
  const FILA_CATALOGO = {
    id: MATERIAL_ID,
    codigo: 'AL5052',
    nombre: 'Aluminio 5052',
    activo: true,
    orden: 1,
    metadata: {},
    creado_en: '2026-10-20T00:00:00.000Z',
    actualizado_en: '2026-10-20T00:00:00.000Z',
  };

  it('el mapper del catálogo normaliza numeric como texto y tolera filas sin las columnas', () => {
    const conDimensiones = filaAMaterial({ ...FILA_CATALOGO, ancho_mm: '1219.200', largo_mm: 2438.4 });
    expect(conDimensiones.anchoMm).toBe(1219.2);
    expect(conDimensiones.largoMm).toBe(2438.4);

    const legado = filaAMaterial(FILA_CATALOGO);
    expect(legado.anchoMm).toBeNull();
    expect(legado.largoMm).toBeNull();

    const nulas = filaAMaterial({ ...FILA_CATALOGO, ancho_mm: null, largo_mm: null });
    expect(nulas.anchoMm).toBeNull();
    expect(nulas.largoMm).toBeNull();
  });

  it('dimensionMmDesdeFila trata vacío y no finito como sin dato', () => {
    expect(dimensionMmDesdeFila(undefined)).toBeNull();
    expect(dimensionMmDesdeFila('')).toBeNull();
    expect(dimensionMmDesdeFila('abc')).toBeNull();
    expect(dimensionMmDesdeFila('NaN')).toBeNull();
    expect(dimensionMmDesdeFila(12.5)).toBe(12.5);
  });

  it('«Materiales y costos» selecciona y mapea ancho_mm/largo_mm; los existentes quedan en null', async () => {
    const selecciones: string[] = [];
    const filas = [
      {
        id: 'm-1',
        codigo: 'AL5052',
        nombre: 'Aluminio 5052',
        activo: true,
        orden: 1,
        unidad_base: 'hoja',
        ancho_mm: '1219.200',
        largo_mm: 2438.4,
        moneda_costo: 'MXN',
        costo_vigente: null,
        fecha_vigencia_costo: null,
        costo_confirmado_en: null,
        costo_confirmado_por: null,
        actualizado_en: '2026-10-20T10:00:00+00:00',
        padre_id: null,
      },
      {
        id: 'm-2',
        codigo: 'ACERO',
        nombre: 'Acero',
        activo: true,
        orden: 2,
        unidad_base: 'kg',
        ancho_mm: null,
        largo_mm: null,
        moneda_costo: 'MXN',
        costo_vigente: null,
        fecha_vigencia_costo: null,
        costo_confirmado_en: null,
        costo_confirmado_por: null,
        actualizado_en: '2026-10-20T10:00:00+00:00',
        padre_id: null,
      },
    ];
    const cliente = {
      from: (tabla: string) => {
        const resultado = { data: tabla === 'catalogo_materiales' ? filas : [], error: null };
        const builder: Record<string, unknown> = {};
        builder.select = (columnas: string) => {
          if (tabla === 'catalogo_materiales') selecciones.push(columnas);
          return builder;
        };
        builder.order = () => builder;
        builder.eq = () => builder;
        builder.in = () => builder;
        builder.then = (
          alCumplir: (valor: typeof resultado) => unknown,
          alRechazar?: (error: unknown) => unknown,
        ) => Promise.resolve(resultado).then(alCumplir, alRechazar);
        return builder;
      },
    } as unknown as SupabaseClient<Database>;

    const materiales = await listarMaterialesCostos(cliente);

    expect(selecciones[0]).toContain('ancho_mm');
    expect(selecciones[0]).toContain('largo_mm');
    expect(materiales[0]).toMatchObject({ anchoMm: 1219.2, largoMm: 2438.4 });
    expect(materiales[1]).toMatchObject({ anchoMm: null, largoMm: null });
  });
});

describe('Dimensiones de material — guardarMaterialServicio (editor compartido)', () => {
  function clienteEscritura(fila: Record<string, unknown>) {
    const capturado: { operacion?: 'insert' | 'update'; payload?: Record<string, unknown> } = {};
    const finalizar = { select: () => ({ single: async () => ({ data: fila, error: null }) }) };
    const cliente = {
      from: () => ({
        insert: (payload: Record<string, unknown>) => {
          capturado.operacion = 'insert';
          capturado.payload = payload;
          return finalizar;
        },
        update: (payload: Record<string, unknown>) => {
          capturado.operacion = 'update';
          capturado.payload = payload;
          return { eq: () => finalizar };
        },
      }),
    } as unknown as SupabaseClient<Database>;
    return { cliente, capturado };
  }

  const FILA = {
    id: MATERIAL_ID,
    codigo: 'AL5052',
    nombre: 'Aluminio 5052',
    activo: true,
    orden: 0,
    ancho_mm: 1219.2,
    largo_mm: 2438.4,
    metadata: {},
    creado_en: '2026-10-20T00:00:00.000Z',
    actualizado_en: '2026-10-20T00:00:00.000Z',
  };

  it('alta: envía ancho_mm y largo_mm y devuelve las dimensiones guardadas', async () => {
    const { cliente, capturado } = clienteEscritura(FILA);
    const guardado = await guardarMaterialServicio(cliente, {
      ...BASE_CATALOGO,
      unidadBase: 'hoja',
      anchoMm: 1219.2,
      largoMm: 2438.4,
    });
    expect(capturado.operacion).toBe('insert');
    expect(capturado.payload).toMatchObject({ ancho_mm: 1219.2, largo_mm: 2438.4 });
    expect(guardado).toMatchObject({ anchoMm: 1219.2, largoMm: 2438.4 });
  });

  it('edición sin dimensiones (editor de Configuración) no toca las columnas', async () => {
    const { cliente, capturado } = clienteEscritura(FILA);
    await guardarMaterialServicio(cliente, { ...BASE_CATALOGO, id: MATERIAL_ID });
    expect(capturado.operacion).toBe('update');
    expect(capturado.payload).not.toHaveProperty('ancho_mm');
    expect(capturado.payload).not.toHaveProperty('largo_mm');
  });

  it('edición con una sola dimensión conserva la otra', async () => {
    const { cliente, capturado } = clienteEscritura(FILA);
    await guardarMaterialServicio(cliente, { ...BASE_CATALOGO, id: MATERIAL_ID, anchoMm: 1500 });
    expect(capturado.payload).toMatchObject({ ancho_mm: 1500 });
    expect(capturado.payload).not.toHaveProperty('largo_mm');
  });

  it('null limpia las dimensiones guardadas', async () => {
    const { cliente, capturado } = clienteEscritura({ ...FILA, ancho_mm: null, largo_mm: null });
    const guardado = await guardarMaterialServicio(cliente, {
      ...BASE_CATALOGO,
      id: MATERIAL_ID,
      anchoMm: null,
      largoMm: null,
    });
    expect(capturado.payload).toMatchObject({ ancho_mm: null, largo_mm: null });
    expect(guardado).toMatchObject({ anchoMm: null, largoMm: null });
  });
});

describe('Dimensiones de material — acciones de guardado', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    usuarioMock.mockResolvedValue(USUARIO);
    permisoGestionMock.mockResolvedValue(true);
    canMock.mockResolvedValue(true);
    adminMock.mockReturnValue({});
    guardarMaterialServicioMock.mockResolvedValue({
      id: MATERIAL_ID,
      codigo: 'AL5052',
      actualizadoEn: '2026-10-20T11:00:00+00:00',
      anchoMm: 1219.2,
      largoMm: 2438.4,
    });
    guardarEspesorServicioMock.mockResolvedValue({});
  });

  it('Materiales y costos: alta con dimensiones las pasa al servicio y las audita', async () => {
    const resultado = await guardarMaterialCatalogoAccion({
      ...BASE_INVENTARIO,
      anchoMm: 1219.2,
      largoMm: 2438.4,
    });

    expect(resultado).toMatchObject({ exito: true, datos: { id: MATERIAL_ID } });
    expect(guardarMaterialServicioMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ anchoMm: 1219.2, largoMm: 2438.4 }),
    );
    expect(logMock).toHaveBeenCalledWith(
      USUARIO,
      'crear_material_catalogo',
      'inventario',
      MATERIAL_ID,
      expect.objectContaining({ anchoMm: 1219.2, largoMm: 2438.4 }),
      'corr-dim',
    );
  });

  it('Materiales y costos: null limpia y omitir conserva', async () => {
    await guardarMaterialCatalogoAccion({
      ...BASE_INVENTARIO,
      id: MATERIAL_ID,
      anchoMm: null,
      largoMm: null,
    });
    expect(guardarMaterialServicioMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ id: MATERIAL_ID, anchoMm: null, largoMm: null }),
    );

    await guardarMaterialCatalogoAccion({ ...BASE_INVENTARIO, id: MATERIAL_ID });
    const entrada = guardarMaterialServicioMock.mock.calls.at(-1)?.[1] as Record<string, unknown>;
    expect(entrada).not.toHaveProperty('anchoMm');
    expect(entrada).not.toHaveProperty('largoMm');
  });

  it('Materiales y costos: valores fuera de límite no llegan al servicio', async () => {
    for (const anchoMm of [0, -1, 100_000, 1.2345]) {
      const resultado = await guardarMaterialCatalogoAccion({ ...BASE_INVENTARIO, anchoMm });
      expect(resultado).toMatchObject({ exito: false });
    }
    const largo = await guardarMaterialCatalogoAccion({ ...BASE_INVENTARIO, largoMm: 0 });
    expect(largo).toEqual({ exito: false, error: 'El largo debe ser mayor que cero' });
    expect(guardarMaterialServicioMock).not.toHaveBeenCalled();
  });

  it('Materiales y costos: sin permiso no guarda aunque las dimensiones sean válidas', async () => {
    permisoGestionMock.mockResolvedValue(false);
    const resultado = await guardarMaterialCatalogoAccion({ ...BASE_INVENTARIO, anchoMm: 100 });
    expect(resultado).toMatchObject({ exito: false, error: 'Sin permiso para gestionar materiales' });
    expect(guardarMaterialServicioMock).not.toHaveBeenCalled();
  });

  it('traduce la restricción de base cuando se salta la validación', async () => {
    guardarMaterialServicioMock.mockRejectedValueOnce(
      new Error('new row violates check constraint "catalogo_materiales_ancho_mm_valido"'),
    );
    const ancho = await guardarMaterialCatalogoAccion({ ...BASE_INVENTARIO, anchoMm: 10 });
    expect(ancho).toEqual({
      exito: false,
      error: 'El ancho debe ser mayor que cero y no exceder el máximo soportado',
    });

    guardarMaterialServicioMock.mockRejectedValueOnce(
      new Error('new row violates check constraint "catalogo_materiales_largo_mm_valido"'),
    );
    const largo = await guardarMaterialCatalogoAccion({ ...BASE_INVENTARIO, largoMm: 10 });
    expect(largo).toEqual({
      exito: false,
      error: 'El largo debe ser mayor que cero y no exceder el máximo soportado',
    });
  });

  it('Configuración: guardar sin dimensiones no las envía; con dimensiones las acepta', async () => {
    const sinDimensiones = await guardarMaterialAccion(BASE_CATALOGO);
    expect(sinDimensiones).toMatchObject({ exito: true });
    const primera = guardarMaterialServicioMock.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(primera.anchoMm).toBeUndefined();
    expect(primera.largoMm).toBeUndefined();

    await guardarMaterialAccion({ ...BASE_CATALOGO, id: MATERIAL_ID, anchoMm: 900, largoMm: null });
    expect(guardarMaterialServicioMock).toHaveBeenLastCalledWith(
      expect.anything(),
      expect.objectContaining({ anchoMm: 900, largoMm: null }),
    );

    guardarMaterialServicioMock.mockClear();
    const invalida = await guardarMaterialAccion({ ...BASE_CATALOGO, anchoMm: -3 });
    expect(invalida).toEqual({ exito: false, error: 'El ancho debe ser mayor que cero' });
    expect(guardarMaterialServicioMock).not.toHaveBeenCalled();
  });
});

describe('Dimensiones de material — formulario «Nuevo material» / «Editar»', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutacionesMock.guardarMaterial.mutateAsync.mockResolvedValue({
      id: MATERIAL_ID,
      codigo: 'AL5052',
      actualizadoEn: '2026-10-20T11:00:00+00:00',
    });
    mutacionesMock.confirmarCosto.mutateAsync.mockResolvedValue({});
  });

  function abrir(editado: MaterialCosto | null) {
    const onCerrar = vi.fn();
    render(
      createElement(ModalGuardarMaterial, {
        material: editado,
        materiales: editado ? [editado] : [],
        onCerrar,
      }),
    );
    return onCerrar;
  }

  function capturarAlta(): void {
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'al5052' } });
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Aluminio 5052' } });
    fireEvent.change(screen.getByLabelText('Unidad base'), { target: { value: 'hoja' } });
  }

  it('alta con ancho y largo los envía como números', async () => {
    abrir(null);
    capturarAlta();
    fireEvent.change(screen.getByLabelText('Ancho (mm)'), { target: { value: '1219.2' } });
    fireEvent.change(screen.getByLabelText('Largo (mm)'), { target: { value: '2438.4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Crear material' }));

    await waitFor(() => {
      expect(mutacionesMock.guardarMaterial.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ codigo: 'AL5052', anchoMm: 1219.2, largoMm: 2438.4 }),
      );
    });
  });

  it('alta sin dimensiones sigue siendo válida y las manda como null', async () => {
    abrir(null);
    capturarAlta();
    fireEvent.click(screen.getByRole('button', { name: 'Crear material' }));

    await waitFor(() => {
      expect(mutacionesMock.guardarMaterial.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ anchoMm: null, largoMm: null }),
      );
    });
  });

  it('edición precarga las dimensiones guardadas y las conserva al guardar', async () => {
    abrir(material({ anchoMm: 1219.2, largoMm: 2438.4 }));

    expect(screen.getByLabelText('Ancho (mm)')).toHaveProperty('value', '1219.2');
    expect(screen.getByLabelText('Largo (mm)')).toHaveProperty('value', '2438.4');

    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => {
      expect(mutacionesMock.guardarMaterial.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ id: MATERIAL_ID, anchoMm: 1219.2, largoMm: 2438.4 }),
      );
    });
  });

  it('vaciar los campos limpia las dimensiones (null)', async () => {
    abrir(material({ anchoMm: 1219.2, largoMm: 2438.4 }));

    fireEvent.change(screen.getByLabelText('Ancho (mm)'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Largo (mm)'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => {
      expect(mutacionesMock.guardarMaterial.mutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ id: MATERIAL_ID, anchoMm: null, largoMm: null }),
      );
    });
  });

  it('bloquea valores inválidos con un aviso y sin llamar al servidor', async () => {
    const casos: [string, string, string][] = [
      ['Ancho (mm)', '0', 'El ancho debe ser mayor que cero'],
      ['Ancho (mm)', '-3', 'El ancho debe ser mayor que cero'],
      ['Ancho (mm)', '100000', 'El ancho excede el máximo soportado'],
      ['Largo (mm)', '1.2345', 'El largo admite máximo 3 decimales'],
    ];
    for (const [etiqueta, valor, mensaje] of casos) {
      cleanup();
      abrir(material());
      fireEvent.change(screen.getByLabelText(etiqueta), { target: { value: valor } });
      fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
      expect((await screen.findByRole('alert')).textContent).toBe(mensaje);
    }
    expect(mutacionesMock.guardarMaterial.mutateAsync).not.toHaveBeenCalled();
  });
});

describe('Dimensiones de material — tabla', () => {
  it('muestra ancho × largo y un guion para los materiales sin dimensiones', () => {
    render(
      createElement(TablaMaterialesCostos, {
        materiales: [
          material({ anchoMm: 1219.2, largoMm: 2438.4 }),
          material({ id: 'm-2', codigo: 'ACERO', nombre: 'Acero' }),
        ],
        puedeGestionar: false,
        onEditar: vi.fn(),
        onProponer: vi.fn(),
        onCostoManual: vi.fn(),
        onHistorial: vi.fn(),
      }),
    );

    expect(screen.getByTestId('dimensiones-material-AL5052').textContent).toBe(
      '1,219.2 × 2,438.4 mm',
    );
    expect(screen.getByTestId('dimensiones-material-ACERO').textContent).toBe('—');
  });
});
