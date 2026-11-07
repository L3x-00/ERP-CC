import { describe, expect, it } from 'vitest';

import { calcularCierreOrden, type DatosOrden } from '@/modulos/cierres/servicios/cierre-administrativo-servicio';

const base: DatosOrden = {
  orden: {
    id: 'orden-1',
    folio: 'OP-100',
    cliente_id: 'cliente-1',
    estado: 'completada',
    estado_sii: 'PRODUCCION_COMPLETADA',
    es_interna: false,
    fecha_fin: '2026-11-01T10:00:00.000Z',
    actualizado_en: '2026-11-01T10:00:00.000Z',
    propuesta_revision_id: 'rev-1',
  },
  cliente: 'Cliente Demo',
  partidas: [
    {
      id: 'partida-1',
      orden_id: 'orden-1',
      codigo_pieza: 'IT01',
      descripcion: 'Pieza',
      cantidad_solicitada: 10,
      cantidad_producida: 10,
    },
  ],
  sesiones: [
    {
      id: 'sesion-1',
      orden_id: 'orden-1',
      partida_id: 'partida-1',
      corrida_id: 'corrida-1',
      horas_netas: 5,
    },
  ],
  consumos: [
    {
      partida_id: 'partida-1',
      material_id: 'material-1',
      catalogo_material_id: null,
      unidad_base: 'm2',
      cantidad_usada: 4,
      cantidad_scrap: 1,
      costo_unitario_momento: 20,
    },
  ],
  retrabajos: [
    {
      orden_id: 'orden-1',
      partida_id: 'partida-1',
      sesion_id: 'sesion-1',
      material_id: 'material-1',
      cantidad_usada: 1,
      cantidad_scrap: 0,
      costo_unitario_momento: 20,
      minutos: 30,
    },
  ],
  items: [
    {
      id: 'item-1',
      revision_id: 'rev-1',
      codigo: 'IT01',
      descripcion: 'Pieza',
      cantidad: 10,
      precio_unitario: 200,
      es_descuento: false,
    },
  ],
  ruteo: [
    {
      item_id: 'item-1',
      proceso_id: 'proceso-1',
      total_horas: 8,
      tarifa_hora: 100,
      costo_total: 800,
      secuencia: 1,
    },
  ],
  costos: [
    { revision_id: 'rev-1', categoria: 'material', monto: 100 },
    { revision_id: 'rev-1', categoria: 'gastos_directos', monto: 50 },
  ],
  entregadoPorPartida: new Map([['partida-1', 6]]),
  tiemposPorSesion: new Map(),
  procesoPorCorrida: new Map([['corrida-1', 'proceso-1']]),
  nombreProceso: new Map([['proceso-1', 'Láser fibra']]),
  nombreMaterial: new Map([['material-1', 'LAM · Lámina']]),
  unidadMaterial: new Map([['material-1', 'm2']]),
};

describe('calcularCierreOrden', () => {
  it('compara costo, tiempo, material y entrega con la propuesta', () => {
    const cierre = calcularCierreOrden(base);

    // Estimado: ruteo 800 + material 100 + otros 50 = 950. Venta 10 × 200 = 2000.
    expect(cierre.costoEstimado).toBe(950);
    expect(cierre.venta).toBe(2000);
    // Real: mano de obra 5 h × 100 = 500 + retrabajo 0.5 h × 100 = 50.
    // Material (5 × 20) + retrabajo (1 × 20) = 120.
    expect(cierre.costoManoObraReal).toBe(550);
    expect(cierre.costoMaterialReal).toBe(120);
    expect(cierre.costoReal).toBe(670);
    expect(cierre.horasReales).toBe(5.5);
    expect(cierre.desviacionCosto).toBe(-29.5);
    expect(cierre.desviacionTiempo).toBe(-31.2);
    expect(cierre.margen).toBe(66.5);
    expect(cierre.cumplimientoEntrega).toBe(60);
    expect(cierre.nivel).toBe('ahorro');
    expect(cierre.horasRetrabajo).toBe(0.5);
    expect(cierre.costoRetrabajo).toBe(70);
    expect(cierre.materiales).toHaveLength(1);
    expect(cierre.materiales[0]).toMatchObject({
      clave: 'material-1',
      nombre: 'LAM · Lámina',
      unidad: 'm2',
      cantidadReal: 6,
      costoReal: 120,
    });
    expect(cierre.puntosCriticos.length).toBeGreaterThan(0);
  });

  it('costea una sola vez el tiempo total de una corrida compartida', () => {
    const shared: DatosOrden = {
      ...base,
      partidas: [
        base.partidas[0]!,
        {
          id: 'partida-2',
          orden_id: 'orden-1',
          codigo_pieza: 'IT02',
          descripcion: 'Pieza B',
          cantidad_solicitada: 20,
          cantidad_producida: 20,
        },
      ],
      sesiones: [{ ...base.sesiones[0]!, horas_netas: 1.5 }],
      consumos: [],
      retrabajos: [],
      entregadoPorPartida: new Map(),
      items: [
        base.items[0]!,
        {
          id: 'item-2',
          revision_id: 'rev-1',
          codigo: 'IT02',
          descripcion: 'Pieza B',
          cantidad: 20,
          precio_unitario: 100,
          es_descuento: false,
        },
      ],
      ruteo: [
        { ...base.ruteo[0]!, total_horas: 1, costo_total: 100 },
        { ...base.ruteo[0]!, item_id: 'item-2', total_horas: 1, costo_total: 100 },
      ],
      tiemposPorSesion: new Map([['sesion-1', [
        { sesion_id: 'sesion-1', partida_id: 'partida-1', piezas: 40, minutos: 30 },
        { sesion_id: 'sesion-1', partida_id: 'partida-2', piezas: 20, minutos: 30 },
      ]]]),
    };

    const cierre = calcularCierreOrden(shared);

    // 1.5 h de sesión × 100 = 150, una sola vez (no 1 h de minutos ni 2 h).
    expect(cierre.costoManoObraReal).toBe(150);
    expect(cierre.horasReales).toBe(1.5);
    expect(cierre.procesos.find((proceso) => proceso.nombre === 'Láser fibra')?.horasReales).toBe(1.5);
    expect(cierre.items[0]?.costoReal).toBe(75);
    expect(cierre.items[1]?.costoReal).toBe(75);
  });

  it('sin minutos individuales atribuye el tiempo compartido al ítem principal', () => {
    const cierre = calcularCierreOrden({
      ...base,
      partidas: [
        base.partidas[0]!,
        {
          id: 'partida-2',
          orden_id: 'orden-1',
          codigo_pieza: 'IT02',
          descripcion: 'Pieza B',
          cantidad_solicitada: 20,
          cantidad_producida: 20,
        },
      ],
      sesiones: [{ ...base.sesiones[0]!, horas_netas: 1.5 }],
      consumos: [],
      retrabajos: [],
      entregadoPorPartida: new Map(),
      items: [
        base.items[0]!,
        {
          id: 'item-2',
          revision_id: 'rev-1',
          codigo: 'IT02',
          descripcion: 'Pieza B',
          cantidad: 20,
          precio_unitario: 100,
          es_descuento: false,
        },
      ],
      ruteo: [
        { ...base.ruteo[0]!, total_horas: 1, costo_total: 100 },
        { ...base.ruteo[0]!, item_id: 'item-2', total_horas: 1, costo_total: 100 },
      ],
      tiemposPorSesion: new Map([['sesion-1', [
        { sesion_id: 'sesion-1', partida_id: 'partida-1', piezas: 40, minutos: null },
        { sesion_id: 'sesion-1', partida_id: 'partida-2', piezas: 20, minutos: null },
      ]]]),
    });

    expect(cierre.costoManoObraReal).toBe(150);
    expect(cierre.horasReales).toBe(1.5);
    expect(cierre.items[0]?.costoReal).toBe(150);
    expect(cierre.items[1]?.costoReal).toBe(0);
  });

  it('marca sobrecosto cuando el real supera el estimado en 10 % o más', () => {
    const cierre = calcularCierreOrden({
      ...base,
      ruteo: [{ ...base.ruteo[0]!, costo_total: 300, total_horas: 3 }],
      costos: [{ revision_id: 'rev-1', categoria: 'material', monto: 50 }],
      consumos: [{ ...base.consumos[0]!, cantidad_usada: 20, costo_unitario_momento: 20 }],
      sesiones: [{ ...base.sesiones[0]!, horas_netas: 6 }],
    });
    expect(cierre.desviacionCosto).toBeGreaterThan(10);
    expect(cierre.nivel).toBe('sobrecosto');
  });

  it('no inventa porcentajes cuando la propuesta no tiene costo estimado', () => {
    const cierre = calcularCierreOrden({
      ...base,
      items: [],
      ruteo: [],
      costos: [],
      consumos: [],
      retrabajos: [],
      sesiones: [],
      entregadoPorPartida: new Map(),
    });
    expect(cierre.costoEstimado).toBe(0);
    expect(cierre.desviacionCosto).toBeNull();
    expect(cierre.desviacionTiempo).toBeNull();
    expect(cierre.nivel).toBe('neutro');
  });
});
