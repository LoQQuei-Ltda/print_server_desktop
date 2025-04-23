const Log = require('../../../helper/log');
const Files = require('../../files/models/files');
const CONSTANTS = require('../../../helper/constants');
const responseHandler = require('../../../helper/responseHandler');

module.exports = {
    getSyncInfo: async (request, response) => {
        try {
            const files = await Files.getForSync();

            if (files.message) {
                return responseHandler.badRequest(response, files.message);
            }

            return responseHandler.success(response, 'Informações de sincronização encontradas!', files);
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINT_JOBS,
                operation: 'Get Sync Info',
                errorMessage: error.message,
                errorStack: error.stack
            });

            return responseHandler.internalServerError(response, 'Ocorreu um erro ao obter as informações de sincronização!');
        }
    }
}