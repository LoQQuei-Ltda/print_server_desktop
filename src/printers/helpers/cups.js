const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const Log = require('../../../helper/log');
const CONSTANTS = require('../../../helper/constants');

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
                protocol,
                driver,
                uri,
                description,
                location,
                ip_address,
                port
            } = printerData;

            // Se não tiver URI, construir baseado no protocolo
            let printerUri = uri;
            if (!printerUri) {
                printerUri = buildPrinterUri(protocol, ip_address, port);
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
    }
};

/**
 * Constrói a URI da impressora baseado no protocolo
 * @param {string} protocol - Protocolo (socket, ipp, lpd, smb)
 * @param {string} ip - Endereço IP
 * @param {number} port - Porta
 * @returns {string} URI da impressora
 */
function buildPrinterUri(protocol, ip, port) {
    if (!ip) {
        throw new Error('IP address é obrigatório para construir a URI');
    }

    switch (protocol?.toLowerCase()) {
        case 'ipp':
            return `ipp://${ip}${port ? ':' + port : ':631'}/ipp/print`;
        case 'ipps':
            return `ipps://${ip}${port ? ':' + port : ':631'}/ipp/print`;
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
}