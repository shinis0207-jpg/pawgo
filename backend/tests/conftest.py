"""Pytest fixtures for the PawGo backend.

Strategy: transactional-rollback against the local pawgo DB.
Each test runs inside an outer transaction that is unconditionally
rolled back at teardown, so the DB is left untouched.

We use a NullPool-backed test engine so every fixture invocation gets a
fresh asyncpg connection. The production engine's pool would otherwise
hand back a connection whose previous transaction is still being cleaned
up, producing `InterfaceError: another operation is in progress` on the
second test.

`join_transaction_mode="create_savepoint"` keeps the AsyncSession's own
begin/commit/rollback nested under a SAVEPOINT so the outer transaction
stays alive long enough to be rolled back at teardown.
"""
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.pool import NullPool

from app.config import get_settings


_settings = get_settings()
test_engine = create_async_engine(
    _settings.database_url.split("?")[0],
    poolclass=NullPool,
    echo=False,
)


@pytest_asyncio.fixture
async def db_session() -> AsyncSession:
    conn = await test_engine.connect()
    trans = await conn.begin()
    session = AsyncSession(
        bind=conn,
        expire_on_commit=False,
        join_transaction_mode="create_savepoint",
    )
    # Each test sees an empty places table inside its outer transaction.
    # The DELETE is rolled back at teardown, so any seed data (Phase1-9 dummy,
    # future MFDS imports, etc.) committed against the dev DB survives.
    # CASCADE walks pet_policies / vet_hospitals / place_translations / etc.
    await session.execute(text("DELETE FROM places"))
    await session.flush()
    try:
        yield session
    finally:
        await session.close()
        if trans.is_active:
            await trans.rollback()
        await conn.close()
