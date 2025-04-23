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
    getForPrint: async () => {
        try {
            const sql = `SELECT * FROM ${CONSTANTS.DB.DATABASE}.files WHERE deletedAt IS NULL AND printed = FALSE;`;

            let result = await Core(sql);

            if (!Array.isArray(result)) {
                result = [result];
            }

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
    getForSync: async () => {
        try {
            const sql = `SELECT * FROM ${CONSTANTS.DB.DATABASE}.files WHERE printed = TRUE AND synced = FALSE;`;

            let result = await Core(sql);

            if (!Array.isArray(result)) {
                result = [result];
            }

            return result;
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.MONITOR,
                operation: 'Get For Sync',
                errorMessage: error.message,
                errorStack: error.stack
            });

            return {
                message: "Ocorreu um erro ao obter os dados! Tente novamente mais tarde"
            }
        }
    },
    updateSynced: async (id) => {
        try {
            const sql = `UPDATE ${CONSTANTS.DB.DATABASE}.files SET synced = TRUE WHERE id = ?;`;

            await Core(sql, id);
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINT_JOBS,
                operation: 'Update Synced',
                errorMessage: error.message,
                errorStack: error.stack
            });

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