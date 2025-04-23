const Log = require('../../../helper/log');
const { Core } = require('../../../db/core');
const CONSTANTS = require('../../../helper/constants');

module.exports = {
    getById: async (id) => {
        try {
            const sql = `SELECT * FROM ${CONSTANTS.DB.DATABASE}.files WHERE id = $1;`;

            const result = await Core(sql, [id]);
            return result;
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.MONITOR,
                operation: 'Get By Id',
                errorMessage: error.message,
                errorStack: error.stack
            });

            return {
                message: "Ocorreu um erro ao obter os dados! Tente novamente mais tarde"
            }
        }
    },
    insert: async (data) => {
        try {
            const sql = `INSERT INTO ${CONSTANTS.DB.DATABASE}.files (id, assetId, fileName, pages, path, createdAt) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`;
            
            const result = await Core(sql, data);
            return result;
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.MONITOR,
                operation: 'Insert Data',
                errorMessage: error.message,
                errorStack: error.stack
            })

            return {
                message: "Ocorreu um erro ao inserir os dados! Tente novamente mais tarde"
            }
        }
    },
    updatePrinted: async (id, assetId) => {
        try {
            const sql = `UPDATE ${CONSTANTS.DB.DATABASE}.files SET printed = TRUE, assetId = $2 WHERE id = $1;`;

            const result = await Core(sql, [id, assetId]);

            return result;
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINT_JOBS,
                operation: 'Update Printed',
                errorMessage: error.message,
                errorStack: error.stack
            })

            return {
                message: "Ocorreu um erro ao atualizar o arquivo! Tente novamente mais tarde"
            }
        }
    },
    delete: async (id) => {
        try {
            const sql = `UPDATE ${CONSTANTS.DB.DATABASE}.files SET deletedAt = $1 WHERE id = $2;`;

            const result = await Core(sql, [new Date(), id]);

            return result;
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.MONITOR,
                operation: 'Delete Data',
                errorMessage: error.message,
                errorStack: error.stack
            })

            return {
                message: "Ocorreu um erro ao excluir os dados! Tente novamente mais tarde"
            }
        }
    }
}