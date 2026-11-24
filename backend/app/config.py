from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    cors_origins: str = "http://127.0.0.1:8181,http://localhost:8181"
    trust_proxy: bool = False
    enable_openapi: bool | None = None
    database_url: str = "postgresql+asyncpg://pv:pv@localhost:5432/pv"
    # cookie session signing — set a long random value in production
    secret_key: str = "dev-only-change-me-pv-auth-secret-key-32b"
    session_max_age_seconds: int = 60 * 60 * 24 * 14
    seed_login: str = "artemshe"
    seed_email: str = "artemshe@local.dev"
    seed_password: str = "artemsheartemshe"

    vacancies_api_url: str = "http://opendata.trudvsem.ru/api/v1/vacancies/region/39"
    # lite: меньше вакансий → быстрее fetch + один AI-batch
    vacancies_max: int = 20
    vacancies_page_limit: int = 10
    schedule_interval_minutes: int = 60
    # false: отчёты только по кнопке (иначе scheduler плодит записи сам)
    schedule_enabled: bool = False
    schedule_use_ai: bool = False



    reports_dir: str = "data/reports"
    fixtures_dir: str = "data/fixtures"

    gigachat_credentials: str = ""
    gigachat_scope: str = "GIGACHAT_API_PERS"
    gigachat_model: str = "GigaChat-2"
    gigachat_verify_ssl_certs: bool = True
    gigachat_timeout: float = 35.0
    gigachat_min_interval_seconds: float = 0.2
    gigachat_retry_max: int = 2

    @field_validator("app_env")
    @classmethod
    def normalize_env(cls, value: str) -> str:
        return (value or "development").strip().lower()

    @field_validator("gigachat_credentials")
    @classmethod
    def strip_creds(cls, value: str) -> str:
        return (value or "").strip().strip('"').strip("'")

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env == "production"

    @property
    def openapi_enabled(self) -> bool:
        if self.enable_openapi is None:
            return not self.is_production
        return self.enable_openapi


@lru_cache
def get_settings() -> Settings:
    return Settings()
