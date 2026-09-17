"""place_menus.price Integer -> String(50)

Revision ID: place_menu_price_str
Revises: place_menus
Create Date: 2026-09-17

- 메뉴 가격에 자유 텍스트("변동", "시가", "10,000원~15,000원") 허용.
- upgrade: price::text 로 무손실 변환 (15000 -> "15000"). 기존 데이터에 "원"·콤마를
  덧붙이지 않는다 — UI 표현은 앱이 언어별로 처리(영어 화면에 "원"이 나오지 않게).
  단, 이후 관리자가 입력하는 자유텍스트에는 단위·콤마가 포함될 수 있다.
- downgrade: price::integer. 순수 숫자 문자열만 복원 가능.
  비숫자 자유텍스트가 1건이라도 있으면 캐스트 실패 = 사실상 편도 마이그레이션.
  필요 시 해당 행 수동 정리 선행.
- 이 레포 최초의 컬럼 타입 변경(alter_column) 마이그레이션.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "place_menu_price_str"
down_revision: Union[str, Sequence[str], None] = "place_menus"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column(
        "place_menus", "price",
        type_=sa.String(length=50),
        existing_type=sa.Integer(),
        existing_nullable=True,
        postgresql_using="price::text",
    )


def downgrade() -> None:
    op.alter_column(
        "place_menus", "price",
        type_=sa.Integer(),
        existing_type=sa.String(length=50),
        existing_nullable=True,
        postgresql_using="price::integer",
    )
