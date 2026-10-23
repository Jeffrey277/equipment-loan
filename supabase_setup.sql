-- supabase_setup.sql – 공용 장비 대여 현황판
-- Supabase academy 프로젝트 → SQL Editor에 전체를 붙여 넣고 Run 한다.
-- 여러 번 실행해도 처음 상태(가상 장비 10개, 대여 기록 0건)로 돌아간다.
-- ⚠ 다시 실행하면 그동안 등록한 장비와 대여 기록이 모두 지워진다.
-- 업무 규칙 번호(R-xx)는 PRD.md 6장을 따른다.


-- ─────────────────────────────────────────────
-- 0. 처음 상태로 (표를 지우면 정책 · 트리거 · 인덱스도 함께 지워진다)
-- ─────────────────────────────────────────────
drop table if exists public.eqp_loans cascade;
drop table if exists public.eqp_items cascade;
drop function if exists public.eqp_before_loan_insert() cascade;
drop function if exists public.eqp_before_loan_update() cascade;
drop function if exists public.eqp_after_loan_change() cascade;
drop function if exists public.eqp_before_item_delete() cascade;


-- ─────────────────────────────────────────────
-- 1. 표
-- ─────────────────────────────────────────────

-- 장비
create table public.eqp_items (
  id         bigint generated always as identity primary key,
  name       text not null check (char_length(trim(name)) between 1 and 50),
  category   text not null check (category in ('노트북', '영상', '측정', '통신', '기타')),
  location   text not null check (char_length(trim(location)) between 1 and 50),
  -- R-07 상태는 대여 표의 트리거만 바꾼다 (화면에는 이 칸의 쓰기 권한 없음, 3장)
  status     text not null default '대여 가능' check (status in ('대여 가능', '대여중')),
  -- R-03 등록한 사람. 화면이 보내지 않고 DB가 로그인한 사람으로 채운다. 비어 있으면 기본 장비
  owner_id   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

-- 대여
create table public.eqp_loans (
  id          bigint generated always as identity primary key,
  -- R-08 대여 기록이 있는 장비는 삭제 불가
  item_id     bigint not null references public.eqp_items(id) on delete restrict,
  -- R-02 빌린 사람. 트리거가 로그인한 사람으로 정한다
  user_id     uuid not null default auth.uid() references auth.users(id),
  -- R-05 대여일은 DB가 한국 날짜 오늘로 정한다 (트리거가 덮어씀)
  start_date  date not null default (now() at time zone 'Asia/Seoul')::date,
  due_date    date not null,
  status      text not null default '대여중' check (status in ('대여중', '반납완료')),
  returned_at timestamptz,
  created_at  timestamptz not null default now(),
  -- R-05 반납예정일은 대여일보다 앞설 수 없고, 대여일부터 7일 이내
  constraint eqp_loans_due_range check (due_date between start_date and start_date + 7),
  -- R-06 대여중이면 반납 시각이 없고, 반납완료면 반납 시각이 있다
  constraint eqp_loans_returned_match check (
    (status = '대여중'   and returned_at is null) or
    (status = '반납완료' and returned_at is not null)
  )
);

-- R-04 '대여중' 기록은 장비당 하나만 (동시에 두 사람이 눌러도 하나만 들어간다)
create unique index eqp_loans_one_active on public.eqp_loans (item_id) where status = '대여중';
create index eqp_loans_user on public.eqp_loans (user_id);


-- ─────────────────────────────────────────────
-- 2. 트리거
-- ─────────────────────────────────────────────

-- 대여 전 : 빌린 사람 · 대여일 · 상태를 DB가 정하고, 대여 가능 여부와 반납예정일을 검사
create function public.eqp_before_loan_insert()
returns trigger
language plpgsql
security definer          -- 장비 행을 잠그려면 RLS를 거치지 않아야 한다
set search_path = public
as $$
declare
  v_status text;
begin
  -- R-02 빌린 사람은 로그인한 본인
  if auth.uid() is null then
    raise exception '로그인한 사용자만 대여할 수 있습니다.';
  end if;
  new.user_id     := auth.uid();
  -- R-05 대여일 = 한국 날짜 오늘
  new.start_date  := (now() at time zone 'Asia/Seoul')::date;
  new.status      := '대여중';
  new.returned_at := null;
  new.created_at  := now();

  -- R-04 이미 대여중인 장비는 다시 대여 불가 (행을 잠가 동시 대여를 막는다)
  select status into v_status from eqp_items where id = new.item_id for update;
  if not found then
    raise exception '없는 장비입니다. 새로 불러오기 후 다시 시도하세요.';
  end if;
  if v_status = '대여중' then
    raise exception '이미 대여중인 장비입니다. 반납된 뒤 다시 시도하세요.';
  end if;

  -- R-05 반납예정일 검사 (check 제약보다 먼저 한국어 이유를 보여 주기 위해)
  if new.due_date is null then
    raise exception '반납예정일을 고르세요.';
  end if;
  if new.due_date < new.start_date then
    raise exception '반납예정일은 대여일(%)보다 앞설 수 없습니다.', new.start_date;
  end if;
  if new.due_date > new.start_date + 7 then
    raise exception '반납예정일은 대여일부터 7일 이내(%까지)여야 합니다.', new.start_date + 7;
  end if;

  return new;
end;
$$;

create trigger eqp_loans_before_insert
  before insert on public.eqp_loans
  for each row execute function public.eqp_before_loan_insert();


-- 반납 전 : 대여중 → 반납완료 한 방향만, 반납 시각은 DB가 기록
create function public.eqp_before_loan_update()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- R-06 반납된 대여는 다시 고칠 수 없음
  if old.status = '반납완료' then
    raise exception '이미 반납된 대여는 고칠 수 없습니다.';
  end if;
  if new.status is distinct from '반납완료' then
    raise exception '대여 기록은 반납(반납완료)으로만 바꿀 수 있습니다.';
  end if;

  -- R-06 반납 외의 칸은 그대로 둔다
  new.item_id    := old.item_id;
  new.user_id    := old.user_id;
  new.start_date := old.start_date;
  new.due_date   := old.due_date;
  new.created_at := old.created_at;
  -- R-06 반납 시각 자동 기록
  new.returned_at := now();
  return new;
end;
$$;

create trigger eqp_loans_before_update
  before update on public.eqp_loans
  for each row execute function public.eqp_before_loan_update();


-- 대여 · 반납 뒤 : 장비 상태를 DB가 바꾼다
create function public.eqp_after_loan_change()
returns trigger
language plpgsql
security definer          -- 빌린 사람이 장비 주인이 아니어도 상태가 바뀌어야 한다
set search_path = public
as $$
begin
  -- R-07 대여 → 장비 '대여중'
  if tg_op = 'INSERT' then
    update eqp_items set status = '대여중' where id = new.item_id;
  -- R-07 반납 → 장비 '대여 가능'
  elsif old.status = '대여중' and new.status = '반납완료' then
    update eqp_items set status = '대여 가능' where id = new.item_id;
  end if;
  return null;
end;
$$;

create trigger eqp_loans_after_change
  after insert or update on public.eqp_loans
  for each row execute function public.eqp_after_loan_change();


-- 장비 삭제 전 : 대여 기록이 있으면 한국어 이유로 거부
create function public.eqp_before_item_delete()
returns trigger
language plpgsql
security definer          -- 남의 대여 기록도 세어야 한다 (RLS로는 내 것만 보임)
set search_path = public
as $$
begin
  -- R-08 대여 기록이 있는 장비는 삭제 불가 (외래 키 restrict가 마지막으로 한 번 더 막는다)
  if exists (select 1 from eqp_loans where item_id = old.id) then
    raise exception '대여 기록이 있는 장비는 삭제할 수 없습니다.';
  end if;
  return old;
end;
$$;

create trigger eqp_items_before_delete
  before delete on public.eqp_items
  for each row execute function public.eqp_before_item_delete();


-- ─────────────────────────────────────────────
-- 3. 권한 (공개용 키 = anon, 로그인 = authenticated)
--    Supabase는 새 표에 모든 권한을 기본으로 주므로 먼저 모두 거둔다
-- ─────────────────────────────────────────────
revoke all on public.eqp_items from anon, authenticated;
revoke all on public.eqp_loans from anon, authenticated;

-- R-01 로그인 전에는 장비 목록 읽기만 (eqp_loans는 권한 없음)
grant select on public.eqp_items to anon, authenticated;

-- R-03 · R-07 화면이 쓸 수 있는 장비 칸은 이름 · 분류 · 위치뿐 (status · owner_id 제외)
grant insert (name, category, location) on public.eqp_items to authenticated;
grant update (name, category, location) on public.eqp_items to authenticated;
grant delete on public.eqp_items to authenticated;

-- R-02 · R-07 대여 때 화면이 보내는 값은 장비 · 반납예정일뿐, 반납 때는 상태뿐
grant select on public.eqp_loans to authenticated;
grant insert (item_id, due_date) on public.eqp_loans to authenticated;
grant update (status) on public.eqp_loans to authenticated;
-- R-06 대여 기록 삭제 권한은 주지 않는다


-- ─────────────────────────────────────────────
-- 4. RLS 정책
-- ─────────────────────────────────────────────
alter table public.eqp_items enable row level security;
alter table public.eqp_loans enable row level security;

-- R-01 장비 목록은 누구나 읽는다
create policy eqp_items_select on public.eqp_items
  for select to anon, authenticated
  using (true);

-- R-03 등록은 로그인한 사람, 등록자는 본인
create policy eqp_items_insert on public.eqp_items
  for insert to authenticated
  with check (owner_id = auth.uid());

-- R-03 수정 · 삭제는 등록한 본인만 (owner_id가 빈 기본 장비는 아무도 못 함)
create policy eqp_items_update on public.eqp_items
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy eqp_items_delete on public.eqp_items
  for delete to authenticated
  using (owner_id = auth.uid());

-- R-02 대여 기록은 본인 것만 읽고 · 빌리고 · 반납
create policy eqp_loans_select on public.eqp_loans
  for select to authenticated
  using (user_id = auth.uid());

create policy eqp_loans_insert on public.eqp_loans
  for insert to authenticated
  with check (user_id = auth.uid());

create policy eqp_loans_update on public.eqp_loans
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());


-- ─────────────────────────────────────────────
-- 5. 가상 장비 10개 (등록한 사람 없음 = 기본 장비, 모두 대여 가능)
-- ─────────────────────────────────────────────
insert into public.eqp_items (name, category, location) values
  ('업무용 노트북 A',      '노트북', '3층 총무팀'),
  ('업무용 노트북 B',      '노트북', '3층 총무팀'),
  ('빔프로젝터',           '영상',   '2층 대회의실'),
  ('휴대용 스크린',        '영상',   '2층 대회의실'),
  ('열화상 카메라',        '측정',   '1층 설비팀'),
  ('휴대용 가스 측정기',   '측정',   '1층 설비팀'),
  ('소음 측정기',          '측정',   '1층 안전팀'),
  ('무전기 1번',           '통신',   '1층 안전팀'),
  ('무전기 2번',           '통신',   '1층 안전팀'),
  ('안전 표지판 세트',     '기타',   '지하 1층 창고');


-- ─────────────────────────────────────────────
-- 6. 확인 : 아래 결과가 10줄이면 성공
-- ─────────────────────────────────────────────
select id, name, category, location, status, owner_id
from public.eqp_items
order by id;
