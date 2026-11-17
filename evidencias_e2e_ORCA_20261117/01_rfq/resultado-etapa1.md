# Resultado etapa 1 — RFQ y cliente

```json
{
  "resultados": [
    {
      "paso": "login",
      "resultado": "ok",
      "detalle": {
        "url": "https://erp-cc-flame.vercel.app/dashboard"
      }
    },
    {
      "paso": "abrir-nuevo-rfq",
      "resultado": "ok",
      "detalle": {
        "dialog": null
      }
    },
    {
      "paso": "alta-rapida-cliente",
      "resultado": "ok",
      "detalle": {
        "razon": "Manufactura Fronteriza QA1711 S.A. de C.V.",
        "rfc": "MFQA261117AB1",
        "estado": "prospecto"
      }
    },
    {
      "paso": "datos-generales-rfq",
      "resultado": "ok",
      "detalle": {
        "valorCliente": "",
        "monedas": [
          {
            "valor": "MXN",
            "texto": "MXN — Peso mexicano",
            "deshabilitado": false
          },
          {
            "valor": "USD",
            "texto": "USD — Dólar estadounidense",
            "deshabilitado": false
          }
        ],
        "canales": [
          {
            "valor": "",
            "texto": "Selecciona el canal",
            "deshabilitado": false
          },
          {
            "valor": "WHATSAPP",
            "texto": "WhatsApp",
            "deshabilitado": false
          },
          {
            "valor": "CORREO",
            "texto": "Correo",
            "deshabilitado": false
          },
          {
            "valor": "TELEFONO",
            "texto": "Teléfono",
            "deshabilitado": false
          },
          {
            "valor": "VISITA",
            "texto": "Visita",
            "deshabilitado": false
          },
          {
            "valor": "REFERIDO",
            "texto": "Referido",
            "deshabilitado": false
          },
          {
            "valor": "OTRO",
            "texto": "Otro",
            "deshabilitado": false
          }
        ],
        "fechaRequerida": "2026-11-29"
      }
    },
    {
      "paso": "catalogo-y-items",
      "resultado": "error",
      "detalle": "Material CRS-14 no existe en catálogo"
    }
  ],
  "hallazgos": [
    {
      "severidad": "media",
      "paso": "catalogo-y-items",
      "mensaje": "Material CRS-14 no existe en catálogo"
    }
  ],
  "ESTADO": {
    "sufijo": "QA1711",
    "razon": "Manufactura Fronteriza QA1711 S.A. de C.V."
  }
}
```
