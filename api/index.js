// Importações básicas
const express = require('express');

// Resposta
const responseHandler = require('../helper/responseHandler');

// Printers
const { 
    createPrinter, 
    updatePrinter, 
    getPrinters,
    discoverPrinters,
    getAvailableDrivers
} = require('../src/printers/controllers/printers');

// Files
const { getFiles, updateSynced, deleteFile } = require('../src/files/controllers/files');

// Print File
const { printFile } = require('../src/files/controllers/print');

// Sync
const { getSyncInfo } = require('../src/sync/controllers/getInfo');
const { syncPrinters } = require('../src/sync/controllers/printers');

const router = express.Router();


// Printers
router.get('/printers', getPrinters);
router.post('/printers', createPrinter);
router.put('/printers', updatePrinter);
router.get('/printers/discover', discoverPrinters);
router.get('/printers/drivers', getAvailableDrivers);

// Files
router.get('/files', getFiles);
router.delete('/files/:id', deleteFile);

// Get Sync Info
router.get('/sync', getSyncInfo);

// Sync Files
router.post('/sync', updateSynced);

// Sync Printers
router.post('/sync/printers', syncPrinters);

// Print File
router.post('/print', printFile);

// Teste
router.get('/', async (request, response) => {
    return responseHandler.success(response, 'API Ok');
});

module.exports = router;