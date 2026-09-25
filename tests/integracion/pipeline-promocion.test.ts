import { type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';
import { promoverAClienteSiNoExiste } from '@/modulos/pipeline/servicios/promover-a-cliente';
import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

// Esta suite BORRA e inserta clientes: solo puede correr contra el stack local.
const { describir, crearClienteServicio } = prepararSuiteSupabaseLocal(
  'promoción de prospecto a cliente',
);

// RFC exclusivo de prueba, 13 caracteres. Valor determinista para que la
// limpieza (before/after) sea auto-sanadora: una corrida interrumpida deja la
// fila con este RFC y la siguiente corrida la borra antes de empezar.
const RFC_PRUEBA = `PRUEBA${'X'.repeat(7)}`;

describir('promoción de prospecto a cliente (integración)', () => {
  let clienteAdmin: SupabaseClient<Database>;

  beforeAll(async () => {
    // El cliente se abre dentro de beforeAll (no en el cuerpo del describe)
    // porque el factory de un describe.skip igual se ejecuta al recolectar.
    clienteAdmin = crearClienteServicio();
    // Limpieza defensiva previa: garantiza que la primera promoción ejerza el
    // camino de insert y no un dedup contra una fila residual.
    await clienteAdmin.from('clientes').delete().eq('rfc', RFC_PRUEBA);
  });

  afterAll(async () => {
    await clienteAdmin.from('clientes').delete().eq('rfc', RFC_PRUEBA);
  });

  it('dos promociones con el mismo RFC devuelven el mismo cliente (no duplica)', async () => {
    const datos = {
      nombreComercial: 'Cliente de Prueba Integración',
      rfc: RFC_PRUEBA,
      contacto: 'Contacto de Prueba',
      correo: 'prueba-integracion@example.com',
      telefono: '6640000000',
    };

    const idPrimera = await promoverAClienteSiNoExiste(clienteAdmin, datos);
    const idSegunda = await promoverAClienteSiNoExiste(clienteAdmin, datos);

    expect(typeof idPrimera).toBe('string');
    expect(idPrimera.length).toBeGreaterThan(0);
    // Dedup por RFC: la segunda llamada reutiliza el cliente ya creado.
    expect(idSegunda).toBe(idPrimera);
  });
});
