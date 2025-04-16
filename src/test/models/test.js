const Log = require('../../../helper/log');
const { Core } = require('../../../db/core');
const CONSTANTS = require('../../../helper/constants');

module.exports = {
    test: async () => {
        try {
            // Separar cada consulta em uma chamada individual
            const results = {};
            
            // Verificar versão
            const versionResult = await Core('SELECT version();', []);
            results.version = versionResult;
            
            // Verificar usuário atual
            const userResult = await Core('SELECT current_user;', []);
            results.currentUser = userResult;
            
            // Verificar banco de dados atual
            const dbResult = await Core('SELECT current_database();', []);
            results.currentDatabase = dbResult;
            
            // Listar bancos de dados
            const dbListResult = await Core('SELECT datname FROM pg_database WHERE datistemplate = false;', []);
            results.databases = dbListResult;
            
            // Listar esquemas
            const schemasResult = await Core('SELECT nspname FROM pg_catalog.pg_namespace;', []);
            results.schemas = schemasResult;
            
            // Listar tabelas
            const tablesResult = await Core(`
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_type = 'BASE TABLE';
            `, []);
            results.tables = tablesResult;
            
            // Verificar permissões
            const permissionsResult = await Core(`
                SELECT
                    table_name,
                    has_table_privilege(current_user, table_schema || '.' || table_name, 'SELECT') AS has_select,
                    has_table_privilege(current_user, table_schema || '.' || table_name, 'INSERT') AS has_insert,
                    has_table_privilege(current_user, table_schema || '.' || table_name, 'UPDATE') AS has_update,
                    has_table_privilege(current_user, table_schema || '.' || table_name, 'DELETE') AS has_delete
                FROM
                    information_schema.tables
                WHERE
                    table_schema = 'public'
                AND
                    table_type = 'BASE TABLE';
            `, []);
            results.permissions = permissionsResult;
            
            // Teste de criação de tabela (este é mais complexo, pode precisar ser ajustado)
            try {
                await Core('CREATE TEMPORARY TABLE test_create_permission (id int);', []);
                await Core('DROP TABLE test_create_permission;', []);
                results.createPermission = { message: 'Usuário tem permissão para criar tabelas temporárias' };
            } catch (err) {
                results.createPermission = { message: 'Usuário NÃO tem permissão para criar tabelas temporárias', error: err.message };
            }
            
            return results;
        } catch (error) {
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.MONITOR,
                operation: 'Database Test',
                errorMessage: error.message,
                errorStack: error.stack
            });
            
            return {
                message: "Ocorreu um erro ao testar a conexão com o banco de dados! Tente novamente mais tarde"
            }
        }
    }
};