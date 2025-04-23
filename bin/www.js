#!/usr/bin/env node

// Importações
var app = require('../app');
var http = require('http');

// Configurações de porta
var port = normalizePort('56258');
app.set('port', port);

// Criação do servidor
var server = http.createServer(app);

// Escuta o servidor
server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

// Normaliza a porta
function normalizePort(val) {
  var port = parseInt(val, 10);

  if (isNaN(port)) {
    return val;
  }

  if (port >= 0) {
    return port;
  }

  return false;
}

// Tratamento de erros
function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  var bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

    switch (error.code) {
      case 'EACCES':
        console.error(bind + ' requires elevated privileges');
        process.exit(1);
        break;
      case 'EADDRINUSE':
        console.error(bind + ' is already in use');
        process.exit(1);
        break;
      default:
        throw error;
    }
}

// Tratamento de conexão
function onListening() {
  var addr = server.address();
  var bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + addr.port;
  console.log('Listening on ' + bind);
}