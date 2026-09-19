// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/compartido/tipos/supabase';

const { obtenerClienteMock } = vi.hoisted(() => ({ obtenerClienteMock: vi.fn() }));

vi.mock('@/nucleo/supabase/cliente-navegador', () => ({
  obtenerClienteSupabaseNavegador: () => obtenerClienteMock(),
}));

import { formatearMoneda } from '@/compartido/utilidades/formatear';
import { HistorialCliente } from '@/modulos/clientes/componentes/historial-cliente';
import {
  obtenerCotizacionesCliente,
  obtenerOrdenesCliente,
} from '@/modulos/clientes/servicios/obtener-historial-cliente';

const CLIENTE_ID = '11111111-1111-4111-8111-111111111111';
const OTRO_CLIENTE_ID = '99999999-9999-4999-8999-999999999999';

type RespuestaTabla = {
  data: Record<string, unknown>[] | null;
  error: { message: string } | null;
  count?: number | null;
};

type RegistroConsulta = {
  tabla: string;
  igualdades: [string, unknown][];
  dentroDe: [string, readonly unknown[]][];
  ordenes: [string, { ascending?: boolean } | undefined][];
  rango: [number, number] | null;
  conteo: string | undefined;
};

type FabricaRespuesta = (registro: RegistroConsulta) => RespuestaTabla;

/**
 * Cliente Supabase falso: registra cómo se construyó cada consulta (filtros,
 * orden, rango) para poder afirmar que el filtrado y la paginación ocurren en
 * el servidor y no en la UI.
 */
function crearSupabaseFalso(respuestas: Record<string, FabricaRespuesta>) {
  const consultas: RegistroConsulta[] = [];
  const canalesCreados: string[] = [];
  const suscribir = vi.fn();
  const quitarCanal = vi.fn();

  const from = (tabla: string) => {
    const registro: RegistroConsulta = {
      tabla,
      igualdades: [],
      dentroDe: [],
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
      in(columna: string, valores: readonly unknown[]) {
        registro.dentroDe.push([columna, valores]);
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
        const fabrica = respuestas[tabla];
        const respuesta: RespuestaTabla = fabrica
          ? fabrica(registro)
          : { data: [], error: null, count: 0 };
        return Promise.resolve(respuesta).then(alCumplir);
      },
    };

    return constructor;
  };

  const canal = {
    on: () => canal,
    subscribe: suscribir,
  };

  const cliente = {
    from,
    channel: (nombre: string) => {
      canalesCreados.push(nombre);
      return canal;
    },
    removeChannel: quitarCanal,
  };

  return {
    cliente: cliente as unknown as SupabaseClient<Database>,
    consultas,
    canalesCreados,
    suscribir,
    quitarCanal,
  };
}

function filaPipeline(indice: number, extra: Record<string, unknown> = {}) {
  return {
    id: `cot-${indice}`,
    actualizado_en: '2026-09-10T10:00:00.000Z',
    cliente_id: CLIENTE_ID,
    condiciones_pago: '30_dias',
    correo: null,
    creado_en: `2026-09-${String(10 - indice).padStart(2, '0')}T10:00:00.000Z`,
    empresa: 'CC Manufacturing',
    etapa: 'cotizado',
    etiquetas: [],
    fecha_envio_cotizacion: null,
    fecha_ultimo_contacto: null,
    folio_cnc: null,
    folio_op: `OP-00000${indice}`,
    iva_porcentaje: 16,
    moneda: 'MXN',
    motivo_perdida: null,
    nombre_contacto: 'Contacto',
    notas_perdida: null,
    prioridad: 'normal',
    telefono: null,
    vendedor_id: '22222222-2222-4222-8222-222222222222',
    ...extra,
  };
}

function filaLinea(id: string, pipelineId: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    area: 1.5,
    cantidad: 4,
    creado_en: '2026-09-10T10:00:00.000Z',
    descripcion: 'Placa cortada',
    espesor: '3/16"',
    material: 'Acero A36',
    orden: 1,
    pipeline_id: pipelineId,
    precio_unitario: 250,
    procesos: ['corte_laser', 'doblez'],
    ...extra,
  };
}

function filaOrden(indice: number, extra: Record<string, unknown> = {}) {
  return {
    id: `ord-${indice}`,
    actualizado_en: '2026-09-11T10:00:00.000Z',
    cliente_id: CLIENTE_ID,
    cotizacion_id: null,
    creado_en: `2026-09-${String(11 - indice).padStart(2, '0')}T10:00:00.000Z`,
    estado: 'en_proceso',
    fecha_compromiso: '2026-09-30',
    fecha_fin: null,
    fecha_inicio: null,
    folio: `OP-10000${indice}`,
    motivo_cancelacion: null,
    prioridad: 'normal',
    ...extra,
  };
}

function filaPartida(id: string, ordenId: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    actualizado_en: '2026-09-11T10:00:00.000Z',
    cantidad_producida: 2,
    cantidad_scrap: 1,
    cantidad_solicitada: 10,
    codigo_pieza: 'PZA-001',
    creado_en: '2026-09-11T10:00:00.000Z',
    descripcion: 'Brida maquinada',
    id_material: null,
    maquina_asignada: 'CNC-01',
    material_id: null,
    operador_asignado_id: null,
    orden_id: ordenId,
    tiempo_estimado_minutos: 120,
    tiempo_real_minutos: 60,
    unidad_medida: 'pz',
    ...extra,
  };
}

/** Pagina un arreglo con el mismo criterio de PostgREST (`range` inclusivo). */
function paginar(filas: Record<string, unknown>[], registro: RegistroConsulta): RespuestaTabla {
  const [desde, hasta] = registro.rango ?? [0, filas.length - 1];
  return { data: filas.slice(desde, hasta + 1), error: null, count: filas.length };
}

describe('servicio de historial del cliente', () => {
  it('filtra por cliente en el servidor, ordena por fecha descendente y pagina', async () => {
    const filas = Array.from({ length: 7 }, (_, indice) => filaPipeline(indice + 1));
    const { cliente, consultas } = crearSupabaseFalso({
      pipeline: (registro) => paginar(filas, registro),
      cotizacion_lineas: () => ({ data: [], error: null }),
    });

    const pagina2 = await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 2);

    expect(pagina2.total).toBe(7);
    expect(pagina2.pagina).toBe(2);
    expect(pagina2.registros).toHaveLength(2);
    const consultaPipeline = consultas.find((consulta) => consulta.tabla === 'pipeline');
    expect(consultaPipeline?.igualdades).toEqual([['cliente_id', CLIENTE_ID]]);
    expect(consultaPipeline?.ordenes).toEqual([['creado_en', { ascending: false }], ['id', { ascending: false }]]);
    expect(consultaPipeline?.rango).toEqual([5, 9]);
    expect(consultaPipeline?.conteo).toBe('exact');
  });

  it('agrupa las líneas por cotización y calcula importe y subtotal', async () => {
    const { cliente, consultas } = crearSupabaseFalso({
      pipeline: (registro) => paginar([filaPipeline(1), filaPipeline(2)], registro),
      cotizacion_lineas: () => ({
        data: [
          filaLinea('lin-1', 'cot-1'),
          filaLinea('lin-2', 'cot-1', { cantidad: 2, precio_unitario: 125.5, orden: 2 }),
        ],
        error: null,
      }),
    });

    const resultado = await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1);

    expect(resultado.registros[0]?.lineas).toHaveLength(2);
    expect(resultado.registros[0]?.lineas?.[0]?.importe).toBe(1000);
    expect(resultado.registros[0]?.subtotal).toBe(1251);
    // Una cotización sin líneas es `[]`, no `null`.
    expect(resultado.registros[1]?.lineas).toEqual([]);
    expect(resultado.registros[1]?.subtotal).toBe(0);
    const consultaLineas = consultas.find((consulta) => consulta.tabla === 'cotizacion_lineas');
    expect(consultaLineas?.dentroDe).toEqual([['pipeline_id', ['cot-1', 'cot-2']]]);
  });

  it('distingue líneas no legibles (null) de una cotización sin líneas', async () => {
    const { cliente } = crearSupabaseFalso({
      pipeline: (registro) => paginar([filaPipeline(1)], registro),
      cotizacion_lineas: () => ({ data: null, error: { message: 'permiso denegado' } }),
    });

    const resultado = await obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1);

    expect(resultado.registros[0]?.lineas).toBeNull();
    expect(resultado.registros[0]?.subtotal).toBeNull();
  });

  it('no consulta líneas cuando la página de cotizaciones viene vacía', async () => {
    const { cliente, consultas } = crearSupabaseFalso({
      pipeline: () => ({ data: [], error: null, count: 0 }),
    });

    const resultado = await obtenerCotizacionesCliente(cliente, OTRO_CLIENTE_ID, 1);

    expect(resultado.registros).toEqual([]);
    expect(resultado.total).toBe(0);
    expect(consultas.some((consulta) => consulta.tabla === 'cotizacion_lineas')).toBe(false);
  });

  it('lanza un error genérico si falla la consulta de cotizaciones', async () => {
    const { cliente } = crearSupabaseFalso({
      pipeline: () => ({ data: null, error: { message: 'timeout' } }),
    });

    await expect(obtenerCotizacionesCliente(cliente, CLIENTE_ID, 1)).rejects.toThrow(
      'No se pudo cargar el historial de cotizaciones',
    );
  });

  it('agrupa las partidas por orden y filtra las órdenes por cliente', async () => {
    const { cliente, consultas } = crearSupabaseFalso({
      ordenes_produccion: (registro) => paginar([filaOrden(1), filaOrden(2)], registro),
      partidas_orden_produccion: () => ({
        data: [filaPartida('par-1', 'ord-1'), filaPartida('par-2', 'ord-2')],
        error: null,
      }),
    });

    const resultado = await obtenerOrdenesCliente(cliente, CLIENTE_ID, 1);

    expect(resultado.registros[0]?.partidas).toHaveLength(1);
    expect(resultado.registros[0]?.partidas?.[0]?.codigoPieza).toBe('PZA-001');
    expect(resultado.registros[1]?.partidas?.[0]?.id).toBe('par-2');
    const consultaOrdenes = consultas.find(
      (consulta) => consulta.tabla === 'ordenes_produccion',
    );
    expect(consultaOrdenes?.igualdades).toEqual([['cliente_id', CLIENTE_ID]]);
  });

  it('lanza un error genérico si falla la consulta de órdenes', async () => {
    const { cliente } = crearSupabaseFalso({
      ordenes_produccion: () => ({ data: null, error: { message: 'timeout' } }),
    });

    await expect(obtenerOrdenesCliente(cliente, CLIENTE_ID, 1)).rejects.toThrow(
      'No se pudo cargar el historial de órdenes',
    );
  });
});

function crearWrapper(cliente: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: cliente }, children);
  };
}

function crearClienteConsultas(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('panel de historial en la ficha del cliente', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => cleanup());

  it('muestra las cotizaciones y órdenes del cliente seleccionado', async () => {
    const falso = crearSupabaseFalso({
      pipeline: (registro) => paginar([filaPipeline(1)], registro),
      cotizacion_lineas: () => ({ data: [filaLinea('lin-1', 'cot-1')], error: null }),
      ordenes_produccion: (registro) => paginar([filaOrden(1)], registro),
      partidas_orden_produccion: () => ({ data: [filaPartida('par-1', 'ord-1')], error: null }),
    });
    obtenerClienteMock.mockReturnValue(falso.cliente);

    render(createElement(HistorialCliente, { clienteId: CLIENTE_ID }), {
      wrapper: crearWrapper(crearClienteConsultas()),
    });

    expect(await screen.findByText('OP-000001')).toBeTruthy();
    expect(await screen.findByText('OP-100001')).toBeTruthy();
    expect(screen.getByText(formatearMoneda(1000, 'MXN'))).toBeTruthy();
    // Ninguna consulta toca datos financieros ajenos a `ver_clientes`.
    expect(
      falso.consultas.some((consulta) =>
        ['cuentas_por_cobrar', 'pagos_ar', 'gastos'].includes(consulta.tabla),
      ),
    ).toBe(false);
  });

  it('expande una cotización para ver sus campos técnicos y una orden para ver partidas', async () => {
    obtenerClienteMock.mockReturnValue(
      crearSupabaseFalso({
        pipeline: (registro) => paginar([filaPipeline(1)], registro),
        cotizacion_lineas: () => ({ data: [filaLinea('lin-1', 'cot-1')], error: null }),
        ordenes_produccion: (registro) => paginar([filaOrden(1)], registro),
        partidas_orden_produccion: () => ({ data: [filaPartida('par-1', 'ord-1')], error: null }),
      }).cliente,
    );

    render(createElement(HistorialCliente, { clienteId: CLIENTE_ID }), {
      wrapper: crearWrapper(crearClienteConsultas()),
    });

    const botonCotizacion = await screen.findByRole('button', {
      name: 'Ver líneas de la cotización OP-000001',
    });
    expect(screen.queryByText('Placa cortada')).toBeNull();
    fireEvent.click(botonCotizacion);
    expect(screen.getByText('Placa cortada')).toBeTruthy();
    expect(screen.getByText(/Acero A36/)).toBeTruthy();
    expect(screen.getByText(/corte_laser/)).toBeTruthy();
    expect(botonCotizacion.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: 'Ver partidas de la orden OP-100001' }));
    expect(screen.getByText('PZA-001')).toBeTruthy();
    expect(screen.getByText(/scrap 1/)).toBeTruthy();
  });

  it('distingue historial vacío de error de carga', async () => {
    obtenerClienteMock.mockReturnValue(
      crearSupabaseFalso({
        pipeline: () => ({ data: [], error: null, count: 0 }),
        ordenes_produccion: () => ({ data: null, error: { message: 'timeout' } }),
      }).cliente,
    );

    render(createElement(HistorialCliente, { clienteId: CLIENTE_ID }), {
      wrapper: crearWrapper(crearClienteConsultas()),
    });

    expect(await screen.findByText('Sin cotizaciones')).toBeTruthy();
    const alerta = await screen.findByRole('alert');
    expect(alerta.textContent).toContain('No se pudieron cargar las órdenes del cliente.');
    expect(screen.queryByText('Sin órdenes')).toBeNull();
  });

  it('reintenta solo la consulta fallida desde el banner de error', async () => {
    let intentos = 0;
    obtenerClienteMock.mockReturnValue(
      crearSupabaseFalso({
        pipeline: () => ({ data: [], error: null, count: 0 }),
        ordenes_produccion: (registro) => {
          intentos += 1;
          return intentos === 1
            ? { data: null, error: { message: 'timeout' } }
            : paginar([filaOrden(1)], registro);
        },
        partidas_orden_produccion: () => ({ data: [], error: null }),
      }).cliente,
    );

    render(createElement(HistorialCliente, { clienteId: CLIENTE_ID }), {
      wrapper: crearWrapper(crearClienteConsultas()),
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('OP-100001')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('pagina cada entidad por separado', async () => {
    const cotizaciones = Array.from({ length: 7 }, (_, indice) => filaPipeline(indice + 1));
    const falso = crearSupabaseFalso({
      pipeline: (registro) => paginar(cotizaciones, registro),
      cotizacion_lineas: () => ({ data: [], error: null }),
      ordenes_produccion: (registro) => paginar([filaOrden(1)], registro),
      partidas_orden_produccion: () => ({ data: [], error: null }),
    });
    obtenerClienteMock.mockReturnValue(falso.cliente);

    render(createElement(HistorialCliente, { clienteId: CLIENTE_ID }), {
      wrapper: crearWrapper(crearClienteConsultas()),
    });

    fireEvent.click(
      await screen.findByRole('button', { name: 'Página siguiente de cotizaciones' }),
    );

    await waitFor(() =>
      expect(
        falso.consultas.filter((consulta) => consulta.tabla === 'pipeline'),
      ).toHaveLength(2),
    );
    const rangos = falso.consultas
      .filter((consulta) => consulta.tabla === 'pipeline')
      .map((consulta) => consulta.rango);
    expect(rangos).toEqual([
      [0, 4],
      [5, 9],
    ]);
    // Las órdenes no se vuelven a consultar: su paginación es independiente.
    expect(
      falso.consultas.filter((consulta) => consulta.tabla === 'ordenes_produccion'),
    ).toHaveLength(1);
    // La sección de órdenes no ofrece paginación con un solo registro.
    expect(screen.queryByRole('button', { name: 'Página siguiente de órdenes' })).toBeNull();
  });

  it('abre un solo canal Realtime por ficha y lo cierra al desmontar', async () => {
    const falso = crearSupabaseFalso({
      pipeline: () => ({ data: [], error: null, count: 0 }),
      ordenes_produccion: () => ({ data: [], error: null, count: 0 }),
    });
    obtenerClienteMock.mockReturnValue(falso.cliente);

    const vista = render(createElement(HistorialCliente, { clienteId: CLIENTE_ID }), {
      wrapper: crearWrapper(crearClienteConsultas()),
    });

    await screen.findByText('Sin cotizaciones');
    expect(falso.canalesCreados).toEqual([`historial-cliente-${CLIENTE_ID}`]);
    expect(falso.suscribir).toHaveBeenCalledTimes(1);

    vista.unmount();
    expect(falso.quitarCanal).toHaveBeenCalledTimes(1);
  });
});


describe('integridad del detalle histórico', () => {
  it('recupera todas las líneas incluso superando el límite de una respuesta', async () => {
    const filas=Array.from({length:1201},(_,i)=>filaLinea(`l-${i}`,'cot-1',{cantidad:1,precio_unitario:1,orden:i}));
    const {cliente}=crearSupabaseFalso({
      pipeline:()=>({data:[filaPipeline(1)],error:null,count:1}),
      cotizacion_lineas:(consulta)=>paginar(filas,consulta),
    });
    const resultado=await obtenerCotizacionesCliente(cliente,CLIENTE_ID);
    expect(resultado.registros[0]?.lineas).toHaveLength(1201);
    expect(resultado.registros[0]?.subtotal).toBe(1201);
  });
  it('redondea el subtotal al sumar importes sin perder fracciones entre líneas',async()=>{
    const {cliente}=crearSupabaseFalso({
      pipeline:()=>({data:[filaPipeline(1)],error:null,count:1}),
      cotizacion_lineas:()=>({data:[filaLinea('a','cot-1',{cantidad:1,precio_unitario:0.004}),filaLinea('b','cot-1',{cantidad:1,precio_unitario:0.004})],error:null,count:2}),
    });
    expect((await obtenerCotizacionesCliente(cliente,CLIENTE_ID)).registros[0]?.subtotal).toBe(0.01);
  });
  it.each([{moneda:'EUR'},{etapa:'desconocida'}])('rechaza datos desconocidos sin inventar su significado: %j', async extra=>{
    const {cliente}=crearSupabaseFalso({pipeline:()=>({data:[filaPipeline(1,extra)],error:null,count:1})});
    await expect(obtenerCotizacionesCliente(cliente,CLIENTE_ID)).rejects.toThrow(/no reconocida/);
  });
});
