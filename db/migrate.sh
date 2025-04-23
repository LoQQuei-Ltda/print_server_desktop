#!/bin/bash

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

# Cria o arquivo de log se não existir
touch "$LOG_FILE"

# Função para verificar a disponibilidade do banco de dados
check_db() {
    echo "Verificando a disponibilidade do banco de dados..."
    until PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; do
        echo "Banco de dados indisponível. Tentando novamente em 2 segundos..."
        sleep 2
    done
    echo "Banco de dados está disponível."
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
        echo "Arquivo de migração não encontrado em $dir. Pulando..."
        return
    fi

    echo "Aplicando migração $migration_path..."

    migration_path_temp=$(mktemp)
    sed "s/\${DB_SCHEMA}/$DB_SCHEMA/g" "$migration_path" > "$migration_path_temp"

    # Executa a migração dentro de uma transação
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" <<EOF
BEGIN;
\i $migration_path_temp;
COMMIT;
EOF

    # Verifica se a migração foi bem-sucedida
    if [ $? -eq 0 ]; then
        echo "$prefix" >> "$LOG_FILE"
        echo "Migração $migration_path aplicada com sucesso."
    else
        echo "Falha ao aplicar a migração $migration_path. Abortando."
        exit 1
    fi

    rm "$migration_path_temp"
}

# Executa a verificação do banco de dados
check_db

echo $BASE_DIR
echo $MIGRATION_DIR

# Lista e ordena os diretórios de migração
for dir in $(ls -d $MIGRATION_DIR/*/ | sort); do
    # Extrai apenas o nome do diretório (ex: 01, 02)
    dir=$(basename "$dir")

    # Verifica se o prefixo já foi aplicado
    if grep -Fxq "$dir" "$LOG_FILE"; then
        echo "Migração $dir já aplicada. Pulando..."
        continue
    fi

    # Aplica a migração
    apply_migration "$dir"
done

# Verifica se a última linha é "BREAKPOINT" para evitar duplicatas
last_line=$(tail -n 1 "$LOG_FILE")
echo "Última linha do log: '$last_line'"
if [ "$last_line" != "BREAKPOINT" ]; then
    echo "BREAKPOINT" >> "$LOG_FILE"
    echo "Todas as migrações foram aplicadas com sucesso. Breakpoint registrado."
else
    echo "Breakpoint já existente no final do log. Não adicionando outro."
fi
