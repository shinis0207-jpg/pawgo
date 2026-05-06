# PawGo 🐾

반려동물 동반 여행 플랫폼 — 반려동물과 함께 어디서든 자유롭게

---

## 목차

1. [카카오 개발자 앱 등록](#1-카카오-개발자-앱-등록)
2. [환경변수 설정](#2-환경변수-설정)
3. [백엔드 실행](#3-백엔드-실행)
4. [장소 데이터 시드](#4-장소-데이터-시드)
5. [앱 실행](#5-앱-실행)
6. [프로젝트 구조](#6-프로젝트-구조)

---

## 1. 카카오 개발자 앱 등록

> **카카오 지도(JavaScript SDK)** 와 **카카오 로컬 검색 API(REST)** 에 각각 다른 키를 사용합니다.

### 1-1. 애플리케이션 생성

1. [카카오 개발자 콘솔](https://developers.kakao.com) 접속 → 로그인
2. **내 애플리케이션 → 애플리케이션 추가하기**
3. 앱 이름: `PawGo` / 사업자명: 본인 이름 입력 후 저장

### 1-2. 앱 키 확인

**내 애플리케이션 → 앱 설정 → 앱 키** 에서 두 가지 키를 복사합니다.

| 키 종류 | 사용처 | 환경변수 |
|---------|--------|----------|
| **JavaScript 키** | 카카오 지도 SDK (앱 WebView) | `EXPO_PUBLIC_KAKAO_MAP_JS_KEY` |
| **REST API 키** | 로컬 검색 API / OAuth | `KAKAO_REST_API_KEY` |

### 1-3. 플랫폼 등록

**앱 설정 → 플랫폼** 에서 두 플랫폼을 등록합니다.

**Android**
```
패키지명: com.pawgo.app
```

**iOS**
```
번들 ID: com.pawgo.app
```

**Web** (카카오 지도 WebView 로컬 개발용)
```
사이트 도메인: http://localhost
```

### 1-4. 카카오 로그인 활성화 (선택)

**제품 설정 → 카카오 로그인 → 활성화** ON  
동의항목: 닉네임, 프로필 사진, 카카오계정(이메일) 체크

---

## 2. 환경변수 설정

```bash
# 프로젝트 루트에서 실행
cd pawgo
cp .env.example .env
```

`.env` 파일을 열고 아래 값을 채웁니다.

```dotenv
# 필수 — 카카오 지도 JavaScript 키 (1-2에서 복사)
EXPO_PUBLIC_KAKAO_MAP_JS_KEY=발급받은_JavaScript_키

# 필수 — 카카오 REST API 키 (1-2에서 복사)
KAKAO_REST_API_KEY=발급받은_REST_API_키

# 필수 — Claude AI (https://console.anthropic.com)
ANTHROPIC_API_KEY=sk-ant-...

# 지도 provider (kakao 고정, 추후 google 으로 교체 가능)
EXPO_PUBLIC_MAP_PROVIDER=kakao

# 백엔드 주소 (로컬 개발 기본값 그대로 사용)
EXPO_PUBLIC_API_URL=http://localhost:8000/api/v1
DATABASE_URL=postgresql+asyncpg://pawgo:pawgo@localhost:5432/pawgo
DATABASE_URL_SYNC=postgresql://pawgo:pawgo@localhost:5432/pawgo
REDIS_URL=redis://localhost:6379
SECRET_KEY=로컬_개발용_아무_문자열
```

---

## 3. 백엔드 실행

Docker가 설치되어 있어야 합니다.

```bash
# PostgreSQL(PostGIS) + Redis + FastAPI 한번에 실행
docker-compose up -d

# 실행 확인
docker-compose ps
```

| 서비스 | 주소 |
|--------|------|
| FastAPI | http://localhost:8000 |
| Swagger UI | http://localhost:8000/docs |
| PostgreSQL | localhost:5432 |
| Redis | localhost:6379 |

```bash
# 로그 확인
docker-compose logs -f backend
```

---

## 4. 장소 데이터 시드

카카오 로컬 검색 API로 서울 반려동물 동반 장소를 수집해 DB에 저장합니다.

```bash
# 의존성 설치 (최초 1회)
pip install requests psycopg2-binary python-dotenv

# 수집 결과만 미리 확인 (DB 저장 없음)
python scripts/seed_places.py --dry-run

# 실제 DB 저장 실행
python scripts/seed_places.py

# 카테고리당 최대 수 제한 (빠른 테스트용)
python scripts/seed_places.py --limit 10
```

**수집 대상**

| 카테고리 | 검색 키워드 |
|----------|------------|
| 카페 | 펫 카페, 반려견 동반 카페, 강아지 카페 |
| 식당 | 반려동물 동반 식당, 펫 프렌들리 식당 |
| 숙박 | 반려동물 동반 호텔, 펫 호텔 |
| 공원 | 반려견 공원, 강아지 운동장 |
| 동물병원 | 동물병원 (강남/홍대/잠실/마포), 24시, 응급 |

---

## 5. 앱 실행

### 사전 준비

```bash
cd frontend
npm install
```

### 실행

```bash
npx expo start
```

터미널에 QR 코드와 함께 아래 단축키가 표시됩니다.

| 키 | 동작 |
|----|------|
| `i` | iOS 시뮬레이터 실행 |
| `a` | Android 에뮬레이터 실행 |
| `w` | 웹 브라우저 열기 |

**실기기 테스트** — [Expo Go](https://expo.dev/go) 앱 설치 후 QR 코드 스캔

> **iOS 시뮬레이터 위치 설정**  
> Simulator 앱 → Features → Location → Custom Location  
> Latitude: `37.5665` / Longitude: `126.9780` (서울)

### 주요 화면 확인 순서

```
1. 지도 탭      → 현재 위치 주변 반려동물 동반 장소 핀 확인
2. 검색 탭      → 카테고리/필터 조합 검색
3. 반려동물 탭  → 반려동물 등록 (이름, 종류, 체중)
4. 프로필 탭    → 언어 전환 (KO / EN / JA / ZH)
5. 장소 상세    → 지도 핀 클릭 → 전화/길찾기 버튼
```

---

## 6. 프로젝트 구조

```
pawgo/
├── .env.example              ← 환경변수 템플릿 (이것 복사해서 .env 작성)
├── docker-compose.yml        ← DB + Redis + Backend 통합 실행
├── scripts/
│   └── seed_places.py        ← 카카오 API → DB 시드 스크립트
├── backend/                  ← FastAPI + PostgreSQL/PostGIS
│   ├── app/
│   │   ├── main.py
│   │   ├── models/           ← SQLAlchemy (User, Pet, Place, Review, Vet)
│   │   ├── routers/          ← auth, pets, places, reviews, ai
│   │   └── services/         ← auth, places(ST_DWithin), cache, ai(Claude)
│   └── requirements.txt
└── frontend/                 ← React Native + Expo Router
    ├── app/
    │   ├── (tabs)/           ← 지도 / 검색 / 반려동물 / 프로필
    │   ├── place/[id].tsx    ← 장소 상세
    │   └── auth/             ← 로그인 / 회원가입
    ├── components/
    │   └── map/
    │       ├── MapView.tsx           ← 단일 진입점
    │       ├── types.ts
    │       └── providers/
    │           ├── KakaoMapProvider.tsx  ← WebView + 카카오 JS SDK
    │           └── GoogleMapProvider.tsx ← Stub (추후 활성화)
    ├── i18n/                 ← ko / en / ja / zh
    └── .env.example
```

### 지도 Provider 교체

카카오 → Google로 전환 시 `.env` 파일 한 줄만 변경합니다.  
나머지 코드는 수정 없이 동작합니다.

```dotenv
# .env
EXPO_PUBLIC_MAP_PROVIDER=google          # kakao → google 변경
EXPO_PUBLIC_GOOGLE_MAPS_KEY=your-key     # Google Maps API 키 추가
```

`frontend/components/map/providers/GoogleMapProvider.tsx` 의 주석을 해제하면 완료됩니다.

---

## API 주요 엔드포인트

```
POST /api/v1/auth/register          회원가입
POST /api/v1/auth/login             로그인
POST /api/v1/auth/oauth             카카오/구글 소셜 로그인

GET  /api/v1/places/nearby          위치 기반 주변 장소 검색
     ?lat=37.5&lng=126.9&radius_km=5&category=cafe&lang=ko
GET  /api/v1/places/emergency-vets  긴급 동물병원 목록
GET  /api/v1/places/{id}            장소 상세 (?lang=ko|en|ja|zh)

GET  /api/v1/pets                   내 반려동물 목록
POST /api/v1/pets                   반려동물 등록

GET  /api/v1/reviews/place/{id}     장소 리뷰
POST /api/v1/reviews                리뷰 작성

POST /api/v1/ai/chat                AI 챗봇 (Claude)
POST /api/v1/ai/travel-tips         AI 여행 팁
```

전체 API 명세: **http://localhost:8000/docs** (백엔드 실행 후)
