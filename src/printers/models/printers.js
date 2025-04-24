const Log = require('../../../helper/log');
const { Core } = require('../../../db/core');
const CONSTANTS = require('../../../helper/constants');

module.exports = {
    getAll: async () => {
        try {
            const sql = `SELECT * FROM ${CONSTANTS.DB.DATABASE}.printers;`;

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
    getById: async (id) => {
        try {
            const sql = `SELECT * FROM ${CONSTANTS.DB.DATABASE}.printers WHERE id = $1;`;

            const printer = await Core(sql, [id]);

            return printer;
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.PRINTER,
                operation: 'Get By Id',
                errorMessage: error.message,
                errorStack: error.stack
            })

            return {
                message: "Ocorreu um erro ao obter as impressoras! Tente novamente mais tarde"
            };
        }
    },
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
                operation: 'New Printer',
                errorMessage: error.message,
                errorStack: error.stack
            })

            return {
                message: "Ocorreu um erro ao cadastrar o impressora! Tente novamente mais tarde"
            };
        }
    },
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
                message: "Ocorreu um erro ao alterar o impressora! Tente novamente mais tarde"
            };
        }
    }
}