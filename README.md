# encAIxa

O **encAIxa** é uma aplicação web local para manter um perfil profissional, analisar vagas com o Codex CLI, revisar cada sugestão e gerar currículos ATS em PDF.

## Como funciona

O assistente conduz o fluxo **Perfil → Vaga → Análise → Revisão → Gerar**. A IA nunca altera o perfil-base durante uma candidatura: cada sugestão precisa ser aceita ou rejeitada e vale somente para aquela vaga.

## Requisitos

- Node.js 22 ou superior
- Codex CLI instalado
- Microsoft Edge ou Google Chrome

## Instalação e uso

```powershell
npm.cmd install
npm.cmd start
```

Abra `http://127.0.0.1:3001`. Na primeira análise, conecte o Codex seguindo o código de autenticação mostrado na interface.

Durante o desenvolvimento:

```powershell
npm.cmd run dev
npm.cmd test
npm.cmd run build
```

## Estrutura

```text
examples/       perfil fictício usado no primeiro uso
schemas/        contratos JSON das respostas estruturadas
src/client/     interface React
src/server/     API local, Codex, persistência e PDF
src/shared/     schemas e tipos compartilhados
storage/        perfil, vagas e PDFs reais (ignorado pelo Git)
```

Quando `storage/profile.json` não existe, a aplicação cria uma cópia local de `examples/profile.example.json`.

## Privacidade e segurança

- O servidor escuta somente em `127.0.0.1` e rejeita origens externas.
- `storage/` não entra no Git.
- O Codex é executado em sessão efêmera, sandbox somente leitura e diretório temporário.
- Perfil e vaga são enviados ao serviço usado pelo Codex apenas quando o usuário inicia a análise.
- Arquivos importados são limitados a DOCX, PDF, TXT e Markdown de até 10 MB.

## Dados gerados

Cada candidatura é armazenada localmente em `storage/jobs/<vaga>/`. Currículos HTML e PDF ficam em `storage/output/<vaga>/`. Para fazer backup dos seus dados sem publicá-los, copie a pasta `storage/` separadamente.
