const Log = require('../../../helper/log');
const { Core } = require('../../../db/core');
const CONSTANTS = require('../../../helper/constants');

module.exports = {
    /**
     * Obtém todas as impressoras
     * @returns {Promise<Array>} Lista de impressoras
     */
    getAll: async () => {
        try {
            const sql = `SELECT * FROM ${CONSTANTS.DB.DATABASE}.printers WHERE deletedAt IS NULL;`;

            let printers = await Core(sql);

            if (!Array.isArray(printers)) {
                printers = [printers];
            }
            
            return printers;
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINTER,
                operation: 'Get All Printers',
                errorMessage: error.message,
                errorStack: error.stack
            })

            return {
                message: "Ocorreu um erro ao obter as impressoras! Tente novamente mais tarde"
            };
        }
    },
    
    /**
     * Obtém uma impressora pelo ID
     * @param {string} id ID da impressora
     * @returns {Promise<Object>} Dados da impressora
     */
    getById: async (id) => {
        try {
            const sql = `SELECT * FROM ${CONSTANTS.DB.DATABASE}.printers WHERE id = $1 AND deletedAt IS NULL;`;

            const printer = await Core(sql, [id]);

            return printer;
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINTER,
                operation: 'Get Printer By Id',
                errorMessage: error.message,
                errorStack: error.stack
            })

            return {
                message: "Ocorreu um erro ao obter a impressora! Tente novamente mais tarde"
            };
        }
    },
    
    /**
     * Obtém uma impressora pelo nome
     * @param {string} name Nome da impressora
     * @returns {Promise<Object>} Dados da impressora
     */
    getByName: async (name) => {
        try {
            const sql = `SELECT * FROM ${CONSTANTS.DB.DATABASE}.printers WHERE name = $1 AND deletedAt IS NULL;`;

            const printer = await Core(sql, [name]);

            return printer;
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINTER,
                operation: 'Get Printer By Name',
                errorMessage: error.message,
                errorStack: error.stack
            })

            return {
                message: "Ocorreu um erro ao obter a impressora pelo nome! Tente novamente mais tarde"
            };
        }
    },
    
    /**
     * Insere uma nova impressora
     * @param {Array} data Dados da impressora
     * @returns {Promise<Object>} Impressora inserida
     */
    insert: async (data) => {
        try {
            const sql = `INSERT INTO ${CONSTANTS.DB.DATABASE}.printers (
                id, name, status, createdAt, updatedAt,
                protocol, mac_address, driver, uri, description,
                location, ip_address, port
            ) VALUES (
                $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
            ) RETURNING *;`;

            const printer = await Core(sql, data);

            return printer;
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINTER,
                operation: 'Insert Printer',
                errorMessage: error.message,
                errorStack: error.stack
            })

            return {
                message: "Ocorreu um erro ao cadastrar a impressora! Tente novamente mais tarde"
            };
        }
    },
    
    /**
     * Atualiza uma impressora existente
     * @param {Array} data Dados da impressora
     * @returns {Promise<Object>} Impressora atualizada
     */
    update: async (data) => {
        try {
            const sql = `UPDATE ${CONSTANTS.DB.DATABASE}.printers SET 
                name = $1, 
                status = $2, 
                updatedAt = $3,
                protocol = $4,
                mac_address = $5,
                driver = $6,
                uri = $7,
                description = $8,
                location = $9,
                ip_address = $10,
                port = $11
            WHERE id = $12 RETURNING *;`;

            const printer = await Core(sql, data);

            return printer;
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINTER,
                operation: 'Update Printer',
                errorMessage: error.message,
                errorStack: error.stack
            })

            return {
                message: "Ocorreu um erro ao alterar a impressora! Tente novamente mais tarde"
            };
        }
    },
    
    /**
     * Marca uma impressora como excluída
     * @param {string} id ID da impressora
     * @returns {Promise<Object>} Resultado da operação
     */
    delete: async (id) => {
        try {
            const sql = `UPDATE ${CONSTANTS.DB.DATABASE}.printers SET 
                deletedAt = $1 
            WHERE id = $2 RETURNING *;`;

            const printer = await Core(sql, [new Date(), id]);

            return printer;
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINTER,
                operation: 'Delete Printer',
                errorMessage: error.message,
                errorStack: error.stack
            })

            return {
                message: "Ocorreu um erro ao excluir a impressora! Tente novamente mais tarde"
            };
        }
    },
    
    /**
     * Atualiza o status de uma impressora
     * @param {string} id ID da impressora
     * @param {string} status Novo status
     * @returns {Promise<Object>} Resultado da operação
     */
    updateStatus: async (id, status) => {
        try {
            const sql = `UPDATE ${CONSTANTS.DB.DATABASE}.printers SET 
                status = $1, 
                updatedAt = $2 
            WHERE id = $3 RETURNING *;`;

            const printer = await Core(sql, [status, new Date(), id]);

            return printer;
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINTER,
                operation: 'Update Printer Status',
                errorMessage: error.message,
                errorStack: error.stack
            })

            return {
                message: "Ocorreu um erro ao atualizar o status da impressora! Tente novamente mais tarde"
            };
        }
    }
}