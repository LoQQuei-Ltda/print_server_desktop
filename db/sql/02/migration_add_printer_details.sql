-- Active: 1737630428027@@localhost@5432@print_management
ALTER TABLE printers 
    ADD COLUMN IF NOT EXISTS protocol varchar(20) DEFAULT 'socket',
    ADD COLUMN IF NOT EXISTS mac_address varchar(17) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS driver varchar(100) DEFAULT 'generic',
    ADD COLUMN IF NOT EXISTS uri varchar(255) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS description text DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS location varchar(100) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS ip_address varchar(15) DEFAULT NULL,
    ADD COLUMN IF NOT EXISTS port int DEFAULT NULL;