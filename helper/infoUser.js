const os = require('os');

module.exports = {
    /**
     * Coleta as informações do usuário pela requisição e do sistema operacional
     * @param {*} req 
     * @returns 
     */
    getUserInfo: function (req) {
        /**
         * Coleta o endereço MAC do dispositivo
         * @returns 
         */
        function getMacAddress() {
            const networkInterfaces = os.networkInterfaces();
            const interfaceNames = Object.keys(networkInterfaces);
            
            for (const name of interfaceNames) {
                const networkInterface = networkInterfaces[name];
                const interfaceWithMac = networkInterface.find(
                    (iface) => iface.mac && iface.mac !== '00:00:00:00:00:00'
                );
                
                if (interfaceWithMac) {
                    return interfaceWithMac.mac;
                }
            }
            
            return 'MAC address not found';
        }

        /**
         * Formata bytes para uma unidade legível
         * @param {number} bytes 
         * @returns {string}
         */
        function formatBytes(bytes) {
            if (bytes === 0) return '0 Bytes';
            const k = 1024;
            const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        }

        /**
         * Formata o tempo de atividade em formato legível
         * @param {number} seconds 
         * @returns {string}
         */
        function formatUptime(seconds) {
            const days = Math.floor(seconds / (3600 * 24));
            const hours = Math.floor((seconds % (3600 * 24)) / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            
            return `${days}d ${hours}h ${minutes}m ${secs}s`;
        }

        // Coleta informações do dispositivo (original)
        const ipv4 = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
        const ipv6 = req.connection.remoteAddress;
        const macAddress = getMacAddress();
        
        const userAgent = req.headers['user-agent'];
        const language = req.headers['accept-language'];
        
        const latitude = req.headers['latitude'] || 'Latitude não encontrada';
        const longitude = req.headers['longitude'] || 'Longitude não encontrada';

        // Novas informações do sistema operacional
        const cpus = os.cpus().map(cpu => ({
            model: cpu.model,
            speed: `${cpu.speed} MHz`,
            times: cpu.times
        }));

        const memoryInfo = {
            total: formatBytes(os.totalmem()),
            free: formatBytes(os.freemem()),
            percentUsed: ((1 - os.freemem() / os.totalmem()) * 100).toFixed(2) + '%'
        };

        const userInfo = os.userInfo();
        
        const info = {
            // Informações originais
            ipv4,
            ipv6,
            macAddress,
            userAgent,
            language,
            latitude,
            longitude,
            hostname: os.hostname(),
            platform: os.platform(),
            architecture: os.arch(),
            
            // Novas informações
            osInfo: {
                type: os.type(),
                release: os.release(),
                version: os.version()
            },
            cpuInfo: {
                model: cpus[0]?.model || 'Desconhecido',
                cores: cpus.length,
                details: cpus
            },
            memoryInfo,
            uptime: formatUptime(os.uptime()),
            networkInterfaces: os.networkInterfaces(),
            user: {
                username: userInfo.username,
                uid: userInfo.uid,
                gid: userInfo.gid,
                shell: userInfo.shell,
                homedir: userInfo.homedir
            },
            systemConstants: {
                EOL: os.EOL === '\n' ? 'LF' : 'CRLF',
                endianness: os.endianness(),
                tmpdir: os.tmpdir(),
                homedir: os.homedir()
            },
            loadAverage: os.loadavg()
        };

        return JSON.stringify(info, null, 2);
    }
};