# B: confirmación de ruteo/costos

TEXTO:
Subtotal de venta
$110,750.00
IVA (16%)
$17,720.00
Total cliente
$128,470.00
Costo estimado total
$5,448.13
Ruteo estimado
IT01
Soporte metálico SM-2026-02
Ruteo guardado y costeado
Proceso
Proceso…
CNC ROUTER · Router CNC
Corte laser · Corte laser
DOBLADO_CNC · Doblado CNC
Grupo de equipo
Equipo…
CNC Router
Laser Fibra
Press Brake
Planeación usará Laser Fibra (área Corte laser) para elegir la máquina.
Preparación (h)
Operación (h)
Total (h)
2.50 h
×
Tarifa / Origen
$512.50/h
Tarifa del grupo «Laser Fibra»
Costo estimado
$1,281.25
Proceso
Proceso…
CNC ROUTER · Router CNC
Corte laser · Corte laser
DOBLADO_CNC · Doblado CNC
Grupo de equipo
Equipo…
CNC Router
Laser Fibra
Press Brake
Planeación usará Press Brake (área Doblado CNC) para elegir la máquina.
Preparación (h)
Operación (h)
Total (h)
1.75 h
×
Tarifa / Origen
$512.50/h
Tarifa del grupo «Press Brake»
Costo estimado
$896.88
Agregar fila
Guardar ruteo
IT02
Panel decorativo MDF-12
Requiere revisión
Proceso
Proceso…
CNC ROUTER · Router CNC
Corte laser · Corte laser
DOBLADO_CNC · Doblado CNC
Grupo de equipo
Equipo…
CNC Router
Laser Fibra
Press Brake
Planeación usará CNC Router (área Router CNC) para elegir la máquina.
Preparación (h)
Operación (h)
Total (h)
2.00 h
×
Tarifa / Origen
$850.00/h
Tarifa del grupo «CNC Router»
Costo estimado
$1,700.00
Agregar fila
Guardar ruteo

Costo del ruteo: $3,878.13 · sustituye al costo manual de máquina

Costear ruteo

El ruteo ya está costeado. Si cambias horas o tarifa, guarda el ruteo otra vez para volver a costearlo.

Costeo interno
Material, otros costos y su detalle
Material
Otros
Guardar costos
Costo total estimado de fabricación

Este desglose muestra los procesos de cada partida; no agrega ítems comerciales. El PDF de la propuesta solo incluye las partidas activas, una vez cada una.

Regla V1: tarifa propia de la máquina → tarifa estándar del grupo de equipo (definida en Tarifas / TC) → tarifa de respaldo, siempre señalada. Cada operación muestra el origen de la tarifa que realmente usó.

Ítem	Proceso	Máquina / grupo	Origen de la tarifa	Preparación (h)	Operación (h)	Total (h)	Tarifa (h)	Costo

IT01
Soporte metálico SM-2026-02
	Corte laser	Laser Fibra	Tarifa del grupo	0.50	2.00	2.50	$512.50/h	$1,281.25
DOBLADO_CNC	Press Brake	Tarifa del grupo	0.25	1.50	1.75	$512.50/h	$896.88

IT02
Panel decorativo MDF-12
	CNC ROUTER	CNC Router	Tarifa del grupo	0.50	1.50	2.00	$850.00/h	$1,700.00
Costo de ruteo (tiempo por uso)	$3,878.13
Otros costos manuales	$1,570.00
Total estimado de fabricación	$5,448.13
Material del cliente
Material que aporta el cliente para este ítem. No se costea ni descuenta inventario propio.
Ítem
IT01 · Soporte metálico SM-2026-02
IT02 · Panel decorativo MDF-12

Este ítem no tiene material del cliente declarado.

Material
Selecciona un material
CRS- — Acero al carbon
MDF-12 — MDF 12 mm
CRS-14 — Acero al carbón calibre 14
CRS-16 — Acero al carbón Calibre 16
Cantidad
Agregar

BOTONES:
```json
[
  {
    "t": "×",
    "d": false,
    "title": "",
    "aria": "Quitar fila 1 de IT01"
  },
  {
    "t": "×",
    "d": false,
    "title": "",
    "aria": "Quitar fila 2 de IT01"
  },
  {
    "t": "Agregar fila",
    "d": false,
    "title": "",
    "aria": null
  },
  {
    "t": "Guardar ruteo",
    "d": false,
    "title": "",
    "aria": null
  },
  {
    "t": "×",
    "d": false,
    "title": "",
    "aria": "Quitar fila 1 de IT02"
  },
  {
    "t": "Agregar fila",
    "d": false,
    "title": "",
    "aria": null
  },
  {
    "t": "Guardar ruteo",
    "d": false,
    "title": "",
    "aria": null
  },
  {
    "t": "Costear ruteo",
    "d": true,
    "title": "El ruteo ya está costeado. Edita y guarda un ítem para volver a costearlo.",
    "aria": null
  },
  {
    "t": "Costeo interno Material, otros costos y su detalle",
    "d": false,
    "title": "",
    "aria": "Mostrar Costeo interno"
  },
  {
    "t": "Guardar costos",
    "d": false,
    "title": "",
    "aria": null
  },
  {
    "t": "Material del cliente Material que aporta el cliente para este ítem. No se costea ni descuenta inventario propio.",
    "d": false,
    "title": "",
    "aria": "Mostrar Material del cliente"
  },
  {
    "t": "Agregar",
    "d": false,
    "title": "",
    "aria": null
  }
]
```
