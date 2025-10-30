# Email Trigger Integração

Sistema de monitoramento de emails e integração com APIs externas.

## Descrição

Este projeto monitora contas de email específicas, processa os emails recebidos e envia os dados extraídos para uma API externa. O sistema utiliza o cPanel para criar e gerenciar contas de email automaticamente.

## Funcionalidades

- Criação automática de contas de email via cPanel
- Monitoramento de emails em intervalos configuráveis
- Processamento de emails e extração de dados
- Integração com API externa para envio de leads
- Sistema de logs estruturados
- Validação de dados com Zod
- Tratamento de erros robusto

## Melhorias Recentes

### Sistema de Validação

Implementamos um sistema de validação baseado em Zod para garantir que os dados recebidos pelas APIs estejam corretos antes do processamento.

- Validação de parâmetros de URL
- Validação de corpo das requisições
- Mensagens de erro personalizadas

### Sistema de Logs

Adicionamos um sistema de logs estruturado usando Winston para melhorar o monitoramento e a depuração:

- Logs em formato JSON para fácil processamento
- Diferentes níveis de log (info, warn, error, debug)
- Logs específicos por serviço
- Rotação de arquivos de log
- Logs de requisições HTTP

### Tratamento de Erros

Melhoramos o sistema de tratamento de erros para torná-lo mais robusto e informativo:

- Classes de erro personalizadas para diferentes tipos de falhas
- Middleware para captura de erros assíncronos
- Respostas de erro padronizadas
- Logs detalhados de erros com contexto

## Estrutura do Projeto

```
src/
  ├── config.ts                # Configurações do sistema
  ├── index.ts                 # Ponto de entrada alternativo
  ├── server.ts                # Servidor Express principal
  ├── middlewares/             # Middlewares da aplicação
  │   ├── error-handler.ts     # Tratamento de erros
  │   ├── logger.ts            # Sistema de logs
  │   └── validation.ts        # Validação de dados
  ├── services/                # Serviços da aplicação
  │   ├── cpanel-service.ts    # Integração com cPanel
  │   ├── email-monitor.ts     # Monitoramento de emails
  │   └── email-service.ts     # Serviço principal de emails
  ├── portal/                  # Processamento específico por portal
  └── test-*.ts                # Scripts de teste
prisma/                        # Configuração do Prisma ORM
  ├── schema.prisma            # Modelo de dados
  └── migrations/              # Migrações do banco de dados
```

## Variáveis de Ambiente

O projeto utiliza as seguintes variáveis de ambiente:

```
HEADER_TOKEN=seu_token_de_autenticacao
DATABASE_URL=sua_url_de_conexao_com_banco
```

## Como Executar

1. Instale as dependências:
   ```
   npm install
   ```

2. Configure as variáveis de ambiente em um arquivo `.env`

3. Execute as migrações do banco de dados:
   ```
   npm run db:migrate
   ```

4. Inicie o servidor:
   ```
   npm run dev    # Para desenvolvimento
   npm run build  # Para compilar
   npm start      # Para produção
   ```

## Scripts de Teste

Para testar as novas funcionalidades:

- Teste de validação: `npx ts-node src/test-validation.ts`
- Teste de logs: `npx ts-node src/test-logger.ts`

## Endpoints da API

- `POST /api/create-email/{companyId}` - Cria uma nova conta de email
- `GET /api/monitored-emails` - Lista emails monitorados
- `POST /api/stop-monitoring/{companyId}` - Para o monitoramento de um email
- `GET /api/monitoring-stats` - Estatísticas de monitoramento
- `POST /api/trigger-monitoring` - Dispara um ciclo de monitoramento
- `GET /api/health` - Verifica o status do servidor