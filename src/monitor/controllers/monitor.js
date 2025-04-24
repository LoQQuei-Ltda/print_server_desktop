const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const chokidar = require('chokidar');
const { PDFDocument } = require('pdf-lib');
const Log = require('../../../helper/log');
const FilesModel = require('../models/files');
const CONSTANTS = require('../../../helper/constants');
const { v7: uuid, validate: uuidValidate } = require('uuid');

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