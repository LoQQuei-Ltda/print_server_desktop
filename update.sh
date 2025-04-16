#!/bin/bash
echo "Verificando atualizações..."

run_command() {
  local command="$1"
  local error_message="$2"

  eval "$command" > /dev/null 2>&1
  
  if [ $? -ne 0 ]; then
    echo "$error_message"
    exit 1
  fi
}

UPDATE_DIR="/opt/print_server_desktop/updates"
EXECUTED_FILE="/opt/pprint_server_desktopent/executed_updates.txt"

cd /opt/print_server_desktop || exit 1

CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "Repositório não está na branch main. Está na branch $CURRENT_BRANCH. Mudando para a branch main..."
  run_command "git checkout main" "Erro ao mudar para a branch main."
fi

REMOTE_COMMIT_HASH=$(sudo git ls-remote origin HEAD | awk '{ print $1 }')

if [ -f /opt/print_server_desktop/version.json ]; then
  SAVED_COMMIT_HASH=$(jq -r '.commit_hash' /opt/print_server_desktop/version.json)
  
  if [ -z "$SAVED_COMMIT_HASH" ]; then
    echo "Erro: Hash do commit no version.json está vazio."
    exit 1
  fi
else
  echo "Erro: Arquivo de informações de instalação não encontrado!"
  exit 1
fi

if [ "$REMOTE_COMMIT_HASH" != "$SAVED_COMMIT_HASH" ]; then
  echo "Nova atualização encontrada. Iniciando atualização..."

  run_command "git reset --hard" "Erro ao descartar alterações locais."
  
  run_command "sudo git pull --no-verify origin main" "Erro ao atualizar repositório."

  NEW_COMMIT_HASH=$(git rev-parse HEAD)
  UPDATE_DATE=$(date +%Y-%m-%d)

  echo "Nova versão instalada: Commit $NEW_COMMIT_HASH, Data $UPDATE_DATE"

  echo "{
    \"commit_hash\": \"$NEW_COMMIT_HASH\",
    \"install_date\": \"$UPDATE_DATE\"
  }" > /opt/print_server_desktop/version.json

  if [ ! -f "$EXECUTED_FILE" ]; then
    touch "$EXECUTED_FILE"
  fi

  for i in $(seq -f "%02g" 1 99); do
    SCRIPT_FILE="$UPDATE_DIR/$i.sh"
    
    if [ -f "$SCRIPT_FILE" ]; then
      if ! grep -q "$i" "$EXECUTED_FILE"; then
        echo "Executando atualização $i..."
        
        run_command "sudo bash $SCRIPT_FILE" "Erro ao executar a atualização $i."
        echo "$i" | sudo tee -a "$EXECUTED_FILE" > /dev/null
        
        echo "Atualização $i executada com sucesso!"
      else
        echo "Atualização $i já foi executada. Pulando..."
      fi
    fi
  done

  run_command "sudo chmod +x db/migrate.sh" "Erro ao configurar permissões do script de migração."
  run_command "sudo ./db/migrate.sh" "Erro ao executar migrações."

  echo "Atualização concluída com sucesso!"
else
  echo "Nenhuma atualização disponível. O sistema já está atualizado."
fi
