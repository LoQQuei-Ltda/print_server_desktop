const Log = require('../../../helper/log');
const Printer = require('../../printers/models/printers');
const CONSTANTS = require('../../../helper/constants');
const responseHandler = require('../../../helper/responseHandler');
const cupsUtils = require('../../printers/helpers/cups');
const networkUtils = require('../../printers/helpers/network');

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
                unchanged: [],
                warnings: [] // Para impressoras que foram salvas mas estão sem conexão
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
                        mac_address,
                        ip_address,
                        status = 'functional',
                        driver = 'generic',
                        port = 9100,
                        protocol = 'socket',
                        description = '',
                        location = '',
                        createdAt = new Date()
                    } = printer;

                    // Validações básicas
                    if (!id || !name) {
                        syncResults.errors.push({
                            id: id || 'unknown',
                            error: 'ID e nome são obrigatórios'
                        });
                        continue;
                    }

                    if (!ip_address) {
                        syncResults.errors.push({
                            id,
                            error: 'Endereço IP é obrigatório'
                        });
                        continue;
                    }

                    console.log(`[${id}] Iniciando sincronização para impressora ${name} (${ip_address}:${port})`);

                    // Testar conectividade usando o IP fornecido
                    console.log(`[${id}] Testando conectividade para ${ip_address}:${port}...`);
                    const connectivityTest = await module.exports._testPrinterConnectivity({
                        ip: ip_address,
                        port: port
                    });
                    
                    // Construir a URI baseada no protocolo e IP
                    const printerUri = module.exports._buildPrinterUri(protocol, ip_address, port);

                    // Preparar dados da impressora
                    const printerData = {
                        id,
                        name,
                        status,
                        mac_address,
                        driver,
                        description,
                        location,
                        createdAt,
                        ip_address,
                        port,
                        protocol,
                        uri: printerUri
                    };

                    const existingPrinter = currentPrintersMap.get(id);

                    if (!existingPrinter) {
                        // Impressora não existe - criar nova
                        await module.exports._createPrinter(printerData, connectivityTest, syncResults);
                    } else {
                        // Impressora existe - verificar se precisa atualizar
                        await module.exports._updatePrinterIfNeeded(printerData, existingPrinter, connectivityTest, syncResults);
                    }
                } catch (error) {
                    console.error(`Erro ao processar impressora ${printer.id}:`, error);
                    syncResults.errors.push({
                        id: printer.id || 'unknown',
                        name: printer.name || 'unknown',
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
                    errors: syncResults.errors.length,
                    warnings: syncResults.warnings.length
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
     * Constrói a URI da impressora
     * @private
     */
    _buildPrinterUri(protocol, ip, port) {
        if (!ip) {
            throw new Error('IP address é obrigatório para construir a URI');
        }

        switch (protocol?.toLowerCase()) {
            case 'ipp':
                return `ipp://${ip}${port ? ':' + port : ':631'}/ipp/print`;
            case 'lpd':
                return `lpd://${ip}${port ? ':' + port : ':515'}/queue`;
            case 'smb':
                return `smb://${ip}/printer`;
            case 'dnssd':
                return `dnssd://${ip}/`;
            case 'socket':
            default:
                return `socket://${ip}${port ? ':' + port : ':9100'}`;
        }
    },

    /**
     * Testa a conectividade da impressora
     * @private
     */
    async _testPrinterConnectivity(printerInfo) {
        const results = {
            pingTest: false,
            portTest: false,
            statusCheck: null,
            overall: false,
            details: {}
        };

        try {
            // Teste 1: Ping
            console.log(`Testando ping para ${printerInfo.ip}...`);
            const pingResult = await networkUtils.pingTest(printerInfo.ip);
            results.pingTest = pingResult.success;
            results.details.ping = pingResult;

            // Teste 2: Porta
            console.log(`Testando porta ${printerInfo.port || 9100} em ${printerInfo.ip}...`);
            const portResult = await networkUtils.testPrinterConnection(printerInfo.ip, printerInfo.port || 9100);
            results.portTest = portResult;
            results.details.port = {
                port: printerInfo.port || 9100,
                open: portResult
            };

            // Teste 3: Status (SNMP ou similar)
            console.log(`Verificando status da impressora em ${printerInfo.ip}...`);
            const statusResult = await networkUtils.checkPrinterStatus(printerInfo.ip);
            results.statusCheck = statusResult;
            results.details.status = statusResult;

            // Resultado geral
            results.overall = results.pingTest || results.portTest;
            
        } catch (error) {
            console.error('Erro nos testes de conectividade:', error);
            results.details.error = error.message;
        }

        return results;
    },

    /**
     * Cria uma nova impressora no banco e no CUPS
     * @private
     */
    async _createPrinter(printer, connectivityTest, syncResults) {
        if (!printer.driver) {
            printer.driver = 'drv:///cupsfilters.drv/pwgrast.ppd';
        }

        const {
            id,
            name,
            status,
            protocol,
            mac_address,
            driver,
            uri,
            description,
            location,
            ip_address,
            port,
            createdAt
        } = printer;

        console.log(`[${id}] Configurando no CUPS...`);
        
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

        console.log(`[${id}] Salvando no banco de dados...`);
        
        // Se CUPS OK, salvar no banco
        const dbResult = await Printer.insert([
            id,
            name,
            status,
            createdAt,
            new Date(),
            protocol,
            mac_address || null, // MAC address pode ser null
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

        // Verificar o status da conexão
        if (!connectivityTest.overall) {
            syncResults.warnings.push({ 
                id, 
                name,
                warning: 'Impressora criada mas sem conexão',
                connectivity: connectivityTest.details,
                ip: ip_address
            });
        } else {
            syncResults.created.push({ 
                id, 
                name,
                ip: ip_address,
                connectivity: connectivityTest.details
            });
        }
    },

    /**
     * Atualiza uma impressora se necessário
     * @private
     */
    async _updatePrinterIfNeeded(newData, currentData, connectivityTest, syncResults) {
        const changes = module.exports._detectChanges(newData, currentData);

        // Verificar se o IP mudou
        if (newData.ip_address !== currentData.ip_address) {
            changes.push('ip_address');
        }

        if (changes.length === 0) {
            // Mesmo que não tenha mudanças, verificar o status da conexão
            if (!connectivityTest.overall) {
                syncResults.warnings.push({
                    id: newData.id,
                    name: newData.name,
                    warning: 'Impressora sem conexão',
                    connectivity: connectivityTest.details,
                    ip: newData.ip_address
                });
            } else {
                syncResults.unchanged.push({ 
                    id: newData.id, 
                    name: newData.name,
                    ip: newData.ip_address,
                    connectivity: connectivityTest.details
                });
            }
            return;
        }

        console.log(`[${newData.id}] Atualizando impressora...`);
        console.log(`[${newData.id}] Mudanças detectadas: ${changes.join(', ')}`);

        // Se mudou o nome, precisamos remover e recriar no CUPS
        const nameChanged = changes.includes('name');
        
        if (nameChanged) {
            console.log(`[${newData.id}] Nome mudou, removendo impressora antiga...`);
            await cupsUtils.removePrinter(currentData.name);
        }

        // Configurar no CUPS com os novos dados
        const cupsResult = await cupsUtils.setupPrinter({
            name: newData.name,
            protocol: newData.protocol,
            driver: newData.driver,
            uri: newData.uri,
            description: newData.description,
            location: newData.location,
            ip_address: newData.ip_address,
            port: newData.port
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
            newData.status,
            new Date(),
            newData.protocol,
            newData.mac_address,
            newData.driver,
            newData.uri,
            newData.description,
            newData.location,
            newData.ip_address,
            newData.port,
            newData.id
        ]);

        if (dbResult && dbResult.message) {
            throw new Error(`Falha ao atualizar banco: ${dbResult.message}`);
        }

        // Verificar o status da conexão
        if (!connectivityTest.overall) {
            syncResults.warnings.push({ 
                id: newData.id, 
                name: newData.name,
                warning: 'Impressora atualizada mas sem conexão',
                connectivity: connectivityTest.details,
                ip: newData.ip_address,
                changes 
            });
        } else {
            syncResults.updated.push({ 
                id: newData.id, 
                name: newData.name,
                ip: newData.ip_address,
                connectivity: connectivityTest.details,
                changes 
            });
        }
    },

    /**
     * Detecta mudanças entre os dados novos e atuais
     * @private
     */
    _detectChanges(newData, currentData) {
        const changes = [];
        const fieldsToCheck = [
            'name', 'status', 'protocol', 'mac_address', 'driver', 
            'uri', 'description', 'location', 'port'
        ];

        fieldsToCheck.forEach(field => {
            if (newData[field] !== undefined && newData[field] !== currentData[field]) {
                changes.push(field);
            }
        });

        return changes;
    }
};