# Batch Brew Web App 배포 안내

이 앱을 MacBook 없이 iPad에서 안정적으로 쓰는 추천 조합은 다음과 같습니다.

- 웹앱 호스팅: GitHub Pages
- 기록 저장: Supabase Free

이 방식이면 MacBook이 꺼져 있어도 iPad에서 같은 웹 주소로 접속하고, 기록은 Supabase 클라우드 DB에 저장됩니다.

## 1. Supabase 설정

1. Supabase에서 새 프로젝트를 만듭니다.
2. Supabase의 SQL Editor를 엽니다.
3. `supabase_schema.sql` 파일 내용을 그대로 실행합니다.
4. Project Settings > API에서 아래 두 값을 복사합니다.
   - Project URL
   - anon public key

## 2. cloud-config.js 수정

`cloud-config.js` 파일을 열고 아래 형식으로 바꿉니다.

```js
window.BATCH_BREW_CLOUD = {
  mode: "supabase",
  supabaseUrl: "https://YOUR_PROJECT_ID.supabase.co",
  supabaseAnonKey: "YOUR_PUBLIC_ANON_KEY",
  table: "batch_brew_records"
};
```

`YOUR_PROJECT_ID`와 `YOUR_PUBLIC_ANON_KEY`만 본인 Supabase 값으로 바꾸면 됩니다.

## 3. GitHub Pages에 올리기

1. GitHub에서 새 public repository를 만듭니다.
2. 이 폴더 안의 파일들을 repository에 올립니다.
   - `index.html`
   - `cloud-config.js`
   - `supabase_schema.sql`
3. Repository Settings > Pages로 이동합니다.
4. Source를 `Deploy from a branch`로 설정합니다.
5. Branch를 `main`, folder를 `/root`로 선택합니다.
6. GitHub Pages 주소가 생성되면 iPad에서 그 주소로 접속합니다.

## 저장 위치

Supabase 모드에서 저장한 기록은 Supabase의 `batch_brew_records` 테이블에 저장됩니다.

## 주의

현재 SQL 정책은 앱 주소를 아는 사람이 기록을 읽고 쓸 수 있는 간단한 공유 로그 방식입니다.
카페 내부 직원만 쓰게 하려면 GitHub Pages 앞에 별도 비밀번호 보호를 두거나, Supabase Auth를 붙이는 방식으로 확장하는 것이 좋습니다.
