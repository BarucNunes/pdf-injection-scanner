# PDF Injection Scanner

Site estático para inspecionar PDFs em busca de possíveis prompt injections e
outros sinais ocultos. A análise é feita no navegador: o arquivo escolhido não
é enviado a um backend ou serviço de armazenamento.

O `pdf.js` é carregado por CDN para executar a leitura do documento. Portanto,
o navegador precisa estar online na primeira carga da página, mas os bytes do
PDF permanecem locais.

## Rodar localmente

É necessário ter Node.js 20+ (para testes e geração dos fixtures). Não há
processo de build nem backend.

```powershell
npm install
npm test
npx serve .
```

Abra o endereço exibido pelo `serve`, normalmente `http://localhost:3000`.
Também é possível usar qualquer servidor de arquivos estáticos; por exemplo:

```powershell
python -m http.server 8080
```

Não abra o `index.html` diretamente pelo sistema de arquivos: navegadores podem
restringir o carregamento dos módulos e do arquivo de configuração nesse modo.

## PDFs para validação manual

O diretório [`test-fixtures/`](test-fixtures/) contém 10 documentos pequenos,
gerados para validar a interface e cada categoria de detector. Para recriá-los:

```powershell
npm run generate:fixtures
```

| Arquivo | Resultado esperado |
| --- | --- |
| `00-limpo.pdf` | Nenhum achado; risco baixo (score 0). |
| `01-frase-suspeita.pdf` | `frase-suspeita`. |
| `02-javascript-embutido.pdf` | `javascript-embutido`. |
| `03-campo-oculto-e-texto-alternativo.pdf` | `anotacao-ou-campo-oculto` e `texto-alternativo-de-imagem`. |
| `04-largura-zero-e-sequencia-invisivel.pdf` | `caractere-largura-zero` e `sequencia-invisivel-longa`. |
| `05-unicode-tags.pdf` | `unicode-tags` e `sequencia-invisivel-longa`. |
| `06-controle-bidirecional.pdf` | `controle-bidirecional`. |
| `07-texto-cor-do-fundo.pdf` | `cor-proxima-ao-fundo`. |
| `08-fonte-minuscula-e-fora-da-mediabox.pdf` | `fonte-menor-que-1pt` e `fora-da-mediabox`. |
| `09-texto-coberto.pdf` | `texto-coberto`. |

Os fixtures são deliberadamente mínimos. Use-os para conferir se cada cenário
é relatado e, principalmente, se `00-limpo.pdf` não gera falso positivo.

## Deploy no Vercel

1. Envie o repositório para GitHub, GitLab ou Bitbucket.
2. Importe-o no Vercel.
3. Em **Build and Output Settings**, escolha **Other**; não configure comando
   de build e use `.` como diretório de saída, se o painel solicitar.
4. Faça o deploy.

O arquivo [`vercel.json`](vercel.json) define o comportamento estático e
headers básicos de segurança. Cada push posterior na branch conectada gera um
novo deploy.

## Deploy no GitHub Pages

1. Envie o projeto para um repositório no GitHub e confirme que a branch de
   publicação se chama `main` (ou ajuste o gatilho no workflow).
2. Em **Settings → Pages**, selecione **GitHub Actions** como fonte.
3. Faça push para `main` ou execute manualmente o workflow **Deploy static site
   to GitHub Pages** na aba Actions.

O workflow em [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml)
publica diretamente o conteúdo da raiz. O arquivo [`.nojekyll`](.nojekyll)
garante que os arquivos estáticos não sejam processados pelo Jekyll.

## Detectores atuais

- Frases suspeitas configuráveis em `config/frases-suspeitas.json`.
- JavaScript embutido, campos/anotações ocultos e texto alternativo de imagem.
- Caracteres de largura zero, Unicode Tags, controles bidirecionais e sequências
  longas de invisíveis.
- Texto próximo à cor de fundo, fonte menor que 1 pt, fora da MediaBox e coberto
  por outro elemento.

O resultado é uma triagem heurística, não uma prova de conteúdo malicioso.
Todo achado deve ser revisado no contexto do documento.
