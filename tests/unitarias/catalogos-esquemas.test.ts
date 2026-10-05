import { describe, expect, it } from 'vitest';
import {
  esquemaAlternarActivo,
  esquemaConsultaCatalogosBase,
  esquemaGuardarEspesor,
  esquemaGuardarGrupoEquipo,
  esquemaGuardarGrupoPlaneado,
  esquemaGuardarMaterial,
  esquemaGuardarProceso,
  esquemaGuardarProximaAccion,
  esquemaListarVersiones,
} from '@/modulos/catalogos/validaciones/indice';

const MATERIAL_UUID = '00000000-0000-4000-8000-0000000c0a01';

const materialValido = {
  codigo: 'acero_carbon',
  nombre: 'Acero al carbón',
  activo: true,
  orden: 10,
};

describe('esquemas de catálogos base', () => {
  it('normaliza el código de material a mayúsculas y rechaza formatos inválidos', () => {
    const valido = esquemaGuardarMaterial.safeParse(materialValido);
    expect(valido.success).toBe(true);
    if (valido.success) {
      expect(valido.data.codigo).toBe('ACERO_CARBON');
      expect(valido.data.activo).toBe(true);
    }
    expect(esquemaGuardarMaterial.safeParse({ ...materialValido, codigo: 'con espacio' }).success).toBe(false);
    expect(esquemaGuardarMaterial.safeParse({ ...materialValido, codigo: 'A' }).success).toBe(false);
    expect(esquemaGuardarMaterial.safeParse({ ...materialValido, nombre: '' }).success).toBe(false);
    expect(esquemaGuardarMaterial.safeParse({ ...materialValido, orden: -1 }).success).toBe(false);
    expect(esquemaGuardarMaterial.safeParse({ ...materialValido, extra: true }).success).toBe(false);
  });

  it('acepta espesor solo con material válido y mm positivo finito', () => {
    const valido = {
      materialId: MATERIAL_UUID,
      etiqueta: '3 mm',
      espesorMm: 3,
      activo: true,
      orden: 0,
    };
    expect(esquemaGuardarEspesor.safeParse(valido).success).toBe(true);
    expect(esquemaGuardarEspesor.safeParse({ ...valido, materialId: 'no-uuid' }).success).toBe(false);
    expect(esquemaGuardarEspesor.safeParse({ ...valido, etiqueta: '' }).success).toBe(false);
    expect(esquemaGuardarEspesor.safeParse({ ...valido, espesorMm: 0 }).success).toBe(false);
    expect(esquemaGuardarEspesor.safeParse({ ...valido, espesorMm: -3 }).success).toBe(false);
    expect(esquemaGuardarEspesor.safeParse({ ...valido, espesorMm: Number.NaN }).success).toBe(false);
  });

  it('valida prefijo de corrida, grupo, área y banderas B6 del proceso', () => {
    const valido = {
      codigo: 'laser_fibra',
      nombre: 'Láser fibra',
      prefijoCorrida: 'las',
      grupoPlaneadoId: null,
      areaTrabajoCodigo: null,
      requiereArchivoTecnico: true,
      requierePrimeraPieza: true,
      intervaloInspeccionLote: 10,
      activo: true,
      orden: 10,
    };
    const resultado = esquemaGuardarProceso.safeParse(valido);
    expect(resultado.success).toBe(true);
    if (resultado.success) {
      expect(resultado.data.codigo).toBe('LASER_FIBRA');
      expect(resultado.data.prefijoCorrida).toBe('LAS');
    }
    expect(esquemaGuardarProceso.safeParse({ ...valido, prefijoCorrida: 'L4S' }).success).toBe(false);
    expect(esquemaGuardarProceso.safeParse({ ...valido, prefijoCorrida: 'L' }).success).toBe(false);
    expect(esquemaGuardarProceso.safeParse({ ...valido, prefijoCorrida: 'LARGO' }).success).toBe(false);
    expect(esquemaGuardarProceso.safeParse({ ...valido, intervaloInspeccionLote: 15 }).success).toBe(false);
    expect(esquemaGuardarProceso.safeParse({ ...valido, intervaloInspeccionLote: null }).success).toBe(true);
    expect(esquemaGuardarProceso.safeParse({ ...valido, areaTrabajoCodigo: 'AREA INVALIDA' }).success).toBe(false);
  });

  it('aplica los mismos contratos a grupos de equipo y planeados', () => {
    for (const esquema of [esquemaGuardarGrupoEquipo, esquemaGuardarGrupoPlaneado]) {
      expect(esquema.safeParse({ codigo: 'cnc_router', nombre: 'CNC Router' }).success).toBe(true);
      expect(esquema.safeParse({ codigo: 'A', nombre: 'Corto' }).success).toBe(false);
      expect(esquema.safeParse({ codigo: 'OK', nombre: 'Válido' }).success).toBe(true);
    }
  });

  it('valida próximas acciones y su marca de texto libre', () => {
    const otras = esquemaGuardarProximaAccion.safeParse({ codigo: 'other', nombre: 'Otro', esOtro: true });
    expect(otras.success).toBe(true);
    if (otras.success) expect(otras.data.esOtro).toBe(true);
    expect(esquemaGuardarProximaAccion.safeParse({ codigo: 'follow_up', nombre: 'Seguimiento' }).success).toBe(true);
  });

  it('valida alternar activo con entidad permitida', () => {
    const valido = esquemaAlternarActivo.safeParse({
      entidad: 'catalogo_materiales',
      id: MATERIAL_UUID,
      activo: false,
    });
    expect(valido.success).toBe(true);
    expect(
      esquemaAlternarActivo.safeParse({ entidad: 'tabla_inexistente', id: MATERIAL_UUID, activo: false }).success,
    ).toBe(false);
    expect(esquemaAlternarActivo.safeParse({ entidad: 'grupos_equipo', id: 'no-uuid', activo: true }).success).toBe(false);
  });

  it('valida consultas de catálogo y de versiones', () => {
    const consulta = esquemaConsultaCatalogosBase.safeParse({});
    expect(consulta.success).toBe(true);
    if (consulta.success) expect(consulta.data.soloActivos).toBe(false);

    expect(
      esquemaListarVersiones.safeParse({ entidad: 'catalogo_procesos', entidadId: MATERIAL_UUID }).success,
    ).toBe(true);
    expect(
      esquemaListarVersiones.safeParse({ entidad: 'catalogo_procesos', entidadId: 'x' }).success,
    ).toBe(false);
  });
});
