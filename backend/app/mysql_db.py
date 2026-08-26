"""Conexión síncrona a MySQL para datos operacionales (datos_service usa pandas + pymysql)."""
import pymysql
from app.config import settings


def get_mysql_connection():
    """Retorna una conexión pymysql usando los settings configurados."""
    return pymysql.connect(
        host=settings.DB_HOST,
        user=settings.DB_USER,
        password=settings.DB_PASSWORD,
        db=settings.DB_NAME,
        port=settings.DB_PORT,
        charset=settings.DB_CHARSET,
        cursorclass=pymysql.cursors.DictCursor,
    )
