# Resultado etapa2g

```json
[
  {
    "paso": "ruteo-y-costos-B",
    "resultado": "ok",
    "detalle": {
      "marcadores": 0,
      "fabricacion": "Costo total estimado de fabricación\n\nEste desglose muestra los procesos de cada partida; no agrega ítems comerciales. El PDF de la propuesta solo incluye las partidas activas, una vez cada una.\n\nRegla V1: tarifa propia de la máquina → tarifa estándar del grupo de equipo (definida en Tarifas / TC) → tarifa de respaldo, siempre señalada. Cada operación muestra el origen de la tarifa que realmente usó.\n\nÍtem\tProceso\tMáquina / grupo\tOrigen de la tarifa\tPreparación (h)\tOperación (h)\tTotal (h)\tTarifa (h)\tCosto\n\nIT01\nSoporte metálico SM-2026-02\n\tCorte laser\tLaser Fibra\tTarifa del grupo\t0.50\t2.00\t2.50\t$512.50/h\t$1,281.25\nDOBLADO_CNC\tPress Brake\tTarifa del grupo\t0.25\t1.50\t1.75\t$512.50/h\t$896.88\n\nIT02\nPanel decorativo MDF-12\n\tCNC ROUTER\tCNC Router\tTarifa del grupo\t0.50\t1.50\t2.00\t$850.00/h\t$1,700.00\nCosto de ruteo (tiempo por uso)\t$3,878.13\nOtros costos manuales\t$1,570.00\nTotal estimado de fabricación\t$5,448.13"
    }
  },
  {
    "paso": "validar-pdf-enviar-B",
    "resultado": "error",
    "detalle": "Validar B deshabilitado: Todavía no puedes validar: falta lo siguiente\n\nNo se perdió nada de tu trabajo. Completa estos puntos y «Validar» se habilitará solo.\n\nguardar el ruteo para confirmarlo\nguardar los costos para confirmarlos\nIr a Ruteo/Costeo"
  }
]
```
