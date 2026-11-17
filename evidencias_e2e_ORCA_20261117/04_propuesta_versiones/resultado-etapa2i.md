# Cierre B

```json
[
  {
    "paso": "costear-y-guardar-costos-B",
    "resultado": "ok",
    "detalle": {
      "costearHabilitado": true,
      "antes": "\tProceso\tMáquina / grupo\tOrigen de la tarifa\tPreparación (h)\tOperación (h)\tTotal (h)\tTarifa (h)\tCosto\n\nIT01\nSoporte metálico SM-2026-02\n\tCorte laser\tLaser Fibra\tTarifa del grupo\t0.50\t2.00\t2.50\t$512.50/h\t$1,281.25\nDOBLADO_CNC\tPress Brake\tTarifa del grupo\t0.25\t1.50\t1.75\t$512.50/h\t$896.88\nCosto de ruteo (tiempo por uso)\t$2,178.13\nOtros costos manuales\t$1,570.00\nTotal estimado de fabricación\t$3,748.13",
      "despues": "01\nSoporte metálico SM-2026-02\n\tCorte laser\tLaser Fibra\tTarifa del grupo\t0.50\t2.00\t2.50\t$512.50/h\t$1,281.25\nDOBLADO_CNC\tPress Brake\tTarifa del grupo\t0.25\t1.50\t1.75\t$512.50/h\t$896.88\n\nIT02\nPanel decorativo MDF-12\n\tCNC ROUTER\tCNC Router\tTarifa del grupo\t0.50\t1.50\t2.00\t$850.00/h\t$1,700.00\nCosto de ruteo (tiempo por uso)\t$3,878.13\nOtros costos manuales\t$1,570.00\nTotal estimado de fabricación\t$5,448.13",
      "eventos": []
    }
  },
  {
    "paso": "estado-tras-recarga",
    "resultado": "ok",
    "detalle": {
      "falt": "",
      "habilitado": true
    }
  }
]
```
