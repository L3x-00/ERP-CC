'use client';

import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { obtenerClienteSupabaseNavegador } from '@/nucleo/supabase/cliente-navegador';
import {
  CLAVE_CONTACTOS_CLIENTE,
  esClaveDetalleCliente,
  esClaveListaClientes,
} from './claves-consulta';

/** Los eventos son avisos: todos los datos se vuelven a leer bajo RLS. */
export function SincronizadorClientesRealtime() {
  const consultas = useQueryClient();
  const canalRef = useRef<RealtimeChannel | null>(null);
  const temporizadorRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const canalId = useRef(`clientes-${crypto.randomUUID()}`);
  const [conectado, setConectado] = useState(false);

  useEffect(() => {
    const supabase = obtenerClienteSupabaseNavegador();
    let desmontado = false;
    let identidad: string | null = null;
    let revisionSesion = 0;
    let clientesPendientes = false;
    let contactosPendientes = false;

    function invalidar(tipo: 'clientes' | 'contactos' | 'todo'): void {
      clientesPendientes ||= tipo !== 'contactos';
      contactosPendientes ||= tipo !== 'clientes';
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      temporizadorRef.current = setTimeout(() => {
        temporizadorRef.current = null;
        if (desmontado) return;
        if (clientesPendientes) {
          void consultas.invalidateQueries({ predicate: ({ queryKey }) => esClaveListaClientes(queryKey) });
          void consultas.invalidateQueries({ predicate: ({ queryKey }) => esClaveDetalleCliente(queryKey) });
        }
        if (contactosPendientes) void consultas.invalidateQueries({ queryKey: CLAVE_CONTACTOS_CLIENTE });
        clientesPendientes = false;
        contactosPendientes = false;
      }, 300);
    }

    function desconectar(): void {
      if (temporizadorRef.current) clearTimeout(temporizadorRef.current);
      temporizadorRef.current = null;
      clientesPendientes = false;
      contactosPendientes = false;
      const canal = canalRef.current;
      canalRef.current = null;
      if (canal) void supabase.removeChannel(canal);
      if (!desmontado) setConectado(false);
    }

    function conectar(usuarioId: string): void {
      if (desmontado) return;
      if (identidad !== usuarioId) {
        desconectar();
        if (identidad !== null) {
          // Evita mostrar datos del usuario anterior sin interrumpir la consulta
          // inicial del usuario que acaba de entrar a esta página.
          void consultas.resetQueries({ predicate: ({ queryKey }) =>
            queryKey[0] === 'clientes' || queryKey[0] === 'cliente',
          });
        }
        identidad = usuarioId;
      }
      if (canalRef.current) return;
      const canal = supabase.channel(canalId.current);
      canal.on('postgres_changes', { event: '*', schema: 'public', table: 'clientes' }, () => invalidar('clientes'));
      canal.on('postgres_changes', { event: '*', schema: 'public', table: 'contactos_cliente' }, () => invalidar('contactos'));
      canalRef.current = canal;
      canal.subscribe((estado) => {
        if (desmontado || canalRef.current !== canal) return;
        setConectado(estado === 'SUBSCRIBED');
        if (estado === 'SUBSCRIBED') invalidar('todo'); // recupera eventos perdidos
      });
    }

    const alVolver = (): void => {
      if (identidad && document.visibilityState === 'visible' && navigator.onLine) invalidar('todo');
    };
    window.addEventListener('online', alVolver);
    document.addEventListener('visibilitychange', alVolver);
    const { data: suscripcion } = supabase.auth.onAuthStateChange((_evento, sesion) => {
      revisionSesion++;
      if (sesion) conectar(sesion.user.id);
      else {
        const habiaIdentidad = identidad !== null;
        identidad = null;
        desconectar();
        if (habiaIdentidad) void consultas.resetQueries({ predicate: ({ queryKey }) =>
          queryKey[0] === 'clientes' || queryKey[0] === 'cliente',
        });
      }
    });
    const revisionInicial = revisionSesion;
    void supabase.auth.getSession().then(({ data }) => {
      if (revisionSesion === revisionInicial && data.session) conectar(data.session.user.id);
    });
    return () => {
      desmontado = true;
      suscripcion.subscription.unsubscribe();
      window.removeEventListener('online', alVolver);
      document.removeEventListener('visibilitychange', alVolver);
      desconectar();
    };
  }, [consultas]);

  return <span className="sr-only" data-testid="sincronizador-clientes" data-conectado={conectado ? 'true' : 'false'} aria-live="polite">{conectado ? 'Clientes sincronizados' : 'Conectando clientes'}</span>;
}
