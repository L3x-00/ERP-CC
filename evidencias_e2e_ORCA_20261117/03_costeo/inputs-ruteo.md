# Inputs del ruteo

```json
[
  {
    "aria": "Setup horas IT01 fila 1",
    "type": "number",
    "val": "0.5",
    "id": ""
  },
  {
    "aria": "Run horas IT01 fila 1",
    "type": "number",
    "val": "2",
    "id": ""
  },
  {
    "aria": "Setup horas IT01 fila 2",
    "type": "number",
    "val": "0.25",
    "id": ""
  },
  {
    "aria": "Run horas IT01 fila 2",
    "type": "number",
    "val": "1.5",
    "id": ""
  },
  {
    "aria": "Setup horas IT02 fila 1",
    "type": "number",
    "val": "0",
    "id": ""
  },
  {
    "aria": "Run horas IT02 fila 1",
    "type": "number",
    "val": "0",
    "id": ""
  },
  {
    "aria": "Costo Material",
    "type": "text",
    "val": "",
    "id": "costo-material"
  },
  {
    "aria": "Detalle de Material",
    "type": "text",
    "val": "",
    "id": ""
  },
  {
    "aria": "Costo Otros",
    "type": "text",
    "val": "",
    "id": "costo-gastos_directos"
  },
  {
    "aria": "Detalle de Otros",
    "type": "text",
    "val": "",
    "id": ""
  },
  {
    "aria": null,
    "type": "number",
    "val": "",
    "id": ""
  }
]
```

Verificación:
```json
[
  {
    "item": "IT01",
    "fila": 1,
    "setup": "0.5",
    "run": "2"
  },
  {
    "item": "IT01",
    "fila": 2,
    "setup": "0.25",
    "run": "1.5"
  },
  {
    "item": "IT02",
    "fila": 1,
    "setup": "0.5",
    "run": "1.5"
  }
]
```
