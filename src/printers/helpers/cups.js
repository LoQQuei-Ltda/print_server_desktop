const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const Log = require('../../../helper/log');
const CONSTANTS = require('../../../helper/constants');
const http = require('http');
const https = require('https');

module.exports = {
    /**
     * Instala ou atualiza uma impressora no CUPS
     * @param {Object} printerData - Dados da impressora
     * @returns {Promise<{success: boolean, message: string}>}
     */
    setupPrinter: async (printerData) => {
        try {
            const {
                name,
                protocol = 'socket',
                driver = 'generic',
                uri,
                description,
                location,
                ip_address,
                port = 9100,
                path
            } = printerData;

            // Se não tiver URI, construir baseado no protocolo
            let printerUri = uri;
            if (!printerUri) {
                try {
                    // Para protocolos IPP/IPPS, tentar descobrir o caminho correto
                    if (['ipp', 'ipps'].includes(protocol.toLowerCase()) && ip_address) {
                        printerUri = await discoverIppPath(protocol, ip_address, port, path);
                    } else {
                        printerUri = buildPrinterUri(protocol, ip_address, port, path);
                    }
                    console.log(`URI construída para ${name}: ${printerUri}`);
                } catch (error) {
                    console.error(`Erro ao construir URI para ${name}:`, error.message);
                    return { success: false, message: `Erro ao construir URI: ${error.message}` };
                }
            }

            // Remover impressora se já existir
            try {
                await execAsync(`lpadmin -x "${name}"`);
                console.log(`Impressora ${name} removida para reconfiguração`);
            } catch {
                // Ignorar erro se a impressora não existir
                console.log(`Impressora ${name} não existia previamente`);
            }

            // Comando base para adicionar ou modificar a impressora
            let command = `lpadmin -p "${name}" -E -v "${printerUri}"`;

            // Adicionar driver
            if (driver) {
                if (driver.toLowerCase() === 'generic') {
                    command += ' -m raw';
                } else {
                    // Tentar usar um PPD específico primeiro
                    try {
                        const { stdout } = await execAsync(`lpinfo -m | grep -i "${driver}"`);
                        if (stdout) {
                            const firstDriver = stdout.split('\n')[0].split(' ')[0];
                            command += ` -m "${firstDriver}"`;
                        } else {
                            // Se não encontrar PPD específico, usar raw
                            command += ' -m raw';
                        }
                    } catch {
                        // Se falhar, usar raw como fallback
                        command += ' -m raw';
                    }
                }
            } else {
                command += ' -m raw'; // Use raw como padrão
            }

            // Adicionar descrição
            if (description) {
                command += ` -D "${description}"`;
            }

            // Adicionar localização
            if (location) {
                command += ` -L "${location}"`;
            }

            // Habilitar a impressora para aceitar trabalhos
            command += ' -o printer-is-shared=true';

            console.log(`Executando comando: ${command}`);

            // Executa o comando para adicionar/modificar a impressora
            await execAsync(command);

            // Habilita a impressora
            await execAsync(`cupsenable "${name}"`);
            
            // Aceita trabalhos de impressão
            await execAsync(`cupsaccept "${name}"`);

            return { success: true, message: 'Impressora configurada com sucesso no CUPS' };
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINTERS,
                operation: 'Setup CUPS Printer',
                errorMessage: error.message,
                errorStack: error.stack
            });

            return { success: false, message: `Erro ao configurar impressora no CUPS: ${error.message}` };
        }
    },

    /**
     * Remove uma impressora do CUPS
     * @param {string} printerName - Nome da impressora
     * @returns {Promise<{success: boolean, message: string}>}
     */
    removePrinter: async (printerName) => {
        try {
            await execAsync(`lpadmin -x "${printerName}"`);
            return { success: true, message: 'Impressora removida com sucesso do CUPS' };
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINTERS,
                operation: 'Remove CUPS Printer',
                errorMessage: error.message,
                errorStack: error.stack
            });

            return { success: false, message: `Erro ao remover impressora do CUPS: ${error.message}` };
        }
    },

    /**
     * Obtém lista de drivers disponíveis no CUPS
     * @returns {Promise<string[]>}
     */
    getAvailableDrivers: async () => {
        try {
            const { stdout } = await execAsync('lpinfo -m');
            const drivers = stdout.split('\n')
                .filter(line => line.trim())
                .map(line => {
                    const parts = line.split(' ');
                    return parts[0] || '';
                })
                .filter(driver => driver);
            
            return drivers;
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINTERS,
                operation: 'Get CUPS Drivers',
                errorMessage: error.message,
                errorStack: error.stack
            });

            return [];
        }
    },

    /**
     * Descobre impressoras na rede
     * @returns {Promise<Array>}
     */
    discoverPrinters: async () => {
        try {
            const { stdout } = await execAsync('lpinfo -v');
            const printers = stdout.split('\n')
                .filter(line => line.trim())
                .map(line => {
                    const match = line.match(/^(\S+)\s+(\S+)/);
                    if (match) {
                        const [, type, uri] = match;
                        return { type, uri };
                    }
                    return null;
                })
                .filter(printer => printer);
            
            return printers;
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINTERS,
                operation: 'Discover Printers',
                errorMessage: error.message,
                errorStack: error.stack
            });

            return [];
        }
    },

    /**
     * Testa a conectividade e valida o endpoint IPP de uma impressora
     * @param {string} protocol - Protocolo (ipp ou ipps)
     * @param {string} ip - Endereço IP
     * @param {number} port - Porta
     * @returns {Promise<{valid: boolean, path: string|null, error: string|null}>}
     */
    testIppEndpoint: async (protocol, ip, port = 631) => {
        return discoverIppPath(protocol, ip, port);
    }
};

/**
 * Constrói a URI da impressora baseado no protocolo
 * @param {string} protocol - Protocolo (socket, ipp, lpd, smb)
 * @param {string} ip - Endereço IP
 * @param {number} port - Porta
 * @param {string} path - Caminho opcional para o endpoint
 * @returns {string} URI da impressora
 */
function buildPrinterUri(protocol, ip, port, path = null) {
    if (!ip) {
        throw new Error('IP address é obrigatório para construir a URI');
    }

    switch (protocol?.toLowerCase()) {
        case 'ipp':
            // Se um caminho específico foi fornecido, usá-lo
            if (path) {
                return `ipp://${ip}:${port || 631}${path.startsWith('/') ? path : '/' + path}`;
            }
            return `ipp://${ip}:${port || 631}/ipp/print`;
        case 'ipps':
            if (path) {
                return `ipps://${ip}:${port || 631}${path.startsWith('/') ? path : '/' + path}`;
            }
            return `ipps://${ip}:${port || 631}/ipp/print`;
        case 'lpd':
            return `lpd://${ip}:${port || 515}/queue`;
        case 'smb':
            return `smb://${ip}/printer`;
        case 'dnssd':
            return `dnssd://${ip}/`;
        case 'http':
            if (path) {
                return `http://${ip}:${port || 80}${path.startsWith('/') ? path : '/' + path}`;
            }
            return `http://${ip}:${port || 80}/ipp/print`;
        case 'https':
            if (path) {
                return `https://${ip}:${port || 443}${path.startsWith('/') ? path : '/' + path}`;
            }
            return `https://${ip}:${port || 443}/ipp/print`;
        case 'socket':
        default:
            return `socket://${ip}:${port || 9100}`;
    }
}

/**
 * Tenta descobrir o caminho para o endpoint IPP correto
 * @param {string} protocol - Protocolo (ipp ou ipps)
 * @param {string} ip - Endereço IP
 * @param {number} port - Porta
 * @param {string} suggestedPath - Caminho sugerido (opcional)
 * @returns {Promise<string>} URI completa para a impressora
 */
async function discoverIppPath(protocol, ip, port = 631, suggestedPath = null) {
    // Lista de caminhos comuns para endpoints IPP
    const commonPaths = [
        '/ipp/print',
        '/ipp',
        '/printer',
        '/printers/printer',
        '',
        '/IPP/Print'
    ];
    
    // Se um caminho foi sugerido, priorizá-lo
    if (suggestedPath && typeof suggestedPath === 'string') {
        commonPaths.unshift(suggestedPath);
    }
    
    // Remover duplicatas
    const uniquePaths = [...new Set(commonPaths)];
    
    console.log(`Tentando descobrir endpoint ${protocol} para ${ip}:${port}`);
    
    // Testar cada caminho
    for (const path of uniquePaths) {
        const fullPath = path || '/';
        const testUrl = `${protocol === 'ipps' ? 'https' : 'http'}://${ip}:${port}${fullPath}`;
        
        try {
            console.log(`Testando endpoint: ${testUrl}`);
            const isValid = await testEndpoint(ip, port, fullPath, protocol === 'ipps');
            
            if (isValid) {
                console.log(`Endpoint válido encontrado: ${testUrl}`);
                return `${protocol}://${ip}:${port}${fullPath}`;
            }
        } catch (error) {
            console.warn(`Falha ao testar ${testUrl}: ${error.message}`);
        }
    }
    
    // Se não encontrou um caminho válido, usar o padrão
    console.warn(`Nenhum endpoint válido encontrado para ${ip}:${port}, usando caminho padrão`);
    return `${protocol}://${ip}:${port}/ipp/print`;
}

/**
 * Testa se um endpoint HTTP/HTTPS está respondendo
 * @param {string} host - Endereço IP ou hostname
 * @param {number} port - Porta
 * @param {string} path - Caminho para testar
 * @param {boolean} secure - Usar HTTPS em vez de HTTP
 * @returns {Promise<boolean>} true se o endpoint estiver respondendo
 */
function testEndpoint(host, port, path, secure = false) {
    return new Promise((resolve) => {
        const options = {
            hostname: host,
            port: port,
            path: path,
            method: 'GET',
            timeout: 3000,
            rejectUnauthorized: false // Aceitar certificados autoassinados
        };
        
        const client = secure ? https : http;
        
        const req = client.request(options, (res) => {
            // Alguns servidores IPP retornam códigos diferentes, mas ainda são válidos
            // 200 OK, 400 Bad Request (mas respondendo), etc.
            if (res.statusCode < 500) {
                resolve(true);
            } else {
                resolve(false);
            }
        });
        
        req.on('error', () => {
            resolve(false);
        });
        
        req.on('timeout', () => {
            req.destroy();
            resolve(false);
        });
        
        req.end();
    });
}