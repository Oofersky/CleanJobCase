from collections.abc import AsyncGenerator
from sqlalchemy import inspect, text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from app.config import get_settings
settings = get_settings()
engine = create_async_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)

class Base(DeclarativeBase):
    pass

async def get_session() -> AsyncGenerator[AsyncSession, None]:
    async with SessionLocal() as session:
        yield session

def _apply_schema_patches(sync_conn) -> None:
    inspector = inspect(sync_conn)
    tables = set(inspector.get_table_names())
    if 'users' not in tables:
        return
    columns = {col['name'] for col in inspector.get_columns('users')}
    patches: list[tuple[str, str]] = [('focus', "ALTER TABLE users ADD COLUMN IF NOT EXISTS focus VARCHAR(32) DEFAULT 'university'"), ('name', "ALTER TABLE users ADD COLUMN IF NOT EXISTS name VARCHAR(80) DEFAULT 'Участник'"), ('password_hash', "ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash VARCHAR(255) DEFAULT ''"), ('created_at', 'ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()')]
    for column, sql in patches:
        if column not in columns:
            sync_conn.execute(text(sql))
    if 'age_group' in columns:
        sync_conn.execute(text('ALTER TABLE users DROP COLUMN IF EXISTS age_group'))
    if 'practice_messages' in tables:
        msg_cols = {col['name'] for col in inspector.get_columns('practice_messages')}
        if 'rating' not in msg_cols:
            sync_conn.execute(text('ALTER TABLE practice_messages ADD COLUMN IF NOT EXISTS rating VARCHAR(16)'))

async def init_db() -> None:
    from app.auth import models
    from app.practice import models as practice_models
    from app.telemetry import models as telemetry_models
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        await conn.run_sync(_apply_schema_patches)
