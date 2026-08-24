BEGIN;

-- ============================================================
-- GMX DEV-004A
-- POS RETURN ADMIN AUTHORIZATION
-- Temporary, single-use authorization for sensitive operations
-- ============================================================

CREATE TABLE IF NOT EXISTS gmx.autorizaciones_operacion (
    row_id BIGSERIAL PRIMARY KEY,

    id_autorizacion TEXT NOT NULL UNIQUE,
    token_hash TEXT NOT NULL UNIQUE,

    accion TEXT NOT NULL,
    id_pedido TEXT,
    id_sucursal TEXT,

    id_solicitante TEXT,
    email_solicitante TEXT,

    id_autorizador TEXT NOT NULL,
    email_autorizador TEXT NOT NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,

    ip_address TEXT,
    user_agent TEXT,

    referencia_uso TEXT,

    CONSTRAINT autorizaciones_operacion_expiration_ck
        CHECK (expires_at > created_at)
);

CREATE INDEX IF NOT EXISTS idx_autorizaciones_operacion_token
    ON gmx.autorizaciones_operacion(token_hash);

CREATE INDEX IF NOT EXISTS idx_autorizaciones_operacion_order_action
    ON gmx.autorizaciones_operacion(id_pedido, accion);

CREATE INDEX IF NOT EXISTS idx_autorizaciones_operacion_authorizer
    ON gmx.autorizaciones_operacion(id_autorizador, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_autorizaciones_operacion_active
    ON gmx.autorizaciones_operacion(expires_at)
    WHERE used_at IS NULL;

INSERT INTO gmx.schema_migrations(version, description)
SELECT
    '062',
    'GMX DEV-004A - POS return administrator authorization'
WHERE NOT EXISTS (
    SELECT 1
    FROM gmx.schema_migrations
    WHERE version='062'
);

COMMIT;
