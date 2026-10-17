from datetime import datetime, timezone
from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base

class FeedbackOpinion(Base):
    __tablename__ = 'feedback_opinions'
    __table_args__ = (UniqueConstraint('user_id', 'client_key', name='uq_feedback_user_client_key'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    session_id: Mapped[str | None] = mapped_column(String(40), nullable=True, index=True)
    client_key: Mapped[str] = mapped_column(String(80), index=True)
    fingerprint: Mapped[str] = mapped_column(String(64), index=True)
    rating: Mapped[str] = mapped_column(String(16))
    message_excerpt: Mapped[str] = mapped_column(Text)
    scenario: Mapped[str] = mapped_column(String(32), default='university', index=True)
    mode: Mapped[str] = mapped_column(String(16), default='info')
    tags: Mapped[list] = mapped_column(JSONB, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
