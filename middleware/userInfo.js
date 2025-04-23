const Log = require('../helper/log');
const CONSTANTS = require('../helper/constants');
const { getUserInfo } = require("../helper/infoUser");

module.exports = {
    /**
     * Coleta informações do usuário e adiciona ao request
     * @param {*} request 
     * @param {*} response 
     * @param {*} next 
     */
    userInfo: async (request, response, next) => {
        try {
            if (!request.user) {
                request.user = {};
            }

            request.user.userInfo = await getUserInfo(request);
            next();
        } catch (error) {
            if (!request.user) {
                request.user = {};
            }
            
            request.user.userInfo = {};
            
            console.error(error);
            Log.error({
                entity: CONSTANTS.LOG.MODULE.MIDDLEWARE,
                operation: 'User Info',
                errorMessage: error.message,
                errorStack: error.stack
            });

            next();
        }
    }
}