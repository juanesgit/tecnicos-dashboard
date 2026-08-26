"""Servicio de feedback de retrasos — portado desde Flask Tecnicos_retrasado."""
import sys
from typing import Any, Dict
from app.mysql_db import get_mysql_connection

DDL = """
    CREATE TABLE IF NOT EXISTS retraso_feedback (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        tecnico VARCHAR(255) NOT NULL,
        compania VARCHAR(255) NULL,
        ciudad VARCHAR(255) NULL,
        actividad_actual VARCHAR(255) NULL,
        subtipo_ot VARCHAR(255) NULL,
        ot_actual VARCHAR(255) NULL,
        inicio_actual VARCHAR(16) NULL,
        estado_actual VARCHAR(64) NULL,
        retraso_minutos INT NULL,
        cuota_norma INT NULL,
        fin_norma VARCHAR(16) NULL,
        motivo_id VARCHAR(64) NULL,
        motivo_texto TEXT NOT NULL,
        canal VARCHAR(32) NOT NULL,
        chat_user_id BIGINT NULL,
        chat_username VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
"""


def ensure_table() -> None:
    conn = None
    try:
        conn = get_mysql_connection()
        with conn.cursor() as cur:
            cur.execute(DDL)
        conn.commit()
    except Exception as e:
        print(f"[feedback_service] Error creando tabla: {e}", file=sys.stderr)
    finally:
        if conn:
            conn.close()


def insertar_feedback_retraso(payload: Dict[str, Any]) -> int:
    ensure_table()
    conn = None
    try:
        conn = get_mysql_connection()
        sql = """
            INSERT INTO retraso_feedback (
                tecnico, compania, ciudad, actividad_actual, subtipo_ot, ot_actual, inicio_actual,
                estado_actual, retraso_minutos, cuota_norma, fin_norma,
                motivo_id, motivo_texto, canal, chat_user_id, chat_username
            ) VALUES (
                %(tecnico)s, %(compania)s, %(ciudad)s, %(actividad_actual)s, %(subtipo_ot)s,
                %(ot_actual)s, %(inicio_actual)s, %(estado_actual)s, %(retraso_minutos)s,
                %(cuota_norma)s, %(fin_norma)s, %(motivo_id)s, %(motivo_texto)s,
                %(canal)s, %(chat_user_id)s, %(chat_username)s
            )
        """
        data = {k: payload.get(k) for k in [
            'tecnico', 'compania', 'ciudad', 'actividad_actual', 'subtipo_ot', 'ot_actual',
            'inicio_actual', 'estado_actual', 'retraso_minutos', 'cuota_norma', 'fin_norma',
            'motivo_id', 'motivo_texto', 'chat_user_id', 'chat_username',
        ]}
        data['canal'] = payload.get('canal', 'web')
        with conn.cursor() as cur:
            cur.execute(sql, data)
            conn.commit()
            return int(cur.lastrowid or 0)
    except Exception as e:
        print(f"[feedback_service] Error insertando: {e}", file=sys.stderr)
        raise
    finally:
        if conn:
            conn.close()
