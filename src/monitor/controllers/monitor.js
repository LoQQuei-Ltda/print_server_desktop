const os = require('os');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const dotenv = require('dotenv');
const chokidar = require('chokidar');
const { exec } = require('child_process');
const { PDFDocument } = require('pdf-lib');
const Log = require('../../../helper/log');
const FilesModel = require('../models/files');
const CONSTANTS = require('../../../helper/constants');
const { v7: uuid, validate: uuidValidate } = require('uuid');

const activeApiIPs = {
    ips: [],
    lastUpdated: 0
};

async function getAllWindowsIPs() {
    try {
        const allIPs = new Set();
        
        // Método específico para WSL2 - host.docker.internal
        try {
            const dockerHostIP = await new Promise((resolve, reject) => {
                exec("ping -c 1 host.docker.internal | grep PING | awk -F'[\\(\\)]' '{print $2}'", (error, stdout) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    const ip = stdout.trim();
                    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
                        resolve(ip);
                    } else {
                        reject(new Error('IP inválido ou host.docker.internal não resolvido'));
                    }
                });
            });
            allIPs.add(dockerHostIP);
            console.log(`Método WSL2 (host.docker.internal): ${dockerHostIP}`);
        } catch (error) {
            console.log('Método host.docker.internal falhou:', error.message);
        }
        
        // Método WSL2 - resolv.conf (mais confiável e específico)
        try {
            const resolvConfContent = await fs.promises.readFile('/etc/resolv.conf', 'utf8');
            const nameserverMatch = resolvConfContent.match(/nameserver\s+(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
            if (nameserverMatch && nameserverMatch[1]) {
                allIPs.add(nameserverMatch[1]);
                console.log(`Método WSL2 (resolv.conf específico): ${nameserverMatch[1]}`);
            }
        } catch (error) {
            console.log('Método resolv.conf específico falhou:', error.message);
        }
        
        // Método específico do /run/wslu/runtime (presente em algumas distribuições WSL)
        try {
            if (fs.existsSync('/run/wslu/runtime')) {
                const wsluRuntime = await fs.promises.readFile('/run/wslu/runtime', 'utf8');
                const hostIpMatch = wsluRuntime.match(/WINDOWSIP=(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/);
                if (hostIpMatch && hostIpMatch[1]) {
                    allIPs.add(hostIpMatch[1]);
                    console.log(`Método WSL WSLU runtime: ${hostIpMatch[1]}`);
                }
            }
        } catch (error) {
            console.log('Método WSLU runtime falhou:', error.message);
        }
        
        // Método 1: Pelo gateway
        try {
            const gatewayIP = await new Promise((resolve, reject) => {
                exec("ip route | grep default | awk '{print $3}'", (error, stdout) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    const ip = stdout.trim();
                    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
                        resolve(ip);
                    } else {
                        reject(new Error('IP inválido'));
                    }
                });
            });
            allIPs.add(gatewayIP);
            console.log(`Método 1 (Gateway): ${gatewayIP}`);
        } catch (error) {
            console.log('Método 1 falhou:', error.message);
        }

        // Método 2: Pelo ifconfig (corrigido regex)
        try {
            const ipconfigOutput = await new Promise((resolve, reject) => {
                exec("ifconfig", (error, stdout) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve(stdout);
                });
            });
            
            // Regex melhorado para capturar corretamente os IPs do ifconfig
            const ipv4Regex = /inet (?:addr:)?(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/g;
            let match;
            while ((match = ipv4Regex.exec(ipconfigOutput)) !== null) {
                if (match[1] && match[1] !== '127.0.0.1') {
                    allIPs.add(match[1]);
                    console.log(`Método 2 (ifconfig): ${match[1]}`);
                }
            }
        } catch (error) {
            console.log('Método 2 falhou:', error.message);
        }

        // Método 3: Pelo Hostname
        try {
            const hostnameIPs = await new Promise((resolve, reject) => {
                exec("hostname -I", (error, stdout) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    resolve(stdout.trim().split(' '));
                });
            });
            
            for (const ip of hostnameIPs) {
                if (ip && ip !== '' && ip !== '127.0.0.1' && /^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
                    allIPs.add(ip);
                    console.log(`Método 3 (hostname -I): ${ip}`);
                }
            }
        } catch (error) {
            console.log('Método 3 falhou:', error.message);
        }

        // Método 4: Pelo os.networkInterfaces()
        try {
            const interfaces = os.networkInterfaces();
            for (const interfaceName in interfaces) {
                for (const iface of interfaces[interfaceName]) {
                    if (iface.family === 'IPv4' && !iface.internal) {
                        allIPs.add(iface.address);
                        console.log(`Método 4 (os.networkInterfaces): ${iface.address}`);
                    }
                }
            }
        } catch (error) {
            console.log('Método 4 falhou:', error.message);
        }

        // Método 5: Pelo resolv.conf (original, mantido por compatibilidade)
        try {
            const wslIP = await new Promise((resolve, reject) => {
                exec("cat /etc/resolv.conf | grep nameserver | awk '{print $2}'", (error, stdout) => {
                    if (error) {
                        reject(error);
                        return;
                    }
                    const ip = stdout.trim();
                    if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
                        resolve(ip);
                    } else {
                        reject(new Error('IP inválido'));
                    }
                });
            });
            allIPs.add(wslIP);
            console.log(`Método 5 (resolv.conf): ${wslIP}`);
        } catch (error) {
            console.log('Método 5 falhou:', error.message);
        }
        
        // Método adicional: IP hardcoded mais comuns do WSL2
        const commonWSLHostIPs = ['172.17.0.1', '172.18.0.1', '172.19.0.1', '172.20.0.1', '172.21.0.1', '172.22.0.1', '192.168.0.1'];
        for (const ip of commonWSLHostIPs) {
            allIPs.add(ip);
            console.log(`Método adicional (IP comum WSL): ${ip}`);
        }

        const result = Array.from(allIPs).filter(ip => {
            return !ip.startsWith('10.') && !ip.startsWith('127.') && 
                   !(ip.startsWith('192.168.') && ip.endsWith('.2')) && // WSL IP comum
                   !(ip.startsWith('172.') && parseInt(ip.split('.')[1]) >= 17 && 
                     parseInt(ip.split('.')[1]) <= 31 && ip.endsWith('.2')); // WSL IP range
        });
        
        if (result.length === 0) {
            return Array.from(allIPs);
        }
        
        return result;
    } catch (error) {
        console.error('Erro ao coletar IPs:', error);
        return ['127.0.0.1'];
    }
}

async function checkMultipleApiConnectivity(ips, timeout = 1000) {
    console.log(`Testando conectividade com ${ips.length} IPs simultaneamente`);
    
    // Função auxiliar para verificar um único IP
    const checkSingleIP = (ip) => {
        return axios.get(`http://${ip}:56257/api`, { timeout })
            .then(response => {
                if (response.status === 200) {
                    console.log(`✅ API em ${ip} está respondendo corretamente`);
                    return { ip, active: true };
                } else {
                    console.log(`❌ API em ${ip} respondeu com status ${response.status}`);
                    return { ip, active: false };
                }
            })
            .catch(error => {
                console.log(`❌ API em ${ip} não está acessível: ${error.message}`);
                return { ip, active: false };
            });
    };
    
    // Cria um array de promessas para verificar todos os IPs simultaneamente
    const connectivityPromises = ips.map(ip => {
        console.log(`Testando conexão com: http://${ip}:56257/api`);
        return checkSingleIP(ip);
    });
    
    // Executa todas as verificações em paralelo e aguarda os resultados
    const results = await Promise.all(connectivityPromises);
    
    // Filtra apenas os IPs ativos
    const activeIPs = results
        .filter(result => result.active)
        .map(result => result.ip);
    
    console.log(`IPs ativos encontrados (${activeIPs.length}): ${JSON.stringify(activeIPs)}`);
    
    // Atualiza o cache de IPs ativos
    activeApiIPs.ips = activeIPs;
    activeApiIPs.lastUpdated = Date.now();
    
    return activeIPs;
}

async function sendFileToApi(fileId) {
    try {
        let ipsToTry = [];
        const cacheValidityTime = 5 * 60 * 1000; // 5 minutos em milissegundos
        
        // Verifica se tem cache válido de IPs ativos
        if (activeApiIPs.ips.length > 0 && 
            (Date.now() - activeApiIPs.lastUpdated) < cacheValidityTime) {
            
            console.log(`Usando cache de IPs ativos (${activeApiIPs.ips.length}): ${JSON.stringify(activeApiIPs.ips)}`);
            ipsToTry = activeApiIPs.ips;
        } else {
            console.log("Cache de IPs expirado ou vazio, coletando novos IPs...");
            const allIPs = await getAllWindowsIPs();
            
            // Testa todos os IPs coletados em paralelo
            ipsToTry = await checkMultipleApiConnectivity(allIPs);
            
            // Se não encontra nenhum IP ativo, tenta todos os IPs
            if (ipsToTry.length === 0) {
                console.log("Nenhum IP ativo encontrado, tentando todos os IPs coletados.");
                ipsToTry = allIPs;
            }
        }
        
        // Tenta enviar o arquivo para os IPs
        let apiCallSucceeded = false;
        const apiErrors = [];
        
        for (const ip of ipsToTry) {
            const base_url = `http://${ip}:56257/api/new-file`;
            try {
                console.log(`Tentando enviar arquivo ${fileId} para API em ${base_url}`);
                const response = await axios.get(base_url, {
                    params: {
                        fileId: fileId
                    },
                    timeout: 1000
                });
                
                if (response.status === 200) {
                    console.log(`✅ Arquivo ${fileId} enviado com sucesso para API em ${base_url}`);
                    apiCallSucceeded = true;
                    
                    // Se este IP não estiver no cache, adiciona
                    if (!activeApiIPs.ips.includes(ip)) {
                        activeApiIPs.ips.push(ip);
                        activeApiIPs.lastUpdated = Date.now();
                        console.log(`Adicionado IP ${ip} ao cache de IPs ativos`);
                    }
                    
                    break;
                } else {
                    const errorMsg = `❌ API em ${base_url} respondeu com status ${response.status}`;
                    console.error(errorMsg);
                    apiErrors.push(errorMsg);
                    
                    // Remove este IP do cache se estava lá
                    activeApiIPs.ips = activeApiIPs.ips.filter(cachedIp => cachedIp !== ip);
                }
            } catch (error) {
                const errorMsg = `❌ Erro ao enviar arquivo ${fileId} para API em ${base_url}: ${error.message}`;
                console.error(errorMsg);
                apiErrors.push(errorMsg);
                
                // Remove este IP do cache se estava lá
                activeApiIPs.ips = activeApiIPs.ips.filter(cachedIp => cachedIp !== ip);
            }
        }

        if (!apiCallSucceeded) {
            console.error(`❌ Todas as tentativas de envio do arquivo ${fileId} para API falharam`);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.MONITOR,
                operation: 'Send File to API',
                errorMessage: `Todas as tentativas de envio do arquivo ${fileId} para API falharam`,
                errorStack: apiErrors.join('\n')
            });
            
            // Limpa o cache para forçar uma nova coleta na próxima tentativa
            activeApiIPs.ips = [];
            
            return false;
        }
        
        return true;
    } catch (error) {
        console.error(`Erro no envio do arquivo ${fileId} para API:`, error);
        Log.error({
            entity: CONSTANTS.LOG.MODULE.MONITOR,
            operation: 'Send File to API',
            errorMessage: error.message,
            errorStack: error.stack
        });
        return false;
    }
}

async function refreshActiveIPs() {
    try {
        console.log("Atualizando cache de IPs ativos...");
        const allIPs = await getAllWindowsIPs();
        await checkMultipleApiConnectivity(allIPs);
        console.log(`Cache de IPs atualizado. IPs ativos: ${JSON.stringify(activeApiIPs.ips)}`);
    } catch (error) {
        console.error("Erro ao atualizar cache de IPs:", error);
    }
}

const getPages = async (filePath) => {
    try {
        const data = await fs.promises.readFile(filePath);
        const pdf = await PDFDocument.load(data);
        return pdf.getPageCount();
    } catch (error) {
        console.error(error);
        Log.error({
            entity: CONSTANTS.LOG.MODULE.MONITOR,
            operation: 'Get Pages',
            errorMessage: error.message,
            errorStack: error.stack
        });
        return 'Error';
    }
}

const deleteFile = async (filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            await fs.promises.unlink(filePath);
        }
    } catch (error) {
        console.error(error);
        Log.error({
            entity: CONSTANTS.LOG.MODULE.MONITOR,
            operation: 'Delete File',
            errorMessage: error.message,
            errorStack: error.stack
        });
    }
}

const deleteOldFiles = async (dirPath) => {
    try {
        dotenv.config();
        const daysThreshold = parseInt(process.env.FILES_OLD_THRESHOLD_DAYS) || 1;
        const files = await fs.promises.readdir(dirPath);
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - daysThreshold);

        for (const file of files) {
            const fullPath = path.join(dirPath, file);
            const stats = await fs.promises.stat(fullPath);

            if (stats.isDirectory()) {
                await deleteOldFiles(fullPath);
                continue;
            }

            if (stats.isFile() && stats.mtime < cutoffDate) {
                const id = file.replace(path.extname(file), '');
                await FilesModel.delete(id);

                console.log(`Deletando arquivo ${fullPath} devido a data de criação ${stats.birthtime}`);
                await deleteFile(fullPath);
            }
        }
    } catch (error) {
        console.error(error);
        Log.error({
            entity: CONSTANTS.LOG.MODULE.MONITOR,
            operation: 'Delete Old Files',
            errorMessage: error.message,
            errorStack: error.stack
        });

        return;
    }
}

const cleanFileName = (fileName) => {
    try {
        let cleanName = fileName.replace(/-job_\d+\.pdf$/i, '.pdf');

        cleanName = cleanName.replace(/(?:[_\s]*[-–—][-–—]*[_\s]*|[_\s]+-)(?:Bloco de notas|Notepad|Microsoft Word|Word|Microsoft Excel|Excel|PowerPoint|LibreOffice|OpenOffice|Writer|Calc|Mozilla Firefox|Firefox|Google Chrome|Chrome|Adobe Reader|Acrobat Reader|PDF Reader|Paint|Photoshop|Illustrator|TextEdit|Sublime Text|VSCode|Visual Studio|Outlook|Thunderbird|Teams|Zoom|Skype)(?:\s*[-–—][_\s]*|[_\s]+)/i, '');

        cleanName = cleanName.replace(/(?:_-_|_-|\s-\s|\s-|-)(?:[A-Za-zÀ-ÖØ-öø-ÿ0-9\s]+)(?=-job_|\.|$)/i, '');

        const accentMap = {
            '303_263': 'ó',
            '303_243': 'ã',
            '303_247': 'ç',
            '303_265': 'á',
            '303_251': 'é',
            '303_245': 'õ',
            '303_252': 'ê',
            '303_255': 'í',
            '303_272': 'ú',
            '303_250': 'è',
            '303_241': 'á',
            '303_261': 'ñ',
            '303_266': 'æ',
            '303_244': 'ä',
            '303_274': 'ü'
        };

        Object.keys(accentMap).forEach(code => {
            const regex = new RegExp(`_${code}|_${code}_|${code}`, 'g');
            cleanName = cleanName.replace(regex, accentMap[code]);
        });

        cleanName = cleanName.replace(/_/g, ' ');

        cleanName = cleanName.replace(/\.(txt|doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp|html|htm)\.(pdf)$/i, '.$2');

        cleanName = cleanName.replace(/\s+/g, ' ').trim();

        cleanName = cleanName.replace(/\.pdf\.pdf$/i, '.pdf');

        return cleanName;
    } catch (error) {
        console.error("Erro ao limpar nome do arquivo:", error);
        return fileName;
    }
};

const copyFile = async (source, destination) => {
    try {
        const fileData = await fs.promises.readFile(source);

        await fs.promises.writeFile(destination, fileData);

        const sourceStats = await fs.promises.stat(source);
        const destStats = await fs.promises.stat(destination);

        if (destStats.size === sourceStats.size) {
            return true;
        } else {
            return false;
        }
    } catch (error) {
        console.error(`Erro ao copiar arquivo ${source} -> ${destination}:`, error);
        return false;
    }
};

const processNewFile = async (filePath) => {
    try {
        const ext = path.extname(filePath);
        const fileExtension = ext.toLowerCase();
        if (fileExtension !== '.pdf') {
            console.log(`Deletando arquivo ${filePath} devido a extensão ${fileExtension}`);
            await deleteFile(filePath);
            return;
        }

        let fileNameSave = path.basename(filePath);
        const fileName = fileNameSave.replace(ext, '');

        if (uuidValidate(fileName)) {
            const existingFile = await FilesModel.getById(fileName);
            if (existingFile && existingFile.id) {
                return;
            }
        }

        const id = uuid();

        const relativePath = path.relative(CONSTANTS.SAMBA.BASE_PATH_FILES, path.dirname(filePath));
        const parts = relativePath.split(path.sep);
        if (!parts || parts.length === 0) {
            Log.error({
                entity: CONSTANTS.LOG.MODULE.MONITOR,
                operation: 'Extract User',
                errorMessage: `Não foi possível extrair o usuário a partir do caminho: ${filePath}`,
                errorStack: ''
            });
            return;
        }

        const pages = await getPages(filePath);
        if (pages === 'Error') {
            console.log(`Erro ao ler páginas do PDF: ${filePath}`);
            return;
        }

        const newFilePath = path.join(path.dirname(filePath), id + ext);

        fileNameSave = await cleanFileName(fileNameSave);

        const data = [id, null, fileNameSave, pages, newFilePath, new Date()];
        await FilesModel.insert(data);

        const copied = await copyFile(filePath, newFilePath);

        if (copied) {
            try {
                await fs.promises.unlink(filePath);
            } catch (deleteError) {
                console.error(`Erro ao excluir arquivo original: ${filePath}`, deleteError);
            }
        } else {
            console.error(`Falha ao copiar arquivo. Removendo do banco: ${id}`);
            await FilesModel.delete(id);
        }

        const apiSuccess = await sendFileToApi(id);
        
        if (!apiSuccess) {
            console.log(`Arquivo ${id} inserido no banco mas não foi possível notificar a API. Será tentado novamente mais tarde.`);
        }
    } catch (error) {
        console.error(`Erro no processamento do arquivo ${filePath}:`, error);
        Log.error({
            entity: CONSTANTS.LOG.MODULE.MONITOR,
            operation: 'Process New File',
            errorMessage: error.message,
            errorStack: error.stack
        });
    }
};

const checkAllFiles = async (dirPath) => {
    try {
        // console.log(`Verificando todos os arquivos em: ${dirPath}`);
        const items = await fs.promises.readdir(dirPath);

        for (const item of items) {
            const fullPath = path.join(dirPath, item);
            const stats = await fs.promises.stat(fullPath);

            if (stats.isDirectory()) {
                await checkAllFiles(fullPath);
                continue;
            }

            if (stats.isFile()) {
                const ext = path.extname(fullPath).toLowerCase();
                if (ext !== '.pdf') {
                    continue;
                }

                const fileName = path.basename(fullPath);
                const fileNameWithoutExt = fileName.replace(ext, '');

                if (uuidValidate(fileNameWithoutExt)) {
                    const existingFile = await FilesModel.getById(fileNameWithoutExt);
                    if (!existingFile || !existingFile.id) {
                        console.log(`Arquivo com UUID ${fileNameWithoutExt} encontrado no disco mas não no banco. Verificando integridade...`);
                        await processNewFile(fullPath);
                    }
                    continue;
                }

                console.log(`Verificando arquivo não processado: ${fullPath}`);
                await processNewFile(fullPath);
            }
        }
        // console.log(`Verificação completa em: ${dirPath}`);
    } catch (error) {
        console.error(`Erro ao verificar todos os arquivos em ${dirPath}:`, error);
        Log.error({
            entity: CONSTANTS.LOG.MODULE.MONITOR,
            operation: 'Check All Files',
            errorMessage: error.message,
            errorStack: error.stack
        });
    }
};

const processedFiles = new Set();

module.exports = {
    monitorStart: async () => {

        if (!fs.existsSync(CONSTANTS.SAMBA.BASE_PATH_FILES)) {
            console.log(`Criando diretório base: ${CONSTANTS.SAMBA.BASE_PATH_FILES}`);
            await fs.mkdirSync(CONSTANTS.SAMBA.BASE_PATH_FILES, { recursive: true });
        }

        await refreshActiveIPs();

        await checkAllFiles(CONSTANTS.SAMBA.BASE_PATH_FILES);

        const watcher = chokidar.watch(CONSTANTS.SAMBA.BASE_PATH_FILES, {
            // eslint-disable-next-line no-useless-escape
            ignored: /(^|[\/\\])\../,
            persistent: true,
            ignoreInitial: false,
            depth: 99999,
            followSymlinks: false,
            awaitWriteFinish: {
                stabilityThreshold: 2000,
                pollInterval: 500
            }
        });

        watcher.on('add', async (filePath) => {
            if (processedFiles.has(filePath)) {
                return;
            }

            processedFiles.add(filePath);

            setTimeout(async () => {
                try {
                    if (fs.existsSync(filePath)) {
                        await processNewFile(filePath);
                    }
                } catch (error) {
                    console.error(`Erro ao processar arquivo ${filePath}:`, error);
                } finally {
                    setTimeout(() => {
                        processedFiles.delete(filePath);
                    }, 6000);
                }
            }, 3000);
        });

        watcher.on('change', async (filePath) => {
            const fileExtension = path.extname(filePath).toLowerCase();

            if (fileExtension !== '.pdf') {
                console.log(`Deletando arquivo ${filePath} devido a extensão ${fileExtension}`);
                await deleteFile(filePath);
            }
        });

        watcher.on('unlink', async (filePath) => {
            if (fs.existsSync(filePath)) {
                return;
            }

            const fileId = path.basename(filePath).replace(path.extname(filePath), '');

            if (!uuidValidate(fileId)) {
                return;
            }

            const result = await FilesModel.getById(fileId);

            if (result && result.printed) {
                return;
            }

            await FilesModel.delete(fileId);
        });

        watcher.on('error', async (error) => {
            console.error("Erro no monitor de arquivos:", error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.MONITOR,
                operation: 'Monitor',
                errorMessage: error.message,
                errorStack: error.stack
            });
        });

        setInterval(() => {
            checkAllFiles(CONSTANTS.SAMBA.BASE_PATH_FILES);
        }, 1000 * 5); // 5 segundos

        setInterval(() => {
            console.log("Executando limpeza de arquivos antigos");
            deleteOldFiles(CONSTANTS.SAMBA.BASE_PATH_FILES);
        }, 1000 * 60 * 60); // 1 hora

        console.log("Monitor iniciado com sucesso");
    }
};