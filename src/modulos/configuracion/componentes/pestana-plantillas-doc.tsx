'use client';

import { useState } from 'react';
import { Button } from '@/compartido/componentes/ui/button';
import { Input, Textarea } from '@/compartido/componentes/ui/input';
import { Label } from '@/compartido/componentes/ui/label';
import { guardarPlantillaDocAccion } from '@/modulos/configuracion/acciones/indice';
import type { ConfiguracionSistema, PlantillaDocumentoConfig } from '@/modulos/configuracion/tipos/indice';

type Mensaje = { texto: string; tipo: 'exito' | 'error' };

export function PestanaPlantillasDoc({ configuracion, onGuardado }: { configuracion: ConfiguracionSistema; onGuardado: (configuracion: ConfiguracionSistema) => void }) {
  const [plantilla, setPlantilla] = useState<PlantillaDocumentoConfig>(configuracion.plantillasDoc.T1);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function guardar(evento: React.FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    setGuardando(true);
    setMensaje(null);
    try {
      const respuesta = await guardarPlantillaDocAccion({ clave: 'T1', ...plantilla });
      if (!respuesta.exito || !respuesta.datos) {
        setMensaje({ texto: respuesta.exito ? 'No se recibió la plantilla actualizada' : respuesta.error, tipo: 'error' });
        return;
      }
      onGuardado(respuesta.datos);
      setMensaje({ texto: 'Plantilla T1 guardada', tipo: 'exito' });
    } catch {
      setMensaje({ texto: 'No se pudo guardar la plantilla', tipo: 'error' });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form className="grid gap-4" onSubmit={guardar} aria-label="Plantilla T1">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="configuracion-plantilla-color">Color de acento</Label>
          <Input id="configuracion-plantilla-color" type="color" value={plantilla.colorAcento} onChange={(e) => setPlantilla((v) => ({ ...v, colorAcento: e.target.value }))} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="configuracion-plantilla-encabezado">Texto de encabezado</Label>
          <Input id="configuracion-plantilla-encabezado" value={plantilla.textoEncabezado} onChange={(e) => setPlantilla((v) => ({ ...v, textoEncabezado: e.target.value }))} maxLength={200} />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="configuracion-plantilla-terminos" obligatorio>Términos y condiciones</Label>
          <Textarea id="configuracion-plantilla-terminos" value={plantilla.terminosCondiciones} onChange={(e) => setPlantilla((v) => ({ ...v, terminosCondiciones: e.target.value }))} maxLength={5_000} required />
        </div>
        <div className="grid gap-1.5 sm:col-span-2">
          <Label htmlFor="configuracion-plantilla-pie">Texto de pie de página</Label>
          <Textarea id="configuracion-plantilla-pie" value={plantilla.textoPiePagina} onChange={(e) => setPlantilla((v) => ({ ...v, textoPiePagina: e.target.value }))} maxLength={500} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar plantilla T1'}</Button>
        {mensaje ? (
          <p role={mensaje.tipo === 'error' ? 'alert' : 'status'} className={mensaje.tipo === 'error' ? 'text-sm text-peligro-texto' : 'text-sm text-exito-texto'}>
            {mensaje.texto}
          </p>
        ) : null}
      </div>
    </form>
  );
}
