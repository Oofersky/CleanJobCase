from functools import lru_cache
from pydantic import field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
_INSECURE_JWT_SECRETS = frozenset({'', 'change-me-in-production', 'secret', 'jwt-secret'})
_INSECURE_ADMIN_TOKENS = frozenset({'mentorai-admin-local', 'admin', 'password', 'changeme'})

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file='.env', extra='ignore')
    app_env: str = 'development'
    allow_insecure_defaults: bool = False
    database_url: str = 'postgresql+asyncpg://mentorai:mentorai@localhost:5432/mentorai'
    jwt_secret: str = 'change-me-in-production'
    jwt_expire_minutes: int = 60 * 24
    cors_origins: str = 'http://127.0.0.1:8181,http://localhost:8181'
    chat_rate_limit: int = 30
    chat_rate_window_seconds: int = 60
    auth_rate_limit: int = 10
    auth_rate_window_seconds: int = 60
    trust_proxy: bool = False
    enable_openapi: bool | None = None
    gigachat_credentials: str = ''
    gigachat_scope: str = 'GIGACHAT_API_PERS'
    gigachat_model: str = 'GigaChat-2'
    gigachat_verify_ssl_certs: bool = True
    gigachat_timeout: float = 45.0
    admin_token: str = ''
    chat_require_auth: bool = True

    @field_validator('app_env')
    @classmethod
    def normalize_env(cls, value: str) -> str:
        return (value or 'development').strip().lower()

    @model_validator(mode='after')
    def harden_secrets(self) -> 'Settings':
        self.gigachat_credentials = self.gigachat_credentials.strip().strip('"').strip("'")
        self.admin_token = self.admin_token.strip().strip('"').strip("'")
        self.jwt_secret = self.jwt_secret.strip().strip('"').strip("'")
        secret = self.jwt_secret
        weak_jwt = secret in _INSECURE_JWT_SECRETS or len(secret) < 32
        if weak_jwt:
            if self.is_production:
                raise ValueError('JWT_SECRET must be a unique value at least 32 characters in production')
            if not secret:
                self.jwt_secret = 'dev-only-insecure-jwt-secret-do-not-use!!'
        admin = self.admin_token
        weak_admin = bool(admin) and (admin.lower() in _INSECURE_ADMIN_TOKENS or len(admin) < 16)
        if weak_admin and self.is_production:
            raise ValueError('ADMIN_TOKEN is too weak for production (min 16 chars, not a known sample). Leave empty to disable admin.')
        if self.enable_openapi is None:
            self.enable_openapi = self.app_env != 'production'
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(',') if o.strip()]

    @property
    def is_production(self) -> bool:
        return self.app_env == 'production'

@lru_cache
def get_settings() -> Settings:
    return Settings()
