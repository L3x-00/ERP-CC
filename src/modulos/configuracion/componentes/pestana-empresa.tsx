'use client';

import { useState } from 'react';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Textarea } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import { guardarDatosEmpresaAccion } from '@/modulos/configuracion/acciones/indice';
import type { ConfiguracionEmpresa, ConfiguracionSistema } from '@/modulos/configuracion/tipos/indice';

export interface PestanaEmpresaProps {
  datos: ConfiguracionEmpresa;
  onGuardado: (configuracion: ConfiguracionSistema) => void;
}

type Mensaje = { texto: string; tipo: 'exito' | 'error' };

export function PestanaEmpresa({ datos, onGuardado }: PestanaEmpresaProps) {
  const [formulario, setFormulario] = useState<ConfiguracionEmpresa>(datos);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setGuardando(true);
    setMensaje(null);
    try {
      const respuesta = await guardarDatosEmpresaAccion(formulario);
      if (!respuesta.exito || !respuesta.datos) {
        setMensaje({ texto: respuesta.exito ? 'No se recibió la configuración actualizada' : respuesta.error, tipo: 'error' });
        return;
      }
      onGuardado(respuesta.datos);
      setMensaje({ texto: 'Datos de empresa guardados', tipo: 'exito' });
    } catch {
      setMensaje({ texto: 'No se pudo guardar la empresa', tipo: 'error' });
    } finally {
      setGuardando(false);
    }
  }

  const cambiar = (campo: keyof ConfiguracionEmpresa, valor: string | null): void => {
    setFormulario((actual) => ({ ...actual, [campo]: valor }));
  };

  return (
    <form className="grid gap-4" onSubmit={guardar} aria-label="Datos de empresa">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="configuracion-nombre" obligatorio>Nombre comercial</Label>
          <Input id="configuracion-nombre" value={formulario.nombre} onChange={(e) => cambiar('nombre', e.target.value)} required maxLength={160} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="configuracion-razon-social" obligatorio>Razón social</Label>
          <Input id="configuracion-razon-social" value={formulario.razonSocial} onChange={(e) => cambiar('razonSocial', e.target.value)} required maxLength={200} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="configuracion-rfc" obligatorio>RFC</Label>
          <Input id="configuracion-rfc" value={formulario.rfc} onChange={(e) => cambiar('rfc', e.target.value.toUpperCase())} required maxLength={13} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="configuracion-telefono">Teléfono</Label>
          <Input id="configuracion-telefono" value={formulario.telefono} onChange={(e) => cambiar('telefono', e.target.value)} maxLength={40} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="configuracion-email">Correo administrativo</Label>
          <Input id="configuracion-email" type="email" value={formulario.email} onChange={(e) => cambiar('email', e.target.value)} maxLength={200} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="configuracion-direccion" obligatorio>Dirección fiscal</Label>
          <Textarea id="configuracion-direccion" value={formulario.direccion} onChange={(e) => cambiar('direccion', e.target.value)} required maxLength={300} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="configuracion-logo-url">URL del logo (opcional)</Label>
          <Input id="configuracion-logo-url" type="url" value={formulario.logoUrl ?? ''} onChange={(e) => cambiar('logoUrl', e.target.value || null)} placeholder="https://..." maxLength={2_048} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar empresa'}</Button>
        {mensaje ? (
          <p role={mensaje.tipo === 'error' ? 'alert' : 'status'} className={mensaje.tipo === 'error' ? 'text-sm text-peligro-texto' : 'text-sm text-exito-texto'}>
            {mensaje.texto}
          </p>
        ) : null}
      </div>
    </form>
  );
}
