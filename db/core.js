const pool = require('./config');

module.exports = {
    /**
     * Executa a consulta com os dados
     * @param {string} sql 
     * @param {*} data
     * @param {Object} connection 
     * @returns 
     */
    Core: async (sql, data) => {
        const { rows } = await pool.query(sql, data);
        if (rows.length === 1) {
            return rows[0];
        }
        return rows;
    }
};