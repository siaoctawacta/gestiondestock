-- =====================================================================
-- MM Cosmétiques Stock Pro — Montant déclaré jamais négatif
-- La saisie de fin de journée acceptait un montant encaissé négatif.
-- NOT VALID : la contrainte s'applique aux nouvelles écritures sans
-- bloquer la migration si une ancienne ligne était déjà négative.
-- (report_expenses.amount a déjà « check (amount > 0) ».)
-- =====================================================================

alter table public.daily_reports
  add constraint daily_reports_declared_amount_nonneg check (declared_amount >= 0) not valid;
