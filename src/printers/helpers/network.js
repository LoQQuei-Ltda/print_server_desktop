const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);
const net = require('net');

module.exports = {
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
            
            socket.setTimeout(timeout);
            
            socket.on('connect', () => {
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
            } catch {
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