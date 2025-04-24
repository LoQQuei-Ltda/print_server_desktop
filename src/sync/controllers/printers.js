const Log = require('../../../helper/log');
const cupsHelper = require('../../printers/helpers/cups');
const Printer = require('../../printers/models/printers');
const CONSTANTS = require('../../../helper/constants');
const responseHandler = require('../../../helper/responseHandler');

module.exports = {
    /**
     * Sincroniza impressoras recebidas do cliente desktop com o servidor local
     * @param {Request} request 
     * @param {Response} response 
     */
    syncPrinters: async (request, response) => {
        try {
            const { printers } = request.body;
            
            if (!printers || !Array.isArray(printers)) {
                return responseHandler.badRequest(response, { 
                    message: 'Formato de dados inválido! É necessário enviar um array de impressoras.' 
                });
            }
            
            console.log(`Sincronizando ${printers.length} impressoras...`);
            
            // Resultado da sincronização
            const result = {
                success: true,
                message: 'Sincronização de impressoras realizada com sucesso',
                details: {
                    total: printers.length,
                    created: 0,
                    updated: 0,
                    skipped: 0,
                    warnings: [],
                    errors: []
                }
            };
            
            // Processar cada impressora
            for (const printer of printers) {
                const { 
                    id, 
                    name, 
                    status = 'functional',
                    ip_address,
                    mac_address,
                    driver = 'generic',
                    protocol = 'socket',
                    port = 9100,
                    uri,
                    description,
                    location,
                    connectivity
                } = printer;
                
                // Verificar dados essenciais
                if (!id || !name) {
                    result.details.errors.push({
                        id: id || 'unknown',
                        name: name || 'Impressora sem nome',
                        error: 'Dados incompletos (ID ou nome ausentes)'
                    });
                    result.details.skipped++;
                    continue;
                }
                
                // Verificar se já existe no banco
                const existingPrinter = await Printer.getById(id);
                const exists = existingPrinter && existingPrinter.id;
                
                // Verificar conectividade com a impressora
                let isConnected = false;
                
                // Se já temos informações de conectividade do cliente desktop
                if (connectivity && connectivity.port) {
                    isConnected = connectivity.port.open;
                } 
                
                let printerWasSetUp = false;
                
                // Configurar impressora no CUPS
                if (ip_address && isConnected) {
                    try {
                        // Dados para configuração da impressora
                        const printerConfig = {
                            name,
                            protocol,
                            driver,
                            uri: uri || null,
                            description: description || `Impressora ${name}`,
                            location: location || 'Local não especificado',
                            ip_address,
                            port
                        };
                        
                        // Tentar configurar a impressora no CUPS
                        const cupsResult = await cupsHelper.setupPrinter(printerConfig);
                        
                        if (cupsResult.success) {
                            printerWasSetUp = true;
                            console.log(`Impressora ${name} configurada com sucesso no CUPS`);
                        } else {
                            result.details.warnings.push({
                                id,
                                name,
                                warning: `Falha ao configurar no CUPS: ${cupsResult.message}`,
                                connectivity: { port: { open: isConnected, number: port } }
                            });
                            console.warn(`Falha ao configurar impressora ${name} no CUPS: ${cupsResult.message}`);
                        }
                    } catch (error) {
                        console.error(`Erro ao configurar impressora ${name} no CUPS:`, error);
                        result.details.warnings.push({
                            id,
                            name,
                            warning: `Erro ao configurar no CUPS: ${error.message}`,
                            connectivity: { port: { open: isConnected, number: port } }
                        });
                    }
                } else if (ip_address) {
                    result.details.warnings.push({
                        id,
                        name,
                        warning: `Impressora ${name} não está conectada na porta ${port}`,
                        connectivity: { port: { open: false, number: port } }
                    });
                } else {
                    result.details.warnings.push({
                        id,
                        name,
                        warning: 'Impressora sem endereço IP definido'
                    });
                }
                
                // Dados para o banco
                const now = new Date();
                
                try {
                    if (exists) {
                        // Atualizar impressora existente
                        const updated = await Printer.update([
                            name,
                            status,
                            now,
                            protocol,
                            mac_address,
                            driver,
                            uri,
                            description,
                            location,
                            ip_address,
                            port,
                            id
                        ]);
                        
                        if (updated && !updated.message) {
                            result.details.updated++;
                            console.log(`Impressora ${name} atualizada no banco de dados`);
                        } else {
                            result.details.errors.push({
                                id,
                                name,
                                error: updated.message || 'Erro desconhecido ao atualizar impressora'
                            });
                        }
                    } else {
                        // Inserir nova impressora
                        const created = await Printer.insert([
                            id,
                            name,
                            status,
                            now, // createdAt
                            now, // updatedAt
                            protocol,
                            mac_address,
                            driver,
                            uri,
                            description,
                            location,
                            ip_address,
                            port
                        ]);
                        
                        if (created && !created.message) {
                            result.details.created++;
                            console.log(`Impressora ${name} criada no banco de dados`);
                        } else {
                            result.details.errors.push({
                                id,
                                name,
                                error: created.message || 'Erro desconhecido ao criar impressora'
                            });
                        }
                    }
                } catch (error) {
                    console.error(`Erro ao ${exists ? 'atualizar' : 'criar'} impressora ${name}:`, error);
                    result.details.errors.push({
                        id,
                        name,
                        error: `Erro no banco de dados: ${error.message}`
                    });
                    result.details.skipped++;
                    
                    // Se configurou no CUPS mas falhou no banco, remover do CUPS para evitar inconsistência
                    if (printerWasSetUp) {
                        try {
                            await cupsHelper.removePrinter(name);
                            console.log(`Impressora ${name} removida do CUPS devido a falha no banco de dados`);
                        } catch (cupsError) {
                            console.error(`Erro ao remover impressora ${name} do CUPS:`, cupsError);
                        }
                    }
                }
            }
            
            // Verificar se houve erros
            if (result.details.errors.length > 0) {
                result.success = false;
                result.message = `Sincronização concluída com ${result.details.errors.length} erros`;
            }
            
            // Adicionar uma flag se houve apenas warnings
            if (result.success && result.details.warnings.length > 0) {
                result.message = `Sincronização concluída com ${result.details.warnings.length} avisos`;
            }
            
            return responseHandler.success(response, result.message, result);
        } catch (error) {
            console.error('Erro na sincronização de impressoras:', error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINTERS,
                operation: 'Sync Printers',
                errorMessage: error.message,
                errorStack: error.stack,
                userInfo: request.user?.userInfo || null
            });
            
            return responseHandler.internalServerError(response, { 
                message: 'Ocorreu um erro durante a sincronização de impressoras',
                error: error.message
            });
        }
    }
};