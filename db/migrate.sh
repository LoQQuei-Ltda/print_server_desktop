#!/bin/bash

# Script de migração aprimorado com verificação explícita de colunas e melhor tratamento de erros

set -e

if [ -f .env ]; then
  source .env
fi

BASE_DIR=$(dirname "$0")

# Variáveis de ambiente
MIGRATION_DIR=$BASE_DIR/sql
LOG_FILE=/var/log/migrations.log
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres_print
DB_PASSWORD=root_print
DB_NAME=print_management
DB_SCHEMA=print_management

# Cria o arquivo de log se não existir
mkdir -p $(dirname "$LOG_FILE")
touch "$LOG_FILE"
echo "$(date) - Iniciando migrações" >> "$LOG_FILE"

# Função para log
log() {
  local message="$1"
  echo "$(date) - $message"
  echo "$(date) - $message" >> "$LOG_FILE"
}

# Função para verificar a disponibilidade do banco de dados
check_db() {
    log "Verificando a disponibilidade do banco de dados..."
    local retries=10
    local attempt=1
    
    while [ $attempt -le $retries ]; do
        if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; then
            log "Banco de dados está disponível."
            return 0
        else
            log "Tentativa $attempt/$retries: Banco de dados indisponível."
            attempt=$((attempt+1))
            sleep 3
        fi
    done
    
    log "ERRO: Banco de dados não disponível após $retries tentativas."
    return 1
}

# Verificar se o schema existe, se não criar
setup_schema() {
    log "Verificando schema $DB_SCHEMA..."
    
    # Verificar se o schema existe
    if ! PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -c "SELECT 1 FROM information_schema.schemata WHERE schema_name = '$DB_SCHEMA'" | grep -q 1; then
        log "Criando schema $DB_SCHEMA..."
        PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -c "CREATE SCHEMA $DB_SCHEMA;"
    fi
    
    # Garantir permissões no schema
    log "Concedendo permissões no schema..."
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -c "GRANT ALL ON SCHEMA $DB_SCHEMA TO $DB_USERNAME;"
}

# Verificar tabela logs e corrigir se necessário
check_logs_table() {
    log "Verificando estrutura da tabela logs..."
    
    # Verificar se a tabela logs existe
    if ! PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -c "SELECT 1 FROM information_schema.tables WHERE table_schema = '$DB_SCHEMA' AND table_name = 'logs'" | grep -q 1; then
        log "Tabela logs não existe, será criada na migração normal"
        return 0
    fi
    
    # Verificar especificamente a coluna beforeData/beforeData
    if ! PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -c "SELECT 1 FROM information_schema.columns WHERE table_schema = '$DB_SCHEMA' AND table_name = 'logs' AND lower(column_name) = 'beforeData'" | grep -q 1; then
        log "AVISO: Coluna beforeData/beforeData não existe na tabela logs!"
        log "Adicionando coluna beforeData à tabela logs..."
        
        # Verificar se alguma coluna começa com 'before'
        existing_column=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -t -c "SELECT column_name FROM information_schema.columns WHERE table_schema = '$DB_SCHEMA' AND table_name = 'logs' AND lower(column_name) LIKE 'before%'")
        
        if [ -n "$existing_column" ]; then
            log "Encontrada coluna similar: $existing_column - Tentando renomear para beforeData"
            PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -c "ALTER TABLE $DB_SCHEMA.logs RENAME COLUMN \"$existing_column\" TO \"beforeData\";"
        else
            # Adicionar a coluna
            PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -c "ALTER TABLE $DB_SCHEMA.logs ADD COLUMN IF NOT EXISTS \"beforeData\" jsonb DEFAULT NULL;"
        fi
    fi
    
    # Verificar especificamente a coluna afterData/afterData
    if ! PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -c "SELECT 1 FROM information_schema.columns WHERE table_schema = '$DB_SCHEMA' AND table_name = 'logs' AND lower(column_name) = 'afterData'" | grep -q 1; then
        log "AVISO: Coluna afterData/afterData não existe na tabela logs!"
        log "Adicionando coluna afterData à tabela logs..."
        
        # Verificar se alguma coluna começa com 'after'
        existing_column=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -t -c "SELECT column_name FROM information_schema.columns WHERE table_schema = '$DB_SCHEMA' AND table_name = 'logs' AND lower(column_name) LIKE 'after%'")
        
        if [ -n "$existing_column" ]; then
            log "Encontrada coluna similar: $existing_column - Tentando renomear para afterData"
            PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -c "ALTER TABLE $DB_SCHEMA.logs RENAME COLUMN \"$existing_column\" TO \"afterData\";"
        else
            # Adicionar a coluna
            PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -c "ALTER TABLE $DB_SCHEMA.logs ADD COLUMN IF NOT EXISTS \"afterData\" jsonb DEFAULT NULL;"
        fi
    fi
    
    log "Verificação da tabela logs concluída"
}

# Função para aplicar uma migração
apply_migration() {
    local dir=$1
    local migration_file="$MIGRATION_DIR/$dir/migration_*.sql"
    local prefix="$dir"
    local migration_path

    # Encontrar o arquivo de migração (assumindo apenas um arquivo de migração por diretório)
    migration_path=$(ls $migration_file 2>/dev/null || true)
    if [ -z "$migration_path" ]; then
        log "Arquivo de migração não encontrado em $dir. Pulando..."
        return
    fi

    log "Aplicando migração $migration_path..."

    migration_path_temp=$(mktemp)
    sed "s/\${DB_SCHEMA}/$DB_SCHEMA/g" "$migration_path" > "$migration_path_temp"

    # Executa a migração dentro de uma transação
    if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" <<EOF
BEGIN;
\i $migration_path_temp;
COMMIT;
EOF
    then
        log "Migração $migration_path aplicada com sucesso."
        echo "$prefix" >> "$LOG_FILE"
        return 0
    else
        log "ERRO: Falha ao aplicar a migração $migration_path."
        return 1
    fi

    rm "$migration_path_temp"
}

# Verificar tabelas após migração
verify_tables() {
    log "Verificando estrutura final das tabelas..."
    
    # Verificar tabelas existentes
    tables=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -t -c "SELECT tablename FROM pg_tables WHERE schemaname = '$DB_SCHEMA';")
    log "Tabelas encontradas: $tables"
    
    # Verificar estrutura da tabela logs com detalhes
    log "Estrutura detalhada da tabela logs:"
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -c "\d $DB_SCHEMA.logs"
    
    # Verificar colunas específicas na tabela logs
    log "Verificando colunas críticas na tabela logs..."
    for column in id createdAt logType beforeData afterData errorMessage errorStack; do
        lower_column=$(echo "$column" | tr '[:upper:]' '[:lower:]')
        
        if PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -t -c "SELECT 1 FROM information_schema.columns WHERE table_schema = '$DB_SCHEMA' AND table_name = 'logs' AND lower(column_name) = '$lower_column'" | grep -q 1; then
            actual_column=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -t -c "SELECT column_name FROM information_schema.columns WHERE table_schema = '$DB_SCHEMA' AND table_name = 'logs' AND lower(column_name) = '$lower_column'")
            log "  ✓ Coluna $column existe como '$actual_column'"
        else
            log "  ✗ ERRO! Coluna $column não encontrada!"
            return 1
        fi
    done
    
    log "Verificação final concluída com sucesso!"
    return 0
}

# INÍCIO DA EXECUÇÃO PRINCIPAL

# Executa a verificação do banco de dados
if ! check_db; then
    log "ERRO: Falha ao conectar ao banco de dados. Abortando migrações."
    exit 1
fi

# Configurar schema
setup_schema

# Verificar e corrigir a tabela logs se necessário
check_logs_table

log "Iniciando migrações a partir do diretório: $MIGRATION_DIR"

# Lista e ordena os diretórios de migração
for dir in $(ls -d $MIGRATION_DIR/*/ 2>/dev/null | sort); do
    # Extrai apenas o nome do diretório (ex: 01, 02)
    dir=$(basename "$dir")

    # Verifica se o prefixo já foi aplicado
    if grep -Fxq "$dir" "$LOG_FILE"; then
        log "Migração $dir já aplicada. Pulando..."
        continue
    fi

    # Aplica a migração
    if ! apply_migration "$dir"; then
        log "ERRO CRÍTICO: Falha ao aplicar migração $dir. Abortando."
        exit 1
    fi
done

# Verificar estrutura final das tabelas
if verify_tables; then
    # Verifica se a última linha é "BREAKPOINT" para evitar duplicatas
    last_line=$(tail -n 1 "$LOG_FILE" 2>/dev/null || echo "")
    if [ "$last_line" != "BREAKPOINT" ]; then
        echo "BREAKPOINT" >> "$LOG_FILE"
        log "Todas as migrações foram aplicadas com sucesso. Breakpoint registrado."
    else
        log "Breakpoint já existente no final do log. Não adicionando outro."
    fi
    
    log "Processo de migração concluído com sucesso!"
    exit 0
else
    log "AVISO: Verificação final encontrou problemas. As migrações foram aplicadas, mas a estrutura pode não estar completamente correta."
    exit 1
fi