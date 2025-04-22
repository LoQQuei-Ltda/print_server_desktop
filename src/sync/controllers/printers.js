const Log = require('../../../helper/log');
const Printer = require('../../printers/models/printers');
const CONSTANTS = require('../../../helper/constants');
const responseHandler = require('../../../helper/responseHandler');
const cupsUtils = require('../../printers/helpers/cups');

module.exports = {
    /**
     * Sincroniza impressoras recebidas da aplicação central
     * @param {Request} request 
     * @param {Response} response 
     */
    syncPrinters: async (request, response) => {
        try {
            const { printers } = request.body;

            if (!printers || !Array.isArray(printers)) {
                return responseHandler.badRequest(response, 'Lista de impressoras inválida');
            }

            const syncResults = {
                created: [],
                updated: [],
                errors: [],
                unchanged: []
            };

            // Obter todas as impressoras atuais do banco
            const currentPrinters = await Printer.getAll();
            const currentPrintersMap = new Map();
            
            if (Array.isArray(currentPrinters) && !currentPrinters.message) {
                currentPrinters.forEach(printer => {
                    currentPrintersMap.set(printer.id, printer);
                });
            }

            // Processar cada impressora recebida
            for (const printer of printers) {
                try {
                    const {
                        id,
                        name,
                        uri,
                        ip_address,
                    } = printer;

                    // Validações básicas
                    if (!id || !name) {
                        syncResults.errors.push({
                            id: id || 'unknown',
                            error: 'ID e nome são obrigatórios'
                        });
                        continue;
                    }

                    if (!ip_address && !uri) {
                        syncResults.errors.push({
                            id,
                            error: 'IP ou URI são obrigatórios'
                        });
                        continue;
                    }

                    const existingPrinter = currentPrintersMap.get(id);

                    if (!existingPrinter) {
                        // Impressora não existe - criar nova
                        await this._createPrinter(printer, syncResults);
                    } else {
                        // Impressora existe - verificar se precisa atualizar
                        await this._updatePrinterIfNeeded(printer, existingPrinter, syncResults);
                    }
                } catch (error) {
                    syncResults.errors.push({
                        id: printer.id || 'unknown',
                        error: error.message
                    });
                }
            }

            // Retornar resumo da sincronização
            return responseHandler.success(response, 'Sincronização de impressoras concluída', {
                summary: {
                    total: printers.length,
                    created: syncResults.created.length,
                    updated: syncResults.updated.length,
                    unchanged: syncResults.unchanged.length,
                    errors: syncResults.errors.length
                },
                details: syncResults
            });

        } catch (error) {
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINTERS,
                operation: 'Sync Printers',
                errorMessage: error.message,
                errorStack: error.stack,
                userInfo: request.user?.userInfo
            });

            return responseHandler.internalServerError(response, 'Erro ao sincronizar impressoras');
        }
    },

    /**
     * Cria uma nova impressora no banco e no CUPS
     * @private
     */
    async _createPrinter(printer, syncResults) {
        const {
            id,
            name,
            status = 'functional',
            protocol = 'socket',
            mac_address,
            driver = 'generic',
            uri,
            description,
            location,
            ip_address,
            port = 9100,
            createdAt = new Date()
        } = printer;

        // Configurar no CUPS primeiro
        const cupsResult = await cupsUtils.setupPrinter({
            name,
            protocol,
            driver,
            uri,
            description,
            location,
            ip_address,
            port
        });

        if (!cupsResult.success) {
            throw new Error(`Falha ao configurar CUPS: ${cupsResult.message}`);
        }

        // Se CUPS OK, salvar no banco
        const dbResult = await Printer.insert([
            id,
            name,
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

        if (dbResult && dbResult.message) {
            // Se falhou no banco, desfazer no CUPS
            await cupsUtils.removePrinter(name);
            throw new Error(`Falha ao salvar no banco: ${dbResult.message}`);
        }

        syncResults.created.push({ id, name });
    },

    /**
     * Atualiza uma impressora se necessário
     * @private
     */
    async _updatePrinterIfNeeded(newData, currentData, syncResults) {
        const changes = this._detectChanges(newData, currentData);

        if (changes.length === 0) {
            syncResults.unchanged.push({ id: newData.id, name: newData.name });
            return;
        }

        // Se mudou o nome, precisamos remover e recriar no CUPS
        const nameChanged = changes.includes('name');
        
        if (nameChanged) {
            await cupsUtils.removePrinter(currentData.name);
        }

        // Configurar no CUPS com os novos dados
        const cupsResult = await cupsUtils.setupPrinter({
            name: newData.name,
            protocol: newData.protocol || currentData.protocol,
            driver: newData.driver || currentData.driver,
            uri: newData.uri || currentData.uri,
            description: newData.description !== undefined ? newData.description : currentData.description,
            location: newData.location !== undefined ? newData.location : currentData.location,
            ip_address: newData.ip_address || currentData.ip_address,
            port: newData.port || currentData.port
        });

        if (!cupsResult.success) {
            // Se falhou, tentar reverter
            if (nameChanged) {
                await cupsUtils.setupPrinter({
                    name: currentData.name,
                    protocol: currentData.protocol,
                    driver: currentData.driver,
                    uri: currentData.uri,
                    description: currentData.description,
                    location: currentData.location,
                    ip_address: currentData.ip_address,
                    port: currentData.port
                });
            }
            throw new Error(`Falha ao atualizar CUPS: ${cupsResult.message}`);
        }

        // Atualizar no banco
        const dbResult = await Printer.update([
            newData.name,
            newData.status || currentData.status,
            new Date(),
            newData.protocol || currentData.protocol,
            newData.mac_address || currentData.mac_address,
            newData.driver || currentData.driver,
            newData.uri || currentData.uri,
            newData.description !== undefined ? newData.description : currentData.description,
            newData.location !== undefined ? newData.location : currentData.location,
            newData.ip_address || currentData.ip_address,
            newData.port || currentData.port,
            newData.id
        ]);

        if (dbResult && dbResult.message) {
            throw new Error(`Falha ao atualizar banco: ${dbResult.message}`);
        }

        syncResults.updated.push({ 
            id: newData.id, 
            name: newData.name,
            changes 
        });
    },

    /**
     * Detecta mudanças entre os dados novos e atuais
     * @private
     */
    _detectChanges(newData, currentData) {
        const changes = [];
        const fieldsToCheck = [
            'name', 'status', 'protocol', 'mac_address', 'driver', 
            'uri', 'description', 'location', 'ip_address', 'port'
        ];

        fieldsToCheck.forEach(field => {
            if (newData[field] !== undefined && newData[field] !== currentData[field]) {
                changes.push(field);
            }
        });

        return changes;
    }
};