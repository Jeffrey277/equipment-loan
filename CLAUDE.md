# CLAUDE.md – 공용 장비 대여 현황판 작업 규칙

> 무엇을 만들지는 PRD.md(내용 출처 : 명세.md)를 따릅니다. 형식은 `_견본/CLAUDE.md`를 따릅니다.

## 프로젝트 개요
- 교육용 프로토타입이다. 무엇을 만들지는 PRD.md를 따른다.
- PRD.md에 없는 기능은 먼저 제안하고, 내가 승인한 뒤에만 구현한다.
- `_견본` 폴더는 문서 형식 참고용이다. 그 안의 기능 · 이름 · 표를 이 앱에 가져오지 않는다.

## 기술 스택 (변경 금지)
- HTML + CSS + 순수 JavaScript만 사용한다. (React 등 프레임워크, 빌드 도구 사용 금지)
- 외부 CDN은 supabase-js 하나만 허용한다.
  `<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>`
- 데이터는 Supabase DB(academy 프로젝트)에 저장한다. (localStorage에 업무 데이터 저장 안 함 — 로그인 세션은 supabase-js가 알아서 유지)
- 로그인은 Supabase Auth 이메일 + 비밀번호만 쓴다.
- 서버 프로그램(Node · Python 등)은 만들지 않는다. 정적 파일만 Vercel에 배포한다.

## 폴더 구조
- index.html : 화면 구조
- style.css  : 디자인 (로그인 전 머리글 남색 / 로그인 후 초록, 연체 빨간 줄)
- config.js  : Supabase 주소와 공개용 키 두 줄만 둔다 (이미 있음, 값만 채운다)
- logic.js   : 날짜 · 판정 · 집계 · 정렬 · 필터 규칙만 (화면 · Supabase를 다루는 코드 금지)
- app.js     : 로그인 · DB 호출 · 화면 동작 (입력 받기, 표 그리기, 버튼 이벤트)
- test.html  : logic.js 자동 테스트 (PRD 완료 기준 중 '(자동)' T-xx를 PASS/FAIL 표로 표시)
- supabase_setup.sql : 표 · RLS · 권한 · 트리거 · 가상 장비 10개. DB 규칙을 바꾸면 이 파일도 고친다
- index.html은 supabase-js → config.js → logic.js → app.js 순서로 불러온다.

## 작업 방식
1. 코드를 고치기 전에 계획(수정할 파일 · 함수와 이유)을 먼저 보여주고 승인을 받는다.
2. 한 번에 PRD의 Phase 하나만 구현한다.
3. 업무 규칙(R-xx)을 만들거나 고치면 test.html 또는 PRD 10장에 해당 완료 기준(T-xx)을 추가한다.
4. 작업이 끝나면 변경한 파일, 내가 확인할 방법, 남은 문제를 보고한다.
5. 오류 수정 요청을 받으면 원인을 2~3줄로 먼저 설명하고, 해당 줄만 고친다. 잘 되던 기능은 건드리지 않는다.
6. SQL을 바꾸면 내가 Supabase SQL Editor에서 직접 실행해야 한다. 실행할 부분만 따로 보여 준다.
7. Git : Phase 1은 main 가지에 바로 커밋 · push한다. Phase 2는 내가 말하면 `phase2` 가지를 만들어 커밋 · push한다. 그 밖에는 내가 따로 말하지 않으면 새 가지를 만들지 않는다.

## 코딩 규칙
- 함수 이름과 화면 요소 id는 아래 '이름 표'를 그대로 쓴다. 새로 만들면 표에 추가한다.
- 주석과 화면 문구는 한국어로 쓴다. 날짜는 YYYY-MM-DD로 표시한다.
- 날짜 문자열을 만들 때 toISOString()을 쓰지 않는다. (한국 시간에서 하루가 밀림)
- 사용자가 입력한 글자(장비 이름 · 위치 · 이메일)는 textContent로 표시한다. (innerHTML에 그대로 넣지 않기)
- Supabase 호출은 app.js 맨 위 '로그인' · '저장 위치' 구역의 함수 안에서만 한다. 오류가 오면 throw해서 화면 함수가 showMessage()로 보여 주게 한다.
- update · delete는 `.select()`를 붙여 바뀐 줄 수를 확인한다. RLS에 막히면 오류 없이 0줄이 오므로, 0줄이면 "권한이 없거나 이미 바뀐 항목입니다"로 throw한다.
- DB 오류 메시지는 toKoreanError()로 한국어 안내로 바꿔 보여 준다. 트리거가 보낸 한국어 메시지는 그대로 보여 준다. (F-07)
- 데이터를 바꾼 뒤와 로그인 · 로그아웃 뒤에는 loadData()로 DB에서 다시 읽어 renderAll()로 화면 전체를 다시 그린다.
- 로그인 여부는 `supabase.auth.onAuthStateChange`로 받아 currentUser 하나에만 담는다. 화면 함수는 currentUser만 보고 로그인 전 · 후를 나눈다.

## 보안·데이터 규칙
- 가상 데이터만 사용한다. 실제 이름 · 연락처 · 기관 내부자료를 코드와 샘플에 넣지 않는다.
- 이름 · 연락처 입력칸은 만들지 않는다. 계정은 가상 이메일(test1@example.com · test2@example.com)만 쓴다.
- 표 이름은 PRD.md 5장을 따르고 `eqp_` 로 시작한다. academy 프로젝트의 다른 표(`edu_` 등)는 건드리지 않는다.
- 화면 코드에는 공개용 키(Publishable 또는 anon)만 쓴다. **비밀 키(Secret 또는 service_role)는 절대 코드 · 채팅 · GitHub에 넣지 않는다.**
- 업무 규칙(R-01~R-09)은 DB(supabase_setup.sql)가 최종 판정한다. 화면은 버튼을 숨기거나 미리 안내만 한다.
- 남의 대여 기록(user_id 등)을 화면에 가져오지 않는다. 장비가 '대여중'인지는 eqp_items.status로만 안다. (R-02)

## 프로젝트 전용 규칙
### 이름 표
| 구분      | 이름                                                                   |
|---|---|
| 함수(logic.js) | todayStr(), formatDate(d), parseDate(str), addDays(str, n), maxDueDate(startDate), isValidDueDate(startDate, dueDate), isOverdue(loan, today), summarize(items, myLoans, today, loggedIn), sortMyLoans(loans), filterItems(items, keyword, category, status), canBorrow(item), canEditItem(item, userId) |
| 함수(app.js) 로그인 | signUp(email, password), signIn(email, password), signOut(), initAuth() |
| 함수(app.js) 저장 | loadData(), insertLoan(itemId, dueDate), returnLoan(loanId), insertItem(item), updateItem(id, fields), deleteItem(id) |
| 함수(app.js) 화면 | renderAll(), renderHeader(), renderSummary(), renderSidePanel(), renderItemTable(), renderMyLoans(), handleLogin(), handleSignup(), handleLogout(), openLoanPanel(itemId), confirmLoan(), doReturn(loanId), addItem(), startEditItem(id), saveEditItem(), cancelEditItem(), removeItem(id), reloadData(), showMessage(text, type), toKoreanError(error), getEl(id), setBusy(btn, busy), readLoginInputs(), bindEvents(), handleItemSubmit(event), readItemInputs(), resetItemForm() |
| 화면 id   | appHeader, headerStatus, userEmail, logoutBtn, reloadBtn, summaryCards, msgBox, loginForm, emailInput, passwordInput, loginBtn, signupBtn, itemForm, itemFormTitle, itemNameInput, itemCategorySelect, itemLocationInput, addItemBtn, cancelEditBtn, loanPanel, loanItemName, dueDateInput, confirmLoanBtn, searchInput, categoryFilter, statusFilter, itemTable, myLoansSection, myLoansNotice, myLoansTable |
| 전역 상태(app.js) | supabaseClient, currentUser, items, myLoans, selectedItemId, editingItemId, dataLoaded, msgTimer |
| 설정(config.js) | SUPABASE_URL, SUPABASE_KEY |
| DB 표 | eqp_items, eqp_loans |
| DB 트리거 함수(SQL) | eqp_before_loan_insert() (R-04 · R-05 · 대여일), eqp_before_loan_update() (R-06 · 반납 시각), eqp_after_loan_change() (R-07 장비 상태 변경), eqp_before_item_delete() (R-08 한국어 거부 이유) |

### 주의사항
- 대여일(start_date) · 반납 시각(returned_at) · 장비 상태(status) · 등록자(owner_id) · 빌린 사람(user_id)은 화면에서 보내지 않는다. DB가 정한다. (R-05, R-06, R-07)
- 대여 insert 때 화면이 보내는 값은 item_id와 due_date뿐이다. 반납 update 때는 status = '반납완료'뿐이다.
- 장비 상태를 바꾸는 트리거 함수는 `security definer`로 만든다. (빌린 사람이 장비 주인이 아니어도 상태가 바뀌어야 하므로)
- 반납예정일 입력칸은 min = 오늘, max = maxDueDate(오늘)로 미리 막고, isValidDueDate()로 한 번 더 안내한다. 최종 판정은 DB. (R-05)
- 연체 판정은 isOverdue()로만 한다. Phase 1은 '내 연체' 카드 숫자에, Phase 2는 빨간 줄에도 쓴다. (R-09)
- [대여] 버튼은 canBorrow(), [수정] [삭제] 버튼은 canEditItem()으로만 보일지 정한다.
- 선택 목록 값 : 분류 = 노트북 / 영상 / 측정 / 통신 / 기타, 장비 상태 = 대여 가능 / 대여중, 대여 상태 = 대여중 / 반납완료

## 자주 발생한 오류와 해결 (Debug Loop에서 배운 것 – 계속 추가)
- getElementById 결과는 사용 전에 있는지 확인하고, 없으면 콘솔에 '요소 없음: id'를 표시한다.
- "Supabase에 연결하지 못했습니다"(Failed to fetch)가 뜨면 config.js의 SUPABASE_URL을 확인한다. `https://`가 두 번 들어가면(`https://https://…`) 연결되지 않는다.
- Console의 `favicon.ico 404`는 아이콘 파일이 없어 브라우저가 자동 요청에 실패한 것이다 → 새 HTML 파일을 만들 때는 `<head>`에 `<link rel="icon" href="data:,">`를 반드시 넣는다. (`auth/v1/token?grant_type=password 400`은 로그인 실패 기록이라 코드 오류가 아니다)
