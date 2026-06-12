"""Backward-compatible DB connector wrapper.

Credentials are intentionally loaded from environment variables. Required examples:
DATABASE_URL=postgresql+pg8000://...
or CLOUD_SQL_INSTANCE_CONNECTION_NAME, DB_USER, DB_PASSWORD, DB_NAME.
"""

from ecobi_recommender.db import get_sql_connection, list_all_tables, load_table_to_df

__all__ = ["get_sql_connection", "list_all_tables", "load_table_to_df"]
