DO $$
DECLARE
  item record;
  max_id bigint;
  sequence_name text;
BEGIN
  FOR item IN
    SELECT
      ns.nspname AS table_schema,
      tbl.relname AS table_name,
      col.attname AS column_name,
      seq_ns.nspname AS sequence_schema,
      seq.relname AS sequence_name
    FROM pg_class seq
    JOIN pg_namespace seq_ns ON seq_ns.oid = seq.relnamespace
    JOIN pg_depend dep ON dep.objid = seq.oid
    JOIN pg_class tbl ON dep.refobjid = tbl.oid
    JOIN pg_namespace ns ON ns.oid = tbl.relnamespace
    JOIN pg_attribute col ON col.attrelid = tbl.oid AND col.attnum = dep.refobjsubid
    WHERE seq.relkind = 'S'
      AND ns.nspname = 'public'
  LOOP
    EXECUTE format('SELECT COALESCE(MAX(%I), 0) FROM %I.%I', item.column_name, item.table_schema, item.table_name) INTO max_id;
    sequence_name := format('%I.%I', item.sequence_schema, item.sequence_name);

    IF max_id > 0 THEN
      EXECUTE format('SELECT setval(%L, %s, true)', sequence_name, max_id);
    ELSE
      EXECUTE format('SELECT setval(%L, 1, false)', sequence_name);
    END IF;
  END LOOP;
END $$;
