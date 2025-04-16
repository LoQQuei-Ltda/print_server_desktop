const Log = require('../../../helper/log');
const Printer = require('../models/printers');
const CONSTANTS = require('../../../helper/constants');
const responseHandler = require('../../../helper/responseHandler');

module.exports = {
    getPrinters: async (request, response) => {
        try {
            const printers = await Printer.getAll();

            if (printers.message) {
                return responseHandler.badRequest(response, printers.message);
            }

            return responseHandler.success(response, 'Impressoras encontradas!', printers);
        } catch (error) {
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINTERS,
                operation: 'Get Printers',
                errorMessage: error.message,
                errorStack: error.stack,
                userInfo: request.user.userInfo
            });

            return responseHandler.internalServerError(response, 'Ocorreu um erro ao obter as impressoras!');
        }
    },
    createPrinter: async (request, response) => {
        try {
            const { id, status, cupsName, createdAt } = request.body;
            
            if (!cupsName) {
                return responseHandler.badRequest(response, { message: 'Nome da impressora inválido!' });
            }
            
            const result = await Printer.getById(id);
            if (result && result.id) {
                return responseHandler.badRequest(response, { message: 'Impressora já existente!' });
            }

            const printer = await Printer.insert([
                id,
                cupsName,
                status,
                createdAt,
                new Date()
            ]);

            if (printer && printer.message) {
                return responseHandler.badRequest(response, { message: printer.message });
            }


            return responseHandler.created(response, { message: 'Impressora criada com sucesso!' });
        } catch (error) {
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINTERS,
                operation: 'Create Printers',
                errorMessage: error.message,
                errorStack: error.stack,
                userInfo: request.user.userInfo
            });

            return responseHandler.internalServerError(response, { message: 'Ocorreu um erro ao criar a impressora! Tente novamente mais tarde' });
        }
    },
    updatePrinter: async (request, response) => {
        try {
            const { id, status, cupsName } = request.body;

            if (!cupsName) {
                return responseHandler.badRequest(response, { message: 'Nome da impressora inválido!' });
            }

            const result = await Printer.getById(id);

            if (!result || result.id != id) {
                return responseHandler.badRequest(response, { message: 'Usuário não encontrado!' });;
            }

            const printer = await Printer.update([
                cupsName,
                status,
                new Date(),
                id
            ]);

            if (printer && printer.message) {
                return responseHandler.badRequest(response, { message: printer.message });
            }

            return responseHandler.created(response, { message: 'Impressora alterada com sucesso!' });
        } catch (error) {
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINTERS,
                operation: 'Update Printers',
                errorMessage: error.message,
                errorStack: error.stack,
                userInfo: request.user.userInfo
            });
        }
    }
}