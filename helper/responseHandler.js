const responseHandler = {
    /**
     * Resposta de sucesso com código 200
     * @param {*} response 
     * @param {string} message 
     * @param {*} data 
     * @returns 
     */
    success: async (response, message, data) => {
        if (data && data != {}) {
            return response.status(200).json({
                message: message,
                data: data
            });
        }
        
        return response.status(200).json({
            message: message
        });
    },
    /**
     * Resposta de sucesso criada, com código 201
     * @param {*} response 
     * @param {string} message 
     * @returns 
     */
    created: async (response, message) => {
        return response.status(201).json({
            message: message
        });
    },
    /**
     * Resposta de redirecionamento, com código 303
     * @param {*} response 
     * @param {string} message 
     * @param {string} redirect 
     * @param {*} data 
     * @returns 
     */
    seeOther: async (response, message, redirect = '', data) => {
        if (data && data != {}) {
            return response.status(303).json({
                message: message,
                redirect: redirect,
                data: data
            });
        }
        
        return response.status(303).json({
            message: message,
            redirect: redirect
        });
    },
    /**
     * Resposta de erros, com código 400
     * @param {*} response 
     * @param {string} message 
     * @param {Array} errors 
     * @returns 
     */
    badRequest: async (response, message, errors = []) => {
        const responseBody = { message: message };

        if (errors && errors.length > 0) {
            responseBody.errors = errors;
        }

        return response.status(400).json(responseBody);
    },
    /**
     * Resposta de não encontrado, com código 404
     * @param {*} response 
     * @param {string} message 
     * @returns 
     */
    notFound: async (response, message) => {
        return response.status(404).json({
            message: message
        });
    },
    /**
     * Resposta de erro interno do servidor, com código 500
     * @param {*} response 
     * @param {string} message 
     * @returns 
     */
    internalServerError: async (response, message) => {
        return response.status(500).json({
            message: message
        });
    }
}

module.exports = responseHandler;