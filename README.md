# Agent Atlas

한국어 에이전트 AI 저장소·논문 관측 대시보드. GitHub Pages에서 바로 제공할 수 있는 정적 HTML/CSS/JavaScript입니다. 런타임·빌드·CDN·외부 폰트·데이터베이스·API 키가 필요하지 않습니다.

## 보기 / 검증

파일을 직접 여는 `file://` 방식은 JSON fetch가 제한될 수 있습니다. 로컬 HTTP 서버로 확인합니다.

```sh
python3 -m http.server 8080 --directory .
# http://localhost:8080
node --test tests/*.test.mjs
node scripts/validate.mjs
node --check assets/app.mjs
node --check assets/logic.mjs
node --check scripts/create-snapshot.mjs
```

전체 경로는 상대 경로이므로 사용자 홈페이지와 `/repository-name/` 프로젝트 Pages 모두에서 동작합니다. 저장소 루트의 `index.html`을 제공하면 됩니다. `.nojekyll`은 정적 파일을 그대로 제공하도록 합니다. 이 프로젝트는 Actions 워크플로, 외부 서비스 연결, 인증정보를 포함하지 않습니다.

## 화면 기준

- Main: 브라우저의 실제 현재 시각에서 정확히 7일 전까지의 GitHub 원본 `created_at`을 사용합니다. 마지막 수집일에 최근 범위를 고정하지 않습니다. `pushed_at`, `updated_at`, release는 포함 기준이 아닙니다. 저장소는 ID/이름으로 중복 제거합니다.
- Main 발전 타임라인: **2025.01.01 이후** 에이전트 AI의 주요 등장·출시·산업 전환점만 선별합니다. 컴퓨터·코딩 에이전트, 오픈소스 개인 에이전트와 기업용 제품 등 큰 흐름 중심이며 개별 소규모 업데이트·논문·단순 저장소 생성 기록으로 채우지 않습니다. 연도별 시간순 큰 카드로 표시하며, 원문 날짜와 발표·출시·프로젝트 시작의 구분을 보존합니다. History의 2026년 시작 기준과 독립적입니다.
- History: KST `2026-01-01 00:00:00` 이후 원본 생성된 저장소를 기본 최신순으로 표시합니다. 이전 저장소는 접힌 별도 참고 목록이며 집계에 섞지 않습니다. 스냅샷을 선택하면 그날의 저장소와 Stars로 전환합니다.
- Paper: arXiv 최초 제출일을 기준으로 정렬합니다. 날짜 원문은 UTC이며, 날짜만 제공된 경우 임의의 시각을 만들지 않습니다.
- 저장소 검색: 이름·소유자·설명·분야·언어. 논문 검색: 제목·요약·분야. 띄어 쓴 단어는 모두 일치해야 하며 대소문자·유니코드 표현 차이를 정규화합니다.
- Main/History: 최소 Stars, Stars 높은/낮은순, 생성일 최신/오래된순. Paper: 최초 제출 최신/오래된순. 검색·정렬 상태는 탭별로 유지됩니다.
- 화면 테마: 상단의 시스템·라이트·다크 선택. 기본은 시스템 설정을 따르며 선택은 이 브라우저에 저장됩니다. 저장소 접근이 제한된 환경에서도 현재 세션의 선택은 동작합니다.
- 상단 메뉴는 스크롤 중에도 유지됩니다. Main의 바로가기로 긴 저장소 목록과 발전 타임라인 사이를 빠르게 이동할 수 있습니다. 모바일에서는 저장소 날짜·Stars를 설명 아래에 표시합니다.
- 수집 시각과 저장소 생성일은 KST(`Asia/Seoul`)로 명시합니다. 논문 원문 날짜는 UTC, 타임라인 사건 날짜는 공식 원문의 날짜·정밀도를 보존합니다. 타임라인 확인 시각은 타임라인 하단에 별도로 표시하며 저장소·논문 재수집 시각으로 사용하지 않습니다.
- 수집 표본은 선별·검색 결과입니다. 모든 에이전트 저장소나 논문을 망라하지 않으며, 생성일은 공개 전환일·제품 출시일을 보장하지 않습니다. Stars는 수집 시점의 누적값입니다.

## 데이터 파일

`data/repos.json`, `papers.json`, `timeline.json`은 배열 또는 아래 envelope 형식을 받습니다. 자동 업데이트에는 envelope를 권장합니다.

```json
{
  "schema_version": 1,
  "collected_at": "2026-10-03T05:55:00Z",
  "timezone": "Asia/Seoul",
  "items": []
}
```

저장소 필수 필드: `id` 또는 고유 `name`, `name` (`owner/repo`), `url`, GitHub 원본 `created_at`, `stars`. 권장 필드: `description_ko`, `description`, `category`, `language`, `source_url`, `description_source_url`, `observed_at`/`collected_at`. 원문 provenance는 보존합니다. 사라지거나 검색에서 빠진 저장소를 곧바로 전체 아카이브에서 지우지 않습니다.

논문 필수 필드: `id`/`url`, `title`, `url`, 최초 제출 `date`. 권장 필드: `date_type`, `description_ko`, `category`, `source_url`.

타임라인 필수 필드: `date`, `title`, `summary`, `source_url`, `date_type`, `date_precision`, `date_basis`. `date_type`은 제품 출시·공식 발표·공개 베타·프로젝트 시작·이름 변경 등을 구분합니다. 저장소 생성일을 출시일로 바꾸지 않습니다. `date_precision`은 `date`(`YYYY-MM-DD`), `month`(`YYYY-MM`), `timestamp`(시간대가 있는 ISO 시각)이며, 확인되지 않은 일자·시각을 만들지 않습니다. `date_basis`에 날짜 근거를 명시하고 화면에서 펼쳐 확인할 수 있게 합니다. 선택 필드는 큰 흐름을 나타내는 `category`, 변화의 의미를 설명하는 `significance`, 추가 공식 출처 `supporting_sources:[{label,url}]`입니다. 날짜만 있는 항목은 KST 자정으로 해석하지 않습니다. 2025년 이전이나 미래 사건은 현재 Main 타임라인에 표시하지 않습니다.

타임라인만 편집할 때에는 실제 확인 시각으로 `timeline.json.collected_at`만 갱신하고 저장소·논문·뉴스의 수집 시각, 기존 브리핑과 불변 스냅샷은 그대로 둡니다. 과거 불변 스냅샷의 타임라인은 생성 당시 기록이므로 새 편집 기준을 소급 적용하지 않습니다.

`data/meta.json`: 수집 시각, 검색어·페이지·분류 및 제외 규칙, 출처, 누락 가능성, 스케줄 상태를 기록합니다. URL은 공개 근거만 사용하며 비공개 정보·토큰·비밀키를 저장하지 않습니다.

`data/briefs.json`: 일일 브리핑 인덱스. 각 항목에는 `collected_at`, `window_start`, `window_end`, `headline`, `summary`, `themes`, `sources`, `snapshot_url`, `sha256`이 있습니다. 일일 요약은 **명시된 편집 기준 시각 직전 7일**을 요약합니다. `collected_at`은 실제 수집 완료 시각이며 `window_end`와 구분합니다. 기본값은 수집 시각이고, 정기 실행은 `--window-end`로 09:00 KST 기준을 지정합니다. 현재 화면의 Main 범위와 별도로 요약 범위를 표시합니다.

`data/snapshots/<id>.json`: 그 수집 시점의 전체 저장소, 논문, 타임라인, 브리핑, provenance를 포함하는 불변 원본입니다. 생성 후 내용을 덮어쓰거나 과거 Stars/요약을 현재 값으로 바꾸지 않습니다. 수집을 시작하기 전 날짜의 일일 기록을 소급 생성하지 않습니다.

## 매일 09:00 KST 업데이트 계약

브라우저나 GitHub Pages 자체는 수집 작업을 실행하지 않습니다. 별도 승인된 스케줄 실행기가 **Asia/Seoul 매일 09:00**에 데이터를 갱신하고 게시해야 합니다. 예약이 실제 활성화된 후에만 `meta.schedule.enabled`를 `true`로 바꿉니다. 저장소·서비스의 인증정보는 실행기의 비밀 저장소에만 보관하고 이 디렉터리에 쓰지 않습니다.

09:00은 편집 기준 시각입니다. 이후에 수집·검증·배포가 끝날 수 있으며 실제 완료 시각을 09:00으로 소급하지 않습니다. 기준 이후 처음 공개된 항목은 다음 실행에서 다룹니다. Stars는 조회 당시의 현재 누적값이며 편집 기준 시각의 과거 값을 재구성한 것이 아닙니다.

한 번의 실행 순서:

1. 공개 GitHub API 및 논문 원문을 조회합니다. 검색어·기간·페이지·한도·누락을 기록하고, 키워드 결과를 검토해 에이전트와 무관한 저장소를 제외합니다.
2. 신규 결과를 기존 `repos` 아카이브와 ID 기준 병합합니다. 원본 `created_at`을 보존하고 현재 Stars·설명·출처·관측 시각만 갱신합니다. 검색 실패·API 한도 도달을 빈 결과 성공으로 처리하지 않습니다.
3. `repos.json`, `papers.json`, `timeline.json`, `meta.json`을 검증한 최신 데이터로 원자적으로 교체합니다. `collected_at`은 실제 수집이 확인된 시각입니다.
4. 검증된 원문에 근거한 한국어 요약을 준비합니다. 최근 7일 생성 목록과 기존 프로젝트의 릴리스를 혼동하지 않습니다. 편집 요약 파일은 `headline`, `summary`, `themes`, `sources: [{label,url}]` 형식입니다.
5. 스냅샷을 한 번 생성합니다. 편집 요약을 생략하면 추세를 추론하지 않는 사실 기반 현황 요약이 자동 생성됩니다.

```sh
node scripts/create-snapshot.mjs --brief=/absolute/path/verified-brief.json
# 선택: --collected-at=<실제 수집 완료 ISO 시각> --window-end=2026-10-07T00:00:00Z --id=2026-10-07
```

6. 테스트, 데이터·해시 검증, JavaScript 구문 검사를 실행합니다. 승인된 게시 경로로 변경 파일과 새 스냅샷을 커밋·푸시합니다. 실제 Pages 응답에서 새 `collected_at`을 확인한 뒤 완료로 처리합니다. 실패하면 이전 정상 데이터를 유지하고 실패를 보고합니다.

같은 ID의 스냅샷 생성은 실패하도록 되어 있습니다. 같은 날 보강 수집은 `2026-10-03-expanded`처럼 **새 ID**로 저장하며 기존 파일은 그대로 둡니다. 정정이 필요한 경우에도 새 스냅샷과 정정 설명을 추가합니다. 이미 생성된 스냅샷은 편집하지 않습니다. 인덱스의 SHA-256으로 훼손 여부를 검증합니다.

## 안전성과 한계

텍스트는 HTML escape하고 링크는 HTTP(S)만 허용합니다. 스냅샷 경로는 `data/snapshots/` 내부 JSON만 허용합니다. 일부 파일 로딩 실패, 검증 실패, 빈 검색 결과, 수집 지연, 스냅샷 실패를 별도로 표시합니다. 키보드 탭 전환, 명시적 input label, focus ring, 화면 낭독용 검색 결과 안내, 모바일 레이아웃을 제공합니다.

시계는 방문자 기기 시각에 의존합니다. 36시간 이상 수집이 지연되면 경고합니다. 현재 수집에는 최소 Stars 문턱을 두지 않습니다. 공개 GitHub API의 검색 인덱스, 언어·키워드, 기간 구간, 결과 한도와 검토 범위에 따른 누락이 가능합니다. 초기 표본의 과거 검색 조건은 해당 시점의 provenance로 보존합니다. 출처가 없거나 원본 생성일이 잘못된 항목은 표시하지 않습니다.

## News · 일일 에이전트 AI 뉴스

`News` 메뉴(`#news`)는 2026-10-03부터 날짜별 한국어 종합 요약, 개별 소식의 핵심 내용, 보도·공식 원문 링크를 보관합니다. 기본 정렬은 날짜 최신순입니다. 제목·일일 요약·주제·출처 검색과 오래된순 정렬을 지원하며 탭마다 검색 상태를 유지합니다. News 수집 시각은 저장소 수집 시각과 독립적으로 표시됩니다. 전체·국내·해외 필터는 주 출처 매체/기관의 소재지 기준이며, 기사에서 다루는 사건의 발생 국가를 뜻하지 않습니다. 검색·정렬과 함께 적용되고 탭 이동 시 선택을 유지합니다. 국내/해외 필터를 적용해도 일일 종합 요약은 전체 뉴스의 요약으로 명시해 보존합니다.

### 데이터 계약

`data/news.json`은 `{schema_version:1, timezone:"Asia/Seoul", started_on:"2026-10-03", collected_at:"실제 ISO 시각", items:[일일 기록]}` envelope입니다.

- 일일 기록 필수: `date` (KST `YYYY-MM-DD`), `status` (`partial` 또는 `final`), `collected_at`, `headline` (한국어 핵심 제목), `summary` (그날 전체 뉴스의 한국어 종합 요약), `items` (소식 배열)
- 선택: `coverage_note`, `correction_note`, `sources:[{label,url}]`, `window_start`, `window_end`
- 소식 필수: `id` (안정적 고유 키), `title`, `url`, `source`, `summary`, `published_date` (원문 날짜), `published_precision` (`timestamp` 또는 `date`), `date_basis` (원문 날짜·시간대 근거)
- 시각까지 확인되면 `published_at`에 시간대가 있는 ISO timestamp, `published_date_kst`에 실제 KST 변환 날짜를 저장합니다. 원문 `published_date`는 그대로 보존합니다.
- 날짜만 확인되면 `published_at:null`, `published_precision:"date"`, `published_timezone` (확인된 원문 시간대 또는 `unknown`)를 사용합니다. 임의의 자정 시각이나 KST 날짜를 만들지 않습니다. `published_date_kst`는 원문 시간대가 `Asia/Seoul`로 확인된 경우 외에는 비웁니다.
- `region`: 주 출처가 한국 소재 매체·기관이면 `domestic`, 해외 소재이면 `international`. 출처 소재지를 확인해서 저장하며 제목 언어·사건 발생 국가로 추정하지 않습니다. 이전 기록에서 값이 없으면 전체 보기에는 유지하고 국내/해외로 자동 분류하지 않습니다. 선택한 구분의 검증된 뉴스가 없으면 빈 결과를 정확히 표시합니다.
- 권장: `significance` (한국어 핵심 포인트), `topics`, `source_type` (`primary` / `reputable_report`), `supporting_sources:[{source,url,...근거}]`, `event_date`, `event_date_note`, `verification_note`
- 게시일, 발표·시행일, 수집 시각은 서로 대체하지 않습니다. 날짜별 뉴스의 기준은 확인된 보도 게시 시각입니다. 과거 소식을 배경으로 넣으면 이전 소식임을 명시합니다. 날짜만 있는 출처는 정확한 KST 게시일을 확정하지 않았다고 표시합니다.

### 매일 09:00 KST 실행

기존 수집·게시 작업에서 국내·해외 매체와 공식 원문을 모두 확인하고 전날의 일일 기록을 보강·마감(`final`)한 뒤, 당일은 09:00까지의 부분 기록(`partial`)으로 추가합니다. 2026-10-03 이전 기록은 만들지 않습니다. `final`은 해당 KST 날짜가 끝난 후에만 허용합니다. 확인된 기사가 없는 경우 가짜 뉴스 카드나 무의미한 문구로 채우지 말고 확인 범위와 결과만 정확히 기록합니다. 실패한 검색을 '뉴스 없음'으로 처리하지 않습니다.

```sh
# 검증한 전날+당일 이슈 envelope. 기존 날짜·소식은 보존하며 원자적으로 병합합니다.
node scripts/update-news.mjs --input=/absolute/path/verified-news.json
# 원본 저장소·논문 데이터 갱신 후 같은 실행의 새로운 불변 스냅샷을 생성합니다.
node scripts/create-snapshot.mjs --brief=/absolute/path/verified-brief.json
node --test tests/*.test.mjs
node scripts/validate.mjs
node --check assets/app.mjs
node --check assets/news.mjs
node --check scripts/update-news.mjs
```

`update-news.mjs`는 기존 날짜와 소식을 유지하고 같은 뉴스 ID의 출처 변경, 더 오래된 수집으로의 되돌림, 마감 기록의 부분 기록 전환을 거부합니다. 정정은 근거를 확인하고 `correction_note`를 추가합니다. 수집 시각은 실제 확인 시각으로만 갱신합니다. 이 스크립트 자체는 조사·예약·게시를 수행하지 않습니다.

새 스냅샷은 뉴스가 있으면 `schema_version:2`로 `news` envelope와 `dataset_collected_at`을 함께 보관합니다. 기존 schema v1 스냅샷과 SHA-256은 그대로 유지합니다. 뉴스만 갱신한 경우 저장소·논문 원본의 수집 시각은 변경하지 않습니다. 현재 `news.json`은 날짜별 최신 기록이며, 이전 부분 기록·정정 전 내용은 생성 당시의 불변 스냅샷과 저장소 버전 이력에 남습니다.
