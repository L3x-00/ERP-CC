import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Oportunidad } from '@/modulos/pipeline/tipos/indice';

const {
  obtenerUsuarioMock,
  canMock,
  registrarLogMock,
  insertMock,
  singleMock,
  updateMock,
  eqMock,
  seleccionMaybeSingleMock,
  generarFolioMock,
  obtenerClienteParaRfqMock,
  obtenerOportunidadMock,
  resolverContactoMock,
  retirarContactoMock,
} = vi.hoisted(() => ({
  obtenerUsuarioMock: vi.fn(),
  canMock: vi.fn(),
  registrarLogMock: vi.fn(),
  insertMock: vi.fn(),
  singleMock: vi.fn(),
  updateMock: vi.fn(),
  eqMock: vi.fn(),
  seleccionMaybeSingleMock: vi.fn(),
  generarFolioMock: vi.fn(),
  obtenerClienteParaRfqMock: vi.fn(),
  obtenerOportunidadMock: vi.fn(),
  resolverContactoMock: vi.fn(),
  retirarContactoMock: vi.fn(),
}));

vi.mock('@/modulos/autenticacion/servicios/obtener-usuario-servidor', () => ({
  obtenerUsuarioServidor: () => obtenerUsuarioMock(),
}));
vi.mock('@/nucleo/autenticacion/verificar-permiso', () => ({
  can: (...args: unknown[]) => canMock(...args),
}));
vi.mock('@/nucleo/auditoria/registrar-log', () => ({
  registrarLog: (...args: unknown[]) => registrarLogMock(...args),
  nuevoCorrelationId: () => 'corr-rfq-1',
}));
vi.mock('@/nucleo/supabase/servidor', () => ({
  crearClienteSupabaseServidor: async () => ({ marca: 'servidor' }),
}));
vi.mock('@/nucleo/supabase/admin', () => ({
  crearClienteSupabaseAdmin: () => ({
    from: (tabla: string) => ({
      insert: (valores: unknown) => {
        insertMock(valores);
        return { select: () => ({ single: () => singleMock() }) };
      },
      update: (valores: unknown) => {
        updateMock(valores);
        return { eq: (columna: string, valor: string) => eqMock(columna, valor) };
      },
      select: () => {
        const cadena = {
          eq: () => cadena,
          maybeSingle: () => seleccionMaybeSingleMock(tabla),
        };
        return cadena;
      },
    }),
  }),
}));
vi.mock('@/modulos/pipeline/servicios/generar-folio-op', () => ({
  generarFolioOp: () => generarFolioMock(),
}));
vi.mock('@/modulos/pipeline/servicios/obtener-cliente-para-rfq', () => ({
  obtenerClienteParaRfq: (...args: unknown[]) => obtenerClienteParaRfqMock(...args),
}));
vi.mock('@/modulos/pipeline/servicios/obtener-oportunidad-por-id', () => ({
  obtenerOportunidadPorId: (...args: unknown[]) => obtenerOportunidadMock(...args),
}));
vi.mock('@/modulos/rfq/servicios/contacto-vigente-cliente', () => ({
  resolverContactoVigenteCliente: (...args: unknown[]) => resolverContactoMock(...args),
  retirarContactoRecienCreado: (...args: unknown[]) => retirarContactoMock(...args),
}));

import { crearProspectoAccion } from '@/modulos/pipeline/acciones/crear-prospecto';
import { asignarClienteOportunidadAccion } from '@/modulos/pipeline/acciones/asignar-cliente-oportunidad';

const OPORTUNIDAD_ID = '11111111-1111-4111-8111-111111111111';
const CLIENTE_ID = '33333333-3333-4333-8333-333333333333';
const VENDEDOR_ID = '22222222-2222-4222-8222-222222222222';
const RESPONSABLE_ID = '44444444-4444-4444-8444-444444444444';
const CONTACTO_ID = '55555555-5555-4555-8555-555555555555';

const VENDEDOR = {
  id: VENDEDOR_ID,
  email: 'v@cc.mx',
  nombreCompleto: 'Vendedor Uno',
  rol: 'vendedor' as const,
  activo: true,
  creadoEn: '2026-01-01T00:00:00Z',
  actualizadoEn: '2026-01-01T00:00:00Z',
  permisos: ['ver_clientes'],
};

const OPORTUNIDAD: Oportunidad = {
  id: OPORTUNIDAD_ID,
  folioOp: 'OP-000001',
  folioCnc: null,
  folioRfq: 'RFQ-0926_05',
  estadoRfq: 'CONVERTED',
  nombreContacto: 'Ana Pérez',
  empresa: 'Metanor',
  correo: null,
  telefono: null,
  clienteId: null,
  contactoId: null,
  vendedorId: VENDEDOR_ID,
  responsableId: null,
  canal: null,
  fechaSolicitud: null,
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
  creadoEn: '2026-09-01T10:00:00Z',
  actualizadoEn: '2026-09-01T10:00:00Z',
};

const ALTA_BASE = { nombreContacto: 'Ana Pérez', empresa: 'Metanor', telefono: '664 000 0000' };

beforeEach(() => {
  vi.clearAllMocks();
  obtenerUsuarioMock.mockResolvedValue(VENDEDOR);
  canMock.mockImplementation(async (_usuario: unknown, permiso: string) => permiso === 'rfq_crear');
  generarFolioMock.mockResolvedValue('OP-000001');
  singleMock.mockResolvedValue({ data: { id: OPORTUNIDAD_ID }, error: null });
  eqMock.mockResolvedValue({ error: null });
  seleccionMaybeSingleMock.mockImplementation(async (tabla: string) => {
    if (tabla === 'usuarios') {
      return { data: { id: RESPONSABLE_ID, activo: true }, error: null };
    }
    if (tabla === 'contactos_cliente') {
      return { data: { id: CONTACTO_ID, cliente_id: CLIENTE_ID, activo: true }, error: null };
    }
    return { data: null, error: null };
  });
  obtenerOportunidadMock.mockResolvedValue({ oportunidad: OPORTUNIDAD, lineas: [] });
  obtenerClienteParaRfqMock.mockResolvedValue({ id: CLIENTE_ID, condicionesPago: '30_dias' });
  // Por defecto el cliente no tiene contacto vigente que sugerir.
  resolverContactoMock.mockResolvedValue({ estado: 'sin_datos' });
  retirarContactoMock.mockResolvedValue(undefined);
});

describe('crearProspectoAccion con cliente del catálogo (RFQ-02/03)', () => {
  it('rechaza antes de generar folio cuando falta rfq_crear', async () => {
    canMock.mockResolvedValue(false);

    const respuesta = await crearProspectoAccion(ALTA_BASE);

    expect(respuesta).toEqual({ exito: false, error: 'Sin permiso para crear RFQ' });
    expect(generarFolioMock).not.toHaveBeenCalled();
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('inicia el RFQ como INCOMPLETE con la fecha de registro del sistema', async () => {
    await crearProspectoAccion({
      ...ALTA_BASE,
      fechaRequerida: '2026-11-20',
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        estado_rfq: 'INCOMPLETE',
        fecha_requerida: null,
        fecha_solicitud: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      }),
    );
    expect((insertMock.mock.calls[0]?.[0] as Record<string, unknown>).fecha_solicitud).not.toBe(
      '2026-11-20',
    );
    expect(registrarLogMock).toHaveBeenCalledWith(
      VENDEDOR,
      'crear',
      'pipeline',
      OPORTUNIDAD_ID,
      { folioOp: 'OP-000001', clienteId: null, estadoRfq: 'INCOMPLETE' },
      'corr-rfq-1',
    );
  });

  it('ignora PO y horas estimadas legadas aunque un cliente antiguo las envíe', async () => {
    await crearProspectoAccion({
      ...ALTA_BASE,
      poCliente: 'PO-LEGACY',
      horasEstimadas: 8,
    });

    const insercion = insertMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insercion.po_cliente).toBeNull();
    expect(insercion.horas_estimadas).toBeNull();
  });

  it('liga el cliente y hereda sus condiciones de pago', async () => {
    const respuesta = await crearProspectoAccion({ ...ALTA_BASE, clienteId: CLIENTE_ID });

    expect(respuesta.exito).toBe(true);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ cliente_id: CLIENTE_ID, condiciones_pago: '30_dias' }),
    );
  });

  it('no pisa las condiciones capturadas a mano', async () => {
    await crearProspectoAccion({
      ...ALTA_BASE,
      clienteId: CLIENTE_ID,
      condicionesPago: 'contado',
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ cliente_id: CLIENTE_ID, condiciones_pago: 'contado' }),
    );
  });

  it('sin cliente: la RFQ se crea igual, sin ligar nada', async () => {
    const respuesta = await crearProspectoAccion(ALTA_BASE);

    expect(respuesta.exito).toBe(true);
    expect(obtenerClienteParaRfqMock).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ cliente_id: null, condiciones_pago: null }),
    );
  });

  it('cliente que RLS oculta: rechaza sin insertar', async () => {
    obtenerClienteParaRfqMock.mockResolvedValue(null);

    const respuesta = await crearProspectoAccion({ ...ALTA_BASE, clienteId: CLIENTE_ID });

    expect(respuesta).toEqual({ exito: false, error: 'Cliente no válido' });
    expect(insertMock).not.toHaveBeenCalled();
    expect(registrarLogMock).not.toHaveBeenCalled();
  });
});

describe('crearProspectoAccion — Resumen capturado desde el alta (obs. cliente)', () => {
  it('persiste canal y descripción, y usa fecha y responsable del servidor', async () => {
    await crearProspectoAccion({
      ...ALTA_BASE,
      canal: 'WHATSAPP',
      fechaSolicitud: '2026-10-10',
      descripcionGeneral: 'Corte de lámina calibre 14',
      responsableId: RESPONSABLE_ID,
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        canal: 'WHATSAPP',
        fecha_solicitud: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
        descripcion_general: 'Corte de lámina calibre 14',
        responsable_id: VENDEDOR.id,
      }),
    );
    const insercion = insertMock.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(insercion.fecha_solicitud).not.toBe('2026-10-10');
    expect(insercion.responsable_id).not.toBe(RESPONSABLE_ID);
  });

  it('traduce el rechazo del canal fuera del catálogo', async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { message: 'canal_rfq_no_catalogado' },
    });

    const respuesta = await crearProspectoAccion({ ...ALTA_BASE, canal: 'NO_EXISTE' });

    expect(respuesta).toEqual({ exito: false, error: 'Selecciona un canal vigente del catálogo' });
  });

  it('traduce la exigencia de detalle del canal "Otro"', async () => {
    singleMock.mockResolvedValue({
      data: null,
      error: { message: 'canal_otro_requiere_detalle' },
    });

    const respuesta = await crearProspectoAccion({ ...ALTA_BASE, canal: 'OTRO' });

    expect(respuesta).toEqual({ exito: false, error: 'Escribe el detalle del canal Otro' });
  });

  it('rechaza un contacto que no pertenece al cliente', async () => {
    seleccionMaybeSingleMock.mockImplementation(async (tabla: string) =>
      tabla === 'contactos_cliente'
        ? { data: { id: CONTACTO_ID, cliente_id: 'otro-cliente', activo: true }, error: null }
        : { data: null, error: null },
    );

    const respuesta = await crearProspectoAccion({
      ...ALTA_BASE,
      clienteId: CLIENTE_ID,
      contactoId: CONTACTO_ID,
    });

    expect(respuesta).toEqual({ exito: false, error: 'El contacto no pertenece al cliente' });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('liga el contacto registrado del cliente', async () => {
    await crearProspectoAccion({
      ...ALTA_BASE,
      clienteId: CLIENTE_ID,
      contactoId: CONTACTO_ID,
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ cliente_id: CLIENTE_ID, contacto_id: CONTACTO_ID }),
    );
  });

  it('ignora el responsable recibido y asigna al usuario autenticado', async () => {
    seleccionMaybeSingleMock.mockImplementation(async (tabla: string) =>
      tabla === 'usuarios'
        ? { data: { id: RESPONSABLE_ID, activo: false }, error: null }
        : { data: null, error: null },
    );

    const respuesta = await crearProspectoAccion({ ...ALTA_BASE, responsableId: RESPONSABLE_ID });

    expect(respuesta.exito).toBe(true);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ responsable_id: VENDEDOR.id }),
    );
  });
});

describe('crearProspectoAccion — próxima acción capturada en el alta (ajuste cliente)', () => {
  const fechaFutura = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

  function conCatalogos(opciones: { accion: unknown }): void {
    seleccionMaybeSingleMock.mockImplementation(async (tabla: string) => {
      if (tabla === 'catalogo_proximas_acciones') {
        return { data: opciones.accion, error: null };
      }
      if (tabla === 'usuarios') {
        return { data: { id: RESPONSABLE_ID, activo: true }, error: null };
      }
      return { data: null, error: null };
    });
  }

  it('persiste la próxima acción completa junto con el RFQ', async () => {
    conCatalogos({ accion: { codigo: 'FOLLOW_UP', es_otro: false, activo: true } });

    await crearProspectoAccion({
      ...ALTA_BASE,
      proximaAccionCodigo: 'FOLLOW_UP',
      fechaProximaAccion: fechaFutura,
      responsableProximaAccionId: RESPONSABLE_ID,
    });

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        proxima_accion_codigo: 'FOLLOW_UP',
        fecha_proxima_accion: fechaFutura,
        responsable_proxima_accion_id: RESPONSABLE_ID,
      }),
    );
  });

  it('exige la próxima acción completa (acción + fecha + responsable)', async () => {
    const respuesta = await crearProspectoAccion({
      ...ALTA_BASE,
      proximaAccionCodigo: 'FOLLOW_UP',
      fechaProximaAccion: fechaFutura,
    });

    expect(respuesta).toEqual({
      exito: false,
      error: 'Completa la próxima acción: acción, fecha y responsable de la acción',
    });
    expect(insertMock).not.toHaveBeenCalled();
  });

  it('rechaza una acción fuera del catálogo vigente', async () => {
    const respuesta = await crearProspectoAccion({
      ...ALTA_BASE,
      proximaAccionCodigo: 'NO_EXISTE',
      fechaProximaAccion: fechaFutura,
      responsableProximaAccionId: RESPONSABLE_ID,
    });

    expect(respuesta).toEqual({
      exito: false,
      error: 'La próxima acción seleccionada no está vigente',
    });
  });

  it('la acción "Otro" exige detalle', async () => {
    conCatalogos({ accion: { codigo: 'OTRO', es_otro: true, activo: true } });

    const respuesta = await crearProspectoAccion({
      ...ALTA_BASE,
      proximaAccionCodigo: 'OTRO',
      fechaProximaAccion: fechaFutura,
      responsableProximaAccionId: RESPONSABLE_ID,
    });

    expect(respuesta).toEqual({
      exito: false,
      error: 'Describe la acción "Otro" de la próxima acción',
    });
  });

  it('rechaza una fecha de próxima acción en el pasado', async () => {
    conCatalogos({ accion: { codigo: 'FOLLOW_UP', es_otro: false, activo: true } });

    const respuesta = await crearProspectoAccion({
      ...ALTA_BASE,
      proximaAccionCodigo: 'FOLLOW_UP',
      fechaProximaAccion: '2020-01-01',
      responsableProximaAccionId: RESPONSABLE_ID,
    });

    expect(respuesta).toEqual({
      exito: false,
      error: 'La fecha de la próxima acción no puede estar en el pasado',
    });
  });
});

describe('asignarClienteOportunidadAccion', () => {
  it('liga el cliente y hereda condiciones cuando se pide', async () => {
    const respuesta = await asignarClienteOportunidadAccion({
      id: OPORTUNIDAD_ID,
      clienteId: CLIENTE_ID,
      heredarCondiciones: true,
    });

    expect(respuesta).toEqual({
      exito: true,
      datos: { clienteId: CLIENTE_ID, condicionesPago: '30_dias' },
    });
    expect(updateMock).toHaveBeenCalledWith({
      cliente_id: CLIENTE_ID,
      condiciones_pago: '30_dias',
    });
    expect(registrarLogMock).toHaveBeenCalledTimes(1);
  });

  it('sin herencia conserva las condiciones negociadas de la oportunidad', async () => {
    obtenerOportunidadMock.mockResolvedValue({
      oportunidad: { ...OPORTUNIDAD, condicionesPago: 'contado' },
      lineas: [],
    });

    const respuesta = await asignarClienteOportunidadAccion({
      id: OPORTUNIDAD_ID,
      clienteId: CLIENTE_ID,
      heredarCondiciones: false,
    });

    expect(respuesta.exito).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({
      cliente_id: CLIENTE_ID,
      condiciones_pago: 'contado',
    });
  });

  it('desliga con clienteId null sin consultar el catálogo', async () => {
    const respuesta = await asignarClienteOportunidadAccion({
      id: OPORTUNIDAD_ID,
      clienteId: null,
      heredarCondiciones: true,
    });

    expect(respuesta.exito).toBe(true);
    expect(obtenerClienteParaRfqMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith({ cliente_id: null, condiciones_pago: null });
  });

  it('cliente que RLS oculta: rechaza sin escribir', async () => {
    obtenerClienteParaRfqMock.mockResolvedValue(null);

    const respuesta = await asignarClienteOportunidadAccion({
      id: OPORTUNIDAD_ID,
      clienteId: CLIENTE_ID,
      heredarCondiciones: true,
    });

    expect(respuesta).toEqual({ exito: false, error: 'Cliente no válido' });
    expect(updateMock).not.toHaveBeenCalled();
    expect(registrarLogMock).not.toHaveBeenCalled();
  });

  it('oportunidad ajena sin alcance de equipo: no revela que existe', async () => {
    obtenerOportunidadMock.mockResolvedValue({
      oportunidad: { ...OPORTUNIDAD, vendedorId: 'otro-vendedor' },
      lineas: [],
    });

    const respuesta = await asignarClienteOportunidadAccion({
      id: OPORTUNIDAD_ID,
      clienteId: CLIENTE_ID,
      heredarCondiciones: true,
    });

    expect(respuesta).toEqual({ exito: false, error: 'No encontrada' });
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('oportunidad cerrada: no se reescribe el histórico', async () => {
    obtenerOportunidadMock.mockResolvedValue({
      oportunidad: { ...OPORTUNIDAD, estadoRfq: 'CLOSED' },
      lineas: [],
    });

    const respuesta = await asignarClienteOportunidadAccion({
      id: OPORTUNIDAD_ID,
      clienteId: CLIENTE_ID,
      heredarCondiciones: true,
    });

    expect(respuesta.exito).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('sin sesión: rechaza antes de tocar la base de datos', async () => {
    obtenerUsuarioMock.mockResolvedValue(null);

    const respuesta = await asignarClienteOportunidadAccion({
      id: OPORTUNIDAD_ID,
      clienteId: CLIENTE_ID,
      heredarCondiciones: true,
    });

    expect(respuesta).toEqual({ exito: false, error: 'No autorizado' });
    expect(obtenerOportunidadMock).not.toHaveBeenCalled();
  });
});

describe('crearProspectoAccion — contacto vigente del cliente por defecto', () => {
  function conPermisos(...permisos: string[]): void {
    canMock.mockImplementation(async (_usuario: unknown, permiso: string) =>
      permisos.includes(permiso),
    );
  }

  it('contacto existente/principal: sin elección explícita liga el contacto vigente del cliente', async () => {
    resolverContactoMock.mockResolvedValue({ estado: 'vinculable', id: CONTACTO_ID, creado: false });

    const respuesta = await crearProspectoAccion({ ...ALTA_BASE, clienteId: CLIENTE_ID });

    expect(respuesta.exito).toBe(true);
    expect(resolverContactoMock).toHaveBeenCalledWith(expect.anything(), {
      clienteId: CLIENTE_ID,
      actorId: VENDEDOR_ID,
      puedeCrear: false,
      // El nombre, correo y teléfono ya capturados en el alta viajan como respaldo.
      capturado: { nombre: 'Ana Pérez', correo: undefined, telefono: '664 000 0000' },
    });
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ cliente_id: CLIENTE_ID, contacto_id: CONTACTO_ID }),
    );
    expect(registrarLogMock).toHaveBeenCalledWith(
      VENDEDOR,
      'crear',
      'pipeline',
      OPORTUNIDAD_ID,
      { folioOp: 'OP-000001', clienteId: CLIENTE_ID, estadoRfq: 'INCOMPLETE', contactoAutomatico: CONTACTO_ID },
      'corr-rfq-1',
    );
  });

  it('crear el contacto exige rfq_editar y cliente_editar además de rfq_crear', async () => {
    for (const permisos of [
      ['rfq_crear', 'rfq_editar'],
      ['rfq_crear', 'cliente_editar'],
      ['rfq_crear'],
    ]) {
      resolverContactoMock.mockClear();
      conPermisos(...permisos);
      await crearProspectoAccion({ ...ALTA_BASE, clienteId: CLIENTE_ID });
      expect(resolverContactoMock).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ puedeCrear: false }),
      );
    }

    resolverContactoMock.mockClear();
    conPermisos('rfq_crear', 'rfq_editar', 'cliente_editar');
    await crearProspectoAccion({ ...ALTA_BASE, clienteId: CLIENTE_ID });
    expect(resolverContactoMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ puedeCrear: true }),
    );
  });

  it('principal del cliente: acepta el contacto creado con sus datos y audita la creación', async () => {
    conPermisos('rfq_crear', 'rfq_editar', 'cliente_editar');
    resolverContactoMock.mockResolvedValue({ estado: 'vinculable', id: CONTACTO_ID, creado: true });

    await crearProspectoAccion({ ...ALTA_BASE, clienteId: CLIENTE_ID });

    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ contacto_id: CONTACTO_ID }));
    expect(registrarLogMock).toHaveBeenCalledWith(
      VENDEDOR,
      'crear',
      'clientes',
      CLIENTE_ID,
      { contactoId: CONTACTO_ID, origen: 'rfq_alta_automatico', rfqId: OPORTUNIDAD_ID },
      'corr-rfq-1',
    );
    expect(retirarContactoMock).not.toHaveBeenCalled();
  });

  it('si el RFQ no se inserta retira el contacto recién creado', async () => {
    conPermisos('rfq_crear', 'rfq_editar', 'cliente_editar');
    resolverContactoMock.mockResolvedValue({ estado: 'vinculable', id: CONTACTO_ID, creado: true });
    singleMock.mockResolvedValue({ data: null, error: { message: 'boom' } });

    const respuesta = await crearProspectoAccion({ ...ALTA_BASE, clienteId: CLIENTE_ID });

    expect(respuesta.exito).toBe(false);
    expect(retirarContactoMock).toHaveBeenCalledWith(expect.anything(), CONTACTO_ID);
    expect(registrarLogMock).not.toHaveBeenCalled();
  });

  it('si el RFQ no se inserta no retira un contacto que ya existía', async () => {
    resolverContactoMock.mockResolvedValue({ estado: 'vinculable', id: CONTACTO_ID, creado: false });
    singleMock.mockResolvedValue({ data: null, error: { message: 'boom' } });

    await crearProspectoAccion({ ...ALTA_BASE, clienteId: CLIENTE_ID });

    expect(retirarContactoMock).not.toHaveBeenCalled();
  });

  it('sin permiso para crear: solo liga contactos ya registrados y el RFQ nace igual', async () => {
    resolverContactoMock.mockResolvedValue({ estado: 'sin_permiso' });

    const respuesta = await crearProspectoAccion({ ...ALTA_BASE, clienteId: CLIENTE_ID });

    expect(respuesta.exito).toBe(true);
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ contacto_id: null }));
    expect(retirarContactoMock).not.toHaveBeenCalled();
  });

  it('no sobrescribe el contacto elegido explícitamente', async () => {
    resolverContactoMock.mockResolvedValue({ estado: 'vinculable', id: 'otro-contacto', creado: false });

    await crearProspectoAccion({
      ...ALTA_BASE,
      clienteId: CLIENTE_ID,
      contactoId: CONTACTO_ID,
    });

    expect(resolverContactoMock).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ contacto_id: CONTACTO_ID }));
  });

  it('sin datos del cliente: el RFQ nace sin contacto, sin inventar uno', async () => {
    resolverContactoMock.mockResolvedValue({ estado: 'sin_datos' });

    const respuesta = await crearProspectoAccion({ ...ALTA_BASE, clienteId: CLIENTE_ID });

    expect(respuesta.exito).toBe(true);
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ cliente_id: CLIENTE_ID, contacto_id: null }),
    );
    expect(registrarLogMock).toHaveBeenCalledWith(
      VENDEDOR,
      'crear',
      'pipeline',
      OPORTUNIDAD_ID,
      { folioOp: 'OP-000001', clienteId: CLIENTE_ID, estadoRfq: 'INCOMPLETE' },
      'corr-rfq-1',
    );
  });

  it('sin cliente del catálogo no busca ningún contacto', async () => {
    await crearProspectoAccion(ALTA_BASE);

    expect(resolverContactoMock).not.toHaveBeenCalled();
    expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({ contacto_id: null }));
  });
});

describe('asignarClienteOportunidadAccion — contacto al cambiar de cliente', () => {
  const entrada = { id: OPORTUNIDAD_ID, clienteId: CLIENTE_ID, heredarCondiciones: true };

  function conOportunidad(
    contactoId: string | null,
    estadoRfq: Oportunidad['estadoRfq'] = 'INCOMPLETE',
  ): void {
    obtenerOportunidadMock.mockResolvedValue({
      oportunidad: { ...OPORTUNIDAD, estadoRfq, contactoId },
      lineas: [],
    });
  }

  // La captura en curso (INCOMPLETE) es donde se liga el cliente.
  beforeEach(() => conOportunidad(null));

  function contactoDeOtroCliente(): void {
    seleccionMaybeSingleMock.mockImplementation(async (tabla: string) =>
      tabla === 'contactos_cliente'
        ? { data: { id: CONTACTO_ID, cliente_id: 'otro-cliente', activo: true }, error: null }
        : { data: null, error: null },
    );
  }

  it('nunca crea ni busca contactos: eso lo hace la acción de vinculación con sus permisos', async () => {
    const respuesta = await asignarClienteOportunidadAccion(entrada);

    expect(respuesta.exito).toBe(true);
    expect(resolverContactoMock).not.toHaveBeenCalled();
    expect(updateMock).toHaveBeenCalledWith({
      cliente_id: CLIENTE_ID,
      condiciones_pago: '30_dias',
    });
  });

  it('conserva un contacto ya elegido que pertenece al nuevo cliente', async () => {
    conOportunidad(CONTACTO_ID);

    const respuesta = await asignarClienteOportunidadAccion(entrada);

    expect(respuesta.exito).toBe(true);
    expect(updateMock).toHaveBeenCalledWith({
      cliente_id: CLIENTE_ID,
      condiciones_pago: '30_dias',
    });
  });

  it('desliga un contacto que pertenece a otro cliente (ya no es válido para este RFQ)', async () => {
    conOportunidad(CONTACTO_ID);
    contactoDeOtroCliente();

    await asignarClienteOportunidadAccion(entrada);

    expect(updateMock).toHaveBeenCalledWith({
      cliente_id: CLIENTE_ID,
      condiciones_pago: '30_dias',
      contacto_id: null,
    });
    expect(registrarLogMock).toHaveBeenCalledWith(
      VENDEDOR,
      'asignar_cliente_oportunidad',
      'pipeline',
      OPORTUNIDAD_ID,
      { clienteId: CLIENTE_ID, condicionesPago: '30_dias', contactoDesligado: CONTACTO_ID },
    );
  });

  it('no modifica el vínculo si falla la consulta del contacto', async () => {
    conOportunidad(CONTACTO_ID);
    seleccionMaybeSingleMock.mockImplementation(async (tabla: string) =>
      tabla === 'contactos_cliente'
        ? { data: null, error: { message: 'Error de lectura' } }
        : { data: null, error: null },
    );

    const respuesta = await asignarClienteOportunidadAccion(entrada);

    expect(respuesta.exito).toBe(false);
    expect(updateMock).not.toHaveBeenCalled();
  });

  it('un RFQ ya convertido (congelado) conserva su contacto aunque sea de otro cliente', async () => {
    conOportunidad(CONTACTO_ID, 'CONVERTED');
    contactoDeOtroCliente();

    await asignarClienteOportunidadAccion(entrada);

    expect(updateMock).toHaveBeenCalledWith({
      cliente_id: CLIENTE_ID,
      condiciones_pago: '30_dias',
    });
  });

  it('al desligar el cliente no toca el contacto', async () => {
    conOportunidad(CONTACTO_ID);
    contactoDeOtroCliente();

    await asignarClienteOportunidadAccion({ ...entrada, clienteId: null });

    expect(updateMock).toHaveBeenCalledWith({ cliente_id: null, condiciones_pago: null });
  });
});
