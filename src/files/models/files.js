const Log = require('../../../helper/log');
const { Core } = require('../../../db/core');
const CONSTANTS = require('../../../helper/constants');

module.exports = {
    getForPrint: async () => {
        try {
            const sql = `SELECT * FROM files WHERE deletedAt IS NULL AND printed = FALSE;`;

            let result = await Core(sql);

            if (!Array.isArray(result)) {
                result = [result];
            }

            return result;
        } catch (error) {
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
            const sql = `SELECT * FROM files WHERE printed = TRUE AND synced = FALSE;`;

            let result = await Core(sql);

            if (!Array.isArray(result)) {
                result = [result];
            }

            return result;
        } catch (error) {
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
    }
}