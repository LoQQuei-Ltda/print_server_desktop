#!/bin/bash

set -e

if [ -f .env ]; then
  source .env
fi

# Variáveis de ambiente
MIGRATION_DIR="$BASE_DIR/db/sql"
LOG_FILE=/var/log/migrations.log
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres_print
DB_PASSWORD=root_print
DB_NAME=print_management

# Função para verificar a disponibilidade do banco de dados
check_db() {
    echo "Verificando a disponibilidade do banco de dados..."
    until PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" -c "SELECT 1" > /dev/null 2>&1; do
        echo "Banco de dados indisponível. Tentando novamente em 2 segundos..."
        sleep 2
    done
    echo "Banco de dados está disponível."
}

# Função para reverter uma migração
revert_migration() {
    local dir=$1
    local rollback_file="$MIGRATION_DIR/$dir/rollback.sql"
    local prefix="$dir"
    local rollback_path

    # Encontrar o arquivo de rollback
    rollback_path=$(ls $rollback_file 2>/dev/null || true)
    if [ -z "$rollback_path" ]; then
        echo "Arquivo de rollback não encontrado em $dir. Pulando..."
        return
    fi

    echo "Revertendo migração $rollback_path..."

    rollback_path_temp=$(mktemp)
    sed "s/\${DB_SCHEMA}/$DB_SCHEMA/g" "$rollback_path" > "$rollback_path_temp"

    # Executa o rollback dentro de uma transação
    PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USERNAME" -d "$DB_NAME" <<EOF
BEGIN;
\i $rollback_path_temp;
COMMIT;
EOF

    # Verifica se o rollback foi bem-sucedido
    if [ $? -eq 0 ]; then
        # Remove a migração do log
        sed -i "\|^$prefix$|d" "$LOG_FILE"
        echo "Migração $rollback_path revertida com sucesso."
    else
        echo "Falha ao reverter a migração $rollback_path. Abortando."
        exit 1
    fi

    rm "$rollback_path_temp"
}

# Função para solicitar confirmação do usuário
confirm_action() {
    while true; do
        read -p "Tem certeza que deseja reverter as migrações? (y/n): " yn
        case $yn in
            [Yy]* ) break;;
            [Nn]* ) echo "Rollback cancelado."; exit 0;;
            * ) echo "Por favor, responda com 'y' ou 'n'.";;
        esac
    done
}

# Função para verificar a senha do usuário
verify_password() {
    read -s -p "Digite a senha: " input_password
    echo
    if [[ "$input_password" != "$DB_PASSWORD" ]]; then
        echo "Senha incorreta. Abortando."
        exit 1
    fi
}

# Verifica se o log existe
if [ ! -f "$LOG_FILE" ]; then
    echo "Arquivo de log de migrações não encontrado. Nenhuma migração para reverter."
    exit 0
fi

# Solicita confirmação do usuário
echo "Iniciando o processo de rollback..."
confirm_action

# Solicita e verifica a senha do usuário
verify_password

# Executa a verificação do banco de dados
check_db

# Remove todos os BREAKPOINTs finais do log
echo "Removendo todos os BREAKPOINTs finais do log..."
while [ "$(tail -n 1 "$LOG_FILE" | tr -d '\r')" == "BREAKPOINT" ]; do
    sed -i '$ d' "$LOG_FILE"
    echo "Um BREAKPOINT final foi removido."
done
echo "Todos os BREAKPOINTs finais removidos do log."

# Exibe o log após remover os BREAKPOINTs finais
echo "Conteúdo do log após remoção dos BREAKPOINTs finais:"
cat "$LOG_FILE"

# Encontra a última ocorrência de BREAKPOINT no log atualizado
last_bp=$(grep -n "^BREAKPOINT$" "$LOG_FILE" | tail -1 | cut -d: -f1)
echo "Última posição de BREAKPOINT: $last_bp"

if [ -z "$last_bp" ]; then
    # Se não houver nenhum BREAKPOINT, reverter todas as migrações
    migrations_to_revert=$(cat "$LOG_FILE")
    echo "Revertendo todas as migrações: $migrations_to_revert"
else
    # Obtém as migrações após o último BREAKPOINT
    migrations_to_revert=$(tail -n +"$((last_bp + 1))" "$LOG_FILE")
    echo "Migrações a reverter após o último BREAKPOINT:"
    echo "$migrations_to_revert"
fi

# Remove qualquer 'BREAKPOINT' das migrações a serem revertidas
migrations_to_revert=$(echo "$migrations_to_revert" | grep -v "^BREAKPOINT$")
echo "Migrações após remoção de BREAKPOINT:"
echo "$migrations_to_revert"

# Verifica se há migrações para reverter
if [ -z "$migrations_to_revert" ]; then
    echo "Nenhuma migração para reverter."
    exit 0
fi

# Reverte as migrações em ordem reversa
# Converter as migrações para um array
readarray -t migrations_array <<< "$migrations_to_revert"

echo "Array de migrações a reverter (em ordem): ${migrations_array[@]}"

# Reverter em ordem inversa
for (( idx=${#migrations_array[@]}-1 ; idx>=0 ; idx-- )); do
    prefix="${migrations_array[idx]}"
    echo "Revertendo migração prefixo: $prefix"
    revert_migration "$prefix"
done

# Adiciona um novo BREAKPOINT após reverter as migrações
echo "BREAKPOINT" >> "$LOG_FILE"
echo "Todas as migrações revertidas com sucesso. Breakpoint registrado."
