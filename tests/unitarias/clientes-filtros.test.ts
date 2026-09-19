// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';

const { crearClienteMock } = vi.hoisted(() => ({ crearClienteMock: vi.fn() }));

vi.mock('@/nucleo/supabase/cliente', () => ({
  crearClienteSupabase: () => crearClienteMock(),
}));

import { TablaClientes } from '@/modulos/clientes/componentes/tabla-clientes';
import {
  CLIENTES_POR_PAGINA,
  obtenerClientes,
} from '@/modulos/clientes/servicios/obtener-clientes';

type RegistroConsulta = {
  igualdades: [string, unknown][];
  condicionesO: string[];
  ordenes: [string, { ascending?: boolean } | undefined][];
  rango: [number, number] | null;
  conteo: string | undefined;
};

type RespuestaTabla = {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
  count?: number | null;
};

/** Cliente Supabase falso que registra la consulta construida sobre `clientes`. */
function crearSupabaseFalso(responder: (registro: RegistroConsulta) => RespuestaTabla) {
  const consultas: RegistroConsulta[] = [];

  const from = () => {
    const registro: RegistroConsulta = {
      igualdades: [],
      condicionesO: [],
      ordenes: [],
      rango: null,
      conteo: undefined,
    };
    consultas.push(registro);

    const constructor = {
      select(_columnas: string, opciones?: { count?: string }) {
        registro.conteo = opciones?.count;
        return constructor;
      },
      eq(columna: string, valor: unknown) {
        registro.igualdades.push([columna, valor]);
        return constructor;
      },
      or(expresion: string) {
        registro.condicionesO.push(expresion);
        return constructor;
      },
      order(columna: string, opciones?: { ascending?: boolean }) {
        registro.ordenes.push([columna, opciones]);
        return constructor;
      },
      range(desde: number, hasta: number) {
        registro.rango = [desde, hasta];
        return constructor;
      },
      then<T>(alCumplir: (valor: RespuestaTabla) => T) {
        return Promise.resolve(responder(registro)).then(alCumplir);
      },
    };

    return constructor;
  };

  return { cliente: { from } as unknown as SupabaseClient<Database>, consultas };
}

function filaCliente(indice: number, extra: Record<string, unknown> = {}) {
  return {
    id: `cli-${indice}`,
    actualizado_en: '2026-09-10T10:00:00.000Z',
    condiciones_pago: '30_dias',
    contacto: 'Contacto',
    correo: null,
    creado_en: '2026-09-01T10:00:00.000Z',
    direccion_envio: null,
    direccion_fiscal: null,
    estado: 'activo',
    limite_credito: 100000,
    nombre_comercial: `Comercial ${indice}`,
    razon_social: `Cliente ${indice}`,
    rfc: null,
    saldo_a_favor: 0,
    telefono: null,
    tier: 'bronce',
    tier_manual: null,
    tier_manual_hasta: null,
    ...extra,
  };
}

describe('obtenerClientes: filtros combinados en el servidor', () => {
  it('aplica estado, tier y condiciones de pago como igualdades', async () => {
    const { cliente, consultas } = crearSupabaseFalso(() => ({
      data: [filaCliente(1)],
      error: null,
      count: 1,
    }));

    await obtenerClientes(cliente, {
      estado: 'activo',
      tier: 'oro',
      condicionesPago: '30_dias',
    });

    expect(consultas[0]?.igualdades).toEqual([
      ['estado', 'activo'],
      ['tier', 'oro'],
      ['condiciones_pago', '30_dias'],
    ]);
    expect(consultas[0]?.conteo).toBe('exact');
  });

  it('combina condiciones de pago con la búsqueda saneada y la página', async () => {
    const { cliente, consultas } = crearSupabaseFalso(() => ({
      data: [],
      error: null,
      count: 0,
    }));

    await obtenerClientes(cliente, {
      condicionesPago: 'contado',
      busqueda: 'acero%,(x)',
      pagina: 3,
    });

    expect(consultas[0]?.igualdades).toEqual([['condiciones_pago', 'contado']]);
    expect(consultas[0]?.condicionesO[0]).not.toContain('%,(');
    expect(consultas[0]?.condicionesO[0]).toContain('razon_social.ilike.%acero');
    expect(consultas[0]?.rango).toEqual([
      2 * CLIENTES_POR_PAGINA,
      3 * CLIENTES_POR_PAGINA - 1,
    ]);
  });

  it('no filtra por condiciones de pago cuando el filtro está vacío', async () => {
    const { cliente, consultas } = crearSupabaseFalso(() => ({
      data: [],
      error: null,
      count: 0,
    }));

    await obtenerClientes(cliente, { estado: 'activo' });

    expect(consultas[0]?.igualdades).toEqual([['estado', 'activo']]);
  });

  it('devuelve el total del servidor, no el tamaño de la página', async () => {
    const { cliente } = crearSupabaseFalso(() => ({
      data: [filaCliente(1), filaCliente(2)],
      error: null,
      count: 87,
    }));

    const resultado = await obtenerClientes(cliente, { condicionesPago: 'credito' });

    expect(resultado.registros).toHaveLength(2);
    expect(resultado.total).toBe(87);
    expect(resultado.porPagina).toBe(CLIENTES_POR_PAGINA);
  });

  it('lanza un error genérico si la consulta falla', async () => {
    const { cliente } = crearSupabaseFalso(() => ({
      data: null,
      error: { message: 'timeout' },
    }));

    await expect(obtenerClientes(cliente, {})).rejects.toThrow(
      'No se pudieron cargar los clientes',
    );
  });
});

function crearWrapper(cliente: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: cliente }, children);
  };
}

/** Devuelve la última consulta registrada (la que produjo la vista actual). */
function ultimaConsulta(consultas: RegistroConsulta[]): RegistroConsulta | undefined {
  return consultas[consultas.length - 1];
}

describe('filtros del listado de clientes en la UI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  function montar() {
    const filas = Array.from({ length: CLIENTES_POR_PAGINA }, (_, indice) =>
      filaCliente(indice + 1),
    );
    const falso = crearSupabaseFalso(() => ({ data: filas, error: null, count: 87 }));
    crearClienteMock.mockReturnValue(falso.cliente);

    render(createElement(TablaClientes, { esAdmin: false }), {
      wrapper: crearWrapper(new QueryClient({ defaultOptions: { queries: { retry: false } } })),
    });

    return falso;
  }

  it('muestra el total real del servidor y filtra por condiciones de pago', async () => {
    const falso = montar();

    expect(await screen.findByText('87 cliente(s)')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Filtrar por condiciones de pago'), {
      target: { value: 'credito' },
    });

    await waitFor(() =>
      expect(ultimaConsulta(falso.consultas)?.igualdades).toEqual([
        ['condiciones_pago', 'credito'],
      ]),
    );
  });

  it('regresa a la página 1 al cambiar el filtro de condiciones de pago', async () => {
    const falso = montar();

    await screen.findByText('87 cliente(s)');
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
    await waitFor(() =>
      expect(ultimaConsulta(falso.consultas)?.rango).toEqual([
        CLIENTES_POR_PAGINA,
        2 * CLIENTES_POR_PAGINA - 1,
      ]),
    );

    fireEvent.change(screen.getByLabelText('Filtrar por condiciones de pago'), {
      target: { value: '15_dias' },
    });

    await waitFor(() => {
      const consulta = ultimaConsulta(falso.consultas);
      expect(consulta?.rango).toEqual([0, CLIENTES_POR_PAGINA - 1]);
      expect(consulta?.igualdades).toEqual([['condiciones_pago', '15_dias']]);
    });
    expect(screen.getByText(`Página 1 de 4`)).toBeTruthy();
  });

  it('el botón limpiar borra búsqueda, filtros y paginación de forma coherente', async () => {
    const falso = montar();

    await screen.findByText('87 cliente(s)');
    const limpiar = screen.getByRole('button', { name: 'Limpiar filtros y búsqueda' });
    expect(limpiar.hasAttribute('disabled')).toBe(true);

    fireEvent.change(screen.getByLabelText('Filtrar por estado'), {
      target: { value: 'inactivo' },
    });
    fireEvent.change(screen.getByLabelText('Filtrar por tier'), { target: { value: 'platino' } });
    fireEvent.change(screen.getByLabelText('Filtrar por condiciones de pago'), {
      target: { value: 'contado' },
    });
    fireEvent.change(screen.getByLabelText('Buscar clientes'), { target: { value: 'acero' } });
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }));

    await waitFor(() => expect(limpiar.hasAttribute('disabled')).toBe(false));

    fireEvent.click(limpiar);

    await waitFor(() => {
      const consulta = ultimaConsulta(falso.consultas);
      expect(consulta?.igualdades).toEqual([]);
      expect(consulta?.condicionesO).toEqual([]);
      expect(consulta?.rango).toEqual([0, CLIENTES_POR_PAGINA - 1]);
    });
    expect((screen.getByLabelText('Buscar clientes') as HTMLInputElement).value).toBe('');
    expect((screen.getByLabelText('Filtrar por estado') as HTMLSelectElement).value).toBe('');
    expect((screen.getByLabelText('Filtrar por tier') as HTMLSelectElement).value).toBe('');
    expect(
      (screen.getByLabelText('Filtrar por condiciones de pago') as HTMLSelectElement).value,
    ).toBe('');
    expect(limpiar.hasAttribute('disabled')).toBe(true);
  });
});
