const dotenv = require('dotenv')
const swaggerJSDoc = require('swagger-jsdoc');

dotenv.config();

const swaggerDefinition = {
    openapi: '3.0.0',
    info: {
        title: 'Documentação Gerenciador de Impressões LoQQuei',
        version: '1.0.0', 
        description: 'Documentação gerada automaticamente para o Gerenciador de Impressões LoQQuei.'
    },
    servers: [
        {
            url: process.env.BASE_HOST_API,
            description: 'Servidor Oficial'
        }
    ],
    components: {
        securitySchemes: {
            ApiKey: {
                type: 'apiKey',
                in: 'header',
                scheme: 'x-api-key'
            }
        }
    }
};

const options = {
  swaggerDefinition,
  apis: [
    './src/*.js', 
    './src/**/*.js', 
    './src/**/**/*.js', 
    './src/**/**/**/*.js', 
    './src/**/**/**/*.js', 
    './src/**/**/**/**/*.js'
  ]
};

const swaggerSpec = swaggerJSDoc(options);

module.exports = swaggerSpec;
