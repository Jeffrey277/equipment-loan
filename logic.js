// logic.js – 날짜 · 판정 · 집계 · 정렬 규칙만 둔다 (화면 · Supabase 코드 금지)
// 화면 코드에서 쓰는 데이터 모양
//   장비 item : { id, name, category, location, status, ownerId }
//   대여 loan : { id, itemId, itemName, startDate, dueDate, status, returnedAt }

// ─── 날짜 ───

// 오늘 한국 날짜 'YYYY-MM-DD' (toISOString은 하루가 밀려서 쓰지 않는다)
function todayStr() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
}

// Date → 'YYYY-MM-DD'
function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// 'YYYY-MM-DD' → Date (그 날 0시, 내 컴퓨터 시간)
function parseDate(str) {
  const [y, m, d] = str.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// 'YYYY-MM-DD' + n일 → 'YYYY-MM-DD'
function addDays(str, n) {
  const d = parseDate(str);
  d.setDate(d.getDate() + n);
  return formatDate(d);
}

// ─── 대여 판정 ───

// R-05 반납예정일의 마지막 날 = 대여일 + 7일
function maxDueDate(startDate) {
  return addDays(startDate, 7);
}

// R-05 반납예정일이 대여일 ~ 대여일+7일 사이인지 (화면 안내용, 최종 판정은 DB)
function isValidDueDate(startDate, dueDate) {
  if (!startDate || !dueDate) return false;
  return dueDate >= startDate && dueDate <= maxDueDate(startDate);
}

// R-09 연체 = 대여중이고 오늘이 반납예정일보다 뒤 (반납예정일 당일은 연체 아님)
function isOverdue(loan, today) {
  return loan.status === '대여중' && today > loan.dueDate;
}

// [대여] 버튼을 보일지
function canBorrow(item) {
  return item.status === '대여 가능';
}

// ─── 집계 · 정렬 ───

// 요약 카드 : 로그인 전 3개, 로그인 후 5개 → [{ label, value, alert }]
function summarize(items, myLoans, today, loggedIn) {
  const onLoan = items.filter(i => i.status === '대여중').length;
  const cards = [
    { label: '전체 장비', value: items.length, alert: false },
    { label: '대여 가능', value: items.length - onLoan, alert: false },
    { label: '대여중', value: onLoan, alert: false },
  ];
  if (loggedIn) {
    const myOnLoan = myLoans.filter(l => l.status === '대여중').length;
    const myOverdue = myLoans.filter(l => isOverdue(l, today)).length;
    cards.push({ label: '내 대여중', value: myOnLoan, alert: false });
    cards.push({ label: '내 연체', value: myOverdue, alert: myOverdue > 0 });
  }
  return cards;
}

// 내 대여 : 대여중 먼저(반납예정일 빠른 순), 반납완료는 최근 반납 순
function sortMyLoans(loans) {
  return [...loans].sort((a, b) => {
    if (a.status !== b.status) return a.status === '대여중' ? -1 : 1;
    if (a.status === '대여중') return a.dueDate.localeCompare(b.dueDate);
    return String(b.returnedAt).localeCompare(String(a.returnedAt));
  });
}
