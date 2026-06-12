from __future__ import annotations

import importlib
import json
import re
from typing import Any, Iterable, Sequence
from urllib.parse import parse_qs, unquote, urlparse, urlunparse

from .config import DbSettings, load_db_settings, validate_db_settings


_IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")

MAX_RECOMMENDATION_ITEM_CALORIES_KCAL = 1100.0
MAX_RECOMMENDATION_ITEM_PROTEIN_G = 85.0
MAX_RECOMMENDATION_ITEM_FAT_G = 85.0
MAX_RECOMMENDATION_ITEM_CARBS_G = 180.0
MAX_RECOMMENDATION_CANDIDATE_PROTEIN_G = 95.0
MAX_RECOMMENDATION_CANDIDATE_FAT_G = 110.0
MAX_RECOMMENDATION_CANDIDATE_CARBS_G = 240.0


def _require_module(module_name: str, package_name: str | None = None):
    try:
        return importlib.import_module(module_name)
    except ModuleNotFoundError as exc:
        install_name = package_name or module_name
        raise RuntimeError(f"Missing Python dependency '{install_name}'. Install ML/requirements.txt first.") from exc


def _assert_identifier(identifier: str) -> str:
    if not _IDENTIFIER_RE.match(identifier):
        raise ValueError(f"Unsafe SQL identifier: {identifier!r}")
    return identifier


def _column_sql(columns: Sequence[str] | None) -> str:
    if not columns:
        return "*"
    return ", ".join(f'"{_assert_identifier(column)}"' for column in columns)


def _create_pg8000_unix_socket_engine(sqlalchemy, *, user: str, password: str, database: str, socket_dir: str):
    pg8000 = _require_module("pg8000.dbapi", "pg8000")
    unix_sock = socket_dir.rstrip("/")
    if not unix_sock.endswith(".s.PGSQL.5432"):
        unix_sock = f"{unix_sock}/.s.PGSQL.5432"

    def getconn():
        return pg8000.connect(
            user=user,
            password=password,
            database=database,
            unix_sock=unix_sock,
        )

    return sqlalchemy.create_engine("postgresql+pg8000://", creator=getconn, pool_pre_ping=True)


def _create_engine_from_database_url(sqlalchemy, database_url: str):
    parsed = urlparse(database_url)
    query = parse_qs(parsed.query)
    cloud_sql_host = query.get("host", [None])[0]
    if cloud_sql_host and cloud_sql_host.startswith("/cloudsql/"):
        return _create_pg8000_unix_socket_engine(
            sqlalchemy,
            user=unquote(parsed.username or ""),
            password=unquote(parsed.password or ""),
            database=unquote(parsed.path.lstrip("/")),
            socket_dir=cloud_sql_host,
        )

    if parsed.scheme == "postgresql":
        parsed = parsed._replace(scheme="postgresql+pg8000")
        database_url = urlunparse(parsed)
    return sqlalchemy.create_engine(database_url, pool_pre_ping=True)


def get_sql_connection(settings: DbSettings | None = None):
    """Create a SQLAlchemy engine without embedding credentials in source code."""
    sqlalchemy = _require_module("sqlalchemy")
    resolved = settings or load_db_settings()
    validate_db_settings(resolved)

    if resolved.database_url:
        return _create_engine_from_database_url(sqlalchemy, resolved.database_url)

    if resolved.uses_cloud_sql_connector:
        connector_module = _require_module("google.cloud.sql.connector", "cloud-sql-python-connector")
        connector = connector_module.Connector()
        ip_types = connector_module.IPTypes
        ip_type = ip_types.PRIVATE if resolved.cloud_sql_ip_type == "PRIVATE" else ip_types.PUBLIC

        def getconn():
            return connector.connect(
                resolved.cloud_sql_instance,
                "pg8000",
                user=resolved.db_user,
                password=resolved.db_password,
                db=resolved.db_name,
                ip_type=ip_type,
            )

        return sqlalchemy.create_engine("postgresql+pg8000://", creator=getconn, pool_pre_ping=True)

    if resolved.uses_direct_postgres:
        password = resolved.db_password or ""
        if resolved.db_host and resolved.db_host.startswith("/cloudsql/"):
            return _create_pg8000_unix_socket_engine(
                sqlalchemy,
                user=resolved.db_user or "",
                password=password,
                database=resolved.db_name or "",
                socket_dir=resolved.db_host,
            )
        port = resolved.db_port or "5432"
        url = f"postgresql+pg8000://{resolved.db_user}:{password}@{resolved.db_host}:{port}/{resolved.db_name}"
        return sqlalchemy.create_engine(url, pool_pre_ping=True)

    validate_db_settings(resolved)
    raise RuntimeError("Unreachable database settings branch.")


def list_all_tables(engine=None) -> list[str]:
    sqlalchemy = _require_module("sqlalchemy")
    db_engine = engine or get_sql_connection()
    query = sqlalchemy.text("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'")
    with db_engine.connect() as conn:
        result = conn.execute(query)
        return [row[0] for row in result]


def load_table_to_df(
    table_name: str,
    columns: Sequence[str] | None = None,
    where_sql: str | None = None,
    params: dict[str, object] | None = None,
    engine=None,
):
    pd = _require_module("pandas")
    sqlalchemy = _require_module("sqlalchemy")
    db_engine = engine or get_sql_connection()
    safe_table = _assert_identifier(table_name)
    sql = f'SELECT {_column_sql(columns)} FROM "{safe_table}"'
    if where_sql:
        sql = f"{sql} WHERE {where_sql}"
    with db_engine.connect() as conn:
        return pd.read_sql(sqlalchemy.text(sql), conn, params=params or {})


def load_required_tables(required_tables: Iterable[str], engine=None) -> dict[str, object]:
    db_engine = engine or get_sql_connection()
    available = set(list_all_tables(db_engine))
    return {
        table_name: load_table_to_df(table_name, engine=db_engine)
        for table_name in required_tables
        if table_name in available
    }


def _json_object(value: Any) -> dict[str, Any]:
    if isinstance(value, dict):
        return value
    if value is None:
        return {}
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except json.JSONDecodeError:
            return {}
        return parsed if isinstance(parsed, dict) else {}
    return {}


def _as_number(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def _as_int(value: Any, default: int = 0) -> int:
    return int(round(_as_number(value, default)))


def _empty_df():
    pd = _require_module("pandas")
    return pd.DataFrame()


def _read_sql(conn, sql: str, params: dict[str, object] | None = None):
    pd = _require_module("pandas")
    sqlalchemy = _require_module("sqlalchemy")
    return pd.read_sql(sqlalchemy.text(sql), conn, params=params or {})


def _read_sql_expanding(conn, sql: str, bind_name: str, values: Sequence[object], params: dict[str, object] | None = None):
    if not values:
        return _empty_df()
    pd = _require_module("pandas")
    sqlalchemy = _require_module("sqlalchemy")
    statement = sqlalchemy.text(sql).bindparams(sqlalchemy.bindparam(bind_name, expanding=True))
    return pd.read_sql(statement, conn, params={**(params or {}), bind_name: list(values)})


def _table_columns(conn, table_name: str) -> set[str]:
    rows = _read_sql(
        conn,
        """
        SELECT column_name
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = :table_name
        """,
        {"table_name": table_name},
    )
    if rows.empty:
        return set()
    return {str(value) for value in rows["column_name"].tolist()}


def load_recommendation_tables_for_run(run_id: int, engine=None) -> dict[str, object]:
    """Load only the recommendation data needed for a single run.

    The batch-oriented loader reads every row in each table. Online serving should
    instead scope reads to the requested run, active candidate window, and recent
    user history to reduce Cloud SQL transfer and DataFrame build time.
    """
    db_engine = engine or get_sql_connection()
    available = set(list_all_tables(db_engine))
    result: dict[str, object] = {}

    with db_engine.connect() as conn:
        if "recommendation_runs" not in available:
            return result

        runs = _read_sql(conn, "SELECT * FROM recommendation_runs WHERE run_id = :run_id", {"run_id": int(run_id)})
        result["recommendation_runs"] = runs
        if runs.empty:
            return result

        run = runs.iloc[0]
        user_id = _as_int(run.get("user_id"))
        meal_type = str(run.get("context_meal_type") or "lunch")
        target_budget = max(_as_int(run.get("target_meal_budget_krw")), 0)
        target_calories = max(_as_number(run.get("target_meal_calories_kcal"), 1.0), 1.0)
        target_carbs = max(_as_number(run.get("target_meal_carbs_g"), (target_calories * 0.5) / 4.0), 0.0)
        target_protein = max(_as_number(run.get("target_meal_protein_g"), (target_calories * 0.25) / 4.0), 0.0)
        target_fat = max(_as_number(run.get("target_meal_fat_g"), (target_calories * 0.25) / 9.0), 0.0)
        profile_snapshot = _json_object(run.get("profile_snapshot"))
        meal_channel = profile_snapshot.get("mealChannel")

        if "user_profiles" in available:
            profile_columns = _table_columns(conn, "user_profiles")
            profile_order_parts = []
            for column in ("recorded_at", "updated_at", "created_at"):
                if column in profile_columns:
                    profile_order_parts.append(f"{column} DESC NULLS LAST")
            profile_order_parts.append("profile_id DESC")
            profile_order = ", ".join(profile_order_parts)
            result["user_profiles"] = _read_sql(
                conn,
                f"""
                SELECT *
                FROM user_profiles
                WHERE user_id = :user_id
                ORDER BY {profile_order}
                LIMIT 1
                """,
                {"user_id": user_id},
            )

        candidate_params: dict[str, object] = {
            "meal_type": meal_type,
            "budget": target_budget,
            "target_calories": target_calories,
            "target_carbs": target_carbs,
            "target_protein": target_protein,
            "target_fat": target_fat,
            "min_calories": target_calories * 0.35,
            "max_calories": target_calories * 1.85,
            "max_candidate_protein": MAX_RECOMMENDATION_CANDIDATE_PROTEIN_G,
            "max_candidate_fat": MAX_RECOMMENDATION_CANDIDATE_FAT_G,
            "max_candidate_carbs": MAX_RECOMMENDATION_CANDIDATE_CARBS_G,
        }
        channel_clause = ""
        if meal_channel:
            channel_clause = "AND meal_channel = :meal_channel"
            candidate_params["meal_channel"] = str(meal_channel)

        candidate_ids: list[int] = []
        if "meal_candidates" in available:
            candidates = _read_sql(
                conn,
                f"""
                SELECT *
                FROM meal_candidates
                WHERE is_active IS TRUE
                  AND meal_type = :meal_type
                  {channel_clause}
                  AND total_price_krw <= :budget
                  AND total_calories_kcal BETWEEN :min_calories AND :max_calories
                  AND total_protein_g <= :max_candidate_protein
                  AND total_fat_g <= :max_candidate_fat
                  AND total_carbs_g <= :max_candidate_carbs
                ORDER BY
                  (
                    ABS(total_carbs_g - :target_carbs) * 4 +
                    ABS(total_protein_g - :target_protein) * 5 +
                    ABS(total_fat_g - :target_fat) * 9
                  ) ASC,
                  ABS(total_price_krw - :budget) ASC,
                  ABS(total_calories_kcal - :target_calories) ASC,
                  total_protein_g DESC
                LIMIT 500
                """,
                candidate_params,
            )
            result["meal_candidates"] = candidates
            if not candidates.empty:
                candidate_ids = [int(value) for value in candidates["candidate_id"].dropna().tolist()]

        candidate_food_ids: list[int] = []
        if "meal_candidate_items" in available and candidate_ids:
            candidate_items = _read_sql_expanding(
                conn,
                """
                SELECT *
                FROM meal_candidate_items
                WHERE candidate_id IN :candidate_ids
                """,
                "candidate_ids",
                candidate_ids,
            )
            result["meal_candidate_items"] = candidate_items
            if not candidate_items.empty and "food_id" in candidate_items:
                candidate_food_ids = [int(value) for value in candidate_items["food_id"].dropna().unique().tolist()]
        elif "meal_candidate_items" in available:
            result["meal_candidate_items"] = _empty_df()

        if "foods" in available:
            food_params: dict[str, object] = {
                "budget": target_budget,
                "target_calories": target_calories,
                "target_carbs": target_carbs,
                "target_protein": target_protein,
                "target_fat": target_fat,
                "max_food_calories": MAX_RECOMMENDATION_ITEM_CALORIES_KCAL,
                "max_food_protein": MAX_RECOMMENDATION_ITEM_PROTEIN_G,
                "max_food_fat": MAX_RECOMMENDATION_ITEM_FAT_G,
                "max_food_carbs": MAX_RECOMMENDATION_ITEM_CARBS_G,
            }
            food_channel_clause = ""
            if meal_channel:
                food_channel_clause = "AND meal_channel = :meal_channel"
                food_params["meal_channel"] = str(meal_channel)

            foods = _read_sql(
                conn,
                f"""
                SELECT *
                FROM foods
                WHERE is_active IS TRUE
                  {food_channel_clause}
                  AND price_krw <= :budget
                  AND calories_kcal <= :max_food_calories
                  AND protein_g <= :max_food_protein
                  AND fat_g <= :max_food_fat
                  AND carbs_g <= :max_food_carbs
                ORDER BY
                  (
                    ABS(carbs_g - (:target_carbs / 2.0)) * 4 +
                    ABS(protein_g - (:target_protein / 2.0)) * 5 +
                    ABS(fat_g - (:target_fat / 2.0)) * 9
                  ) ASC,
                  ABS(calories_kcal - (:target_calories / 2.0)) ASC,
                  protein_g DESC,
                  price_krw DESC
                LIMIT 900
                """,
                food_params,
            )
            if candidate_food_ids:
                candidate_foods = _read_sql_expanding(
                    conn,
                    "SELECT * FROM foods WHERE food_id IN :food_ids",
                    "food_ids",
                    candidate_food_ids,
                )
                pd = _require_module("pandas")
                foods = pd.concat([foods, candidate_foods], ignore_index=True).drop_duplicates(subset=["food_id"])
            result["foods"] = foods

        if "food_logs" in available:
            if db_engine.dialect.name == "postgresql":
                food_logs_sql = """
                    SELECT *
                    FROM food_logs
                    WHERE user_id = :user_id
                      AND deleted_at IS NULL
                      AND consumed_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
                    ORDER BY consumed_at DESC
                    LIMIT 500
                """
            else:
                food_logs_sql = """
                    SELECT *
                    FROM food_logs
                    WHERE user_id = :user_id
                      AND deleted_at IS NULL
                      AND consumed_at >= datetime('now', '-7 days')
                    ORDER BY consumed_at DESC
                    LIMIT 500
                """
            food_logs = _read_sql(conn, food_logs_sql, {"user_id": user_id})
            result["food_logs"] = food_logs
        else:
            food_logs = _empty_df()

        if "recommendation_candidates" in available and not food_logs.empty and "recommendation_candidate_id" in food_logs:
            recommendation_candidate_ids = [int(value) for value in food_logs["recommendation_candidate_id"].dropna().unique().tolist()]
            result["recommendation_candidates"] = _read_sql_expanding(
                conn,
                "SELECT * FROM recommendation_candidates WHERE recommendation_candidate_id IN :recommendation_candidate_ids",
                "recommendation_candidate_ids",
                recommendation_candidate_ids,
            )
        elif "recommendation_candidates" in available:
            result["recommendation_candidates"] = _empty_df()

        if "user_food_entries" in available and not food_logs.empty and "user_food_entry_id" in food_logs:
            user_food_entry_ids = [int(value) for value in food_logs["user_food_entry_id"].dropna().unique().tolist()]
            result["user_food_entries"] = _read_sql_expanding(
                conn,
                "SELECT * FROM user_food_entries WHERE user_food_entry_id IN :user_food_entry_ids",
                "user_food_entry_ids",
                user_food_entry_ids,
            )
        elif "user_food_entries" in available:
            result["user_food_entries"] = _empty_df()

        allergen_ids: list[int] = []
        if "user_allergens" in available:
            user_allergens = _read_sql(conn, "SELECT * FROM user_allergens WHERE user_id = :user_id", {"user_id": user_id})
            result["user_allergens"] = user_allergens
            if not user_allergens.empty:
                allergen_ids = [int(value) for value in user_allergens["allergen_id"].dropna().unique().tolist()]

        if "food_allergens" in available and allergen_ids:
            result["food_allergens"] = _read_sql_expanding(
                conn,
                "SELECT * FROM food_allergens WHERE allergen_id IN :allergen_ids",
                "allergen_ids",
                allergen_ids,
            )
        elif "food_allergens" in available:
            result["food_allergens"] = _empty_df()

        if "user_item_interactions" in available:
            result["user_item_interactions"] = _read_sql(
                conn,
                """
                SELECT *
                FROM user_item_interactions
                WHERE user_id = :user_id
                ORDER BY created_at DESC
                LIMIT 500
                """,
                {"user_id": user_id},
            )

    return result
