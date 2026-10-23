// app.js – 화면 동작 : 로그인 · 저장 위치(Supabase) · 화면 그리기
// Supabase 호출은 '로그인' · '저장 위치' 구역의 함수 안에서만 한다.
// 오류는 throw하고, 화면 함수가 showMessage(toKoreanError(e))로 보여 준다.

// ─── 전역 상태 ───
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let currentUser = null;     // 로그인한 사용자 (로그인 전이면 null)
let items = [];             // 장비 목록
let myLoans = [];           // 내 대여 (남의 대여는 DB가 주지 않는다, R-02)
let selectedItemId = null;  // 대여 패널에 고른 장비
let dataLoaded = false;     // 처음 한 번 읽었는지 ('불러오는 중' 표시용)
let msgTimer = null;        // 성공 메시지를 지우는 타이머


// ═════════════════════════════════════════════
// 로그인 (Supabase Auth 이메일 + 비밀번호)
// ═════════════════════════════════════════════

async function signUp(email, password) {
  const { data, error } = await supabaseClient.auth.signUp({ email, password });
  if (error) throw error;
  if (!data.session) {
    throw new Error('가입은 되었지만 바로 로그인되지 않았습니다. Supabase에서 "Confirm email"이 꺼져 있는지 확인하세요.');
  }
}

async function signIn(email, password) {
  const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

async function signOut() {
  const { error } = await supabaseClient.auth.signOut();
  if (error) throw error;
}

// 로그인 상태가 바뀔 때마다 currentUser를 바꾸고 다시 읽는다 (새로고침해도 세션 유지, F-01)
function initAuth() {
  supabaseClient.auth.onAuthStateChange((event, session) => {
    const nextUser = session ? session.user : null;
    const sameUser = (nextUser ? nextUser.id : null) === (currentUser ? currentUser.id : null);
    currentUser = nextUser;
    // 토큰 갱신 · 탭 복귀처럼 사용자가 그대로면 다시 읽지 않는다 (처음 한 번은 읽는다)
    if (sameUser && event !== 'INITIAL_SESSION') return;
    selectedItemId = null;
    // 이 콜백 안에서 바로 Supabase를 부르면 멈출 수 있어 한 박자 뒤에 읽는다
    setTimeout(reloadData, 0);
  });
}


// ═════════════════════════════════════════════
// 저장 위치 (Supabase DB)
// ═════════════════════════════════════════════

// 장비 전체 + (로그인했으면) 내 대여
async function loadData() {
  const { data: itemRows, error: itemError } = await supabaseClient
    .from('eqp_items')
    .select('id, name, category, location, status, owner_id')
    .order('id');
  if (itemError) throw itemError;
  items = itemRows.map(r => ({
    id: r.id, name: r.name, category: r.category, location: r.location,
    status: r.status, ownerId: r.owner_id,
  }));

  myLoans = [];
  if (!currentUser) return;
  const { data: loanRows, error: loanError } = await supabaseClient
    .from('eqp_loans')
    .select('id, item_id, start_date, due_date, status, returned_at, eqp_items(name)')
    .eq('user_id', currentUser.id);
  if (loanError) throw loanError;
  myLoans = loanRows.map(r => ({
    id: r.id, itemId: r.item_id, itemName: r.eqp_items ? r.eqp_items.name : '(없는 장비)',
    startDate: r.start_date, dueDate: r.due_date, status: r.status, returnedAt: r.returned_at,
  }));
}

// 대여 : 장비와 반납예정일만 보낸다. 대여일 · 빌린 사람 · 장비 상태는 DB가 정한다 (R-02, R-05, R-07)
async function insertLoan(itemId, dueDate) {
  const { error } = await supabaseClient
    .from('eqp_loans')
    .insert({ item_id: itemId, due_date: dueDate });
  if (error) throw error;
}

// 반납 : 상태만 보낸다. 반납 시각은 DB가 기록한다 (R-06)
async function returnLoan(loanId) {
  const { data, error } = await supabaseClient
    .from('eqp_loans')
    .update({ status: '반납완료' })
    .eq('id', loanId)
    .select('id');
  if (error) throw error;
  // RLS에 막히면 오류 없이 0줄이 온다
  if (!data || data.length === 0) {
    throw new Error('본인이 빌린 대여만 반납할 수 있습니다. (이미 반납된 건일 수도 있습니다)');
  }
}

// DB · 로그인 오류를 한국어 안내로 (F-07). 트리거가 보낸 한국어 이유는 그대로 둔다
function toKoreanError(error) {
  const msg = (error && error.message) || String(error);
  if (error && error.code === 'P0001') return msg;
  if (msg.includes('eqp_loans_one_active')) return '이미 대여중인 장비입니다. [새로 불러오기] 후 확인하세요.';
  if (msg.includes('eqp_loans_due_range')) return '반납예정일은 대여일부터 7일 이내여야 합니다.';
  if (msg.includes('row-level security')) return '본인 것만 할 수 있습니다.';
  if (msg.includes('permission denied')) {
    return currentUser ? '화면에서 바꿀 수 없는 값입니다. (DB가 정하는 값)' : '로그인한 사용자만 할 수 있습니다.';
  }
  if (msg.includes('Invalid login credentials')) return '이메일 또는 비밀번호가 맞지 않습니다.';
  if (msg.includes('User already registered')) return '이미 가입된 이메일입니다. [로그인]을 누르세요.';
  if (msg.includes('Password should be at least')) return '비밀번호는 6자 이상이어야 합니다.';
  if (msg.includes('Email not confirmed')) return '메일 확인이 필요한 설정입니다. Supabase에서 "Confirm email"을 끄세요.';
  if (/invalid format|is invalid/i.test(msg)) return '이메일 형식이 맞지 않습니다.';
  if (/rate limit|only request this after/i.test(msg)) return '요청이 너무 잦습니다. 잠시 뒤 다시 시도하세요.';
  if (msg.includes('Failed to fetch')) return 'Supabase에 연결하지 못했습니다. 인터넷 연결과 config.js 주소를 확인하세요.';
  return msg;
}


// ═════════════════════════════════════════════
// 화면
// ═════════════════════════════════════════════

function getEl(id) {
  const el = document.getElementById(id);
  if (!el) console.error('요소 없음: ' + id);
  return el;
}

function setBusy(btn, busy) {
  if (btn) btn.disabled = busy;
}

// type : 'ok' | 'error' | 'info'
function showMessage(text, type) {
  const box = getEl('msgBox');
  if (!box) return;
  clearTimeout(msgTimer);
  box.textContent = text;
  box.className = 'msg msg-' + (type || 'info');
  box.hidden = false;
  if (type === 'ok') msgTimer = setTimeout(() => { box.hidden = true; }, 4000);
}

function renderAll() {
  renderHeader();
  renderSummary();
  renderSidePanel();
  renderItemTable();
  renderMyLoans();
}

// 머리글 : 로그인 전 남색 · 안내 / 로그인 후 초록 · 내 이메일 · [로그아웃]
function renderHeader() {
  const status = getEl('headerStatus');
  const email = getEl('userEmail');
  const logoutBtn = getEl('logoutBtn');
  if (!status || !email || !logoutBtn) return;
  document.body.classList.toggle('logged-in', !!currentUser);
  status.textContent = currentUser ? '로그인 :' : '로그인 전 — 보기만 가능';
  email.textContent = currentUser ? currentUser.email : '';
  logoutBtn.hidden = !currentUser;
}

// 요약 카드 : 로그인 전 3개 / 로그인 후 5개 (F-03)
function renderSummary() {
  const box = getEl('summaryCards');
  if (!box) return;
  box.textContent = '';
  summarize(items, myLoans, todayStr(), !!currentUser).forEach(c => {
    const card = document.createElement('div');
    card.className = 'card' + (c.alert ? ' alert' : '');
    const label = document.createElement('div');
    label.className = 'card-label';
    label.textContent = c.label;
    const value = document.createElement('div');
    value.className = 'card-value';
    value.textContent = c.value;
    card.append(label, value);
    box.appendChild(card);
  });
}

// 왼쪽 칸 : 로그인 전 로그인 폼 / 로그인 후 대여 패널
function renderSidePanel() {
  const loginForm = getEl('loginForm');
  const loanPanel = getEl('loanPanel');
  const name = getEl('loanItemName');
  const due = getEl('dueDateInput');
  const btn = getEl('confirmLoanBtn');
  if (!loginForm || !loanPanel || !name || !due || !btn) return;
  loginForm.hidden = !!currentUser;
  loanPanel.hidden = !currentUser;
  if (!currentUser) return;

  // 고른 장비가 그새 대여중이 되었으면 선택을 푼다
  const item = items.find(i => i.id === selectedItemId);
  if (!item || !canBorrow(item)) selectedItemId = null;

  const today = todayStr();
  name.textContent = selectedItemId ? item.name : '목록에서 [대여]를 누르세요';
  due.min = today;
  due.max = maxDueDate(today);
  due.disabled = !selectedItemId;
  btn.disabled = !selectedItemId;
}

// 장비 목록 : 로그인 후에만 '할 일' 칸
function renderItemTable() {
  const table = getEl('itemTable');
  if (!table) return;
  table.textContent = '';

  const headers = ['장비', '분류', '보관 위치', '상태'];
  if (currentUser) headers.push('할 일');
  const headRow = table.createTHead().insertRow();
  headers.forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    headRow.appendChild(th);
  });

  const body = table.createTBody();
  if (items.length === 0) {
    const cell = body.insertRow().insertCell();
    cell.colSpan = headers.length;
    cell.className = 'empty';
    cell.textContent = dataLoaded ? '장비가 없습니다.' : '불러오는 중입니다…';
    return;
  }

  items.forEach(item => {
    const row = body.insertRow();
    if (item.id === selectedItemId) row.classList.add('selected');
    [item.name, item.category, item.location].forEach(text => { row.insertCell().textContent = text; });

    const badge = document.createElement('span');
    badge.className = 'badge ' + (item.status === '대여중' ? 'badge-onloan' : 'badge-available');
    badge.textContent = item.status;
    row.insertCell().appendChild(badge);

    if (currentUser) {
      const actions = row.insertCell();
      if (canBorrow(item)) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'small';
        btn.textContent = '대여';
        btn.addEventListener('click', () => openLoanPanel(item.id));
        actions.appendChild(btn);
      }
    }
  });
}

// 내 대여 : 로그인 전 안내 / 로그인 후 내 것만, 대여중에만 [반납]
function renderMyLoans() {
  const notice = getEl('myLoansNotice');
  const table = getEl('myLoansTable');
  if (!notice || !table) return;
  table.textContent = '';

  if (!currentUser || myLoans.length === 0) {
    notice.textContent = currentUser ? '빌린 장비가 없습니다.' : '로그인하면 볼 수 있습니다';
    notice.hidden = false;
    table.hidden = true;
    return;
  }
  notice.hidden = true;
  table.hidden = false;

  const headRow = table.createTHead().insertRow();
  ['장비', '대여일', '반납예정일', '상태', '할 일'].forEach(h => {
    const th = document.createElement('th');
    th.textContent = h;
    headRow.appendChild(th);
  });

  const body = table.createTBody();
  sortMyLoans(myLoans).forEach(loan => {
    const row = body.insertRow();
    const statusText = loan.status === '반납완료'
      ? `반납완료 (${formatDate(new Date(loan.returnedAt))})`
      : '대여중';
    [loan.itemName, loan.startDate, loan.dueDate, statusText].forEach(text => { row.insertCell().textContent = text; });

    const actions = row.insertCell();
    if (loan.status === '대여중') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'small';
      btn.textContent = '반납';
      btn.addEventListener('click', () => {
        btn.disabled = true;
        doReturn(loan.id);
      });
      actions.appendChild(btn);
    }
  });
}

// ─── 버튼 동작 ───

async function reloadData() {
  const btn = getEl('reloadBtn');
  setBusy(btn, true);
  try {
    await loadData();
    dataLoaded = true;
  } catch (e) {
    showMessage('목록을 불러오지 못했습니다. ' + toKoreanError(e), 'error');
  } finally {
    setBusy(btn, false);
    renderAll();
  }
}

function readLoginInputs() {
  const email = getEl('emailInput').value.trim();
  const password = getEl('passwordInput').value;
  if (!email || !password) {
    showMessage('이메일과 비밀번호를 입력하세요.', 'error');
    return null;
  }
  return { email, password };
}

async function handleLogin(event) {
  event.preventDefault();
  const input = readLoginInputs();
  if (!input) return;
  setBusy(getEl('loginBtn'), true);
  setBusy(getEl('signupBtn'), true);
  try {
    await signIn(input.email, input.password);
    getEl('passwordInput').value = '';
    showMessage('로그인했습니다.', 'ok');
  } catch (e) {
    showMessage(toKoreanError(e), 'error');
  } finally {
    setBusy(getEl('loginBtn'), false);
    setBusy(getEl('signupBtn'), false);
  }
}

async function handleSignup() {
  const input = readLoginInputs();
  if (!input) return;
  if (input.password.length < 6) {
    showMessage('비밀번호는 6자 이상이어야 합니다.', 'error');
    return;
  }
  setBusy(getEl('loginBtn'), true);
  setBusy(getEl('signupBtn'), true);
  try {
    await signUp(input.email, input.password);
    getEl('passwordInput').value = '';
    showMessage('가입하고 로그인했습니다.', 'ok');
  } catch (e) {
    showMessage(toKoreanError(e), 'error');
  } finally {
    setBusy(getEl('loginBtn'), false);
    setBusy(getEl('signupBtn'), false);
  }
}

async function handleLogout() {
  const btn = getEl('logoutBtn');
  setBusy(btn, true);
  try {
    await signOut();
    showMessage('로그아웃했습니다.', 'ok');
  } catch (e) {
    showMessage(toKoreanError(e), 'error');
  } finally {
    setBusy(btn, false);
  }
}

// [대여] → 대여 패널에 장비를 올리고 반납예정일 기본값 = 3일 뒤
function openLoanPanel(itemId) {
  selectedItemId = itemId;
  const due = getEl('dueDateInput');
  if (due) due.value = addDays(todayStr(), 3);
  renderSidePanel();
  renderItemTable();
  if (due) due.focus();
}

// [대여 확정] (F-04) : 화면은 미리 안내만, 최종 판정은 DB
async function confirmLoan() {
  if (!selectedItemId) {
    showMessage('목록에서 [대여]를 눌러 장비를 고르세요.', 'error');
    return;
  }
  const today = todayStr();
  const dueDate = getEl('dueDateInput').value;
  if (!isValidDueDate(today, dueDate)) {
    showMessage(`반납예정일은 오늘(${today})부터 ${maxDueDate(today)}까지 고를 수 있습니다.`, 'error');
    return;
  }
  const item = items.find(i => i.id === selectedItemId);
  const btn = getEl('confirmLoanBtn');
  setBusy(btn, true);
  try {
    await insertLoan(selectedItemId, dueDate);
    selectedItemId = null;
    showMessage(`「${item ? item.name : '장비'}」을(를) 대여했습니다. 반납예정일 : ${dueDate}`, 'ok');
  } catch (e) {
    showMessage(toKoreanError(e), 'error');
  } finally {
    setBusy(btn, false);
  }
  await reloadData();
}

// [반납] (F-06) : 되돌릴 수 없으므로 한 번 묻는다
async function doReturn(loanId) {
  const loan = myLoans.find(l => l.id === loanId);
  if (!confirm(`「${loan ? loan.itemName : '장비'}」을(를) 반납할까요? 반납하면 되돌릴 수 없습니다.`)) {
    renderMyLoans();
    return;
  }
  try {
    await returnLoan(loanId);
    showMessage('반납했습니다. 장비가 \'대여 가능\'으로 바뀌었습니다.', 'ok');
  } catch (e) {
    showMessage(toKoreanError(e), 'error');
  }
  await reloadData();
}

function bindEvents() {
  getEl('loginForm').addEventListener('submit', handleLogin);
  getEl('signupBtn').addEventListener('click', handleSignup);
  getEl('logoutBtn').addEventListener('click', handleLogout);
  getEl('reloadBtn').addEventListener('click', () => reloadData());
  getEl('confirmLoanBtn').addEventListener('click', confirmLoan);
}

// ─── 시작 ───
bindEvents();
renderAll();
initAuth();
