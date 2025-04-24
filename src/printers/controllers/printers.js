const Log = require('../../../helper/log');
const cupsHelper = require('../helpers/cups');
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
            console.error(error);
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
            const { 
                id, 
                status, 
                cupsName, 
                createdAt,
                protocol = 'socket',
                mac_address,
                driver = 'generic',
                uri,
                description,
                location,
                ip_address,
                port = 9100
            } = request.body;

            console.log("request.body", request.body);
            
            if (!cupsName) {
                return responseHandler.badRequest(response, { message: 'Nome da impressora inválido!' });
            }
            
            if (!ip_address && !uri) {
                return responseHandler.badRequest(response, { message: 'Endereço IP ou URI da impressora é obrigatório!' });
            }
            
            const result = await Printer.getById(id);
            if (result && result.id) {
                return responseHandler.badRequest(response, { message: 'Impressora já existente!' });
            }

            const cupsResult = await cupsHelper.setupPrinter({
                name: cupsName,
                protocol,
                driver,
                uri,
                description,
                location,
                ip_address,
                port
            });

            if (!cupsResult.success) {
                return responseHandler.badRequest(response, { message: cupsResult.message });
            }

            const printer = await Printer.insert([
                id,
                cupsName,
                status,
                createdAt,
                new Date(),
                protocol,
                mac_address,
                driver,
                uri,
                description,
                location,
                ip_address,
                port
            ]);

            if (printer && printer.message) {
                await cupsHelper.removePrinter(cupsName);
                return responseHandler.badRequest(response, { message: printer.message });
            }

            return responseHandler.created(response, { message: 'Impressora criada com sucesso!' });
        } catch (error) {
            console.error(error);
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
            const { 
                id, 
                status, 
                cupsName,
                protocol,
                mac_address,
                driver,
                uri,
                description,
                location,
                ip_address,
                port
            } = request.body;

            if (!cupsName) {
                return responseHandler.badRequest(response, { message: 'Nome da impressora inválido!' });
            }

            const result = await Printer.getById(id);

            if (!result || result.id != id) {
                return responseHandler.badRequest(response, { message: 'Impressora não encontrada!' });
            }

            const nameChanged = result.name !== cupsName;
            
            if (nameChanged) {
                await cupsHelper.removePrinter(result.name);
            }

            const cupsResult = await cupsHelper.setupPrinter({
                name: cupsName,
                protocol: protocol || result.protocol,
                driver: driver || result.driver,
                uri: uri || result.uri,
                description: description || result.description,
                location: location || result.location,
                ip_address: ip_address || result.ip_address,
                port: port || result.port
            });

            if (!cupsResult.success) {
                if (nameChanged) {
                    await cupsHelper.setupPrinter({
                        name: result.name,
                        protocol: result.protocol,
                        driver: result.driver,
                        uri: result.uri,
                        description: result.description,
                        location: result.location,
                        ip_address: result.ip_address,
                        port: result.port
                    });
                }
                return responseHandler.badRequest(response, { message: cupsResult.message });
            }

            const printer = await Printer.update([
                cupsName,
                status,
                new Date(),
                protocol || result.protocol,
                mac_address || result.mac_address,
                driver || result.driver,
                uri || result.uri,
                description || result.description,
                location || result.location,
                ip_address || result.ip_address,
                port || result.port,
                id
            ]);

            if (printer && printer.message) {
                return responseHandler.badRequest(response, { message: printer.message });
            }

            return responseHandler.success(response, { message: 'Impressora alterada com sucesso!' });
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINTERS,
                operation: 'Update Printers',
                errorMessage: error.message,
                errorStack: error.stack,
                userInfo: request.user.userInfo
            });

            return responseHandler.internalServerError(response, { message: 'Ocorreu um erro ao atualizar a impressora! Tente novamente mais tarde' });
        }
    },
    discoverPrinters: async (request, response) => {
        try {
            const printers = await cupsHelper.discoverPrinters();
            
            return responseHandler.success(response, 'Impressoras descobertas!', printers);
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINTERS,
                operation: 'Discover Printers',
                errorMessage: error.message,
                errorStack: error.stack,
                userInfo: request.user.userInfo
            });

            return responseHandler.internalServerError(response, { message: 'Ocorreu um erro ao descobrir impressoras!' });
        }
    },
    getAvailableDrivers: async (request, response) => {
        try {
            const drivers = await cupsHelper.getAvailableDrivers();
            
            return responseHandler.success(response, 'Drivers disponíveis!', drivers);
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINTERS,
                operation: 'Get Available Drivers',
                errorMessage: error.message,
                errorStack: error.stack,
                userInfo: request.user.userInfo
            });

            return responseHandler.internalServerError(response, { message: 'Ocorreu um erro ao obter drivers!' });
        }
    }
}