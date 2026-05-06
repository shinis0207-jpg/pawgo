"""
서울 반려동물 동반 장소 시드 스크립트
카카오 로컬 검색 API → PostgreSQL (PostGIS)

사용법:
    cd pawgo
    cp .env.example .env          # KAKAO_REST_API_KEY, DATABASE_URL_SYNC 입력
    pip install requests psycopg2-binary python-dotenv
    python scripts/seed_places.py
    python scripts/seed_places.py --dry-run   # DB 저장 없이 결과만 출력
    python scripts/seed_places.py --limit 50  # 카테고리당 최대 결과 수 제한
"""

import argparse
import os
import sys
import time
import json
from dataclasses import dataclass, field
from typing import Optional

import requests
import psycopg2
import psycopg2.extras
from dotenv import load_dotenv

load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "..", ".env"))

KAKAO_REST_API_KEY = os.getenv("KAKAO_REST_API_KEY", "")
DATABASE_URL_SYNC = os.getenv(
    "DATABASE_URL_SYNC",
    "postgresql://pawgo:pawgo@localhost:5432/pawgo",
)

KAKAO_SEARCH_URL = "https://dapi.kakao.com/v2/local/search/keyword.json"

# ── 검색 정의 ──────────────────────────────────────────────────────────────
# (검색어, DB 카테고리, 실내허용, 실외허용) 조합
# category_group_code: CE7=카페, FD6=음식점, AT4=관광명소, HP8=병원
SEARCH_TARGETS = [
    # 카페
    ("펫 카페 서울",            "cafe",          True,  True,  "CE7"),
    ("반려견 동반 카페 서울",    "cafe",          True,  True,  "CE7"),
    ("강아지 카페 서울",         "cafe",          True,  False, "CE7"),
    # 식당
    ("반려동물 동반 식당 서울",  "restaurant",    True,  True,  "FD6"),
    ("반려견 동반 레스토랑 서울","restaurant",    True,  True,  "FD6"),
    ("펫 프렌들리 식당 서울",    "restaurant",    True,  True,  "FD6"),
    # 숙박
    ("반려동물 동반 호텔 서울",  "accommodation", True,  True,  ""),
    ("펫 호텔 서울",             "accommodation", True,  True,  ""),
    ("강아지 동반 숙소 서울",    "accommodation", True,  True,  ""),
    # 공원·산책로
    ("반려견 공원 서울",         "park",          False, True,  "AT4"),
    ("강아지 운동장 서울",       "park",          False, True,  "AT4"),
    ("반려동물 놀이터 서울",     "park",          False, True,  "AT4"),
    # 동물병원
    ("동물병원 강남",            "vet",           True,  False, "HP8"),
    ("동물병원 홍대",            "vet",           True,  False, "HP8"),
    ("동물병원 잠실",            "vet",           True,  False, "HP8"),
    ("동물병원 마포",            "vet",           True,  False, "HP8"),
    ("24시 동물병원 서울",       "vet",           True,  False, "HP8"),
    ("응급 동물병원 서울",       "vet",           True,  False, "HP8"),
]

# 검색 중심 좌표 (서울 주요 지점)
SEOUL_CENTERS = [
    (37.4979, 127.0276, "강남"),
    (37.5563, 126.9234, "홍대"),
    (37.5340, 126.9946, "이태원"),
    (37.5407, 127.0706, "건대"),
    (37.5559, 126.9368, "신촌"),
    (37.5447, 127.0374, "서울숲"),
    (37.5172, 127.0473, "강남역"),
    (37.5133, 127.1028, "잠실"),
]


@dataclass
class KakaoPlace:
    kakao_id: str
    name: str
    category_raw: str
    address: str
    road_address: str
    phone: str
    lat: float
    lng: float
    place_url: str
    db_category: str
    allows_indoor: bool
    allows_outdoor: bool


def kakao_search(
    query: str,
    lat: float,
    lng: float,
    category_group_code: str = "",
    radius: int = 5000,
    page: int = 1,
    size: int = 15,
) -> dict:
    headers = {"Authorization": f"KakaoAK {KAKAO_REST_API_KEY}"}
    params = {
        "query": query,
        "y": lat,
        "x": lng,
        "radius": radius,
        "page": page,
        "size": size,
        "sort": "accuracy",
    }
    if category_group_code:
        params["category_group_code"] = category_group_code

    resp = requests.get(KAKAO_SEARCH_URL, headers=headers, params=params, timeout=10)
    resp.raise_for_status()
    return resp.json()


def collect_places(
    query: str,
    db_category: str,
    allows_indoor: bool,
    allows_outdoor: bool,
    category_group_code: str,
    center_lat: float,
    center_lng: float,
    max_per_center: int = 30,
) -> list[KakaoPlace]:
    results: list[KakaoPlace] = []
    seen_ids: set[str] = set()

    for page in range(1, 4):  # 최대 3페이지 (45건)
        if len(results) >= max_per_center:
            break
        try:
            data = kakao_search(
                query, center_lat, center_lng, category_group_code, page=page
            )
        except Exception as e:
            print(f"  ⚠  API 오류 (page={page}): {e}")
            break

        documents = data.get("documents", [])
        if not documents:
            break

        for doc in documents:
            kakao_id = doc["id"]
            if kakao_id in seen_ids:
                continue
            seen_ids.add(kakao_id)

            try:
                lat_f = float(doc["y"])
                lng_f = float(doc["x"])
            except (ValueError, KeyError):
                continue

            results.append(
                KakaoPlace(
                    kakao_id=kakao_id,
                    name=doc["place_name"],
                    category_raw=doc.get("category_name", ""),
                    address=doc.get("address_name", ""),
                    road_address=doc.get("road_address_name", ""),
                    phone=doc.get("phone", ""),
                    lat=lat_f,
                    lng=lng_f,
                    place_url=doc.get("place_url", ""),
                    db_category=db_category,
                    allows_indoor=allows_indoor,
                    allows_outdoor=allows_outdoor,
                )
            )

        # 다음 페이지 없으면 종료
        if data.get("meta", {}).get("is_end", True):
            break

        time.sleep(0.2)  # API 레이트 리밋 방지

    return results


def upsert_place(cur, place: KakaoPlace) -> str:
    """
    external_id(카카오 장소 ID)가 이미 있으면 SKIP,
    없으면 INSERT. 반환값: 'inserted' | 'skipped'
    """
    cur.execute("SELECT id FROM places WHERE external_id = %s", (place.kakao_id,))
    if cur.fetchone():
        return "skipped"

    address = place.road_address or place.address
    # 서울시 구 이름 추출 (예: "서울 강남구 역삼동" → city="강남구")
    parts = address.split()
    city = None
    for part in parts:
        if part.endswith("구") or part.endswith("시"):
            city = part
            break

    cur.execute(
        """
        INSERT INTO places (
            name, category, latitude, longitude, address, city, province,
            phone, allows_indoor, allows_outdoor, has_parking,
            rating, review_count, is_verified, is_active, external_id,
            created_at, updated_at
        ) VALUES (
            %s, %s::placecategory, %s, %s,
            %s, %s, %s, %s, %s, %s, false,
            0.0, 0, false, true, %s,
            NOW(), NOW()
        )
        """,
        (
            place.name,
            place.db_category.upper(),
            place.lat,
            place.lng,
            address,
            city,
            "서울특별시",
            place.phone or None,
            place.allows_indoor,
            place.allows_outdoor,
            f"kakao_{place.kakao_id}",
        ),
    )
    return "inserted"


def upsert_vet_info(cur, place_id: int, place: KakaoPlace) -> None:
    """동물병원이면 vet_hospitals 테이블에도 삽입."""
    cur.execute("SELECT id FROM vet_hospitals WHERE place_id = %s", (place_id,))
    if cur.fetchone():
        return
    is_24h = "24시" in place.name or "24H" in place.name.upper()
    emergency = "응급" in place.name or "긴급" in place.name
    cur.execute(
        """
        INSERT INTO vet_hospitals (place_id, is_24h, emergency, created_at)
        VALUES (%s, %s, %s, NOW())
        """,
        (place_id, is_24h, emergency),
    )


def run(dry_run: bool = False, limit: int = 45) -> None:
    if not KAKAO_REST_API_KEY:
        sys.exit("❌  KAKAO_REST_API_KEY 가 설정되지 않았습니다. .env 파일을 확인하세요.")

    print(f"{'[DRY RUN] ' if dry_run else ''}PawGo 장소 시드 시작\n")

    # 전체 수집
    all_places: dict[str, KakaoPlace] = {}  # kakao_id → KakaoPlace (중복 제거)

    for query, category, indoor, outdoor, cg_code in SEARCH_TARGETS:
        for lat, lng, area in SEOUL_CENTERS:
            print(f"  🔍 [{area}] {query} …", end=" ", flush=True)
            places = collect_places(
                query, category, indoor, outdoor, cg_code, lat, lng,
                max_per_center=limit,
            )
            new = 0
            for p in places:
                if p.kakao_id not in all_places:
                    all_places[p.kakao_id] = p
                    new += 1
            print(f"{new}건 신규")
            time.sleep(0.1)

    print(f"\n총 수집: {len(all_places)}건\n")

    if dry_run:
        by_cat: dict[str, int] = {}
        for p in all_places.values():
            by_cat[p.db_category] = by_cat.get(p.db_category, 0) + 1
        print("카테고리별 수집 결과:")
        for cat, cnt in sorted(by_cat.items()):
            print(f"  {cat:15s}: {cnt}건")
        print("\n[DRY RUN] DB 저장을 건너뜁니다.")
        return

    # DB 저장
    conn = psycopg2.connect(DATABASE_URL_SYNC)
    conn.autocommit = False
    cur = conn.cursor()

    inserted = skipped = 0
    try:
        for place in all_places.values():
            status = upsert_place(cur, place)
            if status == "inserted":
                inserted += 1
                if place.db_category == "vet":
                    # 방금 삽입된 place_id 조회
                    cur.execute(
                        "SELECT id FROM places WHERE external_id = %s",
                        (f"kakao_{place.kakao_id}",),
                    )
                    row = cur.fetchone()
                    if row:
                        upsert_vet_info(cur, row[0], place)
            else:
                skipped += 1

        conn.commit()
        print(f"✅  완료 — 신규 삽입: {inserted}건 / 중복 스킵: {skipped}건")
    except Exception as e:
        conn.rollback()
        print(f"❌  DB 오류: {e}")
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="PawGo 장소 시드 스크립트")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="DB에 저장하지 않고 수집 결과만 출력",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=45,
        metavar="N",
        help="지점당 최대 수집 건수 (기본 45)",
    )
    args = parser.parse_args()
    run(dry_run=args.dry_run, limit=args.limit)
