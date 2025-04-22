const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const net = require('net');
const Log = require('../../../helper/log');
const CONSTANTS = require('../../../helper/constants');

module.exports = {
    /**
     * Descobre o IP de um dispositivo pelo MAC address
     * @param {string} macAddress - Endereço MAC no formato XX:XX:XX:XX:XX:XX
     * @returns {Promise<Object>} Informações da impressora encontrada
     */
    findPrinterByMac: async (macAddress) => {
        try {
            const ip = await module.exports.getIpFromMac(macAddress);
            
            if (!ip) {
                return {
                    found: false,
                    macAddress,
                    error: 'IP não encontrado para o MAC address fornecido'
                };
            }
            
            // Testar várias portas comuns de impressoras
            const commonPorts = [9100, 631, 515, 80, 443];
            let foundPort = null;
            
            for (const port of commonPorts) {
                const isConnected = await module.exports.testPrinterConnection(ip, port);
                if (isConnected) {
                    foundPort = port;
                    break;
                }
            }
            
            if (!foundPort) {
                return {
                    found: true,
                    macAddress,
                    ip,
                    online: false,
                    error: 'Nenhuma porta de impressora respondendo'
                };
            }
            
            const status = await module.exports.checkPrinterStatus(ip);
            
            return {
                found: true,
                macAddress,
                ip,
                port: foundPort,
                online: status.online,
                status: status.status,
                protocol: foundPort === 631 ? 'ipp' : foundPort === 515 ? 'lpd' : 'socket'
            };
        } catch (error) {
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINTERS,
                operation: 'Find Printer by MAC',
                errorMessage: error.message,
                errorStack: error.stack
            });
            
            return {
                found: false,
                macAddress,
                error: error.message
            };
        }
    },

    /**
     * Descobre o IP de um dispositivo pelo MAC address
     * @param {string} macAddress - Endereço MAC no formato XX:XX:XX:XX:XX:XX
     * @returns {Promise<string|null>} IP encontrado ou null
     */
    getIpFromMac: async (macAddress) => {
        try {
            // Normalizar o MAC address para formato padrão
            const normalizedMac = macAddress.toLowerCase().replace(/[:-]/g, ':');
            
            // Método 1: Verificar a tabela ARP
            try {
                const { stdout } = await execAsync('arp -a');
                const lines = stdout.split('\n');
                
                for (const line of lines) {
                    if (line.toLowerCase().includes(normalizedMac)) {
                        // Extrair o IP da linha
                        const match = line.match(/\(([0-9.]+)\)/);
                        if (match && match[1]) {
                            return match[1];
                        }
                    }
                }
            } catch (arpError) {
                console.warn('Método ARP falhou:', arpError.message);
            }
            
            // Método 2: Usar ip neigh
            try {
                const { stdout } = await execAsync('ip neigh');
                const lines = stdout.split('\n');
                
                for (const line of lines) {
                    if (line.toLowerCase().includes(normalizedMac)) {
                        const parts = line.split(' ');
                        if (parts[0] && /^[0-9.]+$/.test(parts[0])) {
                            return parts[0];
                        }
                    }
                }
            } catch (ipNeighError) {
                console.warn('Método ip neigh falhou:', ipNeighError.message);
            }
            
            // Método 3: Usar nmap para descobrir dispositivos na rede
            try {
                // Pegar o range da rede local
                const { stdout: ipOutput } = await execAsync('ip route | grep default');
                const match = ipOutput.match(/via ([0-9.]+)/);
                
                if (match && match[1]) {
                    const gateway = match[1];
                    const networkBase = gateway.split('.').slice(0, 3).join('.');
                    const networkRange = `${networkBase}.0/24`;
                    
                    // Escanear a rede com nmap
                    const { stdout: nmapOutput } = await execAsync(`nmap -sn ${networkRange}`);
                    
                    // Aguardar um pouco para a tabela ARP ser atualizada
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    // Verificar a tabela ARP novamente
                    const { stdout: arpOutput } = await execAsync('arp -a');
                    const arpLines = arpOutput.split('\n');
                    
                    for (const line of arpLines) {
                        if (line.toLowerCase().includes(normalizedMac)) {
                            const ipMatch = line.match(/\(([0-9.]+)\)/);
                            if (ipMatch && ipMatch[1]) {
                                return ipMatch[1];
                            }
                        }
                    }
                }
            } catch (nmapError) {
                console.warn('Método nmap falhou:', nmapError.message);
            }
            
            return null;
        } catch (error) {
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINTERS,
                operation: 'Get IP from MAC',
                errorMessage: error.message,
                errorStack: error.stack
            });
            return null;
        }
    },
    
    /**
     * Testa a conexão com uma impressora
     * @param {string} ip - Endereço IP da impressora
     * @param {number} port - Porta da impressora
     * @param {number} timeout - Timeout em milissegundos
     * @returns {Promise<boolean>} true se conectou, false se não
     */
    testPrinterConnection: async (ip, port = 9100, timeout = 5000) => {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            let connected = false;
            
            socket.setTimeout(timeout);
            
            socket.on('connect', () => {
                connected = true;
                socket.destroy();
                resolve(true);
            });
            
            socket.on('error', (error) => {
                console.warn(`Erro ao conectar em ${ip}:${port}:`, error.message);
                socket.destroy();
                resolve(false);
            });
            
            socket.on('timeout', () => {
                console.warn(`Timeout ao conectar em ${ip}:${port}`);
                socket.destroy();
                resolve(false);
            });
            
            try {
                socket.connect(port, ip);
            } catch (error) {
                resolve(false);
            }
        });
    },
    
    /**
     * Verifica o status da impressora via SNMP
     * @param {string} ip - Endereço IP da impressora
     * @returns {Promise<Object>} Status da impressora
     */
    checkPrinterStatus: async (ip) => {
        try {
            // Tentar obter status via SNMP
            const { stdout } = await execAsync(`snmpget -v 1 -c public ${ip} .1.3.6.1.2.1.25.3.2.1.5.1`);
            
            // Interpretar o status
            if (stdout.includes("running(4)")) {
                return { online: true, status: 'running' };
            } else if (stdout.includes("warning(3)")) {
                return { online: true, status: 'warning' };
            } else if (stdout.includes("down(5)")) {
                return { online: false, status: 'down' };
            } else {
                return { online: true, status: 'unknown' };
            }
        } catch (error) {
            // Se SNMP falhar, apenas verificar conectividade
            const isConnected = await module.exports.testPrinterConnection(ip);
            return { 
                online: isConnected, 
                status: isConnected ? 'online' : 'offline',
                error: error.message
            };
        }
    },
    
    /**
     * Testa se o IP responde a ping
     * @param {string} ip - Endereço IP
     * @returns {Promise<Object>} Resultado do teste de ping
     */
    pingTest: async (ip) => {
        try {
            const { stdout } = await execAsync(`ping -c 1 -W 2 ${ip}`);
            return {
                success: true,
                message: stdout
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }
};