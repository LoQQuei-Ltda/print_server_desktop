GRANT ALL PRIVILEGES ON SCHEMA print_management TO postgres_print;

CREATE TYPE print_management.log_type AS ENUM ('error', 'read', 'create', 'update', 'delete');

CREATE TABLE IF NOT EXISTS print_management.logs (
    id varchar(50) NOT NULL,
    createdAt timestamp NOT NULL,
    logType print_management.log_type NOT NULL,
    entity varchar(255) DEFAULT NULL,
    operation VARCHAR(50) DEFAULT NULL,
    beforeData jsonb DEFAULT NULL,
    afterData jsonb DEFAULT NULL,
    errorMessage text DEFAULT NULL,
    errorStack text DEFAULT NULL,
    userInfo jsonb DEFAULT NULL,
    PRIMARY KEY (id)
);

CREATE TYPE print_management.printer_status AS ENUM ('functional','expired useful life','powered off','obsolete','damaged','lost','disabled');

CREATE TABLE IF NOT EXISTS print_management.printers (
    id varchar(50) NOT NULL,
    name varchar(50) NOT NULL,
    status print_management.printer_status NOT NULL,
    protocol varchar(20) DEFAULT 'socket',
    mac_address varchar(17) DEFAULT NULL,
    driver varchar(100) DEFAULT 'generic',
    uri varchar(255) DEFAULT NULL,
    description text DEFAULT NULL,
    location varchar(100) DEFAULT NULL,
    ip_address varchar(15) DEFAULT NULL,
    port int DEFAULT NULL,
    createdAt timestamp NOT NULL,
    updatedAt timestamp NOT NULL,
    deletedAt timestamp DEFAULT NULL,
    PRIMARY KEY (id)
);

CREATE TABLE IF NOT EXISTS print_management.files (
    id varchar(50) NOT NULL,
    assetId varchar(50) DEFAULT NULL,
    fileName text NOT NULL,
    pages int NOT NULL,
    path TEXT NOT NULL,
    createdAt timestamp NOT NULL,
    deletedAt timestamp DEFAULT NULL,
    printed BOOLEAN NOT NULL DEFAULT FALSE,
    synced BOOLEAN NOT NULL DEFAULT FALSE,
    PRIMARY KEY (id),
    FOREIGN KEY (assetId) REFERENCES print_management.printers(id)
);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA print_management TO postgres_print;

GRANT USAGE ON TYPE print_management.log_type TO postgres_print;
GRANT USAGE ON TYPE print_management.printer_status TO postgres_print;

ALTER DEFAULT PRIVILEGES IN SCHEMA print_management
GRANT ALL PRIVILEGES ON TABLES TO postgres_print;

ALTER DEFAULT PRIVILEGES IN SCHEMA print_management
GRANT ALL PRIVILEGES ON SEQUENCES TO postgres_print;

ALTER DEFAULT PRIVILEGES IN SCHEMA print_management
GRANT ALL PRIVILEGES ON FUNCTIONS TO postgres_print;