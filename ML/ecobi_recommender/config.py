from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Mapping


@dataclass(frozen=True)
class DbSettings:
    database_url: str | None
    cloud_sql_instance: str | None
    db_user: str | None
    db_password: str | None
    db_name: str | None
    db_host: str | None
    db_port: str | None
    cloud_sql_ip_type: str

    @property
    def uses_cloud_sql_connector(self) -> bool:
        return bool(self.cloud_sql_instance and self.db_user and self.db_name)

    @property
    def uses_direct_postgres(self) -> bool:
        return bool(self.database_url or (self.db_host and self.db_user and self.db_name))


def _cloud_sql_instance_from_env(env: Mapping[str, str]) -> str | None:
    explicit = env.get("CLOUD_SQL_INSTANCE_CONNECTION_NAME") or env.get("INSTANCE_CONNECTION_NAME")
    if explicit:
        return explicit

    project_id = env.get("GCP_PROJECT_ID") or env.get("PROJECT_ID")
    region = env.get("CLOUD_SQL_REGION") or env.get("REGION")
    instance = env.get("CLOUD_SQL_INSTANCE_NAME") or env.get("SQL_INSTANCE_NAME")
    if project_id and region and instance:
        return f"{project_id}:{region}:{instance}"
    return None


def load_db_settings(env: Mapping[str, str] | None = None) -> DbSettings:
    source = env or os.environ
    return DbSettings(
        database_url=source.get("DATABASE_URL"),
        cloud_sql_instance=_cloud_sql_instance_from_env(source),
        db_user=source.get("DB_USER"),
        db_password=source.get("DB_PASSWORD"),
        db_name=source.get("DB_NAME"),
        db_host=source.get("DB_HOST"),
        db_port=source.get("DB_PORT"),
        cloud_sql_ip_type=source.get("CLOUD_SQL_IP_TYPE", "PUBLIC").upper(),
    )


def validate_db_settings(settings: DbSettings) -> None:
    if settings.database_url:
        return
    if settings.uses_cloud_sql_connector:
        if not settings.db_password:
            raise RuntimeError("DB_PASSWORD is required when using Cloud SQL connector.")
        return
    if settings.uses_direct_postgres:
        return
    raise RuntimeError(
        "Database settings are missing. Set DATABASE_URL, or DB_HOST/DB_USER/DB_NAME, "
        "or CLOUD_SQL_INSTANCE_CONNECTION_NAME with DB_USER/DB_PASSWORD/DB_NAME."
    )
