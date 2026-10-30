import { describe, expect, it } from 'vitest';
import { estimarHorasProceso } from '@/modulos/produccion/servicios/espacio-operador-servicio';
import {
  HORAS_JORNADA_OPERADOR,
  accionPrincipal,
  agruparProcesosPorArea,
  agruparProcesosPorOrden,
  calcularDisponibilidadProcesos,
  construirDiasCalendario,
  derivarColumnaProceso,
  derivarUrgenciaProceso,
  diasEntreFechas,
  etiquetasProceso,
  inicioSemana,
  resumirEspacioOperador,
  resolverAreaRaiz,
  sumarDias,
  type AreaEspacioOperador,
  type ProcesoEspacioOperador,
  type ReclamoProcesoOperador,
} from '@/modulos/produccion/tipos/indice';

function crearReclamo(
  sobrescribir: Partial<ReclamoProcesoOperador> = {},
): ReclamoProcesoOperador {
  return {
    id: 'reclamo-1',
    ordenId: 'orden-1',
    partidaId: 'partida-1',
    metaProcesoId: 'meta-1',
    programacionId: null,
    operadorId: 'operador-1',
    fecha: '2026-10-26',
    turno: 'matutino',
    horasEstimadas: 2,
    estado: 'activo',
    creadoEn: '2026-10-25T10:00:00.000Z',
    actualizadoEn: '2026-10-25T10:00:00.000Z',
    ...sobrescribir,
  };
}

function crearProceso(
  sobrescribir: Partial<ProcesoEspacioOperador> = {},
): ProcesoEspacioOperador {
  return {
    id: 'partida-1:meta-1',
    ordenId: 'orden-1',
    folioOrden: 'OP-0001',
    folioSii: 'SII-0001',
    estadoOrden: 'programada',
    estadoSii: 'PLANIFICADA',
    prioridad: 'normal',
    clienteNombre: 'Cliente Uno',
    fechaCompromiso: '2026-10-28',
    fechaOperativa: '2026-10-26',
    notas: null,
    partidaId: 'partida-1',
    codigoPieza: 'PZ-001',
    descripcion: 'Charola',
    cantidadSolicitada: 10,
    cantidadProducida: 0,
    unidadMedida: 'pza',
    esExterno: false,
    proveedorExterno: null,
    material: null,
    areaCodigo: 'CNC',
    areaNombre: 'Corte CNC',
    areaMacro: 'METAL_MECANICA',
    areaColor: '#3b82f6',
    metaProcesoId: 'meta-1',
    procesoNombre: 'Corte',
    secuencia: 1,
    metaPiezas: 10,
    hechoPiezas: 0,
    pendientePiezas: 10,
    porcentaje: 0,
    esFinal: false,
    piezasDisponibles: null,
    procesoPrevioNombre: null,
    horasEstimadas: 2,
    programacion: null,
    reclamo: null,
    reclamadoPorMi: false,
    nombreReclamante: null,
    sesionActiva: null,
    ultimaSesion: null,
    sesiones: [],
    procesosRuteo: [],
    archivos: [],
    columna: 'bandeja',
    urgencia: 'normal',
    etiquetas: [],
    puedeIniciar: false,
    puedeReanudar: false,
    motivoNoInicia: null,
    ...sobrescribir,
  };
}

describe('derivarColumnaProceso', () => {
  const base = {
    estadoOrden: 'programada' as const,
    estadoSii: 'PLANIFICADA' as const,
    procesoCompleto: false,
    sesionActiva: false,
    sesionPausada: false,
    programacionEstado: null,
  };

  it('manda a Lista el proceso terminado o la orden completada', () => {
    expect(derivarColumnaProceso({ ...base, procesoCompleto: true })).toBe('lista');
    expect(derivarColumnaProceso({ ...base, estadoOrden: 'completada' })).toBe('lista');
  });

  it('manda a En proceso la sesión activa o la programación en marcha', () => {
    expect(derivarColumnaProceso({ ...base, sesionActiva: true })).toBe('en_proceso');
    expect(derivarColumnaProceso({ ...base, programacionEstado: 'en_proceso' })).toBe('en_proceso');
  });

  it('manda a Pausada la sesión pausada o la programación bloqueada', () => {
    expect(derivarColumnaProceso({ ...base, sesionPausada: true })).toBe('pausada');
    expect(derivarColumnaProceso({ ...base, programacionEstado: 'bloqueada' })).toBe('pausada');
    expect(derivarColumnaProceso({ ...base, estadoOrden: 'pausada' })).toBe('pausada');
  });

  it('manda a Aprobada la orden en borrador o confirmada por el SII', () => {
    expect(derivarColumnaProceso({ ...base, estadoOrden: 'borrador' })).toBe('aprobada');
    expect(derivarColumnaProceso({ ...base, estadoSii: 'CONFIRMADA' })).toBe('aprobada');
  });

  it('deja en Bandeja el resto, sin inventar columnas', () => {
    expect(derivarColumnaProceso(base)).toBe('bandeja');
  });
});

describe('calcularDisponibilidadProcesos', () => {
  it('no restringe la primera operación del ruteo', () => {
    const disponible = calcularDisponibilidadProcesos([
      { id: 'corte', secuencia: 1, nombre: 'Corte', hechoPiezas: 100 },
      { id: 'doblado', secuencia: 2, nombre: 'Doblado', hechoPiezas: 0 },
    ]);

    expect(disponible.get('corte')).toEqual({ disponiblePiezas: null, procesoPrevioNombre: null });
  });

  it('deja avanzar por lotes aunque el proceso anterior siga en curso', () => {
    const disponible = calcularDisponibilidadProcesos([
      { id: 'corte', secuencia: 1, nombre: 'Corte', hechoPiezas: 100 },
      { id: 'doblado', secuencia: 2, nombre: 'Doblado', hechoPiezas: 0 },
    ]);

    expect(disponible.get('doblado')).toEqual({
      disponiblePiezas: 100,
      procesoPrevioNombre: 'Corte',
    });
  });

  it('descuenta las piezas que el proceso actual ya consumió del previo', () => {
    const disponible = calcularDisponibilidadProcesos([
      { id: 'corte', secuencia: 1, nombre: 'Corte', hechoPiezas: 100 },
      { id: 'doblado', secuencia: 2, nombre: 'Doblado', hechoPiezas: 40 },
    ]);

    expect(disponible.get('doblado')?.disponiblePiezas).toBe(60);
  });

  it('bloquea con cero cuando el proceso previo no ha terminado piezas', () => {
    const disponible = calcularDisponibilidadProcesos([
      { id: 'corte', secuencia: 1, nombre: 'Corte', hechoPiezas: 0 },
      { id: 'doblado', secuencia: 2, nombre: 'Doblado', hechoPiezas: 0 },
    ]);

    expect(disponible.get('doblado')?.disponiblePiezas).toBe(0);
  });

  it('no devuelve disponibilidad negativa si el actual ya consumió el lote', () => {
    const disponible = calcularDisponibilidadProcesos([
      { id: 'corte', secuencia: 1, nombre: 'Corte', hechoPiezas: 100 },
      { id: 'doblado', secuencia: 2, nombre: 'Doblado', hechoPiezas: 100 },
    ]);

    expect(disponible.get('doblado')?.disponiblePiezas).toBe(0);
  });
});

describe('agruparProcesosPorOrden', () => {
  it('junta los ítems y procesos de una misma orden en un solo grupo', () => {
    const grupos = agruparProcesosPorOrden([
      crearProceso({
        id: 'partida-1:meta-1', partidaId: 'partida-1', codigoPieza: 'IT01',
        secuencia: 1, procesoNombre: 'Corte',
      }),
      crearProceso({
        id: 'partida-1:meta-2', partidaId: 'partida-1', codigoPieza: 'IT01',
        secuencia: 2, procesoNombre: 'Doblado',
      }),
      crearProceso({
        id: 'partida-2:meta-1', partidaId: 'partida-2', codigoPieza: 'IT02',
        secuencia: 1, procesoNombre: 'Láser',
      }),
    ]);

    expect(grupos).toHaveLength(1);
    expect(grupos[0]?.items.map((item) => item.codigoPieza)).toEqual(['IT01', 'IT02']);
    expect(grupos[0]?.procesos).toHaveLength(3);
    expect(grupos[0]?.items[0]?.procesos.map((proceso) => proceso.procesoNombre))
      .toEqual(['Corte', 'Doblado']);
  });

  it('separa órdenes distintas y ordena primero la más urgente', () => {
    const grupos = agruparProcesosPorOrden([
      crearProceso({
        ordenId: 'orden-2', folioOrden: 'OP-0002', partidaId: 'partida-3',
        urgencia: 'normal', fechaCompromiso: '2026-11-30',
      }),
      crearProceso({
        ordenId: 'orden-1', folioOrden: 'OP-0001', partidaId: 'partida-1',
        urgencia: 'urgente', fechaCompromiso: '2026-10-26',
      }),
    ]);

    expect(grupos.map((grupo) => grupo.folioOrden)).toEqual(['OP-0001', 'OP-0002']);
  });

  it('usa el avance acumulado de la partida, no el de la operación visible', () => {
    const grupos = agruparProcesosPorOrden([
      crearProceso({
        partidaId: 'partida-1', cantidadProducida: 4, cantidadSolicitada: 10,
        hechoPiezas: 0, metaPiezas: 10,
      }),
    ]);

    expect(grupos[0]?.items[0]?.cantidadProducida).toBe(4);
    expect(grupos[0]?.items[0]?.porcentaje).toBe(40);
    expect(grupos[0]?.porcentaje).toBe(40);
  });

  it('no inventa ítems sin procesos en el conjunto recibido', () => {
    const grupos = agruparProcesosPorOrden([
      crearProceso({ id: 'a', partidaId: 'partida-1', codigoPieza: 'IT01' }),
    ]);

    expect(grupos[0]?.items).toHaveLength(1);
    expect(grupos[0]?.items[0]?.procesos).toHaveLength(1);
  });
});

describe('derivarUrgenciaProceso', () => {
  const hoy = '2026-10-25';

  it('marca vencida la fecha ya pasada', () => {
    expect(derivarUrgenciaProceso('2026-10-24', 'normal', hoy)).toBe('vencida');
  });

  it('marca urgente la prioridad urgente o el compromiso de hoy/mañana', () => {
    expect(derivarUrgenciaProceso('2026-11-30', 'urgente', hoy)).toBe('urgente');
    expect(derivarUrgenciaProceso('2026-10-25', 'normal', hoy)).toBe('urgente');
    expect(derivarUrgenciaProceso('2026-10-26', 'normal', hoy)).toBe('urgente');
  });

  it('marca próxima la fecha dentro de 3 días o la prioridad alta', () => {
    expect(derivarUrgenciaProceso('2026-10-28', 'normal', hoy)).toBe('proxima');
    expect(derivarUrgenciaProceso('2026-11-30', 'alta', hoy)).toBe('proxima');
  });

  it('deja normal el resto', () => {
    expect(derivarUrgenciaProceso('2026-11-30', 'normal', hoy)).toBe('normal');
  });
});

describe('utilidades de fecha', () => {
  it('suma días cruzando mes y año sin zonas horarias', () => {
    expect(sumarDias('2026-10-31', 1)).toBe('2026-11-01');
    expect(sumarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(sumarDias('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('calcula el lunes de la semana (domingo cuenta como cierre)', () => {
    expect(inicioSemana('2026-10-25')).toBe('2026-10-19');
    expect(inicioSemana('2026-10-26')).toBe('2026-10-26');
  });

  it('cuenta días entre fechas ISO', () => {
    expect(diasEntreFechas('2026-10-25', '2026-10-28')).toBe(3);
    expect(diasEntreFechas('2026-10-28', '2026-10-25')).toBe(-3);
  });
});

describe('construirDiasCalendario', () => {
  it('suma solo horas reclamadas, ordena y calcula el saldo de 8 h', () => {
    const procesos = [
      crearProceso({ id: 'a', reclamo: crearReclamo({ fecha: '2026-10-26', horasEstimadas: 3 }) }),
      crearProceso({ id: 'b', reclamo: crearReclamo({ id: 'reclamo-2', fecha: '2026-10-26', horasEstimadas: 2.5 }) }),
      crearProceso({ id: 'c', reclamo: crearReclamo({ id: 'reclamo-3', fecha: '2026-10-27', horasEstimadas: 8 }) }),
      crearProceso({ id: 'd', reclamo: null }),
    ];

    const dias = construirDiasCalendario(['2026-10-26', '2026-10-27'], procesos, '2026-10-27');

    expect(dias[0].horasReclamadas).toBe(5.5);
    expect(dias[0].horasLibres).toBe(2.5);
    expect(dias[0].esHoy).toBe(false);
    expect(dias[0].procesos.map((proceso) => proceso.id)).toEqual(['a', 'b']);
    expect(dias[1].horasReclamadas).toBe(HORAS_JORNADA_OPERADOR);
    expect(dias[1].horasLibres).toBe(0);
    expect(dias[1].esHoy).toBe(true);
  });

  it('nunca devuelve horas libres negativas', () => {
    const procesos = [
      crearProceso({ id: 'a', reclamo: crearReclamo({ fecha: '2026-10-26', horasEstimadas: 6 }) }),
      crearProceso({ id: 'b', reclamo: crearReclamo({ id: 'reclamo-2', fecha: '2026-10-26', horasEstimadas: 6 }) }),
    ];

    const [dia] = construirDiasCalendario(['2026-10-26'], procesos, '2026-10-25');

    expect(dia.horasReclamadas).toBe(12);
    expect(dia.horasLibres).toBe(0);
  });
});

describe('áreas y etiquetas', () => {
  const areas: AreaEspacioOperador[] = [
    { codigo: 'METAL_MECANICA', nombre: 'Metal mecánica', padreCodigo: null, areaPlaneacion: 'METAL_MECANICA', colorHex: '#111111' },
    { codigo: 'CNC', nombre: 'Corte CNC', padreCodigo: 'METAL_MECANICA', areaPlaneacion: 'METAL_MECANICA', colorHex: '#222222' },
    { codigo: 'LASER', nombre: 'Corte láser', padreCodigo: 'METAL_MECANICA', areaPlaneacion: 'METAL_MECANICA', colorHex: '#333333' },
  ];

  it('resuelve el área raíz caminando la cadena de ancestros', () => {
    expect(resolverAreaRaiz(areas, 'CNC')?.codigo).toBe('METAL_MECANICA');
    expect(resolverAreaRaiz(areas, 'METAL_MECANICA')?.codigo).toBe('METAL_MECANICA');
    expect(resolverAreaRaiz(areas, 'INEXISTENTE')).toBeNull();
    expect(resolverAreaRaiz(areas, null)).toBeNull();
  });

  it('no entra en bucle si el catálogo tiene un ciclo', () => {
    const ciclo: AreaEspacioOperador[] = [
      { codigo: 'A', nombre: 'A', padreCodigo: 'B', areaPlaneacion: null, colorHex: null },
      { codigo: 'B', nombre: 'B', padreCodigo: 'A', areaPlaneacion: null, colorHex: null },
    ];

    expect(resolverAreaRaiz(ciclo, 'A')).not.toBeNull();
  });

  it('agrupa por área macro, suma horas y cuenta urgentes', () => {
    const procesos = [
      crearProceso({ id: 'a', areaMacro: 'METAL_MECANICA', horasEstimadas: 2, urgencia: 'urgente' }),
      crearProceso({ id: 'b', areaMacro: 'METAL_MECANICA', horasEstimadas: 1.5, urgencia: 'normal' }),
      crearProceso({ id: 'c', areaMacro: null, areaCodigo: 'SUELDA', areaNombre: 'Suelda', horasEstimadas: 1, urgencia: 'vencida' }),
    ];

    const grupos = agruparProcesosPorArea(procesos, areas);

    expect(grupos).toHaveLength(2);
    expect(grupos[0]).toMatchObject({
      codigo: 'METAL_MECANICA',
      nombre: 'Metal mecánica',
      horas: 3.5,
      urgentes: 1,
    });
    // «Sin área» siempre queda al final.
    expect(grupos[1]).toMatchObject({ codigo: null, nombre: 'Suelda', horas: 1, urgentes: 1 });
  });

  it('etiqueta urgencia, externo y proceso tomado sin duplicar', () => {
    const vencido = crearProceso({
      urgencia: 'vencida',
      esExterno: true,
      reclamo: crearReclamo({ operadorId: 'otro' }),
      reclamadoPorMi: false,
    });

    expect(etiquetasProceso(vencido)).toEqual(['Vencida', 'Externo', 'Tomado']);
  });
});

describe('resumirEspacioOperador', () => {
  it('cuenta columnas, urgentes y horas reservadas para hoy', () => {
    const procesos = [
      crearProceso({ id: 'a', columna: 'aprobada', urgencia: 'urgente', reclamo: crearReclamo({ fecha: '2026-10-25', horasEstimadas: 1.25 }) }),
      crearProceso({ id: 'b', columna: 'bandeja' }),
      crearProceso({ id: 'c', columna: 'en_proceso', urgencia: 'vencida' }),
      crearProceso({ id: 'd', columna: 'pausada' }),
      crearProceso({ id: 'e', columna: 'lista' }),
    ];

    expect(resumirEspacioOperador(procesos, '2026-10-25')).toEqual({
      total: 5,
      aprobadas: 1,
      enBandeja: 1,
      enProceso: 1,
      pausadas: 1,
      listas: 1,
      urgentes: 2,
      horasReclamadasHoy: 1.25,
    });
  });
});

describe('estimarHorasProceso', () => {
  it('usa las horas ya programadas por Planeación', () => {
    expect(estimarHorasProceso({ tiempo_estimado_minutos: 600 }, { horasEstimadas: 3.5 }, 2, true)).toBe(3.5);
  });

  it('reparte el tiempo estimado de la partida entre sus procesos', () => {
    expect(estimarHorasProceso({ tiempo_estimado_minutos: 600 }, null, 4, true)).toBe(2.5);
  });

  it('deja el mínimo de 0.25 h para no reservar fracciones imposibles', () => {
    expect(estimarHorasProceso({ tiempo_estimado_minutos: 1 }, null, 10, true)).toBe(0.25);
  });
});

describe('accionPrincipal', () => {
  it('prioriza la sesión activa, luego reanudar, iniciar y reclamar', () => {
    expect(accionPrincipal(crearProceso({ sesionActiva: {} as never })).tipo).toBe('sesion');
    expect(accionPrincipal(crearProceso({ puedeReanudar: true })).tipo).toBe('reanudar');
    expect(accionPrincipal(crearProceso({ puedeIniciar: true })).tipo).toBe('iniciar');
    expect(accionPrincipal(crearProceso()).tipo).toBe('reclamar');
  });

  it('bloquea el proceso tomado por otro operador', () => {
    const accion = accionPrincipal(crearProceso({
      reclamo: crearReclamo({ operadorId: 'otro' }),
    }));

    expect(accion).toMatchObject({ tipo: 'bloqueada', etiqueta: 'Tomado', deshabilitada: true });
  });

  it('no ofrece reclamar una operación ya completada', () => {
    const accion = accionPrincipal(crearProceso({ columna: 'lista', procesoNombre: 'Corte' }));

    expect(accion).toMatchObject({ tipo: 'bloqueada', etiqueta: 'Completado' });
  });
});
