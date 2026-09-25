import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeAll, expect, it } from 'vitest';
import type { Database } from '@/compartido/tipos/supabase';
import { prepararSuiteSupabaseLocal } from '../utilidades/entorno-supabase';

// PRD-09: acumulación por pareja partida×proceso, concurrencia y permisos.
// Escribe fixtures solo en el Supabase local y no hereda el archivo de entorno.
const { describir: suite, crearClienteServicio, crearClienteAnonimo } = prepararSuiteSupabaseLocal(
  'avance por proceso PRD-09', { requiereClaveAnonima: true },
);

interface Caso {
  ordenId: string;
  partidaId: string;
  metas: { id: string; secuencia: number; metaPiezas: number }[];
  programaciones: number;
  recursos: string[];
}

suite('PRD-09: avance por partida×proceso bajo concurrencia y RLS real', () => {
  let servicio: SupabaseClient<Database>;
  let segundoServicio: SupabaseClient<Database>;
  let operador: SupabaseClient<Database>;
  let operadorInactivo: SupabaseClient<Database>;
  let operadorId = '';
  const usuarios: string[] = [];
  const ordenes: string[] = [];
  const recursos: string[] = [];
  const clientes: string[] = [];

  async function crearUsuario(rol: 'operador', activo: boolean) {
    const correo = `prd09-${randomUUID()}@orca.local`;
    const clave = `Prd09!${randomUUID()}Aa`;
    const alta = await servicio.auth.admin.createUser({ email: correo, password: clave, email_confirm: true });
    if (alta.error || !alta.data.user) throw alta.error ?? new Error('No se creó usuario');
    usuarios.push(alta.data.user.id);
    const perfil = await servicio.from('usuarios').update({ rol, activo }).eq('id', alta.data.user.id);
    if (perfil.error) throw perfil.error;
    const cliente = crearClienteAnonimo();
    const ingreso = await cliente.auth.signInWithPassword({ email: correo, password: clave });
    if (ingreso.error) throw ingreso.error;
    return { id: alta.data.user.id, cliente };
  }

  async function crearCaso(cantidad: number, procesos: string[], programaciones: number): Promise<Caso> {
    const sufijo = randomUUID().slice(0, 8).toUpperCase();
    const { data: cliente, error: errorCliente } = await servicio.from('clientes')
      .insert({ nombre_comercial: `PRD09 ${sufijo}`, razon_social: `PRD09 ${sufijo} SA` })
      .select('id').single();
    if (errorCliente || !cliente) throw errorCliente ?? new Error('Sin cliente');
    clientes.push(cliente.id);

    const { data: folio, error: errorFolio } = await servicio.rpc('generar_folio_orden', { p_prefijo: 'OP' });
    if (errorFolio || !folio) throw errorFolio ?? new Error('Sin folio');
    const { data: orden, error: errorOrden } = await servicio.from('ordenes_produccion')
      .insert({ folio, cliente_id: cliente.id, estado: 'en_proceso', fecha_compromiso: '2099-12-31T00:00:00Z' })
      .select('id').single();
    if (errorOrden || !orden) throw errorOrden ?? new Error('Sin orden');
    ordenes.push(orden.id);

    const { data: partida, error: errorPartida } = await servicio.from('partidas_orden_produccion')
      .insert({
        orden_id: orden.id, codigo_pieza: `PRD09-${sufijo}`, cantidad_solicitada: cantidad,
        unidad_medida: 'pieza', procesos, operador_asignado_id: operadorId,
      })
      .select('id').single();
    if (errorPartida || !partida) throw errorPartida ?? new Error('Sin partida');

    const { data: metas, error: errorMetas } = await servicio.from('metas_proceso_partida')
      .select('id, secuencia, meta_piezas').eq('partida_id', partida.id).order('secuencia');
    if (errorMetas || !metas) throw errorMetas ?? new Error('Sin metas');

    const recursosCaso: string[] = [];
    for (let indice = 0; indice < programaciones; indice++) {
      const { data: recurso, error: errorRecurso } = await servicio.from('recursos_planeacion')
        .insert({
          codigo: `PRD09-${sufijo}-${indice}`, nombre: `Recurso ${sufijo} ${indice}`,
          area: 'taller', activo: true,
        })
        .select('id').single();
      if (errorRecurso || !recurso) throw errorRecurso ?? new Error('Sin recurso');
      recursos.push(recurso.id);
      recursosCaso.push(recurso.id);
    }

    return {
      ordenId: orden.id,
      partidaId: partida.id,
      metas: metas.map((meta) => ({ id: meta.id, secuencia: Number(meta.secuencia), metaPiezas: Number(meta.meta_piezas) })),
      programaciones,
      recursos: recursosCaso,
    };
  }

  async function crearSesionActiva(
    caso: Caso,
    indice: number,
    minutosAtras = 120,
  ): Promise<{ sesionId: string; programacionId: string }> {
    const { data: programacion, error: errorProgramacion } = await servicio.from('programacion_areas')
      .insert({
        orden_id: caso.ordenId, partida_id: caso.partidaId, recurso_id: caso.recursos[indice],
        secuencia: indice + 1, estado_planeacion: 'en_proceso', fecha_programada: '2099-12-30',
        turno: 'matutino', horas_estimadas: 2,
      })
      .select('id').single();
    if (errorProgramacion || !programacion) throw errorProgramacion ?? new Error('Sin programación');
    const { data: sesion, error: errorSesion } = await servicio.from('sesiones_trabajo')
      .insert({
        orden_id: caso.ordenId, partida_id: caso.partidaId, programacion_id: programacion.id,
        operador_id: operadorId, estado_sesion: 'activa',
        fecha_inicio: new Date(Date.now() - minutosAtras * 60_000).toISOString(),
      })
      .select('id').single();
    if (errorSesion || !sesion) throw errorSesion ?? new Error('Sin sesión');
    return { sesionId: sesion.id, programacionId: programacion.id };
  }

  function cerrar(
    cliente: SupabaseClient<Database>,
    sesionId: string,
    piezas: number,
    metaProcesoId?: string,
  ) {
    return cliente.rpc('cerrar_sesion_trabajo_operador', {
      p_sesion_id: sesionId,
      p_operador_id: operadorId,
      p_piezas_producidas: piezas,
      p_estado_destino: 'finalizada',
      ...(metaProcesoId ? { p_meta_proceso_id: metaProcesoId } : {}),
    });
  }

  beforeAll(async () => {
    servicio = crearClienteServicio();
    segundoServicio = crearClienteServicio();
    const persona = await crearUsuario('operador', true);
    operadorId = persona.id;
    operador = persona.cliente;
    operadorInactivo = (await crearUsuario('operador', false)).cliente;
  });

  async function limpiarSesionesActivas(): Promise<void> {
    if (!servicio || !operadorId) return;
    const { error } = await servicio.from('sesiones_trabajo').delete()
      .eq('operador_id', operadorId).eq('estado_sesion', 'activa');
    if (error) throw new Error(`No se pudieron limpiar las sesiones activas: ${error.message}`);
  }

  afterEach(async () => {
    // La regla de una sola sesión activa por operador exige limpiar los intentos
    // rechazados antes de la siguiente prueba.
    await limpiarSesionesActivas();
  });

  afterAll(async () => {
    if (!servicio) return;
    for (const ordenId of ordenes) {
      const { data: partidas } = await servicio.from('partidas_orden_produccion').select('id').eq('orden_id', ordenId);
      const partidaIds = (partidas ?? []).map((partida) => partida.id);
      if (partidaIds.length > 0) {
        await servicio.from('registros_avance_partida').delete().in('partida_id', partidaIds);
        await servicio.from('sesiones_trabajo').delete().in('partida_id', partidaIds);
        await servicio.from('programacion_areas').delete().in('partida_id', partidaIds);
      }
      await servicio.from('partidas_orden_produccion').delete().eq('orden_id', ordenId);
      await servicio.from('ordenes_produccion').delete().eq('id', ordenId);
    }
    if (recursos.length > 0) await servicio.from('recursos_planeacion').delete().in('id', recursos);
    if (clientes.length > 0) await servicio.from('clientes').delete().in('id', clientes);
    if (usuarios.length > 0) {
      await servicio.from('logs').delete().in('usuario_id', usuarios);
      await servicio.from('usuarios').delete().in('id', usuarios);
      for (const id of usuarios) await servicio.auth.admin.deleteUser(id);
    }
  });

  it('acumula varias sesiones por proceso y completa solo al alcanzar todas las metas', async () => {
    const caso = await crearCaso(10, ['Corte', 'Doblado'], 3);
    expect(caso.metas.map((meta) => meta.metaPiezas)).toEqual([10, 10]);
    const metaCorte = caso.metas[0]!;
    const metaDoblado = caso.metas[1]!;

    const primera = await crearSesionActiva(caso, 0);
    const cierreCorte1 = await cerrar(servicio, primera.sesionId, 4, metaCorte.id);
    expect(cierreCorte1.error).toBeNull();
    const segunda = await crearSesionActiva(caso, 1);
    const cierreCorte2 = await cerrar(segundoServicio, segunda.sesionId, 6, metaCorte.id);
    expect(cierreCorte2.error).toBeNull();

    const { data: registrosCorte } = await servicio.from('registros_avance_partida')
      .select('cantidad_producida').eq('meta_proceso_id', metaCorte.id);
    expect((registrosCorte ?? []).reduce((total, fila) => total + Number(fila.cantidad_producida), 0)).toBe(10);
    const { data: partidaIntermedia } = await servicio.from('partidas_orden_produccion')
      .select('cantidad_producida').eq('id', caso.partidaId).single();
    expect(Number(partidaIntermedia?.cantidad_producida)).toBe(0);
    const { data: ordenIntermedia } = await servicio.from('ordenes_produccion')
      .select('estado').eq('id', caso.ordenId).single();
    expect(ordenIntermedia?.estado).toBe('en_proceso');

    const tercera = await crearSesionActiva(caso, 2);
    const exceso = await cerrar(servicio, tercera.sesionId, 11, metaDoblado.id);
    expect(exceso.error?.message).toContain('cantidad_excede_meta_proceso');
    const cierreFinal = await cerrar(servicio, tercera.sesionId, 10, metaDoblado.id);
    expect(cierreFinal.error).toBeNull();

    const { data: partidaFinal } = await servicio.from('partidas_orden_produccion')
      .select('cantidad_producida').eq('id', caso.partidaId).single();
    expect(Number(partidaFinal?.cantidad_producida)).toBe(10);
    const { data: ordenFinal } = await servicio.from('ordenes_produccion')
      .select('estado').eq('id', caso.ordenId).single();
    expect(ordenFinal?.estado).toBe('completada');
  });

  it('rechaza una meta de otra partida sin escribir avance', async () => {
    const caso = await crearCaso(5, ['Corte'], 1);
    const ajeno = await crearCaso(5, ['Corte'], 1);
    const sesion = await crearSesionActiva(caso, 0);
    const respuesta = await cerrar(servicio, sesion.sesionId, 3, ajeno.metas[0]!.id);
    expect(respuesta.error?.message).toContain('meta_proceso_no_corresponde');
    const { data: registros } = await servicio.from('registros_avance_partida')
      .select('id').eq('partida_id', caso.partidaId);
    expect(registros ?? []).toHaveLength(0);
  });

  it('dos cierres simultáneos de la misma sesión producen un solo avance', async () => {
    for (let intento = 0; intento < 3; intento++) {
      await limpiarSesionesActivas();
      const caso = await crearCaso(10, ['Corte'], 1);
      const sesion = await crearSesionActiva(caso, 0);
      const resultados = await Promise.allSettled([
        cerrar(servicio, sesion.sesionId, 5, caso.metas[0]!.id),
        cerrar(segundoServicio, sesion.sesionId, 5, caso.metas[0]!.id),
      ]);
      expect(resultados.map((resultado) => resultado.status)).toEqual(['fulfilled', 'fulfilled']);
      const errores = resultados.map((resultado) => (
        resultado.status === 'fulfilled' ? resultado.value.error : { message: 'rechazado' }
      ));
      expect(errores.filter((error) => error === null)).toHaveLength(1);
      const { data: registros } = await servicio.from('registros_avance_partida')
        .select('cantidad_producida').eq('partida_id', caso.partidaId);
      expect(registros ?? []).toHaveLength(1);
      expect(Number(registros?.[0]?.cantidad_producida)).toBe(5);
    }
  });

  it('sesión y avance de piso concurrentes nunca rebasan la meta compartida', async () => {
    for (let intento = 0; intento < 3; intento++) {
      await limpiarSesionesActivas();
      const caso = await crearCaso(10, [], 1);
      const metaFinal = caso.metas[0]!;
      const sesion = await crearSesionActiva(caso, 0);
      const [resultadoSesion, resultadoPiso] = await Promise.allSettled([
        cerrar(servicio, sesion.sesionId, 6, metaFinal.id),
        segundoServicio.rpc('registrar_avance_partida_op', {
          p_partida_id: caso.partidaId,
          p_operador_id: operadorId,
          p_cantidad_producida: 5,
          p_cantidad_scrap: 0,
        }),
      ]);
      expect(resultadoSesion.status).toBe('fulfilled');
      expect(resultadoPiso.status).toBe('fulfilled');
      if (resultadoSesion.status !== 'fulfilled' || resultadoPiso.status !== 'fulfilled') return;
      const exitos = [
        resultadoSesion.value.error === null,
        resultadoPiso.value.error === null,
      ];
      expect(exitos.filter(Boolean)).toHaveLength(1);
      const { data: registros } = await servicio.from('registros_avance_partida')
        .select('cantidad_producida').eq('meta_proceso_id', metaFinal.id);
      const acumulado = (registros ?? []).reduce((total, fila) => total + Number(fila.cantidad_producida), 0);
      expect(acumulado).toBeLessThanOrEqual(10);
      const { data: partida } = await servicio.from('partidas_orden_produccion')
        .select('cantidad_producida').eq('id', caso.partidaId).single();
      expect(Number(partida?.cantidad_producida)).toBeLessThanOrEqual(10);
    }
  });

  it('un JWT sin gestionar_produccion no ejecuta el cierre ni escribe avances', async () => {
    const caso = await crearCaso(5, ['Corte'], 1);
    const sesion = await crearSesionActiva(caso, 0);

    const cierre = await operador.rpc('cerrar_sesion_trabajo_operador', {
      p_sesion_id: sesion.sesionId,
      p_operador_id: operadorId,
      p_piezas_producidas: 5,
      p_estado_destino: 'finalizada',
      p_meta_proceso_id: caso.metas[0]!.id,
    });
    expect(cierre.error).not.toBeNull();

    const insercion = await operador.from('registros_avance_partida').insert({
      partida_id: caso.partidaId, operador_id: operadorId, cantidad_producida: 1,
    });
    expect(insercion.error).not.toBeNull();

    const actualizacion = await operador.from('registros_avance_partida')
      .update({ cantidad_producida: 1 }).eq('partida_id', caso.partidaId);
    expect(actualizacion.error).not.toBeNull();

    const cierreServidor = await cerrar(servicio, sesion.sesionId, 5, caso.metas[0]!.id);
    expect(cierreServidor.error).toBeNull();

    const lecturaOperador = await operador.from('registros_avance_partida')
      .select('id').eq('partida_id', caso.partidaId);
    expect(lecturaOperador.data ?? []).toHaveLength(0);

    const lecturaServicio = await servicio.from('registros_avance_partida')
      .select('id').eq('partida_id', caso.partidaId);
    expect(lecturaServicio.data ?? []).toHaveLength(1);
  });

  it('la lectura de metas exige una cuenta activa, también con JWT vigente', async () => {
    const caso = await crearCaso(5, ['Corte'], 1);
    const activo = await operador.from('metas_proceso_partida')
      .select('id').eq('partida_id', caso.partidaId);
    expect(activo.error).toBeNull();
    expect(activo.data ?? []).toHaveLength(1);

    const inactivo = await operadorInactivo.from('metas_proceso_partida')
      .select('id').eq('partida_id', caso.partidaId);
    expect(inactivo.error).toBeNull();
    expect(inactivo.data ?? []).toHaveLength(0);
  });
});
