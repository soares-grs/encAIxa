<div align="center">
  <img src="src/client/public/encaixa-logo.png" alt="Logo do encAIxa" width="150" />

# encAIxa

**Seu currículo, na vaga certa.**

Uma aplicação local que usa Codex ou Claude para analisar vagas, sugerir melhorias verdadeiras e gerar um currículo ATS personalizado em PDF.
</div>

## Para que serve?

Enviar o mesmo currículo para todas as vagas costuma esconder justamente as experiências mais relevantes. O encAIxa ajuda você a criar uma versão específica para cada candidatura sem inventar competências ou alterar seu perfil original.

Você informa seu histórico profissional e a descrição da vaga. Depois, o encAIxa:

- compara os requisitos da oportunidade com suas experiências;
- calcula uma estimativa de aderência baseada nas evidências encontradas;
- sugere melhorias no resumo, nas experiências e nas competências;
- identifica lacunas e permite complementá-las com fatos fornecidos por você;
- deixa você aceitar ou rejeitar cada sugestão;
- gera currículos ATS em português e, opcionalmente, inglês;
- mantém todas as candidaturas em um histórico local.

> [!IMPORTANT]
> O encAIxa não inventa experiências. Quando faltar informação, a lacuna permanece visível ou o sistema pede contexto real antes de redigir qualquer conteúdo.

## Instalação rápida

Você não precisa conhecer React, TypeScript ou qualquer outra tecnologia do projeto. Basta seguir as etapas abaixo.

### 1. Instale os programas necessários

- [Node.js](https://nodejs.org/) 22 ou mais recente;
- [Google Chrome](https://www.google.com/chrome/) ou Microsoft Edge;
- pelo menos um provedor de IA: Codex ou Claude Code.

Para instalar o Codex:

```bash
npm install -g @openai/codex
```

Para instalar o Claude Code:

```bash
npm install -g @anthropic-ai/claude-code
```

Você pode instalar somente um deles. O encAIxa permite escolher o provedor antes de cada análise.

### 2. Baixe o encAIxa

Se você já utiliza Git:

```bash
git clone https://github.com/soares-grs/encAIxa.git
cd encAIxa
```

Se não utiliza Git, abra a página do projeto no GitHub, clique em **Code → Download ZIP**, extraia o arquivo e abra um terminal dentro da pasta extraída.

### 3. Instale e inicie

```bash
npm install
npm start
```

Quando aparecer a mensagem abaixo, abra o endereço no navegador:

```text
encAIxa: http://127.0.0.1:3001
```

> [!TIP]
> No PowerShell, se o Windows bloquear `npm.ps1`, use `npm.cmd install` e `npm.cmd start`. Não é necessário alterar a política de segurança do computador.

## Primeiro uso

Na primeira abertura, o onboarding oferece duas opções:

1. **Preencher manualmente:** informe seus dados profissionais pelas etapas da interface.
2. **Importar currículo:** envie um arquivo PDF, DOCX, TXT, Markdown ou JSON de até 10 MB.

Arquivos JSON são importados diretamente. Os demais formatos usam o provedor de IA escolhido para organizar as informações. Tudo passa por uma tela de revisão antes de ser salvo.

### Conectando a IA

O encAIxa verifica automaticamente se Codex e Claude estão instalados e autenticados. Selecione um provedor e clique em **Conectar**. A autenticação acontece pelo CLI oficial instalado no seu computador.

Você também pode conferir manualmente a instalação:

```bash
codex --version
claude --version
```

Feche e abra novamente o terminal e o encAIxa caso tenha instalado um CLI enquanto a aplicação estava aberta.

## Criando uma candidatura

O fluxo principal possui cinco etapas:

```text
Perfil → Vaga → Análise → Revisão → Gerar
```

1. **Perfil:** revise seu histórico profissional reutilizável.
2. **Vaga:** informe empresa, cargo e descrição completa da oportunidade.
3. **Análise:** escolha Codex ou Claude e acompanhe as atividades em tempo real.
4. **Revisão:** aceite ou rejeite cada sugestão. Nas lacunas, use **Adicionar ao currículo** somente quando puder fornecer uma experiência real relacionada.
5. **Gerar:** selecione os idiomas, confira a prévia e baixe os PDFs.

Ao terminar, use **Analisar outra vaga** para começar uma nova candidatura com o mesmo perfil ou **Atualizar meu perfil** antes de continuar. A candidatura anterior permanece no histórico.

## Privacidade e armazenamento

O encAIxa é local, mas a análise por IA não é offline:

- a aplicação escuta apenas em `127.0.0.1` e rejeita origens externas;
- perfil, vagas, decisões e arquivos gerados ficam na pasta `storage/`;
- `storage/` é ignorada pelo Git e não deve ser publicada;
- perfil e vaga são enviados somente ao provedor escolhido quando você solicita uma operação com IA;
- Codex e Claude rodam em sessões temporárias, sem ferramentas de escrita no projeto;
- o perfil-base não é alterado pelas sugestões de uma candidatura.

Para fazer backup, copie a pasta `storage/`. Para recomeçar do zero, feche a aplicação e mova essa pasta para outro local; assim os dados continuam recuperáveis.

## Solução de problemas

### `npm` não pode ser executado no PowerShell

Use a variante `.cmd`:

```powershell
npm.cmd install
npm.cmd start
```

### Codex ou Claude aparece como não instalado

Execute `codex --version` ou `claude --version` em um terminal novo. Se o comando não funcionar, reinstale o respectivo CLI. No Windows, o encAIxa reconhece tanto instalações npm quanto o instalador nativo do Claude em `~/.local/bin/claude.exe`.

### O provedor está instalado, mas desconectado

Clique em **Conectar** dentro do encAIxa e conclua a autenticação. Se preferir fazer isso manualmente:

```bash
codex login
claude auth login
```

Depois, atualize a página da aplicação.

### O PDF não foi gerado

Confirme que Chrome ou Edge está instalado. Para utilizar outro executável compatível, defina `PUPPETEER_EXECUTABLE_PATH` com o caminho completo antes de iniciar o encAIxa.

Exemplo no PowerShell:

```powershell
$env:PUPPETEER_EXECUTABLE_PATH="C:\Program Files\Google\Chrome\Application\chrome.exe"
npm.cmd start
```

### A porta 3001 já está em uso

Feche outra instância do encAIxa ou o programa que está utilizando `127.0.0.1:3001` e execute `npm start` novamente.

### A análise parece demorada

O tempo depende do provedor e do tamanho do perfil e da vaga. A tela mostra eventos recebidos, tempo decorrido e o estado da conexão. Não recarregue a página enquanto a operação estiver ativa.

## Para quem quer desenvolver

### Stack

- React 19, TypeScript e Vite;
- Tailwind CSS e componentes baseados em shadcn/Radix UI;
- Express 5 e Zod;
- Puppeteer para geração dos PDFs;
- Vitest e Testing Library para testes;
- Codex CLI e Claude Code CLI como provedores locais.

### Comandos

| Comando                | O que faz                                                 |
| ---------------------- | --------------------------------------------------------- |
| `npm run dev`          | Inicia servidor e interface com recarregamento automático |
| `npm start`            | Gera o build e inicia a aplicação em `127.0.0.1:3001`     |
| `npm test`             | Executa todos os testes uma vez                           |
| `npm run build`        | Verifica TypeScript e gera o build de produção            |
| `npm run format`       | Formata o projeto com Prettier                            |
| `npm run format:check` | Confere a formatação sem alterar arquivos                 |

Durante o desenvolvimento, a interface fica em `http://127.0.0.1:5173` e encaminha as chamadas da API para a porta 3001.

### Estrutura do projeto

```text
examples/          perfil fictício de referência
schemas/           contratos JSON das respostas das IAs
src/client/        interface React e componentes
src/server/        API, provedores, persistência e geração de PDF
src/shared/        schemas Zod e tipos compartilhados
storage/           dados reais locais, ignorados pelo Git
```

Cada candidatura é salva em `storage/jobs/<vaga>/`. Os arquivos HTML e PDF ficam em `storage/output/<vaga>/`.

### Antes de enviar uma alteração

```bash
npm run format
npm test
npm run build
```

Contribuições devem preservar três princípios: não inventar informações profissionais, não alterar o perfil-base silenciosamente e não expor dados locais desnecessariamente.

## Licença

Distribuído sob a licença MIT.
