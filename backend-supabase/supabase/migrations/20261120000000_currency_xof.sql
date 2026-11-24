-- =====================================================================
-- MM Cosmétiques Stock Pro — Devise affichée : XOF (franc CFA BCEAO)
-- Redéfinit le message d'alerte d'écart de caisse (« F » → « XOF »)
-- et convertit les notifications déjà enregistrées.
-- =====================================================================

create or replace function public.submit_daily_report(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r public.daily_reports; v_store text; v_user text;
begin
  perform public.assert_role('super_admin','pole_chief');
  select * into r from public.daily_reports where id = p_id for update;
  perform public.assert_store(r.store_id);
  if r.status not in ('draft','rejected') then raise exception 'Déclaration déjà envoyée'; end if;
  update public.daily_reports set status = 'submitted' where id = p_id returning * into r;

  select name into v_store from public.stores where id = r.store_id;
  select first_name || ' ' || last_name into v_user from public.users where id = auth.uid();
  insert into public.notifications (store_id, target_roles, type, severity, title, message)
  values (r.store_id, array['super_admin','store_admin'], 'daily_report', 'info', 'Nouvelle déclaration',
          format('%s a soumis la déclaration du %s — %s.', v_user, r.report_date, v_store));
  if abs(r.variance_pct) > 2 then
    insert into public.notifications (store_id, target_roles, type, severity, title, message)
    values (r.store_id, array['super_admin','store_admin'], 'cash_variance', 'critical', 'Écart de caisse',
            format('Écart de %s %% (%s XOF) sur %s le %s.', r.variance_pct, round(r.variance), v_store, r.report_date));
  end if;
end $$;

update public.notifications
   set message = regexp_replace(message, '([0-9]) F\)', '\1 XOF)', 'g')
 where type = 'cash_variance' and message ~ '[0-9] F\)';
