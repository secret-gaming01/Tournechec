-- Tournechec (c) 2026 secret_gaming01 - Logiciel propriétaire. Copie, modification et déploiement interdits. Voir LICENSE.txt.
-- =====================================================================================
-- ENVOI DE VRAIS COURRIELS AUTOMATIQUES (Brevo)
-- -------------------------------------------------------------------------------------
-- À exécuter UNE SEULE FOIS dans Supabase : Dashboard -> SQL Editor -> coller -> Run.
-- Pré-requis : un compte Brevo gratuit (300 courriels/jour) -> Settings -> API Keys.
--
-- 1) Remplacer ci-dessous BREVO_API_KEY par ta clé Brevo.
-- 2) Remplacer BREVO_SENDER par une adresse d'expéditeur vérifiée sur Brevo
--    (Settings -> Sender identities -> vérif. par courriel, même une adresse Gmail).
-- 3) Exécuter le script. Idempotent : sans danger de ré-exécuter.
-- =====================================================================================

create schema if not exists private;

create extension if not exists pg_net;

-- Lien entre une notification et son tournoi (utilisé par les règles de sécurité).
alter table public.notifications add column if not exists tournament_id uuid;

-- Journal des courriels réellement envoyés (consultable par l'admin).
create table if not exists public.mail_log (
  id bigint generated always as identity primary key,
  to_email text not null,
  subject text not null,
  body text not null,
  created_at timestamptz not null default now()
);
alter table public.mail_log enable row level security;
drop policy if exists mail_log_select on public.mail_log;
create policy mail_log_select on public.mail_log for select using (public.is_admin());

-- Clés qui ne doivent JAMAIS sortir du serveur.
create table if not exists private.secrets (
  key text primary key,
  value text not null
);
insert into private.secrets (key, value) values
  ('BREVO_API_KEY', 'REMPLACE_MOI'),
  ('BREVO_SENDER', 'REMPLACE_MOI')
on conflict (key) do update set value = excluded.value;

-- True si l'utilisateur est admin, créateur ou arbitre du tournoi.
create or replace function public.can_manage_tournament(target uuid, u uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select (u is not null)
    and (
      public.is_admin()
      or (select exists(select 1 from public.tournaments t where t.id = target and t.creator_id = u))
      or (select exists(select 1 from public.tournament_arbitres ta where ta.tournament_id = target and ta.user_id = u))
    );
$$;

-- On ne peut transmettre une adresse courriel que si :
--   * le courriel est celui de son propre compte (confirmation d'inscription), OU
--   * on est admin, OU
--   * on est arbitre/créateur du tournoi lié (invitation, publication des tables...)
-- Sinon email reste vide : notification interne uniquement.
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert with check (
  auth.uid() is not null
  and (
    new.email = ''
    or (
      new.user_id = auth.uid()
      and exists(select 1 from public.profiles p where p.id = auth.uid() and p.email = new.email)
    )
    or public.is_admin()
    or (new.tournament_id is not null and public.can_manage_tournament(new.tournament_id, auth.uid()))
  )
);

-- Déclencheur : dès qu'une notification avec une adresse arrive, on envoie le courriel via Brevo.
create or replace function public.send_mail_via_brevo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_api text;
  v_from text;
  v_html text;
begin
  if new.email is null or new.email = '' then return new; end if;

  select value into v_api from private.secrets where key = 'BREVO_API_KEY';
  select value into v_from from private.secrets where key = 'BREVO_SENDER';

  if v_api is null or v_api = '' or v_api = 'REMPLACE_MOI'
     or v_from is null or v_from = '' or v_from = 'REMPLACE_MOI' then
    return new;
  end if;

  v_html := '<p>' || replace(replace(replace(replace(new.body, '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), E'\n', '<br>') || '</p>';

  perform net.http_post(
    url := 'https://api.brevo.com/v3/smtp/email',
    headers := jsonb_build_object(
      'accept', 'application/json',
      'api-key', v_api,
      'content-type', 'application/json'
    ),
    body := jsonb_build_object(
      'sender', jsonb_build_object('name', 'Tournechec', 'email', v_from),
      'to', jsonb_build_array(jsonb_build_object('email', new.email, 'name', coalesce(new.recipient_name, ''))),
      'subject', new.subject,
      'htmlContent', v_html
    )
  );

  insert into public.mail_log (to_email, subject, body)
  values (new.email, new.subject, new.body);

  return new;
end $$;

drop trigger if exists notifications_send_mail_trigger on public.notifications;
create trigger notifications_send_mail_trigger
after insert on public.notifications
for each row execute function public.send_mail_via_brevo();