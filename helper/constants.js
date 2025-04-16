const CONSTANTS = {
    DB: {
        HOST: 'localhost',
        PORT: 5432,
        DATABASE: 'print_management',
        USER: 'postgres_print',
        PASSWORD: 'root_print',
        MAX_CONNECTIONS: 9000
    },
    LOG: {
        ERROR: 'error',
        MODULE: {
            MONITOR: 'monitor',
            PRINT_JOBS: 'print_jobs',
            PRINTERS: 'printers',
            TASK: 'task',
            USER: 'user',
        }
    },
    SAMBA: {
        BASE_PATH_FILES: '/srv/print_server'
    }
}

module.exports = CONSTANTS;