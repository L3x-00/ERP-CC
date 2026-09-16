import { describe, expect, it } from 'vitest';
import {
  esquemaAreaTrabajo,
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

  it('valida tipo de cambio positivo y finito', () => {
    expect(esquemaTipoCambio.safeParse({ tipoCambioUsd: 19.875 }).success).toBe(true);
    expect(esquemaTipoCambio.safeParse({ tipoCambioUsd: 0 }).success).toBe(false);
    expect(esquemaTipoCambio.safeParse({ tipoCambioUsd: Number.POSITIVE_INFINITY }).success).toBe(false);
  });
});
