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
    getFiles: async (request, response) => {
        try {
            const id = request.params.id;

            const files = await Files.getForPrint(id);
            if (files.message) {
                return responseHandler.badRequest(response, files.message);
            }

            return responseHandler.success(response, 'Arquivos encontrados!', files);
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINT_JOBS,
                operation: 'Get Files',
                errorMessage: error.message,
                errorStack: error.stack
            });

            return responseHandler.internalServerError(response, 'Ocorreu um erro ao obter os arquivos!');
        }
    },
    updateSynced: async (request, response) => {
        try {
            const { files } = request.body;

            const errors = [];
            for (const fileId of files) {
                try {
                    await Files.updateSynced(fileId);
                } catch (error) {
                    console.error(error);
                    Log.error({
                        entity: CONSTANTS.LOG.MODULE.PRINT_JOBS,
                        operation: 'Update Synced',
                        errorMessage: error.message,
                        errorStack: error.stack
                    });

                    errors.push(error.message);
                }
            }

            if (errors.length > 0) {
                return responseHandler.badRequest(response, `Ocorreu erro de sincronismo em ${errors.length} arquivos`, errors);
            }

            return responseHandler.success(response, 'Arquivos sincronizados com sucesso!');
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINT_JOBS,
                operation: 'Update Synced',
                errorMessage: error.message,
                errorStack: error.stack
            }); 

            return responseHandler.internalServerError(response, 'Ocorreu um erro ao sincronizar o arquivo!');
        }
    },
    deleteFile: async (request, response) => {
        try {
            const id = request.params.id;

            const file = await Files.getById(id);
            if (file.message) {
                return responseHandler.badRequest(response, file.message);
            }

            await deleteFile(file.path);

            await Files.delete(id);

            return responseHandler.success(response, 'Arquivo excluído com sucesso!');
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINT_JOBS,
                operation: 'Delete File',
                errorMessage: error.message,
                errorStack: error.stack
            });

            return responseHandler.internalServerError(response, 'Ocorreu um erro ao excluir o arquivo!');
        }
    }
}