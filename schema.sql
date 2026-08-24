-- Tournechec (c) 2026 secret_gaming01 - Logiciel propriétaire. Copie, modification et déploiement interdits. Voir LICENSE.txt.
-- ============================================================
-- Tournechec — Schéma Supabase (PostgreSQL)
-- À exécuter dans : Supabase > SQL Editor > New query > Run
-- ============================================================

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  name text not null default 'Joueur',
  school_year text not null default '',
  elo int not null default 1200 check (elo between 0 and 3500),
  role text not null default 'joueur' check (role in ('joueur', 'arbitre', 'admin')),
  banned boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index if not exists profiles_email_lower_idx on public.profiles (lower(email));

create table if not exists public.tournaments (
  id bigint generated always as identity primary key,
  name text not null,
  description text not null default '',
  rules text not null default '',
  location text not null default '',
  start_date text not null default '',
  end_date text not null default '',
  format text not null default 'suisse' check (format in ('suisse', 'elimination')),
  max_rounds int not null default 7,
  status text not null default 'brouillon' check (status in ('brouillon', 'publie', 'en_cours', 'termine')),
  public boolean not null default true,
  creator_id uuid references public.profiles(id) on delete set null,
  current_round int not null default 0,
  champion text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.tournament_arbitres (
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  primary key (tournament_id, user_id)
);

create table if not exists public.registrations (
  id bigint generated always as identity primary key,
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  present boolean not null default true,
  registered_at timestamptz not null default now(),
  unique (tournament_id, user_id)
);

create table if not exists public.rounds (
  id bigint generated always as identity primary key,
  tournament_id bigint not null references public.tournaments(id) on delete cascade,
  round_number int not null,
  created_at timestamptz not null default now()
);

create table if not exists public.matches (
  id bigint generated always as identity primary key,
  round_id bigint not null references public.rounds(id) on delete cascade,
  table_number int not null,
  white_id uuid,
  black_id uuid,
  result text check (result in ('1-0', '0-1', '1/2', 'bye') or result is null),
  constraint matches_white_id_fkey foreign key (white_id) references public.profiles(id) on delete set null,
  constraint matches_black_id_fkey foreign key (black_id) references public.profiles(id) on delete set null
);
create index if not exists idx_matches_round on public.matches(round_id);

create table if not exists public.notifications (
  id bigint generated always as identity primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  recipient_name text not null default '',
  email text not null default '',
  subject text not null,
  body text not null default '',
  kind text not null default 'auto' check (kind in ('auto', 'manuel')),
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.support_messages (
  id bigint generated always as identity primary key,
  name text not null default '',
  email text not null,
  message text not null,
  handled boolean not null default false,
  created_at timestamptz not null default now()
);

-- ============================================================
-- Fonctions de sécurité (SECURITY DEFINER : contournent la RLS
-- en interne mais n'exposent que des booléens)
-- ============================================================

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

create or replace function public.is_tournament_arbitre(tid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tournament_arbitres a
    where a.tournament_id = tid and a.user_id = auth.uid()
  );
$$;

create or replace function public.can_view_tournament(tid bigint) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.tournaments t
    where t.id = tid
      and (
        t.public
        or t.creator_id = auth.uid()
        or exists (select 1 from public.registrations r where r.tournament_id = tid and r.user_id = auth.uid())
        or exists (select 1 from public.tournament_arbitres a where a.tournament_id = tid and a.user_id = auth.uid())
        or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
      )
  );
$$;

create or replace function public.can_edit_profile(pid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select pid = auth.uid()
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin')
    or exists (
      select 1
      from public.registrations r
      join public.tournaments t on t.id = r.tournament_id
      where r.user_id = pid
        and (
          exists (select 1 from public.tournament_arbitres a where a.tournament_id = t.id and a.user_id = auth.uid())
          or t.creator_id = auth.uid()
        )
    );
$$;

-- Création automatique du profil à l'inscription.
-- Le PREMIER compte créé devient automatiquement Administrateur.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name, school_year, elo, role)
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(nullif(new.raw_user_meta_data->>'name', ''), 'Joueur'),
    coalesce(new.raw_user_meta_data->>'school_year', ''),
    least(3500, greatest(0, coalesce((new.raw_user_meta_data->>'elo')::int, 1200))),
    case when not exists (select 1 from public.profiles where role = 'admin') then 'admin' else 'joueur' end
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Outil pour l'administrateur (à utiliser dans le SQL Editor si besoin) :
--   select public.promote_admin('ton-courriel@exemple.com');
create or replace function public.promote_admin(target_email text) returns void
language sql security definer set search_path = public as $$
  update public.profiles set role = 'admin'
  where lower(email) = lower(target_email);
$$;

-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.profiles enable row level security;
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles for select using (true);
drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles for insert with check (id = auth.uid());
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles for update using (public.can_edit_profile(id)) with check (public.can_edit_profile(id));
drop policy if exists profiles_delete on public.profiles;
create policy profiles_delete on public.profiles for delete using (id = auth.uid() or public.is_admin());

alter table public.tournaments enable row level security;
drop policy if exists tournaments_select on public.tournaments;
create policy tournaments_select on public.tournaments for select using (public.can_view_tournament(id));
drop policy if exists tournaments_insert on public.tournaments;
create policy tournaments_insert on public.tournaments for insert with check (auth.uid() is not null and creator_id = auth.uid());
drop policy if exists tournaments_update on public.tournaments;
create policy tournaments_update on public.tournaments for update using (public.is_tournament_arbitre(id) or public.is_admin());
drop policy if exists tournaments_delete on public.tournaments;
create policy tournaments_delete on public.tournaments for delete using (creator_id = auth.uid() or public.is_admin());

alter table public.tournament_arbitres enable row level security;
drop policy if exists arbitres_select on public.tournament_arbitres;
create policy arbitres_select on public.tournament_arbitres for select using (public.can_view_tournament(tournament_id));
drop policy if exists arbitres_insert on public.tournament_arbitres;
create policy arbitres_insert on public.tournament_arbitres for insert with check (
  exists (select 1 from public.tournaments t where t.id = tournament_id and (t.creator_id = auth.uid() or public.is_admin()))
);
drop policy if exists arbitres_delete on public.tournament_arbitres;
create policy arbitres_delete on public.tournament_arbitres for delete using (
  exists (select 1 from public.tournaments t where t.id = tournament_id and (t.creator_id = auth.uid() or public.is_admin()))
);

alter table public.registrations enable row level security;
drop policy if exists registrations_select on public.registrations;
create policy registrations_select on public.registrations for select using (user_id = auth.uid() or public.can_view_tournament(tournament_id));
drop policy if exists registrations_insert on public.registrations;
create policy registrations_insert on public.registrations for insert with check (
  (auth.uid() is not null and user_id = auth.uid() and exists (
    select 1 from public.tournaments t where t.id = tournament_id and t.public and t.status <> 'termine'
  ))
  or exists (select 1 from public.tournaments t where t.id = tournament_id and (public.is_tournament_arbitre(t.id) or public.is_admin()))
);
drop policy if exists registrations_update on public.registrations;
create policy registrations_update on public.registrations for update using (public.is_tournament_arbitre(tournament_id) or public.is_admin());
drop policy if exists registrations_delete on public.registrations;
create policy registrations_delete on public.registrations for delete using (
  user_id = auth.uid() or public.is_tournament_arbitre(tournament_id) or public.is_admin()
);

alter table public.rounds enable row level security;
drop policy if exists rounds_select on public.rounds;
create policy rounds_select on public.rounds for select using (public.can_view_tournament(tournament_id));
drop policy if exists rounds_write on public.rounds;
create policy rounds_write on public.rounds for insert with check (public.is_tournament_arbitre(tournament_id) or public.is_admin());
drop policy if exists rounds_update on public.rounds;
create policy rounds_update on public.rounds for update using (public.is_tournament_arbitre(tournament_id) or public.is_admin());
drop policy if exists rounds_delete on public.rounds;
create policy rounds_delete on public.rounds for delete using (public.is_tournament_arbitre(tournament_id) or public.is_admin());

alter table public.matches enable row level security;
drop policy if exists matches_select on public.matches;
create policy matches_select on public.matches for select using (
  exists (select 1 from public.rounds r where r.id = round_id and public.can_view_tournament(r.tournament_id))
);
drop policy if exists matches_insert on public.matches;
create policy matches_insert on public.matches for insert with check (
  exists (select 1 from public.rounds r where r.id = round_id and (public.is_tournament_arbitre(r.tournament_id) or public.is_admin()))
);
drop policy if exists matches_update on public.matches;
create policy matches_update on public.matches for update using (
  exists (select 1 from public.rounds r where r.id = round_id and (public.is_tournament_arbitre(r.tournament_id) or public.is_admin()))
);
drop policy if exists matches_delete on public.matches;
create policy matches_delete on public.matches for delete using (
  exists (select 1 from public.rounds r where r.id = round_id and (public.is_tournament_arbitre(r.tournament_id) or public.is_admin()))
);

alter table public.notifications enable row level security;
drop policy if exists notifications_select on public.notifications;
create policy notifications_select on public.notifications for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists notifications_insert on public.notifications;
create policy notifications_insert on public.notifications for insert with check (auth.uid() is not null);
drop policy if exists notifications_update on public.notifications;
create policy notifications_update on public.notifications for update using (user_id = auth.uid() or public.is_admin());
drop policy if exists notifications_delete on public.notifications;
create policy notifications_delete on public.notifications for delete using (public.is_admin());

alter table public.support_messages enable row level security;
drop policy if exists support_insert on public.support_messages;
create policy support_insert on public.support_messages for insert with check (true);
drop policy if exists support_select on public.support_messages;
create policy support_select on public.support_messages for select using (public.is_admin());
drop policy if exists support_update on public.support_messages;
create policy support_update on public.support_messages for update using (public.is_admin());
drop policy if exists support_delete on public.support_messages;
create policy support_delete on public.support_messages for delete using (public.is_admin());
