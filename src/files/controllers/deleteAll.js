const fs = require('fs');
const Files = require('../models/files');
const Log = require('../../../helper/log');
const CONSTANTS = require('../../../helper/constants');
const responseHandler = require('../../../helper/responseHandler');

const deleteFile = async (filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
        }
    } catch (error) {
        console.error(error);
        Log.error({
            entity: CONSTANTS.LOG.MODULE.MONITOR,
            operation: 'Delete File',
            errorMessage: error.message,
            errorStack: error.stack
        });
    }
}

module.exports = {
    deleteAll: async (request, response) => {
        try {
            const files = await Files.getForPrint();
            if (files.message) {
                return responseHandler.badRequest(response, files.message);
            }

            for (const file of files) {
                await Files.delete(file.id);

                await deleteFile(file.path);
            }

            return responseHandler.success(response, 'Arquivos excluídos com sucesso!');
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINT_JOBS,
                operation: 'Delete All Files',
                errorMessage: error.message,
                errorStack: error.stack
            });

            return responseHandler.internalServerError(response, 'Ocorreu um erro ao excluir os arquivos!');
        }
    }
}