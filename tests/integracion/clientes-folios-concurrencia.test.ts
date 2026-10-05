import { randomUUID } from 'node:crypto';
import { type SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, expect, it } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';
import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

// Consume la secuencia global de folios de cliente: solo contra el stack local.
const { describir, crearClienteServicio } = prepararSuiteSupabaseLocal(
  'folios de cliente bajo concurrencia',
);

describir('folios de cliente bajo concurrencia (integración)', () => {
  let servicio: SupabaseClient<Database>;
  let actorId: string;
  const sufijo = randomUUID().slice(0, 8);
  const razones: string[] = [];

  beforeAll(async () => {
    servicio = crearClienteServicio();
    const alta = await servicio.auth.admin.createUser({
      email: `sii-b2-concurrencia-${sufijo}@orca.local`,
      password: `SiiB2!${randomUUID()}Cc9`,
      email_confirm: true,
      user_metadata: { nombre_completo: `Actor concurrencia B2 ${sufijo}` },
    });
    if (alta.error || !alta.data.user) throw alta.error ?? new Error('No se creó el actor');
    actorId = alta.data.user.id;
    const { error } = await servicio
      .from('usuarios')
      .update({ rol: 'admin', activo: true, nombre_completo: `Actor concurrencia B2 ${sufijo}` })
      .eq('id', actorId);
    if (error) throw error;
  });

  afterAll(async () => {
    if (razones.length > 0) {
      await servicio.from('contactos_cliente').delete().in(
        'cliente_id',
        (
          await servicio
            .from('clientes')
            .select('id')
            .in('razon_social', razones)
        ).data?.map((fila) => fila.id) ?? [],
      );
      await servicio.from('clientes').delete().in('razon_social', razones);
    }
    if (actorId) {
      await servicio.from('logs').delete().eq('usuario_id', actorId);
      await servicio.from('usuarios').delete().eq('id', actorId);
      await servicio.auth.admin.deleteUser(actorId);
    }
  });

  it('8 altas concurrentes producen 8 folios CLI-#### distintos', async () => {
    const resultados = await Promise.all(
      Array.from({ length: 8 }, (_, indice) => {
        const razon = `Concurrencia B2 ${sufijo} ${indice} SA de CV`;
        razones.push(razon);
        return servicio.rpc('crear_cliente_con_contacto', {
          p_datos: {
            nombre_comercial: `Concurrencia B2 ${sufijo} ${indice}`,
            razon_social: razon,
            rfc: `CCB2${indice}${sufijo.slice(0, 3).toUpperCase()}X${indice}`,
            correo: `concurrencia-${sufijo}-${indice}@orca.local`,
          },
          p_actor: actorId,
        });
      }),
    );

    const folios: string[] = [];
    for (const resultado of resultados) {
      expect(resultado.error).toBeNull();
      const datos = resultado.data as { folio?: string } | null;
      expect(datos?.folio).toMatch(/^CLI-[0-9]{4,}$/);
      folios.push(datos?.folio ?? '');
    }

    expect(new Set(folios).size).toBe(8);
  });
});
