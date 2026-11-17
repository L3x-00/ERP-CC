# Cierre comercial

```json
[
  {
    "paso": "login",
    "resultado": "ok",
    "detalle": null
  },
  {
    "paso": "entrega",
    "resultado": "ok",
    "detalle": {
      "tabla": "Órdenes con piezas pendientes de entregar\nORDEN\tCLIENTE\tESTADO\tÍTEMS\tPENDIENTE\tDISPONIBLE\tACCIONES\nO-1126_03\tAPN Manufacturing\t\nEn producción\t2\t290\t250\tPreparar entrega\nO-1126_07\tTaller QA QA1711\t\nProducción completada\t2\t75\t75\tPreparar entrega",
      "mensaje": ""
    }
  },
  {
    "paso": "nota-entrega-detalle-y-descarga",
    "resultado": "ok",
    "detalle": {
      "contexto": "QA) 15 de noviembre de 2026 Abrir NE-O-1126_02-02 FOLIO SII Interno NE-001033 O-1126_02 FOLIO SII Industrias Metálicas del Centro S.A. de C.V. Final · 50 de 150 50 CARLOS MENDOZA 13 de noviembre de 2026 Abrir NE-O-1126_02-01 FOLIO SII Interno NE-001032 O-1126_02 FOLIO SII Industrias Metálicas del Centro S.A. de C.V. Parcial · 100 de 150 100 asistente de CARLOS MENDOZA 13 de noviembre de 2026 Abrir NE-O-1126_04-01 FOLIO SII Interno NE-001031 O-1126_04 FOLIO SII MATROC Final · 200 de 200 200 su asistente 13 de noviembre de 2026 Abrir NE-O-1126_01-01 FOLIO SII Interno NE-001030 O-1126_01 FOLIO SII Cliente Demo SA de CV Final · 200 de 200 200 ASISTENTE DE JUAN PEREZ 13 de noviembre de 2026 Abrir"
    }
  },
  {
    "paso": "cobro",
    "resultado": "ok",
    "detalle": {
      "habiaFila": true,
      "contexto": "No cobrable Pendiente Historial Factura Promesa Cobrar INVCNC-0000033 O-1126_07 Taller QA QA1711 Estado de cuenta Por entregar $128,470.00 $128,470.00 Producción completada No cobrable Pendiente Historial Factura Promesa Cobrar INVCNC-0000029 O-1126_03 APN Manufacturing Estado de cuenta Por entregar $57,782.50 $57,782.50 En producción No cobrable Pendiente Historial Factura Promesa Cobrar Factura de INVCNC-0000033 Taller QA QA1711 · O-1126_07 · $128,470.00. La cuenta ya está vinculada a esta orden; aquí se registra su número fiscal. Número de factura o remisión Esta cuenta aún no es cobrable. El vencimiento se fija al entregar; puedes registrar ahora el número fiscal. Indica el folio fiscal y, si la cuenta ya es cobrable, el vencimiento. Cancelar Guardar factura Guardar y registrar abono ×"
    }
  },
  {
    "paso": "cierre-administrativo",
    "resultado": "ok",
    "detalle": {
      "habia": true,
      "detalle": "Cierre administrativo\n\nCargando comparativo…\n\nCerrar\n×",
      "teniaBoton": false
    }
  }
]
```
