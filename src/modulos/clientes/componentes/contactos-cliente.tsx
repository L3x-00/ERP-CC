'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { crearClienteSupabase } from '@/nucleo/supabase/cliente';
import { crearContactoClienteAccion } from '@/modulos/clientes/acciones/crear-contacto-cliente';
import { eliminarContactoClienteAccion } from '@/modulos/clientes/acciones/eliminar-contacto-cliente';
import { filaAContactoCliente } from '@/modulos/clientes/tipos/indice';
import { CLAVE_CONTACTOS_CLIENTE, claveContactosCliente } from './claves-consulta';
import { Button } from '@/compartido/componentes/ui/button';
import { Input } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';

/**
 * Contactos adicionales del cliente (OBS-02): lista con alta inline y baja.
 * Lectura con el cliente RLS del navegador (`ver_clientes`); las mutaciones van
 * por Server Actions auditadas. El principal se marca con `es_principal`.
 */
export function PanelContactos({ clienteId }: { clienteId: string }) {
  const clienteConsultas = useQueryClient();
  const [nombre, setNombre] = useState('');
  const [puesto, setPuesto] = useState('');
  const [correo, setCorreo] = useState('');
  const [telefono, setTelefono] = useState('');
  const [notas, setNotas] = useState('');
  const [esPrincipal, setEsPrincipal] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  const consulta = useQuery({
    queryKey: claveContactosCliente(clienteId),
    queryFn: async () => {
      const cliente = crearClienteSupabase();
      const { data, error } = await cliente
        .from('contactos_cliente')
        .select('*')
        .eq('cliente_id', clienteId)
        .order('es_principal', { ascending: false })
        .order('creado_en', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []).map(filaAContactoCliente);
    },
    staleTime: 30_000,
  });

  async function agregar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setGuardando(true);
    setMensaje(null);
    try {
      const respuesta = await crearContactoClienteAccion({
        clienteId,
        nombre,
        puesto,
        correo,
        telefono,
        notas,
        esPrincipal,
      });
      if (!respuesta.exito) {
        setMensaje(respuesta.error);
        return;
      }
      setNombre('');
      setPuesto('');
      setCorreo('');
      setTelefono('');
      setNotas('');
      setEsPrincipal(false);
      setMensaje('Contacto agregado.');
      await clienteConsultas.invalidateQueries({ queryKey: CLAVE_CONTACTOS_CLIENTE });
    } catch {
      setMensaje('No se pudo comunicar el alta; vuelve a intentarlo');
    } finally {
      setGuardando(false);
    }
  }

  async function quitar(id: string): Promise<void> {
    setMensaje(null);
    const respuesta = await eliminarContactoClienteAccion({ id, clienteId });
    if (!respuesta.exito) {
      setMensaje(respuesta.error);
      return;
    }
    setMensaje('Contacto eliminado.');
    await clienteConsultas.invalidateQueries({ queryKey: CLAVE_CONTACTOS_CLIENTE });
  }

  const contactos = consulta.data ?? [];

  return (
    <section className="flex flex-col gap-4" data-testid="panel-contactos">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold text-texto-primario">Contactos adicionales</h3>
        <p className="text-xs text-texto-secundario">
          Compras, finanzas, mantenimiento… El contacto principal se marca para distinguirlo.
        </p>
      </div>

      {consulta.isLoading && <p className="text-sm text-texto-secundario">Cargando contactos…</p>}
      {consulta.isError && (
        <p role="alert" className="text-sm text-peligro-texto">
          No se pudieron cargar los contactos.
        </p>
      )}

      {!consulta.isLoading && contactos.length === 0 && (
        <p className="text-sm text-texto-secundario">Sin contactos adicionales.</p>
      )}

      {contactos.length > 0 && (
        <ul className="flex flex-col gap-2" data-testid="lista-contactos">
          {contactos.map((contacto) => (
            <li
              key={contacto.id}
              className="flex items-start justify-between gap-2 border-b border-borde/60 pb-2 text-sm"
              data-testid={`contacto-${contacto.id}`}
            >
              <div className="flex min-w-0 flex-col">
                <span className="font-medium text-texto-primario">
                  {contacto.nombre}
                  {contacto.puesto ? ` · ${contacto.puesto}` : ''}
                  {contacto.esPrincipal ? ' · Principal' : ''}
                </span>
                <span className="text-xs text-texto-secundario">
                  {[contacto.correo, contacto.telefono].filter((valor) => valor !== null).join(' · ') || 'Sin datos de contacto'}
                </span>
                {contacto.notas && <span className="text-xs text-texto-tenue">{contacto.notas}</span>}
              </div>
              <Button
                type="button"
                variante="fantasma"
                tamano="sm"
                aria-label={`Quitar contacto ${contacto.nombre}`}
                onClick={() => void quitar(contacto.id)}
              >
                Quitar
              </Button>
            </li>
          ))}
        </ul>
      )}

      <form className="flex flex-col gap-2 rounded-lg border border-borde px-3 py-3" onSubmit={agregar} data-testid="formulario-contacto">
        <span className="text-sm font-medium text-texto-primario">Agregar contacto</span>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label htmlFor={`contacto-nombre-${clienteId}`} obligatorio>Nombre del contacto</Label>
            <Input
              id={`contacto-nombre-${clienteId}`}
              value={nombre}
              onChange={(evento) => setNombre(evento.target.value)}
              minLength={2}
              maxLength={120}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`contacto-puesto-${clienteId}`}>Puesto o área</Label>
            <Input
              id={`contacto-puesto-${clienteId}`}
              value={puesto}
              onChange={(evento) => setPuesto(evento.target.value)}
              maxLength={80}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`contacto-correo-${clienteId}`}>Correo del contacto</Label>
            <Input
              id={`contacto-correo-${clienteId}`}
              type="email"
              value={correo}
              onChange={(evento) => setCorreo(evento.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label htmlFor={`contacto-telefono-${clienteId}`}>Teléfono del contacto</Label>
            <Input
              id={`contacto-telefono-${clienteId}`}
              value={telefono}
              onChange={(evento) => setTelefono(evento.target.value)}
              maxLength={40}
            />
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor={`contacto-notas-${clienteId}`}>Notas del contacto</Label>
          <Input
            id={`contacto-notas-${clienteId}`}
            value={notas}
            onChange={(evento) => setNotas(evento.target.value)}
            maxLength={300}
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-texto-secundario">
          <input
            type="checkbox"
            checked={esPrincipal}
            onChange={(evento) => setEsPrincipal(evento.target.checked)}
          />
          Contacto principal del cliente
        </label>
        <div className="flex items-center gap-3">
          <Button type="submit" variante="contorno" tamano="sm" disabled={guardando}>
            {guardando ? 'Guardando…' : 'Agregar contacto'}
          </Button>
          {mensaje !== null && (
            <span role="status" className="text-xs text-texto-secundario">
              {mensaje}
            </span>
          )}
        </div>
      </form>
    </section>
  );
}
