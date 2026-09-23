import { describe, expect, it } from 'vitest';
import { enlaceRegistroAuditado } from '@/modulos/auditoria/utilidades/enlace-registro';

const id = '10000000-0000-4000-8000-000000000001';

describe('enlaces de la bitácora al objeto auditado', () => {
  it('abre el objeto cuando el recurso tiene identidad conocida', () => {
    expect(enlaceRegistroAuditado({ modulo: 'pipeline', accion: 'actualizar_etapa', recursoId: id }))
      .toBe(`/pipeline?oportunidad=${id}`);
    expect(enlaceRegistroAuditado({ modulo: 'clientes', accion: 'crear_contacto_cliente', recursoId: id }))
      .toBe(`/clientes?cliente=${id}`);
    expect(enlaceRegistroAuditado({ modulo: 'ordenes', accion: 'cambiar_estado_orden', recursoId: id }))
      .toBe(`/ordenes?ordenId=${id}`);
  });

  it('no inventa un destino para recursos de otro tipo o identificador libre', () => {
    expect(enlaceRegistroAuditado({ modulo: 'ordenes', accion: 'registrar_avance_partida', recursoId: id })).toBeNull();
    expect(enlaceRegistroAuditado({ modulo: 'configuracion', accion: 'guardar_operador', recursoId: id })).toBeNull();
    expect(enlaceRegistroAuditado({ modulo: 'pipeline', accion: 'crear', recursoId: 'codigo-fuera-de-ruta' })).toBeNull();
  });
});
