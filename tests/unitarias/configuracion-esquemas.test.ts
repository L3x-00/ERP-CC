import { describe, expect, it } from 'vitest';
import {
  esquemaAreaTrabajo,
  esquemaCatalogoCategoriasGasto,
  esquemaCatalogoTiers,
  esquemaConfiguracionEmpresa,
  esquemaCuentaBancaria,
  esquemaGuardarCuentaBancaria,
  esquemaPlantillaDocumento,
  esquemaTarifasCotizador,
  esquemaTipoCambio,
} from '@/modulos/configuracion/validaciones/indice';
import { CATALOGO_TARIFAS_DEFECTO } from '@/modulos/cotizador/servicios/catalogo-tarifas';

const empresaValida = {
  nombre: 'CC Manufacturing Group',
  razonSocial: 'CC Manufacturing Group, S. de R.L. de C.V.',
  rfc: 'XAXX010101000',
  direccion: 'Tijuana, Baja California',
  telefono: '6641234567',
  email: 'admin@ccmanufacturing.example',
  logoUrl: '',
};

describe('esquemas de configuración', () => {
  it('acepta datos fiscales válidos y normaliza RFC', () => {
    const resultado = esquemaConfiguracionEmpresa.safeParse({ ...empresaValida, rfc: 'xaxx010101000' });
    expect(resultado.success).toBe(true);
    if (resultado.success) expect(resultado.data.rfc).toBe('XAXX010101000');
  });

  it('rechaza RFC, correo y propiedades desconocidas', () => {
    expect(esquemaConfiguracionEmpresa.safeParse({ ...empresaValida, rfc: 'INVALIDO' }).success).toBe(false);
    expect(esquemaConfiguracionEmpresa.safeParse({ ...empresaValida, email: 'no-es-correo' }).success).toBe(false);
    expect(esquemaConfiguracionEmpresa.safeParse({ ...empresaValida, extra: true }).success).toBe(false);
  });

  it('rechaza tarifas negativas, no finitas o fuera de rango', () => {
    const tarifas = {
      costoHoraDefault: 650,
      segundosPorPierce: 8,
      factorEficienciaLaser: 0.85,
      factorMermaMaterial: 0.08,
      margenUtilidadDefault: 30,
      estaciones: CATALOGO_TARIFAS_DEFECTO,
    };
    expect(esquemaTarifasCotizador.safeParse(tarifas).success).toBe(true);
    expect(esquemaTarifasCotizador.safeParse({ ...tarifas, costoHoraDefault: -1 }).success).toBe(false);
    expect(esquemaTarifasCotizador.safeParse({ ...tarifas, factorEficienciaLaser: 1.2 }).success).toBe(false);
    expect(esquemaTarifasCotizador.safeParse({ ...tarifas, margenUtilidadDefault: Number.NaN }).success).toBe(false);
    // El catálogo por estación es obligatorio y no admite valores inválidos.
    expect(esquemaTarifasCotizador.safeParse({ ...tarifas, estaciones: undefined }).success).toBe(false);
    expect(
      esquemaTarifasCotizador.safeParse({
        ...tarifas,
        estaciones: { ...CATALOGO_TARIFAS_DEFECTO, router: { ...CATALOGO_TARIFAS_DEFECTO.router, endmill: -5 } },
      }).success,
    ).toBe(false);
  });

  it('valida cuentas en MXN/USD y CLABE de 18 dígitos', () => {
    const cuenta = {
      banco: 'BBVA',
      numeroCuenta: '0123456789',
      clabe: '012345678901234567',
      moneda: 'MXN' as const,
      titular: 'CC Manufacturing Group',
      activa: true,
    };
    expect(esquemaCuentaBancaria.safeParse(cuenta).success).toBe(true);
    expect(esquemaCuentaBancaria.safeParse({ ...cuenta, moneda: 'EUR' }).success).toBe(false);
    expect(esquemaGuardarCuentaBancaria.safeParse({ ...cuenta, id: 'no-uuid' }).success).toBe(false);
  });

  it('valida plantillas y áreas con formato estricto', () => {
    expect(esquemaPlantillaDocumento.safeParse({
      clave: 'T1',
      colorAcento: '#1D4ED8',
      terminosCondiciones: 'Pago contra entrega.',
      textoPiePagina: 'Tijuana',
      textoEncabezado: 'ORCA MFG ERP',
    }).success).toBe(true);

    const area = {
      codigo: 'LASER_01',
      nombre: 'Corte láser',
      colorHex: '#3B82F6',
      costoHoraInterno: 650,
      tarifaHoraVenta: 1_100,
      esExterno: false,
      activo: true,
      orden: 1,
    };
    expect(esquemaAreaTrabajo.safeParse(area).success).toBe(true);
    expect(esquemaAreaTrabajo.safeParse({ ...area, colorHex: 'blue' }).success).toBe(false);
    expect(esquemaAreaTrabajo.safeParse({ ...area, codigo: 'laser 1' }).success).toBe(false);
  });

  it('valida la taxonomía de taller y la jerarquía (OBS-14)', () => {
    const proceso = {
      codigo: 'LASER_01',
      nombre: 'Corte láser',
      colorHex: '#3B82F6',
      costoHoraInterno: 650,
      tarifaHoraVenta: 1_100,
      esExterno: false,
      activo: true,
      orden: 1,
      tipo: 'proceso',
      padreCodigo: 'metal_mecanica',
      areaPlaneacion: 'sheet_metal',
    };
    const valido = esquemaAreaTrabajo.safeParse(proceso);
    expect(valido.success).toBe(true);
    if (valido.success) {
      expect(valido.data.padreCodigo).toBe('METAL_MECANICA');
      expect(valido.data.areaPlaneacion).toBe('sheet_metal');
    }

    // Clasificación y área macro fuera del contrato.
    expect(esquemaAreaTrabajo.safeParse({ ...proceso, tipo: 'celda' }).success).toBe(false);
    expect(esquemaAreaTrabajo.safeParse({ ...proceso, areaPlaneacion: 'otra' }).success).toBe(false);
    // Un área no puede ser su propio padre.
    expect(
      esquemaAreaTrabajo.safeParse({ ...proceso, padreCodigo: 'LASER_01' }).success,
    ).toBe(false);
    // El padre vacío se normaliza a raíz.
    const raiz = esquemaAreaTrabajo.safeParse({ ...proceso, padreCodigo: '' });
    expect(raiz.success).toBe(true);
    if (raiz.success) expect(raiz.data.padreCodigo).toBeUndefined();
  });

  it('valida tipo de cambio positivo y finito', () => {
    expect(esquemaTipoCambio.safeParse({ tipoCambioUsd: 19.875 }).success).toBe(true);
    expect(esquemaTipoCambio.safeParse({ tipoCambioUsd: 0 }).success).toBe(false);
    expect(esquemaTipoCambio.safeParse({ tipoCambioUsd: Number.POSITIVE_INFINITY }).success).toBe(false);
  });

  it('valida el catálogo de tiers (CFG-08): cuatro claves únicas y rangos', () => {
    const tiers = {
      diasManual: 90,
      tiers: [
        { clave: 'bronce', umbralMxn: 0, descuentoPorcentaje: 0 },
        { clave: 'plata', umbralMxn: 50_000, descuentoPorcentaje: 3 },
        { clave: 'oro', umbralMxn: 150_000, descuentoPorcentaje: 5 },
        { clave: 'platino', umbralMxn: 300_000, descuentoPorcentaje: 8 },
      ],
    };
    expect(esquemaCatalogoTiers.safeParse(tiers).success).toBe(true);
    expect(esquemaCatalogoTiers.safeParse({ ...tiers, tiers: tiers.tiers.slice(0, 3) }).success).toBe(false);
    expect(
      esquemaCatalogoTiers.safeParse({
        ...tiers,
        tiers: tiers.tiers.map((tier) => (tier.clave === 'plata' ? { ...tier, clave: 'bronce' } : tier)),
      }).success,
    ).toBe(false);
    expect(esquemaCatalogoTiers.safeParse({ ...tiers, diasManual: 0 }).success).toBe(false);
    expect(
      esquemaCatalogoTiers.safeParse({
        ...tiers,
        tiers: tiers.tiers.map((tier) => (tier.clave === 'oro' ? { ...tier, descuentoPorcentaje: 120 } : tier)),
      }).success,
    ).toBe(false);
  });

  it('valida el catálogo de categorías (CFG-09): formato y sin duplicados', () => {
    expect(
      esquemaCatalogoCategoriasGasto.safeParse({ categorias: ['materia_prima', 'acero_inoxidable'] }).success,
    ).toBe(true);
    expect(esquemaCatalogoCategoriasGasto.safeParse({ categorias: [] }).success).toBe(false);
    expect(esquemaCatalogoCategoriasGasto.safeParse({ categorias: ['MAYÚSCULAS'] }).success).toBe(false);
    expect(esquemaCatalogoCategoriasGasto.safeParse({ categorias: ['otros', 'otros'] }).success).toBe(false);
  });
});
