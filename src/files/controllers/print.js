const fs = require('fs');
const Log = require('../../../helper/log');
const execSync = require('child_process').execSync;
const Files = require('../../monitor/models/files');
const CONSTANTS = require('../../../helper/constants');
const Printers = require('../../printers/models/printers');
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
    printFile: async (request, response) => {
        try {
            const { fileId, assetId } = request.body;

            const file = await Files.getById(fileId);

            if (!file) {
                return responseHandler.badRequest(response, 'Arquivo não encontrado!');
            }

            if (file.message) {
                return responseHandler.badRequest(response, file.message);
            }

            const printer = await Printers.getById(assetId);
            console.log("printer", printer);

            if (!printer) {
                return responseHandler.badRequest(response, 'Impressora não encontrada!');
            }

            if (printer.message) {
                return responseHandler.badRequest(response, printer.message);
            }

            const printerName = printer.name;

            console.log(`[${fileId}] Imprimindo arquivo ${file.path} para impressora ${printerName}`);
            
            if (!fs.existsSync(file.path)) {
                await Files.delete(fileId);
                return responseHandler.badRequest(response, 'Arquivo não encontrado!');
            }

            const result = await Files.updatePrinted(fileId, assetId);
            if (result.message) {
                return responseHandler.badRequest(response, 'Ocorreu um erro ao atualizar o arquivo!');
            }

            await execSync(`lp -d ${printerName} ${file.path}`);

            responseHandler.success(response, 'Arquivo impresso com sucesso!');
            
            setImmediate(async () => {
                await deleteFile(file.path);
            });
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINT_JOBS,
                operation: 'Print File',
                errorMessage: error.message,
                errorStack: error.stack
            });

            return responseHandler.internalServerError(response, 'Ocorreu um erro ao imprimir o documento!');
        }
    }
}