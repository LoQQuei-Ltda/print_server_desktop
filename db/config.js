const { Pool } = require('pg');
const CONSTANTS = require('../helper/constants');

/**
 * Criação do pool e configuração da conexão
*/
const pool = new Pool({
    host: CONSTANTS.DB.HOST,
    port: CONSTANTS.DB.PORT,
    database: CONSTANTS.DB.DATABASE,
    user: CONSTANTS.DB.USER,
    password: CONSTANTS.DB.PASSWORD,
    max: CONSTANTS.DB.MAX_CONNECTIONS,
});

module.exports = pool;