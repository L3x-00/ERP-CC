-- El monedero AR se calcula y audita a cuatro decimales. La definición
-- original de clientes era (14,2), lo que podía redondear conversiones USD→MXN.
ALTER TABLE public.clientes
  ALTER COLUMN saldo_a_favor TYPE numeric(14,4)
  USING saldo_a_favor::numeric(14,4);
