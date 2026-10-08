-- Selcore ffznkypurnocabqyxpps only. All temporary fixture changes are rolled back.
BEGIN;
DO $checks$
DECLARE customer_role text; table_name text; operation text; denied boolean; affected integer;
BEGIN
  FOREACH customer_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    EXECUTE format('SET LOCAL ROLE %I',customer_role);
    FOREACH table_name IN ARRAY ARRAY['categories','brands','products','product_images'] LOOP
      FOREACH operation IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
        denied := false;
        BEGIN
          IF operation = 'INSERT' THEN
            -- Table write privilege is checked before constraints/defaults.
            EXECUTE format('INSERT INTO public.%I DEFAULT VALUES',table_name);
          ELSIF operation = 'UPDATE' THEN
            EXECUTE format('UPDATE public.%I SET id=id',table_name);
          ELSE
            EXECUTE format('DELETE FROM public.%I',table_name);
          END IF;
        EXCEPTION WHEN insufficient_privilege THEN denied := true;
        END;
        IF NOT denied THEN RAISE EXCEPTION 'Unexpected % permission on % for %',operation,table_name,customer_role; END IF;
      END LOOP;
    END LOOP;
    denied := false;
    BEGIN
      INSERT INTO storage.objects(bucket_id,name) VALUES('product-images','phase2-security-probe');
    EXCEPTION WHEN insufficient_privilege THEN denied := true;
    END;
    IF NOT denied THEN RAISE EXCEPTION 'Unexpected Storage INSERT permission for %',customer_role; END IF;
    UPDATE storage.objects SET metadata=metadata WHERE bucket_id='product-images';
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 0 THEN RAISE EXCEPTION 'Unexpected Storage replacement permission for %',customer_role; END IF;
    -- Storage also has a statement guard that rejects direct SQL deletion.
    affected := 0;
    BEGIN
      DELETE FROM storage.objects WHERE bucket_id='product-images';
      GET DIAGNOSTICS affected = ROW_COUNT;
    EXCEPTION WHEN insufficient_privilege THEN affected := 0;
    END;
    IF affected <> 0 THEN RAISE EXCEPTION 'Unexpected Storage DELETE permission for %',customer_role; END IF;
    EXECUTE 'RESET ROLE';
  END LOOP;
END
$checks$;
UPDATE public.products SET is_active=false WHERE id=1;
DO $inactive$
DECLARE customer_role text; products_visible integer; images_visible integer;
BEGIN
  FOREACH customer_role IN ARRAY ARRAY['anon','authenticated'] LOOP
    EXECUTE format('SET LOCAL ROLE %I',customer_role);
    SELECT count(*) INTO products_visible FROM public.products WHERE id=1;
    SELECT count(*) INTO images_visible FROM public.product_images WHERE product_id=1;
    IF products_visible <> 0 OR images_visible <> 0 THEN RAISE EXCEPTION 'Inactive product or image exposed to %',customer_role; END IF;
    IF (SELECT count(*) FROM public.products) <> 23 THEN RAISE EXCEPTION 'Active public catalogue read failed for %',customer_role; END IF;
    EXECUTE 'RESET ROLE';
  END LOOP;
END
$inactive$;
ROLLBACK;
SELECT jsonb_build_object('catalogue_customer_insert_update_delete','denied',
  'storage_customer_insert','denied','storage_customer_update_delete_rows',0,
  'inactive_product_and_image','hidden','active_products_during_fixture',23,
  'roles_tested',ARRAY['anon','authenticated'],'fixture','rolled back') AS security_results;
